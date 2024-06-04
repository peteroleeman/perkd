const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const UtilFeie = require("./feie/util_feie");
const OrderModel = require('./models/OrderModel')

const firebase = require("./db");
const fireStore = firebase.firestore();

/*!SECTION
Staging: https://staging.gspos.odoo.my/
Production: https://gspos.hosted.my/ 
*/

class DemoOdooRouter {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  //SECTION router
  initializeRoutes() {

    this.router.get('/about', function(req, res) {
     res.json({ message: 'Endpoint for Stagging Odoo integration v1.24'});
    });

    this.router.post('/gettoken', this.getToken.bind(this));
    this.router.post('/checktoken', this.checkToken.bind(this));
    this.router.post('/syncmenu', this.syncMenu.bind(this));
    this.router.post('/oquerycoupon', this.queryCoupon.bind(this));
    this.router.post('/oquerymember', this.queryMember.bind(this));
    this.router.post('/oquerymembercode', this.queryMemberCode.bind(this));
    this.router.post('/oquerytoken', this.queryToken.bind(this));
    this.router.post("/setkioskfooter", this.setKioskReceiptFooter.bind(this));
    this.router.post('/setorder', this.setOrder.bind(this));

    //feie test
    this.router.post('/kdstest', this.printTest.bind(this));
     this.router.post('/kdssample', this.printSample.bind(this));
     this.router.post('/kdssampleorderslip', this.printSampleOrderSlip.bind(this));

     //feie actual print
     this.router.post('/kdsreceipt', this.printReceipt.bind(this));
     this.router.post('/kdsorderslip', this.printOrderSlip.bind(this));
     this.router.post('/kdsstatus', this.checkStatus.bind(this));

  }

  
  //SECTION Odoo related
  // Define other route handler methods here
    generateEncryptedToken()
   {
      // Get today's date in ISO format (YYYY-MM-DD)
      const today = new Date().toISOString().slice(0, 10);

      // Create a hash using the SHA-256 algorithm
      const hash = crypto.createHash('sha256');

      // Update the hash with today's date
      hash.update(today);

      // Generate the hexadecimal representation of the hash
      const encryptedToken = hash.digest('hex');

      return encryptedToken;
    }

    triggerMenuSync(storeId)
    {

        console.log("triggerMenuSync " + storeId);

        //https://demo-c6qevkp34a-uc.a.run.app/odgetmenu?storeid=TRX
        const url = 'https://demo-c6qevkp34a-uc.a.run.app/oddemogetmenu?storeid=' + storeId;
        console.log(url);

        axios.get(url)
          .then(response => {
            console.log('triggersync:', response.data);
            // Handle the response data as needed
          })
          .catch(error => {
            console.error('triggersync error:', error.message);
            // Handle any errors that occurred during the request
          });
    }

