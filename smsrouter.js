const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const bodyParser = require('body-parser');
const https = require('https');

/**
 * SMS Router - One Way SMS API integration.
 * Reuses the same verification token generation/verification logic as gkash OTP
 * (HMAC-SHA256 of phone number with shared secret).
 */
class SmsRouter {

  constructor() {
    this.router = express.Router();
    this.router.use(bodyParser.urlencoded({ extended: true }));
    this.router.use(bodyParser.json());

    // One Way SMS credentials (replace with env or your dashboard values)
    this._username = process.env.ONE_WAY_SMS_USERNAME || 'Sunny2026';
    this._password = process.env.ONE_WAY_SMS_PASSWORD || '105324';
    // One Way SMS URLs (port 443)
    this._mtUrl = process.env.ONE_WAY_SMS_MT_URL || 'https://gateway.onewaysms.com.my/api.aspx';
    this._checkCreditUrl = process.env.ONE_WAY_SMS_CHECK_CREDIT_URL || 'https://gateway.onewaysms.com.my/bulkcredit.aspx';
    this._checkTrxUrl = process.env.ONE_WAY_SMS_CHECK_TRX_URL || 'https://gateway.onewaysms.com.my/bulktrx.aspx';

    // Same secret as gkash OTP - for verification token
    this.OTP_VERIFICATION_SECRET_KEY = '6LdjBzcsAAAAAEMQwYSw6sd2ThtZG5EQxtD9OSHa';

    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.get('/about', (req, res) => {
      res.json({ message: 'SMS router - One Way SMS API integration v1.0' });
    });

    this.router.post('/send-sms', this.handleSendSms.bind(this));
    this.router.get('/check-balance', this.handleCheckBalance.bind(this));
    this.router.post('/check-balance', this.handleCheckBalance.bind(this));
    this.router.post('/check-transaction', this.handleCheckTransaction.bind(this));

    // Optional: endpoint to generate verification token (same logic as frontend)
    this.router.post('/generate-verification-token', this.handleGenerateVerificationToken.bind(this));
  }

  /**
   * Generates the verification token for a phone number (same as Flutter/gkash frontend).
   * HMAC-SHA256(phoneNumber, secret) -> base64.
   * @param {string} phoneNumber
   * @returns {string} base64 token
   */
  generateVerificationToken(phoneNumber) {
    const key = Buffer.from(this.OTP_VERIFICATION_SECRET_KEY, 'utf8');
    const message = Buffer.from(phoneNumber, 'utf8');
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(message);
    return hmac.digest().toString('base64');
  }

  /**
   * Verifies the OTP/SMS verification token (same logic as gkash router).
   * @param {string} phoneNumber
   * @param {string} verificationToken - base64 token from client
   * @returns {boolean}
   */
  verifyOtpToken(phoneNumber, verificationToken) {
    try {
      const key = Buffer.from(this.OTP_VERIFICATION_SECRET_KEY, 'utf8');
      const message = Buffer.from(phoneNumber, 'utf8');
      const hmac = crypto.createHmac('sha256', key);
      hmac.update(message);
      const expectedToken = hmac.digest().toString('base64');

      return crypto.timingSafeEqual(
        Buffer.from(verificationToken, 'base64'),
        Buffer.from(expectedToken, 'base64')
      );
    } catch (error) {
      console.error('❌ [SMS TOKEN] Error verifying verification token:', error);
      return false;
    }
  }

  /**
   * Maps One Way SMS API error codes to readable messages.
   */
  getErrorMessage(code) {
    switch (code) {
      case -100: return 'Invalid username or password';
      case -200: return 'Sender ID is invalid';
      case -300: return 'Mobile number is invalid';
      case -400: return 'Language type is invalid';
      case -500: return 'Invalid characters in message';
      case -600: return 'Insufficient credit balance';
      default: return `Unknown Error: ${code}`;
    }
  }

  /**
   * Maps One Way SMS transaction status (bulktrx) raw code to message.
   * 0 = Success receive on mobile handset, 100 = Delivered to Telco, -100 = mtid invalid, -200 = Sending fail.
   */
  getTransactionStatusMessage(code) {
    const statusMap = {
      0: 'Success receive on mobile handset',
      100: 'Message delivered to Telco',
      [-100]: 'mtid invalid / not found',
      [-200]: 'Message sending fail',
    };
    return statusMap[code] ?? null;
  }

