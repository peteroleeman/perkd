const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const UtilFeie = require("./feie/util_feie");
const OrderModel = require('./models/OrderModel')
const { PromoScope, PromoMain, PromoList }  = require("./util/util_promo")

const firebase = require("./db");
const MenuModel = require('./models/MenuModel');
const { testString } = require('./global');
const fs = require('fs');
const { json } = require('body-parser');
const fireStore = firebase.firestore();


/*!SECTION
Staging: https://staging.gspos.odoo.my/
Production: https://gspos.hosted.my/ 
*/

class OdooRouter {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  //SECTION router
  initializeRoutes() {

    this.router.get('/about', function(req, res) {
     res.json({ message: 'Endpoint for Odoo integration v1.29'});
    });

    this.router.post('/gettoken', this.getToken.bind(this));
    this.router.post('/checktoken', this.checkToken.bind(this));
    this.router.post('/syncmenu', this.syncMenu.bind(this));
    this.router.post('/newsyncmenu', this.newSyncMenu.bind(this));
    this.router.post('/createmenu', this.createMenu.bind(this));
    
    this.router.post('/ovoidorder', this.voidOrder.bind(this));
    this.router.post('/oquerycoupon', this.queryCoupon.bind(this));
    this.router.post('/oquerymember', this.queryMember.bind(this));
    this.router.post('/oquerymembercode', this.queryMemberCode.bind(this));
    this.router.post('/oquerytoken', this.queryToken.bind(this));
    this.router.post('/omenumapping', this.menuMapping.bind(this));


    this.router.post("/setkioskfooter", this.setKioskReceiptFooter.bind(this));
    this.router.post('/setorder', this.setOrder.bind(this));
    this.router.post('/repostorder', this.repostOrder.bind(this));
     //promo
     this.router.post("/promo", this.handlePromo.bind(this) );

     //real time stock
     this.router.post('/checkstock', this.checkStock.bind(this));

    //feie test
    this.router.post('/kdstest', this.handlePrintTestCN.bind(this));
    this.router.post('/kdstestap', this.handlePrintTestJP.bind(this));
    // this.router.post('/kdssample', this.printSample.bind(this));
     //this.router.post('/kdssampleorderslip', this.printSampleOrderSlip.bind(this));

     //feie actual print
     this.router.post('/kdsreceipt', this.handlePrintReceiptCN.bind(this));
     this.router.post('/kdsreceiptap', this.handlePrintReceiptJP.bind(this));

     this.router.post('/kdsorderslip', this.handlePrintOrderSlipCN.bind(this));
     this.router.post('/kdsorderslipap', this.handlePrintOrderSlipJP.bind(this));

     this.router.post('/kdsstatus', this.handleCheckStatusCN.bind(this));
     this.router.post('/kdsstatusap', this.handleCheckStatusJP.bind(this));


     //only existing in odoo router, as this is internal used
     this.router.post('/kdsorderslipfrominfo', this.handlePrintOrderSlipFromOrderInfoCN.bind(this));
     this.router.post('/kdsorderslipfrominfoap', this.handlePrintOrderSlipFromOrderInfoJP.bind(this));

     //simulation for order slip
     this.router.post('/kdsorderslipsim', this.handlePrintOrderSlipSimulationCN.bind(this));
     this.router.post('/kdsorderslipsimap', this.handlePrintOrderSlipSimulationJP.bind(this));

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
        const url = 'https://demo-c6qevkp34a-uc.a.run.app/odgetmenu?storeid=' + storeId;
        //console.log(url);

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


    async  savePromoToFirestore(promo) {
      if((promo?.discount_id ?? "") != "")
        {
      await fireStore.collection('odoopromo').doc(promo?.discount_id).set(promo.toFirestore());
      console.log('Promo saved to Firestore');
        }
    }

    async handlePromo(req, res)
    {
      

      
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

        
        try{

          //let feieOrder = feie.createFeieOrderFromJSON(req.body);
          

          const promo = new PromoMain(req.body);
          this.savePromoToFirestore(promo);

          console.log(promo);
          
          res.json({ message: promo.discount_id + " created", discount_id: promo.discount_id });
        }
        catch(ex)
        {
            console.log(ex);
            res.status(401).json({ error: ex });
        }
    }

   async setKioskReceiptFooter(req,res)
    {

      console.log("setKioskReceiptFooter");
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

   
    voidOrder(req,res)
    {

      console.log("voidOrder");
      const authHeader = req.headers['authorization'];

      if (!authHeader) {
           return res.status(401).json({ error: 'Authorization header missing' });
      }

      const authHeaderParts = authHeader.split(' ');

          if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
          }

          const token = authHeaderParts[1]; // Extract the token


      const { order_id, remark} = req.body;
      

      let data = JSON.stringify({
        "order_id": order_id,
        "remark": remark,
      });
      
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://gspos.hosted.my/api/kiosks/voidorder',
        headers: { 
          'Authorization': 'Bearer ' + token, 
          'Content-Type': 'application/json', 
          
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
        res.status(401).json({ error: error?.config?.data ?? error });
      });
      

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
        url: 'https://gspos.hosted.my/api/kiosks/querycoupon',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': 'Bearer ' + token, 
         
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
        url: 'https://gspos.hosted.my/api/kiosks/querymember',
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
        url: 'https://gspos.hosted.my/api/kiosks/querymember',
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


    menuMapping(req,res)
    {
      console.log("trigger menu mapping");
      
      const authHeader = req.headers['authorization'];

      if (!authHeader) {
           return res.status(401).json({ error: 'Authorization header missing' });
      }

      const authHeaderParts = authHeader.split(' ');

          if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
          }

          const token = authHeaderParts[1]; // Extract the token


      const { odoo_id, kiosk_id} = req.body;
      if(token == '')
      {
        res.status(401).json({ error: 'Please provide a token' });
        return;
      }


      if(odoo_id == '')
      {
        res.status(401).json({ error: 'Please provide a odoo id' });
        return;
      }

      if(kiosk_id == '')
        {
          res.status(401).json({ error: 'Please provide a kiosk id' });
          return;
        }

      console.log("menumapping " + odoo_id + " " + kiosk_id + " with token " + token);

      let data = JSON.stringify({
       
        "odoo_id":  odoo_id, 
        "kiosk_id" : kiosk_id
      });
      
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://gspos.hosted.my/api/kiosks/menumapping',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': 'Bearer ' + token, 
          
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
        url: 'https://gspos.hosted.my/api/auth/jsontoken',
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


    // checkStock(req, res)
    // {

    //   const authHeader = req.headers['authorization'];

    //   if (!authHeader) {
    //        return res.status(401).json({ error: 'Authorization header missing' });
    //   }

    //   const authHeaderParts = authHeader.split(' ');

    //   if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
    //         return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
    //   }

    //   const token = authHeaderParts[1]; // Extract the token
      
    //   console.log(token);
    //   console.log(JSON.stringify(req.body));

    //   const axios = require('axios');
    //       // let data = JSON.stringify({
    //       //   "store_merchant_code": "MDV1",
    //       //   "modifiers": [
    //       //     "MOD_1132",
    //       //     "MOD_8797",
    //       //     "ITEM_8946"
    //       //   ]
    //       // });

    //       let data = JSON.stringify(req.body);

    //       let config = {
    //         method: 'post',
    //         maxBodyLength: Infinity,
    //         url: 'https://gspos.hosted.my/api/kiosks/realtime',
    //         headers: { 
    //           'Content-Type': 'application/json', 
    //           'Authorization': 'Bearer ' + token, 
             
    //         },
    //         data : data
    //       };

    //       axios.request(config)
    //       .then((response) => {
    //         console.log(JSON.stringify(response.data));
    //         res.status(200).json(JSON.stringify(response.data));
    //       })
    //       .catch((error) => {
    //         console.log(error);
    //         res.status(401).json({ error: error });
    //       });

    // }

    checkStock(req, res)
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
      
      console.log(token);
      console.log(JSON.stringify(req.body));

      const axios = require('axios');
          // let data = JSON.stringify({
          //   "store_merchant_code": "MDV1",
          //   "modifiers": [
          //     "MOD_1132",
          //     "MOD_8797",
          //     "ITEM_8946"
          //   ]
          // });

          let data = JSON.stringify(req.body);

          // let data = JSON.stringify({
          //   "store_merchant_code": "MDV1",
          //   "modifiers": [
          //     "MOD_1132",
          //     "MOD_8797",
          //     "ITEM_8946"
          //   ]
          // });

          console.log(data);

          let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://gspos.hosted.my/api/kiosks/realtime',
            headers: { 
              'Content-Type': 'application/json', 
              'Authorization': 'Bearer ' + token, 
             
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
      //const orderDoneRef = fireStore.collection("odoo_done").doc(storeid).collection("order").doc(orderid);
     
      const doc = await orderRef.get();
      if(doc?.data() == null || doc?.data() == undefined)
        {
          return res.status(404).json({ error: orderid + ' from ' + storeid + ' not found' });
        }

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
  url: 'https://gspos.hosted.my/api/kiosks/order',
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

  var orderDOC = doc.data();
  orderDOC.odoo_response = JSON.stringify(response.data);
  fireStore.collection("odoo_done").doc(storeid).collection("order").doc(orderDOC.id).set((orderDOC));
  fireStore.collection("odoo").doc(storeid).collection("order").doc(orderDOC.id).delete();

  res.status(200).json(response.data );
  
})
.catch((error) => {
  console.log("Error: " + orderModel.order_id);
  console.log(error);
  res.status(401).json({ error: error });
});

}


