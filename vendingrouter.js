const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const UtilFeie = require("./feie/util_feie");
const querystring = require('querystring');
const bodyParser = require('body-parser');
const url = require('url');
const UtilDateTime = require("./util/util_datetime");
const firebase = require("./db");
const CryptoJS = require('crypto-js');
const kSecurePhase = "foodio_foodio";
const fireStore = firebase.firestore();
const kBaseUrl = "http://43.128.71.13:8001/api";

const VOUCHER_ID_PREFIX_RE = /^(EV_|VC_)/;

/** Alternate user doc ids (with/without leading +) when primary lookup misses. */
function alternateUserIds(userId) {
  if (!userId || !userId.startsWith('FU_')) return [];
  const phone = userId.slice(3);
  if (phone.startsWith('+')) return [`FU_${phone.slice(1)}`];
  return [`FU_+${phone}`];
}

/**
 * Parse voucher QR: {qrCodePrefix}_{FU_phone}_{voucherId}
 * e.g. FAD10_FU_+60124508261_VC_e3bf1f94-afdf-4b41-8fe9-27be707cd8d3
 * @param {string} qrString
 * @returns {{ userId: string, voucherId: string }}
 */
function decodeQrIgnorePrefix(qrString) {
  const s = String(qrString || '').trim().replace(/\.+$/g, '');
  if (!s) {
    const e = new Error('EMPTY_QR');
    e.code = 'EMPTY_QR';
    throw e;
  }

  const match = s.match(/^(.*)_(FU_\+?\d{8,15})_(.+)$/);
  if (!match) {
    const e = new Error('INVALID_QR_FORMAT');
    e.code = 'INVALID_QR_FORMAT';
    throw e;
  }

  const userId = match[2];
  const voucherId = match[3].trim();
  if (!voucherId) {
    const e = new Error('MISSING_VOUCHER_TAIL');
    e.code = 'MISSING_VOUCHER_TAIL';
    throw e;
  }
  if (!VOUCHER_ID_PREFIX_RE.test(voucherId)) {
    const e = new Error('INVALID_VOUCHER_ID');
    e.code = 'INVALID_VOUCHER_ID';
    throw e;
  }
  return { userId, voucherId };
}

