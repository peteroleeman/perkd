const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const UtilFeie = require("./feie/util_feie");

class OdooRouter {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {

    this.router.get('/about', function(req, res) {
     res.json({ message: 'Endpoint for Odoo integration v1.12'});
    });

    this.router.post('/gettoken', this.getToken.bind(this));
    this.router.post('/checktoken', this.checkToken.bind(this));
    this.router.post('/syncmenu', this.syncMenu.bind(this));

    //feie
    this.router.post('/kdstest', this.printTest.bind(this));
     this.router.post('/kdssample', this.printSample.bind(this));
     this.router.post('/kdssampleorder', this.printSampleOrder.bind(this));
  }


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

      //Feie printer
      printTest(req, res) {

            const feie = new UtilFeie();
            let token = req.params.token ?? "";

            // Check if the token matches the valid token (replace this with your token validation logic)
            if (token == this.generateEncryptedToken()) {
              res.json({ message: 'Token is valid' });
            } else {
              res.status(401).json({ error: 'Invalid token' });

            }

            feie.print();

     }

     printSample(req, res) {

                 const feie = new UtilFeie();
                 let token = req.params.token ?? "";

                 // Check if the token matches the valid token (replace this with your token validation logic)
                 if (token == this.generateEncryptedToken()) {
                   res.json({ message: 'Token is valid' });
                 } else {
                   res.status(401).json({ error: 'Invalid token' });

                 }

                 feie.printSample();

          }

    printSampleOrder(req, res) {

                    const feie = new UtilFeie();
                    let token = req.params.token ?? "";

                    // Check if the token matches the valid token (replace this with your token validation logic)
                    if (token == this.generateEncryptedToken()) {
                      res.json({ message: 'Token is valid' });
                    } else {
                      res.status(401).json({ error: 'Invalid token' });

                    }

                    feie.printSampleOrder();

             }



  getRouter() {
    return this.router;
  }
}

module.exports = OdooRouter;