async repostOrder(req,res) 
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
  const orderRef = await fireStore.collection("kiosk_recover").doc(orderid);
  //const orderDoneRef = fireStore.collection("odoo_done").doc(storeid).collection("order").doc(orderid);
 
  const doc = await orderRef.get();
  if(doc?.data() == null || doc?.data() == undefined)
    {
      return res.status(404).json({ error: orderid + ' from ' + storeid + ' not found' });
    }

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
 
let config = {
method: 'post',
maxBodyLength: Infinity,
url: 'https://gspos.hosted.my/api/kiosks/order',
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

// var orderDOC = doc.data();
// orderDOC.odoo_response = JSON.stringify(response.data);
// fireStore.collection("odoo_done").doc(storeid).collection("order").doc(orderDOC.id).set((orderDOC));
// fireStore.collection("odoo").doc(storeid).collection("order").doc(orderDOC.id).delete();

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

                //console.log("about to triggerMenuSync");
                this.triggerMenuSync(storeid);

                res.json({ message: 'Sync done with ' + storeid });

                // const currentDate = new Date();
                // const formattedDate = currentDate.toLocaleString();

                // const syncRef = fireStore.collection("odoo").doc(storeid).collection("synccall").doc("999");
                // syncRef.set({ message: "demo trigger", datatime: formattedDate  });
                
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


    createMenu(req, res) 
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
          const { storeid, storetitle, menumodel } = req.body;
          console.log("create mennu:" + token + " " + storeid + " " + " " + storetitle + " " + menumodel);

          const menuCreate = MenuModel.createNewMenuFromOdoo(storeid, storetitle, menumodel);
          console.log(JSON.stringify(menuCreate));
          // Check if the token matches the valid token (replace this with your token validation logic)
          if(storeid != "")
          {
              if (token == this.generateEncryptedToken()) {
                console.log("about to create Menu");
                
                
                fireStore.collection("store").doc(storeid).collection("menu").set(menumodel);
               
                res.status(200).json({id: menumodel.id, storeid: menumodel.storeid, message: 'Menu created successfully' });

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

      async handleCheckStatusCN(req,res)
      {
          return this.checkStatus(req,res,false);
      }

      async handleCheckStatusJP(req,res)
      {
        return this.checkStatus(req,res.true);
      }

      async checkStatus(req, res, isJP){
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
            let feieResult = await feie.checkFeieStatus(feieSN.sn, isJP);
            
             res.json({ message: feieResult });
          }
          catch(ex)
          {
              console.log(ex);
              res.status(401).json({ error: ex });
          }

      }


      async handlePrintReceiptCN(req,res)
      {
        return this.printReceipt(req,res, false);
      }

      async handlePrintReceiptJP(req,res)
      {
        return this.printReceipt(req,res, true);
      }

      async printReceipt(req, res, isJP){
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
            let feieResult = await feie.printFeie2(feieOrder.sn, feie.printOrderReceiptFromOrder(feieOrder, false, 0), isJP);
            
             res.json({ message: feieResult });
          }
          catch(ex)
          {
              console.log(ex);
              res.status(401).json({ error: ex });
          }

      }


      async handlePrintOrderSlipFromOrderInfoCN(req,res)
      {
        return this.printOrderSlipFromOrderInfo(req,res, false);
      }

      async handlePrintOrderSlipFromOrderInfoJP(req,res)
      {
        return this.printOrderSlipFromOrderInfo(req,res,true);
      }



      async handlePrintOrderSlipSimulationCN(req,res)
      {
        return this.printOrderSlipFromOrderInfoSimulate(req,res, false);
      }

      async handlePrintOrderSlipSimulationJP(req,res)
      {
        return this.printOrderSlipFromOrderInfoSimulate(req,res,true);
      }

       generateRandomBoolean()  {
        return Math.random() >= 0.5;
      }

      async printOrderSlipFromOrderInfoSimulate(req, res, isJP){
        const feie = new UtilFeie();
        if (!req.body) {
          res.status(400).json({ error: 'Request body is missing or empty' });
          return;
          }

          //const requiredFields = ['sn', 'orderinfo'];
          const { sn, orderinfo } = req.body;
          try{

            
            var returnResult = '{"ret":-1,"msg":"Verification failed: Printer Sn and User do not match","data":null,"serverExecutedTime":0}';
            if(this.generateRandomBoolean() == true)
              {
                returnResult = '{"ret":0,"msg":"Prink OK","data":null,"serverExecutedTime":0}';
              }
            
            res.json({result: returnResult });
          }
          catch(ex)
          {
              console.log(ex);
              res.status(401).json({ error: ex });
          }
      }

      async printOrderSlipFromOrderInfo(req, res, isJP){
        const feie = new UtilFeie();

        
          // Check if the token matches the valid token (replace this with your token validation logic)
          // const authHeader = req.headers['authorization'];

          // if (!authHeader) {
          //     return res.status(401).json({ error: 'Authorization header missing' });
          //  }
          //  const authHeaderParts = authHeader.split(' ');

          //  if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
          //       return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
          //  }

          //  const token = authHeaderParts[1]; // Extract the token

          // if (token == this.generateEncryptedToken()) {

          // } else {
          //   res.status(401).json({ error: 'Invalid token' });
          //   return;
          // }


          // Validate the request body
          if (!req.body) {
                  res.status(400).json({ error: 'Request body is missing or empty' });
                  return;
          }

          //const requiredFields = ['sn', 'orderinfo'];
          const { sn, orderinfo } = req.body;
          try{

            let feieResult = await feie.printFeieFromContent(sn, orderinfo, isJP);
            
             res.json({result: feieResult });
          }
          catch(ex)
          {
              console.log(ex);
              res.status(401).json({ error: ex });
          }

      }

      async handlePrintOrderSlipCN(req,res)
      {
        return this.printOrderSlip(req,res, false);
      }

      async handlePrintOrderSlipJP(req,res)
      {
        return this.printOrderSlip(req,res,true);
      }

      async printOrderSlip(req, res, isJP){
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

            let feieResult = await feie.printFeie2(feieOrder.sn, feie.printOrderItemSlip(feieOrder, false, 1), isJP);
            
             res.json({ message: feieResult });
          }
          catch(ex)
          {
              console.log(ex);
              res.status(401).json({ error: ex });
          }

      }

      async handlePrintTestCN(req,res)
      {
          return this.printTest(req,res,false);
      }

      async handlePrintTestJP (req, res)
      {
        return this.printTest(req,res, true);
      }


     async printTest(req, res, isJP)  {

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
                   let feieResult = await feie.print(isJP);
                    res.json({ message: feieResult });
            }
            catch(ex)
            {
                console.log(ex);
                res.status(401).json({ error: ex });
            }

     }

  //odoo sync menu new structure
    newSyncMenu (req, res)
    {


      const filePath = './newstructv2.txt';

// Asynchronous reading and processing
fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading file:', err);
        return;
    }

    const parsedData = JSON.parse((data));
    const parsedClassInstance = new ParsedClass(parsedData);
        const innerData = parsedClassInstance.data?.getValue();

        const menu = this.createMenuFromString(innerData);
        
        let docId = menu.storeMerchantCode;
        if(docId != "")
          {
        this.saveMenuToFirestore(menu, docId).then(() => {
          // this.getMenuFromFirestore(docId).then(retrievedMenu => {
          //   console.log(JSON.stringify(retrievedMenu, null, 2));
          // });
        });
        res.status(200).json({ message: docId + " sync completed" });
        return;
      }
      
      res.status(401).json({message: "store merchant code appeared to be empty"});

});

    

      // const menu = this.createMenuFromString(jsonString);
      // console.log(JSON.stringify(menu, null, 2));

      

      /*

      const menu = createMenuFromString(jsonString);
      const docId = 'exampleMenu';
      saveMenuToFirestore(menu, docId).then(() => {
        getMenuFromFirestore(docId).then(retrievedMenu => {
          console.log(JSON.stringify(retrievedMenu, null, 2));
        });
      });
      
      */


    }
 
     createMenuFromString(jsonString) {
      
      console.log("create menu from string");
      console.log(jsonString);
      return new Menu(jsonString);
    }
    
    
    async  saveMenuToFirestore(menu, docId) {
      console.log("saving menu " + docId + " to firestore");
      for(var cat of menu.categories)
      {
        await fireStore.collection('newodoo').doc(docId).collection("cat").doc(cat.id).set(cat.toFirestore());
      }

      
      console.log('Menu saved to Firestore');
    }
    
    async  getMenuFromFirestore(docId) {
      const doc = await fireStore.collection('newodoo').doc(docId).get();
      if (doc.exists) {
        const menu = Menu.fromFirestore(doc.data());
        console.log('Menu retrieved from Firestore', menu);
        return menu;
      } else {
        console.log('No such document!');
        return null;
      }
    }

  getRouter() {
    return this.router;
  }
}