/** Format redeemedAt for API response: "May 16, 2026 at 8:54:44 AM UTC+8" */
function formatRedeemedAt(date) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const offsetMs = 8 * 60 * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  const month = months[local.getUTCMonth()];
  const day = local.getUTCDate();
  const year = local.getUTCFullYear();
  let hours = local.getUTCHours();
  const minutes = String(local.getUTCMinutes()).padStart(2, '0');
  const seconds = String(local.getUTCSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${month} ${day}, ${year} at ${hours}:${minutes}:${seconds} ${ampm} UTC+8`;
}

function toFirestoreDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const VOUCHER_QR_CLIENT_ERROR_CODES = new Set([
  'EMPTY_QR',
  'INVALID_QR_FORMAT',
  'MISSING_VOUCHER_TAIL',
  'INVALID_VOUCHER_ID',
]);

function mapVoucherQrResultToHttpStatus(result) {
  if (result.success) return 200;
  if (result.code === 'NOT_FOUND' || result.status === 'NOT_FOUND') return 404;
  if (VOUCHER_QR_CLIENT_ERROR_CODES.has(result.code)) return 400;
  return 500;
}

/**
 * Evaluate voucher doc status without modifying it.
 * @param {object} voucherData
 * @returns {{ status: string, valid: boolean, message: string }}
 */
function resolveVoucherStatus(voucherData) {
  if (voucherData.isRedeemed === true) {
    return { status: 'REDEEMED', valid: false, message: 'Voucher already redeemed' };
  }

  const redeemedCount = voucherData.redeemedCount || 0;
  const quantity = voucherData.quantity || 1;
  if (redeemedCount >= quantity) {
    return { status: 'REDEEMED', valid: false, message: 'Voucher already redeemed' };
  }

  if (voucherData.isEnabled === false) {
    return { status: 'DISABLED', valid: false, message: 'Voucher is disabled' };
  }

  const expiresAtRaw = voucherData.expiresAt || voucherData.expires_at;
  if (expiresAtRaw) {
    const expiryDate = toFirestoreDate(expiresAtRaw);
    if (expiryDate && new Date() > expiryDate) {
      return { status: 'EXPIRED', valid: false, message: 'Voucher has expired' };
    }
  }

  return { status: 'VALID', valid: true, message: 'Voucher is valid' };
}

/**
 * Disable voucher doc from QR: isEnabled false, isRedeemed true, redeemedAt set
 * @param {string} qrString
 * @returns {Promise<{ success: boolean, userId?: string, voucherId?: string, isRedeemed?: boolean, redeemedAt?: string, code?: string, message?: string }>}
 */
async function disableVoucherFromQr(qrString) {
  try {
    const { userId, voucherId } = decodeQrIgnorePrefix(qrString);
    const userIdsToTry = [userId, ...alternateUserIds(userId)];
    const seen = new Set();
    for (const uid of userIdsToTry) {
      if (seen.has(uid)) continue;
      seen.add(uid);
      const ref = fireStore.collection('user').doc(uid).collection('vouchers').doc(voucherId);
      const snap = await ref.get();
      if (!snap.exists) continue;
      const now = new Date();
      await ref.update({
        isEnabled: false,
        isRedeemed: true,
        redeemedAt: now,
      });
      return {
        success: true,
        userId: uid,
        voucherId,
        isRedeemed: true,
        redeemedAt: formatRedeemedAt(now),
      };
    }
    return {
      success: false,
      code: 'NOT_FOUND',
      message: 'Document not found',
      userId,
      voucherId,
    };
  } catch (e) {
    return {
      success: false,
      code: e.code || 'ERROR',
      message: e.message || String(e),
    };
  }
}

/**
 * Check voucher status from QR without modifying the document.
 * @param {string} qrString
 */
async function checkVoucherFromQr(qrString) {
  try {
    const { userId, voucherId } = decodeQrIgnorePrefix(qrString);
    const userIdsToTry = [userId, ...alternateUserIds(userId)];
    const seen = new Set();
    for (const uid of userIdsToTry) {
      if (seen.has(uid)) continue;
      seen.add(uid);
      const ref = fireStore.collection('user').doc(uid).collection('vouchers').doc(voucherId);
      const snap = await ref.get();
      if (!snap.exists) continue;
      const data = snap.data() || {};
      const statusResult = resolveVoucherStatus(data);
      const expiresAtDate = toFirestoreDate(data.expiresAt || data.expires_at);
      const redeemedAtDate = toFirestoreDate(data.redeemedAt);
      return {
        success: true,
        ...statusResult,
        userId: uid,
        voucherId,
        title: data.title || '',
        expiresAt: expiresAtDate ? expiresAtDate.toISOString() : null,
        isRedeemed: Boolean(data.isRedeemed),
        isEnabled: data.isEnabled !== false,
        redeemedAt: redeemedAtDate ? formatRedeemedAt(redeemedAtDate) : null,
      };
    }
    return {
      success: false,
      valid: false,
      status: 'NOT_FOUND',
      code: 'NOT_FOUND',
      message: 'Document not found',
      userId,
      voucherId,
    };
  } catch (e) {
    return {
      success: false,
      valid: false,
      code: e.code || 'ERROR',
      message: e.message || String(e),
    };
  }
}

function parseIsoDate(value, fieldName) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const e = new Error(`${fieldName} must be a valid ISO-8601 date`);
    e.code = 'INVALID_DATE';
    throw e;
  }
  return d;
}

/**
 * Load loyalty card from `loyal_card` by id (doc id or `id` field).
 * @param {string} loyaltyCardId
 */
async function loadLoyaltyCardById(loyaltyCardId) {
  const cardId = String(loyaltyCardId || '').trim();
  if (!cardId) {
    const e = new Error('loyaltyCardId is required');
    e.code = 'MISSING_LOYALTY_CARD_ID';
    throw e;
  }

  let cardDoc = await fireStore.collection('loyal_card').doc(cardId).get();
  if (!cardDoc.exists) {
    const snap = await fireStore
      .collection('loyal_card')
      .where('id', '==', cardId)
      .limit(1)
      .get();
    if (!snap.empty) {
      cardDoc = snap.docs[0];
    }
  }

  if (!cardDoc.exists) {
    const e = new Error(`Loyalty card not found: ${cardId}`);
    e.code = 'LOYALTY_CARD_NOT_FOUND';
    throw e;
  }

  const data = cardDoc.data() || {};
  return {
    loyaltyCardId: cardId,
    storeId: String(data.storeId || data.storeid || '').trim(),
    companyId: String(data.companyId || data.companyid || '').trim(),
    storeTitle: String(data.storeTitle || data.storetitle || data.title || '').trim(),
  };
}

/**
 * Grant a VM voucher to an existing user.
 * @param {{ phoneNumber: string, title: string, prefix: string, loyaltyCardId: string, promotionBanner?: string, sideLogo?: string, createdAt: string, expiresAt: string }} params
 */
async function grantVmVoucher({
  phoneNumber,
  title,
  prefix,
  loyaltyCardId,
  promotionBanner,
  sideLogo,
  createdAt,
  expiresAt,
}) {
  const phone = String(phoneNumber || '').trim();
  if (!phone.startsWith('+')) {
    const e = new Error('phoneNumber must start with + and country code');
    e.code = 'INVALID_PHONE';
    throw e;
  }

  const cleanTitle = String(title || '').trim();
  const cleanPrefix = String(prefix || '').trim();
  if (!cleanTitle) {
    const e = new Error('title is required');
    e.code = 'MISSING_TITLE';
    throw e;
  }
  if (!cleanPrefix) {
    const e = new Error('prefix is required');
    e.code = 'MISSING_PREFIX';
    throw e;
  }

  const created = parseIsoDate(createdAt, 'createdAt');
  const expires = parseIsoDate(expiresAt, 'expiresAt');
  if (expires <= created) {
    const e = new Error('expiresAt must be after createdAt');
    e.code = 'INVALID_EXPIRY';
    throw e;
  }

  const userId = `FU_${phone}`;
  const userRef = fireStore.collection('user').doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    const e = new Error(`User not found: ${userId}`);
    e.code = 'USER_NOT_FOUND';
    throw e;
  }

  const loyaltyCard = await loadLoyaltyCardById(loyaltyCardId);

  const voucherId = `VC_${crypto.randomUUID()}`;
  const voucherDoc = {
    id: voucherId,
    title: cleanTitle,
    voucherString: cleanPrefix,
    voucherType: 'vm',
    createdAt: created,
    expiresAt: expires,
    menuId: '',
    storeId: loyaltyCard.storeId,
    storeTitle: loyaltyCard.storeTitle,
    companyId: loyaltyCard.companyId,
    orderId: '',
    quantity: 1,
    redeemedCount: 0,
    isRedeemed: false,
    isEnabled: true,
    isTest: false,
    giveOnLogin: false,
    giveOnSignup: false,
    fromReferralOnly: false,
    machineId: '',
    loyaltyCardId: loyaltyCard.loyaltyCardId,
    promotionBanner: String(promotionBanner || '').trim(),
    sideLogo: String(sideLogo || '').trim(),
    vendingGoodsSku: '',
    vendingGoodsPhoto: '',
    vendingGoodsName: '',
    vendingGoodsSkuList: [],
    vendingGoodsPhotoList: [],
    vendingGoodsNameList: [],
    description: '',
    contentDetails: '',
  };

  await userRef.collection('vouchers').doc(voucherId).set(voucherDoc);

  return {
    success: true,
    message: 'VM voucher granted',
    userId,
    voucherId,
  };
}

// 🔒 HARD-CODED SECRET (CHANGE THIS BEFORE USE)
const REFERRAL_SECRET = 'CERIA_SECRET_v1_hV9@6a!uLzF6b3nQ%#kR2Yp9qD';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1/L

class VendingRouter {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  _shouldRedactVendingKey(key) {
    const l = String(key).toLowerCase();
    return (
      l === 'password' ||
      l === 'token' ||
      l === 'membership' ||
      l === 'authorization'
    );
  }

  _redactWalk(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => this._redactWalk(item));
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (this._shouldRedactVendingKey(k)) {
        if (v == null) out[k] = v;
        else if (typeof v === 'string')
          out[k] = `[REDACTED len=${v.length}]`;
        else out[k] = '[REDACTED]';
      } else {
        out[k] = this._redactWalk(v);
      }
    }
    return out;
  }

  /**
   * JSON-safe, redacted, length-capped string for console / log aggregation.
   * @param {*} value
   * @returns {string}
   */
  _sanitizeVendingLog(value) {
    const MAX = 16384;
    if (value === undefined) return 'undefined';
    let parsed;
    try {
      parsed = JSON.parse(JSON.stringify(value));
    } catch {
      const s = String(value);
      return s.length > MAX ? s.slice(0, MAX) + '...[truncated]' : s;
    }
    const redacted = this._redactWalk(parsed);
    let s;
    try {
      s = JSON.stringify(redacted);
    } catch {
      return '[Unserializable]';
    }
    return s.length > MAX ? s.slice(0, MAX) + '...[truncated]' : s;
  }

  _logVendingInbound(handlerName, req) {
    const body =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body
        : {};
    const query =
      req.query && typeof req.query === 'object' && !Array.isArray(req.query)
        ? req.query
        : {};
    const merged = { ...query, ...body };
    console.log(`[VENDING] ${handlerName} in`, this._sanitizeVendingLog(merged));
  }

  _patchResJsonForVendingLog(handlerName, res) {
    if (res.__vendingJsonPatched) return;
    res.__vendingJsonPatched = true;
    const orig = res.json.bind(res);
    const self = this;
    res.json = function (body) {
      console.log(
        `[VENDING] ${handlerName} out status=${res.statusCode}`,
        self._sanitizeVendingLog(body)
      );
      return orig(body);
    };

    if (typeof res.status === 'function') {
      const origStatus = res.status.bind(res);
      res.status = function (code) {
        const out = origStatus(code);
        if (
          out &&
          out !== res &&
          typeof out.json === 'function' &&
          !out.__vendingChainedJsonPatched
        ) {
          out.__vendingChainedJsonPatched = true;
          const innerOrig = out.json.bind(out);
          out.json = function (body) {
            console.log(
              `[VENDING] ${handlerName} out status=${code}`,
              self._sanitizeVendingLog(body)
            );
            return innerOrig(body);
          };
        }
        return out;
      };
    }
  }

  /**
   * Log outbound external vending/dispenser API call and its response (sanitized).
   * @param {string} handlerName
   * @param {string} method
   * @param {string} url
   * @param {*} payload
   * @param {number} responseStatus
   * @param {*} responseData
   */
  _logVendingExternalCall(handlerName, method, url, payload, responseStatus, responseData) {
    console.log(
      `[VENDING] ${handlerName} -> ${method} ${url}`,
      this._sanitizeVendingLog(payload)
    );
    console.log(
      `[VENDING] ${handlerName} <- status=${responseStatus}`,
      this._sanitizeVendingLog(responseData)
    );
  }

  handleAbout(req, res) {
    this._logVendingInbound('about', req);
    this._patchResJsonForVendingLog('about', res);
    res.json({ message: `Endpoint for Vending integration v1.0.1` });
  }

  initializeRoutes() {
    this.router.get('/about', this.handleAbout.bind(this));
    
   
    this.router.post('/checkmembership', this.checkMembership.bind(this));
    this.router.post('/redeemvoucher', this.redeemVoucher.bind(this));
    this.router.post('/checkvoucher', this.checkVoucher.bind(this));
    this.router.post('/disableeventvoucherfromqr', this.handleDisableVoucherFromQr.bind(this));
    this.router.post('/disablevmvoucherfromqr', this.handleDisableVoucherFromQr.bind(this));
    this.router.post('/checkeventvoucherfromqr', this.handleCheckVoucherFromQr.bind(this));
    this.router.post('/checkvmvoucherfromqr', this.handleCheckVoucherFromQr.bind(this));
    this.router.post('/grantvmvoucher', this.handleGrantVmVoucher.bind(this));
    this.router.post('/getstock', this.handleGetStock.bind(this));
    this.router.post('/datasetcollected', this.dataSetCollected.bind(this));
    this.router.post('/datasetuncollected', this.dataSetUnCollected.bind(this));
    this.router.post('/datagetorder', this.dataGetOrder.bind(this));
    this.router.post('/login', this.handleLogin.bind(this));
    this.router.post('/register', this.handleRegister.bind(this));
    this.router.post('/memberinfo', this.handleMemberInfo.bind(this));
    this.router.post('/goodslist', this.handleGoodsList.bind(this));
    this.router.post('/createorder', this.handleCreateOrder.bind(this));
    this.router.post('/checkorder', this.handleCheckOrder.bind(this));
    this.router.post('/payment/callback', this.handlePaymentCallback.bind(this));
    this.router.post('/pickup', this.handlePickup.bind(this));
    this.router.post('/pickupsuccess', this.handlePickupSuccess.bind(this));
    this.router.post('/getreferralcode', this.handleGetReferralCode.bind(this));

  }


  async dataSetUnCollected(req, res) {
    try {
      this._logVendingInbound('dataSetUnCollected', req);
      this._patchResJsonForVendingLog('dataSetUnCollected', res);
      // Extract required parameters from request
      const { userid, orderid } = req.body;
  
      // Validate required parameters
      if (!userid || !orderid) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: userId and orderId are required'
        });
      }
  
      // First check if order exists and its current status
      const storeOrderRef = fireStore
        .collection('store')
        .doc("online")
        .collection('order')
        .doc(orderid);
  
      const orderDoc = await storeOrderRef.get();
  
      // Check if order exists
      if (!orderDoc.exists) {
        return res.status(404).json({
          success: false,
          message: `Order ${orderid} not found`
        });
      }
  
      const orderData = orderDoc.data();
  
      // Check if order is not collected (status !== 3)
      if (orderData.status !== 3) {
        return res.status(400).json({
          success: false,
          message: `Order ${orderid} is not in collected status`,
          currentStatus: orderData.status
        });
      }
  
      // Get current timestamp
      const formattedDateTime = new UtilDateTime().getDateTimeString("yyyyMMddHHmmss");
      
      // Prepare update data
      const updateData = { 
        collectedDateTime: null,
        status: 0, // Set back to ready for collection
      };
  
      // Update order in user collection
      const userOrderRef = fireStore
        .collection('user')
        .doc(`FU_${userid}`)
        .collection('order')
        .doc(orderid);
  
      // Execute both updates in a batch for atomicity
      const batch = fireStore.batch();
      batch.update(storeOrderRef, updateData);
      batch.update(userOrderRef, updateData);
      
      // Commit the batch
      await batch.commit();
  
      console.log(`Order ${orderid} marked as uncollected for user ${userid}`);
      
      return res.status(200).json({
        success: true,
        message: 'Order successfully marked as uncollected',
      });
      
    } catch (error) {
      console.error('Error setting order as uncollected:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to mark order as uncollected',
        error: error.message
      });
    }
  }

  async dataSetCollected(req, res) {
  try {
    this._logVendingInbound('dataSetCollected', req);
    this._patchResJsonForVendingLog('dataSetCollected', res);
    // Extract required parameters from request
    const { userid, orderid } = req.body;

    // Validate required parameters
    if (!userid || !orderid ) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: userId and orderId are required'
      });
    }


    // First check if order exists and its current status
    const storeOrderRef = fireStore
      .collection('store')
      .doc("online")
      .collection('order')
      .doc(orderid);

    const orderDoc = await storeOrderRef.get();

    // Check if order exists
    if (!orderDoc.exists) {
      return res.status(404).json({
        success: false,
        message: `Order ${orderid} not found`
      });
    }

    const orderData = orderDoc.data();

    // Check if order is already collected (status 3)
    if (orderData.status === 3) {
      return res.status(400).json({
        success: false,
        message: `Order ${orderid} has already been collected`,
        collectedDateTime: orderData.collectedDateTime || 'Unknown'
      });
    }


    // Get current timestamp
    const formattedDateTime = new UtilDateTime().getDateTimeString("yyyyMMddHHmmss");
    
    // Prepare update data
    const updateData = { 
      collectedDateTime: formattedDateTime,
      status: 3 //kStatusCollected
    };

  

    // Update order in user collection
    const userOrderRef = fireStore
      .collection('user')
      .doc(`FU_${userid}`)
      .collection('order')
      .doc(orderid);

    // Execute both updates in a batch for atomicity
    const batch = fireStore.batch();
    batch.update(storeOrderRef, updateData);
    batch.update(userOrderRef, updateData);
    
    // Commit the batch
    await batch.commit();

    console.log(`Order ${orderid} marked as collected for user ${userid}`);
    
    return res.status(200).json({
      success: true,
      message: 'Order successfully marked as collected',
      collectedAt: formattedDateTime
    });
    
  } catch (error) {
    console.error('Error setting order as collected:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to mark order as collected',
      error: error.message
    });
  }
}

  async dataGetOrder(req, res) {
  try {
    this._logVendingInbound('dataGetOrder', req);
    this._patchResJsonForVendingLog('dataGetOrder', res);
    // Extract parameters from request
    const orderid = req.query.orderId || req.body.orderid;
    
    // Validate required parameters
    if (!orderid) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: orderId is required'
      });
    }

    // Define the reference to the order document
    const orderRef = fireStore
      .collection('store')
      .doc("online")
      .collection('order')
      .doc(orderid);

    // Get the document
    const orderDoc = await orderRef.get();

    // Check if the document exists
    if (!orderDoc.exists) {
      return res.status(404).json({
        success: false,
        message: `Order with ID ${orderid}`
      });
    }

    // Extract the order data
    const orderData = orderDoc.data();

    // Add the orderId to the data
    const responseData = {
      id: orderid,
      ...orderData
    };

    return res.status(200).json({
      success: true,
      message: 'Order retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Error retrieving order:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve order',
      error: error.message
    });
  }
}

  async checkMembership(req, res) {
    try {
      this._logVendingInbound('checkMembership', req);
      this._patchResJsonForVendingLog('checkMembership', res);
      // Validate the request body
      if (!req.body) {
        return res.status(400).json({ error: 'Request body is missing or empty' });
      }

      const { membership } = req.body;
      if (!membership) {
        return res.status(400).json({ error: 'Membership QR code is required' });
      }

      // Decrypt the membership QR code
      const bytes = CryptoJS.AES.decrypt(membership, kSecurePhase);
      const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

      // Check if it starts with "FOODIO:"
      if (!decryptedText.startsWith('FOODIO:')) {
        return res.status(400).json({ error: 'Invalid membership format' });
      }

      // Extract phone number
      const phoneNumber = decryptedText.split(':')[1];
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Invalid phone number format' });
      }

      // Check in Firestore using the exact path format from Flutter code
      const userRef = fireStore.collection('user');
      const userDoc = await userRef.doc("FU_" + phoneNumber).get();

      if (!userDoc.exists) {
        return res.json({ 
          isValid: false,
          message: 'User not found'
        });
      }

      // Get user data and return it directly
      const userData = userDoc.data();
      
      return res.json({
        isValid: true,
        message: 'Valid user',
        phoneNumber: phoneNumber,
        userData: userData  // Return the complete Firestore document data
      });

    } catch (error) {
      console.error('Error checking membership:', error);
      return res.status(500).json({ 
        error: 'Error validating membership',
        details: error.message 
      });
    }
  }


  async redeemVoucher(req, res) {
    try {
        this._logVendingInbound('redeemVoucher', req);
        this._patchResJsonForVendingLog('redeemVoucher', res);
        // Validate the request body
        if (!req.body) {
            return res.status(400).json({ error: 'Request body is missing or empty' });
        }

        const { membership } = req.body;
        if (!membership) {
            return res.status(400).json({ error: 'Membership code is required' });
        }

        // Decrypt the membership QR code
        const bytes = CryptoJS.AES.decrypt(membership, kSecurePhase);
        const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

        // Check if it starts with "FOODIO:"
        if (!decryptedText.startsWith('FOODIO:')) {
            return res.status(400).json({ error: 'Invalid membership format' });
        }

        // Extract phone number
        const phoneNumber = decryptedText.split(':')[1];
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }

        // Check if voucher already exists
        const voucherRef = fireStore.collection('voucher');
        const voucherDoc = await voucherRef.doc("V_" + phoneNumber).get();

        if (voucherDoc.exists) {
            return res.json({
                success: false,
                message: 'Voucher already redeemed',
                phoneNumber: phoneNumber
            });
        }

        // Create new voucher document
        const currentDate = new Date();
        const voucherData = {
            phoneNumber: phoneNumber,
            redeemDate: currentDate,
            status: 'ACTIVE',
            type: 'New member',
            createdAt: currentDate,
            updatedAt: currentDate
        };

        await voucherRef.doc("V_" + phoneNumber).set(voucherData);

        return res.json({
            success: true,
            message: 'Voucher successfully redeemed',
            phoneNumber: phoneNumber,
            voucherData: voucherData
        });

    } catch (error) {
        console.error('Error redeeming voucher:', error);
        return res.status(500).json({
            error: 'Error redeeming voucher',
            details: error.message
        });
    }
  }

  async checkVoucher(req, res) {
    try {
        this._logVendingInbound('checkVoucher', req);
        this._patchResJsonForVendingLog('checkVoucher', res);
        // Validate the request body
        if (!req.body) {
            return res.status(400).json({ error: 'Request body is missing or empty' });
        }

        const { membership } = req.body;
        if (!membership) {
            return res.status(400).json({ error: 'Membership code is required' });
        }

        // Decrypt the membership QR code
        const bytes = CryptoJS.AES.decrypt(membership, kSecurePhase);
        const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

        // Check if it starts with "FOODIO:"
        if (!decryptedText.startsWith('FOODIO:')) {
            return res.status(400).json({ error: 'Invalid membership format' });
        }

        // Extract phone number
        const phoneNumber = decryptedText.split(':')[1];
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }

        // Check if voucher already exists
        const voucherRef = fireStore.collection('voucher');
        const voucherDoc = await voucherRef.doc("V_" + phoneNumber).get();

        if (voucherDoc.exists) {
            return res.json({
                valid: false,
                message: 'Voucher already redeemed',
                phoneNumber: phoneNumber
            });
        }

        // Create new voucher document
        
        return res.json({
          valid: true,
          message: 'Voucher still available',
          phoneNumber: phoneNumber
      });

    } catch (error) {
        console.error('Error checking voucher:', error);
        return res.status(500).json({
            error: 'Error checking voucher',
            details: error.message
        });
    }
  }

  /**
   * POST body: { qrString } | { qr } | { qrcode }
   * Format: {prefix}_{FU_phone}_{voucherId} (EV_ or VC_)
   */
  async handleDisableVoucherFromQr(req, res) {
    try {
      this._logVendingInbound('handleDisableVoucherFromQr', req);
      this._patchResJsonForVendingLog('handleDisableVoucherFromQr', res);
      const qrString =
        req.body?.qrString ?? req.body?.qr ?? req.body?.qrcode;
      if (qrString === undefined || qrString === null || String(qrString).trim() === '') {
        return res.status(400).json({
          success: false,
          code: 'EMPTY_QR',
          message: 'qrString, qr, or qrcode is required',
        });
      }
      const result = await disableVoucherFromQr(qrString);
      return res.status(mapVoucherQrResultToHttpStatus(result)).json(result);
    } catch (error) {
      console.error('Error disable voucher from QR:', error);
      return res.status(500).json({
        success: false,
        code: 'ERROR',
        message: error.message || String(error),
      });
    }
  }

  /**
   * POST body: { qrString } | { qr } | { qrcode }
   * Format: {prefix}_{FU_phone}_{voucherId} (EV_ or VC_)
   */
  async handleCheckVoucherFromQr(req, res) {
    try {
      this._logVendingInbound('handleCheckVoucherFromQr', req);
      this._patchResJsonForVendingLog('handleCheckVoucherFromQr', res);
      const qrString =
        req.body?.qrString ?? req.body?.qr ?? req.body?.qrcode;
      if (qrString === undefined || qrString === null || String(qrString).trim() === '') {
        return res.status(400).json({
          success: false,
          code: 'EMPTY_QR',
          message: 'qrString, qr, or qrcode is required',
        });
      }
      const result = await checkVoucherFromQr(qrString);
      return res.status(mapVoucherQrResultToHttpStatus(result)).json(result);
    } catch (error) {
      console.error('Error checking voucher from QR:', error);
      return res.status(500).json({
        success: false,
        code: 'ERROR',
        message: error.message || String(error),
      });
    }
  }

  /**
   * POST body: { phoneNumber, title, prefix, loyaltyCardId, promotionBanner, sideLogo, createdAt, expiresAt }
   */
  async handleGrantVmVoucher(req, res) {
    try {
      this._logVendingInbound('handleGrantVmVoucher', req);
      this._patchResJsonForVendingLog('handleGrantVmVoucher', res);
      const result = await grantVmVoucher(req.body || {});
      return res.status(200).json(result);
    } catch (error) {
      console.error('Error granting VM voucher:', error);
      const clientErr = new Set([
        'INVALID_PHONE',
        'MISSING_TITLE',
        'MISSING_PREFIX',
        'MISSING_LOYALTY_CARD_ID',
        'LOYALTY_CARD_NOT_FOUND',
        'INVALID_DATE',
        'INVALID_EXPIRY',
        'USER_NOT_FOUND',
      ]);
      const status = clientErr.has(error.code) ? 400 : 500;
      return res.status(status).json({
        success: false,
        message: error.message || 'Grant failed',
      });
    }
  }

  /**
   * Fetches stock details from the dispenser API
   * @param {string} mid - The machine ID to get stock for
   * @returns {Promise<Object>} - Returns a promise that resolves to the stock data or an error object
   */
  async getStock(mid) {
    try {
      // Validate input
      if (!mid) {
        return {
          success: false,
          message: 'Machine ID (mid) is required',
          data: null
        };
      }

      // Create form data
      const FormData = require('form-data');
      const data = new FormData();
      data.append('mid', mid);

      // Configure the request
      const stockUrl = 'http://dispenser.sayhi.asia/index.php/api/GetStock/detail';
      const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: stockUrl,
        headers: { 
          ...data.getHeaders()
        },
        data: data
      };

      // Make the request
      const response = await axios.request(config);

      this._logVendingExternalCall('getStock', 'POST', stockUrl, { mid }, response.status, response.data);
      
      // Log success (optional)
      console.log(`Successfully fetched stock data for machine ${mid}`);
      
      // Return the data with success status
      return {
        success: true,
        message: 'Stock data retrieved successfully',
        data: response.data
      };
    } catch (error) {
      // Log the error for debugging
      console.error('Error fetching stock data:', error);
      
      // Provide detailed error information if available
      if (error.response) {
        const stockUrl = 'http://dispenser.sayhi.asia/index.php/api/GetStock/detail';
        this._logVendingExternalCall('getStock', 'POST', stockUrl, { mid }, error.response.status, error.response.data);
        console.error("Response status:", error.response.status);
        console.error("Response data:", error.response.data);
      }
      
      // Return error response
      return {
        success: false,
        message: `Failed to fetch stock data: ${error.message}`,
        data: null
      };
    }
  }

  /**
   * Route handler for stock retrieval API endpoint
   */
  async handleGetStock(req, res) {
    try {
      this._logVendingInbound('handleGetStock', req);
      this._patchResJsonForVendingLog('handleGetStock', res);
      // Validate the request body
      if (!req.body) {
        return res.status(400).json({ 
          success: false, 
          message: 'Request body is missing or empty',
          data: null
        });
      }

      const { mid } = req.body;
      if (!mid) {
        return res.status(400).json({ 
          success: false, 
          message: 'Machine ID (mid) is required',
          data: null
        });
      }

      // Call the getStock method
      const result = await this.getStock(mid);
      
      // Return the result directly to the client
      return res.json(result);
    } catch (error) {
      console.error('Error in getStock route handler:', error);
      return res.status(500).json({
        success: false,
        message: `Server error while fetching stock data: ${error.message}`,
        data: null
      });
    }
  }

  async handleLogin(req, res) {
    try {
      this._logVendingInbound('handleLogin', req);
      this._patchResJsonForVendingLog('handleLogin', res);
      // Validate request body
      const { device_number, merchant_id, mobile, mobile_area_code, password } = req.body;

      // Check for required fields
      if (!device_number || !merchant_id || !mobile || !mobile_area_code || !password) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters. Please provide device_number, merchant_id, mobile, mobile_area_code, and password'
        });
      }

      // Prepare request to external API
      const loginData = {
        device_number,
        merchant_id,
        mobile,
        mobile_area_code,
        password
      };

      // Make request to external API
      const loginUrl = `${kBaseUrl}/vending/members/login`;
      const response = await axios({
        method: 'POST',
        url: loginUrl,
        headers: {
          'Content-Type': 'application/json'
        },
        data: loginData
      });

      this._logVendingExternalCall('handleLogin', 'POST', loginUrl, loginData, response.status, response.data);

      // Return the response from the external API
      //return res.status(200).json(response.data);

      return res.status(200).json({
                success: true,
                message: response.data || '',
                error: ""
              });

    } catch (error) {
      console.error('Error in login:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        const loginUrl = `${kBaseUrl}/vending/members/login`;
        const { device_number, merchant_id, mobile, mobile_area_code, password } = req.body || {};
        const loginData = {
          device_number,
          merchant_id,
          mobile,
          mobile_area_code,
          password
        };
        this._logVendingExternalCall('handleLogin', 'POST', loginUrl, loginData, error.response.status, error.response.data);
        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Login failed',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error during login',
        error: error.message
      });
    }
  }

  async handleRegister(req, res) {
    try {
      this._logVendingInbound('handleRegister', req);
      this._patchResJsonForVendingLog('handleRegister', res);
      // Validate request body
      const { 
        avatar,
        birthday,
        device_number,
        email,
        merchant_id,
        mobile,
        mobile_area_code,
        nickname,
        password
      } = req.body;

      // Check for required fields
      const requiredFields = {
        device_number,
        merchant_id,
        mobile,
        mobile_area_code,
        password,
        email,
        nickname,
        birthday
      };

      const missingFields = Object.entries(requiredFields)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required parameters: ${missingFields.join(', ')}`
        });
      }

      // Prepare request to external API
      const registerData = {
        avatar: avatar || '',  // Make avatar optional
        birthday,
        device_number,
        email,
        merchant_id,
        mobile,
        mobile_area_code,
        nickname,
        password
      };

      // Make request to external API
      const registerUrl = `${kBaseUrl}/vending/members/register`;
      const response = await axios({
        method: 'POST',
        url: registerUrl,
        headers: {
          'Content-Type': 'application/json'
        },
        data: registerData
      });

      this._logVendingExternalCall('handleRegister', 'POST', registerUrl, registerData, response.status, response.data);

      // Return the response from the external API
      return res.status(200).json(response.data);

    } catch (error) {
      console.error('Error in registration:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        const registerUrl = `${kBaseUrl}/vending/members/register`;
        const b = req.body || {};
        const registerData = {
          avatar: b.avatar || '',
          birthday: b.birthday,
          device_number: b.device_number,
          email: b.email,
          merchant_id: b.merchant_id,
          mobile: b.mobile,
          mobile_area_code: b.mobile_area_code,
          nickname: b.nickname,
          password: b.password
        };
        this._logVendingExternalCall('handleRegister', 'POST', registerUrl, registerData, error.response.status, error.response.data);
        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Registration failed',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error during registration',
        error: error.message
      });
    }
  }

  async handleMemberInfo(req, res) {
    try {
      this._logVendingInbound('handleMemberInfo', req);
      this._patchResJsonForVendingLog('handleMemberInfo', res);
      // Get token from request body
      const { token } = req.body;

      // Check if token is provided
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authorization token is required in request body'
        });
      }

      // Make request to external API
      const memberInfoUrl = `${kBaseUrl}/vending/members/info`;
      const response = await axios({
        method: 'GET',
        url: memberInfoUrl,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      this._logVendingExternalCall('handleMemberInfo', 'GET', memberInfoUrl, { method: 'GET', token }, response.status, response.data);

      // Return the response from the external API
      return res.status(200).json(response.data);

    } catch (error) {
      console.error('Error fetching member info:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        const memberInfoUrl = `${kBaseUrl}/vending/members/info`;
        const t = (req.body && req.body.token) || undefined;
        this._logVendingExternalCall('handleMemberInfo', 'GET', memberInfoUrl, { method: 'GET', token: t }, error.response.status, error.response.data);
        // Special handling for 401 unauthorized errors
        if (error.response.status === 401) {
          return res.status(401).json({
            success: false,
            message: 'Invalid or expired token',
            error: error.response.data
          });
        }

        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Failed to fetch member info',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error while fetching member info',
        error: error.message
      });
    }
  }

  async handleGoodsList(req, res) {
    try {
      this._logVendingInbound('handleGoodsList', req);
      this._patchResJsonForVendingLog('handleGoodsList', res);
      // Get query parameters
      const { device_number, merchant_id } = req.body;

      // Validate required parameters
      if (!device_number || !merchant_id) {
        return res.status(400).json({
          success: false,
          message: 'Both device_number and merchant_id are required query parameters'
        });
      }

      // Make request to external API
      const goodsListUrl = `${kBaseUrl}/vending/devices/goods_list`;
      const goodsListParams = { device_number, merchant_id };
      const response = await axios({
        method: 'GET',
        url: goodsListUrl,
        params: goodsListParams,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      this._logVendingExternalCall('handleGoodsList', 'GET', goodsListUrl, goodsListParams, response.status, response.data);

      // Return the response from the external API
      return res.status(200).json(response.data);

    } catch (error) {
      console.error('Error fetching goods list:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        const goodsListUrl = `${kBaseUrl}/vending/devices/goods_list`;
        const b = req.body || {};
        const goodsListParams = { device_number: b.device_number, merchant_id: b.merchant_id };
        this._logVendingExternalCall('handleGoodsList', 'GET', goodsListUrl, goodsListParams, error.response.status, error.response.data);
        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Failed to fetch goods list',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error while fetching goods list',
        error: error.message
      });
    }
  }

  async handleCreateOrder(req, res) {
    try {
      this._logVendingInbound('handleCreateOrder', req);
      this._patchResJsonForVendingLog('handleCreateOrder', res);
      // Get token and order details from request body
      const { 
        token,
        order_details
      } = req.body;

      // Validate token
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authorization token is required in request body'
        });
      }

      // Validate order_details exists
      if (!order_details) {
        return res.status(400).json({
          success: false,
          message: 'order_details object is required in request body'
        });
      }

      // Extract order details
      const { 
        amount,
        currency,
        device_number,
        list,
        merchant_id,
        remark
      } = order_details;

      // Validate required parameters
      if ( !currency || !device_number || !list || !merchant_id) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters in order_details. Please provide amount, currency, device_number, list, and merchant_id'
        });
      }

      // Validate list structure
      if (!Array.isArray(list) || list.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'List must be a non-empty array of goods'
        });
      }

      // Validate each item in the list