   async setKioskReceiptFooter(req,res)
    {
      try{

        const authHeader = req.headers['authorization'];

         if (!authHeader) {
              return res.status(401).json({ error: 'Authorization header missing' });
         }

         const authHeaderParts = authHeader.split(' ');

             if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
               return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
             }

             const token = authHeaderParts[1]; // Extract the token

        //const token = authHeader.split(' ')[1]; // Assuming "Bearer <token>", split by space and get the token
        const { footer } = req.body;
        //console.log("setKioskReceiptFooter:" + token + " " + JSON.stringify(footer));

        // Check if the token matches the valid token (replace this with your token validation logic)
        if(footer != "")
        {
            if (token == this.generateEncryptedToken()) {
              const footerString = JSON.stringify(footer);
              console.log("writing footstring");
              console.log(footer);
              await fireStore.collection("odoo").doc("footer").set({ message: footerString  });
              
              res.status(200).json({ message: footerString  });
            } else {
              res.status(401).json({ error: 'Invalid token' });
            }
        }
        else
        {
              res.status(401).json({ error: 'Invalid footer' });
        }
        }
        catch(ex)
        {
              res.status(401).json({ error: ex.toString() });
        }
    }


    queryCoupon(req,res)
    {

      const authHeader = req.headers['authorization'];

      if (!authHeader) {
           return res.status(401).json({ error: 'Authorization header missing' });
      }

      const authHeaderParts = authHeader.split(' ');

          if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
          }

          const token = authHeaderParts[1]; // Extract the token


      const { coupon_code} = req.body;
      if(token == '')
      {
        res.status(401).json({ error: 'Please provide a token' });
        return;
      }

      if(coupon_code == '')
      {
        res.status(401).json({ error: 'Please provide a coupon code' });
        return;
      }

      let data = JSON.stringify({
        "coupon_code": coupon_code
      });
      
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://staging.gspos.odoo.my/api/kiosks/querycoupon',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': 'Bearer ' + token, 
          'Cookie': 'session_id=f3892e4827051f5315646787eb1acf6acaade537'
        },
        data : data
      };
      
      axios.request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));
        res.status(200).json(JSON.stringify(response.data));
      })
      .catch((error) => {
        console.log(error);
        res.status(401).json({ error: error });
      });
      
    }

    queryMember(req,res)
    {
      console.log("trigger query member");
      
      const authHeader = req.headers['authorization'];

      if (!authHeader) {
           return res.status(401).json({ error: 'Authorization header missing' });
      }

      const authHeaderParts = authHeader.split(' ');

          if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
          }

          const token = authHeaderParts[1]; // Extract the token


      const { mobile_phone} = req.body;
      if(token == '')
      {
        res.status(401).json({ error: 'Please provide a token' });
        return;
      }


      if(mobile_phone == '')
      {
        res.status(401).json({ error: 'Please provide a mobile phone' });
        return;
      }

      console.log("querymember " + mobile_phone + " with token " + token);

      let data = JSON.stringify({
       
        "mobile_phone":  mobile_phone //"0123456789"
      });
      
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://staging.gspos.odoo.my/api/kiosks/querymember',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': 'Bearer ' + token, 
          'Cookie': 'session_id=f3892e4827051f5315646787eb1acf6acaade537'
        },
        data : data
      };
      
      axios.request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));
        res.status(200).json(JSON.stringify(response.data));
      })
      .catch((error) => {
        console.log(error);
        res.status(401).json({ error: error });
      });

    }


    queryMemberCode(req,res)
    {
      console.log("trigger query member");
      
      const authHeader = req.headers['authorization'];

      if (!authHeader) {
           return res.status(401).json({ error: 'Authorization header missing' });
      }

      const authHeaderParts = authHeader.split(' ');

          if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
          }

          const token = authHeaderParts[1]; // Extract the token


      const { member_code} = req.body;
      if(token == '')
      {
        res.status(401).json({ error: 'Please provide a token' });
        return;
      }


      if(member_code == '')
      {
        res.status(401).json({ error: 'Please provide a member code' });
        return;
      }

      console.log("querymembercode " + member_code + " with token " + token);

      let data = JSON.stringify({
       
        "member_code":  member_code //"0123456789"
      });
      
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://staging.gspos.odoo.my/api/kiosks/querymember',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': 'Bearer ' + token, 
          'Cookie': 'session_id=f3892e4827051f5315646787eb1acf6acaade537'
        },
        data : data
      };
      
      axios.request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));
        res.status(200).json(JSON.stringify(response.data));
      })
      .catch((error) => {
        console.log(error);
        res.status(401).json({ error: error });
      });

    }


    queryToken(req,res)
    {
      console.log("queryToken");


      const { endpoint, phrase } = req.body;
      if(endpoint !== 'odoo')
      {
        res.status(401).json({ error: 'Invalid endpoint provided' });
        return;
      }

      if(phrase !== 'odoo')
      {
           res.status(401).json({ error: 'Invalid endpoint phrase provided' });
           return;
      }


      let data = JSON.stringify({
        // "db": "GS_ERP_P1_GOLIVE_FUGU_20_JULY_2022",
        "login": "kiosk",
        "password": "Ls$Mr4k;ZTWwQ}9Ppc5/Gu"
      });
      
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://staging.gspos.odoo.my/api/auth/jsontoken',
        headers: { 
          'Content-Type': 'application/json'
        },
        data : data
      };
      
      axios.request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));
        res.status(200).json(JSON.stringify(response.data));
      })
      .catch((error) => {
        console.log(error);
        res.status(401).json({ error: error });
      });
      

    }

    getToken(req, res) {
      // Logic to generate a token (for demonstration purposes, generating a random token here)
     // const { endpoint,phrase } = req.body;
     try{


       const { endpoint, phrase } = req.body;

      console.log("gettoken:" + endpoint + " " + phrase);

      if(endpoint !== 'odoo')
      {
        res.status(401).json({ error: 'Invalid endpoint provided' });
        return;
      }

      if(phrase !== 'odoo')
      {
           res.status(401).json({ error: 'Invalid endpoint phrase provided' });
           return;
      }

      const token = this.generateEncryptedToken();
      res.json({ token });
      }
      catch(ex)
      {
            res.status(401).json({ error: ex.toString() });
      }
    }

    checkToken(req, res) {

      let token = req.params.token ?? "";

      // Check if the token matches the valid token (replace this with your token validation logic)
      if (token == this.generateEncryptedToken()) {
        res.json({ message: 'Token is valid' });
      } else {
        res.status(401).json({ error: 'Invalid token' });
      }
    }


     
    
    
    async setOrder(req,res) 
    {

      const { orderid, storeid } = req.body;

      if(orderid == '')
      {
           res.status(401).json({ error: 'Invalid order id provided' });
           return;
      }

      if(storeid == '')
      {
           res.status(401).json({ error: 'Invalid store id provided' });
           return;
      }

      //const storeRef = await fireStore.collection("store").doc("S_5aca69dd-e964-45ea-ae6d-e1061e28f737");
      const orderRef = await fireStore.collection("odoo").doc(storeid).collection("order").doc(orderid);
     
      const doc = await orderRef.get();

      var orderModel = new OrderModel(doc.data());
      //orderModel.toOdooOrder();
      const authHeader = req.headers['authorization'];

      if (!authHeader) {
           return res.status(401).json({ error: 'Authorization header missing' });
      }

      const authHeaderParts = authHeader.split(' ');

          if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
          }

          const token = authHeaderParts[1]; // Extract the token

          var orderNumber = orderModel.order_id;
          orderModel.order_id = "ZEAL_" + storeid + "_" + orderNumber;
          //orderModel.short_order_number =  storeid + "_" + orderNumber;
           orderModel.store_merchant_code = storeid;      

           
    
    let data2 = JSON.stringify(orderModel) ;   
     
    
    //console.log("data:");