class ParsedClass {
  constructor({ count, data }) {
      this.count = count;
      this.data = new DataClass(data);
  }
}

class DataClass {
  constructor(data) {
      this.data = data?.data?.toString() ?? "";  // assuming `data` is a string that represents a nested JSON
  }

  getValue() {
      const nestedData = JSON.parse(this.data);
      return nestedData;
  }
}

class Menu {
  constructor(data) {
    this.storeMerchantCode = data?.store_merchant_code ?? "";
    this.categories = data.categories?.map(category => new Category(category)) ?? [];
  }

  toFirestore() {
    return {
      store_merchant_code: this.storeMerchantCode,
      categories: this.categories.map(category => category.toFirestore())
    };
  }

  static fromFirestore(data) {
    return new Menu({
      store_merchant_code: data.store_merchant_code,
      categories: data.categories.map(Category.fromFirestore)
    });
  }
}

class Category {
  constructor(data) {
    this.kioskId = data?.kiosk_id ?? "";
    this.id = data?.id ?? "";
    this.name = data?.name ?? "";
    this.sequence = data?.sequence ?? "";
    this.availableStatus = data?.available_status ?? "";
    this.subCategories = data.sub_categories?.map(subCategory => new SubCategory(subCategory)) ?? [];
  }

  toFirestore() {
    return {
      id: this.id,
      kiosk_id: this.kioskId,
      name: this.name,
      sequence: this.sequence,
      available_status: this.availableStatus,
      sub_categories: this.subCategories?.map(subCategory => subCategory.toFirestore())
    };
  }

