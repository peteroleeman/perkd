const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const UtilFeie = require("./feie/util_feie");
const querystring = require('querystring');
const bodyParser = require('body-parser');
const url = require('url');
const UtilDateTime = require("./util/util_datetime");
const firebase = require("./db");
const https = require('https');
const VendingRouter = require('./vendingrouter');
const SqlAccountRouter = require('./sqlaccountrouter');
const { UserModel } = require('./models/UserModel');
const { StampCardModel } = require('./models/StampCardModel');
const fireStore = firebase.firestore();

const {
  getCurrentDateString
} = require("./util/util_datetime");

const {
  writeGKashTransaction
} = require("./storeController");

class GKashRouter {



  constructor() {
    this.router = express.Router();

    this.cSignatureKey = "qdz7WDajSMaUOzo";
    this.cCID = "M102-U-54392"; 
    this.cTID = "M102-TD-63070";
    
    // Middleware to parse the incoming request body
    this.router.use(bodyParser.urlencoded({ extended: true }));
    this.router.use(bodyParser.json());
    
    // Initialize internal vending router for direct method calls
    this.vendingRouter = new VendingRouter();
    
    // Initialize SQL Account router for invoice creation
    this.sqlAccountRouter = new SqlAccountRouter();
    
    this.initializeRoutes();
  }

  //SECTION router
  initializeRoutes() {

    this.router.get('/about', function(req, res) {
     res.json({ message: `Endpoint for GKash integration v1.25`});
    });

    //point related
    this.router.post('/point', this.handlePoint.bind(this));
     //OTP related
     this.router.post('/send-otp', this.handleSendONEOTP.bind(this));
  
     // Normal endpoints (isBeta = false)
     this.router.post('/return', (req, res) => {
       const parsedUrl = url.parse(req.url, true);
       const version = parsedUrl.query.version || req.body.version || undefined;
       this.paymentTBReturn(req, res, false, version); //this is used for table ordering
     });
     this.router.post('/crmreturn', (req, res) => {
       const parsedUrl = url.parse(req.url, true);
       const version = parsedUrl.query.version || req.body.version || undefined;
       this.paymentCRMReturn(req, res, false, version);
     });
     this.router.post('/coinreturn', (req, res) => {
       const parsedUrl = url.parse(req.url, true);
       const version = parsedUrl.query.version || req.body.version || undefined;
       this.paymentCoinReturn(req, res, false, version);
     });
     this.router.post('/vmreturn', (req, res) => {
       const parsedUrl = url.parse(req.url, true);
       const version = parsedUrl.query.version || req.body.version || undefined;
       this.paymentVMReturn(req, res, false, version);
     });

     // Beta endpoints (isBeta = true)
     this.router.post('/betareturn', (req, res) => {
       const parsedUrl = url.parse(req.url, true);
       const version = parsedUrl.query.version || req.body.version || undefined;
       this.paymentReturn(req, res, false, version);
     });
     this.router.post('/betacrmreturn', (req, res) => {
       const parsedUrl = url.parse(req.url, true);
       const version = parsedUrl.query.version || req.body.version || undefined;
       this.paymentCRMReturn(req, res, false, version);
     });
     this.router.post('/betavmreturn', (req, res) => {
       const parsedUrl = url.parse(req.url, true);
       const version = parsedUrl.query.version || req.body.version || undefined;
       this.paymentVMReturn(req, res, false, version);
     });


     this.router.post('/crmsimplereturn', this.paymentCRMSimpleReturn.bind(this));
     this.router.post('/callback', this.paymentResult.bind(this));
    this.router.post('/initpayment', this.initPayment.bind(this));
    this.router.post('/createstore', this.createStore.bind(this));


    this.router.post('/remoteinitpayment', this.remote_initPayment.bind(this));
    this.router.post('/remotecallback', this.remote_paymentResult.bind(this));
    this.router.post('/remotecancelpayment', this.remote_cancelPayment.bind(this));
    this.router.post('/remoterefund', this.remote_Refund.bind(this));
    this.router.post('/remotestatus', this.remote_Status.bind(this));

    // Tokenization & recurring payment endpoints
    this.router.post('/tokenize', this.remote_tokenizePayment.bind(this));
    this.router.post('/charge-token', this.remote_chargeByToken.bind(this));
    this.router.post('/tokenizecallback', this.remote_tokenizeCallback.bind(this));
    this.router.post('/tokenizereturn', this.remote_tokenizeReturn.bind(this));

    //customer scan
    this.router.post('/remotegetqr', this.remote_getQR.bind(this));
    this.router.post('/remotegetqrcallback', this.remote_getQRCallBack.bind(this));

    // Direct order processing endpoint (no GKash payment required)
    this.router.post('/processOrder', this.handleProcessOrder.bind(this));
    this.router.post('/processPOSOrder', this.handlePOSProcessOrder.bind(this));
    this.router.post('/processGamePlayOrder', this.handleGamePlayProcessOrder.bind(this));

    // Soundbox payment endpoint
    this.router.post('/soundbox', this.initSoundboxPayment.bind(this));
    
    // Soundbox callback endpoint
    this.router.post('/soundboxcallback', this.handleSoundboxCallback.bind(this));
    
    // Soundbox cancel payment endpoint
    this.router.post('/soundboxcancel', this.cancelSoundboxPayment.bind(this));
    
    // Soundbox publish e-Invoice endpoint
    this.router.post('/soundboxinvoice', this.publishSoundboxInvoice.bind(this));

    // Payment query endpoint
    this.router.post('/query', this.paymentQuery.bind(this));

    // Voucher limit management endpoints
    this.router.post('/voucher/create-limit', this.createVoucherLimitEndpoint.bind(this));
    this.router.post('/voucher/increment', this.incrementVoucherCountEndpoint.bind(this));
    this.router.get('/voucher/check/:machineModelId/:voucherId', this.checkVoucherLimitEndpoint.bind(this));
    this.router.get('/voucher/details/:machineModelId/:voucherId', this.getVoucherLimitDetailsEndpoint.bind(this));
    this.router.get('/voucher/list-all-limits', this.listAllVoucherLimitsEndpoint.bind(this)); // ✨ NEW: List all voucher limits
    this.router.delete('/voucher/remove/:machineModelId/:voucherId', this.removeVoucherLimitEndpoint.bind(this));

    // Pending points management endpoints
    this.router.post('/pendingpoints/save', this.handleSavePendingPoints.bind(this));
    this.router.post('/pendingpoints/claim', this.handleClaimPendingPoints.bind(this));
    //this.router.delete('/pending-points/delete/:userId', this.handleDeletePendingPoints.bind(this));

    // Loyalty cards endpoint
    /*
    POST /copyloyaltycards
    {
      "userId": "FU_1234567890",
      "loyaltyCardIds": ["card_1", "card_2", "card_3"],
      "machineModelId": "MODEL_KIOSK_V2"  // Optional: For voucher limit checking
    }
    
    Note: If machineModelId is provided, the system will check voucher limits 
    before copying vouchers to the user. Vouchers that have reached their 
    limit for the specified machine model will be skipped.
    */
    this.router.post('/copyloyaltycards', this.handleCopyLoyaltyCards.bind(this));

    // Award order loyalty endpoint - processes loyalty rewards for an existing order
    // POST /awardOrderLoyalty
    // Body: { storeId: "S_xxxxx", orderId: "O_xxxxx", userPhoneNumber: "1234567890" }
    this.router.post('/awardOrderLoyalty', this.handleAwardOrderLoyalty.bind(this));

  }


  //gkash offline payment
  async remote_initPayment(req, res)  {

    
    // Convert v_amount to 2 decimal places and remove commas or decimal points
    //const formattedAmount = (parseFloat(v_amount.replace(/,/g, '')) * 100).toFixed(0);
  
    // Concatenate parameters for signature calculation
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    // Allow users to specify their own CID and SignatureKey, with fallback to defaults
    const cSignatureKey = req.body['SignatureKey'] ?? this.cSignatureKey;
    const cCID = req.body['CID'] ?? this.cCID;
    var cTID = this.cTID; //"M102-TD-63070";
    var cCartID = "merchant-reference-1731983297"; //`merchant-reference-${timeStamp}`;
    var cAmount = 1;
    var cCurrency = "MYR";
    var cPaymentType = 1;
    var cEmail = "m.amirul@gkash.com";
    var cMobileNo = "01119312382";
    


    cAmount =  req.body['Amount'] ?? 0;
    cCurrency = req.body['Currency'] ?? "";
    cCartID = req.body['ReferenceNo'] ?? "";
    cTID = req.body['TerminalId'] ?? "";
    cPaymentType = req.body['PaymentType'] ?? 0;
    cEmail = req.body['Email'] ?? "";
    cMobileNo = req.body['MobileNo'] ?? "";
    
    // Calculate signature using the signature key (user-provided or default)
    const formattedAmount = Math.round(parseFloat(cAmount.toString().replace(/,/g, '')) * 100).toString().padStart(3, '0');
    const signatureString = `${cSignatureKey};${formattedAmount};${cCurrency};${cCartID};${cTID}`;
    const signatureKey = crypto.createHash('sha512').update(signatureString).digest('hex').toUpperCase();
   

    let data = JSON.stringify({
      "Amount": cAmount,
      "Currency": cCurrency,
      "ReferenceNo": cCartID,
      "TerminalId": cTID,
      "PaymentType": cPaymentType,
      "Email": cEmail,
      "MobileNo": cMobileNo,
      "PreAuth": false,
      "CallbackURL": "https://api.foodio.online/gkash/remotecallback",
      "callbackurl": "https://api.foodio.online/gkash/remotecallback",
      "Signature": signatureKey
    });

    
  
    try {
      // Make the POST request using Axios
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.gkash.my/apim/merchant/SoftPosPay',//https://api.gkash.my/apim/merchant/SoftPosPay
        headers: { 
          'Content-Type': 'application/json'
        },
        data : data
      };

      //console.log(postData);

      // Make the POST request using Axios
      axios.request(config)
        .then(response => {
          console.log(`remote init payment return ok`);
          console.log(response.data);
          res.status(200).send(response.data);
        })
        .catch(error => {
          // Handle errors
          console.error(error);
          res.status(500).send(error);
        });
  
      //res.send('Payment form submitted!');
    } catch (error) {
      // Handle errors
      console.error(error);
      res.status(500).send('Error init payment');
    }

  }

  /**
   * Tokenization + initial payment (form-based, similar to initPayment)
   *
   * POST /tokenize
   * {
   *   "v_amount": "100.00",
   *   "v_currency": "MYR",
   *   "v_cartid": "merchant-reference-712893",
   *   "recurringtype": "ANNUAL",  // or "MONTHLY", "WEEKLY", etc.
   *   "returnurl": "https://www.testing.com/api/return",
   *   "callbackurl": "https://www.testing.com/api/callback"
   * }
   *
   * NOTE:
   * - This handler uses the form-based payment flow (like initPayment) with recurringtype parameter
   * - The signature is calculated as: SIGNATUREKEY;CID;CARTID;AMOUNT;CURRENCY (all uppercase)
   * - You should extract the token from the callback response and store it in your database
   * - Reference: https://doc.gkash.my/recurring-payments
   */
  async remote_tokenizePayment(req, res) {
    const cSignatureKey =  "ktDoGDCBxSaJSEJ";//this.cSignatureKey;
    const cCID = "M161-U-40892";//this.cCID;

   
    
    // Get parameters from request body (using form field names)
    let cAmount = req.body['v_amount'] ?? req.body['Amount'] ?? "100.00";
    let cCurrency = req.body['v_currency'] ?? req.body['Currency'] ?? "MYR";
    let cCartID = req.body['v_cartid'] ?? req.body['ReferenceNo'] ?? `merchant-reference-${Math.floor(Date.now() / 1000)}`;
    const recurringType = req.body['recurringtype'] ?? "ANNUAL"; // ANNUAL, MONTHLY, WEEKLY, etc.
    const returnUrl = req.body['returnurl'] ?? "https://api.foodio.online/gkash/tokenizereturn";
    const callbackUrl = req.body['callbackurl'] ?? "https://api.foodio.online/gkash/tokenizecallback";

    try {
      // Signature calculation: SIGNATUREKEY;CID;CARTID;AMOUNT;CURRENCY (all uppercase)
      // Amount should be without decimal point for signature (e.g., "10000" for 100.00)
     

      const formattedAmount = Math.round(parseFloat(cAmount.toString().replace(/,/g, '')) * 100).toString();
      const signatureString = `${cSignatureKey};${cCID};${cCartID};${formattedAmount};${cCurrency}`.toUpperCase();
      const signatureKey = crypto.createHash('sha512').update(signatureString).digest('hex');

      // Prepare form data (using form field names like initPayment)
      const postData = {
        version: "1.5.5",
        CID: cCID,
        v_currency: cCurrency,
        v_amount: String(cAmount),
        v_cartid: cCartID,
        signature: signatureKey,
        returnurl: returnUrl,
        callbackurl: callbackUrl,
        recurringtype: recurringType  // Key parameter for tokenization/recurring payments
      };

      // Convert to form-urlencoded format
      const formData = querystring.stringify(postData);

      console.log('remote tokenization payment');
      console.log(postData);

      // Make POST request to payment form endpoint
      axios.post('https://api-staging.pay.asia/api/paymentform.aspx', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
        .then(response => {
          console.log('remote tokenization payment return ok');
          console.log(response.data);
          // You should extract the token from response.data or callback response
          // and store it in your own database.
          res.status(200).send(response.data);
        })
        .catch(error => {
          console.error(error);
          if (error.response) {
            res.status(error.response.status || 500).send(error.response.data);
          } else {
            res.status(500).send(error.message || 'Error calling GKash tokenization API');
          }
        });
    } catch (error) {
      console.error(error);
      res.status(500).send('Error init tokenization payment');
    }
  }

  /**
   * Charge using an existing stored token (form-based)
   *
   * POST /charge-token
   * {
   *   "token": "GKASH_TOKEN_FROM_PREVIOUS_CALL",
   *   "v_amount": "100.00",
   *   "v_currency": "MYR",
   *   "v_cartid": "merchant-reference-712893",
   *   "returnurl": "https://www.testing.com/api/return",
   *   "callbackurl": "https://www.testing.com/api/callback"
   * }
   *
   * NOTE:
   * - Your own application is responsible for storing and retrieving the token
   *   in your database. This handler only receives the token and passes it to
   *   GKash for charging.
   * - Uses form-based payment flow with token parameter
   * - Signature calculation: SIGNATUREKEY;CID;CARTID;AMOUNT;CURRENCY (all uppercase)
   * - Reference: https://doc.gkash.my/recurring-payments
   */
  async remote_chargeByToken(req, res) {
    const cSignatureKey = this.cSignatureKey;
    const cCID = this.cCID;

    // Get parameters from request body (using form field names)
    const token = req.body['token'] ?? req.body['Token'] ?? '';
    let cAmount = req.body['v_amount'] ?? req.body['Amount'] ?? "100.00";
    let cCurrency = req.body['v_currency'] ?? req.body['Currency'] ?? "MYR";
    let cCartID = req.body['v_cartid'] ?? req.body['ReferenceNo'] ?? `merchant-reference-${Math.floor(Date.now() / 1000)}`;
    const returnUrl = req.body['returnurl'] ?? "https://api.foodio.online/gkash/return";
    const callbackUrl = req.body['callbackurl'] ?? "https://api.foodio.online/gkash/tokenizecallback";

    if (!token) {
      return res.status(400).send('Token is required');
    }

    try {
      // Signature calculation: SIGNATUREKEY;CID;CARTID;AMOUNT;CURRENCY (all uppercase)
      // Amount should be without decimal point for signature (e.g., "10000" for 100.00)
      const formattedAmount = Math.round(parseFloat(cAmount.toString().replace(/,/g, '')) * 100).toString();
      const signatureString = `${cSignatureKey};${cCID};${cCartID};${formattedAmount};${cCurrency}`.toUpperCase();
      const signatureKey = crypto.createHash('sha512').update(signatureString).digest('hex');

      // Prepare form data (using form field names like initPayment)
      const postData = {
        version: "1.5.5",
        CID: cCID,
        v_currency: cCurrency,
        v_amount: String(cAmount),
        v_cartid: cCartID,
        signature: signatureKey,
        returnurl: returnUrl,
        callbackurl: callbackUrl,
        token: token  // Token parameter for recurring payment
      };

      // Convert to form-urlencoded format
      const formData = querystring.stringify(postData);

      console.log('remote charge by token');
      console.log(postData);

      // Make POST request to payment form endpoint
      axios.post('https://api-staging.pay.asia/api/paymentform.aspx', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
        .then(response => {
          console.log('remote charge by token return ok');
          console.log(response.data);
          res.status(200).send(response.data);
        })
        .catch(error => {
          console.error(error);
          if (error.response) {
            res.status(error.response.status || 500).send(error.response.data);
          } else {
            res.status(500).send(error.message || 'Error calling GKash charge-by-token API');
          }
        });
    } catch (error) {
      console.error(error);
      res.status(500).send('Error charge by token payment');
    }
  }

  /**
   * Tokenization callback handler - receives epkey (token) from GKash
   *
   * POST /tokenizecallback
   * 
   * Callback data from GKash (form-urlencoded):
   * - CID: Merchant ID
   * - POID: Payment Order ID
   * - status: Payment status (e.g., "88 - Transferred")
   * - description: Payment description (e.g., "00 - Approved")
   * - cartid: Merchant reference number
   * - currency: Currency code (e.g., "MYR")
   * - amount: Payment amount (e.g., "100.00")
   * - signature: GKash signature
   * - PaymentType: Payment type (e.g., "Master Credit")
   * - epkey: The token for recurring payments (THIS IS THE KEY FIELD!)
   *
   * Response: "OK" (HTTP 200)
   *
   * NOTE:
   * - The epkey is the token you should store in your database for future recurring payments
   * - This callback is called by GKash server-to-server after payment completion
   * - Always return "OK" to acknowledge receipt
   */
  async remote_tokenizeCallback(req, res) {
    console.log("tokenizecallback");
    console.log(req.body);

    // Extract callback data
    const vCID = req.body['CID'] ?? "";
    const vPOID = req.body['POID'] ?? "";
    const vCartID = req.body['cartid'] ?? "";
    const vStatus = req.body['status'] ?? "";
    const vCurrency = req.body['currency'] ?? "";
    const vAmount = req.body['amount'] ?? "";
    const vSignature = req.body['signature'] ?? "";
    const vDescription = req.body['description'] ?? "";
    const vPaymentType = req.body['PaymentType'] ?? "";
    const epkey = req.body['epkey'] ?? "";  // THIS IS THE TOKEN!

    console.log('Tokenization callback received:');
    console.log('CID:', vCID);
    console.log('POID:', vPOID);
    console.log('CartID:', vCartID);
    console.log('Status:', vStatus);
    console.log('Currency:', vCurrency);
    console.log('Amount:', vAmount);
    console.log('Description:', vDescription);
    console.log('PaymentType:', vPaymentType);
    console.log('EPKEY (TOKEN):', epkey);

    try {
      // Prepare callback data with timestamp
      const timestamp = new Date().toISOString();
      const callbackData = {
        CID: vCID,
        POID: vPOID,
        cartid: vCartID,
        status: vStatus,
        currency: vCurrency,
        amount: vAmount,
        signature: vSignature,
        description: vDescription,
        PaymentType: vPaymentType,
        epkey: epkey,  // Store the token
        timestamp: timestamp,
        source: 'tokenization_callback'
      };

      // Store callback data in Firestore (use cartid as document ID)
      if (vCartID) {
        await this.writeWithRetry(
          fireStore.collection("gkash_tokenization").doc(vCartID),
          callbackData
        );
        console.log(`Tokenization callback stored for cartid: ${vCartID}`);
        
        // Log the token extraction for visibility
        if (epkey) {
          console.log(`✅ TOKEN EXTRACTED: ${epkey} for cartid: ${vCartID}`);
          console.log('⚠️ IMPORTANT: Store this epkey in your database for future recurring payments!');
        } else {
          console.log('⚠️ WARNING: No epkey (token) found in callback response');
        }
      } else {
        console.log('⚠️ WARNING: No cartid found, cannot store callback data');
      }

      // Always return "OK" to acknowledge receipt (GKash requirement)
      res.status(200).send("OK");
    } catch (error) {
      console.error('Error processing tokenization callback:', error);
      // Even on error, return "OK" to prevent GKash from retrying
      res.status(200).send("OK");
    }
  }

  async remote_tokenizeReturn(req, res) {
    console.log("tokenizereturn");
    console.log(req.body);

    // Extract callback data
    // const vCID = req.body['CID'] ?? "";
    // const vPOID = req.body['POID'] ?? "";
    // const vCartID = req.body['cartid'] ?? "";
    // const vStatus = req.body['status'] ?? "";
    // const vCurrency = req.body['currency'] ?? "";
    // const vAmount = req.body['amount'] ?? "";
    // const vSignature = req.body['signature'] ?? "";
    // const vDescription = req.body['description'] ?? "";
    // const vPaymentType = req.body['PaymentType'] ?? "";
    // const epkey = req.body['epkey'] ?? "";  // THIS IS THE TOKEN!

    // console.log('Tokenization callback received:');
    // console.log('CID:', vCID);
    // console.log('POID:', vPOID);
    // console.log('CartID:', vCartID);
    // console.log('Status:', vStatus);
    // console.log('Currency:', vCurrency);
    // console.log('Amount:', vAmount);
    // console.log('Description:', vDescription);
    // console.log('PaymentType:', vPaymentType);
    // console.log('EPKEY (TOKEN):', epkey);

    try {
      // Prepare callback data with timestamp
      // const timestamp = new Date().toISOString();
      // const callbackData = {
      //   CID: vCID,
      //   POID: vPOID,
      //   cartid: vCartID,
      //   status: vStatus,
      //   currency: vCurrency,
      //   amount: vAmount,
      //   signature: vSignature,
      //   description: vDescription,
      //   PaymentType: vPaymentType,
      //   epkey: epkey,  // Store the token
      //   timestamp: timestamp,
      //   source: 'tokenization_callback'
      // };

      // Store callback data in Firestore (use cartid as document ID)
      // if (vCartID) {
      //   await this.writeWithRetry(
      //     fireStore.collection("gkash_tokenization").doc(vCartID),
      //     callbackData
      //   );
      //   console.log(`Tokenization callback stored for cartid: ${vCartID}`);
        
      //   // Log the token extraction for visibility
      //   if (epkey) {
      //     console.log(`✅ TOKEN EXTRACTED: ${epkey} for cartid: ${vCartID}`);
      //     console.log('⚠️ IMPORTANT: Store this epkey in your database for future recurring payments!');
      //   } else {
      //     console.log('⚠️ WARNING: No epkey (token) found in callback response');
      //   }
      // } else {
      //   console.log('⚠️ WARNING: No cartid found, cannot store callback data');
      // }

      // Always return "OK" to acknowledge receipt (GKash requirement)
      res.status(200).send("OK");
    } catch (error) {
      console.error('Error processing tokenization callback:', error);
      // Even on error, return "OK" to prevent GKash from retrying
      res.status(200).send("OK");
    }
  }

  async remote_cancelPayment(req, res)  {

    // Allow users to specify their own SignatureKey, with fallback to default
    const cSignatureKey = req.body['SignatureKey'] ?? this.cSignatureKey;
    var cTID = this.cTID; // "M102-TD-63070";
    cTID = req.body['TerminalId'] ?? "";
   
    
    const signatureString = `${cSignatureKey};${cTID}`;
    const signatureKey = crypto.createHash('sha512').update(signatureString).digest('hex').toUpperCase();
   

    let data = JSON.stringify({
      // "Amount": cAmount,
      // "Currency": cCurrency,
      // "ReferenceNo": cCartID,
      "TerminalId": cTID,
      // "PaymentType": cPaymentType,
      // "Email": cEmail,
      // "MobileNo": cMobileNo,
      // "PreAuth": false,
      // "CallbackURL": "https://api.foodio.online/gkash/remotecallback",
      // "callbackurl": "https://api.foodio.online/gkash/remotecallback",
      "Signature": signatureKey
    });

    
  
    try {
      // Make the POST request using Axios
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.gkash.my/apim/merchant/SoftPOSCancel',//https://api.gkash.my/apim/merchant/SoftPosPay
        headers: { 
          'Content-Type': 'application/json'
        },
        data : data
      };

      //console.log(postData);

      // Make the POST request using Axios
      axios.request(config)
        .then(response => {
          console.log(`remote cancel payment return ok`);
          console.log(response.data);
          res.status(200).send(response.data);
        })
        .catch(error => {
          // Handle errors
          console.error(error);
          res.status(500).send(error);
        });
  
      //res.send('Payment form submitted!');
    } catch (error) {
      // Handle errors
      console.error(error);
      res.status(500).send('Error cancel payment');
    }

  }


  async remote_Refund(req, res)  {

    
    // Convert v_amount to 2 decimal places and remove commas or decimal points
    //const formattedAmount = (parseFloat(v_amount.replace(/,/g, '')) * 100).toFixed(0);
  
    // Concatenate parameters for signature calculation
    //const timeStamp = Math.floor(Date.now() / 1000).toString();
    const cSignatureKey = this.cSignatureKey; //"qdz7WDajSMaUOzo";
    const cCID = this.cCID; //"M102-U-54392";
    //var cTID = "M102-TD-63070";
    var cCartID = "merchant-reference-1731983297"; //`merchant-reference-${timeStamp}`;
    var cAmount = 1;
    var cCurrency = "MYR";
    var cPaymentType = 1;
    var cEmail = "m.amirul@gkash.com";
    var cMobileNo = "01119312382";
    


    cAmount =  req.body['Amount'] ?? 0;
    cCurrency = req.body['Currency'] ?? "";
    cCartID = req.body['ReferenceNo'] ?? "";
    //cTID = req.body['TerminalId'] ?? "";
    //cPaymentType = req.body['PaymentType'] ?? 0;
    //cEmail = req.body['Email'] ?? "";
    //cMobileNo = req.body['MobileNo'] ?? "";
    
    const formattedAmount = Math.round(parseFloat(cAmount.toString().replace(/,/g, '')) * 100).toString().padStart(3, '0');
    const signatureString = `${cSignatureKey};${cCID};${cCartID};${formattedAmount};${cCurrency}`;
    const signatureKey = crypto.createHash('sha512').update(signatureString.toUpperCase()).digest('hex');
   

    let data = JSON.stringify({
      "version" : "1.3.1",
      "CID" : cCID,
      "cartid": cCartID,
      "currency": cCurrency,
      "amount": String(cAmount),
      "Signature": signatureKey,
      
      // "TerminalId": cTID,
      // "PaymentType": cPaymentType,
      // "Email": cEmail,
      // "MobileNo": cMobileNo,
      // "PreAuth": false,
      // "CallbackURL": "https://api.foodio.online/gkash/remotecallback",
      // "callbackurl": "https://api.foodio.online/gkash/remotecallback",
      
    });

    
  
    try {
      // Make the POST request using Axios
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.gkash.my/api/payment/refund',//https://api.gkash.my/apim/merchant/SoftPosPay
        headers: { 
          'Content-Type': 'application/json'
        },
        data : data
      };

      //console.log(postData);

      // Make the POST request using Axios
      axios.request(config)
        .then(response => {
          console.log(`remote init payment return ok`);
          console.log(response.data);
          res.status(200).send(response.data);
        })
        .catch(error => {
          // Handle errors
          console.error(error);
          res.status(500).send(error);
        });
  
      //res.send('Payment form submitted!');
    } catch (error) {
      // Handle errors
      console.error(error);
      res.status(500).send('Error init payment');
    }

  }

  async remote_paymentResult(req, res){

    const cSignatureKey = this.cSignatureKey; //"qdz7WDajSMaUOzo";
    const cCID = this.cCID; //"M102-U-54392";

    console.log("remotecallback");
    console.log(req.body);
    let vCID =  req.body['CID'] ?? "";
    let vPOID = req.body['POID'] ?? "";
    let vCartID = req.body['cartid'] ?? "";
    let vStatus = req.body['status'] ?? "";
    let vCurrency = req.body['currency'] ?? "";
    let vAmount = req.body['amount'] ?? "";
    let vSignature = req.body['signature'] ?? "";
    let vDescription = req.body['description'] ?? "";
    let vPaymentType = req.body['PaymentType'] ?? "";

    let cAmount = parseFloat(String(vAmount));
    const formattedAmount = Math.round(parseFloat(cAmount.toString().replace(/,/g, '')) * 100).toString().padStart(3, '0');
    const signatureString = `${cSignatureKey};${cCID};${vCartID};${formattedAmount};${vCurrency}`;
    const signatureKey = crypto.createHash('sha512').update(signatureString.toUpperCase()).digest('hex');
   

    let data = JSON.stringify({
      "version" : "1.4.0",
      "CID" : cCID,
      "cartid": vCartID,
      "currency": vCurrency,
      "amount": String(vAmount),
      "Signature": signatureKey,
      
      
    });

    
    try {
      // Make the POST request using Axios
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.gkash.my/api/payment/query',//https://api.gkash.my/apim/merchant/SoftPosPay
        headers: { 
          'Content-Type': 'application/json'
        },
        data : data
      };

      // Make the POST request using Axios
      axios.request(config)
        .then(response => {
          const timestamp = new Date().toISOString();
          let mergedData = {
            ...req.body,
            msgData: response.data,
            errData: "",
            lastUpdated: timestamp
          }

          this.writeWithRetry(fireStore.collection("gkash_kiosk").doc(vCartID), mergedData);
          res.status(200).send("OK");

        })
        .catch(error => {
          // Handle errors
          const timestamp = new Date().toISOString();
          let mergedData = {
            ...req.body,
            msgData: "",
            errData: error,
            lastUpdated: timestamp
          }

          this.writeWithRetry(fireStore.collection("gkash_kiosk").doc(vCartID), mergedData);
          res.status(200).send("OK");
        });
  
      //res.send('Payment form submitted!');
    } catch (error) {
      // Handle errors
      const timestamp = new Date().toISOString();
      let mergedData = {
        ...req.body,
        msgData: "",
        errData: error,
        lastUpdated: timestamp
      }

      this.writeWithRetry(fireStore.collection("gkash_kiosk").doc(vCartID), mergedData);
      res.status(200).send("OK");
    }

    
    
  }

  async  writeWithRetry(docRef,data, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            await docRef.set(data);
            return; // Success
        } catch (error) {
            console.log(`🔄 [RETRY] Attempt ${i + 1}/${retries} failed:`, error.code, error.message);
            
            if (error.code === 'resource-exhausted' && i < retries - 1) {
                const backoffTime = 100; // Fixed 1 second delay
                console.log(`⏳ [RETRY] Waiting ${backoffTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, backoffTime));
            } else {
                console.error(`❌ [RETRY] All retries exhausted or non-retryable error:`, error);
                throw error; // Rethrow if not recoverable
            }
        }
    }
}


async remote_Status(req, res)  {

    
  // Convert v_amount to 2 decimal places and remove commas or decimal points
  //const formattedAmount = (parseFloat(v_amount.replace(/,/g, '')) * 100).toFixed(0);

  // Concatenate parameters for signature calculation
  //const timeStamp = Math.floor(Date.now() / 1000).toString();
  const cSignatureKey = this.cSignatureKey; // "qdz7WDajSMaUOzo";
  const cCID = this.cCID; // "M102-U-54392";
  //var cTID = "M102-TD-63070";
  var cCartID = "merchant-reference-1731983297"; //`merchant-reference-${timeStamp}`;
  var cAmount = 1;
  var cCurrency = "MYR";
  var cPaymentType = 1;
  var cEmail = "m.amirul@gkash.com";
  var cMobileNo = "01119312382";
  


  cAmount =  req.body['Amount'] ?? 0;
  cCurrency = req.body['Currency'] ?? "";
  cCartID = req.body['ReferenceNo'] ?? "";
  //cTID = req.body['TerminalId'] ?? "";
  //cPaymentType = req.body['PaymentType'] ?? 0;
  //cEmail = req.body['Email'] ?? "";
  //cMobileNo = req.body['MobileNo'] ?? "";
  
  const formattedAmount = Math.round(parseFloat(cAmount.toString().replace(/,/g, '')) * 100).toString().padStart(3, '0');
  const signatureString = `${cSignatureKey};${cCID};${cCartID};${formattedAmount};${cCurrency}`;
  const signatureKey = crypto.createHash('sha512').update(signatureString.toUpperCase()).digest('hex');
 

  let data = JSON.stringify({
    "version" : "1.4.0",
    "CID" : cCID,
    "cartid": cCartID,
    "currency": cCurrency,
    "amount": String(cAmount),
    "Signature": signatureKey,
    
    // "TerminalId": cTID,
    // "PaymentType": cPaymentType,
    // "Email": cEmail,
    // "MobileNo": cMobileNo,
    // "PreAuth": false,
    // "CallbackURL": "https://api.foodio.online/gkash/remotecallback",
    // "callbackurl": "https://api.foodio.online/gkash/remotecallback",
    
  });

  

  try {
    // Make the POST request using Axios
    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://api.gkash.my/api/payment/query',//https://api.gkash.my/apim/merchant/SoftPosPay
      headers: { 
        'Content-Type': 'application/json'
      },
      data : data
    };

    //console.log(postData);

    // Make the POST request using Axios
    axios.request(config)
      .then(response => {
        console.log(`remote init payment return ok`);
        console.log(response.data);
        res.status(200).send(response.data);
      })
      .catch(error => {
        // Handle errors
        console.error(error);
        res.status(500).send(error);
      });

    //res.send('Payment form submitted!');
  } catch (error) {
    // Handle errors
    console.error(error);
    res.status(500).send('Error init payment');
  }

}



async remote_getQRCallBack(req,res)
{
  console.log("remote_getQRCallBack");

  console.log(req.body);
  var cCartID = req.body['cartid'] ?? "test";
  console.log("cartid:" + cCartID);
  this.writeWithRetry(fireStore.collection("gkash_qr").doc(cCartID), req.body);
  console.log("remote_getQRCallBack write ok ");
  res.status(200).send("OK");
}

async remote_getQR(req,res)
{
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  var cSignatureKey = this.cSignatureKey; // "qdz7WDajSMaUOzo";
  var cCID = this.cCID; // "M102-U-54392";
  var cTID =  this.cTID; //"M102-TD-63070";
  var cCartID = `merchant-reference-${timeStamp}`;
  var cAmount = 1;
  var cCurrency = "MYR";
  var cPaymentId = 95;
  var cEmail = "m.amirul@gkash.com";
  var cMobileNo = "01119312382";
  
   cAmount =  req.body['Amount'] ?? 0;
  // cCurrency = req.body['Currency'] ?? "";
   cCartID = req.body['ReferenceNo'] ?? "";
   cTID = req.body['TerminalId'] ?? "";
   cPaymentId = req.body['PaymentId'] ?? 0;
   if (req.body['CID']) {
     cCID = req.body['CID'];
   }
   if (req.body['Signature']) {
     cSignatureKey = req.body['Signature'];
   }
  // cEmail = req.body['Email'] ?? "";
  // cMobileNo = req.body['MobileNo'] ?? "";
  
  const formattedAmount = Math.round(parseFloat(cAmount.toString().replace(/,/g, '')) * 100).toString().padStart(3, '0');
  const signatureString = `${cSignatureKey};${cCID};${cCartID};${formattedAmount};${cCurrency}`;

  //console.log(signatureString);
  //const signatureString = "SIGNATUREKEY9999;M161-U-999;MERCHANT-REFERENCE-712893;10000;MYR";
  const signatureKey = crypto.createHash('sha512').update(signatureString.toUpperCase()).digest('hex');
  
  //console.log("signature key");
  //console.log(signatureKey);
  

  let data = {
    "version" : "1.5.5",
    "CID" : cCID,
    "v_currency" : cCurrency,
    "v_amount" :  String(cAmount),
    "v_cartid" : cCartID,
    "signature" : signatureKey,
    "paymentid" : cPaymentId,
    "terminalID" : cTID,
    "callbackurl" : "https://api.foodio.online/gkash/remotegetqrcallback"
    
    // "Amount": cAmount,
    // "Currency": cCurrency,
    // "ReferenceNo": cCartID,
    // "TerminalId": cTID,
    // "PaymentType": cPaymentType,
    // "Email": cEmail,
    // "MobileNo": cMobileNo,
    // "PreAuth": false,
    // "CallbackURL": "https://api.foodio.online/gkash/remotecallback",
    // "callbackurl": "https://api.foodio.online/gkash/remotecallback",
    // "Signature": signatureKey
  };

  console.log("remote_getQR data:" + cCartID + " payment id " + cPaymentId + " amount " + String(cAmount) + " currency " + cCurrency) + " terminal id " + cTID;
  console.log(data);

  try {
    // Make the POST request using Axios
    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://api.gkash.my/api/payment/submit',//https://api.gkash.my/apim/merchant/SoftPosPay
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data : data
    };

    //console.log(postData);

    // Make the POST request using Axios
    axios.request(config)
      .then(response => {
        console.log(`remote_getQR data return ok`);
        console.log("remote_getQR data return ok:" + cCartID + " payment id " + cPaymentId + " amount " + String(cAmount) + " currency " + cCurrency) + " terminal id " + cTID;
        console.log(response.data);
        res.status(200).send(response.data);
      })
      .catch(error => {
        // Handle errors
        console.log(`remote_getQR data return error`);
        console.log("remote_getQR data return error:" + cCartID + " payment id " + cPaymentId + " amount " + String(cAmount) + " currency " + cCurrency) + " terminal id " + cTID;
        console.error(error);
        res.status(500).send(error);
      });

    //res.send('Payment form submitted!');
  } catch (error) {
    // Handle errors
    console.log(`remote_getQR data return exception`);
    console.log("remote_getQR data return exception:" + cCartID + " payment id " + cPaymentId + " amount " + String(cAmount) + " currency " + cCurrency) + " terminal id " + cTID;
    console.error(error);
    res.status(500).send('Error init payment');
  }
}


  //ONE WAY SMS OTP related
  /**
   * Verifies the OTP verification token sent from the frontend
   * @param {string} phoneNumber - The phone number from the request
   * @param {string} verificationToken - The verification token from the request
   * @returns {boolean} - True if token is valid, false otherwise
   */
  verifyOtpToken(phoneNumber, verificationToken) {
    try {
      // IMPORTANT: This should match the public key used in Flutter app (constants.dart)
      const OTP_VERIFICATION_SECRET_KEY = '6LdjBzcsAAAAAEMQwYSw6sd2ThtZG5EQxtD9OSHa';
      
      // Generate the expected token using the same method as frontend
      // HMAC-SHA256 of phoneNumber using secret key
      const key = Buffer.from(OTP_VERIFICATION_SECRET_KEY, 'utf8');
      const message = Buffer.from(phoneNumber, 'utf8');
      
      // Generate HMAC-SHA256
      const hmac = crypto.createHmac('sha256', key);
      hmac.update(message);
      const digest = hmac.digest();
      
      // Encode to base64 (same as frontend)
      const expectedToken = digest.toString('base64');
      
      // Compare tokens (use timing-safe comparison to prevent timing attacks)
      return crypto.timingSafeEqual(
        Buffer.from(verificationToken, 'base64'),
        Buffer.from(expectedToken, 'base64')
      );
    } catch (error) {
      console.error('❌ [OTP TOKEN] Error verifying OTP token:', error);
      return false;
    }
  }

  async handleSendONEOTP(req, res) {
    const phoneNumber = req.body.phonenumber;
    const verificationToken = req.body.verification_token;
    
    // Print verification_token if received
    if (verificationToken) {
      console.log('🔑 [OTP TOKEN] Received verification_token:', verificationToken);
    } else {
      console.log('⚠️ [OTP TOKEN] No verification_token provided in request');
    }
    
    if (!phoneNumber) {
      res.status(400).json({ 
        otp: "",
        message: 'Phone number is required.' 
      });
      return;
    }
    
    // Verify OTP token if provided
    if (verificationToken) {
      const isValidToken = this.verifyOtpToken(phoneNumber, verificationToken);
      console.log('🔑 [OTP TOKEN] Token verification result:', isValidToken ? 'VALID' : 'INVALID');
      
      if (!isValidToken) {
        console.log('❌ [OTP TOKEN] Invalid verification token - rejecting request');
        res.status(401).json({ 
          otp: "",
          message: 'Invalid verification token.' 
        });
        return;
      }
      console.log('✅ [OTP TOKEN] Verification token is valid');
    } else {
      console.log('⚠️ [OTP TOKEN] No verification token provided - skipping token verification');
    }
  
    try {
      const message = await this.sendONEOTP(phoneNumber);
      res.status(200).json(message);
    } catch (error) {
      console.error("Error in /send-one-otp route:", error);
      res.status(500).json({ 
        otp: "",
        message: 'Failed to send OTP.' 
      });
    }
  }

async sendONEOTP(phoneNumber) {
  const otpDocRef = fireStore.collection("otp").doc(phoneNumber);

  try {
    const doc = await otpDocRef.get();

    if (doc.exists) {
      const lastRequestTime = doc.data().lastRequestTime;
      const now = Date.now();
      const diffInSeconds = (now - lastRequestTime) / 1000;

      if (diffInSeconds < 600) {
        const timeLeft = Math.round(600 - diffInSeconds);
        return {
          otp: doc.data().otp,
          timeleft : timeLeft,
          message: ""//`Please wait ${timeLeft} seconds before requesting another OTP.`
        };
      }
    }

    // Generate OTP
    const otp = this.generateOTP();

    // Clean phone number by removing '+' and '-'
    const cleanPhoneNumber = phoneNumber.replace(/[\+\-]/g, '');

    // Construct the API URL
    const apiUrl = `https://wba-api.onewaysms.com/api.aspx?apiusername=APIQBJEZYRS&apipassword=APIQBJEZYRSQBJE&mobile=${cleanPhoneNumber}&message=*T1795|${otp}`;

    // Make the GET request using Axios
    const response = await axios.get(apiUrl, {
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });

    console.log('OneWay SMS API Response:', response.data);

    // Update Firestore with the last request timestamp
    await otpDocRef.set({ otp: otp, lastRequestTime: Date.now() });

    return {
      otp: otp,
      timeleft : 600,
      message: ""
    };

  } catch (error) {
    console.error("Error sending OTP:", error);
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
      console.error("Response headers:", error.response.headers);
    }
    return {
      otp: "",
      timeleft : 600,
      message: `Failed to send OTP. Please try again later. ${error}`
    };
  }
}




  //OTP related
  async handleSendOTP(req, res) {
    const phoneNumber = req.body.phonenumber;
    if (!phoneNumber) {
      res.status(400).json({ 
        otp: "",
        message: 'Phone number is required.' 
    });
        return;
    }

    try {
        const message = await this.sendOTP(phoneNumber); // Call the sendOTP function
        res.status(200).json(message);
    } catch (error) {
        console.error("Error in /send-otp route:", error);
        res.status(500).json({ 
          otp: "",
          message: 'Failed to send OTP.' 
      });
    }
  }

   generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }


  async sendOTP(phoneNumber) {
    const otpDocRef = fireStore.collection("otp").doc(phoneNumber);

    try {
        const doc = await otpDocRef.get();

        if (doc.exists) {
          const lastRequestTime = doc.data().lastRequestTime; // Now a number
          const now = Date.now(); // Milliseconds since epoch
          const diffInSeconds = (now - lastRequestTime) / 1000;

          if (diffInSeconds < 600) {
              const timeLeft = Math.round(600 - diffInSeconds); // Round for cleaner output
              return {
                otp: "",
                message: `Please wait ${timeLeft} seconds before requesting another OTP.`
            };
          }
        }

        // Generate OTP
        const otp = this.generateOTP();

        // Construct the API request payload (replace placeholders)
        let data = JSON.stringify({
            "messages": [
                {
                    "from": "447860099299", // Replace with your sender number
                    "to": phoneNumber,
                    "messageId": `otp-${Date.now()}`, // Unique message ID
                    "content": {
                        "templateName": "authentication",
                        "templateData": {
                            "body": {
                                "placeholders": [otp]
                            },
                            "buttons": [
                                {
                                    "type": "URL",
                                    "parameter": otp //  This seems odd; usually, buttons are for links, not the OTP itself.  Consider removing.
                                }
                            ]
                        },
                        "language": "en"
                    }
                }
            ]
        });

        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://qd4n62.api-id.infobip.com/whatsapp/1/message/template', // Replace with your base URL
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'App 420d3752f374403be10ae9a6c54c85e1-307bbebd-5fd6-4669-9999-800a4f04a03f' // Replace with your authorization token
            },
            data: data,
            httpsAgent: new https.Agent({
              rejectUnauthorized: false // Disable certificate validation
          })
        };

        const response = await axios.request(config);
        console.log(JSON.stringify(response.data));

        // Update Firestore with the last request timestamp
        await otpDocRef.set({ otp: otp, lastRequestTime: Date.now()  });

        return {
          otp: otp,
          message: ""
      };//`OTP sent successfully to ${phoneNumber}.`;

    } catch (error) {
        console.error("Error sending OTP:", error);
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          console.error("Response data:", error.response.data);
          console.error("Response status:", error.response.status);
          console.error("Response headers:", error.response.headers);
        }
        return {
          otp: "",
          message: `Failed to send OTP. Please try again later. ${error}`
      };
    }
}



