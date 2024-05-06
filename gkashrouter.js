const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const UtilFeie = require("./feie/util_feie");
const querystring = require('querystring');
const bodyParser = require('body-parser');
const url = require('url');
const UtilDateTime = require("./util/util_datetime");

const {
  getCurrentDateString
} = require("./util/util_datetime");

const {
  writeGKashTransaction
} = require("./storeController");

class GKashRouter {

  VERSION = "v1.13";

  constructor() {
    this.router = express.Router();
   // this.router.use(bodyParser.urlencoded({ extended: true }));
   // Middleware to parse the incoming request body
    this.initializeRoutes();
  }

  //SECTION router
  initializeRoutes() {

    this.router.get('/about', function(req, res) {
     res.json({ message: `Endpoint for GKash integration ${this.VERSION}`});
    });

    // this.router.get('/return', function(req, res) {
    //   res.json({ message: "**** gkash return called"});
    //  });

    //  this.router.get('/callback', function(req, res) {
    //   res.json({ message: "**** gkash callback called"});
    //  });

     this.router.post('/return', this.paymentReturn.bind(this));
     this.router.post('/callback', this.paymentResult.bind(this));
    this.router.post('/initpayment', this.initPayment.bind(this));

  }

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


      const urlSuccessHeader = "https://foodio-online-code8.web.app/#/success/" + storeId + "/" + vCartID + "/" ;
      const urlFailHeader = "https://foodio-online-code8.web.app/#/failed/" + storeId + "/" + vCartID + "/" ;
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
    res.send("***payment result called " + vCID);
  }

  async initPayment(req, res)  {

    
    // Convert v_amount to 2 decimal places and remove commas or decimal points
    //const formattedAmount = (parseFloat(v_amount.replace(/,/g, '')) * 100).toFixed(0);
  
    // Concatenate parameters for signature calculation
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const cSignatureKey = "ktDoGDCBxSaJSEJ";
    const cCID = "M161-U-40892";
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
      returnurl:"https://api.foodio.online/gkash/return",
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
          console.log(`init payment ${this.VERSION}`);
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



  getRouter() {
    return this.router;
  }
}

module.exports = GKashRouter;