  static fromFirestore(data) {
    return new Category({
      id : data.id,
      kiosk_id: data.kiosk_id,
      name: data.name,
      sequence: data.sequence,
      available_status: data.available_status,
      sub_categories: data.sub_categories?.map(SubCategory.fromFirestore)
    });
  }
}

class SubCategory {
  constructor(data) {
    this.id = data.id,
    this.items = data.items?.map(item => new Item(item)) ?? [];
  }

  toFirestore() {
    return {
      id: this.id,
      items: this.items.map(item => item.toFirestore())
    };
  }

  static fromFirestore(data) {
    return new SubCategory({
      id: data.id,
      items: data.items.map(Item.fromFirestore)
    });
  }
}

class Item {
  constructor(data) {
    this.id = data?.id ?? "";
    this.printer_sn = data?.printer_sn ?? "";
    this.kioskId = data?.kiosk_id ?? "";
    this.description = data?.description ?? "";
    this.name = data?.name ?? "";
    this.sequence = data?.sequence ?? "";
    this.price = data?.price ?? "";
    this.photos = data?.photos ?? "";
    this.availableStatus = data?.available_status ?? "";
    this.modifierGroups = data.modifier_groups?.map(group => new ModifierGroup(group)) ?? [];
  }

  toFirestore() {
    return {
      id: this.id,
      printer_sn : this.printer_sn,
      kiosk_id: this.kioskId,
      description: this.description,
      name: this.name,
      sequence: this.sequence,
      price: this.price,
      photos: this.photos,
      available_status: this.availableStatus,
      modifier_groups: this.modifierGroups?.map(group => group.toFirestore())
    };
  }