  /**
   * POST /generate-verification-token
   * Body: { phonenumber: string }
   * Returns the token so clients can use it for send-sms (or for testing).
   */
  handleGenerateVerificationToken(req, res) {
    const phoneNumber = req.body.phonenumber || req.body.phoneNumber;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'phonenumber is required' });
    }
    const token = this.generateVerificationToken(phoneNumber);
    res.status(200).json({ success: true, verification_token: token });
  }

  /**
   * POST /send-sms
   * Body: { mobileno, message, senderid?, verification_token } — verification_token is required.
   */
  async handleSendSms(req, res) {
    const mobileno = req.body.mobileno || req.body.mobileNo || req.body.phonenumber;
    const message = req.body.message;
    const senderId = (req.body.senderid || req.body.senderId || 'INFO').toString().slice(0, 11);
    const verificationToken = req.body.verification_token;

    if (!mobileno || !message) {
      return res.status(400).json({
        success: false,
        message: 'mobileno and message are required',
      });
    }

    if (!verificationToken) {
      return res.status(400).json({
        success: false,
        message: 'verification_token is required',
      });
    }

    const isValid = this.verifyOtpToken(mobileno, verificationToken);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid verification token.',
      });
    }

    if (this._mtUrl === 'YOUR_MT_URL_HERE') {
      return res.status(503).json({
        success: false,
        message: 'SMS MT URL not configured. Set ONE_WAY_SMS_MT_URL or configure _mtUrl in smsrouter.js.',
      });
    }

    try {
      const result = await this.sendSms(mobileno, message, senderId);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Send SMS error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to send SMS.',
      });
    }
  }

  /**
   * Sends a standard text message via One Way SMS (Language Type 1).
   * @param {string} mobileNo - Phone with country code (e.g. 60121234567)
   * @param {string} message - SMS content
   * @param {string} senderId - Max 11 alphanumeric, default INFO
   * @returns {Promise<{success: boolean, message?: string, mt_id?: string}>}
   */
  async sendSms(mobileNo, message, senderId = 'INFO') {
    const cleanMobile = mobileNo.replace(/[\+\-\s]/g, '');
    const queryParams = {
      apiusername: this._username,
      apipassword: this._password,
      mobileno: cleanMobile,
      senderid: senderId.slice(0, 11),
      languagetype: '1',
      message: message,
    };

    const url = new URL(this._mtUrl);
    Object.keys(queryParams).forEach(k => url.searchParams.set(k, queryParams[k]));

    const response = await axios.get(url.toString(), {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 15000,
    });

    const result = (response.data != null && typeof response.data === 'string')
      ? response.data.trim()
      : String(response.data).trim();
    const code = parseInt(result, 10);

    if (!Number.isNaN(code) && code > 0) {
      return { success: true, message: 'SMS Sent Successfully', mt_id: result };
    }
    const errorCode = Number.isNaN(code) ? 0 : code;
    return {
      success: false,
      message: this.getErrorMessage(errorCode),
      error_code: errorCode,
    };
  }

  /**
   * GET or POST /check-balance
   * Optional body: { verification_token, phonenumber } for token check.
   */
  async handleCheckBalance(req, res) {
    const verificationToken = req.body?.verification_token || req.query?.verification_token;
    const phonenumber = req.body?.phonenumber || req.body?.mobileNo || req.query?.phonenumber;

    if (verificationToken && phonenumber) {
      const isValid = this.verifyOtpToken(phonenumber, verificationToken);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid verification token.',
        });
      }
    }

    if (this._checkCreditUrl === 'YOUR_CHECK_CREDIT_URL_HERE') {
      return res.status(503).json({
        success: false,
        message: 'Check Credit URL not configured. Set ONE_WAY_SMS_CHECK_CREDIT_URL or configure _checkCreditUrl in smsrouter.js.',
      });
    }

    try {
      const result = await this.checkBalance();
      return res.status(200).json(result);
    } catch (error) {
      console.error('Check balance error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to check balance.',
      });
    }
  }

  /**
   * Checks One Way SMS account credit balance.
   * @returns {Promise<{success: boolean, balance?: string, message?: string}>}
   */
  async checkBalance() {
    const queryParams = {
      apiusername: this._username,
      apipassword: this._password,
    };

    const url = new URL(this._checkCreditUrl);
    Object.keys(queryParams).forEach(k => url.searchParams.set(k, queryParams[k]));

    const response = await axios.get(url.toString(), {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 10000,
    });

    const result = (response.data != null && typeof response.data === 'string')
      ? response.data.trim()
      : String(response.data).trim();
    const balance = parseFloat(result);

    if (typeof balance === 'number' && !Number.isNaN(balance) && balance >= 0) {
      return { success: true, balance: result };
    }
    return {
      success: false,
      message: result === '-100' ? 'Invalid username or password' : `Error retrieving balance. Code: ${result}`,
    };
  }

  /**
   * GET or POST /check-transaction
   * Query/body: mt_id (required) - the message/MT ID returned from send-sms.
   * Optional: verification_token, phonenumber for token verification.
   */
  async handleCheckTransaction(req, res) {
    const verificationToken = req.body?.verification_token || req.query?.verification_token;
    const phonenumber = req.body?.phonenumber || req.body?.mobileNo || req.query?.phonenumber;
    const mtId = req.body?.mt_id || req.body?.mtid || req.query?.mt_id || req.query?.mtid;

    if (verificationToken && phonenumber) {
      const isValid = this.verifyOtpToken(phonenumber, verificationToken);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid verification token.',
        });
      }
    }

    if (!mtId) {
      return res.status(400).json({
        success: false,
        message: 'mt_id is required (the message ID returned from send-sms).',
      });
    }

    try {
      const result = await this.checkTransaction(mtId);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Check transaction error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to check transaction.',
      });
    }
  }

  /**
   * Checks One Way SMS transaction/delivery status by MT ID.
   * Uses bulktrx.aspx; parameter name may be mtid or mt_id depending on gateway docs.
   * @param {string} mtId - Message/MT ID from send-sms response
   * @returns {Promise<{success: boolean, status?: string, raw?: string, message?: string}>}
   */
  async checkTransaction(mtId) {
    const url = new URL(this._checkTrxUrl);
    url.searchParams.set('apiusername', this._username);
    url.searchParams.set('apipassword', this._password);
    url.searchParams.set('mtid', mtId);

    const response = await axios.get(url.toString(), {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 10000,
    });

    const raw = (response.data != null && typeof response.data === 'string')
      ? response.data.trim()
      : String(response.data).trim();

    const code = parseInt(raw, 10);
    const message = this.getTransactionStatusMessage(Number.isNaN(code) ? raw : code);

    if (message !== null) {
      return {
        success: code >= 0,
        mt_id: mtId,
        raw: raw,
        message,
      };
    }

    return {
      success: false,
      mt_id: mtId,
      raw: raw,
      message: `Status code "${raw}" not in known list. Please refer to One Way SMS API documentation for meaning.`,
    };
  }

  getRouter() {
    return this.router;
  }
}

module.exports = SmsRouter;