console.log(data2);

//   "order_id": "ZEAL_TRX_000001",
//   "short_order_number": "TRX-00001",
//   "store_merchant_code": "TRX",
//   "order_datetime": "2024-03-31T18:00:00.000Z",
//   "member_code": "31BRMUo5pVJjPGyIBZjneDIbQ",
//   "remark": "Request plastic bag and give more tissue",
//   "items": [
//     {
//       "id": "ITEM_2953",
//       "quantity": 1,
//       "remark": "",
//       "price": 9.5,
//       "coupon_code": "",
//       "discount_id": "",
//       "discount_amount": "",
//       "modifiers": [
//         {
//           "id": "MOD_1132",
//           "price": 0,
//           "quantity": 1
//         },
//         {
//           "id": "MOD_7771",
//           "price": 1.5,
//           "quantity": 1
//         }
//       ]
//     }
//   ],
//   "bill_discount_id": "",
//   "bill_discount_amount": "",
//   "customer_payment": 11,
//   "gateway_payment": "",
//   "payment_type": "Credit Card",
//   "payment_reference": "CIMB891021313",
//   "subtotal": 11,
//   "discount_total": "",
//   "grand_total": 11,
//   "mode": "dine_in"
// });

let config = {
  method: 'post',
  maxBodyLength: Infinity,
  url: 'https://staging.gspos.odoo.my/api/kiosks/order',
  headers: { 
    'Content-Type': 'application/json', 
    'Authorization': 'Bearer ' + token, 
    'Cookie': 'session_id=f3892e4827051f5315646787eb1acf6acaade537'
  },
  data : data2
};

