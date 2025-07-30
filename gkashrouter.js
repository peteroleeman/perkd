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
const { UserModel } = require('./models/UserModel');
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
    
    this.initializeRoutes();
  }

  //SECTION router
  initializeRoutes() {

    this.router.get('/about', function(req, res) {
     res.json({ message: `Endpoint for GKash integration v1.13`});
    });

    //point related
    this.router.post('/point', this.handlePoint.bind(this));
     //OTP related
     this.router.post('/send-otp', this.handleSendONEOTP.bind(this));
  
     // Normal endpoints (isBeta = false)
     this.router.post('/return', (req, res) => this.paymentTBReturn(req, res, false));
     this.router.post('/crmreturn', (req, res) => this.paymentCRMReturn(req, res, false));
     this.router.post('/vmreturn', (req, res) => this.paymentVMReturn(req, res, false));

     // Beta endpoints (isBeta = true)
     this.router.post('/betareturn', (req, res) => this.paymentReturn(req, res, false));
     this.router.post('/betacrmreturn', (req, res) => this.paymentCRMReturn(req, res, false));
     this.router.post('/betavmreturn', (req, res) => this.paymentVMReturn(req, res, false));


     this.router.post('/crmsimplereturn', this.paymentCRMSimpleReturn.bind(this));
     this.router.post('/callback', this.paymentResult.bind(this));
    this.router.post('/initpayment', this.initPayment.bind(this));
    this.router.post('/createstore', this.createStore.bind(this));


    this.router.post('/remoteinitpayment', this.remote_initPayment.bind(this));
    this.router.post('/remotecallback', this.remote_paymentResult.bind(this));
    this.router.post('/remotecancelpayment', this.remote_cancelPayment.bind(this));
    this.router.post('/remoterefund', this.remote_Refund.bind(this));
    this.router.post('/remotestatus', this.remote_Status.bind(this));

    //customer scan
    this.router.post('/remotegetqr', this.remote_getQR.bind(this));
    this.router.post('/remotegetqrcallback', this.remote_getQRCallBack.bind(this));

    // Direct order processing endpoint (no GKash payment required)
    this.router.post('/processOrder', this.handleProcessOrder.bind(this));

    // Soundbox payment endpoint
    this.router.post('/soundbox', this.initSoundboxPayment.bind(this));
    
    // Soundbox callback endpoint
    this.router.post('/soundboxcallback', this.handleSoundboxCallback.bind(this));
    
    // Soundbox cancel payment endpoint
    this.router.post('/soundboxcancel', this.cancelSoundboxPayment.bind(this));
    
    // Soundbox publish e-Invoice endpoint
    this.router.post('/soundboxinvoice', this.publishSoundboxInvoice.bind(this));

    // Loyalty cards endpoint
    /*
    POST /copyloyaltycards
    {
      "userId": "FU_1234567890",
      "loyaltyCardIds": ["card_1", "card_2", "card_3"]
    }
    */
    this.router.post('/copyloyaltycards', this.handleCopyLoyaltyCards.bind(this));

  }


  //gkash offline payment
  async remote_initPayment(req, res)  {

    
    // Convert v_amount to 2 decimal places and remove commas or decimal points
    //const formattedAmount = (parseFloat(v_amount.replace(/,/g, '')) * 100).toFixed(0);
  
    // Concatenate parameters for signature calculation
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const cSignatureKey = this.cSignatureKey;//"qdz7WDajSMaUOzo";
    const cCID = this.cCID; //"M102-U-54392";
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

  async remote_cancelPayment(req, res)  {

    const cSignatureKey = this.cSignatureKey; //"qdz7WDajSMaUOzo";
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
  async handleSendONEOTP(req, res) {
    const phoneNumber = req.body.phonenumber;
    if (!phoneNumber) {
      res.status(400).json({ 
        otp: "",
        message: 'Phone number is required.' 
      });
      return;
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
    const apiUrl = `https://wba-api.onewaysms.com/api.aspx?apiusername=APIOOZLYLKO&apipassword=APIOOZLYLKOOOZL&mobile=${cleanPhoneNumber}&message=*T1529|${otp}`;

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

  async paymentCRMReturn (req, res, isBeta){

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
    var urlSuccessHeader = "https://foodio-online-best10.web.app/#/crmsuccess/" + storeId + "/" + vCartID + "/" ;
    var urlFailHeader = "https://foodio-online-best10.web.app/#/crmfailed/" + storeId + "/" + vCartID + "/" ;

    if(isBeta) {
      urlSuccessHeader = "https://foodio-online-cloud9.web.app/#/crmsuccess/" + storeId + "/" + vCartID + "/" ;
      urlFailHeader = "https://foodio-online-cloud9.web.app/#/crmfailed/" + storeId + "/" + vCartID + "/" ;
    }

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
        
        const result = await this.processOrderTransaction(storeId, vCartID, gkashResult, crmOptions);
        
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


  async paymentTBReturn (req, res, isBeta){
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


      var urlSuccessHeader = "https://foodio-online-best10.web.app/#/tbsuccess/" + storeId + "/" + vCartID + "/" ;
      var urlFailHeader = "https://foodio-online-best10.web.app/#/tbfailed/" + storeId + "/" + vCartID + "/" ;

      if(isBeta)
      {
        urlSuccessHeader = "https://foodio-online-cloud9.web.app/#/tbsuccess/" + storeId + "/" + vCartID + "/" ;
             urlFailHeader = "https://foodio-online-cloud9.web.app/#/tbfailed/" + storeId + "/" + vCartID + "/" ;
      }
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
        
        const result = await this.processOrderTransaction(storeId, vCartID, gkashResult, vmOptions);
        
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

 async paymentVMReturn (req, res, isBeta){
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


      var urlSuccessHeader = "https://foodio-online-best10.web.app/#/success/" + storeId + "/" + vCartID + "/" ;
      var urlFailHeader = "https://foodio-online-best10.web.app/#/failed/" + storeId + "/" + vCartID + "/" ;

      if(isBeta)
      {
        urlSuccessHeader = "https://foodio-online-cloud9.web.app/#/success/" + storeId + "/" + vCartID + "/" ;
             urlFailHeader = "https://foodio-online-cloud9.web.app/#/failed/" + storeId + "/" + vCartID + "/" ;
      }
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
        
        const result = await this.processOrderTransaction(storeId, vCartID, gkashResult, vmOptions);
        
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

  async processOrderTransaction(storeId, orderId, gkashResult, options = {}) {
    const dateTime = new UtilDateTime();
    
    // Process options with defaults
    const {
      enablePrinting = false,        // Whether to enable receipt printing
      enablePickingList = false,     // Whether to generate picking lists
      enableFullProcessing = true,  // Whether to enable all processing features
      deleteOrderTemp = false       // Whether to delete order_temp after processing
    } = options;
    
    try {
      console.log('🚀 [DEBUG] Starting processOrderTransaction for storeId:', storeId, 'orderId:', orderId);
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
      } else if (enableFullProcessing && currentOrderModel.paymenttype.toUpperCase() !== "FREE" && currentOrderModel.paymenttype.toUpperCase() !== "COD") {
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
      
      // Always save to myInvois collection
      if (enableFullProcessing && (currentOrderModel.paymenttype !== "COD") ) {
        console.log('📄 [DEBUG] Saving to myInvois collection...');
        await this.saveToMyInvois(storeId, currentOrderModel);
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

      // Step 10: Handle vending machine specific logic
      if (isVendingOrder) {
        console.log('🤖 [DEBUG] Step 10: Processing vending order specifics...');
        console.log('📦 [DEBUG] Saving to pickup collection...');
        await this.saveToPickupCollection(currentOrderModel);
        console.log('📞 [DEBUG] Triggering vending payment callback...');
        await this.triggerVendingPaymentCallback(currentOrderModel, currentStoreModel);
        console.log('✅ [DEBUG] Step 10 Complete: Vending order processing done');
      } else {
        console.log('⏭️ [DEBUG] Step 10 Skipped: Not a vending order');
      }

      // Step 10.5: Generate ESL picking list (for non-vending orders)
      if (enableFullProcessing && enablePickingList && !isVendingOrder) {
        console.log('📋 [DEBUG] Step 10.5: Generating ESL picking list...');
        await this.generatePickingList(storeId, currentOrderModel, currentStoreModel);
        console.log('✅ [DEBUG] Step 10.5 Complete: ESL picking list generated');
      } else {
        console.log('⏭️ [DEBUG] Step 10.5 Skipped: ESL picking list not needed');
      }

      // Step 10.6: Handle Feie receipt printing (for non-vending orders)
      if (enableFullProcessing && enablePrinting && !isVendingOrder) {
        console.log('🖨️ [DEBUG] Step 10.6: Processing Feie receipt printing...');
        await this.handleFeieReceipt(currentOrderModel, currentStoreModel);
        console.log('✅ [DEBUG] Step 10.6 Complete: Feie receipts processed');
      } else {
        console.log('⏭️ [DEBUG] Step 10.6 Skipped: Feie printing not needed');
      }

      // Step 10.7: Retrieve pickup code for vending orders
      if (enableFullProcessing && isVendingOrder && currentOrderModel.vendingid) {
        console.log('🔑 [DEBUG] Step 10.7: Retrieving pickup code for vending order...');
        await this.retrievePickupCode(currentOrderModel, phoneString);
        console.log('✅ [DEBUG] Step 10.7 Complete: Pickup code retrieved');
      } else {
        console.log('⏭️ [DEBUG] Step 10.7 Skipped: No pickup code retrieval needed');
      }

      // Step 11: Update order_temp with the latest order model
      console.log('🔄 [DEBUG] Step 11: Updating order_temp with latest order model... ' + storeId + " " + orderId);

      await this.updateOrderTemp(storeId, orderId, currentOrderModel);
      console.log('✅ [DEBUG] Step 11 Complete: order_temp updated with processed data');

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
    orderModel.epaymenttype = gkashResult.PAYMENT_TYPE;
    orderModel.paymenttype = gkashResult.PAYMENT_TYPE;
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
    console.log("Saving order to collections");
    
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
        console.log("🎫 [VOUCHER] Item Quantity:", orderItem.qty);
        console.log("🎫 [VOUCHER] Voucher String:", orderItem.voucherstring);
        console.log("🎫 [VOUCHER] Store ID:", orderItem.storeid);
        console.log("🎫 [VOUCHER] Store Title:", orderItem.store);
        
        try {
          const userRef = fireStore.collection("user").doc(`FU_${phoneString}`);
          console.log("🎫 [VOUCHER] User Document Path:", `FU_${phoneString}`);
          
          // Query existing vouchers
          console.log("🎫 [VOUCHER] Querying for existing vouchers with menuid:", orderItem.menuid);
          
          // DEBUG: List all voucher menu IDs from collection for debugging
          console.log("🎫 [VOUCHER] === DEBUGGING: Listing all voucher menu IDs ===");
          const allVouchersDebug = await userRef.collection("vouchers").get();
          console.log("🎫 [VOUCHER] Total vouchers in collection:", allVouchersDebug.size);
          
          const menuIdsFound = [];
          allVouchersDebug.forEach(doc => {
            const data = doc.data();
            if (data.menuId !== undefined) {
              menuIdsFound.push({
                voucherId: data.id,
                menuId: data.menuId,
                menuIdType: typeof data.menuId,
                title: data.title
              });
            } else {
              console.log("🎫 [VOUCHER] Voucher without menuId field:", data.id, "Title:", data.title);
            }
          });
          
          console.log("🎫 [VOUCHER] All menu IDs found:", menuIdsFound);
          console.log("🎫 [VOUCHER] Looking for menuId:", orderItem.menuid, "Type:", typeof orderItem.menuid);
          console.log("🎫 [VOUCHER] === END DEBUGGING ===");
          
          const vouchersSnapshot = await userRef
            .collection("vouchers")
            .where('menuId', '==', orderItem.menuid)
            .get();
          
          console.log("🎫 [VOUCHER] Found", vouchersSnapshot.size, "existing vouchers");

          if (!vouchersSnapshot.empty) {
            // Use the first matching voucher found
            const voucherDoc = vouchersSnapshot.docs[0];
            const voucher = voucherDoc.data();
            
            console.log("🎫 [VOUCHER] === UPDATING EXISTING VOUCHER ===");
            console.log("🎫 [VOUCHER] Existing Voucher ID:", voucher.id);
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
                console.log("🎫 [VOUCHER] Parsed QTY from string:", parsedQty, "x", (orderItem.qty || 1), "=", qty);
              } else {
                console.log("🎫 [VOUCHER] QTY pattern found but no match - using default");
                qty = orderItem.qty || 1;
              }
            } else {
              console.log("🎫 [VOUCHER] No QTY pattern in voucherString - using orderItem.qty");
              qty = orderItem.qty || 1;
            }
            
            console.log("🎫 [VOUCHER] Final calculated quantity to add:", qty);
            
            // Update existing voucher
            const newQuantity = (voucher.quantity || 0) + qty;
            console.log("🎫 [VOUCHER] New total quantity:", voucher.quantity || 0, "+", qty, "=", newQuantity);
            
            const updateData = {
              quantity: newQuantity,
              isredeemed: false,
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

  async copyLoyaltyCardsToUser(userId, loyaltyCardIds = []) {
    console.log("🎫 [LOYALTY_CARDS] ========== STARTING LOYALTY CARD COPYING ==========");
    console.log("🎫 [LOYALTY_CARDS] User ID:", userId);
    console.log("🎫 [LOYALTY_CARDS] Loyalty Card IDs:", loyaltyCardIds);

    try {
      const userRef = fireStore.collection('user').doc(userId);
      const batch = fireStore.batch();

      // Copy loyalty cards if any are configured
      if (loyaltyCardIds.length > 0) {
        console.log("🔍 [LOYALTY_CARDS] Checking which cards user already has...");
        
        // First check which cards the user already has
        const userCardsSnapshot = await userRef
          .collection('loyalty_cards')
          .where(fireStore.FieldPath.documentId(), 'in', loyaltyCardIds)
          .get();

        // Create a set of existing card IDs for faster lookup
        const existingCardIds = new Set(userCardsSnapshot.docs.map(doc => doc.id));
        console.log("🎫 [LOYALTY_CARDS] Existing card IDs:", Array.from(existingCardIds));

        // Filter out cards that user already has
        const cardsToAdd = loyaltyCardIds.filter(cardId => !existingCardIds.has(cardId));
        console.log("🎫 [LOYALTY_CARDS] Cards to add:", cardsToAdd);

        if (cardsToAdd.length > 0) {
          console.log("📥 [LOYALTY_CARDS] Fetching loyalty cards to copy...");
          
          // Get only the cards that need to be copied from loyalty_cards collection
          const loyaltyCardsSnapshot = await fireStore.collection('loyalty_cards')
            .where(fireStore.FieldPath.documentId(), 'in', cardsToAdd)
            .get();

          // Copy only new cards to user's collection
          for (const doc of loyaltyCardsSnapshot.docs) {
            const loyaltyCardData = doc.data();
            const newLoyaltyCardRef = userRef
              .collection('loyalty_cards')
              .doc(doc.id);
            
            batch.set(newLoyaltyCardRef, loyaltyCardData);
            console.log("🎫 [LOYALTY_CARDS] Queued card for copying:", doc.id);
          }
          console.log(`✅ [LOYALTY_CARDS] Queued ${cardsToAdd.length} new loyalty cards for copying`);
        } else {
          console.log("⏭️ [LOYALTY_CARDS] All loyalty cards already exist for user, skipping card copying");
        }
      } else {
        console.log("⏭️ [LOYALTY_CARDS] No loyalty card IDs provided");
      }

      // Always attempt to copy relevant vouchers, regardless of loyalty card status
      await this._copyRelevantVouchersToUser(userRef, batch);

      // Commit the batch
      console.log("💾 [LOYALTY_CARDS] Committing batch operations...");
      await batch.commit();
      console.log("✅ [LOYALTY_CARDS] Successfully copied loyalty cards and vouchers");
      
      console.log("🎫 [LOYALTY_CARDS] ========== COMPLETED LOYALTY CARD COPYING ==========");
      return { success: true, message: "Loyalty cards and vouchers copied successfully" };

    } catch (error) {
      console.error("❌ [LOYALTY_CARDS] Error copying loyalty cards and vouchers:", error);
      console.error("❌ [LOYALTY_CARDS] Error stack:", error.stack);
      throw error;
    }
  }

  async _copyRelevantVouchersToUser(userRef, batch) {
    console.log("🎁 [RELEVANT_VOUCHERS] ========== COPYING RELEVANT VOUCHERS ==========");
    
    try {
      // This method can be implemented based on your business logic
      // For example, copy vouchers based on store, user preferences, etc.
      
      // Example implementation - copy global vouchers or store-specific vouchers
      const relevantVouchersSnapshot = await fireStore.collection('global_vouchers')
        .where('isActive', '==', true)
        .where('giveOnSignup', '==', true)
        .get();

      if (!relevantVouchersSnapshot.empty) {
        for (const doc of relevantVouchersSnapshot.docs) {
          const voucherData = doc.data();
          
          // Check if user already has this voucher
          const existingVoucherDoc = await userRef
            .collection('vouchers')
            .doc(doc.id)
            .get();

          if (!existingVoucherDoc.exists) {
            const newVoucherRef = userRef
              .collection('vouchers')
              .doc(doc.id);
            
            // Add voucher with user-specific data
            const userVoucherData = {
              ...voucherData,
              addedAt: new Date(),
              isRedeemed: false,
              redeemedAt: null
            };
            
            batch.set(newVoucherRef, userVoucherData);
            console.log("🎁 [RELEVANT_VOUCHERS] Queued voucher for copying:", doc.id);
          } else {
            console.log("⏭️ [RELEVANT_VOUCHERS] User already has voucher:", doc.id);
          }
        }
        console.log(`✅ [RELEVANT_VOUCHERS] Queued ${relevantVouchersSnapshot.docs.length} relevant vouchers`);
      } else {
        console.log("⏭️ [RELEVANT_VOUCHERS] No relevant vouchers found");
      }
      
         } catch (error) {
       console.error("❌ [RELEVANT_VOUCHERS] Error copying relevant vouchers:", error);
       // Don't throw here, just log the error so loyalty card copying can still proceed
     }
   }

  async handleCopyLoyaltyCards(req, res) {
    console.log("🎫 [API] ========== COPY LOYALTY CARDS ENDPOINT ==========");
    
    try {
      const { userId, loyaltyCardIds } = req.body;
      
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

      // Call the main method
      const result = await this.copyLoyaltyCardsToUser(userId, cardIds);
      
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
      console.log("Cannot add loyalty points - missing order, store model, or phone number");
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

  async saveToPickupCollection(orderModel) {
    console.log("📦 [VENDING] ========== SAVING TO PICKUP COLLECTION ==========");
    console.log("📦 [VENDING] Order ID:", orderModel.id);
    console.log("📦 [VENDING] Merchant ID:", orderModel.merchantid);
    console.log("📦 [VENDING] Device Number:", orderModel.devicenumber);
    console.log("📦 [VENDING] User Phone Number:", orderModel.userphonenumber);
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
    
    const maxWaitingTime = 1000;
    let currentWaiting = 1;
    let gkashResults = null;
    
    console.log('📅 [DEBUG] Using GKash date collection:', currentGkashDate);
    console.log('🏪 [DEBUG] Store ID:', storeId, 'Order ID:', orderId);
    
    // Exponential delay loop: i starts at 1, then 2, 4, 8, 16, 32, etc.
    for (let i = 1; i < maxWaitingTime && currentWaiting < maxWaitingTime; i += i) {
      try {
        console.log(`⏰ [DEBUG] Waiting ${i} seconds before attempt ${currentWaiting}...`);
        await new Promise(resolve => setTimeout(resolve, i * 1000)); // Convert to milliseconds
        
        console.log(`🔍 [DEBUG] GKash confirmation attempt ${currentWaiting}/${maxWaitingTime}...`);
        
        // Check if GKash document exists in the date-based collection
        gkashResults = await fireStore.collection('gkash')
          .doc(storeId)
          .collection(currentGkashDate)
          .doc(orderId)
          .get();
          
        currentWaiting++;
        
        if (gkashResults.exists) {
          console.log('✅ [DEBUG] GKash document found successfully');
          const gkashData = gkashResults.data();
          console.log('📊 [DEBUG] GKash data:', JSON.stringify(gkashData));
          return gkashResults;
        } else {
          console.log(`⏳ [DEBUG] GKash document not found yet, continuing wait...`);
        }
        
      } catch (error) {
        console.error('❌ [DEBUG] Error checking GKash confirmation:', error);
        currentWaiting++;
      }
    }
    
    // Timeout occurred
    console.log('⚠️ [DEBUG] GKash order timeout after', currentWaiting, 'attempts');
    throw new Error("GKash order timeout");
  }

  async processCreditPayment(orderModel, phoneString) {
    console.log('💳 [DEBUG] Processing credit payment for user:', phoneString);
    
    try {
      // Load user model to check credit balance
      const userModel = await this.loadUserModel(phoneString);
      if (!userModel) {
        throw new Error('User not found for credit payment');
      }
      
      const totalAmount = parseFloat(orderModel.total || 0);
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
        
      // Save to both collections using batch write for atomicity
      const batch = fireStore.batch();
      batch.set(myInvoisRef, cleanOrderModel);
      batch.set(myReportRef, cleanOrderModel);
      
      await batch.commit();
      
      console.log('✅ [DEBUG] Order saved to myinvois/{storeId}/order/{orderId}');
      console.log('✅ [DEBUG] Order saved to myreport/{storeId}/order/{orderId}');
      
    } catch (error) {
      console.error('❌ [DEBUG] Error saving to myInvois/myreport:', error);
      console.error('❌ [DEBUG] Order model data:', JSON.stringify(orderModel, null, 2));
      throw error;
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
      
      // Check order status and get pickup code
      console.log('🔑 [VENDING] Checking order for pickup code...');
      const orderResult = await this.vendingCheckOrder(token, orderModel.vendingid);
      console.log('🔑 [VENDING] Order check result:', JSON.stringify(orderResult, null, 2));
      
      if (orderResult && orderResult.pickup_code) {
        orderModel.pickupCode = orderResult.pickup_code;
        console.log('✅ [VENDING] Pickup code retrieved successfully:', orderResult.pickup_code);
      } else {
        console.log('⚠️ [VENDING] No pickup code available yet - Order result:', orderResult);
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

  async updateOrderTemp(storeId, orderId, orderModel) {
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
      if (orderModel.orderitems && Array.isArray(orderModel.orderitems)) {
        console.log("📋 [DEBUG] Order Items Count:", orderModel.orderitems.length);
        orderModel.orderitems.forEach((item, index) => {
          console.log(`📋 [DEBUG] Item ${index + 1}: ${item.title || 'No Title'} - Qty: ${item.qty || item.quantity || 1} - Price: ${item.price || 0} - OrderID: ${item.orderid}`);
        });
      } else {
        console.log("📋 [DEBUG] No order items found");
      }
      
      // Log payment details if available
      if (orderModel.epaymentdetail) {
        console.log("📋 [DEBUG] E-Payment Detail:", JSON.stringify(orderModel.epaymentdetail));
      }
      
      // Log transaction details if available
      if (orderModel.transactiondetail) {
        console.log("📋 [DEBUG] Transaction Detail:", JSON.stringify(orderModel.transactiondetail));
      }
      
      // Log vending specific data if available
      if (orderModel.devicenumber && orderModel.merchantid) {
        console.log("📋 [DEBUG] === VENDING MACHINE DATA ===");
        console.log("📋 [DEBUG] Device Number:", orderModel.devicenumber);
        console.log("📋 [DEBUG] Merchant ID:", orderModel.merchantid);
        console.log("📋 [DEBUG] Vending ID:", orderModel.vendingid);
        console.log("📋 [DEBUG] Pickup Code:", orderModel.pickupcode);
      }
      
      console.log("📋 [DEBUG] === END OF ORDER DATA ===");
      
      await fireStore.collection("store")
        .doc(storeId)
        .collection("order_temp")
        .doc(orderId)
        .set(orderModel);
        
      console.log("✅ [DEBUG] Successfully updated order_temp with processed order data");
      console.log("✅ [DEBUG] Order_temp document path: store/" + storeId + "/order_temp/" + orderId);
      
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


  


   paymentReturn (req, res, isBeta){

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


      var urlSuccessHeader = "https://foodio-online-best10.web.app/#/success/" + storeId + "/" + vCartID + "/" ;
      var urlFailHeader = "https://foodio-online-best10.web.app/#/failed/" + storeId + "/" + vCartID + "/" ;

      if(isBeta)
      {
            urlSuccessHeader = "https://foodio-online-cloud9.web.app/#/success/" + storeId + "/" + vCartID + "/" ;
            urlFailHeader = "https://foodio-online-cloud9.web.app/#/failed/" + storeId + "/" + vCartID + "/" ;
      }

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

      //console.log(postData);

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

  getRouter() {
    return this.router;
  }
}

module.exports = GKashRouter;