  static fromFirestore(data) {
    return new Item({
      id: data.id,
      printer_sn : data.printer_sn,
      kiosk_id: data.kiosk_id,
      description: data.description,
      name: data.name,
      sequence: data.sequence,
      price: data.price,
      photos: data.photos,
      available_status: data.available_status,
      modifier_groups: data.modifier_groups.map(ModifierGroup.fromFirestore)
    });
  }
}

class ModifierGroup {
  constructor(data) {
    this.id = data?.id ?? "";
    this.kioskId = data?.kiosk_id ?? "";
    this.name = data?.name ?? "";
    this.sequence = data?.sequence ?? "";
    this.selectionRangeMax = data?.selection_range_max ?? "";
    this.selectionRangeMin = data?.selection_range_min ?? "";
    this.photos = data?.photos ?? "";
    this.availableStatus = data?.available_status ?? "";
    this.modifiers = data.modifiers?.map(modifier => new Modifier(modifier)) ?? [];
    this.addons_groups = data.addons_groups?.map(group => new ModifierGroup(group)) ?? [];
  }

  toFirestore() {
    return {
      id : this.id,
      kiosk_id: this.kioskId,
      name: this.name,
      sequence: this.sequence,
      selection_range_max: this.selectionRangeMax,
      selection_range_min: this.selectionRangeMin,
      photos: this.photos,
      available_status: this.availableStatus,
      modifiers: this.modifiers.map(modifier => modifier.toFirestore()),
      addons_groups : this.addons_groups?.map(group => group.toFirestore())
    };
  }

