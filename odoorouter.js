const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const UtilFeie = require("./feie/util_feie");

class OdooRouter {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  //SECTION router
  initializeRoutes() {

    this.router.get('/about', function(req, res) {
     res.json({ message: 'Endpoint for Odoo integration v1.13'});
    });

    this.router.post('/gettoken', this.getToken.bind(this));
    this.router.post('/checktoken', this.checkToken.bind(this));
    this.router.post('/syncmenu', this.syncMenu.bind(this));

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

    triggerMenuSync()
    {

        console.log("triggerMenuSync");
        const url = 'https://demo-c6qevkp34a-uc.a.run.app/odgetmenu';

        axios.post(url)
          .then(response => {
            console.log('triggersync:', response.data);
            // Handle the response data as needed
          })
          .catch(error => {
            console.error('triggersync error:', error.message);
            // Handle any errors that occurred during the request
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

    syncMenu(req, res) {
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
                this.triggerMenuSync();

                res.json({ message: 'Sync done with ' + storeid });
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
            let feieResult = await feie.printFeie2(feieOrder.sn, feie.printOrderItemSlip(feieOrder, false, 0));
            
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

module.exports = OdooRouter;