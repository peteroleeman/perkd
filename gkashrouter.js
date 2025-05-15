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
   // this.router.use(bodyParser.urlencoded({ extended: true }));
   // Middleware to parse the incoming request body
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
  
     this.router.post('/return', this.paymentReturn.bind(this));
     this.router.post('/crmreturn', this.paymentCRMReturn.bind(this));
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
    
    const signatureString = `${cSignatureKey};${cAmount * 100};${cCurrency};${cCartID};${cTID}`;
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
    
    const signatureString = `${cSignatureKey};${cCID};${cCartID};${cAmount * 100};${cCurrency}`;
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
    const signatureString = `${cSignatureKey};${cCID};${vCartID};${cAmount * 100};${vCurrency}`;
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
            if (error.code === 'resource-exhausted' && i < retries - 1) {
                const backoffTime = Math.pow(2, i) * 100; // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, backoffTime));
            } else {
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
  
  const signatureString = `${cSignatureKey};${cCID};${cCartID};${cAmount * 100};${cCurrency}`;
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
  //console.log(JSON.stringify(req.body));

  var cCartID = req.body['cartid'] ?? "test";
  this.writeWithRetry(fireStore.collection("gkash_qr").doc(cCartID), req.body);
  res.status(200).send(req.data);
}

async remote_getQR(req,res)
{
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const cSignatureKey = this.cSignatureKey; // "qdz7WDajSMaUOzo";
  const cCID = this.cCID; // "M102-U-54392";
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
  // cEmail = req.body['Email'] ?? "";
  // cMobileNo = req.body['MobileNo'] ?? "";
  
  const signatureString = `${cSignatureKey};${cCID};${cCartID};${cAmount * 100};${cCurrency}`;

  console.log(signatureString);
  //const signatureString = "SIGNATUREKEY9999;M161-U-999;MERCHANT-REFERENCE-712893;10000;MYR";
  const signatureKey = crypto.createHash('sha512').update(signatureString.toUpperCase()).digest('hex');
  
  console.log("signature key");
  console.log(signatureKey);

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

  async paymentCRMReturn (req, res){

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

      const urlSuccessHeader = "https://foodio-online-cloud9.web.app/#/crmsuccess/" + "online" + "/" + vCartID + "/" ;
      const urlFailHeader = "https://foodio-online-cloud9.web.app/#/crmfailed/" + "online" + "/" + vCartID + "/" ;
      var redirectTo = urlSuccessHeader;

      if(vStatus.includes("88") == false)
      {
        redirectTo = urlFailHeader;
        res.redirect(redirectTo);
        return;
      }
  
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

       if (storeResult.status !== 'success') {
        console.error(`Error fetching store or store not found: ${storeResult.status}`);
        // Redirect to a generic error page, or a specific "store not found" page.
        redirectTo = urlFailHeader;
      }

      res.redirect(redirectTo);

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
    // Get the specific user document reference
    const userDocRef = fireStore.collection("user").doc(`FU_${phoneNumber}`);
    const result = await userDocRef.get();
    var  pointsEarned = 0;
    if (result.exists) {
      try {
        // Create UserModel from document
        const userModel = (result.data()); // Use a conversion function
  
        // Calculate loyalty points (1 dollar = 10 points)
       
  
        // Add loyalty points for the store
        for (const item of orderModel.orderitems) {
          try {
             const orderAmount = this.calculateTotal(item); // Use calculateTotal()
             pointsEarned = orderAmount * 10;
            this.addLoyaltyPoints(userModel, item.storeid, pointsEarned); // Use a helper function
          } catch (ex) {
              // Consider logging the error, even if you're ignoring it
              console.error("Error add loyalty points:" + ex);
          }
        }
       
        // Save order
        await userDocRef
          .collection("order")
          .doc(orderModel.id)
          .set(orderModel);
  
        // Update user document with new loyalty points
        console.log("Update user document with new loyalty points");
        console.log(userModel);
        await userDocRef.update((userModel)); // Use a conversion function
  
      } catch (e) {
        console.error("Error processing order with loyalty points:", e);
        throw e;
      }
    } else {
      throw new Error("User not found");
    }

    return pointsEarned;
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
      if (!docSnapshot.exists) {
          return null;
      }
  
      const data = docSnapshot.data();
      return {
          id: docSnapshot.id,
          loyaltyPoints: data.loyaltyPoints || {}, // Initialize as empty object if null
          // ... other user fields ...
      };
  }
  
  // Helper function to convert a UserModel object to a Map for Firestore
   convertToUserMap(userModel) {
      return {
          loyaltyPoints: userModel.loyaltyPoints || {}, // Ensure it's not null
          // ... other user fields ...
      };
  }
  
  // Helper function to add loyalty points to the user model
   addLoyaltyPoints(userModel, storeId, points) {
      if (!userModel.loyaltypoints) {
          userModel.loyaltypoints = {}; // Initialize if null
      }
      if (userModel.loyaltypoints[storeId]) {
          userModel.loyaltypoints[storeId] += points;
      } else {
          userModel.loyaltypoints[storeId] = points;
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


  


   paymentReturn (req, res){

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


      const urlSuccessHeader = "https://foodio-online-cloud9.web.app/#/success/" + storeId + "/" + vCartID + "/" ;
      const urlFailHeader = "https://foodio-online-cloud9.web.app/#/failed/" + storeId + "/" + vCartID + "/" ;
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