  static fromFirestore(data) {
    return new ModifierGroup({
      id: data.id,
      kiosk_id: data.kiosk_id,
      name: data.name,
      sequence: data.sequence,
      selection_range_max: data.selection_range_max,
      selection_range_min : data.selection_range_min,
      photos: data.photos,
      available_status: data.available_status,
      modifiers: data.modifiers.map(Modifier.fromFirestore),
      addons_groups: data.addons_groups.map(ModifierGroup.fromFirestore)
    });
  }
}

class Modifier {
  constructor(data) {
    this.kioskId = data?.kiosk_id ?? "";
    this.name = data?.name ?? "";
    this.sequence = data?.sequence ?? "";
    this.price = data?.price ?? "";
    this.photos = data?.photos ?? "";
    this.availableStatus = data?.available_status ?? "";
    this.real_time = data?.real_time ?? "";
    this.id = data?.id ?? "";
  }

  toFirestore() {
    return {
      kiosk_id: this.kioskId,
      name: this.name,
      sequence: this.sequence,
      price: this.price,
      photos: this.photos,
      available_status: this.availableStatus,
      real_time : this.real_time,
      id: this.id
    };
  }

  static fromFirestore(data) {
    return new Modifier({
      kiosk_id: data.kiosk_id,
      name: data.name,
      sequence: data.sequence,
      price: data.price,
      photos: data.photos,
      available_status: data.available_status,
      real_time: data.real_time,
      id: data.id
    });
  }
}



module.exports = OdooRouter;