//      const requiredItemFields = ['goods_count', 'goods_description', 'goods_id', 'goods_name',
//                                'goods_photo', 'goods_price', 'goods_sku'];
//      for (const item of list) {
//        const missingFields = requiredItemFields.filter(field => !item[field]);
//        if (missingFields.length > 0) {
//          return res.status(400).json({
//            success: false,
//            message: `Missing required fields in list item: ${missingFields.join(', ')}`
//          });
//        }
//      }

      // Make request to external API
      const createOrderUrl = `${kBaseUrl}/vending/orders/purchase`;
      const purchasePayload = {
        amount,
        currency,
        device_number,
        list,
        merchant_id,
        remark
      };
      const response = await axios({
        method: 'POST',
        url: createOrderUrl,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        data: purchasePayload
      });

      this._logVendingExternalCall('handleCreateOrder', 'POST', createOrderUrl, { token, order_details: purchasePayload }, response.status, response.data);

      // Return the response from the external API
      return res.status(200).json(response.data);

    } catch (error) {
      console.error('Error creating order:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        const createOrderUrl = `${kBaseUrl}/vending/orders/purchase`;
        const b = req.body || {};
        const od = b.order_details || {};
        const purchasePayload = {
          amount: od.amount,
          currency: od.currency,
          device_number: od.device_number,
          list: od.list,
          merchant_id: od.merchant_id,
          remark: od.remark
        };
        this._logVendingExternalCall('handleCreateOrder', 'POST', createOrderUrl, { token: b.token, order_details: purchasePayload }, error.response.status, error.response.data);
        // Special handling for 401 unauthorized errors
        if (error.response.status === 401) {
          return res.status(401).json({
            success: false,
            message: 'Invalid or expired token',
            error: error.response.data
          });
        }

        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Failed to create order',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error while creating order',
        error: error.message
      });
    }
  }

  async handleCheckOrder(req, res) {
    try {
      this._logVendingInbound('handleCheckOrder', req);
      this._patchResJsonForVendingLog('handleCheckOrder', res);
      // Get token and orderId from request body
      const { token, orderId } = req.body;

      // Validate token
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authorization token is required in request body'
        });
      }

      // Validate orderId
      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required in request body'
        });
      }

      // Make request to external API
      const checkOrderUrl = `${kBaseUrl}/vending/orders/${orderId}`;
      const response = await axios({
        method: 'GET',
        url: checkOrderUrl,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      this._logVendingExternalCall('handleCheckOrder', 'GET', checkOrderUrl, { method: 'GET', orderId, token }, response.status, response.data);

      // Return the response from the external API
      //return res.status(200).json(response.data);
       return res.status(200).json({
                  success: true,
                  message: response.data,
                  error: ""
                });

    } catch (error) {
      console.error('Error checking order:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        const b = req.body || {};
        const checkOrderUrl = `${kBaseUrl}/vending/orders/${b.orderId || ''}`;
        this._logVendingExternalCall('handleCheckOrder', 'GET', checkOrderUrl, { method: 'GET', orderId: b.orderId, token: b.token }, error.response.status, error.response.data);
        // Special handling for 401 unauthorized errors
        if (error.response.status === 401) {
          return res.status(401).json({
            success: false,
            message: 'Invalid or expired token',
            error: error.response.data
          });
        }

        // Special handling for 404 not found errors
        if (error.response.status === 404) {
          return res.status(404).json({
            success: false,
            message: 'Order not found',
            error: error.response.data
          });
        }

        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Failed to check order',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error while checking order',
        error: error.message
      });
    }
  }

  async handlePaymentCallback(req, res) {
    try {
      this._logVendingInbound('handlePaymentCallback', req);
      this._patchResJsonForVendingLog('handlePaymentCallback', res);
      // Get payment details from request body
      const { 
        amount,
        currency,
        order_id,
        payed_time,
        payment_channel,
        remark,
        status,
        transaction_id,
        transaction_type
      } = req.body;

      // Validate required fields
      const requiredFields = {
        amount,
        currency,
        order_id,
        payed_time,
        payment_channel,
        status,
        transaction_id,
        transaction_type
      };

      const missingFields = Object.entries(requiredFields)
        .filter(([_, value]) => value === undefined || value === null)
        .map(([key]) => key);

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required parameters: ${missingFields.join(', ')}`
        });
      }

      // Validate numeric fields
      if (typeof amount !== 'number' || typeof payed_time !== 'number') {
        return res.status(400).json({
          success: false,
          message: 'amount and payed_time must be numbers'
        });
      }

      // Make request to external API
      const paymentCallbackUrl = `${kBaseUrl}/open/vending/app/payment/callback`;
      const callbackPayload = {
        amount,
        currency,
        order_id,
        payed_time,
        payment_channel,
        remark: remark || '',  // Make remark optional
        status,
        transaction_id,
        transaction_type
      };
      const response = await axios({
        method: 'POST',
        url: paymentCallbackUrl,
        headers: {
          'Content-Type': 'application/json'
        },
        data: callbackPayload
      });

      this._logVendingExternalCall('handlePaymentCallback', 'POST', paymentCallbackUrl, callbackPayload, response.status, response.data);

      // Return the response from the external API
      return res.status(200).json(response.data);

    } catch (error) {
      console.error('Error processing payment callback:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        const paymentCallbackUrl = `${kBaseUrl}/open/vending/app/payment/callback`;
        const b = req.body || {};
        const callbackPayload = {
          amount: b.amount,
          currency: b.currency,
          order_id: b.order_id,
          payed_time: b.payed_time,
          payment_channel: b.payment_channel,
          remark: b.remark || '',
          status: b.status,
          transaction_id: b.transaction_id,
          transaction_type: b.transaction_type
        };
        this._logVendingExternalCall('handlePaymentCallback', 'POST', paymentCallbackUrl, callbackPayload, error.response.status, error.response.data);
        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Failed to process payment callback',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error while processing payment callback',
        error: error.message
      });
    }
  }

  async handlePickup(req, res) {
    try {
      this._logVendingInbound('handlePickup', req);
      this._patchResJsonForVendingLog('handlePickup', res);
      // Get token and orderId from request body
      const { token, orderId } = req.body;

      // Validate token
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authorization token is required in request body'
        });
      }

      // Validate orderId
      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required in request body'
        });
      }

      // Make request to external API with Bearer token authorization
      const pickupUrl = `${kBaseUrl}/vending/orders/${orderId}/pickup`;
      const response = await axios({
        method: 'POST',
        url: pickupUrl,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      this._logVendingExternalCall('handlePickup', 'POST', pickupUrl, { method: 'POST', orderId, token }, response.status, response.data);

      // Return the response from the external API
      return res.status(200).json({
        success: true,
        message: response.data,
        error: ""
      });

    } catch (error) {
      console.error('Error processing pickup order:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        const b = req.body || {};
        const pickupUrl = `${kBaseUrl}/vending/orders/${b.orderId || ''}/pickup`;
        this._logVendingExternalCall('handlePickup', 'POST', pickupUrl, { method: 'POST', orderId: b.orderId, token: b.token }, error.response.status, error.response.data);
        // Special handling for 401 unauthorized errors
        if (error.response.status === 401) {
          return res.status(401).json({
            success: false,
            message: 'Invalid or expired token',
            error: error.response.data
          });
        }

        // Special handling for 404 not found errors
        if (error.response.status === 404) {
          return res.status(404).json({
            success: false,
            message: 'Order not found',
            error: error.response.data
          });
        }

        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Failed to process pickup order',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error while processing pickup order',
        error: error.message
      });
    }
  }

  async handlePickupSuccess(req, res) {
    try {
      this._logVendingInbound('handlePickupSuccess', req);
      this._patchResJsonForVendingLog('handlePickupSuccess', res);
      // DEBUG: Log function entry with timestamp and request details
      console.log('=== handlePickupSuccess TRIGGERED ===');
      console.log('=====================================');

      // Get required parameters from request body
      const { remark, merchant_id, device_number } = req.body;

      // DEBUG: Log extracted parameters
      console.log('Extracted parameters:');
      console.log('- remark:', remark);
      console.log('- merchant_id:', merchant_id);
      console.log('- device_number:', device_number);

      // Validate required parameters
      if (!remark || !merchant_id || !device_number) {
        console.log('DEBUG: Validation failed - missing required parameters');
        console.log('- remark exists:', !!remark);
        console.log('- merchant_id exists:', !!merchant_id);
        console.log('- device_number exists:', !!device_number);
        
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: remark, merchant_id, and device_number are all required'
        });
      }

      // Create document ID by combining merchant_id and device_number
      const documentId = `${merchant_id}_${device_number}`;
      
      // DEBUG: Log document ID creation
      console.log('DEBUG: Created document ID:', documentId);

      // Reference to the pickup document in Firestore
      const pickupDocRef = fireStore
        .collection('user')
        .doc(`FU_${remark}`)
        .collection('pickup')
        .doc(documentId);

      // Reference to the pickup_success document in Firestore
      const pickupSuccessDocRef = fireStore
        .collection('user')
        .doc(`FU_${remark}`)
        .collection('pickup_success')
        .doc(documentId);

      // DEBUG: Log Firestore paths
      console.log('DEBUG: Firestore paths:');
      console.log('- Pickup collection path:', `user/FU_${remark}/pickup/${documentId}`);
      console.log('- Pickup success collection path:', `user/FU_${remark}/pickup_success/${documentId}`);

      // Check if document exists before attempting to move
      console.log('DEBUG: Checking if pickup document exists...');
      const docSnapshot = await pickupDocRef.get();

      if (!docSnapshot.exists) {
        console.log('DEBUG: Pickup document NOT found - returning 404');
        console.log('- Document ID:', documentId);
        console.log('- User ID:', `FU_${remark}`);
        
        return res.status(404).json({
          success: false,
          message: `Pickup record with ID ${documentId} not found for user ${remark}`,
          user_id: `FU_${remark}`
        });
      }

      // Get the document data
      const pickupData = docSnapshot.data();

      // Add timestamp for when it was moved to pickup_success
      const pickupSuccessData = {
        ...pickupData,
        pickup_success_timestamp: new Date(),
        moved_from_pickup_at: new Date().toISOString()
      };

      // Use batch operation to move data atomically
      const batch = fireStore.batch();
      
      // Add to pickup_success collection
      batch.set(pickupSuccessDocRef, pickupSuccessData);
      
      // Remove from pickup collection
      batch.delete(pickupDocRef);
      
      // Commit the batch operation
      await batch.commit();

      console.log(`Successfully moved pickup record ${documentId} to pickup_success for user FU_${remark}`);

      // DEBUG: Log success response details
      console.log('DEBUG: Preparing success response...');
      console.log('DEBUG: Response data:', {
        success: true,
        moved_document_id: documentId,
        user_id: `FU_${remark}`,
        pickup_success_timestamp: pickupSuccessData.pickup_success_timestamp
      });
      console.log('=== handlePickupSuccess COMPLETED SUCCESSFULLY ===');

      return res.status(200).json({
        success: true,
        message: 'Pickup record successfully moved to pickup_success',
        moved_document_id: documentId,
        user_id: `FU_${remark}`,
        pickup_success_timestamp: pickupSuccessData.pickup_success_timestamp
      });

    } catch (error) {
      // DEBUG: Enhanced error logging
      console.log('=== handlePickupSuccess ERROR OCCURRED ===');
      console.log('Error timestamp:', new Date().toISOString());
      console.log('Error message:', error.message);
      console.log('Error stack:', error.stack);
      console.log('Request body at time of error:', JSON.stringify(req.body, null, 2));
      console.log('==========================================');
      
      console.error('Error processing pickup success:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Internal server error while processing pickup success',
        error: error.message
      });
    }
  }

  // Utility functions for referral code generation
  toBase32(buf, alphabet = ALPHABET) {
    let n = BigInt('0x' + buf.toString('hex'));
    if (n === 0n) return alphabet[0];
    let out = '';
    while (n > 0n) {
      out = alphabet[Number(n % 32n)] + out;
      n /= 32n;
    }
    return out;
  }

  /**
   * makeReferralCode(input, { length=8, version='v1', attempt=0 })
   * - input: stable id (UID or normalized phone)
   * - length: code length (8 is a good default)
   * - version: bump to rotate scheme (e.g., 'v2')
   * - attempt: increment if you need to retry on DB collision
   */
  makeReferralCode(input, { length = 8, version = 'v1', attempt = 0 } = {}) {
    if (!input) throw new Error('makeReferralCode: `input` is required');
    const msg = `${String(input).trim()}|${version}|${attempt}`;
    const hmac = crypto.createHmac('sha256', REFERRAL_SECRET).update(msg).digest();
    return this.toBase32(hmac).slice(0, length);
  }

  // Optional helpers for phone numbers
  normalizePhoneE164(raw) {
    const digits = String(raw ?? '').replace(/\D+/g, '');
    if (!digits) throw new Error('normalizePhoneE164: invalid phone');
    return `+${digits}`;
  }

  makeReferralCodeFromPhone(phone, opts) {
    return this.makeReferralCode(this.normalizePhoneE164(phone), opts);
  }

  async handleGetReferralCode(req, res) {
    try {
      this._logVendingInbound('handleGetReferralCode', req);
      this._patchResJsonForVendingLog('handleGetReferralCode', res);
      // Extract phone number from request body
      const { phoneNumber } = req.body;

      // Validate required parameters
      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required'
        });
      }

      // Generate referral code from phone number
      const referralCode = this.makeReferralCodeFromPhone(phoneNumber);

      console.log(`Generated referral code ${referralCode} for phone number ${phoneNumber}`);

      return res.status(200).json({
        success: true,
        message: 'Referral code generated successfully',
        phoneNumber: phoneNumber,
        referralCode: referralCode
      });

    } catch (error) {
      console.error('Error generating referral code:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to generate referral code',
        error: error.message
      });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = VendingRouter;
module.exports.decodeQrIgnorePrefix = decodeQrIgnorePrefix;
module.exports.disableVoucherFromQr = disableVoucherFromQr;
module.exports.disableEventVoucherFromQr = disableVoucherFromQr;
module.exports.checkVoucherFromQr = checkVoucherFromQr;
module.exports.grantVmVoucher = grantVmVoucher;