//Example
async testSendOTP() 
{
    const result = await sendOTP("1234567890"); // Replace with a real phone number
    console.log(result);
}


  createStore(req, res){
   
      // Validate the request body
      if (!req.body) {
              res.status(400).json({ error: 'Request body is missing or empty' });
              return;
      }

      const requiredFields = ['email', 'password', 'mobile_number', 'title', 'address', 'cid', 'tid', 'signature'];
      for (const field of requiredFields) {
              if (!(field in req.body)) {
                  res.status(400).json({ error: `Missing required field: ${field}` });
                  return;
              }
      }

      try{

         const { email, password, mobile_number, title, address, cid, tid, signature } = req.body;

         res.status(200).json({ message: title + " created" });
      }
      catch(ex)
      {
          console.log(ex);
          res.status(401).json({ error: ex });
      }

  }

  async paymentCRMSimpleReturn (req, res){

    const dateTime = new UtilDateTime();
    
     // Parse the query parameters
    const parsedUrl = url.parse(req.url);
    const queryParams = querystring.parse(parsedUrl.query);

    // Access individual parameters
    const storeId = queryParams.STOREID || 'defaultStore'; 
    console.log("storeid:" + storeId);

      
    let vCID =  req.body['CID'] ?? "";
    let vPOID = req.body['POID'] ?? "";
    let vCartID = req.body['cartid'] ?? "";
    let vStatus = req.body['status'] ?? "";
    let vCurrency = req.body['currency'] ?? "";
    let vAmount = req.body['amount'] ?? "";
    let vSignature = req.body['signature'] ?? "";
    let vDescription = req.body['description'] ?? "";
    let vPaymentType = req.body['PaymentType'] ?? "";

    console.log('vCID:', vCID);
    console.log('vPOID:', vPOID);
    console.log('vCartID:', vCartID);
    console.log('vStatus:', vStatus);
    console.log('vCurrency:', vCurrency);
    console.log('vAmount:', vAmount);
    console.log('vSignature:', vSignature);
    console.log('vDescription:', vDescription);
    console.log('vPaymentType:', vPaymentType);


    
    // writeGKashTransaction(storeId, dateTime.getCurrentDateString(),
    //   {
    //     CID: vCID,
    //     POID: vPOID,
    //     CARTID : vCartID,
    //     STATUS: vStatus,
    //     CURRENCY: vCurrency,
    //     AMOUNT: vAmount,
    //     SIGNATURE: vSignature,
    //     DESC: vDescription,
    //     PAYMENT_TYPE : vPaymentType
    //    }

    //   );

      // const urlSuccessHeader = "https://foodio-online-cloud9.web.app/#/crmsuccess/" + "online" + "/" + vCartID + "/" ;
      // const urlFailHeader = "https://foodio-online-cloud9.web.app/#/crmfailed/" + "online" + "/" + vCartID + "/" ;
      // var redirectTo = urlSuccessHeader;

      // if(vStatus.includes("88") == false)
      // {
      //   redirectTo = urlFailHeader;
      //   res.redirect(redirectTo);
      //   return;
      // }
  
      const storeResult = await this.getStoreFromVCID(vCartID,{
        CID: vCID,
        POID: vPOID,
        CARTID : vCartID,
        STATUS: vStatus,
        CURRENCY: vCurrency,
        AMOUNT: vAmount,
        SIGNATURE: vSignature,
        DESC: vDescription,
        PAYMENT_TYPE : vPaymentType
       });

      //  if (storeResult.status !== 'success') {
      //   console.error(`Error fetching store or store not found: ${storeResult.status}`);
      //   // Redirect to a generic error page, or a specific "store not found" page.
      //   redirectTo = urlFailHeader;
      // }
     console.log(storeResult);
      res.json(storeResult);

      // const urlSuccessHeader = "https://foodio-online-cloud9.web.app/#/crmsuccess/" + storeId + "/" + vCartID + "/" ;
      // const urlFailHeader = "https://foodio-online-cloud9.web.app/#/crmfailed/" + storeId + "/" + vCartID + "/" ;
      // var redirectTo = urlSuccessHeader;
  
      // if(vStatus.includes("88") == false)
      // {
      //   redirectTo = urlFailHeader;
      // }

      // // Perform the redirect
      // res.redirect(redirectTo); 

      //console.log("payment crm redirected with status " + vStatus);
      //console.log("payment crm redirected to " + redirectTo);
  }

  /**
   * Get the base URL for a given version
   * @param {string} version - Version identifier (ab3b2, code8, cloud9, best10, market)
   * @param {boolean} isBeta - Whether this is a beta endpoint
   * @returns {string} Base URL for the version
   */
  getVersionBaseUrl(version, isBeta) {
    // If version is specified, use it
    if (version) {
      const versionMap = {
        'ab3b2': 'foodio-online-ab3b2.web.app',
        'code8': 'foodio-online-code8.web.app',
        'cloud9': 'foodio-online-cloud9.web.app',
        'best10': 'foodio-online-best10.web.app',
        'market': 'foodio-market.web.app'
      };
      
      const baseUrl = versionMap[version.toLowerCase()];
      if (baseUrl) {
        return `https://${baseUrl}`;
      }
    }
    
    // Default behavior: best10 for non-beta, cloud9 for beta
    if (isBeta) {
      return 'https://foodio-online-cloud9.web.app';
    } else {
      return 'https://foodio-online-best10.web.app';
    }
  }

  async paymentCoinReturn (req, res, isBeta, version){

    const dateTime = new UtilDateTime();
    
     // Parse the query parameters
    const parsedUrl = url.parse(req.url);
    const queryParams = querystring.parse(parsedUrl.query);

    // Access individual parameters
    const storeId = queryParams.STOREID || 'defaultStore'; 
    // Extract version from query params or body if not provided as parameter
    const versionParam = version || queryParams.version || req.body.version || undefined;
    console.log("storeid:" + storeId);

      
    let vCID =  req.body['CID'] ?? "";
    let vPOID = req.body['POID'] ?? "";
    let vCartID = req.body['cartid'] ?? "";
    let vStatus = req.body['status'] ?? "";
    let vCurrency = req.body['currency'] ?? "";
    let vAmount = req.body['amount'] ?? "";
    let vSignature = req.body['signature'] ?? "";
    let vDescription = req.body['description'] ?? "";
    let vPaymentType = req.body['PaymentType'] ?? "";

    console.log('vCID:', vCID);
    console.log('vPOID:', vPOID);
    console.log('vCartID:', vCartID);
    console.log('vStatus:', vStatus);
    console.log('vCurrency:', vCurrency);
    console.log('vAmount:', vAmount);
    console.log('vSignature:', vSignature);
    console.log('vDescription:', vDescription);
    console.log('vPaymentType:', vPaymentType);

    // Write GKash transaction log
    writeGKashTransaction(storeId, dateTime.getCurrentDateString(),
      {
        CID: vCID,
        POID: vPOID,
        CARTID : vCartID,
        STATUS: vStatus,
        CURRENCY: vCurrency,
        AMOUNT: vAmount,
        SIGNATURE: vSignature,
        DESC: vDescription,
        PAYMENT_TYPE : vPaymentType
       }
    );

    // Setup redirect URLs
    const baseUrl = this.getVersionBaseUrl(versionParam, isBeta);
    var urlSuccessHeader = baseUrl + "/#/coinsuccess/" + storeId + "/" + vCartID + "/" ;
    var urlFailHeader = baseUrl + "/#/coinfailed/" + storeId + "/" + vCartID + "/" ;

    var redirectTo = urlSuccessHeader;

    // Check if payment was successful
    if(vStatus.includes("88") == false) {
      redirectTo = urlFailHeader;
      res.redirect(redirectTo);
      console.log("payment failed, redirected with status " + vStatus);
      console.log("payment redirected to " + redirectTo);
      return;
    }

    // Payment was successful, process the order transaction
    try {
      console.log("Payment successful, processing order transaction...");
      
      const gkashResult = {
        CID: vCID,
        POID: vPOID,
        CARTID : vCartID,
        STATUS: vStatus,
        CURRENCY: vCurrency,
        AMOUNT: vAmount,
        SIGNATURE: vSignature,
        DESC: vDescription,
        PAYMENT_TYPE : vPaymentType
      };

      // Process the order transaction using the new method with CRM-specific options
      if(true)
      {
        const crmOptions = {
          enablePrinting: false,        // Enable receipt printing
          enablePickingList: false,     // Generate picking lists
          enableFullProcessing: true,  // Enable all processing features
          deleteOrderTemp: false       // Keep order_temp for debugging
        };
        
        const result = await this.processOrderTransaction(storeId, vCartID, gkashResult, crmOptions, 'COIN');
        
        if (result.status === 'success') {
          console.log("Order transaction processed successfully:", result.message);
          // Redirect to success page
          res.redirect(redirectTo);
          console.log("payment and order processing successful, redirected with status " + vStatus);
          console.log("redirected to " + redirectTo);
        } else {
          console.error("Order transaction failed:", result.error);
          // Redirect to failed page since order processing failed
          res.redirect(urlFailHeader);
          console.log("payment successful but order processing failed, redirected to failed page");
          console.log("redirected to " + urlFailHeader);
        }
      }
      else
      {
        res.redirect(redirectTo);
        console.log("payment and order processing successful, redirected with status " + vStatus);
        console.log("redirected to " + redirectTo);
      }

    } catch (error) {
      console.error("Error processing order transaction:", error);
      // Redirect to failed page since order processing failed
      res.redirect(urlFailHeader);
      console.log("payment successful but order processing error, redirected to failed page");
      console.log("redirected to " + urlFailHeader);
    }
  }

  async paymentCRMReturn (req, res, isBeta, version){

    const dateTime = new UtilDateTime();
    
     // Parse the query parameters
    const parsedUrl = url.parse(req.url);
    const queryParams = querystring.parse(parsedUrl.query);

    // Access individual parameters
    const storeId = queryParams.STOREID || 'defaultStore'; 
    // Extract version from query params or body if not provided as parameter
    const versionParam = version || queryParams.version || req.body.version || undefined;
    console.log("storeid:" + storeId);

      
    let vCID =  req.body['CID'] ?? "";
    let vPOID = req.body['POID'] ?? "";
    let vCartID = req.body['cartid'] ?? "";
    let vStatus = req.body['status'] ?? "";
    let vCurrency = req.body['currency'] ?? "";
    let vAmount = req.body['amount'] ?? "";
    let vSignature = req.body['signature'] ?? "";
    let vDescription = req.body['description'] ?? "";
    let vPaymentType = req.body['PaymentType'] ?? "";

    console.log('vCID:', vCID);
    console.log('vPOID:', vPOID);
    console.log('vCartID:', vCartID);
    console.log('vStatus:', vStatus);
    console.log('vCurrency:', vCurrency);
    console.log('vAmount:', vAmount);
    console.log('vSignature:', vSignature);
    console.log('vDescription:', vDescription);
    console.log('vPaymentType:', vPaymentType);

    // Write GKash transaction log
    writeGKashTransaction(storeId, dateTime.getCurrentDateString(),
      {
        CID: vCID,
        POID: vPOID,
        CARTID : vCartID,
        STATUS: vStatus,
        CURRENCY: vCurrency,
        AMOUNT: vAmount,
        SIGNATURE: vSignature,
        DESC: vDescription,
        PAYMENT_TYPE : vPaymentType
       }
    );

    // Setup redirect URLs
    const baseUrl = this.getVersionBaseUrl(versionParam, isBeta);
    var urlSuccessHeader = baseUrl + "/#/crmsuccess/" + storeId + "/" + vCartID + "/" ;
    var urlFailHeader = baseUrl + "/#/crmfailed/" + storeId + "/" + vCartID + "/" ;

    var redirectTo = urlSuccessHeader;

    // Check if payment was successful
    if(vStatus.includes("88") == false) {
      redirectTo = urlFailHeader;
      res.redirect(redirectTo);
      console.log("payment failed, redirected with status " + vStatus);
      console.log("payment redirected to " + redirectTo);
      return;
    }

    // Payment was successful, process the order transaction
    try {
      console.log("Payment successful, processing order transaction...");
      
      const gkashResult = {
        CID: vCID,
        POID: vPOID,
        CARTID : vCartID,
        STATUS: vStatus,
        CURRENCY: vCurrency,
        AMOUNT: vAmount,
        SIGNATURE: vSignature,
        DESC: vDescription,
        PAYMENT_TYPE : vPaymentType
      };

      // Process the order transaction using the new method with CRM-specific options
      if(true)
      {
        const crmOptions = {
          enablePrinting: false,        // Enable receipt printing
          enablePickingList: false,     // Generate picking lists
          enableFullProcessing: true,  // Enable all processing features
          deleteOrderTemp: false       // Keep order_temp for debugging
        };
        
        const result = await this.processOrderTransaction(storeId, vCartID, gkashResult, crmOptions, 'CRM');
        
        if (result.status === 'success') {
          console.log("Order transaction processed successfully:", result.message);
          // Redirect to success page
          res.redirect(redirectTo);
          console.log("payment and order processing successful, redirected with status " + vStatus);
          console.log("redirected to " + redirectTo);
        } else {
          console.error("Order transaction failed:", result.error);
          // Redirect to failed page since order processing failed
          res.redirect(urlFailHeader);
          console.log("payment successful but order processing failed, redirected to failed page");
          console.log("redirected to " + urlFailHeader);
        }
      }
      else
      {
        res.redirect(redirectTo);
        console.log("payment and order processing successful, redirected with status " + vStatus);
        console.log("redirected to " + redirectTo);
      }

    } catch (error) {
      console.error("Error processing order transaction:", error);
      // Redirect to failed page since order processing failed
      res.redirect(urlFailHeader);
      console.log("payment successful but order processing error, redirected to failed page");
      console.log("redirected to " + urlFailHeader);
    }
  }


  async paymentTBReturn (req, res, isBeta, version){
  const dateTime = new UtilDateTime();
    // const {
    //   CID,
    //   POID,
    //   status,
    //   cartid,
    //   currency,
    //   amount,
    //   signature,
    //   description,
    //   PaymentType,
    // } = req.body;
    // let refId =  req.body['CID'] ?? "";
    // console.log("**** payment return called: req");
    // console.log(refId);
    // console.log("**** payment return called: res");
    // console.log(res);
     // res.send("***payment return called");

     // Parse the query parameters
    const parsedUrl = url.parse(req.url);
    const queryParams = querystring.parse(parsedUrl.query);

    // Access individual parameters
    const storeId = queryParams.STOREID || 'defaultStore';
    // Extract version from query params or body if not provided as parameter
    const versionParam = version || queryParams.version || req.body.version || undefined;
    console.log("storeid:" + storeId);


    let vCID =  req.body['CID'] ?? "";
    let vPOID = req.body['POID'] ?? "";
    let vCartID = req.body['cartid'] ?? "";
    let vStatus = req.body['status'] ?? "";
    let vCurrency = req.body['currency'] ?? "";
    let vAmount = req.body['amount'] ?? "";
    let vSignature = req.body['signature'] ?? "";
    let vDescription = req.body['description'] ?? "";
    let vPaymentType = req.body['PaymentType'] ?? "";

    console.log("paymentTBReturn return called");
    console.log('vCID:', vCID);
    console.log('vPOID:', vPOID);
    console.log('vCartID:', vCartID);
    console.log('vStatus:', vStatus);
    console.log('vCurrency:', vCurrency);
    console.log('vAmount:', vAmount);
    console.log('vSignature:', vSignature);
    console.log('vDescription:', vDescription);
    console.log('vPaymentType:', vPaymentType);



    writeGKashTransaction(storeId, dateTime.getCurrentDateString(),
      {
        CID: vCID,
        POID: vPOID,
        CARTID : vCartID,
        STATUS: vStatus,
        CURRENCY: vCurrency,
        AMOUNT: vAmount,
        SIGNATURE: vSignature,
        DESC: vDescription,
        PAYMENT_TYPE : vPaymentType
       }

      );


      const baseUrl = this.getVersionBaseUrl(versionParam, isBeta);
      var urlSuccessHeader = baseUrl + "/#/tbsuccess/" + storeId + "/" + vCartID + "/" ;
      var urlFailHeader = baseUrl + "/#/tbfailed/" + storeId + "/" + vCartID + "/" ;
      var redirectTo = urlSuccessHeader;

    // Check if payment was successful
    if(vStatus.includes("88") == false) {
      redirectTo = urlFailHeader;
      res.redirect(redirectTo);
      console.log("payment failed, redirected with status " + vStatus);
      console.log("payment redirected to " + redirectTo);
      return;
    }

    // Payment was successful, process the order transaction
    try {
      console.log("VM Payment successful, processing order transaction...");
      
      const gkashResult = {
        CID: vCID,
        POID: vPOID,
        CARTID : vCartID,
        STATUS: vStatus,
        CURRENCY: vCurrency,
        AMOUNT: vAmount,
        SIGNATURE: vSignature,
        DESC: vDescription,
        PAYMENT_TYPE : vPaymentType
      };

      // Process the order transaction using the new method with VM-specific options
      if(true)
      {
                 const vmOptions = {
           enablePrinting: false,       // Disable receipt printing for vending
           enablePickingList: false,    // Disable picking lists for vending
           enableFullProcessing: true,  // Enable all processing features
           deleteOrderTemp: false        // Clean up order_temp after processing
         };
        
        const result = await this.processOrderTransaction(storeId, vCartID, gkashResult, vmOptions, 'TB');
        
        if (result.status === 'success') {
          console.log("VM Order transaction processed successfully:", result.message);
          // Redirect to success page
          res.redirect(redirectTo);
          console.log("VM payment and order processing successful, redirected with status " + vStatus);
          console.log("VM redirected to " + redirectTo);
        } else {
          console.error("VM Order transaction failed:", result.error);
          // Redirect to failed page since order processing failed
          res.redirect(urlFailHeader);
          console.log("VM payment successful but order processing failed, redirected to failed page");
          console.log("VM redirected to " + urlFailHeader);
        }
      }
      else
      {
        res.redirect(redirectTo);
        console.log("VM payment and order processing successful, redirected with status " + vStatus);
        console.log("VM redirected to " + redirectTo);
      }

    } catch (error) {
      console.error("VM Error processing order transaction:", error);
      // Redirect to failed page since order processing failed
      res.redirect(urlFailHeader);
      console.log("VM payment successful but order processing error, redirected to failed page");
      console.log("VM redirected to " + urlFailHeader);
    }

  }

 async paymentVMReturn (req, res, isBeta, version){
  const dateTime = new UtilDateTime();
    // const {
    //   CID,
    //   POID,
    //   status,
    //   cartid,
    //   currency,
    //   amount,
    //   signature,
    //   description,
    //   PaymentType,
    // } = req.body;
    // let refId =  req.body['CID'] ?? "";
    // console.log("**** payment return called: req");
    // console.log(refId);
    // console.log("**** payment return called: res");
    // console.log(res);
     // res.send("***payment return called");

     // Parse the query parameters
    const parsedUrl = url.parse(req.url);
    const queryParams = querystring.parse(parsedUrl.query);

    // Access individual parameters
    const storeId = queryParams.STOREID || 'defaultStore';
    // Extract version from query params or body if not provided as parameter
    const versionParam = version || queryParams.version || req.body.version || undefined;
    console.log("storeid:" + storeId);


    let vCID =  req.body['CID'] ?? "";
    let vPOID = req.body['POID'] ?? "";
    let vCartID = req.body['cartid'] ?? "";
    let vStatus = req.body['status'] ?? "";
    let vCurrency = req.body['currency'] ?? "";
    let vAmount = req.body['amount'] ?? "";
    let vSignature = req.body['signature'] ?? "";
    let vDescription = req.body['description'] ?? "";
    let vPaymentType = req.body['PaymentType'] ?? "";

    console.log('vCID:', vCID);
    console.log('vPOID:', vPOID);
    console.log('vCartID:', vCartID);
    console.log('vStatus:', vStatus);
    console.log('vCurrency:', vCurrency);
    console.log('vAmount:', vAmount);
    console.log('vSignature:', vSignature);
    console.log('vDescription:', vDescription);
    console.log('vPaymentType:', vPaymentType);



    writeGKashTransaction(storeId, dateTime.getCurrentDateString(),
      {
        CID: vCID,
        POID: vPOID,
        CARTID : vCartID,
        STATUS: vStatus,
        CURRENCY: vCurrency,
        AMOUNT: vAmount,
        SIGNATURE: vSignature,
        DESC: vDescription,
        PAYMENT_TYPE : vPaymentType
       }

      );


      const baseUrl = this.getVersionBaseUrl(versionParam, isBeta);
      var urlSuccessHeader = baseUrl + "/#/success/" + storeId + "/" + vCartID + "/" ;
      var urlFailHeader = baseUrl + "/#/failed/" + storeId + "/" + vCartID + "/" ;
      var redirectTo = urlSuccessHeader;

    // Check if payment was successful
    if(vStatus.includes("88") == false) {
      redirectTo = urlFailHeader;
      res.redirect(redirectTo);
      console.log("payment failed, redirected with status " + vStatus);
      console.log("payment redirected to " + redirectTo);
      return;
    }

    // Payment was successful, process the order transaction
    try {
      console.log("VM Payment successful, processing order transaction...");
      
      const gkashResult = {
        CID: vCID,
        POID: vPOID,
        CARTID : vCartID,
        STATUS: vStatus,
        CURRENCY: vCurrency,
        AMOUNT: vAmount,
        SIGNATURE: vSignature,
        DESC: vDescription,
        PAYMENT_TYPE : vPaymentType
      };

      // Process the order transaction using the new method with VM-specific options
      if(true)
      {
                 const vmOptions = {
           enablePrinting: false,       // Disable receipt printing for vending
           enablePickingList: false,    // Disable picking lists for vending
           enableFullProcessing: true,  // Enable all processing features
           deleteOrderTemp: false        // Clean up order_temp after processing
         };
        
        const result = await this.processOrderTransaction(storeId, vCartID, gkashResult, vmOptions, 'VM');
        
        if (result.status === 'success') {
          console.log("VM Order transaction processed successfully:", result.message);
          // Redirect to success page
          res.redirect(redirectTo);
          console.log("VM payment and order processing successful, redirected with status " + vStatus);
          console.log("VM redirected to " + redirectTo);
        } else {
          console.error("VM Order transaction failed:", result.error);
          // Redirect to failed page since order processing failed
          res.redirect(urlFailHeader);
          console.log("VM payment successful but order processing failed, redirected to failed page");
          console.log("VM redirected to " + urlFailHeader);
        }
      }
      else
      {
        res.redirect(redirectTo);
        console.log("VM payment and order processing successful, redirected with status " + vStatus);
        console.log("VM redirected to " + redirectTo);
      }

    } catch (error) {
      console.error("VM Error processing order transaction:", error);
      // Redirect to failed page since order processing failed
      res.redirect(urlFailHeader);
      console.log("VM payment successful but order processing error, redirected to failed page");
      console.log("VM redirected to " + urlFailHeader);
    }

  }

  async processOrderTransaction(storeId, orderId, gkashResult, options = {}, caller = 'UNKNOWN') {
    const dateTime = new UtilDateTime();
    
    // Process options with defaults
    const {
      enablePrinting = false,        // Whether to enable receipt printing
      enablePickingList = false,     // Whether to generate picking lists
      enableFullProcessing = true,  // Whether to enable all processing features
      deleteOrderTemp = false       // Whether to delete order_temp after processing
    } = options;

    let isCOIN = (caller === "COIN");
    
    try {
      console.log('🚀 [DEBUG] Starting processOrderTransaction for storeId:', storeId, 'orderId:', orderId);
      console.log('🚀 [DEBUG] Caller:', caller);
      console.log('🚀 [DEBUG] Options:', JSON.stringify(options));
      console.log('🚀 [DEBUG] GKash Result:', JSON.stringify(gkashResult));

      // Step 1: Load store data
      console.log('📦 [DEBUG] Step 1: Loading store data...');
      const storeResult = await fireStore.collection('store').doc(storeId).get();
      if (!storeResult.exists) {
        console.log('❌ [DEBUG] Store not found:', storeId);
        return { id: "", status: 'store_not_found', error: "store not found" };
      }
      const currentStoreModel = this.convertToStoreModel(storeResult);
      console.log('✅ [DEBUG] Step 1 Complete: Store loaded -', currentStoreModel.title || storeId);

      // Step 2: Load order data with retry logic (similar to Dart version)
      console.log('🔍 [DEBUG] Step 2: Loading order data with retry logic...');
      let currentOrderModel = null;
      let orderFound = false;

      // Alternate between order_temp and order collections for 3 cycles
      for (let cycle = 1; cycle <= 3; cycle++) {
        try {
          console.log(`🔄 [DEBUG] Cycle ${cycle}: Checking order_temp...`);
          
          // Check order_temp first
          let orderResult = await fireStore.collection('store')
            .doc(storeId)
            .collection("order_temp")
            .doc(orderId)
            .get();

          if (orderResult.exists) {
            currentOrderModel = orderResult.data();
            currentOrderModel.id = orderResult.id; // Ensure ID is set
            orderFound = true;
            console.log(`✅ [DEBUG] Order found in order_temp on cycle ${cycle}`);
            break;
          }

          // Wait 0.1 seconds before checking order collection
          console.log(`⏱️ [DEBUG] Waiting 0.1s before checking order collection...`);
          await new Promise(resolve => setTimeout(resolve, 100));

          console.log(`🔄 [DEBUG] Cycle ${cycle}: Checking order...`);
          
          // Check order collection
          orderResult = await fireStore.collection('store')
            .doc(storeId)
            .collection("order")
            .doc(orderId)
            .get();

          if (orderResult.exists) {
            currentOrderModel = orderResult.data();
            currentOrderModel.id = orderResult.id; // Ensure ID is set
            orderFound = true;
            console.log(`✅ [DEBUG] Order found in order on cycle ${cycle}`);
            break;
          }

          // Wait 1 second before next cycle (except after cycle 3)
          if (cycle < 3) {
            console.log(`⏱️ [DEBUG] Waiting 1s before next cycle...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

        } catch (e) {
          console.log(`❌ [DEBUG] Error on cycle ${cycle}:`, e);
          if (cycle < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (!orderFound || !currentOrderModel) {
        console.log('❌ [DEBUG] Step 2 Failed: No matching order found for orderId:', orderId);
        return { id: "", status: 'order_not_found', error: "order not found" };
      }
      console.log('✅ [DEBUG] Step 2 Complete: Order found with ID:', currentOrderModel.id);



      // Step 3: Validate order
      console.log('🔍 [DEBUG] Step 3: Validating order...');
      if (!this.isValidOrder(currentOrderModel)) {
        console.log('❌ [DEBUG] Step 3 Failed: Invalid order:', orderId);
        return { id: "", status: 'invalid_order', error: "order is not valid" };
      }
      console.log('✅ [DEBUG] Step 3 Complete: Order validation passed - Items count:', currentOrderModel.orderitems?.length || 0);

      // Step 4: Load user model if phone number exists
      console.log('👤 [DEBUG] Step 4: Loading user model...');
      const phoneString = this.getPhoneString(currentOrderModel);
      console.log('📞 [DEBUG] Phone string extracted:', phoneString);
      let currentUserModel = null;
      if (phoneString !== "0") {
        currentUserModel = await this.loadUserModel(phoneString);
        console.log('✅ [DEBUG] Step 4 Complete: User model loaded for phone:', phoneString);
      } else {
        console.log('⚠️ [DEBUG] Step 4 Skipped: No valid phone number found');
      }

      // Step 4.5: Process payment based on type (matching Dart logic)
      console.log("deciding payment type for order:", currentOrderModel.paymenttype);
      if (enableFullProcessing && currentOrderModel.paymenttype === "CREDIT") {
        console.log('💳 [DEBUG] Step 4.5: Processing credit payment...');
        await this.processCreditPayment(currentOrderModel, phoneString);
        console.log('✅ [DEBUG] Step 4.5 Complete: Credit payment processed');
      } else if (enableFullProcessing && (currentOrderModel.paymenttype || "").toUpperCase() !== "FREE" && (currentOrderModel.paymenttype || "").toUpperCase() !== "COD") {
        console.log('⏳ [DEBUG] Step 4.5: Waiting for GKash order confirmation...');
        console.log('💰 [DEBUG] Payment type:', currentOrderModel.paymenttype, '- requires GKash confirmation');
        try {
          const gkashResult = await this.waitForGKashOrder(storeId, orderId, currentOrderModel);
          console.log('✅ [DEBUG] Step 4.5 Complete: GKash order confirmed');
        } catch (error) {
          console.error('❌ [DEBUG] Step 4.5 Failed: GKash order timeout or error:', error.message);
          throw error; // Re-throw to handle at higher level
        }
      } else {
        console.log('⏭️ [DEBUG] Step 4.5 Skipped: Payment type', currentOrderModel.paymenttype, '- no GKash waiting needed');
        currentOrderModel.paymentstatus = 0; //kPaid
      }

      // Step 5: Increment store counter and assign order ID
      console.log('🔢 [DEBUG] Step 5: Incrementing store counter and assigning order ID...');
      await this.incrementStoreCounter(currentStoreModel, currentOrderModel);
      console.log('✅ [DEBUG] Step 5 Complete: Order ID assigned -', currentOrderModel.orderid);

      // Step 6: Update transaction details
      console.log('💳 [DEBUG] Step 6: Updating transaction details...');
      await this.updateTransactionDetails(currentOrderModel, gkashResult);
      console.log('✅ [DEBUG] Step 6 Complete: Transaction details updated - Payment Status:', currentOrderModel.paymentstatus);

      // Step 7: Save order based on payment type
      console.log('💾 [DEBUG] Step 7: Saving order based on payment type...');
      if (currentOrderModel.paymenttype === "COD") {
        console.log('🛒 [DEBUG] Saving COD order to counter_order collection...');
        await this.saveCounterOrder(storeId, currentOrderModel);
      } else {
        console.log('🌐 [DEBUG] Saving online order to multiple collections...');
        await this.saveOrderToCollections(storeId, currentOrderModel, phoneString);
      }
      
      // Always save to myInvois collection (non-blocking)
      if (enableFullProcessing && (currentOrderModel.paymenttype !== "COD") ) {
        console.log('📄 [DEBUG] Saving to myInvois collection...');
        this.saveToMyInvois(storeId, currentOrderModel);
      }
      else
      {
        console.log('📄 [DEBUG] Skipping myInvois collection as it is COD');
      }
      console.log('✅ [DEBUG] Step 7 Complete: Order saved appropriately');

      // Step 8: Handle vouchers and credits (only for non-vending orders during purchase)
      console.log('🎫 [DEBUG] Step 8: Handling vouchers and credits...');
      const isVendingOrder = (currentOrderModel.devicenumber && currentOrderModel.merchantid);
      console.log('🤖 [DEBUG] Is Vending Order:', isVendingOrder);
      
      if (!isVendingOrder) {
        console.log('🎫 [DEBUG] Processing voucher items for regular order...');
        await this.handleVoucherItems(currentOrderModel, phoneString);
        console.log('💰 [DEBUG] Processing credit items for regular order...');
        await this.handleCreditItems(currentOrderModel, phoneString);
      } else {
        console.log('🎫 [DEBUG] Redeeming assigned vouchers for vending order...');
        await this.redeemAssignedVouchers(currentOrderModel, phoneString);
        
      }
      console.log('✅ [DEBUG] Step 8 Complete: Vouchers and credits processed');

      // Step 8.5: Handle free vouchers (if provided in order model)
      if (currentOrderModel.freevouchers && Array.isArray(currentOrderModel.freevouchers) && currentOrderModel.freevouchers.length > 0 && phoneString !== "0") {
        console.log('🎁 [DEBUG] Step 8.5: Processing free vouchers...');
        await this.handleFreeVouchers(currentOrderModel, phoneString);
        console.log('✅ [DEBUG] Step 8.5 Complete: Free vouchers processed');
      } else {
        console.log('⏭️ [DEBUG] Step 8.5 Skipped: No free vouchers or invalid phone number');
      }



      // Step 9: Add loyalty points
      console.log('⭐ [DEBUG] Step 9: Adding loyalty points...');
      const pointsAdded = await this.addOrderWithLoyaltyPoints(phoneString, currentOrderModel, currentStoreModel);
      console.log('✅ [DEBUG] Step 9 Complete: Loyalty points added -', pointsAdded, 'points');

      // Step 9.2: Award stamp card progress (if eligible)
      try {
        if (phoneString !== "0") {
          console.log('🟩 [DEBUG] Step 9.2: Awarding stamp card (if eligible)... ',   parseFloat(currentOrderModel.totalpaid ));
          const orderTotalForStamp =  parseFloat(currentOrderModel.totalpaid ); //parseFloat(currentOrderModel.totalpaid || currentOrderModel.totalprice);
          await this.awardStampForOrder(phoneString, currentOrderModel.id, orderTotalForStamp, currentOrderModel.storeid);
          console.log('✅ [DEBUG] Step 9.2 Complete: Stamp card award step executed');
        } else {
          console.log('⏭️ [DEBUG] Step 9.2 Skipped: No valid phone number for stamp card');
        }
      } catch (stampErr) {
        console.error('❌ [DEBUG] Step 9.2 Failed: Error awarding stamp card:', stampErr);
      }

      // Step 10: Handle vending machine specific logic
      if (isVendingOrder) {
        // console.log('🤖 [DEBUG] Step 10: Processing vending order specifics...');
        // console.log('📦 [DEBUG] Saving to pickup collection...');
        // await this.saveToPickupCollection(currentOrderModel);
        console.log('📞 [DEBUG] Triggering vending payment callback...');
        await this.triggerVendingPaymentCallback(currentOrderModel, currentStoreModel);
        console.log('✅ [DEBUG] Step 10 Complete: Vending order processing done');
      } else {
        console.log('⏭️ [DEBUG] Step 10 Skipped: Not a vending order');
      }

      // Step 10.5: Generate ESL picking list (for non-vending orders)
      if (enableFullProcessing && enablePickingList && !isVendingOrder && !isCOIN) {
        console.log('📋 [DEBUG] Step 10.5: Generating ESL picking list...');
        await this.generatePickingList(storeId, currentOrderModel, currentStoreModel);
        console.log('✅ [DEBUG] Step 10.5 Complete: ESL picking list generated');
      } else {
        console.log('⏭️ [DEBUG] Step 10.5 Skipped: ESL picking list not needed');
      }

      // Step 10.6: Handle Feie receipt printing (for non-vending orders)
      if (enableFullProcessing && enablePrinting && !isVendingOrder && !isCOIN) {
        console.log('🖨️ [DEBUG] Step 10.6: Processing Feie receipt printing...');
        await this.handleFeieReceipt(currentOrderModel, currentStoreModel);
        console.log('✅ [DEBUG] Step 10.6 Complete: Feie receipts processed');
      } else {
        console.log('⏭️ [DEBUG] Step 10.6 Skipped: Feie printing not needed');
      }

      // Step 10.7: Retrieve pickup code for vending orders
      if (enableFullProcessing && isVendingOrder && currentOrderModel.vendingid && !isCOIN) {
        console.log('🔑 [DEBUG] Step 10.7: Retrieving pickup code for vending order...');
        await this.retrievePickupCode(currentOrderModel, phoneString);
        console.log('✅ [DEBUG] Step 10.7 Complete: Pickup code retrieved');

        console.log('🤖 [DEBUG] Step 10.7: Processing vending order specifics...');
        console.log('📦 [DEBUG] Step 10.7: Saving to pickup collection...');
        await this.saveToPickupCollection(currentOrderModel);

      } else {
        console.log('⏭️ [DEBUG] Step 10.7 Skipped: No pickup code retrieval needed');
      }


      // Step 10.8: Check SQL Account integration and create invoice if enabled
            const storeData = storeResult.data();
            if (storeData && storeData.integratesqlaccount === true) {
              console.log('💼 [DEBUG] Step 10.8: SQL Account integration enabled, creating cash sales...');
              console.log(currentOrderModel);
              try {
                const invoiceResult = await this.sqlAccountRouter.helperCreateCashSalesFromOrder({
                  order: currentOrderModel,
                  storeId: storeId
                });
                console.log('📄 [DEBUG] SQL Account Invoice Creation Result:', JSON.stringify(invoiceResult, null, 2));
              } catch (error) {
                console.error('❌ [DEBUG] SQL Account Invoice Creation Error:', error);
              }
            } else {
              console.log('⏭️ [DEBUG] Step 2.5 Skipped: SQL Account integration not enabled');
            }

      // Step 11: Update order_temp with the latest order model
      console.log('🔄 [DEBUG] Step 11: Updating order_temp with latest order model... ' + storeId + " " + orderId);

      await this.updateOrderTempMyReport(storeId, orderId, currentOrderModel);
      console.log('✅ [DEBUG] Step 11 Complete: order_temp updated to cart order with processed data');
       await this.updateCurrentOrderToUser(currentOrderModel, caller); //this will save order to user -> cart_order
       console.log('✅ [DEBUG] Step 11.1 Complete: current gkash order to user updated with processed data');
       
       // Step 11.2: Process blindbox voucher if present
       console.log('🎁 [DEBUG] Step 11.2: Processing blindbox voucher...');
       await this.processBlindboxVoucher(currentOrderModel, phoneString);
       console.log('✅ [DEBUG] Step 11.2 Complete: blindbox voucher processing done');

      // Step 12: Cleanup order (delete order_temp if requested)
      if (enableFullProcessing && deleteOrderTemp) {
        console.log('🧹 [DEBUG] Step 12: Cleaning up order_temp...');
        await this.cleanupOrder(storeId, orderId, phoneString);
        console.log('✅ [DEBUG] Step 12 Complete: Order cleanup done');
      } else {
        console.log('⏭️ [DEBUG] Step 12 Skipped: Order cleanup not requested');
      }

      console.log('🎉 [DEBUG] ========================');
      console.log('🎉 [DEBUG] ALL STEPS COMPLETE: Order transaction processed successfully!');
      console.log('🎉 [DEBUG] ========================');
      console.log('📊 [DEBUG] === PROCESSING SUMMARY ===');
      console.log('📊 [DEBUG] Store ID:', storeId);
      console.log('📊 [DEBUG] Store Counter Used:', currentStoreModel.storecounter);
      console.log('📊 [DEBUG] Original Order Document ID:', orderId);
      console.log('📊 [DEBUG] Generated Order Number:', currentOrderModel.orderid);
      console.log('📊 [DEBUG] Payment Amount:', gkashResult.AMOUNT, gkashResult.CURRENCY || 'MYR');
      console.log('📊 [DEBUG] Payment Type:', gkashResult.PAYMENT_TYPE);
      console.log('📊 [DEBUG] User Phone:', phoneString);
      console.log('📊 [DEBUG] Order Items Processed:', currentOrderModel.orderitems?.length || 0);
      console.log('📊 [DEBUG] Is Vending Order:', isVendingOrder);
      console.log('📊 [DEBUG] Loyalty Points Added:', pointsAdded);
      console.log('📊 [DEBUG] Order_temp Updated: store/' + storeId + '/order_temp/' + orderId);
      console.log('📊 [DEBUG] === END SUMMARY ===');
      
      return { id: currentOrderModel.id, status: 'success', message: "order processed successfully" };

    } catch (error) {
      console.error('💥 [DEBUG] FATAL ERROR in processOrderTransaction:', error);
      console.error('💥 [DEBUG] Error stack:', error.stack);
      return { id: "", status: 'error', error: error.message || error };
    }
  }


  async processPOSOrderTransaction(storeId, orderId, gkashResult, options = {}, caller = 'UNKNOWN') {
    const dateTime = new UtilDateTime();
    
    // Process options with defaults
    const {
      enablePrinting = false,        // Whether to enable receipt printing
      enablePickingList = false,     // Whether to generate picking lists
      enableFullProcessing = true,  // Whether to enable all processing features
      deleteOrderTemp = false       // Whether to delete order_temp after processing
    } = options;
    
    try {
      console.log('🚀 [POS DEBUG] Starting processOrderTransaction for storeId:', storeId, 'orderId:', orderId);
      console.log('🚀 [POS DEBUG] Caller:', caller);
      console.log('🚀 [POS DEBUG] Options:', JSON.stringify(options));
      //console.log('🚀 [POS DEBUG] GKash Result:', JSON.stringify(gkashResult));

      // Step 1: Load store data
      console.log('📦 [POS DEBUG] Step 1: Loading store data...');
      const storeResult = await fireStore.collection('store').doc(storeId).get();
      if (!storeResult.exists) {
        console.log('❌ [POS DEBUG] Store not found:', storeId);
        return { id: "", status: 'store_not_found', error: "store not found" };
      }
      const currentStoreModel = this.convertToStoreModel(storeResult);
      console.log('✅ [POS DEBUG] Step 1 Complete: Store loaded -', currentStoreModel.title || storeId);

      // Step 2: Load order data with retry logic (similar to Dart version)
      console.log('🔍 [POS DEBUG] Step 2: Loading order data with retry logic...');
      let currentOrderModel = null;
      let orderFound = false;

      // Alternate between order_temp and order collections for 3 cycles
      for (let cycle = 1; cycle <= 3; cycle++) {
        try {
          // console.log(`🔄 [POS DEBUG] Cycle ${cycle}: Checking order_temp...`);
          
          // // Check order_temp first
          // let orderResult = await fireStore.collection('store')
          //   .doc(storeId)
          //   .collection("order_temp")
          //   .doc(orderId)
          //   .get();

          // if (orderResult.exists) {
          //   currentOrderModel = orderResult.data();
          //   currentOrderModel.id = orderResult.id; // Ensure ID is set
          //   orderFound = true;
          //   console.log(`✅ [POS DEBUG] Order found in order_temp on cycle ${cycle}`);
          //   break;
          // }

          // // Wait 0.1 seconds before checking order collection
          // console.log(`⏱️ [POS DEBUG] Waiting 0.1s before checking order collection...`);
          // await new Promise(resolve => setTimeout(resolve, 100));

          console.log(`🔄 [POS DEBUG] Cycle ${cycle}: Checking order...`);
          
          // Check order collection
          let orderResult = await fireStore.collection('store')
            .doc(storeId)
            .collection("order")
            .doc(orderId)
            .get();

          if (orderResult.exists) {
            currentOrderModel = orderResult.data();
            currentOrderModel.id = orderResult.id; // Ensure ID is set
            orderFound = true;
            console.log(`✅ [POS DEBUG] Order found in order on cycle ${cycle}`);
            break;
          }

          // Wait 1 second before next cycle (except after cycle 3)
          if (cycle < 3) {
            console.log(`⏱️ [POS DEBUG] Waiting 1s before next cycle...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

        } catch (e) {
          console.log(`❌ [POS DEBUG] Error on cycle ${cycle}:`, e);
          if (cycle < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (!orderFound || !currentOrderModel) {
        console.log('❌ [POS DEBUG] Step 2 Failed: No matching order found for orderId:', orderId);
        return { id: "", status: 'order_not_found', error: "order not found" };
      }
      console.log('✅ [POS DEBUG] Step 2 Complete: Order found with ID:', currentOrderModel.id);

      // Step 3: Validate order
      console.log('🔍 [POS DEBUG] Step 3: Validating order...');
      if (!this.isValidOrder(currentOrderModel)) {
        console.log('❌ [POS DEBUG] Step 3 Failed: Invalid order:', orderId);
        return { id: "", status: 'invalid_order', error: "order is not valid" };
      }
      console.log('✅ [POS DEBUG] Step 3 Complete: Order validation passed - Items count:', currentOrderModel.orderitems?.length || 0);

      // Step 4: Load user model if phone number exists
      console.log('👤 [POS DEBUG] Step 4: Loading user model...');
      const phoneString = this.getPhoneString(currentOrderModel);
      console.log('📞 [POS DEBUG] Phone string extracted:', phoneString);
      let currentUserModel = null;
      if (phoneString !== "0") {
        currentUserModel = await this.loadUserModel(phoneString);
        console.log('✅ [POS DEBUG] Step 4 Complete: User model loaded for phone:', phoneString);
      } else {
        console.log('⚠️ [POS DEBUG] Step 4 Skipped: No valid phone number found');
      }

      // Step 4.5: Process payment based on type (matching Dart logic)
      // console.log("deciding payment type for order:", currentOrderModel.paymenttype);
      // if (enableFullProcessing && currentOrderModel.paymenttype === "CREDIT") {
      //   console.log('💳 [DEBUG] Step 4.5: Processing credit payment...');
      //   await this.processCreditPayment(currentOrderModel, phoneString);
      //   console.log('✅ [DEBUG] Step 4.5 Complete: Credit payment processed');
      // } else if (enableFullProcessing && currentOrderModel.paymenttype.toUpperCase() !== "FREE" && currentOrderModel.paymenttype.toUpperCase() !== "COD") {
      //   console.log('⏳ [DEBUG] Step 4.5: Waiting for GKash order confirmation...');
      //   console.log('💰 [DEBUG] Payment type:', currentOrderModel.paymenttype, '- requires GKash confirmation');
      //   try {
      //     const gkashResult = await this.waitForGKashOrder(storeId, orderId, currentOrderModel);
      //     console.log('✅ [DEBUG] Step 4.5 Complete: GKash order confirmed');
      //   } catch (error) {
      //     console.error('❌ [DEBUG] Step 4.5 Failed: GKash order timeout or error:', error.message);
      //     throw error; // Re-throw to handle at higher level
      //   }
      // } else {
      //   console.log('⏭️ [DEBUG] Step 4.5 Skipped: Payment type', currentOrderModel.paymenttype, '- no GKash waiting needed');
      //   currentOrderModel.paymentstatus = 0; //kPaid
      // }

      // Step 5: Increment store counter and assign order ID
      // console.log('🔢 [DEBUG] Step 5: Incrementing store counter and assigning order ID...');
      // await this.incrementStoreCounter(currentStoreModel, currentOrderModel);
      // console.log('✅ [DEBUG] Step 5 Complete: Order ID assigned -', currentOrderModel.orderid);

      // Step 6: Update transaction details
      // console.log('💳 [DEBUG] Step 6: Updating transaction details...');
      // await this.updateTransactionDetails(currentOrderModel, gkashResult);
      // console.log('✅ [DEBUG] Step 6 Complete: Transaction details updated - Payment Status:', currentOrderModel.paymentstatus);

      // Step 7: Save order based on payment type
      // console.log('💾 [DEBUG] Step 7: Saving order based on payment type...');
      // if (currentOrderModel.paymenttype === "COD") {
      //   console.log('🛒 [DEBUG] Saving COD order to counter_order collection...');
      //   await this.saveCounterOrder(storeId, currentOrderModel);
      // } else {
      //   console.log('🌐 [DEBUG] Saving online order to multiple collections...');
      //   await this.saveOrderToCollections(storeId, currentOrderModel, phoneString);
      // }
      
      // Always save to myInvois collection
      // if (enableFullProcessing && (currentOrderModel.paymenttype !== "COD") ) {
      //   console.log('📄 [DEBUG] Saving to myInvois collection...');
      //   await this.saveToMyInvois(storeId, currentOrderModel);
      // }
      // else
      // {
      //   console.log('📄 [DEBUG] Skipping myInvois collection as it is COD');
      // }
      // console.log('✅ [DEBUG] Step 7 Complete: Order saved appropriately');

      // Step 8: Handle vouchers and credits (only for non-vending orders during purchase)
      // console.log('🎫 [POS DEBUG] Step 8: Handling vouchers and credits...');
      const isVendingOrder = false ; //(currentOrderModel.devicenumber && currentOrderModel.merchantid);
      // console.log('🤖 [POS DEBUG] Is Vending Order:', isVendingOrder);
      
      if (!isVendingOrder) {
        console.log('🎫 [POS DEBUG] Processing voucher items for regular order...');
        await this.handleVoucherItems(currentOrderModel, phoneString);
        console.log('💰 [POS DEBUG] Processing credit items for regular order...');
        await this.handleCreditItems(currentOrderModel, phoneString);
      } else {
        console.log('🎫 [POS DEBUG] Redeeming assigned vouchers for vending order...');
        await this.redeemAssignedVouchers(currentOrderModel, phoneString);
        
      }
      console.log('✅ [POS DEBUG] Step 5 Complete: Vouchers and credits processed');

      // Step 5.5: Handle free vouchers (if provided in order model)
      if (currentOrderModel.freevouchers && Array.isArray(currentOrderModel.freevouchers) && currentOrderModel.freevouchers.length > 0 && phoneString !== "0") {
        console.log('🎁 [POS DEBUG] Step 5.5: Processing free vouchers...');
        await this.handleFreeVouchers(currentOrderModel, phoneString);
        console.log('✅ [POS DEBUG] Step 5.5 Complete: Free vouchers processed');
      } else {
        console.log('⏭️ [POS DEBUG] Step 5.5 Skipped: No free vouchers or invalid phone number');
      }



      // Step 6: Add loyalty points
      console.log('⭐ [POS DEBUG] Step 6: Adding loyalty points...');
      const pointsAdded = await this.addOrderWithLoyaltyPoints(phoneString, currentOrderModel, currentStoreModel);
      console.log('✅ [POS DEBUG] Step 6 Complete: Loyalty points added -', pointsAdded, 'points');

      // Step 7: Award stamp card progress (if eligible)
      try {
        if (phoneString !== "0") {
          console.log('🟩 [POS DEBUG] Step 7: Awarding stamp card (if eligible)... ',   parseFloat(currentOrderModel.totalpaid ));
          const orderTotalForStamp =  parseFloat(currentOrderModel.totalpaid ); //parseFloat(currentOrderModel.totalpaid || currentOrderModel.totalprice);
          await this.awardStampForOrder(phoneString, currentOrderModel.id, orderTotalForStamp, currentOrderModel.storeid);
          console.log('✅ [POS DEBUG] Step 7 Complete: Stamp card award step executed');
        } else {
          console.log('⏭️ [POS DEBUG] Step 7 Skipped: No valid phone number for stamp card');
        }
      } catch (stampErr) {
        console.error('❌ [POS DEBUG] Step 7 Failed: Error awarding stamp card:', stampErr);
      }

      // Step 10: Handle vending machine specific logic
      // if (isVendingOrder) {
      //   // console.log('🤖 [DEBUG] Step 10: Processing vending order specifics...');
      //   // console.log('📦 [DEBUG] Saving to pickup collection...');
      //   // await this.saveToPickupCollection(currentOrderModel);
      //   console.log('📞 [DEBUG] Triggering vending payment callback...');
      //   await this.triggerVendingPaymentCallback(currentOrderModel, currentStoreModel);
      //   console.log('✅ [DEBUG] Step 10 Complete: Vending order processing done');
      // } else {
      //   console.log('⏭️ [DEBUG] Step 10 Skipped: Not a vending order');
      // }

      // Step 10.5: Generate ESL picking list (for non-vending orders)
      // if (enableFullProcessing && enablePickingList && !isVendingOrder) {
      //   console.log('📋 [DEBUG] Step 10.5: Generating ESL picking list...');
      //   await this.generatePickingList(storeId, currentOrderModel, currentStoreModel);
      //   console.log('✅ [DEBUG] Step 10.5 Complete: ESL picking list generated');
      // } else {
      //   console.log('⏭️ [DEBUG] Step 10.5 Skipped: ESL picking list not needed');
      // }

      // Step 10.6: Handle Feie receipt printing (for non-vending orders)
      // if (enableFullProcessing && enablePrinting && !isVendingOrder) {
      //   console.log('🖨️ [DEBUG] Step 10.6: Processing Feie receipt printing...');
      //   await this.handleFeieReceipt(currentOrderModel, currentStoreModel);
      //   console.log('✅ [DEBUG] Step 10.6 Complete: Feie receipts processed');
      // } else {
      //   console.log('⏭️ [DEBUG] Step 10.6 Skipped: Feie printing not needed');
      // }

      // Step 10.7: Retrieve pickup code for vending orders
      // if (enableFullProcessing && isVendingOrder && currentOrderModel.vendingid) {
      //   console.log('🔑 [DEBUG] Step 10.7: Retrieving pickup code for vending order...');
      //   await this.retrievePickupCode(currentOrderModel, phoneString);
      //   console.log('✅ [DEBUG] Step 10.7 Complete: Pickup code retrieved');

      //   console.log('🤖 [DEBUG] Step 10.7: Processing vending order specifics...');
      //   console.log('📦 [DEBUG] Step 10.7: Saving to pickup collection...');
      //   await this.saveToPickupCollection(currentOrderModel);

      // } else {
      //   console.log('⏭️ [DEBUG] Step 10.7 Skipped: No pickup code retrieval needed');
      // }

      // Step 11: Update order_temp with the latest order model
      // console.log('🔄 [DEBUG] Step 11: Updating order_temp with latest order model... ' + storeId + " " + orderId);

      // await this.updateOrderTempMyReport(storeId, orderId, currentOrderModel);
      // console.log('✅ [DEBUG] Step 11 Complete: order_temp updated with processed data');
      //  await this.updateCurrentOrderToUser(currentOrderModel, caller);
      //  console.log('✅ [DEBUG] Step 11.1 Complete: current gkash order to user updated with processed data');
       
      //  // Step 11.2: Process blindbox voucher if present
      //  console.log('🎁 [DEBUG] Step 11.2: Processing blindbox voucher...');
      //  await this.processBlindboxVoucher(currentOrderModel, phoneString);
      //  console.log('✅ [DEBUG] Step 11.2 Complete: blindbox voucher processing done');

      // // Step 12: Cleanup order (delete order_temp if requested)
      // if (enableFullProcessing && deleteOrderTemp) {
      //   console.log('🧹 [DEBUG] Step 12: Cleaning up order_temp...');
      //   await this.cleanupOrder(storeId, orderId, phoneString);
      //   console.log('✅ [DEBUG] Step 12 Complete: Order cleanup done');
      // } else {
      //   console.log('⏭️ [DEBUG] Step 12 Skipped: Order cleanup not requested');
      // }

      console.log('🎉 [POS DEBUG] ========================');
      console.log('🎉 [POS DEBUG] ALL STEPS COMPLETE: Order transaction processed successfully!');
      console.log('🎉 [POS DEBUG] ========================');
      console.log('📊 [POS DEBUG] === PROCESSING SUMMARY ===');
      console.log('📊 [POS DEBUG] Store ID:', storeId);
      console.log('📊 [POS DEBUG] Store Counter Used:', currentStoreModel.storecounter);
      console.log('📊 [POS DEBUG] Original Order Document ID:', orderId);
      console.log('📊 [POS DEBUG] Generated Order Number:', currentOrderModel.orderid);
      console.log('📊 [POS DEBUG] Payment Amount:', gkashResult.AMOUNT, gkashResult.CURRENCY || 'MYR');
      console.log('📊 [POS DEBUG] Payment Type:', gkashResult.PAYMENT_TYPE);
      console.log('📊 [POS DEBUG] User Phone:', phoneString);
      console.log('📊 [POS DEBUG] Order Items Processed:', currentOrderModel.orderitems?.length || 0);
      console.log('📊 [POS DEBUG] Is Vending Order:', isVendingOrder);
      console.log('📊 [POS DEBUG] Loyalty Points Added:', pointsAdded);
      console.log('📊 [POS DEBUG] Order_temp Updated: store/' + storeId + '/order_temp/' + orderId);
      console.log('📊 [POS DEBUG] === END SUMMARY ===');
      
      return { id: currentOrderModel.id, status: 'success', message: "order processed successfully" };

    } catch (error) {
      console.error('💥 [POS DEBUG] FATAL ERROR in processOrderTransaction:', error);
      console.error('💥 [POS DEBUG] Error stack:', error.stack);
      return { id: "", status: 'error', error: error.message || error };
    }
  }



  //this is for game play order processing from coin machine
  //durin game play, user wont earn any loyalty points, as points already granted during the credit reload.
  async processGamePlayOrderTransaction(storeId, orderId, gkashResult, options = {}, caller = 'COIN', currentOrderModel = null) {
    const dateTime = new UtilDateTime();
    
    // Process options with defaults
    const {
      enablePrinting = false,        // Whether to enable receipt printing
      enablePickingList = false,     // Whether to generate picking lists
      enableFullProcessing = true,  // Whether to enable all processing features
      deleteOrderTemp = false       // Whether to delete order_temp after processing
    } = options;
    
    try {
      console.log('🚀 [GAME PLAY DEBUG] Starting processOrderTransaction for storeId:', storeId, 'orderId:', orderId);
      console.log('🚀 [GAME PLAY DEBUG] Caller:', caller);
      console.log('🚀 [GAME PLAY DEBUG] Options:', JSON.stringify(options));
      //console.log('🚀 [POS DEBUG] GKash Result:', JSON.stringify(gkashResult));

      // Step 2: Use provided order model or load from Firestore with retry logic (fallback)
      if (currentOrderModel) {
        console.log('✅ [GAME PLAY DEBUG] Step 2: Using order model from request parameters');
        // Ensure ID is set
        if (!currentOrderModel.id) {
          currentOrderModel.id = orderId;
        }
        console.log('✅ [GAME PLAY DEBUG] Step 2 Complete: Order model ready with ID:', currentOrderModel.id);
      } else {
        // Fallback: Load order data with retry logic (similar to Dart version)
        console.log('🔍 [GAME PLAY DEBUG] Step 2: Loading order data with retry logic...');
        let orderFound = false;

        // Alternate between order_temp and order collections for 3 cycles
        for (let cycle = 1; cycle <= 3; cycle++) {
          try {
            // console.log(`🔄 [POS DEBUG] Cycle ${cycle}: Checking order_temp...`);
            
            // Check order_temp first
            var orderResult = await fireStore.collection('store')
              .doc(storeId)
              .collection("order_temp")
              .doc(orderId)
              .get();

            if (orderResult.exists) {
              currentOrderModel = orderResult.data();
              currentOrderModel.id = orderResult.id; // Ensure ID is set
              orderFound = true;
              console.log(`✅ [POS DEBUG] Order found in order_temp on cycle ${cycle}`);
              break;
            }

            // // Wait 0.1 seconds before checking order collection
            // console.log(`⏱️ [POS DEBUG] Waiting 0.1s before checking order collection...`);
            // await new Promise(resolve => setTimeout(resolve, 100));

            console.log(`🔄 [GAME PLAY DEBUG] Cycle ${cycle}: Checking order...`);
            
            // Check order collection
            orderResult = await fireStore.collection('store')
              .doc(storeId)
              .collection("order")
              .doc(orderId)
              .get();

            if (orderResult.exists) {
              currentOrderModel = orderResult.data();
              currentOrderModel.id = orderResult.id; // Ensure ID is set
              orderFound = true;
              console.log(`✅ [GAME PLAY DEBUG] Order found in order on cycle ${cycle}`);
              break;
            }

            // Wait 1 second before next cycle (except after cycle 3)
            if (cycle < 3) {
              console.log(`⏱️ [GAME PLAY DEBUG] Waiting 1s before next cycle...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

          } catch (e) {
            console.log(`❌ [GAME PLAY DEBUG] Error on cycle ${cycle}:`, e);
            if (cycle < 3) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }

        if (!orderFound || !currentOrderModel) {
          console.log('❌ [GAME PLAY DEBUG] Step 2 Failed: No matching order found for orderId:', orderId);
          return { id: "", status: 'order_not_found', error: "order not found" };
        }
        console.log('✅ [GAME PLAY DEBUG] Step 2 Complete: Order found with ID:', currentOrderModel.id);
      }

      // Step 3: Validate order
      console.log('🔍 [GAME PLAY DEBUG] Step 3: Validating order...');
      if (!this.isValidOrder(currentOrderModel)) {
        console.log('❌ [GAME PLAY DEBUG] Step 3 Failed: Invalid order:', orderId);
        return { id: "", status: 'invalid_order', error: "order is not valid" };
      }
      console.log('✅ [GAME PLAY DEBUG] Step 3 Complete: Order validation passed - Items count:', currentOrderModel.orderitems?.length || 0);

      // Step 4: Load user model if phone number exists
      console.log('👤 [GAME PLAY DEBUG] Step 4: Loading user model...');
      const phoneString = this.getPhoneString(currentOrderModel);
      console.log('📞 [GAME PLAY DEBUG] Phone string extracted:', phoneString);
      // let currentUserModel = null;
      // if (phoneString !== "0") {
      //   currentUserModel = await this.loadUserModel(phoneString);
      //   console.log('✅ [GAME PLAY DEBUG] Step 4 Complete: User model loaded for phone:', phoneString);
      // } else {
      //   console.log('⚠️ [GAME PLAY DEBUG] Step 4 Skipped: No valid phone number found');
      // }

      // Step 4.5: Process payment based on type (matching Dart logic)
      console.log("deciding payment type for order:", currentOrderModel.paymenttype);
      if (enableFullProcessing && currentOrderModel.paymenttype === "CREDIT") {
        console.log('💳 [GAME PLAY DEBUG] Step 4.5: Processing credit payment...');
        await this.processCreditPayment(currentOrderModel, phoneString);
        console.log('✅ [GAME PLAY DEBUG] Step 4.5 Complete: Credit payment processed');
      } else if (enableFullProcessing && currentOrderModel.paymenttype.toUpperCase() !== "FREE" && currentOrderModel.paymenttype.toUpperCase() !== "COD") {
        console.log('⏳ [GAME PLAY DEBUG] Step 4.5: Waiting for GKash order confirmation...');
        console.log('💰 [GAME PLAY DEBUG] Payment type:', currentOrderModel.paymenttype, '- requires GKash confirmation');
        try {
          const gkashResult = await this.waitForGKashOrder(storeId, orderId, currentOrderModel);
          console.log('✅ [GAME PLAY DEBUG] Step 4.5 Complete: GKash order confirmed');
        } catch (error) {
          console.error('❌ [GAME PLAY DEBUG] Step 4.5 Failed: GKash order timeout or error:', error.message);
          throw error; // Re-throw to handle at higher level
        }
      } else {
        console.log('⏭️ [GAME PLAY DEBUG] Step 4.5 Skipped: Payment type', currentOrderModel.paymenttype, '- no GKash waiting needed');
        currentOrderModel.paymentstatus = 0; //kPaid
      }

      // Step 5: Start order saving process asynchronously (non-blocking) to speed up payment response
      console.log('⚡ [GAME PLAY] Step 5: Starting async order save process...');
      this.gameplaysaveordertransaction(storeId, orderId, currentOrderModel,  gkashResult, phoneString, enableFullProcessing, caller, options).catch(err => {
        console.error('❌ [GAME PLAY] Error in async order save process:', err);
      });
      console.log('✅ [GAME PLAY] Step 5 Complete: Order save process started (non-blocking)');
      
      // Return immediately after payment confirmation to speed up response
      return { id: currentOrderModel.id, status: 'success', message: "order processed successfully" };

    } catch (error) {
      console.error('💥 [GAME PLAY DEBUG] FATAL ERROR in processOrderTransaction:', error);
      console.error('💥 [GAME PLAY DEBUG] Error stack:', error.stack);
      return { id: "", status: 'error', error: error.message || error };
    }
  }

  /**
   * Separate function to handle order saving logic asynchronously
   * This allows payment response to return faster while order processing continues in background
   */
  async gameplaysaveordertransaction(storeId, orderId, currentOrderModel, gkashResult, phoneString, enableFullProcessing, caller, options = {}) {
    const {
      enablePrinting = false,
      enablePickingList = false,
      deleteOrderTemp = false
    } = options;

    try {
      console.log('💾 [GAME PLAY SAVE] Starting order save transaction...');
      console.log('💾 [GAME PLAY SAVE] Store ID:', storeId);
      console.log('💾 [GAME PLAY SAVE] Order ID:', orderId);

      // Step 1: Load store data
      console.log('📦 [GAME PLAY DEBUG] : Loading store data...');
      const storeResult = await fireStore.collection('store').doc(storeId).get();
      if (!storeResult.exists) {
        console.log('❌ [GAME PLAY DEBUG] Store not found:', storeId);
        return { id: "", status: 'store_not_found', error: "store not found" };
      }
      const currentStoreModel = this.convertToStoreModel(storeResult);
      console.log('✅ [GAME PLAY DEBUG] Step 1 Complete: Store loaded -', currentStoreModel.title || storeId);

      //Step 5: Increment store counter and assign order ID
      console.log('🔢 [GAME PLAY SAVE] Step 5: Incrementing store counter and assigning order ID...');
      await this.incrementStoreCounter(currentStoreModel, currentOrderModel);
      console.log('✅ [GAME PLAY SAVE] Step 5 Complete: Order ID assigned -', currentOrderModel.orderid);

      // Step 6: Update transaction details
      // console.log('💳 [DEBUG] Step 6: Updating transaction details...');
      // await this.updateTransactionDetails(currentOrderModel, gkashResult);
      // console.log('✅ [DEBUG] Step 6 Complete: Transaction details updated - Payment Status:', currentOrderModel.paymentstatus);

      // Step 7: Save order based on payment type
      // console.log('💾 [DEBUG] Step 7: Saving order based on payment type...');
      // if (currentOrderModel.paymenttype === "COD") {
      //   console.log('🛒 [DEBUG] Saving COD order to counter_order collection...');
      //   await this.saveCounterOrder(storeId, currentOrderModel);
      // } else {
      //   console.log('🌐 [DEBUG] Saving online order to multiple collections...');
      //   await this.saveOrderToCollections(storeId, currentOrderModel, phoneString);
      // }
      
      // Always save to myInvois collection (non-blocking)
      if (enableFullProcessing && (currentOrderModel.paymenttype !== "COD") ) {
        console.log('📄 [GAME PLAY SAVE] Saving to myInvois collection...');
        this.saveToMyInvois(storeId, currentOrderModel);
      }
      else
      {
        console.log('📄 [GAME PLAY SAVE] Skipping myInvois collection as it is COD');
      }
      // console.log('✅ [DEBUG] Step 7 Complete: Order saved appropriately');

      // Step 8: Handle vouchers and credits (only for non-vending orders during purchase)
      // console.log('🎫 [POS DEBUG] Step 8: Handling vouchers and credits...');
      const isVendingOrder = false ; //(currentOrderModel.devicenumber && currentOrderModel.merchantid);
      // console.log('🤖 [POS DEBUG] Is Vending Order:', isVendingOrder);
      
      // if (!isVendingOrder) {
      //   console.log('🎫 [GAME PLAY DEBUG] Processing voucher items for regular order...');
      //   await this.handleVoucherItems(currentOrderModel, phoneString);
      //   console.log('💰 [GAME PLAY DEBUG] Processing credit items for regular order...');
      //   await this.handleCreditItems(currentOrderModel, phoneString);
      // } else {
      //   console.log('🎫 [GAME PLAY DEBUG] Redeeming assigned vouchers for vending order...');
      //   await this.redeemAssignedVouchers(currentOrderModel, phoneString);
        
      // }
      // console.log('✅ [GAME PLAY DEBUG] Step 5 Complete: Vouchers and credits processed');

      // Step 5.5: Handle free vouchers (if provided in order model)
      // if (currentOrderModel.freevouchers && Array.isArray(currentOrderModel.freevouchers) && currentOrderModel.freevouchers.length > 0 && phoneString !== "0") {
      //   console.log('🎁 [GAME PLAY DEBUG] Step 5.5: Processing free vouchers...');
      //   await this.handleFreeVouchers(currentOrderModel, phoneString);
      //   console.log('✅ [GAME PLAY DEBUG] Step 5.5 Complete: Free vouchers processed');
      // } else {
      //   console.log('⏭️ [GAME PLAY DEBUG] Step 5.5 Skipped: No free vouchers or invalid phone number');
      // }



      // Step 6: Add loyalty points
      console.log('⭐ [GAME PLAY SAVE] Step 6: SKIP loyalty points...');
      //const pointsAdded = await this.addOrderWithLoyaltyPoints(phoneString, currentOrderModel, currentStoreModel);
      //console.log('✅ [POS DEBUG] Step 6 Complete: Loyalty points added -', pointsAdded, 'points');
      const pointsAdded = 0; // Loyalty points skipped for game play orders

      // Step 7: Award stamp card progress (if eligible)
      // try {
      //   if (phoneString !== "0") {
      //     console.log('🟩 [GAME PLAY DEBUG] Step 7: Awarding stamp card (if eligible)... ',   parseFloat(currentOrderModel.totalpaid ));
      //     const orderTotalForStamp =  parseFloat(currentOrderModel.totalpaid ); //parseFloat(currentOrderModel.totalpaid || currentOrderModel.totalprice);
      //     await this.awardStampForOrder(phoneString, currentOrderModel.id, orderTotalForStamp, currentOrderModel.storeid);
      //     console.log('✅ [GAME PLAY DEBUG] Step 7 Complete: Stamp card award step executed');
      //   } else {
      //     console.log('⏭️ [GAME PLAY DEBUG] Step 7 Skipped: No valid phone number for stamp card');
      //   }
      // } catch (stampErr) {
      //   console.error('❌ [GAME PLAY DEBUG] Step 7 Failed: Error awarding stamp card:', stampErr);
      // }

      // Step 10: Handle vending machine specific logic
      // if (isVendingOrder) {
      //   // console.log('🤖 [DEBUG] Step 10: Processing vending order specifics...');
      //   // console.log('📦 [DEBUG] Saving to pickup collection...');
      //   // await this.saveToPickupCollection(currentOrderModel);
      //   console.log('📞 [DEBUG] Triggering vending payment callback...');
      //   await this.triggerVendingPaymentCallback(currentOrderModel, currentStoreModel);
      //   console.log('✅ [DEBUG] Step 10 Complete: Vending order processing done');
      // } else {
      //   console.log('⏭️ [DEBUG] Step 10 Skipped: Not a vending order');
      // }

      // Step 10.5: Generate ESL picking list (for non-vending orders)
      // if (enableFullProcessing && enablePickingList && !isVendingOrder) {
      //   console.log('📋 [DEBUG] Step 10.5: Generating ESL picking list...');
      //   await this.generatePickingList(storeId, currentOrderModel, currentStoreModel);
      //   console.log('✅ [DEBUG] Step 10.5 Complete: ESL picking list generated');
      // } else {
      //   console.log('⏭️ [DEBUG] Step 10.5 Skipped: ESL picking list not needed');
      // }

      // Step 10.6: Handle Feie receipt printing (for non-vending orders)
      // if (enableFullProcessing && enablePrinting && !isVendingOrder) {
      //   console.log('🖨️ [DEBUG] Step 10.6: Processing Feie receipt printing...');
      //   await this.handleFeieReceipt(currentOrderModel, currentStoreModel);
      //   console.log('✅ [DEBUG] Step 10.6 Complete: Feie receipts processed');
      // } else {
      //   console.log('⏭️ [DEBUG] Step 10.6 Skipped: Feie printing not needed');
      // }

      // Step 10.7: Retrieve pickup code for vending orders
      // if (enableFullProcessing && isVendingOrder && currentOrderModel.vendingid) {
      //   console.log('🔑 [DEBUG] Step 10.7: Retrieving pickup code for vending order...');
      //   await this.retrievePickupCode(currentOrderModel, phoneString);
      //   console.log('✅ [DEBUG] Step 10.7 Complete: Pickup code retrieved');

      //   console.log('🤖 [DEBUG] Step 10.7: Processing vending order specifics...');
      //   console.log('📦 [DEBUG] Step 10.7: Saving to pickup collection...');
      //   await this.saveToPickupCollection(currentOrderModel);

      // } else {
      //   console.log('⏭️ [DEBUG] Step 10.7 Skipped: No pickup code retrieval needed');
      // }

      // Step 11: Update order_temp with the latest order model
      // console.log('🔄 [DEBUG] Step 11: Updating order_temp with latest order model... ' + storeId + " " + orderId);

       await this.updateOrderTempMyReport(storeId, orderId, currentOrderModel);
       console.log('✅ [GAME PLAY SAVE] Step 11 Complete: order_temp updated with processed data');
       await this.saveCurrentOrderToUser(currentOrderModel, caller); //this will save order to user -> order
       console.log('✅ [GAME PLAY SAVE] Step 11.1 Complete: current gkash order to user updated with processed data');
       
      //  // Step 11.2: Process blindbox voucher if present
      //  console.log('🎁 [DEBUG] Step 11.2: Processing blindbox voucher...');
      //  await this.processBlindboxVoucher(currentOrderModel, phoneString);
      //  console.log('✅ [DEBUG] Step 11.2 Complete: blindbox voucher processing done');

      // // Step 12: Cleanup order (delete order_temp if requested)
      // if (enableFullProcessing && deleteOrderTemp) {
      //   console.log('🧹 [GAME PLAY] Step 12: Cleaning up order_temp...');
     //    await this.cleanupOrder(storeId, orderId, phoneString);
      //   console.log('✅ [GAME PLAY] Step 12 Complete: Order cleanup done');
      // } else {
      //   console.log('⏭️ [GAME PLAY] Step 12 Skipped: Order cleanup not requested');
      // }

      console.log('🎉 [GAME PLAY SAVE] ========================');
      console.log('🎉 [GAME PLAY SAVE] ALL STEPS COMPLETE: Order transaction saved successfully!');
      console.log('🎉 [GAME PLAY SAVE] ========================');
      console.log('📊 [GAME PLAY SAVE] === PROCESSING SUMMARY ===');
      console.log('📊 [GAME PLAY SAVE] Store ID:', storeId);
      console.log('📊 [GAME PLAY SAVE] Store Counter Used:', currentStoreModel.storecounter);
      console.log('📊 [GAME PLAY SAVE] Original Order Document ID:', orderId);
      console.log('📊 [GAME PLAY SAVE] Generated Order Number:', currentOrderModel.orderid);
      console.log('📊 [GAME PLAY SAVE] Payment Amount:', gkashResult.AMOUNT, gkashResult.CURRENCY || 'MYR');
      console.log('📊 [GAME PLAY SAVE] Payment Type:', gkashResult.PAYMENT_TYPE);
      console.log('📊 [GAME PLAY SAVE] User Phone:', phoneString);
      console.log('📊 [GAME PLAY SAVE] Order Items Processed:', currentOrderModel.orderitems?.length || 0);
      console.log('📊 [GAME PLAY SAVE] Is Vending Order:', isVendingOrder);
      console.log('📊 [GAME PLAY SAVE] Loyalty Points Added:', pointsAdded);
      console.log('📊 [GAME PLAY SAVE] Order_temp Updated: store/' + storeId + '/order_temp/' + orderId);
      console.log('📊 [GAME PLAY SAVE] === END SUMMARY ===');
      
    } catch (error) {
      console.error('💥 [GAME PLAY SAVE] FATAL ERROR in gameplaysaveordertransaction:', error);
      console.error('💥 [GAME PLAY SAVE] Error stack:', error.stack);
      // Don't throw - this is async and errors are logged
    }
  }

  isValidOrder(orderModel) {
    return orderModel && 
           orderModel.orderitems && 
           Array.isArray(orderModel.orderitems) && 
           orderModel.orderitems.length > 0;
  }

  async incrementStoreCounter(storeModel, orderModel) {
    console.log("🔢 [DEBUG] Starting store counter increment transaction...");
    console.log("🔢 [DEBUG] Current store model counter:", storeModel.storecounter);
    
    await fireStore.runTransaction(async (transaction) => {
      const storeDoc = fireStore.collection("store").doc(orderModel.storeid);
      console.log("🔢 [DEBUG] Getting current counter from store:", orderModel.storeid);
      
      const storeSnapshot = await transaction.get(storeDoc);
      
      let storeCount = storeSnapshot.data().storecounter || 0;
      console.log("🔢 [DEBUG] Current store counter from Firestore:", storeCount);
      
      const newStoreCount = storeCount + 1;
      console.log("🔢 [DEBUG] Incrementing counter to:", newStoreCount);
      
      transaction.update(storeDoc, { storecounter: newStoreCount });
      
      storeModel.storecounter = newStoreCount;
      const newTicket = storeModel.getTicket();
      console.log("🔢 [DEBUG] Generated new ticket/orderID:", newTicket);
      
      orderModel.orderid = newTicket;
      orderModel.orderfromonline = true;
      orderModel.onlineorderid = orderModel.orderid || "";
      
      console.log("🔢 [DEBUG] Updated order model with orderID:", orderModel.orderid);
      
      // Update orderId for each orderItems
      if (Array.isArray(orderModel.orderitems)) {
        console.log("🔢 [DEBUG] Updating orderID for", orderModel.orderitems.length, "order items...");
        orderModel.orderitems.forEach((element, index) => {
          element.orderid = newTicket;
          console.log(`🔢 [DEBUG] Item ${index + 1} orderID updated:`, element.orderid);
        });
      } else {
        console.log("⚠️ [DEBUG] No order items array found or invalid format");
      }
      
      console.log("🔢 [DEBUG] Store counter transaction completed successfully");
    });
  }

  async updateTransactionDetails(orderModel, gkashResult) {
    console.log("Updating transaction details");
    console.log("Payment type:", orderModel.paymenttype);
    
    // Get message ID (similar to Dart version)
    let messageId = "";
    try {
      // In a real implementation, you might want to get Firebase messaging token
      // For now, we'll use a placeholder or get from somewhere else
      messageId = ""; // Placeholder for messaging token
    } catch (ex) {
      console.error("Error getting message ID:", ex);
    }
    
    orderModel.messageid = messageId;
    orderModel.totalpaid = gkashResult.AMOUNT;
    orderModel.epayamount = gkashResult.AMOUNT;
    
    if(((orderModel.paymenttype || "").toUpperCase() != "CREDIT") && ((orderModel.paymenttype || "").toUpperCase() != "FREE"))
    {
      orderModel.epaymenttype = gkashResult.PAYMENT_TYPE;
      orderModel.paymenttype = gkashResult.PAYMENT_TYPE;
    }
    
    orderModel.epaymentdetail = gkashResult;
    orderModel.transactiondetail = gkashResult;
    //orderModel.ordertype = 1;
    
    // Set payment status to paid
   // orderModel.paymentstatus = 0; //kPaid

    // Set payment status to paid only for non-COD orders
  if (orderModel.paymenttype !== "COD") {
  orderModel.paymentstatus = 0; //kPaid
  
  } else {
  orderModel.paymentstatus = -999; //kUnpaid for COD orders
  }

console.log("set payment status :", orderModel.paymentstatus);
    
    // Update order date time if not set
    if (!orderModel.orderdatetime) {
      orderModel.orderdatetime = new Date().toISOString();
    }
  }

  getPhoneString(orderModel) {
    let phoneString = orderModel.userphonenumber || "";
    if (phoneString.includes("FU_")) {
      phoneString = phoneString.replace("FU_", "");
    }
    if (phoneString.includes("QS_")) {
      phoneString = phoneString.replace("QS_", "");
    }
    if (phoneString === "") {
      phoneString = "0"; // default
    }
    return phoneString;
  }

  async loadUserModel(phoneString) {
    console.log("Loading user model for phone:", phoneString);
    try {
      const userResult = await fireStore.collection("user").doc(`FU_${phoneString}`).get();
      const userModel = UserModel.fromDocument(userResult);
      if (userModel) {
        console.log("User model loaded successfully:", userModel.displayName || "");
        return userModel;
      } else {
        console.log("User document not found for:", `FU_${phoneString}`);
        return null;
      }
    } catch (ex) {
      console.error("Error loading user model:", ex);
      return null;
    }
  }

  async saveOrderToCollections(storeId, orderModel, phoneString) {
    console.log("Saving order to collections to " + phoneString);
    
    const orderData = orderModel;
    
    // Save to store orders
    await fireStore.collection("store")
      .doc(storeId)
      .collection("order")
      .doc(orderModel.id)
      .set(orderData);

    // Save to user orders
    if (phoneString !== "0") {
      await fireStore.collection("user")
        .doc(`FU_${phoneString}`)
        .collection("order")
        .doc(orderModel.id)
        .set(orderData);
    }

    // Save to today's orders
    await fireStore.collection("store")
      .doc(storeId)
      .collection("today_order")
      .doc(orderModel.id)
      .set(orderData);

    // Save to printer server queue
    await fireStore.collection("printserver")
      .doc(storeId)
      .collection('qorder')
      .doc(orderModel.id)
      .set(orderData);

    // Save to myInvois
    await fireStore.collection("myinvois")
      .doc(storeId)
      .collection("order")
      .doc(orderModel.id)
      .set(orderData);

    // Save to report
    await fireStore.collection("report")
      .doc(orderModel.id)
      .set(orderData);
  }

  async handleVoucherItems(orderModel, phoneString) {
    console.log("🎫 [VOUCHER] ========== HANDLING VOUCHER ITEMS ==========");
    console.log("🎫 [VOUCHER] Phone String:", phoneString);
    console.log("🎫 [VOUCHER] Order ID:", orderModel.id);
    console.log("🎫 [VOUCHER] Total Order Items:", orderModel.orderitems?.length || 0);
    
    if (!orderModel.orderitems || phoneString === "0") {
      console.log("🎫 [VOUCHER] No order items or invalid phone - skipping voucher processing");
      return;
    }

    // Count voucher items first
    const voucherItems = orderModel.orderitems.filter(item => item.isvoucher);
    console.log("🎫 [VOUCHER] Found", voucherItems.length, "voucher items to process");

    for (const [index, orderItem] of orderModel.orderitems.entries()) {
      if (orderItem.isvoucher) {
        console.log(`🎫 [VOUCHER] ========== Processing Voucher Item ${index + 1} ==========`);
        console.log("🎫 [VOUCHER] Item Title:", orderItem.title);
        console.log("🎫 [VOUCHER] Item Menu ID:", orderItem.menuid);
        console.log("🎫 [VOUCHER] Item Menu voucher ID:", orderItem.menuvoucherid);
        console.log("🎫 [VOUCHER] Item Quantity:", orderItem.qty);
        console.log("🎫 [VOUCHER] Voucher String:", orderItem.voucherstring);
        console.log("🎫 [VOUCHER] Store ID:", orderItem.storeid);
        console.log("🎫 [VOUCHER] Store Title:", orderItem.store);
        
        try {
          const userRef = fireStore.collection("user").doc(`FU_${phoneString}`);
          console.log("🎫 [VOUCHER] User Document Path:", `FU_${phoneString}`);
          
          // Query existing vouchers
          console.log("🎫 [VOUCHER] Querying for existing vouchers with menuid:", orderItem.menuid + " voucher menu id " + orderItem.menuvoucherid);
          
          // DEBUG: List all voucher menu IDs from collection for debugging
          console.log("🎫 [VOUCHER] === DEBUGGING: Listing all voucher menu IDs ===");
          const allVouchersDebug = await userRef.collection("vouchers").get();
          console.log("🎫 [VOUCHER] Total vouchers in collection:", allVouchersDebug.size);
          
          //const menuIdsFound = [];
          allVouchersDebug.forEach(doc => {
            const data = doc.data();
//            if (data.menuvoucherid !== undefined) {
//              menuIdsFound.push({
//                menuVoucherId : data.menuvoucherid,
//                voucherId: data.id,
//                menuId: data.menuId,
//                menuIdType: typeof data.menuId,
//                title: data.title
//              });
//            } else {
              console.log("🎫 [VOUCHER] Voucher with menu voucher id field:", data.menuVoucherId, "Title:", data.title);
            //}
          });
          
          //console.log("🎫 [VOUCHER] All menu IDs found:", menuIdsFound);
          //console.log("🎫 [VOUCHER] Looking for menuId:", orderItem.menuid, "Type:", typeof orderItem.menuid);
          console.log("🎫 [VOUCHER] === END DEBUGGING ===");
          
          const vouchersSnapshot = await userRef
            .collection("vouchers")
            .where('menuVoucherId', '==', orderItem.menuvoucherid)
            .get();
          
          console.log("🎫 [VOUCHER] Found", vouchersSnapshot.size, "existing vouchers");

          if (!vouchersSnapshot.empty) {
            // Use the first matching voucher found
            const voucherDoc = vouchersSnapshot.docs[0];
            const voucher = voucherDoc.data();
            
            console.log("🎫 [VOUCHER] === UPDATING EXISTING VOUCHER ===");
            console.log("🎫 [VOUCHER] Existing Voucher ID:", voucher.id);
            console.log("🎫 [VOUCHER] Existing Voucher Menu ID (for search):", voucher.menuVoucherId );
            console.log("🎫 [VOUCHER] Existing Voucher Quantity:", voucher.quantity || 0);
            console.log("🎫 [VOUCHER] Existing Voucher Title:", voucher.title);
            console.log("🎫 [VOUCHER] Existing Voucher Expires At:", voucher.expiresAt);
            
            // Parse quantity from voucherString if it contains QTY:
            let qty = 1;
            console.log("🎫 [VOUCHER] Parsing quantity from voucherString...");
            
            if (orderItem.voucherstring && orderItem.voucherstring.includes('QTY:')) {
              console.log("🎫 [VOUCHER] Found QTY: pattern in voucherString");
              const qtyMatch = orderItem.voucherstring.match(/QTY:(\d+)/);
              if (qtyMatch) {
                const parsedQty = parseInt(qtyMatch[1]) || 1;
                qty = parsedQty * (orderItem.quantity || 1);
                console.log(parsedQty + " x " + (orderItem.quantity || 1) + " = " + qty);
                console.log("🎫 [VOUCHER] Parsed QTY from string:", parsedQty, "x", (orderItem.quantity || 1), "=", qty);
              } else {
                console.log("🎫 [VOUCHER] QTY pattern found but no match - using default");
                qty = orderItem.qty || 1;
              }
            } else {
              console.log("🎫 [VOUCHER] No QTY pattern in voucherString - using orderItem.qty");
              qty = orderItem.quantity || 1;
            }
            
            console.log("🎫 [VOUCHER] Final calculated quantity to add:", qty);
            
            // Update existing voucher
            const newQuantity = (voucher.quantity || 0) + qty;
            console.log("🎫 [VOUCHER] New total quantity:", voucher.quantity || 0, "+", qty, "=", newQuantity);
            
            const updateData = {
              quantity: newQuantity,
              isredeemed: false,
              isRedeemed: false,
              redeemedAt: null
            };
            
            // Add refreshExpiredDate logic if needed
            // For now, we'll update expiresAt to 2 years from now unless it's NEVER_EXPIRES
            const neverExpires = orderItem.voucherstring && orderItem.voucherstring.includes('NEVER_EXPIRES');
            console.log("🎫 [VOUCHER] Never expires check:", neverExpires);
            
            if (!neverExpires) {
              const expiresAt = new Date();
              expiresAt.setFullYear(expiresAt.getFullYear() + 2);
              updateData.expiresAt = expiresAt;
              console.log("🎫 [VOUCHER] Updated expiry date to:", expiresAt);
            } else {
              console.log("🎫 [VOUCHER] Voucher never expires - keeping null expiry");
            }
            
            console.log("🎫 [VOUCHER] Update data:", JSON.stringify(updateData, null, 2));
            
            await voucherDoc.ref.update(updateData);
            console.log("🎫 [VOUCHER] Successfully updated existing voucher");
            
            // Set the voucher ID in order item
            orderItem.voucherid = voucher.id;
            console.log("🎫 [VOUCHER] Set voucherID in order item:", voucher.id);
            
          } else {
            console.log("🎫 [VOUCHER] === CREATING NEW VOUCHER ===");
            console.log("🎫 [VOUCHER] No existing voucher found - creating new one");
            
            // Parse quantity from voucherString if it contains QTY:
            let qty = 1;
            console.log("🎫 [VOUCHER] Parsing quantity for new voucher...");
            
            if (orderItem.voucherstring && orderItem.voucherstring.includes('QTY:')) {
              console.log("🎫 [VOUCHER] Found QTY: pattern in voucherString");
              const qtyMatch = orderItem.voucherstring.match(/QTY:(\d+)/);
              if (qtyMatch) {
                const parsedQty = parseInt(qtyMatch[1]) || 1;
                qty = parsedQty * (orderItem.quantity || 1);
                console.log("🎫 [VOUCHER] Parsed QTY from string:", parsedQty, "x", (orderItem.qty || 1), "=", qty);
              } else {
                console.log("🎫 [VOUCHER] QTY pattern found but no match - using default");
                qty = orderItem.qty || 1;
              }
            } else {
              console.log("🎫 [VOUCHER] No QTY pattern in voucherString - using orderItem.qty");
              qty = orderItem.qty || 1;
            }
            
            console.log("🎫 [VOUCHER] Final calculated quantity for new voucher:", qty);
            
            // Check if voucher never expires
            const neverExpires = orderItem.voucherstring && orderItem.voucherstring.includes('NEVER_EXPIRES');
            console.log("🎫 [VOUCHER] Never expires check:", neverExpires);
            
            // Generate unique voucher ID
            const voucherId = `VC_${this.generateUUID()}`;
            console.log("🎫 [VOUCHER] Generated new voucher ID:", voucherId);
            
            const expiresAt = neverExpires ? null : new Date(Date.now() + (365 * 2 * 24 * 60 * 60 * 1000));
            console.log("🎫 [VOUCHER] Expires at:", expiresAt);
            
            const newVoucher = {
              id: voucherId,
              menuId: orderItem.menuid,
              menuVoucherId : orderItem.menuvoucherid,
              title: orderItem.title,
              voucherString: orderItem.voucherstring || "",
              storeId: orderItem.storeid,
              storeTitle: orderItem.store || "",
              companyId: "",
              createdAt: new Date(),
              expiresAt: expiresAt,
              orderId: orderModel.id,
              quantity: qty,
              logo: orderItem.img || "",
              isBlindbox: orderItem?.isblindbox ?? false,
              giveOnLogin: false,
              giveOnSignup: false,
              isRedeemed: false,
              redeemedAt: null
            };
            
            console.log("🎫 [VOUCHER] New voucher data:", JSON.stringify(newVoucher, null, 2));
            
            await userRef
              .collection("vouchers")
              .doc(voucherId)
              .set(newVoucher);
              
            console.log("🎫 [VOUCHER] Successfully created new voucher in Firestore");
            
            orderItem.voucherid = voucherId;
            console.log("🎫 [VOUCHER] Set voucherID in order item:", voucherId);
          }
          
          console.log("🎫 [VOUCHER] ========== Completed Processing Voucher Item", index + 1, "==========");
          
        } catch (ex) {
          console.error("❌ [VOUCHER] Error processing voucher item", index + 1, ":", ex);
          console.error("❌ [VOUCHER] Order item data:", JSON.stringify(orderItem, null, 2));
        }
      }
    }
    
    console.log("🎫 [VOUCHER] ========== COMPLETED ALL VOUCHER PROCESSING ==========");
    const processedVouchers = orderModel.orderitems.filter(item => item.isvoucher && item.voucherid);
    console.log("🎫 [VOUCHER] Successfully processed", processedVouchers.length, "out of", voucherItems.length, "voucher items");
  }

  async handleFreeVouchers(orderModel, phoneString) {
    console.log("🎁 [FREE_VOUCHER] ========== STARTING FREE VOUCHER PROCESSING ==========");
    console.log("🎁 [FREE_VOUCHER] Order ID:", orderModel.id);
    console.log("🎁 [FREE_VOUCHER] Phone String:", phoneString);
    console.log("🎁 [FREE_VOUCHER] Free Vouchers Count:", orderModel.freevouchers?.length || 0);

    if (!orderModel.freevouchers || !Array.isArray(orderModel.freevouchers) || orderModel.freevouchers.length === 0) {
      console.log("🎁 [FREE_VOUCHER] No free vouchers to process");
      return;
    }

    if (phoneString === "0") {
      console.log("❌ [FREE_VOUCHER] Invalid phone number, cannot save vouchers");
      return;
    }

    const userRef = fireStore.collection("user").doc(`FU_${phoneString}`);

    // Process each free voucher
    for (let index = 0; index < orderModel.freevouchers.length; index++) {
      const voucherModel = orderModel.freevouchers[index];
      console.log(`🎁 [FREE_VOUCHER] ========== Processing Free Voucher ${index + 1} ==========`);
      
      try {
        console.log("🎁 [FREE_VOUCHER] Voucher Model:", JSON.stringify(voucherModel, null, 2));

        // Check if user already has this voucher (by id)
        if (voucherModel.id) {
          console.log("🔍 [FREE_VOUCHER] Checking for existing voucher with id:", voucherModel.id);
          
          const existingVoucherDoc = await userRef
            .collection("vouchers")
            .doc(voucherModel.id)
            .get();

          if (existingVoucherDoc.exists) {
            console.log("⚠️ [FREE_VOUCHER] User already has voucher with id:", voucherModel.id);
            console.log("⏭️ [FREE_VOUCHER] Skipping duplicate voucher");
            continue; // Skip this voucher
          }
        }

        // Generate voucher ID if not provided
        const voucherId = voucherModel.id;
        console.log("🎁 [FREE_VOUCHER] Voucher ID:", voucherId);

        // Copy voucher model directly and ensure it has an ID
        // Set createdAt to tomorrow's date
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const voucherToSave = {
          ...voucherModel,
          id: voucherId,
          createdAt: tomorrow
        };

        console.log("🎁 [FREE_VOUCHER] Copying voucher data:", JSON.stringify(voucherToSave, null, 2));

        // Save voucher to user's vouchers collection
        await userRef
          .collection("vouchers")
          .doc(voucherId)
          .set(voucherToSave);

        console.log("🎁 [FREE_VOUCHER] Successfully copied free voucher to Firestore");
        
        // Update the free voucher in the order model with the ID
        orderModel.freevouchers[index].id = voucherId;
        console.log("🎁 [FREE_VOUCHER] Updated voucher with ID:", voucherId);

      } catch (error) {
        console.error(`❌ [FREE_VOUCHER] Error processing free voucher ${index + 1}:`, error);
        console.error("❌ [FREE_VOUCHER] Voucher data:", JSON.stringify(voucherModel, null, 2));
      }
    }

    console.log("🎁 [FREE_VOUCHER] ========== COMPLETED FREE VOUCHER PROCESSING ==========");
    console.log("🎁 [FREE_VOUCHER] Total vouchers processed:", orderModel.freevouchers.length);
  }

  // Helper method to generate UUID (similar to Dart's Uuid().v4())
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async copyLoyaltyCardsToUser(userId, loyaltyCardIds = [], machineModelId = null) {
    console.log("🎫 [LOYALTY_CARDS] ========== STARTING LOYALTY CARD COPYING ==========");
    console.log("🎫 [LOYALTY_CARDS] User ID:", userId);
    console.log("🎫 [LOYALTY_CARDS] Loyalty Card IDs:", loyaltyCardIds);
    console.log("🎫 [LOYALTY_CARDS] Machine Model ID:", machineModelId || "Not provided");

    try {
      const userRef = fireStore.collection('user').doc(userId);
      const cardBatch = fireStore.batch();

      // Copy loyalty cards if any are configured
      if (loyaltyCardIds.length > 0) {
        console.log("🔍 [LOYALTY_CARDS] Checking which cards user already has...");
        
        // First check which cards the user already has
        const userCardsSnapshot = await userRef
          .collection('loyalty_cards')
          .where('id', 'in', loyaltyCardIds)
          .get();

        // Create a set of existing card IDs for faster lookup
        const existingCardIds = new Set(userCardsSnapshot.docs.map(doc => doc.data().id));
        console.log("🎫 [LOYALTY_CARDS] User already has", existingCardIds.size, "loyalty cards");
        console.log("🎫 [LOYALTY_CARDS] Existing card IDs:", Array.from(existingCardIds));

        // Filter out cards that user already has
        const cardsToAdd = loyaltyCardIds.filter(cardId => !existingCardIds.has(cardId));
        console.log("🎫 [LOYALTY_CARDS] ===== FILTERING RESULTS =====");
        console.log("🎫 [LOYALTY_CARDS] Requested cards:", loyaltyCardIds);
        console.log("🎫 [LOYALTY_CARDS] Already owned:", Array.from(existingCardIds));
        console.log("🎫 [LOYALTY_CARDS] Cards to add:", cardsToAdd);
        console.log("🎫 [LOYALTY_CARDS] Total new cards to copy:", cardsToAdd.length);

        if (cardsToAdd.length > 0) {
          console.log("📥 [LOYALTY_CARDS] Fetching loyalty cards to copy...");
          console.log("📥 [LOYALTY_CARDS] Cards to fetch:", cardsToAdd);
          
          // Get only the cards that need to be copied from loyalty_cards collection
          const loyaltyCardsSnapshot = await fireStore.collection('loyal_card')
            .where('id', 'in', cardsToAdd)
            .get();
            
          console.log("📥 [LOYALTY_CARDS] Found", loyaltyCardsSnapshot.docs.length, "loyalty cards in database");
          
          // Debug: Show which cards were found vs requested
          const foundCardIds = loyaltyCardsSnapshot.docs.map(doc => doc.data().id);
          const missingCardIds = cardsToAdd.filter(cardId => !foundCardIds.includes(cardId));
          
          if (foundCardIds.length > 0) {
            console.log("📥 [LOYALTY_CARDS] Found cards:", foundCardIds);
          }
          if (missingCardIds.length > 0) {
            console.log("⚠️ [LOYALTY_CARDS] Missing cards (not found in database):", missingCardIds);
          }

          // Copy only new cards to user's collection
          for (const doc of loyaltyCardsSnapshot.docs) {
            const loyaltyCardData = doc.data();
            const cardId = loyaltyCardData.id;
            const newLoyaltyCardRef = userRef
              .collection('loyalty_cards')
              .doc(cardId);
            
            cardBatch.set(newLoyaltyCardRef, loyaltyCardData);
            
            // 🐛 Enhanced debug info about the loyalty card being copied
            console.log("🎫 [LOYALTY_CARDS] ===== COPYING LOYALTY CARD =====");
            console.log("🎫 [LOYALTY_CARDS] Card ID:", cardId);
            console.log("🎫 [LOYALTY_CARDS] Card Title:", loyaltyCardData.title || "No title");
            console.log("🎫 [LOYALTY_CARDS] Card Type:", loyaltyCardData.type || "No type");
            console.log("🎫 [LOYALTY_CARDS] Card Description:", loyaltyCardData.description || "No description");
            console.log("🎫 [LOYALTY_CARDS] Card Status:", loyaltyCardData.isActive ? "Active" : "Inactive");
            console.log("🎫 [LOYALTY_CARDS] Card Data:", JSON.stringify(loyaltyCardData, null, 2));
            console.log("🎫 [LOYALTY_CARDS] Target User Doc:", userId);
            console.log("🎫 [LOYALTY_CARDS] Target Collection: loyalty_cards");
            console.log("🎫 [LOYALTY_CARDS] ===== END LOYALTY CARD INFO =====");
          }
          console.log(`✅ [LOYALTY_CARDS] Queued ${cardsToAdd.length} new loyalty cards for copying`);
        } else {
          console.log("⏭️ [LOYALTY_CARDS] All loyalty cards already exist for user, skipping card copying");
        }
      } else {
        console.log("⏭️ [LOYALTY_CARDS] No loyalty card IDs provided");
      }

      // Phase 1: commit loyalty cards first to ensure subsequent voucher logic sees them
      console.log("💾 [LOYALTY_CARDS] ===== COMMITTING LOYALTY CARDS BATCH =====");
      await cardBatch.commit();
      console.log("✅ [LOYALTY_CARDS] Loyalty cards batch committed");

      // Phase 2a: copy relevant vouchers in a fresh batch so reads include committed cards
      const voucherBatch = fireStore.batch();
      await this._copyRelevantVouchersToUser(userRef, voucherBatch, machineModelId);

      console.log("💾 [VOUCHERS] ===== COMMITTING VOUCHERS BATCH =====");
      await voucherBatch.commit();
      console.log("✅ [VOUCHERS] Vouchers batch committed");

      // Phase 2b: copy relevant stamp cards from crm_stamp_card into user/stampcard
      console.log("🎫 [STAMP] ===== STARTING STAMP CARD COPYING ===== " + userId);
      console.log("💾 [STAMP] ===== COPYING RELEVANT STAMP CARDS =====");
      const stampBatch = fireStore.batch();
      await this._copyRelevantStampCardsToUser(userRef, stampBatch, loyaltyCardIds);
      console.log("💾 [STAMP] ===== COMMITTING STAMP CARDS BATCH =====");
      await stampBatch.commit();
      console.log("✅ [STAMP] Stamp cards batch committed");

      // Step 10.8: Move temp promotions to used promotions for this user
      console.log("🔟.8 [PROMO] ===== MOVING temp_promotion TO used_promotion =====");
      await this._moveTempPromotionsToUsed(userRef);
      console.log("✅ [PROMO] Moved temp promotions to used promotions (if any)");

      console.log("✅ [LOYALTY_CARDS] Successfully copied loyalty cards and vouchers for user:", userId);
      
      console.log("🎫 [LOYALTY_CARDS] ========== COMPLETED LOYALTY CARD COPYING ==========");
      return { success: true, message: "Loyalty cards and vouchers copied successfully" };

    } catch (error) {
      console.error("❌ [LOYALTY_CARDS] Error copying loyalty cards and vouchers:", error);
      console.error("❌ [LOYALTY_CARDS] Error stack:", error.stack);
      throw error;
    }
  }

  async _copyRelevantVouchersToUser(userRef, batch, machineModelId = null) {
    console.log("🎁 [RELEVANT_VOUCHERS] ========== COPYING RELEVANT VOUCHERS ==========");
    console.log("🎁 [RELEVANT_VOUCHERS] Machine Model ID:", machineModelId || "Not provided");
    
    try {
      // 1. Get all existing user vouchers to avoid duplicates
      console.log("🔍 [RELEVANT_VOUCHERS] Getting existing user vouchers...");
      const existingUserVouchers = await userRef.collection('vouchers').get();
      const existingVoucherIds = new Set(existingUserVouchers.docs.map(doc => doc.id));
      console.log("🔍 [RELEVANT_VOUCHERS] User has", existingVoucherIds.size, "existing vouchers:", Array.from(existingVoucherIds));
      
      // 2. Get existing user loyalty cards to check for giveOnLogin logic
      console.log("🔍 [RELEVANT_VOUCHERS] Getting existing user loyalty cards...");
      const existingUserCards = await userRef.collection('loyalty_cards').get();
      const existingCardIds = new Set(existingUserCards.docs.map(doc => doc.id));
      console.log("🔍 [RELEVANT_VOUCHERS] User has", existingCardIds.size, "existing loyalty cards:", Array.from(existingCardIds));

      // 3. Get all vouchers from crm_voucher collection
      console.log("🔍 [RELEVANT_VOUCHERS] Fetching all vouchers from crm_voucher collection...");
      const allVouchersSnapshot = await fireStore.collection('crm_voucher').get();
      console.log("🔍 [RELEVANT_VOUCHERS] Found", allVouchersSnapshot.docs.length, "total vouchers in crm_voucher collection");
      
      let vouchersProcessed = 0;
      let vouchersSkippedAlreadyExists = 0;
      let vouchersSkippedExpired = 0;
      let vouchersSkippedLimitReached = 0;
      let vouchersSkippedNoMatchingCard = 0;
      let vouchersQueued = 0;
      let loyaltyCardsQueued = 0;
      let voucherCountsIncremented = 0;
      let voucherCountIncrementFailed = 0;

      for (const voucherDoc of allVouchersSnapshot.docs) {
        const voucherData = voucherDoc.data();
        const voucherId = voucherDoc.id;
        vouchersProcessed++;
        
        console.log(`🎁 [VOUCHER_${vouchersProcessed}] Processing voucher: ${voucherId}`);
        
        // Skip if user already has this voucher
        if (existingVoucherIds.has(voucherId)) {
          vouchersSkippedAlreadyExists++;
          console.log(`⏭️ [VOUCHER_${vouchersProcessed}] User already has voucher: ${voucherId}`);
          continue;
        }
        
        const voucherStoreId = voucherData.storeId || voucherData.store_id || '';
        const voucherCompanyId = voucherData.companyId || voucherData.company_id || '';
        const voucherMachineId = voucherData.machineId || voucherData.machine_id || '';
        const giveOnLogin = voucherData.giveOnLogin || voucherData.give_on_login || false;
        const expiresAt = voucherData.expiresAt || voucherData.expires_at;
        
        // Validate voucher storeId and companyId against user's loyalty cards
        let hasMatchingLoyaltyCard = false;
        let loyaltyCardValidationReason = "";
        
        if (voucherStoreId || voucherCompanyId) {
          // Check if user has a loyalty card that matches the voucher's store/company
          for (const cardDoc of existingUserCards.docs) {
            const cardData = cardDoc.data();
            const cardStoreId = cardData.storeId || cardData.storeid || '';
            const cardCompanyId = cardData.companyId || cardData.companyid || '';
            
            // Match if either storeId or companyId matches (when they are set)
            const storeMatches = voucherStoreId && cardStoreId && voucherStoreId === cardStoreId;
            const companyMatches = voucherCompanyId && cardCompanyId && voucherCompanyId === cardCompanyId;
            
            if (storeMatches || companyMatches) {
              hasMatchingLoyaltyCard = true;
              loyaltyCardValidationReason = storeMatches 
                ? `matches loyalty card store: ${cardStoreId}` 
                : `matches loyalty card company: ${cardCompanyId}`;
              break;
            }
          }
          
          if (!hasMatchingLoyaltyCard) {
            vouchersSkippedNoMatchingCard++;
            console.log(`❌ [VOUCHER_${vouchersProcessed}] Skipping voucher ${voucherId}: No matching loyalty card found for store: ${voucherStoreId} or company: ${voucherCompanyId}`);
            continue; // Skip this voucher
          } else {
            console.log(`✅ [VOUCHER_${vouchersProcessed}] Voucher ${voucherId} validation passed: ${loyaltyCardValidationReason}`);
          }
        }
        
        let shouldCopyVoucher = false;
        let voucherReason = "";
        
        // Priority 1: If voucher is set with giveOnLogin, copy regardless of storeId and expiry
        if (giveOnLogin) {
          shouldCopyVoucher = true;
          voucherReason = "giveOnLogin flag is true";
          console.log(`✅ [VOUCHER_${vouchersProcessed}] Found giveOnLogin voucher: ${voucherId}`);
          
          // Special condition: If giveOnLogin voucher has storeId and user doesn't have that loyalty card,
          // copy the loyalty card as well
          if (voucherStoreId && !existingCardIds.has(voucherStoreId)) {
            console.log(`🎫 [VOUCHER_${vouchersProcessed}] giveOnLogin voucher needs loyalty card: ${voucherStoreId}`);
            const copied = await this._copyLoyaltyCardIfExists(userRef, batch, voucherStoreId);
            if (copied) {
              loyaltyCardsQueued++;
              existingCardIds.add(voucherStoreId); // Update our tracking
            }
          }
        }
        // Priority 2: If voucher machineId contains this machine's ID and voucher is not expired
        else if (voucherMachineId && machineModelId) {
          // Check if voucher is expired
          let isExpired = false;
          if (expiresAt) {
            const expiryDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
            isExpired = new Date() > expiryDate;
          }
          
          if (!isExpired) {
            // Check if machine ID matches (can be comma-separated list)
            const machineIds = voucherMachineId.split(',').map(id => id.trim());
            if (machineIds.includes(machineModelId)) {
              shouldCopyVoucher = true;
              voucherReason = `machine-specific voucher for machine: ${machineModelId}`;
              console.log(`✅ [VOUCHER_${vouchersProcessed}] Found machine-specific voucher: ${voucherId} for machine: ${machineModelId}`);
            }
          } else {
            vouchersSkippedExpired++;
            console.log(`⏭️ [VOUCHER_${vouchersProcessed}] Skipping expired machine voucher: ${voucherId} (expired: ${expiresAt})`);
          }
        }
        // Priority 3: If storeId is set and voucher is not expired  
        else if (voucherStoreId) {
          // Check if voucher is expired
          let isExpired = false;
          if (expiresAt) {
            const expiryDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
            isExpired = new Date() > expiryDate;
          }
          
          if (!isExpired) {
            // For now, copy all store-specific vouchers (you can add store filtering logic here)
            shouldCopyVoucher = true;
            voucherReason = `store-specific voucher for store: ${voucherStoreId}`;
            console.log(`✅ [VOUCHER_${vouchersProcessed}] Found store-specific voucher: ${voucherId} for store: ${voucherStoreId}`);
          } else {
            vouchersSkippedExpired++;
            console.log(`⏭️ [VOUCHER_${vouchersProcessed}] Skipping expired store voucher: ${voucherId} (expired: ${expiresAt})`);
          }
        }
        // Priority 4: If voucher companyId matches and voucher is not expired
        else if (voucherCompanyId) {
          // Check if voucher is expired
          let isExpired = false;
          if (expiresAt) {
            const expiryDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
            isExpired = new Date() > expiryDate;
          }
          
          if (!isExpired) {
            // For now, copy all company-specific vouchers (you can add company filtering logic here)
            shouldCopyVoucher = true;
            voucherReason = `company-specific voucher for company: ${voucherCompanyId}`;
            console.log(`✅ [VOUCHER_${vouchersProcessed}] Found company-specific voucher: ${voucherId} for company: ${voucherCompanyId}`);
          } else {
            vouchersSkippedExpired++;
            console.log(`⏭️ [VOUCHER_${vouchersProcessed}] Skipping expired company voucher: ${voucherId} (expired: ${expiresAt})`);
          }
        }
        
        if (shouldCopyVoucher) {
          // ✨ Check voucher limit before copying
          let limitCheckPassed = true;
          let limitCheckMessage = "No machine model provided - proceeding without limit check";

          if (machineModelId) {
            console.log(`🔍 [VOUCHER_LIMIT] Checking limit for voucher ${voucherId} on machine model ${machineModelId}...`);
            
            try {
              const limitResult = await this.checkVoucherLimit(machineModelId, voucherId);
              
              if (limitResult.success && limitResult.limitReached) {
                limitCheckPassed = false;
                limitCheckMessage = `Limit reached (${limitResult.count}/${limitResult.limit})`;
                vouchersSkippedLimitReached++;
                console.log(`⚠️ [VOUCHER_LIMIT] Skipping voucher ${voucherId}: ${limitCheckMessage}`);
              } else if (limitResult.success && !limitResult.limitReached) {
                limitCheckMessage = limitResult.limit !== null 
                  ? `Limit OK (${limitResult.count}/${limitResult.limit})` 
                  : "No limit set";
                console.log(`✅ [VOUCHER_LIMIT] Voucher ${voucherId}: ${limitCheckMessage}`);
              } else {
                // If there's an error checking the limit, log it but proceed with copying
                console.log(`⚠️ [VOUCHER_LIMIT] Error checking limit for voucher ${voucherId}, proceeding anyway: ${limitResult.message}`);
                limitCheckMessage = "Limit check failed - proceeding anyway";
              }
            } catch (limitError) {
              console.error(`❌ [VOUCHER_LIMIT] Exception checking limit for voucher ${voucherId}:`, limitError);
              limitCheckMessage = "Limit check exception - proceeding anyway";
              // Proceed with copying if there's an exception
            }
          }

          if (limitCheckPassed) {
            // Prepare voucher data for copying
            const newVoucherData = { ...voucherData };
            
            // Only set default expiry date if it hasn't been set and it's not a giveOnLogin voucher
            if (!expiresAt && !giveOnLogin) {
              // Set default expiry to 2 years from now only if no expiry date exists
              const defaultExpiry = new Date();
              defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 2);
              newVoucherData.expiresAt = defaultExpiry;
              console.log(`📅 [VOUCHER_${vouchersProcessed}] Set expiry date for voucher ${voucherId} to: ${defaultExpiry}`);
            } else if (expiresAt) {
              const expiryDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
              console.log(`📅 [VOUCHER_${vouchersProcessed}] Voucher ${voucherId} already has expiry date: ${expiryDate}`);
            }
            
            // Ensure voucher is not redeemed
            newVoucherData.isRedeemed = false;
            delete newVoucherData.redeemedAt;
            newVoucherData.redeemedCount = 0;
            newVoucherData.addedAt = new Date();
            newVoucherData.machineModelId = machineModelId || null;
            newVoucherData.limitCheckResult = limitCheckMessage;
            newVoucherData.copyReason = voucherReason;
            
            // Copy voucher to user's collection
            const newVoucherRef = userRef.collection('vouchers').doc(voucherId);
            batch.set(newVoucherRef, newVoucherData);
            vouchersQueued++;
            
            console.log(`🎁 [VOUCHER_${vouchersProcessed}] Queued voucher for copying: ${voucherId} (${voucherReason}) [${limitCheckMessage}]`);
            
            // ✨ Increment voucher count after successful copying (if machineModelId provided)
            if (machineModelId) {
              try {
                console.log(`📈 [VOUCHER_COUNT] Incrementing count for voucher ${voucherId} on machine ${machineModelId}...`);
                const incrementResult = await this.incrementVoucherCount(machineModelId, voucherId);
                
                if (incrementResult.success) {
                  voucherCountsIncremented++;
                  console.log(`✅ [VOUCHER_COUNT] Successfully incremented count for ${voucherId}: ${incrementResult.count}/${incrementResult.limit || 'unlimited'}`);
                } else {
                  voucherCountIncrementFailed++;
                  console.log(`⚠️ [VOUCHER_COUNT] Failed to increment count for ${voucherId}: ${incrementResult.message}`);
                }
              } catch (incrementError) {
                voucherCountIncrementFailed++;
                console.error(`❌ [VOUCHER_COUNT] Exception incrementing count for ${voucherId}:`, incrementError);
                // Don't fail the whole process if count increment fails
              }
            } else {
              console.log(`ℹ️ [VOUCHER_COUNT] No machine model provided - skipping count increment for ${voucherId}`);
            }
          }
        }
      }
      
      console.log(`📊 [RELEVANT_VOUCHERS] ===== FINAL SUMMARY =====`);
      console.log(`   - Total vouchers processed: ${vouchersProcessed}`);
      console.log(`   - Vouchers queued for copying: ${vouchersQueued}`);
      console.log(`   - Loyalty cards queued: ${loyaltyCardsQueued}`);
      console.log(`   - Voucher counts incremented: ${voucherCountsIncremented}`);
      console.log(`   - Voucher count increment failed: ${voucherCountIncrementFailed}`);
      console.log(`   - Skipped (already exists): ${vouchersSkippedAlreadyExists}`);
      console.log(`   - Skipped (expired): ${vouchersSkippedExpired}`);
      console.log(`   - Skipped (limit reached): ${vouchersSkippedLimitReached}`);
      console.log(`   - Skipped (no matching loyalty card): ${vouchersSkippedNoMatchingCard}`);
      console.log(`📊 [RELEVANT_VOUCHERS] ===== END SUMMARY =====`);
      
    } catch (error) {
      console.error("❌ [RELEVANT_VOUCHERS] Error copying relevant vouchers:", error);
      console.error("❌ [RELEVANT_VOUCHERS] Error stack:", error.stack);
      // Don't throw here, just log the error so loyalty card copying can still proceed
    }
  }

  async _copyRelevantStampCardsToUser(userRef, batch, loyaltyCardIds = []) {
    try {
      console.log("🎟️ [STAMP] ========== COPYING RELEVANT STAMP CARDS ==========");
      const userId = userRef.id;

      // 1) Read existing user stamp cards to avoid duplicates
      const existingSnap = await userRef.collection('stampcard').get();
      const existingIds = new Set(existingSnap.docs.map(d => d.id));
      console.log("🎟️ [STAMP] Existing user stamp cards:", existingIds.size);

      // 2) Fetch all active stamp cards from crm_stamp_card
      const crmSnap = await fireStore.collection('crm_stamp_card')
        .where('status', 'in', ['in_progress', 'completed', 'active'])
        .get();
      console.log("🎟️ [STAMP] Found", crmSnap.docs.length, "cards in crm_stamp_card");

      let queued = 0;

      for (const doc of crmSnap.docs) {
        const data = doc.data() || {};
        const loyaltyCardId = data.loyaltyCardId || '';

        // If request specified loyaltyCardIds, only take those matching
        if (Array.isArray(loyaltyCardIds) && loyaltyCardIds.length > 0) {
          if (!loyaltyCardId || !loyaltyCardIds.includes(loyaltyCardId)) {
            continue;
          }
        }

        const targetId = data.id || doc.id;
        if (!targetId) continue;
        if (existingIds.has(targetId)) {
          continue; // skip duplicate
        }

        // Normalize with model then map to Firestore-friendly object
        let model;
        try {
          model = StampCardModel.fromMap({ id: targetId, ...data });
        } catch (_) {
          model = new StampCardModel({ id: targetId, ...data });
        }

        // Force userId on copy
        model.userId = userId;

        const dstRef = userRef.collection('stampcard').doc(model.id);
        batch.set(dstRef, model.toMap());
        queued++;
      }

      console.log(`🎟️ [STAMP] Queued ${queued} stamp cards for copying`);
    } catch (error) {
      console.error("❌ [STAMP] Error copying stamp cards:", error);
    }
  }

  async _moveTempPromotionsToUsed(userRef) {
    try {
      const tempSnap = await userRef.collection('temp_promotion').get();
      if (tempSnap.empty) {
        console.log('🔟.8 [PROMO] No temp promotions to move');
        return;
      }

      let batch = fireStore.batch();
      let ops = 0;
      let moved = 0;

      for (const doc of tempSnap.docs) {
        const data = doc.data() || {};
        const usedRef = userRef.collection('used_promotion').doc(doc.id);
        batch.set(usedRef, { ...data, movedAt: new Date() });
        batch.delete(doc.ref);
        ops += 2;
        moved += 1;

        // Commit periodically to respect Firestore batch limits
        if (ops >= 400) {
          await batch.commit();
          batch = fireStore.batch();
          ops = 0;
        }
      }

      if (ops > 0) {
        await batch.commit();
      }

      console.log(`🔟.8 [PROMO] Moved ${moved} temp promotions to used_promotion`);
    } catch (error) {
      console.error('❌ [PROMO] Error moving temp promotions to used promotions:', error);
    }
  }

  async _copyLoyaltyCardIfExists(userRef, batch, cardId) {
    try {
      console.log(`🎫 [LOYALTY_CARD_COPY] Attempting to copy loyalty card: ${cardId}`);
      
      // Get the loyalty card from loyal_card collection
      const loyaltyCardDoc = await fireStore.collection('loyal_card').doc(cardId).get();
      
      if (loyaltyCardDoc.exists) {
        const loyaltyCardData = loyaltyCardDoc.data();
        const newLoyaltyCardRef = userRef.collection('loyalty_cards').doc(cardId);
        
        batch.set(newLoyaltyCardRef, loyaltyCardData);
        console.log(`✅ [LOYALTY_CARD_COPY] Queued loyalty card for copying: ${cardId}`);
        return true;
      } else {
        console.log(`⚠️ [LOYALTY_CARD_COPY] Loyalty card not found in database: ${cardId}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ [LOYALTY_CARD_COPY] Error copying loyalty card ${cardId}:`, error);
      return false;
    }
  }

  async handleCopyLoyaltyCards(req, res) {
    console.log("🎫 [API] ========== COPY LOYALTY CARDS ENDPOINT ==========");
    
    try {
      const { userId, loyaltyCardIds, machineModelId } = req.body;
      
      // Validate required parameters
      if (!userId) {
        console.log("❌ [API] Missing required parameter: userId");
        return res.status(400).json({
          success: false,
          error: "Missing required parameter: userId"
        });
      }

      // loyaltyCardIds is optional, default to empty array
      const cardIds = Array.isArray(loyaltyCardIds) ? loyaltyCardIds : [];
      
      console.log("🎫 [API] Request parameters:");
      console.log("🎫 [API] - User ID:", userId);
      console.log("🎫 [API] - Loyalty Card IDs:", cardIds);
      console.log("🎫 [API] - Machine Model ID:", machineModelId || "Not provided");

      // Call the main method with machine model ID
      const result = await this.copyLoyaltyCardsToUser(userId, cardIds, machineModelId);
      
      console.log("✅ [API] Loyalty cards copying completed successfully");
      res.status(200).json(result);
      
    } catch (error) {
      console.error("❌ [API] Error in copy loyalty cards endpoint:", error);
      console.error("❌ [API] Error stack:", error.stack);
      
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error"
      });
    }
  }

  /**
   * API Endpoint: Award Order Loyalty
   * POST /awardOrderLoyalty
   * Body: { storeId: "S_xxxxx", orderId: "O_xxxxx", userPhoneNumber: "1234567890" }
   * 
   * Loads an order from Firestore, retrieves the machine model using devicenumber and merchantid,
   * checks if the user owns the loyalty cards, copies them if not, and awards loyalty points and stamps.
   */
  async handleAwardOrderLoyalty(req, res) {
    console.log("🎁 [AWARD_ORDER_LOYALTY] ========== AWARD ORDER LOYALTY ENDPOINT ==========");
    
    try {
      const { storeId, orderId, userPhoneNumber } = req.body;
      
      // Validate required parameters
      if (!storeId) {
        console.log("❌ [AWARD_ORDER_LOYALTY] Missing required parameter: storeId");
        return res.status(400).json({
          success: false,
          error: "Missing required parameter: storeId"
        });
      }
      
      if (!orderId) {
        console.log("❌ [AWARD_ORDER_LOYALTY] Missing required parameter: orderId");
        return res.status(400).json({
          success: false,
          error: "Missing required parameter: orderId"
        });
      }
      
      if (!userPhoneNumber) {
        console.log("❌ [AWARD_ORDER_LOYALTY] Missing required parameter: userPhoneNumber");
        return res.status(400).json({
          success: false,
          error: "Missing required parameter: userPhoneNumber"
        });
      }

      // Normalize phone number - strip FU_ prefix if present
      const normalizedPhoneNumber = userPhoneNumber.startsWith('FU_') 
        ? userPhoneNumber.substring(3) 
        : userPhoneNumber;

      console.log("🎁 [AWARD_ORDER_LOYALTY] Request parameters:");
      console.log("🎁 [AWARD_ORDER_LOYALTY] - Store ID:", storeId);
      console.log("🎁 [AWARD_ORDER_LOYALTY] - Order ID:", orderId);
      console.log("🎁 [AWARD_ORDER_LOYALTY] - User Phone Number (raw):", userPhoneNumber);
      console.log("🎁 [AWARD_ORDER_LOYALTY] - User Phone Number (normalized):", normalizedPhoneNumber);

      // Call the core logic function
      const result = await this.awardOrderLoyalty(storeId, orderId, normalizedPhoneNumber);

      console.log("✅ [AWARD_ORDER_LOYALTY] Award order loyalty completed successfully");
      res.status(200).json(result);
      
    } catch (error) {
      console.error("❌ [AWARD_ORDER_LOYALTY] Error in award order loyalty endpoint:", error);
      console.error("❌ [AWARD_ORDER_LOYALTY] Error stack:", error.stack);
      
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error"
      });
    }
  }

  /**
   * Core logic function to award loyalty for an existing order
   * @param {string} storeId - The store ID (e.g., "S_xxxxx")
   * @param {string} orderId - The order ID (e.g., "O_xxxxx")
   * @param {string} userPhoneNumber - The user's phone number
   * @returns {Promise<Object>} Result object with success status and details
   */
  async awardOrderLoyalty(storeId, orderId, userPhoneNumber) {
    console.log("🎁 [AWARD_LOYALTY] ========== STARTING AWARD ORDER LOYALTY ==========");
    console.log("🎁 [AWARD_LOYALTY] Store ID:", storeId);
    console.log("🎁 [AWARD_LOYALTY] Order ID:", orderId);
    console.log("🎁 [AWARD_LOYALTY] User Phone Number:", userPhoneNumber);

    try {
      // Step 1: Format the store ID and order ID for Firestore path
      const formattedStoreId = storeId.startsWith('S_') ? storeId : `S_${storeId}`;
      const formattedOrderId = orderId.startsWith('O_') ? orderId : `O_${orderId}`;
      
      console.log("🎁 [AWARD_LOYALTY] Step 1: Loading order from Firestore...");
      console.log("🎁 [AWARD_LOYALTY] Path: myreport/" + formattedStoreId + "/order/" + formattedOrderId);

      // Step 2: Load the order from myreport/{storeId}/order/{orderId}
      const orderDoc = await fireStore
        .collection('myreport')
        .doc(formattedStoreId)
        .collection('order')
        .doc(formattedOrderId)
        .get();

      if (!orderDoc.exists) {
        console.log("❌ [AWARD_LOYALTY] Order not found in Firestore");
        return {
          success: false,
          error: "Order not found",
          storeId: formattedStoreId,
          orderId: formattedOrderId
        };
      }

      const orderModel = orderDoc.data();
      console.log("✅ [AWARD_LOYALTY] Step 1 Complete: Order loaded successfully");
      console.log("🎁 [AWARD_LOYALTY] Order Total Paid:", orderModel.totalpaid);

      // Step 3: Extract devicenumber and merchantid from the order
      const deviceNumber = orderModel.devicenumber;
      const merchantId = orderModel.merchantid;
      
      console.log("🎁 [AWARD_LOYALTY] Step 2: Extracting device info...");
      console.log("🎁 [AWARD_LOYALTY] Device Number:", deviceNumber);
      console.log("🎁 [AWARD_LOYALTY] Merchant ID:", merchantId);

      if (!deviceNumber || !merchantId) {
        console.log("❌ [AWARD_LOYALTY] Missing devicenumber or merchantid in order");
        return {
          success: false,
          error: "Order does not have devicenumber or merchantid - not a vending order",
          storeId: formattedStoreId,
          orderId: formattedOrderId
        };
      }

      // Step 4: Load the machine model from merchant_device collection
      const merchantDeviceId = `${merchantId}_${deviceNumber}`;
      console.log("🎁 [AWARD_LOYALTY] Step 3: Loading machine model...");
      console.log("🎁 [AWARD_LOYALTY] Merchant Device ID:", merchantDeviceId);

      const machineModelDoc = await fireStore
        .collection('merchant_device')
        .doc(merchantDeviceId)
        .get();

      if (!machineModelDoc.exists) {
        console.log("❌ [AWARD_LOYALTY] Machine model not found in merchant_device collection");
        return {
          success: false,
          error: "Machine model not found",
          merchantDeviceId: merchantDeviceId
        };
      }

      const machineModel = machineModelDoc.data();
      console.log("✅ [AWARD_LOYALTY] Step 3 Complete: Machine model loaded successfully");
      console.log("🎁 [AWARD_LOYALTY] Machine Model ID:", machineModel.id);
      console.log("🎁 [AWARD_LOYALTY] Machine Title:", machineModel.title);

      // Step 5: Get loyalty card IDs from machine model
      const loyaltyCardIds = machineModel.loyaltycardids || [];
      console.log("🎁 [AWARD_LOYALTY] Step 4: Getting loyalty card IDs...");
      console.log("🎁 [AWARD_LOYALTY] Loyalty Card IDs:", loyaltyCardIds);

      // Step 6: Format user ID and copy loyalty cards if needed
      const userId = `FU_${userPhoneNumber}`;
      console.log("🎁 [AWARD_LOYALTY] Step 5: Processing loyalty cards for user:", userId);

      let loyaltyCardsResult = null;
      if (loyaltyCardIds.length > 0) {
        // Call the existing copyLoyaltyCardsToUser function
        // This function already checks if user owns the cards and only copies missing ones
        loyaltyCardsResult = await this.copyLoyaltyCardsToUser(userId, loyaltyCardIds, machineModel.id);
        console.log("✅ [AWARD_LOYALTY] Step 5 Complete: Loyalty cards processed");
      } else {
        console.log("⏭️ [AWARD_LOYALTY] Step 5 Skipped: No loyalty card IDs configured for this machine");
      }

      // Step 7: Load store model for loyalty points calculation
      console.log("🎁 [AWARD_LOYALTY] Step 6: Loading store model...");
      const storeDoc = await fireStore
        .collection('store')
        .doc(orderModel.storeid || formattedStoreId)
        .get();

      let storeModel = null;
      if (storeDoc.exists) {
        storeModel = storeDoc.data();
        console.log("✅ [AWARD_LOYALTY] Store model loaded:", storeModel.title);
      } else {
        console.log("⚠️ [AWARD_LOYALTY] Store model not found, using order data");
        storeModel = { id: orderModel.storeid || formattedStoreId };
      }

      // Step 8: Award loyalty points
      console.log("🎁 [AWARD_LOYALTY] Step 7: Awarding loyalty points...");
      const pointsAdded = await this.addOrderWithLoyaltyPoints(userPhoneNumber, orderModel, storeModel);
      console.log("✅ [AWARD_LOYALTY] Step 7 Complete: Loyalty points added -", pointsAdded, "points");

      // Step 9: Award stamp card progress
      console.log("🎁 [AWARD_LOYALTY] Step 8: Awarding stamp card progress...");
      const orderTotalForStamp = parseFloat(orderModel.totalpaid || 0);
      await this.awardStampForOrder(userPhoneNumber, formattedOrderId, orderTotalForStamp, orderModel.storeid || formattedStoreId);
      console.log("✅ [AWARD_LOYALTY] Step 8 Complete: Stamp card progress awarded");


      
      console.log('🔄 [AWARD_ORDER_LOYALTY] Updating order_temp with latest order model... ' + formattedStoreId + " " + formattedOrderId);
      await this.updateOrderTempMyReport(formattedStoreId, formattedOrderId, orderModel);

      // Step 7: Save order based on payment type
      await this.saveOrderToCollections(formattedStoreId, orderModel, userPhoneNumber);
      //console.log('✅ [AWARD_ORDER_LOYALTY] Complete: order_temp updated to cart order with processed data');
      //  await this.updateCurrentOrderToUser(orderModel); //this will save order to user -> cart_order
      //  console.log('✅ [AWARD_ORDER_LOYALTY] Complete: current gkash order to user updated with processed data');

        // Ensure userPhoneNumber starts with +, if not add it
        const formattedPhoneNumber = userPhoneNumber.startsWith('+') ? userPhoneNumber : '+' + userPhoneNumber;
        orderModel.userphonenumber = formattedPhoneNumber;

       // Always save to myInvois collection (non-blocking)
      console.log('✅ [AWARD_ORDER_LOYALTY] Save to myinvois');
      this.saveToMyInvois(formattedStoreId, orderModel);
    

 // Step 10.7: Retrieve pickup code for vending orders
     
        // console.log('🔑 [AWARD_ORDER_LOYALTY]  Retrieving pickup code for vending order...');
        // await this.retrievePickupCode(orderModel, userPhoneNumber);
        // console.log('✅ [AWARD_ORDER_LOYALTY]  Complete: Pickup code retrieved');

        // console.log('🤖 [AWARD_ORDER_LOYALTY] Processing vending order specifics...');
        // console.log('📦 [AWARD_ORDER_LOYALTY]  Saving to pickup collection...');
        // await this.saveToPickupCollection(orderModel);

      console.log("🎁 [AWARD_LOYALTY] ========== AWARD ORDER LOYALTY COMPLETED ==========");

      return {
        success: true,
        message: "Order loyalty awarded successfully",
        storeId: formattedStoreId,
        orderId: formattedOrderId,
        userId: userId,
        machineModelId: machineModel.id,
        loyaltyCardIds: loyaltyCardIds,
        loyaltyCardsResult: loyaltyCardsResult,
        pointsAdded: pointsAdded,
        orderTotal: orderTotalForStamp
      };

    } catch (error) {
      console.error("❌ [AWARD_LOYALTY] Error in awardOrderLoyalty:", error);
      console.error("❌ [AWARD_LOYALTY] Error stack:", error.stack);
      throw error;
    }
  }

  async handleCreditItems(orderModel, phoneString) {
    console.log("Handling credit items");
    if (!orderModel.orderitems || phoneString === "0") return;

    for (const orderItem of orderModel.orderitems) {
      if (orderItem.iscredit) {
        console.log("Processing credit item:", orderItem.title);
        
        try {
          const creditsToAdd = (orderItem.creditamount || 0) * (orderItem.qty || 1);
          const pointsToAdd = (orderItem.pointamount || 0) * (orderItem.qty || 1);
          
          if (creditsToAdd > 0 || pointsToAdd > 0) {
            const storeId = orderItem.storeid || orderModel.storeid;
            await this.addCreditsAndPoints(phoneString, storeId, creditsToAdd, pointsToAdd);
          }
        } catch (ex) {
          console.error("Error processing credit item:", ex);
        }
      }
    }
  }

  async addCreditsAndPoints(phoneString, storeId, creditsToAdd, pointsToAdd) {
    try {
      await UserModel.addCreditsAndPoints(fireStore.collection("user"), phoneString, storeId, creditsToAdd, pointsToAdd);
    } catch (error) {
      console.error('Error adding credits and points:', error);
      throw error;
    }
  }

  async redeemAssignedVouchers(orderModel, phoneString) {

    console.log("Redeeming assigned vouchers for order:", phoneString);

    if (!orderModel.assignedvouchers || !Array.isArray(orderModel.assignedvouchers) || orderModel.assignedvouchers.length === 0) {
      console.log("No assigned vouchers to redeem");
      return;
    }

    if (phoneString === "0") {
      console.log("No valid phone number for voucher redemption");
      return;
    }

    try {
      console.log(`Redeeming ${orderModel.assignedvouchers.length} assigned vouchers`);

      for (const voucher of orderModel.assignedvouchers) {
        try {
          console.log("Redeeming voucher:", voucher.id, "-", voucher.title);

          // Get current voucher data from user's voucher collection
          const voucherRef = fireStore.collection("user")
            .doc(`FU_${phoneString}`)
            .collection("vouchers")
            .doc(voucher.id);
          
          const voucherDoc = await voucherRef.get();
          
          if (!voucherDoc.exists) {
            console.error("Voucher not found in user collection:", voucher.id);
            continue;
          }

          const currentVoucher = voucherDoc.data();
          const currentRedeemedCount = currentVoucher.redeemedCount || 0;
          const voucherQuantity = currentVoucher.quantity || 1;
          const redeemAmount = voucher.redeemedCount || 1;
          
          // Calculate new redeemed count
          const newRedeemedCount = redeemAmount;//currentRedeemedCount + redeemAmount;
          
          console.log(`Voucher ${voucher.id}: current redeemed ${currentRedeemedCount}, adding ${redeemAmount}, total quantity ${voucherQuantity}`);

          // Prepare update data
          const now = new Date();
          const updateData = {
            redeemedAt: now,
            redeemedCount: newRedeemedCount
          };

          // Only set isRedeemed to true if new redeemed count equals total quantity
          if (newRedeemedCount >= voucherQuantity) {
            updateData.isRedeemed = true;
            console.log(`Voucher ${voucher.id} fully redeemed (${newRedeemedCount}/${voucherQuantity})`);
          } else {
            console.log(`Voucher ${voucher.id} partially redeemed (${newRedeemedCount}/${voucherQuantity})`);
          }

          // Update voucher in user's voucher collection
          await voucherRef.update(updateData);

          console.log("Successfully updated voucher:", voucher.id);
        } catch (voucherError) {
          console.error("Error redeeming voucher", voucher.id, ":", voucherError);
          // Continue with other vouchers even if one fails
        }
      }

      console.log("Completed voucher redemption process");
    } catch (e) {
      console.error("Error in redeemAssignedVouchers:", e);
      // Don't throw error as voucher redemption failure shouldn't stop the order process
    }
  }

  async addOrderWithLoyaltyPoints(phoneString, orderModel, storeModel) {
    if (!orderModel || !storeModel || phoneString === "0") {
      console.log("Cannot add loyalty points - missing order, store model, or phone number, phoneString " + phoneString);
      
      return 0;
    }

    try {
      console.log("Adding loyalty points for user:", `FU_${phoneString}`, "order:", orderModel.orderid || orderModel.id);

      // Calculate order total
      let orderTotal = 0;
      if (orderModel.orderitems && Array.isArray(orderModel.orderitems)) {
        for (const item of orderModel.orderitems) {
          try {
            const itemTotal = (item.quantity || 1) * (item.price || 0);
            orderTotal += itemTotal;
          } catch (ex) {
            console.error("Error calculating item total:", ex);
          }
        }
      }

      // 10 points per RM spent (floored)
      const pointsToAdd = Math.floor(orderTotal * 10);

      if (pointsToAdd <= 0) {
        console.log("No loyalty points to add for order total:", orderTotal);
        return 0;
      }

      console.log(`Adding ${pointsToAdd} loyalty points for order total of ${orderTotal}`);

      // Use UserModel for user document operations
      const userRef = fireStore.collection("user").doc(`FU_${phoneString}`);
      
      await fireStore.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        
        if (userDoc.exists) {
          const userModel = UserModel.fromDocument(userDoc);
          if (userModel) {
            // Add points for this store using UserModel methods
            const storeId = storeModel.id || orderModel.storeid;
            const companyId = storeModel.companyid || storeModel.companyId;
            
            const currentStorePoints = userModel.getLoyaltyPoints(storeId);
            
            // Add points to store ID
            userModel.addLoyaltyPoints(storeId, pointsToAdd);
            console.log(`Added ${pointsToAdd} loyalty points to store ${storeId}. Previous: ${currentStorePoints}, New total: ${userModel.getLoyaltyPoints(storeId)}`);
            
            // Handle company ID loyalty points if company ID exists and is different from store ID
            if (companyId && companyId !== storeId) {
              const currentCompanyPoints = userModel.getLoyaltyPoints(companyId);
              
              if (currentCompanyPoints > 0) {
                // Company ID already has points, just add the new points
                userModel.addLoyaltyPoints(companyId, pointsToAdd);
                console.log(`Added ${pointsToAdd} loyalty points to existing company ${companyId}. Previous: ${currentCompanyPoints}, New total: ${userModel.getLoyaltyPoints(companyId)}`);
              } else {
                // Company ID has no points, copy store ID points over and add new points
                const newStorePoints = userModel.getLoyaltyPoints(storeId); // This already includes the newly added points
                userModel.addLoyaltyPoints(companyId, newStorePoints);
                console.log(`Copied store points and added new points to company ${companyId}. Total company points: ${userModel.getLoyaltyPoints(companyId)}`);
              }
            } else {
              console.log("No valid company ID found or company ID same as store ID - skipping company loyalty points");
            }
            
            transaction.update(userRef, userModel.toMap());
            
            console.log(`Successfully processed loyalty points for store ${storeId}${companyId ? ` and company ${companyId}` : ''}`);
          } else {
            console.log("Failed to create UserModel from document");
          }
        } else {
          console.log("User document not found for loyalty points update");
        }
      });

      return pointsToAdd;

    } catch (e) {
      console.error("Error adding loyalty points:", e);
      // Don't throw error as loyalty points failure shouldn't stop the order process
      return 0;
    }
  }

  /**
   * Save pending points to Firestore
   * Also saves order and pickup code to pending_points subcollections
   * @param {string} phoneNumber - Phone number (may include + prefix)
   * @param {number} points - Points to save
   * @param {string} orderId - Order ID
   * @param {string} storeId - Store ID
   * @returns {Promise<boolean>} True on success, false on error
   */
  async savePendingPoints({ phoneNumber, points, orderId, storeId }) {
    try {
      // Remove + prefix if present for document ID format
      const cleanPhone = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : phoneNumber;
      const documentId = `FU_+${cleanPhone}`;
      
      console.log('💾 [PENDING_POINTS] Saving pending points for:', documentId);
      console.log('💾 [PENDING_POINTS] Points:', points, 'Order ID:', orderId, 'Store ID:', storeId);

      // Fetch order from Firestore
      let orderDoc = await fireStore
        .collection('store')
        .doc(storeId)
        .collection('order')
        .doc(orderId)
        .get();

      if (!orderDoc.exists) {

        orderDoc = await fireStore
        .collection('myreport')
        .doc(storeId)
        .collection('order')
        .doc(orderId)
        .get();

        if (!orderDoc.exists) {
            console.error('❌ [PENDING_POINTS] Order not found:', orderId);
            return false;
        }
      }

      const orderData = orderDoc.data();
      console.log('✅ [PENDING_POINTS] Order fetched successfully');

      // Prepare pending points document with order and pickup code data
      const pendingPointsData = {
        points: points,
        orderId: orderId,
        storeId: storeId,
        createdAt: new Date().toISOString(),
        orderData: orderData, // Store order data for later copying
      };

      // Check if order has pickup code data
      if (orderData.pickupcode || orderData.pickupCode || (orderData.merchantid && orderData.devicenumber)) {
        const pickupDocId = `${orderData.merchantid}_${orderData.devicenumber}`;
        pendingPointsData.pickupDocId = pickupDocId;
        pendingPointsData.pickupData = orderData; // Store pickup data for later copying
        console.log('📦 [PENDING_POINTS] Pickup code data found, doc ID:', pickupDocId);
      }

      // Save pending points document
      await fireStore.collection('pending_points').doc(documentId).set(pendingPointsData);
      console.log('✅ [PENDING_POINTS] Pending points saved to:', documentId);

      // Save order to pending_points subcollection
      await fireStore
        .collection('pending_points')
        .doc(documentId)
        .collection('order')
        .doc(orderId)
        .set(orderData);
      console.log('✅ [PENDING_POINTS] Order saved to pending_points subcollection');

      // Save pickup code to pending_points subcollection if it exists
      // if (orderData.pickupcode || orderData.pickupCode || (orderData.merchantid && orderData.devicenumber)) {
      //   const pickupDocId = `${orderData.merchantid}_${orderData.devicenumber}`;
        
      //   // Clean up undefined values before saving to Firebase
      //   const cleanOrderModel = JSON.parse(JSON.stringify(orderData, (key, value) => {
      //     return value === undefined ? null : value;
      //   }));

      //   await fireStore
      //     .collection('pending_points')
      //     .doc(documentId)
      //     .collection('pickup')
      //     .doc(pickupDocId)
      //     .set(cleanOrderModel);
      //   console.log('✅ [PENDING_POINTS] Pickup code saved to pending_points subcollection');
      // }

      return true;
    } catch (e) {
      console.error('❌ [PENDING_POINTS] Error saving pending points:', e);
      return false;
    }
  }

  /**
   * Claim pending points and add them to user's loyalty points
   * Also copies order and pickup code from pending_points to userRef
   * @param {string} userId - User ID (e.g., "FU_60123456789")
   * @param {string} phoneNumber - Phone number (may include + prefix)
   * @param {number} points - Points to claim
   * @param {string} orderId - Order ID
   * @param {string} storeId - Store ID
   * @returns {Promise<Object>} Result object with success flag and pointsAdded or error
   */
  async claimPendingPoints({ userId, phoneNumber, points, orderId, storeId }) {
    try {
      console.log('🎁 [CLAIM_POINTS] Claiming pending points for user:', userId);
      console.log('🎁 [CLAIM_POINTS] Points:', points, 'Order ID:', orderId, 'Store ID:', storeId);

      // Convert points to number (to match UserModel loyalty points type)
      const pointsToAdd = Number(points);

      // Get store model to access companyId
      let storeModel = null;
      try {
        const storeDoc = await fireStore.collection('store').doc(storeId).get();
        if (storeDoc.exists) {
          storeModel = storeDoc.data();
        }
      } catch (e) {
        console.error('❌ [CLAIM_POINTS] Error loading store model:', e);
      }

      // Use Firestore transaction to update user document
      const userDocRef = fireStore.collection('user').doc(userId);

      await fireStore.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userDocRef);

        if (userDoc.exists) {
          const userModel = UserModel.fromDocument(userDoc);

          // Get store ID and company ID
          const finalStoreId = storeModel?.id || storeId;
          const companyId = storeModel?.companyid || storeModel?.companyId || '';

          // Get current store points before adding
          const currentStorePoints = userModel.getLoyaltyPoints(finalStoreId);

          // Add points to store ID
          userModel.addLoyaltyPoints(finalStoreId, pointsToAdd);
          console.log(`✅ [CLAIM_POINTS] Added ${pointsToAdd} loyalty points to store ${finalStoreId}. Previous: ${currentStorePoints}, New total: ${userModel.getLoyaltyPoints(finalStoreId)}`);

          // Handle company ID loyalty points if company ID exists and is different from store ID
          if (companyId && companyId !== '' && companyId !== finalStoreId) {
            const currentCompanyPoints = userModel.getLoyaltyPoints(companyId);

            if (currentCompanyPoints > 0) {
              // Company ID already has points, just add the new points
              userModel.addLoyaltyPoints(companyId, pointsToAdd);
              console.log(`✅ [CLAIM_POINTS] Added ${pointsToAdd} loyalty points to existing company ${companyId}. Previous: ${currentCompanyPoints}, New total: ${userModel.getLoyaltyPoints(companyId)}`);
            } else {
              // Company ID has no points, copy store ID points over and add new points
              const newStorePoints = userModel.getLoyaltyPoints(finalStoreId); // This already includes the newly added points
              userModel.addLoyaltyPoints(companyId, newStorePoints);
              console.log(`✅ [CLAIM_POINTS] Copied store points and added new points to company ${companyId}. Total company points: ${userModel.getLoyaltyPoints(companyId)}`);
            }
          } else {
            console.log('ℹ️ [CLAIM_POINTS] No valid company ID found or company ID same as store ID - skipping company loyalty points');
          }

          // Update user document in transaction
          transaction.update(userDocRef, userModel.toMap());
        } else {
          throw new Error(`User document not found: ${userId}`);
        }
      });

      // Get pending points document
      const cleanPhone = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : phoneNumber;
      const pendingDocId = `FU_+${cleanPhone}`;
      const pendingDoc = await fireStore.collection('pending_points').doc(pendingDocId).get();

      if (pendingDoc.exists) {
        const pendingData = pendingDoc.data();

        // Copy order data from pending_points subcollection to userRef
        const orderDoc = await fireStore
          .collection('pending_points')
          .doc(pendingDocId)
          .collection('order')
          .doc(orderId)
          .get();

        if (orderDoc.exists) {
          const orderData = orderDoc.data();
          // Copy order to user subfolder
          await fireStore
            .collection('user')
            .doc(userId)
            .collection('order')
            .doc(orderId)
            .set(orderData);
          console.log('✅ [CLAIM_POINTS] Order copied to user subfolder');
          
          // Delete order from pending_points subcollection
          await fireStore
            .collection('pending_points')
            .doc(pendingDocId)
            .collection('order')
            .doc(orderId)
            .delete();
          console.log('✅ [CLAIM_POINTS] Order deleted from pending_points subcollection');
        }

        // Copy pickup code data from pending_points subcollection to userRef
        // if (pendingData.pickupDocId) {
        //   const pickupDoc = await fireStore
        //     .collection('pending_points')
        //     .doc(pendingDocId)
        //     .collection('pickup')
        //     .doc(pendingData.pickupDocId)
        //     .get();

        //   if (pickupDoc.exists) {
        //     const pickupData = pickupDoc.data();
        //     // Clean up undefined values before saving to Firebase
        //     const cleanPickupData = JSON.parse(JSON.stringify(pickupData, (key, value) => {
        //       return value === undefined ? null : value;
        //     }));

        //     // Copy pickup to user subfolder
        //     await fireStore
        //       .collection('user')
        //       .doc(userId)
        //       .collection('pickup')
        //       .doc(pendingData.pickupDocId)
        //       .set(cleanPickupData);
        //     console.log('✅ [CLAIM_POINTS] Pickup code copied to user subfolder');
            
        //     // Delete pickup from pending_points subcollection
        //     await fireStore
        //       .collection('pending_points')
        //       .doc(pendingDocId)
        //       .collection('pickup')
        //       .doc(pendingData.pickupDocId)
        //       .delete();
        //     console.log('✅ [CLAIM_POINTS] Pickup code deleted from pending_points subcollection');
        //   }
        // }
      }

      // Delete the pending points document after successful update and cleanup
      await this.deletePendingPoints(pendingDocId);

      return {
        success: true,
        pointsAdded: points,
      };
    } catch (e) {
      console.error('❌ [CLAIM_POINTS] Error claiming pending points:', e);
      return {
        success: false,
        error: e.toString(),
      };
    }
  }

  /**
   * Delete pending points document
   * @param {string} userId - The user ID (e.g., "FU_+60123456789")
   * @returns {Promise<void>}
   */
  async deletePendingPoints(userId) {
    try {
      await fireStore.collection('pending_points').doc(userId).delete();
      console.log('✅ [DELETE_PENDING] Pending points deleted for:', userId);
    } catch (e) {
      console.error('❌ [DELETE_PENDING] Error deleting pending points:', e);
    }
  }

  /**
   * HTTP endpoint handler for saving pending points
   * POST /pending-points/save
   * Body: { phoneNumber, points, orderId, storeId }
   */
  async handleSavePendingPoints(req, res) {
    try {
      const { phoneNumber, points, orderId, storeId } = req.body;

      // Validate required parameters
      if (!phoneNumber || points === undefined || !orderId || !storeId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: phoneNumber, points, orderId, and storeId are required'
        });
      }

      const result = await this.savePendingPoints({ phoneNumber, points, orderId, storeId });

      if (result) {
        res.status(200).json({
          success: true,
          message: 'Pending points saved successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to save pending points'
        });
      }
    } catch (error) {
      console.error('❌ [API] Error in handleSavePendingPoints:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message
      });
    }
  }

  /**
   * HTTP endpoint handler for claiming pending points
   * POST /pending-points/claim
   * Body: { userId, phoneNumber, points, orderId, storeId }
   */
  async handleClaimPendingPoints(req, res) {
    try {
      const { userId, phoneNumber, points, orderId, storeId } = req.body;

      // Validate required parameters
      if (!userId || !phoneNumber || points === undefined || !orderId || !storeId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: userId, phoneNumber, points, orderId, and storeId are required'
        });
      }

      const result = await this.claimPendingPoints({ userId, phoneNumber, points, orderId, storeId });

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'Pending points claimed successfully',
          pointsAdded: result.pointsAdded
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to claim pending points'
        });
      }
    } catch (error) {
      console.error('❌ [API] Error in handleClaimPendingPoints:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message
      });
    }
  }

  /**
   * HTTP endpoint handler for deleting pending points
   * DELETE /pending-points/delete/:userId
   * Params: userId (e.g., "FU_+60123456789")
   */
  async handleDeletePendingPoints(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: userId'
        });
      }

      await this.deletePendingPoints(userId);

      res.status(200).json({
        success: true,
        message: 'Pending points deleted successfully'
      });
    } catch (error) {
      console.error('❌ [API] Error in handleDeletePendingPoints:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message
      });
    }
  }

  async loadUserStampCards(phoneString) {
    try {
      const userId = `FU_${phoneString}`;
      const snap = await fireStore
        .collection('user')
        .doc(userId)
        .collection('stampcard')
        .where('status', 'in', ['in_progress', 'completed'])
        .get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error('Error loading user stamp cards:', e);
      return [];
    }
  }

  async awardStampForOrder(phoneString, orderId, orderTotal, storeId) {
    try {
      const userId = `FU_${phoneString}`;
      console.log('🟩 [STAMP] awardStampForOrder: start', {
        userId,
        phoneString,
        orderId,
        orderTotal: Number(orderTotal || 0),
        storeId
      });
      const cardsQuery = await fireStore
        .collection('user')
        .doc(userId)
        .collection('stampcard')
        .where('status', '==', 'in_progress')
        .where('storeId', '==', storeId)
        .get();

      if (cardsQuery.empty) {
        console.log(`🟨 [STAMP] No in-progress stamp cards for user: ${userId} and storeId: ${storeId}`);
        return;
      }

      console.log('🟩 [STAMP] In-progress cards found for $userId: ', cardsQuery.size);

      for (const cardDoc of cardsQuery.docs) {
        const cardRef = cardDoc.ref;
        let awarded = false;
        let skipReason = 'none';
        const preCard = cardDoc.data() || {};
        console.log('🟩 [STAMP] Evaluating card', cardDoc.id, {
          status: preCard.status,
          conditionType: preCard.conditionType,
          storeId: preCard.storeId,
          thresholdAmount: preCard.conditionParams?.thresholdAmount,
          totalStamps: preCard.totalStamps,
          expiresAt: preCard.expiresAt,
          stampsLength: Array.isArray(preCard.stamps) ? preCard.stamps.length : 0,
          relatedOrderIdsCount: Array.isArray(preCard.relatedOrderIds) ? preCard.relatedOrderIds.length : 0
        });

        await fireStore.runTransaction(async (trx) => {
          const snap = await trx.get(cardRef);
          if (!snap.exists) { skipReason = 'card_not_found'; return; }
          const card = snap.data() || {};

          if (card.status !== 'in_progress') { skipReason = 'status_not_in_progress'; return; }

          let isExpired = false;
          try {
            if (card.expiresAt && typeof card.expiresAt.toDate === 'function') {
              isExpired = new Date() > card.expiresAt.toDate();
            }
          } catch (_) {
            // ignore
          }
          if (isExpired) { skipReason = 'card_expired'; return; }

          const relatedOrderIds = Array.isArray(card.relatedOrderIds) ? card.relatedOrderIds.slice() : [];
          if (relatedOrderIds.includes(orderId)) { skipReason = 'order_already_counted'; return; }

          if (card.conditionType !== 'spend_threshold') { skipReason = 'unsupported_conditionType'; return; }
          const threshold = Number(card.conditionParams && card.conditionParams.thresholdAmount ? card.conditionParams.thresholdAmount : 0);
          const numericOrderTotal = Number(orderTotal || 0);
          console.log('🟩 [STAMP] Threshold check:', { orderTotal: numericOrderTotal, threshold });
          if (numericOrderTotal < threshold || threshold <= 0) { skipReason = 'below_threshold'; return; }

          const stamps = Array.isArray(card.stamps) ? card.stamps.slice() : [];
          const emptyIndices = [];
          for (let i = 0; i < stamps.length; i++) {
            if (!stamps[i] || !stamps[i].earnedAt) { emptyIndices.push(i); }
          }
          const maxAwardableByAmount = Math.floor(numericOrderTotal / threshold);
          const stampsToAward = Math.min(maxAwardableByAmount, emptyIndices.length);
          console.log('🟩 [STAMP] Stamp slot selection:', { totalSlots: stamps.length, emptySlots: emptyIndices.length, maxAwardableByAmount, stampsToAward });
          if (stampsToAward <= 0) { skipReason = emptyIndices.length === 0 ? 'no_empty_stamp_slot' : 'below_threshold'; return; }

          for (let i = 0; i < stampsToAward; i++) {
            const idx = emptyIndices[i];
            stamps[idx] = {
              index: stamps[idx] && stamps[idx].index != null ? stamps[idx].index : idx,
              earnedAt: new Date(),
              orderId: orderId
            };
          }

          const earnedCount = stamps.filter(s => !!(s && s.earnedAt)).length;
          const totalStamps = Number(card.totalStamps || 0);

          const updates = {
            stamps: stamps,
            relatedOrderIds: relatedOrderIds.includes(orderId) ? relatedOrderIds : relatedOrderIds.concat([orderId])
          };

          if (earnedCount >= totalStamps && totalStamps > 0) {
            updates.status = 'completed';
            updates.completedAt = new Date();
          }

          console.log('🟩 [STAMP] Applying updates:', {
            cardId: cardDoc.id,
            earnedCount,
            totalStamps,
            willComplete: earnedCount >= totalStamps && totalStamps > 0,
            relatedOrderIdsNewCount: updates.relatedOrderIds.length,
            stampsAwardedThisOrder: stampsToAward
          });

          trx.update(cardRef, updates);
          awarded = true;
        });

        if (awarded) {
          console.log('✅ [STAMP] Awarded a stamp on card:', cardDoc.id, 'for user:', userId);
          break;
        }

        console.log('🟨 [STAMP] Skipped card', cardDoc.id, 'reason:', skipReason);
      }

      console.log('🟩 [STAMP] awardStampForOrder: done for user:', userId);
    } catch (e) {
      console.error('💥 [STAMP] Error while awarding stamp:', e);
    }
  }

  async saveToPickupCollection(orderModel) {
    console.log("📦 [VENDING] ========== SAVING TO PICKUP COLLECTION ==========");
    console.log("📦 [VENDING] Order ID:", orderModel.id);
    console.log("📦 [VENDING] Merchant ID:", orderModel.merchantid);
    console.log("📦 [VENDING] Device Number:", orderModel.devicenumber);
    console.log("📦 [VENDING] User Phone Number:", orderModel.userphonenumber);
    console.log("📦 [VENDING] Pickup code:", orderModel.pickupcode);
    console.log("📦 [VENDING] Pickup Code:", orderModel.pickupCode);
    console.log("📦 [VENDING] Payment Status:", orderModel.paymentstatus);
    
    if (!orderModel.merchantid || !orderModel.devicenumber || !orderModel.userphonenumber) {
      console.log("❌ [VENDING] Missing required fields for pickup collection");
      console.log("📦 [VENDING] Required: merchantid, devicenumber, userphonenumber");
      return;
    }

    try {
      const pickupDocId = `${orderModel.merchantid}_${orderModel.devicenumber}`;
      const phoneString = this.getPhoneString(orderModel);
      console.log("📦 [VENDING] Pickup Document ID:", pickupDocId);
      console.log("📦 [VENDING] Phone String:", phoneString);
      console.log("📦 [VENDING] User Document Path:", `FU_${phoneString}`);
      
      // Clean up undefined values before saving to Firebase
      const cleanOrderModel = JSON.parse(JSON.stringify(orderModel, (key, value) => {
        return value === undefined ? null : value;
      }));
      
      await fireStore.collection("user")
        .doc(`FU_${phoneString}`)
        .collection("pickup")
        .doc(pickupDocId)
        .set(cleanOrderModel);
        
      console.log("✅ [VENDING] Successfully saved to pickup collection");
    } catch (ex) {
      console.error("❌ [VENDING] Error saving to pickup collection:", ex);
      throw ex;
    }
  }

  async triggerVendingPaymentCallback(orderModel, storeModel) {
    console.log("🤖 [VENDING] ========== TRIGGERING PAYMENT CALLBACK ==========");
    console.log("🤖 [VENDING] Order ID:", orderModel.id);
   
    
    try {
      // Check if this is a vending order
      if (!orderModel.devicenumber || !orderModel.merchantid) {
        console.log("⚠️ [VENDING] Not a vending order - devicenumber:", orderModel.devicenumber, "merchantid:", orderModel.merchantid);
        return { success: false, message: "Not a vending order" };
      }
      
      console.log("🤖 [VENDING] Device Number:", orderModel.devicenumber);
      console.log("🤖 [VENDING] Merchant ID:", orderModel.merchantid);
      console.log("🤖 [VENDING] Payment Type:", orderModel.paymenttype);
      console.log("🤖 [VENDING] Payment Status:", orderModel.paymentstatus);
      console.log("🤖 [VENDING] Total Amount:", orderModel.total);
      console.log("🤖 [VENDING] Total Paid:", orderModel.totalpaid);
      console.log("🤖 [VENDING] E-Pay Amount:", orderModel.epayamount);

      console.log("🤖 [VENDING] OrderModel:", orderModel);

      // Prepare payment callback data matching Dart VendingPaymentCallback logic exactly
      const amount = parseFloat(orderModel.totalPrice || orderModel.totalprice || 0);
      const currency = storeModel?.currency || 'MYR';
      const orderId = orderModel.vendingid  || '';
      const payedTime = Date.now(); // Current timestamp in milliseconds (not seconds)
      const paymentChannel = 'ewallet'; // Default to ewallet as per Dart logic
      const remark = 'Payment via vending machine';
      const status = 'completed'; // Since we're in success page, payment is completed
      const transactionId = orderModel.id || `TX_${Date.now()}`;
      const transactionType = 'sale';

      console.log("🤖 [VENDING] Triggering payment callback with details:");
      console.log("🤖 [VENDING] - Amount:", amount, currency);
      console.log("🤖 [VENDING] - Order ID (Vending):", orderId);
      console.log("🤖 [VENDING] - Transaction ID:", transactionId);
      console.log("🤖 [VENDING] - Status:", status);
      console.log("🤖 [VENDING] - Payed Time:", payedTime);

      const paymentCallbackData = {
        amount: amount,
        currency: currency,
        order_id: orderId,
        payed_time: payedTime,
        payment_channel: paymentChannel,
        remark: remark,
        status: status,
        transaction_id: transactionId,
        transaction_type: transactionType
      };

      console.log("🤖 [VENDING] Payment callback data:", JSON.stringify(paymentCallbackData, null, 2));

      // Send payment callback to vending API
      const callbackResult = await this.sendVendingPaymentCallback(paymentCallbackData);
      
      if (callbackResult.success) {
        console.log("✅ [VENDING] Payment callback sent successfully");
        
        // Optionally trigger pickup creation if callback was successful
        if (orderModel.pickupcode) {
          console.log("📦 [VENDING] Creating pickup order...");
          await this.createVendingPickupOrder(orderModel, storeModel);
        }
        
        return callbackResult;
      } else {
        console.error("❌ [VENDING] Payment callback failed:", callbackResult.message);
        return callbackResult;
      }
      
    } catch (ex) {
      console.error("💥 [VENDING] Error triggering vending payment callback:", ex);
      return {
        success: false,
        message: "Payment callback failed",
        error: {
          code: 5000,
          msg: ex.toString(),
          data: []
        }
      };
    }
  }

  async sendVendingPaymentCallback(paymentCallbackData) {
    console.log("📞 [VENDING] ========== SENDING PAYMENT CALLBACK ==========");
    console.log("📞 [VENDING] Callback Data:", JSON.stringify(paymentCallbackData, null, 2));
    console.log("📞 [VENDING] Amount:", paymentCallbackData.amount);
    console.log("📞 [VENDING] Currency:", paymentCallbackData.currency);
    console.log("📞 [VENDING] Order ID:", paymentCallbackData.orderId);
    console.log("📞 [VENDING] Payment Channel:", paymentCallbackData.paymentChannel);
    console.log("📞 [VENDING] Status:", paymentCallbackData.status);
    console.log("📞 [VENDING] Transaction ID:", paymentCallbackData.transactionId);
    console.log("📞 [VENDING] Payed Time:", paymentCallbackData.payedTime);
    console.log("📞 [VENDING] Transaction Type:", paymentCallbackData.transactionType);
    
    try {
      // Create a mock request and response object for internal method call
      const mockReq = {
        body: paymentCallbackData
      };
      
      console.log("📞 [VENDING] Mock Request Body:", JSON.stringify(mockReq.body, null, 2));
      
      let responseData = null;
      let statusCode = 200;
      let success = true;
      
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => {
              responseData = data;
              success = (code >= 200 && code < 300);
            }
          };
        },
        json: (data) => {
          responseData = data;
        }
      };

      // Call the internal vending payment callback method
      await this.vendingRouter.handlePaymentCallback(mockReq, mockRes);

      console.log("📞 [VENDING] Internal method response:", statusCode, responseData);

      if (success) {
        return {
          success: true,
          message: "Payment callback sent successfully",
          data: responseData
        };
      } else {
        return {
          success: false,
          message: "Payment callback failed",
          error: responseData
        };
      }

    } catch (error) {
      console.error("❌ [VENDING] Error calling internal payment callback:", error.message);
      
      return {
        success: false,
        message: "Payment callback failed",
        error: {
          code: 5000,
          msg: error.toString(),
          data: []
        }
      };
    }
  }

  async createVendingPickupOrder(orderModel, storeModel) {
    console.log("📦 [VENDING] ========== CREATING PICKUP ORDER ==========");
    console.log("📦 [VENDING] Order ID:", orderModel.id);
    console.log("📦 [VENDING] Device Number:", orderModel.devicenumber);
    console.log("📦 [VENDING] Merchant ID:", orderModel.merchantid);
    console.log("📦 [VENDING] Order Items Count:", (orderModel.orderitems || []).length);
    
    try {
      // Prepare order details similar to Dart VendingOrderDetails
      const orderItems = this.convertToVendingOrderItems(orderModel.orderitems || []);
      console.log("📦 [VENDING] Converted Order Items:", JSON.stringify(orderItems, null, 2));
      
      const orderDetails = {
        amount: parseFloat(orderModel.totalpaid || orderModel.epayamount || 0),
        currency: orderModel.currency || "MYR",
        device_number: orderModel.devicenumber,
        list: orderItems,
        merchant_id: orderModel.merchantid,
        remark: orderModel.remark || `Pickup order ${orderModel.orderid}`
      };
      
      console.log("📦 [VENDING] Order Details:", JSON.stringify(orderDetails, null, 2));

      // You would need a token for this - this might come from a login process
      // For now, we'll use a placeholder or get it from the order model
      const token = orderModel.vendingtoken || await this.getVendingAuthToken(orderModel);
      
      if (!token) {
        console.log("⚠️ [VENDING] No auth token available - skipping pickup order creation");
        return { success: false, message: "No auth token" };
      }

      const pickupResult = await this.sendVendingCreateOrder(token, orderDetails);
      
      if (pickupResult.success) {
        console.log("✅ [VENDING] Pickup order created successfully");
        
        // Optionally save the pickup order ID back to the order model
        if (pickupResult.data && pickupResult.data.order_id) {
          orderModel.vendingpickuporderid = pickupResult.data.order_id;
        }
      }
      
      return pickupResult;
      
    } catch (ex) {
      console.error("💥 [VENDING] Error creating pickup order:", ex);
      return {
        success: false,
        message: "Failed to create pickup order",
        error: {
          code: 5000,
          msg: ex.toString(),
          data: []
        }
      };
    }
  }

  async sendVendingCreateOrder(token, orderDetails) {
    console.log("📦 [VENDING] Sending create order request to internal vending handler...");
    
    try {
      const requestData = {
        token: token,
        order_details: orderDetails
      };

      // Create mock request and response objects
      const mockReq = {
        body: requestData
      };
      
      let responseData = null;
      let statusCode = 200;
      let success = true;
      
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => {
              responseData = data;
              success = (code >= 200 && code < 300);
            }
          };
        },
        json: (data) => {
          responseData = data;
        }
      };

      // Call the internal vending create order method
      await this.vendingRouter.handleCreateOrder(mockReq, mockRes);

      console.log("📦 [VENDING] Internal method response:", statusCode, responseData);

      if (success) {
        return {
          success: true,
          message: "Order created successfully",
          data: responseData
        };
      } else {
        return {
          success: false,
          message: "Failed to create order",
          error: responseData
        };
      }

    } catch (error) {
      console.error("❌ [VENDING] Error calling internal create order:", error.message);
      
      return {
        success: false,
        message: "Failed to create order",
        error: {
          code: 5000,
          msg: error.toString(),
          data: []
        }
      };
    }
  }

  convertToVendingOrderItems(orderItems) {
    console.log("🔄 [VENDING] Converting order items to vending format...");
    
    return orderItems.map(item => ({
      goods_count: item.qty || item.quantity || 1,
      goods_description: item.description || item.title || "",
      goods_id: parseInt(item.menuid || item.id || 0),
      goods_name: item.title || item.name || "",
      goods_photo: item.image || item.photo || "",
      goods_price: parseFloat(item.price || 0),
      goods_sku: item.sku || item.id || "",
      hot: item.hot || item.needheating || 0 // 0 = no heating, 1 = heat up
    }));
  }

  getPaymentChannel(paymentType) {
    // Map your payment types to vending payment channels
    const paymentChannelMap = {
      'GKASH': 'GKASH',
      'GKASH_WALLET': 'GKASH',
      'CREDIT_CARD': 'CREDIT_CARD',
      'DEBIT_CARD': 'DEBIT_CARD',
      'BOOST': 'BOOST',
      'GRABPAY': 'GRABPAY',
      'TOUCHNGO': 'TOUCHNGO',
      'FPXBANK': 'FPX',
      'CASH': 'CASH'
    };
    
    return paymentChannelMap[paymentType] || paymentType || 'UNKNOWN';
  }

  getVendingPaymentStatus(paymentStatus) {
    // Map your payment status to vending status
    const statusMap = {
      'paid': 'SUCCESS',
      'success': 'SUCCESS',
      'completed': 'SUCCESS',
      'failed': 'FAILED',
      'pending': 'PENDING',
      'cancelled': 'CANCELLED'
    };
    
    return statusMap[paymentStatus?.toLowerCase()] || 'SUCCESS';
  }

     async getVendingAuthToken(orderModel) {
     console.log("🔐 [VENDING] Getting auth token using internal vending handler... " + orderModel?.devicenumber ?? "NA" + " " + orderModel?.merchantid ?? "NA");
     //console.log(orderModel);
     try {
       // This would typically use stored credentials or get them from the order/store model
       const loginData = {
         device_number: orderModel.devicenumber,
         merchant_id: orderModel.merchantid,
         mobile:  "60124508261", // You'd need to store this
         mobile_area_code:  "60",
         password:  "9952099" // You'd need to store this securely
       };

       // Create mock request and response objects
       const mockReq = {
         body: loginData
       };
       
       let responseData = null;
       let statusCode = 200;
       let success = true;
       
       const mockRes = {
         status: (code) => {
           statusCode = code;
           return {
             json: (data) => {
               responseData = data;
               success = (code >= 200 && code < 300);
             }
           };
         },
         json: (data) => {
           responseData = data;
         }
       };

       // Call the internal vending login method
       await this.vendingRouter.handleLogin(mockReq, mockRes);

       console.log("🔐 [VENDING] Internal login response:", statusCode, responseData);

       console.log("🔐 [VENDING] Checking token extraction paths...");
       console.log("🔐 [VENDING] Response success:", responseData?.success);
       console.log("🔐 [VENDING] Response message:", responseData?.message);
       console.log("🔐 [VENDING] Message data:", responseData?.message?.data);
       console.log("🔐 [VENDING] Token path 1 (data.token):", responseData?.data?.token);
       console.log("🔐 [VENDING] Token path 2 (message.data.token):", responseData?.message?.data?.token);
       
       if (success && responseData && responseData.success) {
         // Try multiple possible token paths
         const token = responseData.message?.data?.token || 
                      responseData.data?.token || 
                      responseData.token;
                      
         if (token) {
           console.log("✅ [VENDING] Auth token obtained successfully");
           console.log("🔐 [VENDING] Token preview:", token.substring(0, 20) + '...');
           return token;
         } else {
           console.log("⚠️ [VENDING] Login response did not contain token in expected paths");
           console.log("🔐 [VENDING] Full response structure:", JSON.stringify(responseData, null, 2));
           return null;
         }
       } else {
         console.log("⚠️ [VENDING] Login request was not successful");
         console.log("🔐 [VENDING] Status code:", statusCode);
         console.log("🔐 [VENDING] Success flag:", success);
         return null;
       }

     } catch (error) {
       console.error("❌ [VENDING] Error getting auth token:", error.message);
       return null;
     }
   }

   // Additional Vending Utility Methods based on Dart VendingUtil

   async vendingLogin(deviceNumber, merchantId, mobile, mobileAreaCode, password) {
     console.log("🔐 [VENDING] ========== PERFORMING VENDING LOGIN ==========");
     console.log("🔐 [VENDING] Device Number:", deviceNumber);
     console.log("🔐 [VENDING] Merchant ID:", merchantId);
     console.log("🔐 [VENDING] Mobile:", mobile);
     console.log("🔐 [VENDING] Mobile Area Code:", mobileAreaCode);
     console.log("🔐 [VENDING] Password Length:", password ? password.length : 0);
     
     try {
       const loginData = {
         device_number: deviceNumber,
         merchant_id: merchantId,
         mobile: mobile,
         mobile_area_code: mobileAreaCode,
         password: password
       };
       
       console.log("🔐 [VENDING] Login Data:", JSON.stringify({...loginData, password: '***'}, null, 2));

       // Create mock request and response objects
       const mockReq = {
         body: loginData
       };
       
       let responseData = null;
       let statusCode = 200;
       
       const mockRes = {
         status: (code) => {
           statusCode = code;
           return {
             json: (data) => {
               responseData = data;
             }
           };
         },
         json: (data) => {
           responseData = data;
         }
       };

       // Call the internal vending login method
       await this.vendingRouter.handleLogin(mockReq, mockRes);

       console.log("🔐 [VENDING] Internal login response:", statusCode, responseData);
       return responseData;

     } catch (error) {
       console.error("❌ [VENDING] Login error:", error.message);
       return {
         success: false,
         message: "Login failed",
         error: {
           code: 5000,
           msg: error.toString(),
           data: []
         }
       };
     }
   }

   async vendingGetMemberInfo(token) {
     console.log("👤 [VENDING] Getting member info from internal handler...");
     
     try {
       // Create mock request and response objects
       const mockReq = {
         body: { token: token }
       };
       
       let responseData = null;
       let statusCode = 200;
       
       const mockRes = {
         status: (code) => {
           statusCode = code;
           return {
             json: (data) => {
               responseData = data;
             }
           };
         },
         json: (data) => {
           responseData = data;
         }
       };

       // Call the internal vending member info method
       await this.vendingRouter.handleMemberInfo(mockReq, mockRes);

       console.log("👤 [VENDING] Internal member info response:", statusCode, responseData);
       return responseData;

     } catch (error) {
       console.error("❌ [VENDING] Member info error:", error.message);
       return {
         success: false,
         message: "Failed to get member info",
         error: {
           code: 5000,
           msg: error.toString(),
           data: []
         }
       };
     }
   }

   async vendingGetGoodsList(deviceNumber, merchantId) {
     console.log("📦 [VENDING] Getting goods list from internal handler...");
     
     try {
       // Create mock request and response objects
       const mockReq = {
         body: {
           device_number: deviceNumber,
           merchant_id: merchantId
         }
       };
       
       let responseData = null;
       let statusCode = 200;
       
       const mockRes = {
         status: (code) => {
           statusCode = code;
           return {
             json: (data) => {
               responseData = data;
             }
           };
         },
         json: (data) => {
           responseData = data;
         }
       };

       // Call the internal vending goods list method
       await this.vendingRouter.handleGoodsList(mockReq, mockRes);

       console.log("📦 [VENDING] Internal goods list response:", statusCode, responseData);
       return responseData;

     } catch (error) {
       console.error("❌ [VENDING] Goods list error:", error.message);
       return {
         success: false,
         message: "Failed to get goods list",
         error: {
           code: 5000,
           msg: error.toString(),
           data: []
         }
       };
     }
   }

   async vendingCheckOrder(token, orderId) {
     console.log("🔍 [VENDING] Checking order status using internal handler...");
     
     try {
       // Create mock request and response objects
       const mockReq = {
         body: {
           token: token,
           orderId: orderId
         }
       };
       
       let responseData = null;
       let statusCode = 200;
       
       const mockRes = {
         status: (code) => {
           statusCode = code;
           return {
             json: (data) => {
               responseData = data;
             }
           };
         },
         json: (data) => {
           responseData = data;
         }
       };

       // Call the internal vending check order method
       await this.vendingRouter.handleCheckOrder(mockReq, mockRes);

       console.log("🔍 [VENDING] Internal check order response:", statusCode, responseData);
       return responseData;

     } catch (error) {
       console.error("❌ [VENDING] Check order error:", error.message);
       return {
         success: false,
         message: "Failed to check order",
         error: {
           code: 5000,
           msg: error.toString(),
           data: []
         }
       };
     }
   }

   async vendingPickup(token, orderId) {
     console.log("📦 [VENDING] Processing pickup using internal handler...");
     
     try {
       // Create mock request and response objects
       const mockReq = {
         body: {
           token: token,
           orderId: orderId
         }
       };
       
       let responseData = null;
       let statusCode = 200;
       
       const mockRes = {
         status: (code) => {
           statusCode = code;
           return {
             json: (data) => {
               responseData = data;
             }
           };
         },
         json: (data) => {
           responseData = data;
         }
       };

       // Call the internal vending pickup method
       await this.vendingRouter.handlePickup(mockReq, mockRes);

       console.log("📦 [VENDING] Internal pickup response:", statusCode, responseData);
       return responseData;

     } catch (error) {
       console.error("❌ [VENDING] Pickup error:", error.message);
       return {
         success: false,
         message: "Failed to process pickup",
         error: {
           code: 5000,
           msg: error.toString(),
           data: []
         }
       };
     }
   }

   async vendingRegister(avatar, birthday, deviceNumber, email, merchantId, mobile, mobileAreaCode, nickname, password) {
     console.log("📝 [VENDING] Registering new user using internal handler...");
     
     try {
       const registerData = {
         avatar: avatar,
         birthday: birthday,
         device_number: deviceNumber,
         email: email,
         merchant_id: merchantId,
         mobile: mobile,
         mobile_area_code: mobileAreaCode,
         nickname: nickname,
         password: password
       };

       // Create mock request and response objects
       const mockReq = {
         body: registerData
       };
       
       let responseData = null;
       let statusCode = 200;
       
       const mockRes = {
         status: (code) => {
           statusCode = code;
           return {
             json: (data) => {
               responseData = data;
             }
           };
         },
         json: (data) => {
           responseData = data;
         }
       };

       // Call the internal vending register method
       await this.vendingRouter.handleRegister(mockReq, mockRes);

       console.log("📝 [VENDING] Internal register response:", statusCode, responseData);
       return responseData;

     } catch (error) {
       console.error("❌ [VENDING] Registration error:", error.message);
       return {
         success: false,
         message: "Registration failed",
         error: {
           code: 5000,
           msg: error.toString(),
           data: []
         }
       };
     }
   }

  async waitForGKashOrder(storeId, orderId, orderModel) {
    console.log('⏳ [DEBUG] Starting GKash order confirmation wait...');
    
    const dateTime = new UtilDateTime();
    const currentGkashDate = dateTime.getCurrentDateString(); // Get current date string for collection name
    
    // Cloud Run safe timeouts: max 120s total wait
    const maxWaitTimeMs = 120000; // 2 minutes
    const startTime = Date.now();
    let attempt = 1;
    
    console.log('📅 [DEBUG] Using GKash date collection:', currentGkashDate);
    console.log('🏪 [DEBUG] Store ID:', storeId, 'Order ID:', orderId);
    console.log('⏱️ [DEBUG] Max wait time:', maxWaitTimeMs / 1000, 'seconds');
    
    // Fixed delay between attempts
    const fixedDelayMs = 1000; // 1 seconds
    
    while (Date.now() - startTime < maxWaitTimeMs) {
      try {
        // Use fixed delay for consistent polling
        const delayMs = fixedDelayMs;
        
        if (attempt > 1) {
          console.log(`⏰ [DEBUG] Waiting ${delayMs/1000}s before attempt ${attempt}...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        const remainingTime = Math.max(0, maxWaitTimeMs - (Date.now() - startTime));
        console.log(`🔍 [DEBUG] GKash confirmation attempt ${attempt} (${Math.round(remainingTime/1000)}s remaining)...`);
        
        // Check if GKash document exists in the date-based collection
        const gkashResults = await fireStore.collection('gkash')
          .doc(storeId)
          .collection(currentGkashDate)
          .doc(orderId)
          .get();
        
        if (gkashResults.exists) {
          console.log('✅ [DEBUG] GKash document found successfully after', Date.now() - startTime, 'ms');
          const gkashData = gkashResults.data();
          console.log('📊 [DEBUG] GKash data keys:', Object.keys(gkashData || {}));
          return gkashResults;
        } else {
          console.log(`⏳ [DEBUG] GKash document not found yet, continuing wait...`);
        }
        
        attempt++;
        
      } catch (error) {
        console.error('❌ [DEBUG] Error checking GKash confirmation:', error.message);
        attempt++;
        
        // If we can't check, wait before retrying
        if (Date.now() - startTime < maxWaitTimeMs) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    // Timeout occurred
    const totalWaitTime = Date.now() - startTime;
    console.log('⚠️ [DEBUG] GKash order timeout after', totalWaitTime, 'ms,', attempt, 'attempts');
    throw new Error(`GKash order timeout after ${Math.round(totalWaitTime/1000)}s`);
  }

  async processCreditPayment(orderModel, phoneString) {
    console.log('💳 [DEBUG] Processing credit payment for user:', phoneString);
    
    try {
      // Load user model to check credit balance
      const userModel = await this.loadUserModel(phoneString);
      if (!userModel) {
        throw new Error('User not found for credit payment');
      }
      
      const totalAmount = parseFloat(orderModel.totalprice || 0);
      const storeId = orderModel.storeid || orderModel.storeId;
      const currentCredits = userModel.getCredits(storeId);
      
      console.log('💰 [DEBUG] Required amount:', totalAmount, 'Available credits:', currentCredits);
      
      if (isNaN(currentCredits) || currentCredits < totalAmount) {
        throw new Error(`Insufficient credits. Required: ${totalAmount}, Available: ${currentCredits || 0}`);
      }
      
      // Deduct credits from user account using UserModel methods
      userModel.subtractCredits(storeId, totalAmount);
      console.log('💰 [DEBUG] deducting amount:', totalAmount, 'from ', storeId);
      const userDocId = `FU_${phoneString}`;
      
      console.log('💳 [DEBUG] Updating user document:', phoneString);
      await fireStore.collection('user').doc(userDocId).update(userModel.toMap());
      
      console.log('✅ [DEBUG] Credit payment processed. New balance:', userModel.getCredits(storeId));
      
      // Update order payment status
      orderModel.paymentstatus = 0; //kPaid
      //orderModel.creditUsed = totalAmount;
      //orderModel.remainingCredits = userModel.getCredits(storeId);
      
    } catch (error) {
      console.error('❌ [DEBUG] Credit payment failed:', error);
      throw error;
    }
  }

  async saveCounterOrder(storeId, orderModel) {
    console.log('🛒 [DEBUG] Saving COD order to counter_order collection...');
    
    try {
      orderModel.paymentstatus = -999;
      const counterOrderRef = fireStore.collection('store')
        .doc(storeId)
        .collection('counter_order')
        .doc(orderModel.id);
        
      await counterOrderRef.set(orderModel);
      console.log('✅ [DEBUG] COD order saved to counter_order');
      
    } catch (error) {
      console.error('❌ [DEBUG] Error saving COD order:', error);
      throw error;
    }
  }

  async saveToMyInvois(storeId, orderModel) {
    console.log('📄 [DEBUG] Saving to myInvois collection...');
    
    try {
      // Correct structure: myinvois/{storeId}/order/{orderId}
      const myInvoisRef = fireStore.collection('myinvois')
        .doc(storeId)
        .collection('order')
        .doc(orderModel.id);
        
      // Same structure for myreport: myreport/{storeId}/order/{orderId}
      const myReportRef = fireStore.collection('myreport')
        .doc(storeId)
        .collection('order')
        .doc(orderModel.id);
        
      // Clean up undefined values from orderModel before saving
      const cleanOrderModel = JSON.parse(JSON.stringify(orderModel, (key, value) => {
        return value === undefined ? null : value;
      }));
      
      console.log('📊 [DEBUG] Saving order model to myInvois:', JSON.stringify(cleanOrderModel, null, 2));
        
      // Run both operations in parallel without blocking
      Promise.all([
        myInvoisRef.set(cleanOrderModel),
        myReportRef.set(cleanOrderModel)
      ])
      .then(() => {
        console.log('✅ [DEBUG] Order saved to myinvois/{storeId}/order/{orderId}');
        console.log('✅ [DEBUG] Order saved to myreport/{storeId}/order/{orderId}');
      })
      .catch((error) => {
        console.error('❌ [DEBUG] Error saving to myInvois/myreport:', error);
        console.error('❌ [DEBUG] Order model data:', JSON.stringify(orderModel, null, 2));
        // Don't throw error as this is not critical for the success flow
      });
      
    } catch (error) {
      console.error('❌ [DEBUG] Error preparing myInvois/myreport operations:', error);
      console.error('❌ [DEBUG] Order model data:', JSON.stringify(orderModel, null, 2));
      // Don't throw error as this is not critical for the success flow
    }
  }

  async generatePickingList(storeId, orderModel, storeModel) {
    console.log('📋 [DEBUG] Generating ESL picking list...');
    
    try {
      const pickingListData = {
        orderId: orderModel.id,
        storeId: storeId,
        storeName: storeModel.title,
        items: orderModel.items || [],
        customerPhone: orderModel.phone,
        totalItems: (orderModel.items || []).length,
        createdAt: new Date(),
        status: 'PENDING'
      };
      
      const pickingListRef = fireStore.collection('store')
        .doc(storeId)
        .collection('picking_lists')
        .doc(orderModel.id);
        
      await pickingListRef.set(pickingListData);
      console.log('✅ [DEBUG] ESL picking list generated');
      
    } catch (error) {
      console.error('❌ [DEBUG] Error generating picking list:', error);
      throw error;
    }
  }

  async handleFeieReceipt(orderModel, storeModel) {
    console.log('🖨️ [DEBUG] Processing Feie receipt printing...');
    
    try {
      // This would integrate with the Feie cloud printer API
      const receiptData = {
        orderId: orderModel.id,
        storeName: storeModel.title,
        items: orderModel.items || [],
        total: orderModel.total,
        customerPhone: orderModel.phone,
        timestamp: new Date()
      };
      
      // TODO: Implement actual Feie API integration
      console.log('🖨️ [DEBUG] Receipt data prepared:', receiptData);
      console.log('✅ [DEBUG] Feie receipts processed (mock implementation)');
      
    } catch (error) {
      console.error('❌ [DEBUG] Error processing Feie receipts:', error);
      throw error;
    }
  }

  async retrievePickupCode(orderModel, phoneString) {
    console.log('🔑 [VENDING] ========== RETRIEVING PICKUP CODE ==========');
    console.log('🔑 [VENDING] Order ID:', orderModel.id);
    console.log('🔑 [VENDING] Vending ID:', orderModel.vendingid);
    console.log('🔑 [VENDING] Device Number:', orderModel.devicenumber);
    console.log('🔑 [VENDING] Merchant ID:', orderModel.merchantid);
    console.log('🔑 [VENDING] Phone String:', phoneString);
    
    try {
      // Get vending auth token
      console.log('🔑 [VENDING] Getting vending auth token...');
      const token = await this.getVendingAuthToken(orderModel);
      if (!token) {
        throw new Error('[VENDING] Failed to get vending auth token');
      }
      console.log('🔑 [VENDING] Auth token retrieved successfully');

      const maxAttempts = 1;
      const delayMs = 1500;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`🔑 [VENDING] Checking order for pickup code (attempt ${attempt}/${maxAttempts})...`);
        const orderResult = await this.vendingCheckOrder(token, orderModel.vendingid);
        console.log('🔑 [VENDING] Order check result:', JSON.stringify(orderResult, null, 2));

        // The internal handler returns { success, message, error } where message holds external API body

//        console.log("orderResult.message " + orderResult?.message?? " " );
//        console.log("orderResult.data " + orderResult?.data ?? " ");
//        console.log("orderResult.pickup_code " + orderResult.pickup_code ?? " ");
//        const payload = orderResult?.message ?? orderResult?.data ?? orderResult;
//        console.log("payload.pickup_code " + payload?.pickup_code ?? " ");
//        console.log("orderResult.message.pickup_code " + orderResult?.message?.pickup_code ?? " ");
//        const pickupCode = payload?.pickup_code;

        // Try multiple paths to find pickup_code
          const payload = orderResult?.message ?? orderResult?.data ?? orderResult;
          console.log("[VENDING] payload:", payload);
          console.log("[VENDING] payload.pickup_code:", payload?.pickup_code ?? "undefined");
          console.log("[VENDING] orderResult.message.pickup_code:", orderResult?.message?.pickup_code ?? "undefined");

          // Extract pickup_code - try all possible locations
          const pickupCode = payload?.pickup_code
             || payload?.data?.pickup_code
            || orderResult?.message?.pickup_code
            || orderResult?.data?.pickup_code
            || orderResult?.pickup_code;

          console.log("✅[VENDING]  Final extracted pickupCode:", pickupCode ?? "NOT FOUND");


        if (pickupCode) {
          orderModel.pickupcode = pickupCode;
          // Keep legacy field for backward compatibility
          orderModel.pickupCode = pickupCode;
          console.log('✅ [VENDING] Pickup code retrieved successfully:', pickupCode);
          break;
        }

        if (attempt < maxAttempts) {
          console.log(`⏳ [VENDING] Pickup code not ready. Retrying in ${delayMs}ms...`);
          await new Promise(r => setTimeout(r, delayMs));
        } else {
          console.log('⚠️ [VENDING] No pickup code available after retries');
        }
      }
    } catch (error) {
      console.error('❌ [VENDING] Error retrieving pickup code:', error);
      throw error;
    }
  }

  async cleanupOrder(storeId, orderId, phoneString) {
    console.log('🧹 [DEBUG] Cleaning up order_temp...');
    
    try {
      // Delete from order_temp collection
      await fireStore.collection('store')
        .doc(storeId)
        .collection('order_temp')
        .doc(orderId)
        .delete();
        
      console.log('✅ [DEBUG] Order cleanup completed');
      
    } catch (error) {
      console.error('❌ [DEBUG] Error during order cleanup:', error);
      throw error;
    }
  }

  async saveCurrentOrderToUser(orderModel, caller = 'UNKNOWN') {
    console.log("🔄 [DEBUG] Updating current order to user collection");
    console.log("🔄 [DEBUG] Order ID:", orderModel.id);
    console.log("🔄 [DEBUG] Caller:", caller);
    
    try {
      // Add fromserver field to the order model
      orderModel.fromserver = caller;
      
      // Get user phone number
      const phoneString = this.getPhoneString(orderModel);
      console.log("📞 [DEBUG] Phone string for user update:", phoneString);
      
      if (phoneString !== "0") {
        // Update the order in user's collection
        const userOrderRef = fireStore.collection('user')
          .doc(`FU_${phoneString}`)
          .collection('order')
          .doc(orderModel.id);
          
        // Update only specific parameters
        // const updateData = {
        //   ...orderModel,
        //   serverprogress: 1
        
        // };
        
        await userOrderRef.set(orderModel, { merge: true });
        console.log('✅ [DEBUG] Order updated in user collection with fromserver:', caller);
      } else {
        console.log('⚠️ [DEBUG] No valid phone number found, skipping user collection update');
      }
      
    } catch (error) {
      console.error('❌ [DEBUG] Error updating current order to user:', error);
      // Don't throw error as this is not critical for the success flow
    }
  }

  async updateCurrentOrderToUser(orderModel, caller = 'UNKNOWN') {
    console.log("🔄 [DEBUG] Updating current order to user collection");
    console.log("🔄 [DEBUG] Order ID:", orderModel.id);
    console.log("🔄 [DEBUG] Caller:", caller);
    
    try {
      // Add fromserver field to the order model
      orderModel.fromserver = caller;
      
      // Get user phone number
      const phoneString = this.getPhoneString(orderModel);
      console.log("📞 [DEBUG] Phone string for user update:", phoneString);
      
      if (phoneString !== "0") {
        // Update the order in user's collection
        const userOrderRef = fireStore.collection('user')
          .doc(`FU_${phoneString}`)
          .collection('cart_order')
          .doc("order");
          
        // Update only specific parameters
        const updateData = {
          ...orderModel,
          serverprogress: 1
        
        };
        
        await userOrderRef.set(updateData, { merge: true });
        console.log('✅ [DEBUG] Order updated in user collection with fromserver:', caller);
      } else {
        console.log('⚠️ [DEBUG] No valid phone number found, skipping user collection update');
      }
      
    } catch (error) {
      console.error('❌ [DEBUG] Error updating current order to user:', error);
      // Don't throw error as this is not critical for the success flow
    }
  }

  async processBlindboxVoucher(orderModel, phoneString) {
    console.log("🎁 [DEBUG] Processing blindbox voucher information");
    console.log("🎁 [DEBUG] Order ID:", orderModel.id);
    console.log("🎁 [DEBUG] Phone String:", phoneString);
    
    try {
      // Check if blindbox voucher ID exists in the order model
      const blindboxVoucherId = orderModel.blindboxVoucherId || orderModel.blindbox_voucher_id;
      
      if (blindboxVoucherId) {
        console.log("🎁 [DEBUG] Blindbox voucher ID found:", blindboxVoucherId);
        
        // Get Singapore local time
        const singaporeTime = new Date().toLocaleString("en-SG", {
          timeZone: "Asia/Singapore",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        });
        
        // Prepare blindbox voucher data
        const blindboxVoucherData = {
          blindboxVoucherId: blindboxVoucherId,
          blindboxVoucherRemark: orderModel.blindboxVoucherRemark || orderModel.blindbox_voucher_remark || "",
          blindboxVoucherCreateDateTime: orderModel.blindboxVoucherCreateDateTime || orderModel.blindbox_voucher_create_datetime || new Date().toISOString(),
          orderId: orderModel.id,
          storeId: orderModel.storeid,
          processedAt: singaporeTime
        };
        
        console.log("🎁 [DEBUG] Blindbox voucher data:", JSON.stringify(blindboxVoucherData, null, 2));
        
        if (phoneString !== "0") {
          // Save to bbitem collection
          const bbitemRef = fireStore.collection('bbitem')
            .doc(`FU_${phoneString}`);
            
          await bbitemRef.set(blindboxVoucherData);
          console.log('✅ [DEBUG] Blindbox voucher saved to bbitem collection for user:', phoneString);
        } else {
          console.log('⚠️ [DEBUG] No valid phone number found, skipping blindbox voucher save');
        }
      } else {
        console.log('⏭️ [DEBUG] No blindbox voucher ID found, skipping blindbox voucher processing');
      }
      
    } catch (error) {
      console.error('❌ [DEBUG] Error processing blindbox voucher:', error);
      // Don't throw error as this is not critical for the success flow
    }
  }

  async updateOrderTempMyReport(storeId, orderId, orderModel) {
    console.log("🔄 [DEBUG] Updating order_temp with latest order model");
    console.log("🔄 [DEBUG] Store ID:", storeId);
    console.log("🔄 [DEBUG] Order Document ID:", orderId);
    
    try {
      // Log key order details before saving
      console.log("📋 [DEBUG] === FINAL ORDER DATA BEING SAVED TO ORDER_TEMP ===");
      console.log("📋 [DEBUG] Order ID:", orderModel.id);
      console.log("📋 [DEBUG] Generated Order Number:", orderModel.orderid);
      console.log("📋 [DEBUG] Store ID:", orderModel.storeid);
      console.log("📋 [DEBUG] User Phone:", orderModel.userphonenumber);
      console.log("📋 [DEBUG] Order From Online:", orderModel.orderfromonline);
      console.log("📋 [DEBUG] Online Order ID:", orderModel.onlineorderid);
      console.log("📋 [DEBUG] Payment Type:", orderModel.paymenttype);
      console.log("📋 [DEBUG] Payment Status:", orderModel.paymentstatus);
      console.log("📋 [DEBUG] Total Paid:", orderModel.totalpaid);
      console.log("📋 [DEBUG] E-Pay Amount:", orderModel.epayamount);
      console.log("📋 [DEBUG] E-Payment Type:", orderModel.epaymenttype);
      console.log("📋 [DEBUG] Order Type:", orderModel.ordertype);
      console.log("📋 [DEBUG] Order Date Time:", orderModel.orderdatetime);
      console.log("📋 [DEBUG] Message ID:", orderModel.messageid);
      
      // Log order items summary
      // if (orderModel.orderitems && Array.isArray(orderModel.orderitems)) {
      //   console.log("📋 [DEBUG] Order Items Count:", orderModel.orderitems.length);
      //   orderModel.orderitems.forEach((item, index) => {
      //     console.log(`📋 [DEBUG] Item ${index + 1}: ${item.title || 'No Title'} - Qty: ${item.qty || item.quantity || 1} - Price: ${item.price || 0} - OrderID: ${item.orderid}`);
      //   });
      // } else {
      //   console.log("📋 [DEBUG] No order items found");
      // }
      
      // Log payment details if available
      // if (orderModel.epaymentdetail) {
      //   console.log("📋 [DEBUG] E-Payment Detail:", JSON.stringify(orderModel.epaymentdetail));
      // }
      
      // Log transaction details if available
      // if (orderModel.transactiondetail) {
      //   console.log("📋 [DEBUG] Transaction Detail:", JSON.stringify(orderModel.transactiondetail));
      // }
      
      // Log vending specific data if available
      // if (orderModel.devicenumber && orderModel.merchantid) {
      //   console.log("📋 [DEBUG] === VENDING MACHINE DATA ===");
      //   console.log("📋 [DEBUG] Device Number:", orderModel.devicenumber);
      //   console.log("📋 [DEBUG] Merchant ID:", orderModel.merchantid);
      //   console.log("📋 [DEBUG] Vending ID:", orderModel.vendingid);
      //   console.log("📋 [DEBUG] Pickup Code:", orderModel.pickupcode);
      // }
      
      console.log("📋 [DEBUG] === END OF ORDER DATA ===");
      
      // Run both operations in parallel without waiting
      Promise.all([
        fireStore.collection("store")
          .doc(storeId)
          .collection("order_temp")
          .doc(orderId)
          .set(orderModel),
        fireStore.collection("myreport")
          .doc(storeId)
          .collection("order")
          .doc(orderId)
          .set(orderModel)
      ])
      .then(() => {
        console.log("✅ [DEBUG] Successfully updated order_temp and myreport with processed order data");
        console.log("✅ [DEBUG] Order_temp document path: store/" + storeId + "/order_temp/" + orderId);
        console.log("✅ [DEBUG] Myreport document path: myreport/" + storeId + "/order/" + orderId);
      })
      .catch((error) => {
        console.error("❌ [DEBUG] Error updating order_temp/myreport:", error);
        console.error("❌ [DEBUG] Error details:", error.message);
      });
    } catch (ex) {
      console.error("❌ [DEBUG] Error updating order_temp:", ex);
      console.error("❌ [DEBUG] Error details:", ex.message);
      // Don't throw error as this is not critical for the success flow
    }
  }



  async getStoreFromVCID(vCID, gkashResult) {
    const dateTime = new UtilDateTime();
    try {

      console.log('Fetching store from Firestore for CID:', vCID);
      const querySnapshot = await  fireStore.collection('store').doc("online").collection("order_temp").doc(vCID).get();
     
      if (querySnapshot.empty) {
        console.log('No matching order found for CID:', vCID);
        return { id: "",status: 'not_found', error: "order not found" }; // Or throw an error if appropriate
      }

      // Assuming CID is unique, there should only be one document.
      const doc = querySnapshot;
      const currentOrderModel = doc.data();
      console.log('current order model from CID:', vCID);
      console.log(currentOrderModel);

      let onlineStoreId = "S_f452eb45-2971-4d5f-8c2d-5531bc2f6739"; //use this store for counter for now
      console.log("run transaction");
      await fireStore.runTransaction(async (transaction) => {
        const storeDoc = fireStore.collection("store").doc(onlineStoreId);
        const storeSnapshot = await transaction.get(storeDoc);
  
        // Convert the DocumentSnapshot to your StoreModel
        // Assuming you have a function to convert a Firestore document to a StoreModel
        const storeModel = this.convertToStoreModel(storeSnapshot); // Use your conversion function
  
        console.log(storeModel);
        let storeCount = storeModel.storecounter;
        transaction.update(storeDoc, { storecounter: storeCount + 1 }); // Use correct field name
  
        storeModel.storecounter = storeCount + 1; // Assuming currentStoreModel is available
        // Set counter to orderId
        currentOrderModel.orderid = storeModel.getTicket(); // Assuming getTicket() exists
        // Make sure the from online is set to true
        currentOrderModel.orderfromonline = true;
        currentOrderModel.onlineorderid = currentOrderModel.orderid ?? "";
  
        // Update orderId for each orderItems.
        if (Array.isArray(currentOrderModel.orderitems)) {
          currentOrderModel?.orderitems?.forEach((element) => {
            element.orderId = storeModel.getTicket();
          });
        } else {
          console.error('orderItems is not an array:', currentOrderModel.orderitems);
        }
      });


    // Adapt phone number handling
    var phoneString = currentOrderModel.userphonenumber || ""; // Assuming userPhoneNumber exists
    // You might need different logic to get the phone number in Node.js

      if (phoneString == "") {
        phoneString = "0"; //default
      }

         currentOrderModel.totalpaid = gkashResult.AMOUNT;
        currentOrderModel.epayamount = gkashResult.AMOUNT;
        currentOrderModel.epaymenttype = gkashResult.PAYMENT_TYPE
        currentOrderModel.paymenttype = gkashResult.PAYMENT_TYPE;
        currentOrderModel.epaymentdetail = gkashResult;
        currentOrderModel.transactiondetail = gkashResult;
        currentOrderModel.ordertype = 1;

    // Write order detail to store
    console.log("Writing order to store");
    console.log(currentOrderModel);
    await fireStore.collection("store")
    .doc("online")
    .collection("order")
    .doc(currentOrderModel.id)
    .set(currentOrderModel);

    // Assuming you have a function to process loyalty points
    await this.processOrderWithLoyaltyPoints(phoneString, currentOrderModel);


  // Save order to report
  console.log("Save order to report");
  await fireStore.collection("report").doc(currentOrderModel.id).set(currentOrderModel);

  // delete order temp
  // storeRef
  // .doc("online") // Use string constant if you have it
  // .collection("order_temp")
  // .doc(currentOrderModel.id) // Assuming orderModelId is the same as id
  // .delete();

    } catch (error) {
      console.error('Error fetching store from Firestore:', error);
      return  {id:"", status: 'error', error: error };  // Re-throw the error for handling in the calling function.
    }

    return { id:"", status: 'success', message: "order processed" };
  }

  

  convertToStoreModel(docSnapshot) {
    if (!docSnapshot.exists) {
      return null; // or throw an error, depending on your needs
    }
  
    const data = docSnapshot.data();
  
    // Create and return a StoreModel object
    return {
      id: docSnapshot.id,
      storecounter: data.storecounter || 0, // Provide a default value
      title: data.title,
      currency: data.currency,
      initial : data.initial,
      
      // ... other fields ...
      getTicket() {
        const paddedCounter = String(this.storecounter).padStart(4, '0');
        return "e" + (this.initial || "") + paddedCounter;
      }
    };
  }

  async  processOrderWithLoyaltyPoints(
   
    phoneNumber,
    orderModel
  ) {
    // Use UserModel static method for processing order with loyalty points
    try {
      await UserModel.processOrderWithLoyaltyPoints(
        fireStore.collection("user"), 
        phoneNumber, 
        orderModel
      );
      
      // Calculate points earned for return value
      let pointsEarned = 0;
      for (const item of orderModel.orderitems) {
        try {
          const orderAmount = this.calculateTotal(item);
          pointsEarned += orderAmount * 10;
        } catch (ex) {
          console.error("Error calculating loyalty points:", ex);
        }
      }
      
      return pointsEarned;
    } catch (e) {
      console.error("Error processing order with loyalty points:", e);
      throw e;
    }
  }

  calculateTotal(item) {  //total prior to tax, service charge and rounding
   
  
    let value = 0;
    
      try {
        // No need for type casting in JavaScript
        const itemPrice = item.quantity * item.price; // Assuming getTotalPrice() exists
        value += itemPrice;
      } catch (ex) {
          // Consider logging the error, even if you're ignoring it
          console.error("Error calculating net total for item:", item, ex);
      }
    
  
    return Math.max(0, value); // Use Math.max for conciseness
  }
  
  // Helper function to convert a Firestore document to a UserModel object
   convertToUserModel(docSnapshot) {
      // Use UserModel.fromDocument instead of custom conversion
      return UserModel.fromDocument(docSnapshot);
  }
  
  // Helper function to convert a UserModel object to a Map for Firestore
   convertToUserMap(userModel) {
      // Use UserModel's toMap method
      return userModel ? userModel.toMap() : {};
  }
  
  // Helper function to add loyalty points to the user model
   addLoyaltyPoints(userModel, storeId, points) {
      // Use UserModel's addLoyaltyPoints method
      if (userModel && typeof userModel.addLoyaltyPoints === 'function') {
          userModel.addLoyaltyPoints(storeId, points);
      }
  }


   createTransactionModelClass() {
    return class TransactionModel {
        constructor() {
            this.description = "";
            this.email = "";
            this.name = "";
            this.paymentType = "";
            this.mobile = "";
            this.currency = "";
            this.amount = "";
        }

        getDetailString() {
            // Customize this method to return the desired detail string
            return `Description: ${this.description}, Email: ${this.email}, Name: ${this.name}, Payment Type: ${this.paymentType}, Mobile: ${this.mobile}, Currency: ${this.currency}, Amount: ${this.amount}`;
        }
    }
}

//  getOrderTypeString(deliveryOption)
// {

//     if (deliveryOption.includes("DineIn")) {
//         return "DineIn"; // Use string constants if you have them
//     } else {
//         return "TakeAway";
//     }
// }


  


   paymentReturn (req, res, isBeta, version){

    const dateTime = new UtilDateTime();
    // const {
    //   CID,
    //   POID,
    //   status,
    //   cartid,
    //   currency,
    //   amount,
    //   signature,
    //   description,
    //   PaymentType,
    // } = req.body;
    // let refId =  req.body['CID'] ?? "";
    // console.log("**** payment return called: req");
    // console.log(refId);
    // console.log("**** payment return called: res");
    // console.log(res);
     // res.send("***payment return called");
    
     // Parse the query parameters
    const parsedUrl = url.parse(req.url);
    const queryParams = querystring.parse(parsedUrl.query);

    // Access individual parameters
    const storeId = queryParams.STOREID || 'defaultStore'; 
    // Extract version from query params or body if not provided as parameter
    const versionParam = version || queryParams.version || req.body.version || undefined;
    console.log("storeid:" + storeId);

      
    let vCID =  req.body['CID'] ?? "";
    let vPOID = req.body['POID'] ?? "";
    let vCartID = req.body['cartid'] ?? "";
    let vStatus = req.body['status'] ?? "";
    let vCurrency = req.body['currency'] ?? "";
    let vAmount = req.body['amount'] ?? "";
    let vSignature = req.body['signature'] ?? "";
    let vDescription = req.body['description'] ?? "";
    let vPaymentType = req.body['PaymentType'] ?? "";

    console.log('vCID:', vCID);
    console.log('vPOID:', vPOID);
    console.log('vCartID:', vCartID);
    console.log('vStatus:', vStatus);
    console.log('vCurrency:', vCurrency);
    console.log('vAmount:', vAmount);
    console.log('vSignature:', vSignature);
    console.log('vDescription:', vDescription);
    console.log('vPaymentType:', vPaymentType);


    
    writeGKashTransaction(storeId, dateTime.getCurrentDateString(),
      {
        CID: vCID,
        POID: vPOID,
        CARTID : vCartID,
        STATUS: vStatus,
        CURRENCY: vCurrency,
        AMOUNT: vAmount,
        SIGNATURE: vSignature,
        DESC: vDescription,
        PAYMENT_TYPE : vPaymentType
       }

      );


      const baseUrl = this.getVersionBaseUrl(versionParam, isBeta);
      var urlSuccessHeader = baseUrl + "/#/success/" + storeId + "/" + vCartID + "/" ;
      var urlFailHeader = baseUrl + "/#/failed/" + storeId + "/" + vCartID + "/" ;

      var redirectTo = urlSuccessHeader;
  
      if(vStatus.includes("88") == false)
      {
        redirectTo = urlFailHeader;
      }

      // Perform the redirect
      res.redirect(redirectTo); 

      console.log("payment redirected with status " + vStatus);
      console.log("payment redirected to " + redirectTo);
  }

   paymentResult(req, res){

    // const parsedUrl = url.parse(req.url);
    // const queryParams = querystring.parse(parsedUrl.query);

    // // Access individual parameters
    // const storeId = queryParams.STOREID || 'defaultStore'; 
    // console.log("storeid:" + storeId);

    let vCID =  req.body['CID'] ?? "";
    let vPOID = req.body['POID'] ?? "";
    let vCartID = req.body['cartid'] ?? "";
    let vStatus = req.body['status'] ?? "";
    let vCurrency = req.body['currency'] ?? "";
    let vAmount = req.body['amount'] ?? "";
    let vSignature = req.body['signature'] ?? "";
    let vDescription = req.body['description'] ?? "";
    let vPaymentType = req.body['PaymentType'] ?? "";

    console.log('vCID:', vCID);
    console.log('vPOID:', vPOID);
    console.log('vCartID:', vCartID);
    console.log('vStatus:', vStatus);
    console.log('vCurrency:', vCurrency);
    console.log('vAmount:', vAmount);
    console.log('vSignature:', vSignature);
    console.log('vDescription:', vDescription);
    console.log('vPaymentType:', vPaymentType);


    // writeGKashTransaction(storeId, dateTime.getCurrentDateString(),
    // {
    //   CID: vCID,
    //   POID: vPOID,
    //   CARTID : vCartID,
    //   STATUS: vStatus,
    //   CURRENCY: vCurrency,
    //   AMOUNT: vAmount,
    //   SIGNATURE: vSignature,
    //   DESC: vDescription,
    //   PAYMENT_TYPE : vPaymentType
    //  }

    // );


    res.send("***payment result called " + vCID);
  }

  async initPayment(req, res)  {

    
//     if (!req.body) {
//       res.status(400).json({ error: 'Request body is missing or empty' });
//       return;
// }

// const requiredFields = ['storeid'];
// for (const field of requiredFields) {
//       if (!(field in req.body)) {
//           res.status(400).json({ error: `Missing required field: ${field}` });
//           return;
//       }
// }



//  const { storeid } = req.body;

 
  
    // Concatenate parameters for signature calculation
   
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const cSignatureKey = "qdz7WDajSMaUOzo";
    const cCID = "M102-U-54392";
    const cCartID = `merchant-reference-${timeStamp}`;
    const cAmount = "100";
    const cCurrency = "MYR";

    const signatureString = `${cSignatureKey};${cCID};${cCartID};${cAmount};${cCurrency}`.toUpperCase();
    const testSignatureString = "SIGNATUREKEY9999;M161-U-999;MERCHANT-REFERENCE-712893;10000;MYR";
  
    // Calculate SHA512 signature
    const signatureKey = crypto.createHash('sha512').update(signatureString).digest('hex');
    //console.log(signatureKey);

    // res.status(200).send(signatureKey);
  
    // Prepare the data for the Axios POST request
    const postData = {
      version : "1.5.5",
      CID : cCID,
      v_currency : cCurrency,
      v_amount : "1.00",
      v_cartid : cCartID,
      signature : signatureKey,
      //v_preauth: "PREAUTH", // Replace with your logic for v_preauth
      //recurringtype: "MONTHLY", // Replace with your logic for recurringtype
      returnurl:"https://api.foodio.online/gkash/return" ,
      callbackurl:"https://api.foodio.online/gkash/callback",
      v_firstname : "john",
      v_lastname : "",
      v_billemail : "",
      v_billstreet : "",
      v_billpost : "",
      v_billcity : "",
      v_billstate : "",
      v_billcountry : "",
      v_billphone : "",
      v_shipstreet : "",
      v_shippost : "",
      v_shipcity : "",
      v_shipstate : "",
      v_shipcountry : "",
      //clientip,
      v_productdesc : "this is my product",
      preselection : "ECOMM",
      paymentmethod : "ECOMM"
    };
  
    try {
      // Make the POST request using Axios
      const formData = querystring.stringify(postData);

      console.log("init payment");
      console.log(postData);

      // Make the POST request using Axios
      axios.post('https://api-staging.pay.asia/api/paymentform.aspx', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
        .then(response => {
          // Handle the response based on your application's logic
          console.log(`init payment`);
          res.status(200).send(response.data);
        })
        .catch(error => {
          // Handle errors
          console.error(error);
          res.status(500).send(error);
        });
  
      //res.send('Payment form submitted!');
    } catch (error) {
      // Handle errors
      console.error(error);
      res.status(500).send('Error processing payment');
    }

  }

  async handleProcessOrder(req, res) {
    console.log('🚀 [API] ========== DIRECT ORDER PROCESSING (NO GKASH PAYMENT) ==========');
    
    try {
      // Extract parameters from request body
      const { storeId, orderId, gkashResult = null, options = {} } = req.body;
      
      console.log('🚀 [API] Request parameters:');
      console.log('🚀 [API] - Store ID:', storeId);
      console.log('🚀 [API] - Order ID:', orderId);
      console.log('🚀 [API] - GKash Result:', gkashResult ? JSON.stringify(gkashResult, null, 2) : 'NULL (No GKash payment needed)');
      console.log('🚀 [API] - Options:', JSON.stringify(options, null, 2));
      
      // Validate required parameters
      if (!storeId) {
        console.log('❌ [API] Missing required parameter: storeId');
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: storeId'
        });
      }
      
      if (!orderId) {
        console.log('❌ [API] Missing required parameter: orderId');
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: orderId'
        });
      }
      
      // gkashResult is optional - can be null for FREE/COD/CREDIT orders
      console.log('ℹ️ [API] GKash Result is optional for non-payment orders (FREE/COD/CREDIT)');
      
      // Set default options for direct API call
      const processOptions = {
        enablePrinting: false,
        enablePickingList: false,
        enableFullProcessing: true,
        deleteOrderTemp: false,
      };
      
      console.log('🚀 [API] Final processing options:', JSON.stringify(processOptions, null, 2));
      
      // Create empty gkashResult if none provided (for FREE/COD/CREDIT orders)
      const finalGkashResult = gkashResult || {
        CID: null,
        POID: null,
        CARTID: orderId,
        STATUS: null,
        CURRENCY: null,
        AMOUNT: null,
        SIGNATURE: null,
        DESC: 'Direct order processing - no GKash payment',
        PAYMENT_TYPE: 'COD'
      };
      
      console.log('🚀 [API] Final GKash Result:', JSON.stringify(finalGkashResult, null, 2));
      
      // Call the processOrderTransaction method
      const result = await this.processOrderTransaction(storeId, orderId, finalGkashResult, processOptions);
      
      if (result.status === 'success') {
        console.log('✅ [API] Order processing completed successfully');
        res.status(200).json({
          success: true,
          message: 'Order processed successfully',
          orderId: orderId,
          storeId: storeId,
          result: result
        });
      } else {
        console.log('❌ [API] Order processing failed:', result.error);
        res.status(400).json({
          success: false,
          error: result.error,
          orderId: orderId,
          storeId: storeId
        });
      }
      
    } catch (error) {
      console.error('💥 [API] Error in direct order processing:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during order processing',
        details: error.message
      });
    }
  }


  /**
   * Handle Game Play Order Processing
   * 
   * Flutter Web Example:
   * ```dart
   * import 'package:http/http.dart' as http;
   * import 'dart:convert';
   * 
   * Future<void> processGamePlayOrder({
   *   required String storeId,
   *   required String orderId,
   *   required Map<String, dynamic> order, // Order model from Firestore
   *   Map<String, dynamic>? gkashResult,
   *   Map<String, dynamic>? options,
   * }) async {
   *   final url = Uri.parse('https://your-api.com/processGamePlayOrder');
   *   
   *   final body = {
   *     'storeId': storeId,
   *     'orderId': orderId,
   *     'order': order, // Pass the entire order object
   *     'gkashResult': gkashResult,
   *     'options': options ?? {},
   *   };
   * 
   *   final response = await http.post(
   *     url,
   *     headers: {
   *       'Content-Type': 'application/json',
   *     },
   *     body: jsonEncode(body),
   *   );
   * 
   *   if (response.statusCode == 200) {
   *     final result = jsonDecode(response.body);
   *     print('Order processed: ${result['message']}');
   *   } else {
   *     throw Exception('Failed to process order: ${response.body}');
   *   }
   * }
   * 
   * // Usage:
   * // Get order from Firestore first
   * // final orderDoc = await FirebaseFirestore.instance
   * //   .collection('store')
   * //   .doc(storeId)
   * //   .collection('order_temp')
   * //   .doc(orderId)
   * //   .get();
   * // 
   * // final orderData = orderDoc.data()!;
   * // orderData['id'] = orderDoc.id;
   * // 
   * // await processGamePlayOrder(
   * //   storeId: 'your-store-id',
   * //   orderId: 'your-order-id',
   * //   order: orderData,
   * // );
   * ```
   */
  async handleGamePlayProcessOrder(req, res) {
    console.log('🚀 [API] ========== DIRECT GAME PLAY ORDER PROCESSING (NO GKASH PAYMENT) ==========');
    
    try {
      // Extract parameters from request body
      const { storeId, orderId, gkashResult = null, options = {}, order = null } = req.body;
      
      console.log('🚀 [GAME PLAY] Request parameters:');
      console.log('🚀 [GAME PLAY] - Store ID:', storeId);
      console.log('🚀 [GAME PLAY] - Order ID:', orderId);
      console.log('🚀 [GAME PLAY] - GKash Result:', gkashResult ? JSON.stringify(gkashResult, null, 2) : 'NULL (No GKash payment needed)');
      console.log('🚀 [GAME PLAY] - Options:', JSON.stringify(options, null, 2));
      console.log('🚀 [GAME PLAY] - Order provided:', order ? 'YES' : 'NO');
      
      // Validate required parameters
      if (!storeId) {
        console.log('❌ [GAME PLAY] Missing required parameter: storeId');
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: storeId'
        });
      }
      
      if (!orderId) {
        console.log('❌ [GAME PLAY] Missing required parameter: orderId');
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: orderId'
        });
      }
      
      // Use order from request if provided
      const currentOrderModel = order;
      if (currentOrderModel) {
        console.log('✅ [GAME PLAY] Using order from request - skipping Firestore load');
        // Ensure ID is set
        if (!currentOrderModel.id) {
          currentOrderModel.id = orderId;
        }
      } else {
        console.log('ℹ️ [GAME PLAY] No order provided - will load from Firestore');
      }
      
      // gkashResult is optional - can be null for FREE/COD/CREDIT orders
      console.log('ℹ️ [GAME PLAY] GKash Result is optional for non-payment orders (FREE/COD/CREDIT)');
      
      // Set default options for direct API call
      const processOptions = {
        enablePrinting: false,
        enablePickingList: false,
        enableFullProcessing: true,
        deleteOrderTemp: false,
      };
      
      console.log('🚀 [GAME PLAY] Final processing options:', JSON.stringify(processOptions, null, 2));
      
      // Create empty gkashResult if none provided (for FREE/COD/CREDIT orders)
      const finalGkashResult = gkashResult || {
        CID: null,
        POID: null,
        CARTID: orderId,
        STATUS: null,
        CURRENCY: null,
        AMOUNT: null,
        SIGNATURE: null,
        DESC: 'Game play order processing - no GKash payment',
        PAYMENT_TYPE: 'CREDIT'
      };
      
      console.log('🚀 [GAME PLAY] Final GKash Result:', JSON.stringify(finalGkashResult, null, 2));
      
      // Call the processOrderTransaction method with order model
      const result = await this.processGamePlayOrderTransaction(storeId, orderId, finalGkashResult, processOptions, 'COIN', currentOrderModel);
      
      if (result.status === 'success') {
        console.log('✅ [GAME PLAY] Order processing completed successfully');
        res.status(200).json({
          success: true,
          message: 'Order processed successfully',
          orderId: orderId,
          storeId: storeId,
          result: result
        });
      } else {
        console.log('❌ [GAME PLAY] Order processing failed:', result.error);
        res.status(400).json({
          success: false,
          error: result.error,
          orderId: orderId,
          storeId: storeId
        });
      }
      
    } catch (error) {
      console.error('💥 [GAME PLAY] Error in direct order processing:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during order processing',
        details: error.message
      });
    }
  }

  async handlePOSProcessOrder(req, res) {
    console.log('🚀 [API] ========== DIRECT POS ORDER PROCESSING (NO GKASH PAYMENT) ==========');
    
    try {
      // Extract parameters from request body
      const { storeId, orderId, gkashResult = null, options = {} } = req.body;
      
      console.log('🚀 [API] Request parameters:');
      console.log('🚀 [API] - Store ID:', storeId);
      console.log('🚀 [API] - Order ID:', orderId);
      console.log('🚀 [API] - GKash Result:', gkashResult ? JSON.stringify(gkashResult, null, 2) : 'NULL (No GKash payment needed)');
      console.log('🚀 [API] - Options:', JSON.stringify(options, null, 2));
      
      // Validate required parameters
      if (!storeId) {
        console.log('❌ [API] Missing required parameter: storeId');
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: storeId'
        });
      }
      
      if (!orderId) {
        console.log('❌ [API] Missing required parameter: orderId');
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: orderId'
        });
      }
      
      // gkashResult is optional - can be null for FREE/COD/CREDIT orders
      console.log('ℹ️ [API] GKash Result is optional for non-payment orders (FREE/COD/CREDIT)');
      
      // Set default options for direct API call
      const processOptions = {
        enablePrinting: false,
        enablePickingList: false,
        enableFullProcessing: true,
        deleteOrderTemp: false,
      };
      
      console.log('🚀 [API] Final processing options:', JSON.stringify(processOptions, null, 2));
      
      // Create empty gkashResult if none provided (for FREE/COD/CREDIT orders)
      const finalGkashResult = gkashResult || {
        CID: null,
        POID: null,
        CARTID: orderId,
        STATUS: null,
        CURRENCY: null,
        AMOUNT: null,
        SIGNATURE: null,
        DESC: 'Direct order processing - no GKash payment',
        PAYMENT_TYPE: 'COD'
      };
      
      console.log('🚀 [API] Final GKash Result:', JSON.stringify(finalGkashResult, null, 2));
      
      // Call the processOrderTransaction method
      const result = await this.processPOSOrderTransaction(storeId, orderId, finalGkashResult, processOptions);
      
      if (result.status === 'success') {
        console.log('✅ [API] Order processing completed successfully');
        res.status(200).json({
          success: true,
          message: 'Order processed successfully',
          orderId: orderId,
          storeId: storeId,
          result: result
        });
      } else {
        console.log('❌ [API] Order processing failed:', result.error);
        res.status(400).json({
          success: false,
          error: result.error,
          orderId: orderId,
          storeId: storeId
        });
      }
      
    } catch (error) {
      console.error('💥 [API] Error in direct order processing:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during order processing',
        details: error.message
      });
    }
  }

  async initSoundboxPayment(req, res) {
    console.log('🔊 [SOUNDBOX] ========== SOUNDBOX PAYMENT INITIATION ==========');
    
    try {
      // Extract parameters from request body
      const {
        amount = "100.00",
        currency = "MYR",
        cartId,
        terminalId,
        paymentId = "46119", // Default to DUITNOW QR DISPLAY
        firstName = "",
        lastName = "",
        billingEmail = "",
        billingAddress = "",
        billingPostcode = "",
        billingCity = "",
        billingState = "",
        billingCountry = "MY",
        billingPhone = "",
        shippingAddress = "",
        shippingPostcode = "",
        shippingCity = "",
        shippingState = "",
        shippingCountry = "MY",
        clientIp = "",
        productDescription = "",
        callbackUrl = "https://api.foodio.online/gkash/soundboxcallback"
      } = req.body;
      
      console.log('🔊 [SOUNDBOX] Request parameters:');
      console.log('🔊 [SOUNDBOX] - Amount:', amount);
      console.log('🔊 [SOUNDBOX] - Currency:', currency);
      console.log('🔊 [SOUNDBOX] - Cart ID:', cartId);
      console.log('🔊 [SOUNDBOX] - Terminal ID:', terminalId);
      console.log('🔊 [SOUNDBOX] - Payment ID:', paymentId);
      console.log('🔊 [SOUNDBOX] - Callback URL:', callbackUrl);
      
      // Validate required parameters
      if (!terminalId) {
        console.log('❌ [SOUNDBOX] Missing required parameter: terminalId');
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: terminalId'
        });
      }
      
      // Generate unique cart ID if not provided
      const timeStamp = Math.floor(Date.now() / 1000).toString();
      const cSignatureKey = this.cSignatureKey;
      const cCID = this.cCID;
      const cCartID = cartId || `soundbox-reference-${timeStamp}`;
      const cAmount = amount;
      const cCurrency = currency;
      
      console.log('🔊 [SOUNDBOX] Generated parameters:');
      console.log('🔊 [SOUNDBOX] - Signature Key:', cSignatureKey);
      console.log('🔊 [SOUNDBOX] - CID:', cCID);
      console.log('🔊 [SOUNDBOX] - Cart ID:', cCartID);
      console.log('🔊 [SOUNDBOX] - Amount:', cAmount);
      console.log('🔊 [SOUNDBOX] - Currency:', cCurrency);
      
      // Convert amount to format required for signature (remove decimal, pad to 3 digits)
      const formattedAmount = Math.round(parseFloat(cAmount.toString().replace(/,/g, '')) * 100).toString().padStart(3, '0');
      console.log('🔊 [SOUNDBOX] - Formatted Amount for signature:', formattedAmount);
      
      // Create signature string (same as existing logic)
      const signatureString = `${cSignatureKey};${cCID};${cCartID};${formattedAmount};${cCurrency}`.toUpperCase();
      console.log('🔊 [SOUNDBOX] - Signature String:', signatureString);
      
      // Calculate SHA512 signature
      const signature = crypto.createHash('sha512').update(signatureString).digest('hex');
      console.log('🔊 [SOUNDBOX] - Generated Signature:', signature);
      
      // Prepare the data for the soundbox payment request
      const postData = {
        version: "1.5.5",
        CID: cCID,
        v_currency: cCurrency,
        v_amount: cAmount,
        v_cartid: cCartID,
        signature: signature,
        callbackurl: callbackUrl,
        v_firstname: firstName,
        v_lastname: lastName,
        v_billemail: billingEmail,
        v_billstreet: billingAddress,
        v_billpost: billingPostcode,
        v_billcity: billingCity,
        v_billstate: billingState,
        v_billcountry: billingCountry,
        v_billphone: billingPhone,
        v_shipstreet: shippingAddress,
        v_shippost: shippingPostcode,
        v_shipcity: shippingCity,
        v_shipstate: shippingState,
        v_shipcountry: shippingCountry,
        clientip: clientIp,
        v_productdesc: productDescription,
        terminalID: terminalId,
        paymentid: paymentId,
        isSoundBox: true
      };
      
      console.log('🔊 [SOUNDBOX] - Request Data:', JSON.stringify(postData, null, 2));
      
      // Make the POST request to soundbox payment endpoint
      const formData = querystring.stringify(postData);
      
      console.log('🔊 [SOUNDBOX] Making request to soundbox payment endpoint...');
      
      const response = await axios.post('https://api-staging.pay.asia/api/payment/submit', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      console.log('🔊 [SOUNDBOX] Response received:');
      console.log('🔊 [SOUNDBOX] - Status:', response.status);
      console.log('🔊 [SOUNDBOX] - Data:', response.data);
      
      res.status(200).json({
        success: true,
        message: 'Soundbox payment initiated successfully',
        data: response.data,
        requestDetails: {
          cartId: cCartID,
          terminalId: terminalId,
          amount: cAmount,
          currency: cCurrency,
          paymentId: paymentId,
          signature: signature
        }
      });
      
    } catch (error) {
      console.error('💥 [SOUNDBOX] Error initiating soundbox payment:', error);
      
      // Handle axios errors
      if (error.response) {
        console.error('💥 [SOUNDBOX] Response error:', error.response.status, error.response.data);
        res.status(error.response.status).json({
          success: false,
          error: 'Soundbox payment request failed',
          details: error.response.data
        });
      } else if (error.request) {
        console.error('💥 [SOUNDBOX] Network error:', error.request);
        res.status(500).json({
          success: false,
          error: 'Network error while connecting to soundbox payment service'
        });
      } else {
        console.error('💥 [SOUNDBOX] General error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Internal server error during soundbox payment initiation',
          details: error.message
        });
      }
         }
   }

   async cancelSoundboxPayment(req, res) {
     console.log('🔊 [SOUNDBOX-CANCEL] ========== SOUNDBOX PAYMENT CANCELLATION ==========');
     
     try {
       // Extract parameters from request body
       const { terminalId } = req.body;
       
       console.log('🔊 [SOUNDBOX-CANCEL] Request parameters:');
       console.log('🔊 [SOUNDBOX-CANCEL] - Terminal ID:', terminalId);
       
       // Validate required parameters
       if (!terminalId) {
         console.log('❌ [SOUNDBOX-CANCEL] Missing required parameter: terminalId');
         return res.status(400).json({
           success: false,
           error: 'Missing required parameter: terminalId'
         });
       }
       
       // Generate signature according to GKash documentation
       const cSignatureKey = this.cSignatureKey;
       console.log('🔊 [SOUNDBOX-CANCEL] Signature Key:', cSignatureKey);
       
       // Create signature string: yourSignatureKey;TerminalId
       const signatureString = `${cSignatureKey};${terminalId}`.toUpperCase();
       console.log('🔊 [SOUNDBOX-CANCEL] Signature String:', signatureString);
       
       // Calculate SHA512 signature and convert to uppercase
       const signature = crypto.createHash('sha512').update(signatureString).digest('hex').toUpperCase();
       console.log('🔊 [SOUNDBOX-CANCEL] Generated Signature:', signature);
       
       // Prepare the data for the soundbox cancel request
       const cancelData = {
         TerminalId: terminalId,
         signature: signature
       };
       
       console.log('🔊 [SOUNDBOX-CANCEL] Request Data:', JSON.stringify(cancelData, null, 2));
       
       // Make the POST request to soundbox cancel endpoint
       console.log('🔊 [SOUNDBOX-CANCEL] Making request to soundbox cancel endpoint...');
       
       const response = await axios.post('https://api-staging.pay.asia/apim/merchant/SoundboxCancel', cancelData, {
         headers: {
           'Content-Type': 'application/json'
         }
       });
       
       console.log('🔊 [SOUNDBOX-CANCEL] Response received:');
       console.log('🔊 [SOUNDBOX-CANCEL] - Status:', response.status);
       console.log('🔊 [SOUNDBOX-CANCEL] - Data:', response.data);
       
       res.status(200).json({
         success: true,
         message: 'Soundbox payment cancellation request sent successfully',
         data: response.data,
         requestDetails: {
           terminalId: terminalId,
           signature: signature
         }
       });
       
     } catch (error) {
       console.error('💥 [SOUNDBOX-CANCEL] Error canceling soundbox payment:', error);
       
       // Handle axios errors
       if (error.response) {
         console.error('💥 [SOUNDBOX-CANCEL] Response error:', error.response.status, error.response.data);
         res.status(error.response.status).json({
           success: false,
           error: 'Soundbox payment cancellation failed',
           details: error.response.data
         });
       } else if (error.request) {
         console.error('💥 [SOUNDBOX-CANCEL] Network error:', error.request);
         res.status(500).json({
           success: false,
           error: 'Network error while connecting to soundbox cancellation service'
         });
       } else {
         console.error('💥 [SOUNDBOX-CANCEL] General error:', error.message);
         res.status(500).json({
           success: false,
           error: 'Internal server error during soundbox payment cancellation',
           details: error.message
         });
       }
     }
   }

   async publishSoundboxInvoice(req, res) {
     console.log('🔊 [SOUNDBOX-INVOICE] ========== SOUNDBOX E-INVOICE QR DISPLAY ==========');
     
     try {
       // Extract parameters from request body
       const { terminalId, invoiceValue, referenceNo } = req.body;
       
       console.log('🔊 [SOUNDBOX-INVOICE] Request parameters:');
       console.log('🔊 [SOUNDBOX-INVOICE] - Terminal ID:', terminalId);
       console.log('🔊 [SOUNDBOX-INVOICE] - Invoice Value:', invoiceValue);
       console.log('🔊 [SOUNDBOX-INVOICE] - Reference No:', referenceNo);
       
       // Validate required parameters
       if (!terminalId) {
         console.log('❌ [SOUNDBOX-INVOICE] Missing required parameter: terminalId');
         return res.status(400).json({
           success: false,
           error: 'Missing required parameter: terminalId'
         });
       }
       
       if (!invoiceValue) {
         console.log('❌ [SOUNDBOX-INVOICE] Missing required parameter: invoiceValue');
         return res.status(400).json({
           success: false,
           error: 'Missing required parameter: invoiceValue'
         });
       }
       
       if (!referenceNo) {
         console.log('❌ [SOUNDBOX-INVOICE] Missing required parameter: referenceNo');
         return res.status(400).json({
           success: false,
           error: 'Missing required parameter: referenceNo'
         });
       }
       
       // Generate signature according to GKash documentation
       const cSignatureKey = this.cSignatureKey;
       console.log('🔊 [SOUNDBOX-INVOICE] Signature Key:', cSignatureKey);
       
       // Create signature string: yourSignatureKey;ReferenceNo;TerminalId;InvoiceValue
       const signatureString = `${cSignatureKey};${referenceNo};${terminalId};${invoiceValue}`.toUpperCase();
       console.log('🔊 [SOUNDBOX-INVOICE] Signature String:', signatureString);
       
       // Calculate SHA512 signature and convert to uppercase
       const signature = crypto.createHash('sha512').update(signatureString).digest('hex').toUpperCase();
       console.log('🔊 [SOUNDBOX-INVOICE] Generated Signature:', signature);
       
       // Prepare the data for the publish invoice request
       const invoiceData = {
         TerminalId: terminalId,
         InvoiceValue: invoiceValue,
         ReferenceNo: referenceNo,
         Signature: signature
       };
       
       console.log('🔊 [SOUNDBOX-INVOICE] Request Data:', JSON.stringify(invoiceData, null, 2));
       
       // Make the POST request to publish invoice endpoint
       console.log('🔊 [SOUNDBOX-INVOICE] Making request to publish invoice endpoint...');
       
       const response = await axios.post('https://api-staging.pay.asia/apim/merchant/PublishInvoice', invoiceData, {
         headers: {
           'Content-Type': 'application/json'
         }
       });
       
       console.log('🔊 [SOUNDBOX-INVOICE] Response received:');
       console.log('🔊 [SOUNDBOX-INVOICE] - Status:', response.status);
       console.log('🔊 [SOUNDBOX-INVOICE] - Data:', response.data);
       
       res.status(200).json({
         success: true,
         message: 'Soundbox e-Invoice QR display request sent successfully',
         data: response.data,
         requestDetails: {
           terminalId: terminalId,
           invoiceValue: invoiceValue,
           referenceNo: referenceNo,
           signature: signature
         }
       });
       
     } catch (error) {
       console.error('💥 [SOUNDBOX-INVOICE] Error publishing soundbox invoice:', error);
       
       // Handle axios errors
       if (error.response) {
         console.error('💥 [SOUNDBOX-INVOICE] Response error:', error.response.status, error.response.data);
         res.status(error.response.status).json({
           success: false,
           error: 'Soundbox e-Invoice display request failed',
           details: error.response.data
         });
       } else if (error.request) {
         console.error('💥 [SOUNDBOX-INVOICE] Network error:', error.request);
         res.status(500).json({
           success: false,
           error: 'Network error while connecting to soundbox invoice service'
         });
       } else {
         console.error('💥 [SOUNDBOX-INVOICE] General error:', error.message);
         res.status(500).json({
           success: false,
           error: 'Internal server error during soundbox invoice display',
           details: error.message
         });
       }
     }
   }

   async handleSoundboxCallback(req, res) {
     console.log('🔊 [SOUNDBOX-CALLBACK] ========== SOUNDBOX PAYMENT CALLBACK ==========');
     
     try {
       // Log all received parameters
       console.log('🔊 [SOUNDBOX-CALLBACK] Received callback data:', JSON.stringify(req.body, null, 2));
       
       // Extract key parameters (no validation, just for logging and processing)
       const { status, cartid } = req.body;
       
       console.log('🔊 [SOUNDBOX-CALLBACK] Key parameters:');
       console.log('🔊 [SOUNDBOX-CALLBACK] - Status:', status);
       console.log('🔊 [SOUNDBOX-CALLBACK] - Cart ID:', cartid);
       
       // Determine payment status based on status field
       let paymentStatus = 'unknown';
       if (status && status.includes('88')) {
         paymentStatus = 'success';
       } else if (status && status.includes('66')) {
         paymentStatus = 'failed';
       } else if (status && status.includes('11')) {
         paymentStatus = 'pending';
       }
       
       console.log('🔊 [SOUNDBOX-CALLBACK] Determined payment status:', paymentStatus);
       
       // Store all callback data in single collection
       await this.storeSoundboxCallback(cartid || 'no-cartid', req.body, paymentStatus);
       
       // GKash requires "OK" response
       console.log('✅ [SOUNDBOX-CALLBACK] Callback processed successfully - returning OK');
       res.status(200).send('OK');
       
     } catch (error) {
       console.error('💥 [SOUNDBOX-CALLBACK] Error processing callback:', error);
       
       // Even if there's an error, we should return OK to GKash to avoid retries
       // Log the error but don't fail the callback
       res.status(200).send('OK');
     }
   }



   async storeSoundboxCallback(cartid, callbackData, paymentStatus) {
     try {
       console.log('💾 [SOUNDBOX-STORE] Storing callback data for cart ID:', cartid);
       console.log('💾 [SOUNDBOX-STORE] Payment status:', paymentStatus);
       
       const timestamp = new Date().toISOString();
       const callbackDoc = {
         ...callbackData,
         timestamp: timestamp,
         payment_status: paymentStatus,
         source: 'soundbox_callback'
       };
       
       // Store in single Firebase collection for easy monitoring
       await this.writeWithRetry(
         fireStore.collection("gkash_soundbox").doc(cartid),
         callbackDoc
       );
       
       console.log('✅ [SOUNDBOX-STORE] Callback data stored successfully in gkash_soundbox collection');
       
     } catch (error) {
       console.error('❌ [SOUNDBOX-STORE] Error storing callback data:', error);
       // Don't throw error as this shouldn't fail the callback
     }
   }
 
   async handlePoint(req, res) {
    try {
      // Validate request body
      if (!req.body) {
        return res.status(400).json({
          success: false,
          message: 'Request body is missing or empty'
        });
      }

      const { phoneNumber, orderModelId, storeId, pointAction } = req.body;

      // Validate required parameters
      if (!phoneNumber || !orderModelId || !storeId || !pointAction) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: phoneNumber, orderModelId, storeId, and pointAction are required'
        });
      }

      // Validate pointAction value
      if (pointAction !== 'add' && pointAction !== 'reduce') {
        return res.status(400).json({
          success: false,
          message: 'Invalid pointAction value. Must be either "add" or "reduce"'
        });
      }

      // Get order from Firestore
      const orderRef = fireStore
        .collection('store')
        .doc(storeId)
        .collection('today_order')
        .doc(orderModelId);

      const orderDoc = await orderRef.get();

      // Check if order exists
      if (!orderDoc.exists) {
        return res.status(404).json({
          success: false,
          message: `Order ${orderModelId} not found in store ${storeId}`
        });
      }

      const orderModel = orderDoc.data();
      let pointsProcessed = 0;

      if (pointAction === 'add') {
        // Process loyalty points (add)
        pointsProcessed = await this.processOrderWithLoyaltyPoints(phoneNumber, orderModel);
      } else {
        // Process loyalty points (reduce)
        pointsProcessed = await this.reduceOrderLoyaltyPoints(phoneNumber, orderModel);
      }

      return res.status(200).json({
        success: true,
        message: `Loyalty points ${pointAction === 'add' ? 'added' : 'reduced'} successfully`,
        orderId: orderModelId,
        phoneNumber: phoneNumber,
        storeId: storeId,
        pointsProcessed: pointsProcessed,
        action: pointAction
      });

    } catch (error) {
      console.error('Error processing loyalty points:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to process loyalty points',
        error: error.message
      });
    }
  }

  async reduceOrderLoyaltyPoints(phoneNumber, orderModel) {
    // Get the specific user document reference
    const userDocRef = fireStore.collection("user").doc(`FU_${phoneNumber}`);
    const result = await userDocRef.get();
    var pointsReduced = 0;

    if (result.exists) {
      try {
        // Create UserModel from document
        const userModel = result.data();

        // Calculate loyalty points to reduce (1 dollar = 10 points)
        for (const item of orderModel.orderitems) {
          try {
            const orderAmount = this.calculateTotal(item);
            pointsReduced = orderAmount * 10;
            
            // Reduce loyalty points for the store
            if (userModel.loyaltypoints && userModel.loyaltypoints[item.storeid]) {
              userModel.loyaltypoints[item.storeid] = Math.max(
                0, 
                userModel.loyaltypoints[item.storeid] - pointsReduced
              );
            }
          } catch (ex) {
            console.error("Error reducing loyalty points:", ex);
          }
        }

        // Update user document with reduced loyalty points
        console.log("Update user document with reduced loyalty points");
        await userDocRef.update(userModel);

      } catch (e) {
        console.error("Error processing order with loyalty points reduction:", e);
        throw e;
      }
    } else {
      throw new Error("User not found");
    }

    return pointsReduced;
  }

  // SECTION: Voucher Limit API Endpoints
  
  /**
   * API Endpoint: Create voucher limit
   * POST /voucher/create-limit
   * Body: { machineModelId: "MODEL001", voucherId: "VOUCHER123", limit: 100 }
   */
  async createVoucherLimitEndpoint(req, res) {
    try {
      const { machineModelId, voucherId, limit } = req.body;
      
      if (!machineModelId || !voucherId || !limit) {
        return res.status(400).json({
          success: false,
          message: 'machineModelId, voucherId and limit are required'
        });
      }

      const result = await this.createVoucherLimit(machineModelId, voucherId, limit);
      
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in createVoucherLimitEndpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * API Endpoint: Increment voucher count
   * POST /voucher/increment
   * Body: { machineModelId: "MODEL001", voucherId: "VOUCHER123" }
   */
  async incrementVoucherCountEndpoint(req, res) {
    try {
      const { machineModelId, voucherId } = req.body;
      
      if (!machineModelId || !voucherId) {
        return res.status(400).json({
          success: false,
          message: 'machineModelId and voucherId are required'
        });
      }

      const result = await this.incrementVoucherCount(machineModelId, voucherId);
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in incrementVoucherCountEndpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * API Endpoint: Check voucher limit
   * GET /voucher/check/:machineModelId/:voucherId
   */
  async checkVoucherLimitEndpoint(req, res) {
    try {
      const { machineModelId, voucherId } = req.params;
      
      if (!machineModelId || !voucherId) {
        return res.status(400).json({
          success: false,
          message: 'machineModelId and voucherId are required'
        });
      }

      const result = await this.checkVoucherLimit(machineModelId, voucherId);
      res.status(200).json(result);
    } catch (error) {
      console.error('Error in checkVoucherLimitEndpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * API Endpoint: Get voucher limit details
   * GET /voucher/details/:machineModelId/:voucherId
   */
  async getVoucherLimitDetailsEndpoint(req, res) {
    try {
      const { machineModelId, voucherId } = req.params;
      
      if (!machineModelId || !voucherId) {
        return res.status(400).json({
          success: false,
          message: 'machineModelId and voucherId are required'
        });
      }

      const result = await this.getVoucherLimitDetails(machineModelId, voucherId);
      res.status(200).json(result);
    } catch (error) {
      console.error('Error in getVoucherLimitDetailsEndpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * API Endpoint: Remove voucher limit
   * DELETE /voucher/remove/:machineModelId/:voucherId
   */
  async removeVoucherLimitEndpoint(req, res) {
    try {
      const { machineModelId, voucherId } = req.params;
      
      if (!machineModelId || !voucherId) {
        return res.status(400).json({
          success: false,
          message: 'machineModelId and voucherId are required'
        });
      }

      const result = await this.removeVoucherLimit(machineModelId, voucherId);
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in removeVoucherLimitEndpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * API Endpoint: List all voucher limits
   * GET /voucher/list-all-limits
   * Returns raw data from crm_voucher_limit collection
   */
  async listAllVoucherLimitsEndpoint(req, res) {
    try {
      console.log("📋 [LIST_LIMITS] Fetching all voucher limits...");

      const result = await this.listAllVoucherLimits();
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Error in listAllVoucherLimitsEndpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // SECTION: Voucher Limit Management Functions
  
  /**
   * Create a voucher limit document with machine model ID, voucher ID and limit
   * @param {string} machineModelId - The machine model ID
   * @param {string} voucherId - The voucher ID
   * @param {number} limit - The maximum number of claims allowed
   * @returns {Promise<Object>} Result object with success status
   */
  async createVoucherLimit(machineModelId, voucherId, limit) {
    try {
      // Create composite key: machineModelId_voucherId
      const compositeKey = `${machineModelId}_${voucherId}`;
      const voucherLimitRef = fireStore.collection("crm_voucher_limit").doc(compositeKey);
      
      const voucherLimitData = {
        machineModelId: machineModelId,
        voucherId: voucherId,
        compositeKey: compositeKey,
        limit: limit,
        count: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await voucherLimitRef.set(voucherLimitData);
      
      console.log(`✅ Voucher limit created for ${compositeKey} with limit ${limit}`);
      return {
        success: true,
        message: `Voucher limit created successfully`,
        data: voucherLimitData
      };
    } catch (error) {
      console.error(`❌ Error creating voucher limit for ${machineModelId}_${voucherId}:`, error);
      return {
        success: false,
        message: 'Failed to create voucher limit',
        error: error.message
      };
    }
  }

  /**
   * Atomically increment voucher claim count using Firestore transaction
   * @param {string} machineModelId - The machine model ID
   * @param {string} voucherId - The voucher ID
   * @returns {Promise<Object>} Result object with success status and count info
   */
  async incrementVoucherCount(machineModelId, voucherId) {
    try {
      // Create composite key: machineModelId_voucherId
      const compositeKey = `${machineModelId}_${voucherId}`;
      const voucherLimitRef = fireStore.collection("crm_voucher_limit").doc(compositeKey);
      
      const result = await fireStore.runTransaction(async (transaction) => {
        const voucherDoc = await transaction.get(voucherLimitRef);
        
        if (!voucherDoc.exists) {
          // Document doesn't exist, no limit applied
          return {
            success: true,
            limitReached: false,
            count: 0,
            limit: null,
            machineModelId: machineModelId,
            voucherId: voucherId,
            message: "No limit set for this voucher"
          };
        }

        const voucherData = voucherDoc.data();
        const currentCount = voucherData.count || 0;
        const limit = voucherData.limit || 0;

        // Check if limit is already reached
        if (currentCount >= limit) {
          return {
            success: false,
            limitReached: true,
            count: currentCount,
            limit: limit,
            machineModelId: machineModelId,
            voucherId: voucherId,
            message: `Voucher claim limit reached (${currentCount}/${limit}) for machine model ${machineModelId}`
          };
        }

        // Increment the count
        const newCount = currentCount + 1;
        transaction.update(voucherLimitRef, {
          count: newCount,
          updatedAt: new Date()
        });

        return {
          success: true,
          limitReached: newCount >= limit,
          count: newCount,
          limit: limit,
          machineModelId: machineModelId,
          voucherId: voucherId,
          message: `Voucher count incremented to ${newCount}/${limit} for machine model ${machineModelId}`
        };
      });

      if (result.success) {
        console.log(`🔢 Voucher ${compositeKey} count: ${result.count}/${result.limit || 'unlimited'}`);
      } else {
        console.log(`⚠️ Voucher ${compositeKey} limit reached: ${result.count}/${result.limit}`);
      }

      return result;
    } catch (error) {
      console.error(`❌ Error incrementing voucher count for ${machineModelId}_${voucherId}:`, error);
      return {
        success: false,
        limitReached: false,
        count: 0,
        limit: 0,
        machineModelId: machineModelId,
        voucherId: voucherId,
        message: 'Failed to increment voucher count',
        error: error.message
      };
    }
  }

  /**
   * Check if voucher limit is reached without incrementing
   * @param {string} machineModelId - The machine model ID
   * @param {string} voucherId - The voucher ID
   * @returns {Promise<Object>} Result object with limit check info
   */
  async checkVoucherLimit(machineModelId, voucherId) {
    try {
      // Create composite key: machineModelId_voucherId
      const compositeKey = `${machineModelId}_${voucherId}`;
      const voucherLimitRef = fireStore.collection("crm_voucher_limit").doc(compositeKey);
      const voucherDoc = await voucherLimitRef.get();
      
      if (!voucherDoc.exists) {
        // Document doesn't exist, no limit applied
        return {
          success: true,
          limitReached: false,
          count: 0,
          limit: null,
          machineModelId: machineModelId,
          voucherId: voucherId,
          message: "No limit set for this voucher"
        };
      }

      const voucherData = voucherDoc.data();
      const currentCount = voucherData.count || 0;
      const limit = voucherData.limit || 0;
      const limitReached = currentCount >= limit;

      console.log(`🔍 Voucher ${compositeKey} check: ${currentCount}/${limit} ${limitReached ? '(LIMIT REACHED)' : '(OK)'}`);

      return {
        success: true,
        limitReached: limitReached,
        count: currentCount,
        limit: limit,
        machineModelId: machineModelId,
        voucherId: voucherId,
        message: limitReached 
          ? `Voucher limit reached (${currentCount}/${limit}) for machine model ${machineModelId}` 
          : `Voucher available (${currentCount}/${limit}) for machine model ${machineModelId}`
      };
    } catch (error) {
      console.error(`❌ Error checking voucher limit for ${machineModelId}_${voucherId}:`, error);
      return {
        success: false,
        limitReached: false,
        count: 0,
        limit: 0,
        machineModelId: machineModelId,
        voucherId: voucherId,
        message: 'Failed to check voucher limit',
        error: error.message
      };
    }
  }

  /**
   * Get voucher limit details
   * @param {string} machineModelId - The machine model ID
   * @param {string} voucherId - The voucher ID
   * @returns {Promise<Object>} Result object with voucher limit details
   */
  async getVoucherLimitDetails(machineModelId, voucherId) {
    try {
      // Create composite key: machineModelId_voucherId
      const compositeKey = `${machineModelId}_${voucherId}`;
      const voucherLimitRef = fireStore.collection("crm_voucher_limit").doc(compositeKey);
      const voucherDoc = await voucherLimitRef.get();
      
      if (!voucherDoc.exists) {
        return {
          success: true,
          exists: false,
          data: null,
          machineModelId: machineModelId,
          voucherId: voucherId,
          message: "Voucher limit not found"
        };
      }

      const voucherData = voucherDoc.data();
      
      return {
        success: true,
        exists: true,
        data: voucherData,
        machineModelId: machineModelId,
        voucherId: voucherId,
        message: "Voucher limit details retrieved successfully"
      };
    } catch (error) {
      console.error(`❌ Error getting voucher limit details for ${machineModelId}_${voucherId}:`, error);
      return {
        success: false,
        exists: false,
        data: null,
        machineModelId: machineModelId,
        voucherId: voucherId,
        message: 'Failed to get voucher limit details',
        error: error.message
      };
    }
  }

  /**
   * Remove voucher limit document
   * @param {string} machineModelId - The machine model ID
   * @param {string} voucherId - The voucher ID
   * @returns {Promise<Object>} Result object with success status
   */
  async removeVoucherLimit(machineModelId, voucherId) {
    try {
      // Create composite key: machineModelId_voucherId
      const compositeKey = `${machineModelId}_${voucherId}`;
      const voucherLimitRef = fireStore.collection("crm_voucher_limit").doc(compositeKey);
      
      // Check if document exists before attempting to delete
      const voucherDoc = await voucherLimitRef.get();
      
      if (!voucherDoc.exists) {
        console.log(`⚠️ Voucher limit not found for ${compositeKey}`);
        return {
          success: false,
          exists: false,
          machineModelId: machineModelId,
          voucherId: voucherId,
          message: "Voucher limit not found - nothing to remove"
        };
      }

      const voucherData = voucherDoc.data();
      
      // Delete the document
      await voucherLimitRef.delete();
      
      console.log(`🗑️ Voucher limit removed for ${compositeKey}`);
      return {
        success: true,
        exists: true,
        machineModelId: machineModelId,
        voucherId: voucherId,
        removedData: {
          count: voucherData.count || 0,
          limit: voucherData.limit || 0,
          createdAt: voucherData.createdAt,
          updatedAt: voucherData.updatedAt
        },
        message: `Voucher limit removed successfully for machine model ${machineModelId}`
      };
    } catch (error) {
      console.error(`❌ Error removing voucher limit for ${machineModelId}_${voucherId}:`, error);
      return {
        success: false,
        exists: false,
        machineModelId: machineModelId,
        voucherId: voucherId,
        message: 'Failed to remove voucher limit',
        error: error.message
      };
    }
  }

  /**
   * List all voucher limits - returns raw data from Firestore collection
   * @returns {Promise<Object>} Result object with raw voucher limits data
   */
  async listAllVoucherLimits() {
    try {
      console.log("📋 [LIST_ALL_LIMITS] Fetching all voucher limits from crm_voucher_limit collection...");
      
      // Get all documents from crm_voucher_limit collection
      const voucherLimitsSnapshot = await fireStore.collection("crm_voucher_limit").get();
      
      console.log("📋 [LIST_ALL_LIMITS] Found", voucherLimitsSnapshot.docs.length, "documents");
      
      const voucherLimits = [];
      
      // Just return the raw data from each document
      for (const doc of voucherLimitsSnapshot.docs) {
        const data = doc.data();
        voucherLimits.push({
          id: doc.id,
          ...data
        });
      }
      
      console.log("📋 [LIST_ALL_LIMITS] Returning", voucherLimits.length, "voucher limit records");
      
      return {
        success: true,
        data: voucherLimits,
        total: voucherLimits.length,
        message: `Retrieved ${voucherLimits.length} voucher limits from database`
      };
      
    } catch (error) {
      console.error("❌ [LIST_ALL_LIMITS] Error listing voucher limits:", error);
      return {
        success: false,
        data: [],
        total: 0,
        message: 'Failed to list voucher limits',
        error: error.message
      };
    }
  }

  async paymentQuery(req, res) {
    console.log('🔍 [PAYMENT-QUERY] ========== PAYMENT QUERY REQUEST ==========');
    console.log('🔍 [PAYMENT-QUERY] Request body:', JSON.stringify(req.body, null, 2));
    
    try {
      const { version, CID, cartid, currency, amount, signature } = req.body;
      
      // Validate required fields
      if (!version || !CID || !cartid || !currency || !amount || !signature) {
        console.log('❌ [PAYMENT-QUERY] Missing required fields');
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: version, CID, cartid, currency, amount, signature'
        });
      }
      
      console.log('🔍 [PAYMENT-QUERY] Querying payment for:');
      console.log('🔍 [PAYMENT-QUERY] - Version:', version);
      console.log('🔍 [PAYMENT-QUERY] - CID:', CID);
      console.log('🔍 [PAYMENT-QUERY] - Cart ID:', cartid);
      console.log('🔍 [PAYMENT-QUERY] - Currency:', currency);
      console.log('🔍 [PAYMENT-QUERY] - Amount:', amount);
      console.log('🔍 [PAYMENT-QUERY] - Signature:', signature);
      
      // Prepare query data
      const queryData = {
        version: version,
        CID: CID,
        cartid: cartid,
        currency: currency,
        amount: amount,
        signature: signature
      };
      
      console.log('🔍 [PAYMENT-QUERY] Making request to GKash API...');
     
      // Make request to GKash API
      const response = await axios.post('https://api.gkash.my/api/payment/query', queryData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });
      
      console.log('🔍 [PAYMENT-QUERY] Response received:');
      console.log('🔍 [PAYMENT-QUERY] - Status:', response.status);
      console.log('🔍 [PAYMENT-QUERY] - Data:', JSON.stringify(response.data, null, 2));
      
      // Return the response from GKash API
      res.status(response.status).json(response.data);
      
    } catch (error) {
      console.error('❌ [PAYMENT-QUERY] Error occurred:');
      console.error('❌ [PAYMENT-QUERY] - Message:', error.message);
      console.error('❌ [PAYMENT-QUERY] - Status:', error.response?.status);
      console.error('❌ [PAYMENT-QUERY] - Response:', error.response?.data);
      
      // Handle different types of errors
      if (error.response) {
        // API returned an error response
        res.status(error.response.status).json({
          success: false,
          message: 'Payment query failed',
          error: error.response.data,
          status: error.response.status
        });
      } else if (error.request) {
        // Request was made but no response received
        res.status(500).json({
          success: false,
          message: 'No response from payment API',
          error: 'Network timeout or connection error'
        });
      } else {
        // Something else happened
        res.status(500).json({
          success: false,
          message: 'Internal server error',
          error: error.message
        });
      }
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = GKashRouter;