axios.request(config)
.then((response) => {
  
  console.log(JSON.stringify(response.data));
  res.status(200).json(response.data );
  
})
.catch((error) => {
  console.log("Error: " + orderModel.order_id);
  console.log(error);
  res.status(401).json({ error: error });
});

}

    syncMenu(req, res) 
    {
          //const { token,storeid } = req.body;
           try{

          const authHeader = req.headers['authorization'];

           if (!authHeader) {
                return res.status(401).json({ error: 'Authorization header missing' });
           }

           const authHeaderParts = authHeader.split(' ');

               if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
                 return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
               }

               const token = authHeaderParts[1]; // Extract the token

          //const token = authHeader.split(' ')[1]; // Assuming "Bearer <token>", split by space and get the token
          const { storeid } = req.body;
          console.log("syncmenu:" + token + " " + storeid);

          // Check if the token matches the valid token (replace this with your token validation logic)
          if(storeid != "")
          {
              if (token == this.generateEncryptedToken()) {

                console.log("about to triggerMenuSync");
                this.triggerMenuSync(storeid);

                res.json({ message: 'Sync done with ' + storeid });

                const currentDate = new Date();
                const formattedDate = currentDate.toLocaleString();

                const syncRef = fireStore.collection("odoo").doc(storeid).collection("synccall").doc("999");
                syncRef.set({ message: "demo trigger", datatime: formattedDate  });

              } else {
                res.status(401).json({ error: 'Invalid token' });
              }
          }
          else
          {
                res.status(401).json({ error: 'Invalid store' });
          }
          }
          catch(ex)
          {
                res.status(401).json({ error: ex.toString() });
          }
        }

      //SECTION Feie related

      async checkStatus(req, res){
        const feie = new UtilFeie();

        
          // Check if the token matches the valid token (replace this with your token validation logic)
          const authHeader = req.headers['authorization'];

          if (!authHeader) {
              return res.status(401).json({ error: 'Authorization header missing' });
           }
           const authHeaderParts = authHeader.split(' ');

           if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
                return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
           }

           const token = authHeaderParts[1]; // Extract the token

          if (token == this.generateEncryptedToken()) {

          } else {
            res.status(401).json({ error: 'Invalid token' });
            return;
          }


          // Validate the request body
          if (!req.body) {
                  res.status(400).json({ error: 'Request body is missing or empty' });
                  return;
          }

          const requiredFields = ['sn'];
          for (const field of requiredFields) {
                  if (!(field in req.body)) {
                      res.status(400).json({ error: `Missing required field: ${field}` });
                      return;
                  }
          }

       

          try{

            let feieSN = feie.createFeieSNFromJSON(req.body);
            let feieResult = await feie.checkFeieStatus(feieSN.sn);
            
             res.json({ message: feieResult });
          }
          catch(ex)
          {
              console.log(ex);
              res.status(401).json({ error: ex });
          }

      }


      async printReceipt(req, res){
        const feie = new UtilFeie();

        
          // Check if the token matches the valid token (replace this with your token validation logic)
          const authHeader = req.headers['authorization'];

          if (!authHeader) {
              return res.status(401).json({ error: 'Authorization header missing' });
           }
           const authHeaderParts = authHeader.split(' ');

           if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
                return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
           }

           const token = authHeaderParts[1]; // Extract the token

          if (token == this.generateEncryptedToken()) {

          } else {
            res.status(401).json({ error: 'Invalid token' });
            return;
          }


          // Validate the request body
          if (!req.body) {
                  res.status(400).json({ error: 'Request body is missing or empty' });
                  return;
          }

          const requiredFields = ['sn', 'orderId', 'storeTitle', 'totalPrice', 'mobileAssignedTable', 'name', 'userPhoneNumber', 'orderItems'];
          for (const field of requiredFields) {
                  if (!(field in req.body)) {
                      res.status(400).json({ error: `Missing required field: ${field}` });
                      return;
                  }
          }

          if (!Array.isArray(req.body.orderItems)) {
                  res.status(400).json({ error: 'orderItems must be an array' });
                  return;
          }

          try{

            let feieOrder = feie.createFeieOrderFromJSON(req.body);
            let feieResult = await feie.printFeie2(feieOrder.sn, feie.printOrderReceiptFromOrder(feieOrder, false, 0));
            
             res.json({ message: feieResult });
          }
          catch(ex)
          {
              console.log(ex);
              res.status(401).json({ error: ex });
          }

      }

      async printOrderSlip(req, res){
        const feie = new UtilFeie();

        
          // Check if the token matches the valid token (replace this with your token validation logic)
          const authHeader = req.headers['authorization'];

          if (!authHeader) {
              return res.status(401).json({ error: 'Authorization header missing' });
           }
           const authHeaderParts = authHeader.split(' ');

           if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
                return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
           }

           const token = authHeaderParts[1]; // Extract the token

          if (token == this.generateEncryptedToken()) {

          } else {
            res.status(401).json({ error: 'Invalid token' });
            return;
          }


          // Validate the request body
          if (!req.body) {
                  res.status(400).json({ error: 'Request body is missing or empty' });
                  return;
          }

          const requiredFields = ['sn', 'orderId', 'orderItems'];
          for (const field of requiredFields) {
                  if (!(field in req.body)) {
                      res.status(400).json({ error: `Missing required field: ${field}` });
                      return;
                  }
          }

          if (!Array.isArray(req.body.orderItems)) {
                  res.status(400).json({ error: 'orderItems must be an array' });
                  return;
          }

          try{

            //let feieOrder = feie.createFeieOrderFromJSON(req.body);
            let feieOrder = feie.createFeieOrderSlipFromJSON(req.body);

            let feieResult = await feie.printFeie2(feieOrder.sn, feie.printOrderItemSlip(feieOrder, false, 1));
            
             res.json({ message: feieResult });
          }
          catch(ex)
          {
              console.log(ex);
              res.status(401).json({ error: ex });
          }

      }

     async printTest(req, res)  {

            const feie = new UtilFeie();


            // Check if the token matches the valid token (replace this with your token validation logic)
            const authHeader = req.headers['authorization'];

            if (!authHeader) {
                return res.status(401).json({ error: 'Authorization header missing' });
             }
             const authHeaderParts = authHeader.split(' ');

             if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
                  return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
             }

             const token = authHeaderParts[1]; // Extract the token

            if (token == this.generateEncryptedToken()) {

            } else {
              res.status(401).json({ error: 'Invalid token' });
              return;
            }


            // Validate the request body
                if (!req.body) {
                    res.status(400).json({ error: 'Request body is missing or empty' });
                    return;
                }

                const requiredFields = ['orderId', 'mobileAssignedTable', 'name', 'userPhoneNumber', 'orderItems'];
                for (const field of requiredFields) {
                    if (!(field in req.body)) {
                        res.status(400).json({ error: `Missing required field: ${field}` });
                        return;
                    }
                }

                if (!Array.isArray(req.body.orderItems)) {
                    res.status(400).json({ error: 'orderItems must be an array' });
                    return;
                }



            try{
                   let feieResult = await feie.print();
                    res.json({ message: feieResult });
            }
            catch(ex)
            {
                console.log(ex);
                res.status(401).json({ error: ex });
            }

     }

     async printSample(req, res) {

                 const feie = new UtilFeie();

                  // Check if the token matches the valid token (replace this with your token validation logic)
                             const authHeader = req.headers['authorization'];

                             if (!authHeader) {
                                 return res.status(401).json({ error: 'Authorization header missing' });
                              }
                              const authHeaderParts = authHeader.split(' ');

                              if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
                                   return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
                              }

                              const token = authHeaderParts[1]; // Extract the token


                 // Check if the token matches the valid token (replace this with your token validation logic)
                 if (token == this.generateEncryptedToken()) {

                 } else {
                   res.status(401).json({ error: 'Invalid token' });
                   return;

                 }



                  try{
                                    let feieResult = await feie.printFeie2(feie.printSampleReceipt());
                                     res.json({ message: feieResult });
                             }
                             catch(ex)
                             {
                                 console.log(ex);
                                 res.status(401).json({ error: ex });
                             }

          }

    async printSampleOrderSlip(req, res) {

                    const feie = new UtilFeie();
                     // Check if the token matches the valid token (replace this with your token validation logic)
                                const authHeader = req.headers['authorization'];

                                if (!authHeader) {
                                    return res.status(401).json({ error: 'Authorization header missing' });
                                 }
                                 const authHeaderParts = authHeader.split(' ');

                                 if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
                                      return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
                                 }

                                 const token = authHeaderParts[1]; // Extract the token


                    // Check if the token matches the valid token (replace this with your token validation logic)
                    if (token == this.generateEncryptedToken()) {
                      //res.json({ message: 'Token is valid' });
                    } else {
                      res.status(401).json({ error: 'Invalid token' });
                      return;

                    }



                    try{
                                                        let feieResult = await feie.printFeie2(feie.printSampleOrderSlip());
                                                         res.json({ message: feieResult });
                                                 }
                                                 catch(ex)
                                                 {
                                                     console.log(ex);
                                                     res.status(401).json({ error: ex });
                                                 }

             }



  getRouter() {
    return this.router;
  }
}

module.exports = DemoOdooRouter;