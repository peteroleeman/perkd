const express = require('express');

class GrabRouter {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    // About endpoint
    this.router.get('/about', function(req, res) {
      res.json({ message: 'Endpoint for Grab integration v1.1'});
    });

    //partner end point
    //Onboarding -> Push Grab menu webhook
    //GrabFood calls this partner endpoint to push the Grab store menu to POS.
    this.router.post('/pushgrabmenu', this.handlePushGrabMenu.bind(this));


    //Push integration status webhook
    //GrabFood calls this partner endpoint to push the Grab store integration status 
    // whenever there is a status change.
    this.router.post('/pushintegrationstatus', this.handlePushIntegrationStatus.bind(this));

    // 	Get menu webhook
    //GrabFood sends request to this endpoint to fetch the latest menu from the partner. 
    // This is initiated during integration activation or when an update menu notification is received after the store integration has been enabled.
    this.router.get('/merchant/menu', this.handleGetMenu.bind(this));

    //Menu sync state webhook
    //GrabFood sends updates on the status of a menu sync, including any errors encountered to the partner through webhook.
    this.router.post('/menusyncstate', this.handleMenuSyncState.bind(this));

    // Submit order endpoint
    //GrabFood submits order details in request to this endpoint to the partner when consumers places orders via a partner POS integrated outlet.
    this.router.post('/order', this.handleSubmitOrder.bind(this));

    // Push order state endpoint
    //GrabFood sends order status updates in request to this partner endpoint.
    this.router.put('/order/state', this.handlePushOrderState.bind(this));

    // OAuth token endpoint
    this.router.post('/oauth/token', this.handleOAuthToken.bind(this));

    // Menu Sync Webhook
    this.router.post('/webhook/menu-sync', this.handleGetMenu.bind(this));

    

    // Integration status endpoint
    this.router.get('/integration/status', this.handleIntegrationStatus.bind(this));

    // OAuth scopes endpoint
    this.router.get('/oauth/scopes', this.handleOAuthScopes.bind(this));

    // Partner client ID endpoint
    this.router.get('/partner/client-id', this.handlePartnerClientId.bind(this));

    // Partner client secret endpoint
    this.router.get('/partner/client-secret', this.handlePartnerClientSecret.bind(this));
  }

  // Get menu endpoint handler
  async handleGetMenu(req, res) {
    try {
      console.log('GET /grab/merchant/menu - Getting menu data');
      console.log('Request URL:', req.originalUrl);
      console.log('Request Query Parameters:', req.query);
      console.log('Request Headers:', req.headers);
      console.log('Request Method:', req.method);
      
      const menuData = {
                         "merchantID": "GFSBPOS-256-440",
                           "partnerMerchantID": "FUD01",
                         "currency": {
                           "code": "SGD",
                           "symbol": "S$",
                           "exponent": 2
                         },
                         "sections": [
                           {
                             "id": "SECTION-01",
                             "name": "Breakfast",
                             "sequence": 1,
                             "serviceHours": {
                               "mon": {
                                 "openPeriodType": "OpenPeriod",
                                 "periods": [
                                   {
                                     "startTime": "07:00",
                                     "endTime": "10:00"
                                   }
                                 ]
                               },
                               "tue": {
                                 "openPeriodType": "OpenPeriod",
                                 "periods": [
                                   {
                                     "startTime": "07:00",
                                     "endTime": "10:00"
                                   }
                                 ]
                               },
                               "wed": {
                                 "openPeriodType": "OpenPeriod",
                                 "periods": [
                                   {
                                     "startTime": "07:00",
                                     "endTime": "10:00"
                                   }
                                 ]
                               },
                               "thu": {
                                 "openPeriodType": "OpenPeriod",
                                 "periods": [
                                   {
                                     "startTime": "07:00",
                                     "endTime": "10:00"
                                   }
                                 ]
                               },
                               "fri": {
                                 "openPeriodType": "OpenPeriod",
                                 "periods": [
                                   {
                                     "startTime": "07:00",
                                     "endTime": "10:00"
                                   }
                                 ]
                               },
                               "sat": {
                                 "openPeriodType": "OpenPeriod",
                                 "periods": [
                                   {
                                     "startTime": "07:00",
                                     "endTime": "10:00"
                                   }
                                 ]
                               },
                               "sun": {
                                 "openPeriodType": "OpenPeriod",
                                 "periods": [
                                   {
                                     "startTime": "07:00",
                                     "endTime": "10:00"
                                   }
                                 ]
                               }
                             },
                             "categories": [
                               {
                                 "id": "CATEGORY-01",
                                 "name": "Savoury Pancakes",
                                 "sequence": 1,
                                 "availableStatus": "AVAILABLE",
                                 "items": [
                                   {
                                     "id": "ITEM-01",
                                     "name": "Gourmet Flapjacks",
                                     "sequence": 1,
                                     "availableStatus": "AVAILABLE",
                                     "price": 220,
                                     "campaignInfo": null,
                                     "description": "Blueberries stuffed pancakes, served with scrambled eggs, baked beans, and hash brown, savoury, and sweet toppings of all day, add on of toppings available.",
                                     "photos": [
                                       "https://developer.grab.com/assets/default-menu/pancake-2.jpeg"
                                     ],
                                     "modifierGroups": [
                                       {
                                         "id": "MODIFIERGROUP-01",
                                         "name": "Topping Additions",
                                         "sequence": 1,
                                         "availableStatus": "AVAILABLE",
                                         "selectionRangeMin": 1,
                                         "selectionRangeMax": 1,
                                         "modifiers": [
                                           {
                                             "id": "MODIFIER-01",
                                             "name": "Sunny Egg",
                                             "sequence": 1,
                                             "availableStatus": "AVAILABLE",
                                             "price": 100
                                           },
                                           {
                                             "id": "MODIFIER-02",
                                             "name": "Sausage & Chipolata",
                                             "sequence": 2,
                                             "availableStatus": "AVAILABLE",
                                             "price": 200
                                           },
                                           {
                                             "id": "MODIFIER-03",
                                             "name": "Turkey Bacon",
                                             "sequence": 1,
                                             "availableStatus": "AVAILABLE",
                                             "price": 100
                                           }
                                         ]
                                       }
                                     ],
                                     "nameTranslation": {
                                       "zh": "美食烙饼"
                                     }
                                   },
                                   {
                                     "id": "ITEM-02",
                                     "name": "Mini Pancakes",
                                     "sequence": 2,
                                     "availableStatus": "AVAILABLE",
                                     "price": 230,
                                     "campaignInfo": null,
                                     "description": "Grilled chicken with creamy tomato sauce spaghetti.",
                                     "photos": [
                                       "https://developer.grab.com/assets/default-menu/pancake-1.jpeg"
                                     ],
                                     "modifierGroups": [
                                       {
                                         "id": "MODIFIERGROUP-02",
                                         "name": "Topping Additions",
                                         "sequence": 1,
                                         "availableStatus": "AVAILABLE",
                                         "selectionRangeMin": 1,
                                         "selectionRangeMax": 2,
                                         "modifiers": [
                                           {
                                             "id": "MODIFIER-04",
                                             "name": "Honey",
                                             "sequence": 1,
                                             "availableStatus": "AVAILABLE",
                                             "price": 0
                                           },
                                           {
                                             "id": "MODIFIER-05",
                                             "name": "Chocolate Sauce",
                                             "sequence": 2,
                                             "availableStatus": "AVAILABLE",
                                             "price": 0
                                           }
                                         ]
                                       }
                                     ]
                                   }
                                 ],
                                 "nameTranslation": {
                                   "id": "Pancake Gurih"
                                 }
                               },
                               {
                                 "id": "CATEGORY-02",
                                 "name": "Crispy Puffs",
                                 "sequence": 2,
                                 "availableStatus": "AVAILABLE",
                                 "items": [
                                   {
                                     "id": "ITEM-03",
                                     "name": "2 Pieces Crispy Puffs Set",
                                     "sequence": 1,
                                     "availableStatus": "AVAILABLE",
                                     "price": 220,
                                     "campaignInfo": null,
                                     "description": "",
                                     "photos": [
                                       "https://developer.grab.com/assets/default-menu/crispy-puff.jpeg"
                                     ],
                                     "modifierGroups": [
                                       {
                                         "id": "MODIFIERGROUP-03",
                                         "name": "Flavour of Crispy Puff 1",
                                         "sequence": 1,
                                         "availableStatus": "AVAILABLE",
                                         "selectionRangeMin": 1,
                                         "selectionRangeMax": 1,
                                         "modifiers": [
                                           {
                                             "id": "MODIFIER-06",
                                             "name": "Chicken Curry Puff",
                                             "sequence": 1,
                                             "availableStatus": "AVAILABLE",
                                             "price": 100
                                           },
                                           {
                                             "id": "MODIFIER-07",
                                             "name": "Sardine Puff",
                                             "sequence": 2,
                                             "availableStatus": "AVAILABLE",
                                             "price": 200
                                           },
                                           {
                                             "id": "MODIFIER-08",
                                             "name": "Yam Puff",
                                             "sequence": 1,
                                             "availableStatus": "AVAILABLE",
                                             "price": 300
                                           }
                                         ]
                                       },
                                       {
                                         "id": "MODIFIERGROUP-04",
                                         "name": "Flavour of Crispy Puff 2",
                                         "sequence": 1,
                                         "availableStatus": "AVAILABLE",
                                         "selectionRangeMin": 1,
                                         "selectionRangeMax": 1,
                                         "modifiers": [
                                           {
                                             "id": "MODIFIER-09",
                                             "name": "Chicken Curry Puff",
                                             "sequence": 1,
                                             "availableStatus": "AVAILABLE",
                                             "price": 100
                                           },
                                           {
                                             "id": "MODIFIER-10",
                                             "name": "Sardine Puff",
                                             "sequence": 2,
                                             "availableStatus": "AVAILABLE",
                                             "price": 200
                                           },
                                           {
                                             "id": "MODIFIER-11",
                                             "name": "Yam Puff",
                                             "sequence": 1,
                                             "availableStatus": "AVAILABLE",
                                             "price": 300
                                           }
                                         ]
                                       }
                                     ]
                                   }
                                 ]
                               },
                               {
                                 "id": "CATEGORY-03",
                                 "name": "Desserts",
                                 "sequence": 3,
                                 "availableStatus": "AVAILABLE",
                                 "items": [
                                   {
                                     "id": "ITEM-04",
                                     "name": "Panna Cotta DePizza",
                                     "sequence": 1,
                                     "availableStatus": "AVAILABLE",
                                     "price": 500,
                                     "campaignInfo": null,
                                     "description": "Homemade eggless custard served with wild berry mix & mango sauce",
                                     "photos": [
                                       "https://developer.grab.com/assets/default-menu/panna-cotta.jpeg"
                                     ],
                                     "modifierGroups": [
                                       {
                                         "id": "MODIFIERGROUP-04",
                                         "name": "Toppings",
                                         "sequence": 1,
                                         "availableStatus": "AVAILABLE",
                                         "selectionRangeMin": 1,
                                         "selectionRangeMax": 1,
                                         "modifiers": [
                                           {
                                             "id": "MODIFIER-12",
                                             "name": "Caramel Sauce",
                                             "sequence": 1,
                                             "availableStatus": "AVAILABLE",
                                             "price": 100
                                           },
                                           {
                                             "id": "MODIFIER-13",
                                             "name": "More Mango Sauce",
                                             "sequence": 2,
                                             "availableStatus": "AVAILABLE",
                                             "price": 300
                                           }
                                         ]
                                       }
                                     ]
                                   }
                                 ]
                               }
                             ]
                           },
                           {
                             "id": "SECTION-02",
                             "name": "Regular Menu",
                             "sequence": 2,
                             "serviceHours": {
                               "mon": {
                                 "openPeriodType": "OpenPeriod",
                                 "periods": [
                                   {
                                     "startTime": "12:00",
                                     "endTime": "16:00"
                                   }
                                 ]
                               },
                               "tue": {
                                 "openPeriodType": "OpenPeriod",
                                 "periods": [
                                   {
                                     "startTime": "12:00",
                                     "endTime": "16:00"
                                   }
                                 ]
                               },
                               "wed": {
                                 "openPeriodType": "OpenPeriod",
                                 "periods": [
                                   {
                                     "startTime": "12:00",
                                     "endTime": "16:00"
                                   }
                                 ]
                               },
                               "thu": {
                                 "openPeriodType": "OpenPeriod",
                                 "periods": [
                                   {
                                     "startTime": "12:00",
                                     "endTime": "16:00"
                                   }
                                 ]
                               },
                               "fri": {
                                 "openPeriodType": "OpenPeriod",
                                 "periods": [
                                   {
                                     "startTime": "12:00",
                                     "endTime": "16:00"
                                   }
                                 ]
                               },
                               "sat": {
                                 "openPeriodType": "OpenPeriod",
                                 "periods": [
                                   {
                                     "startTime": "12:00",
                                     "endTime": "16:00"
                                   }
                                 ]
                               },
                               "sun": {
                                 "openPeriodType": "OpenPeriod",
                                 "periods": [
                                   {
                                     "startTime": "12:00",
                                     "endTime": "16:00"
                                   }
                                 ]
                               }
                             },
                             "categories": [
                               {
                                 "id": "CATEGORY-04",
                                 "name": "Drinks",
                                 "sequence": 1,
                                 "availableStatus": "AVAILABLE",
                                 "items": [
                                   {
                                     "id": "ITEM-05",
                                     "name": "Speciality Drinks",
                                     "sequence": 1,
                                     "availableStatus": "AVAILABLE",
                                     "price": 1000,
                                     "campaignInfo": null,
                                     "description": "Choose from our Speciality Drinks",
                                     "photos": [
                                       "https://developer.grab.com/assets/default-menu/milk-shake.png"
                                     ],
                                     "modifierGroups": [
                                       {
                                         "id": "MODIFIERGROUP-05",
                                         "name": "Choice of Drinks",
                                         "sequence": 1,
                                         "availableStatus": "AVAILABLE",
                                         "selectionRangeMin": 1,
                                         "selectionRangeMax": 1,
                                         "modifiers": [
                                           {
                                             "id": "MODIFIER-14",
                                             "name": "Chocolate Milkshake",
                                             "sequence": 1,
                                             "availableStatus": "AVAILABLE",
                                             "price": 0
                                           },
                                           {
                                             "id": "MODIFIER-15",
                                             "name": "Strawberry Milkshake",
                                             "sequence": 2,
                                             "availableStatus": "AVAILABLE",
                                             "price": 0
                                           },
                                           {
                                             "id": "MODIFIER-16",
                                             "name": "Vanilla Milkshake",
                                             "sequence": 3,
                                             "availableStatus": "AVAILABLE",
                                             "price": 0
                                           }
                                         ]
                                       }
                                     ]
                                   }
                                 ]
                               },
                               {
                                 "id": "CATEGORY-05",
                                 "name": "Pasta",
                                 "sequence": 2,
                                 "availableStatus": "AVAILABLE",
                                 "items": [
                                   {
                                     "id": "ITEM-06",
                                     "name": "Grilled Chicken Cream Pasta",
                                     "sequence": 1,
                                     "availableStatus": "AVAILABLE",
                                     "price": 10000,
                                     "campaignInfo": null,
                                     "description": "Grilled chicken with creamy tomato sauce spaghetti.",
                                     "photos": [
                                       "https://developer.grab.com/assets/default-menu/pasta.jpeg"
                                     ],
                                     "modifierGroups": [
                                       {
                                         "id": "MODIFIERGROUP-06",
                                         "name": "Spiciness Level",
                                         "sequence": 1,
                                         "availableStatus": "AVAILABLE",
                                         "selectionRangeMin": 1,
                                         "selectionRangeMax": 1,
                                         "modifiers": [
                                           {
                                             "id": "MODIFIER-17",
                                             "name": "Low",
                                             "sequence": 1,
                                             "availableStatus": "AVAILABLE",
                                             "price": 0
                                           },
                                           {
                                             "id": "MODIFIER-18",
                                             "name": "Medium",
                                             "sequence": 2,
                                             "availableStatus": "AVAILABLE",
                                             "price": 0
                                           },
                                           {
                                             "id": "MODIFIER-19",
                                             "name": "Hot",
                                             "sequence": 3,
                                             "availableStatus": "AVAILABLE",
                                             "price": 0
                                           }
                                         ]
                                       }
                                     ]
                                   }
                                 ]
                               },
                               {
                                 "id": "CATEGORY-06",
                                 "name": "Pizza",
                                 "sequence": 3,
                                 "availableStatus": "AVAILABLE",
                                 "items": [
                                   {
                                     "id": "ITEM-07",
                                     "name": "Mala Madness",
                                     "sequence": 1,
                                     "availableStatus": "AVAILABLE",
                                     "price": 10000,
                                     "campaignInfo": null,
                                     "description": "Spicy. Spice up your day. Mala spice base, spam and bacon, topped with peanuts.",
                                     "photos": [
                                       "https://developer.grab.com/assets/default-menu/pizza.jpeg"
                                     ],
                                     "modifierGroups": [
                                       {
                                         "id": "MODIFIERGROUP-07",
                                         "name": "Add on toppings",
                                         "sequence": 1,
                                         "availableStatus": "AVAILABLE",
                                         "selectionRangeMin": 1,
                                         "selectionRangeMax": 1,
                                         "modifiers": [
                                           {
                                             "id": "MODIFIER-20",
                                             "name": "Vegetables",
                                             "sequence": 1,
                                             "availableStatus": "AVAILABLE",
                                             "price": 100
                                           },
                                           {
                                             "id": "MODIFIER-21",
                                             "name": "Crab Meat",
                                             "sequence": 2,
                                             "availableStatus": "AVAILABLE",
                                             "price": 300
                                           },
                                           {
                                             "id": "MODIFIER-22",
                                             "name": "Pepperoni",
                                             "sequence": 3,
                                             "availableStatus": "AVAILABLE",
                                             "price": 300
                                           }
                                         ]
                                       }
                                     ]
                                   }
                                 ]
                               },
                               {
                                 "id": "CATEGORY-07",
                                 "name": "Desserts",
                                 "sequence": 4,
                                 "availableStatus": "AVAILABLE",
                                 "items": [
                                   {
                                     "id": "ITEM-08",
                                     "name": "Panna Cotta DePizza",
                                     "sequence": 1,
                                     "availableStatus": "AVAILABLE",
                                     "price": 10000,
                                     "campaignInfo": null,
                                     "description": "Homemade eggless custard served with wild berry mix & mango sauce",
                                     "photos": [
                                       "https://developer.grab.com/assets/default-menu/panna-cotta.jpeg"
                                     ],
                                     "modifierGroups": [
                                       {
                                         "id": "MODIFIERGROUP-08",
                                         "name": "Toppings",
                                         "sequence": 1,
                                         "availableStatus": "AVAILABLE",
                                         "selectionRangeMin": 1,
                                         "selectionRangeMax": 1,
                                         "modifiers": [
                                           {
                                             "id": "MODIFIER-23",
                                             "name": "Caramel Sauce",
                                             "sequence": 1,
                                             "availableStatus": "AVAILABLE",
                                             "price": 100
                                           },
                                           {
                                             "id": "MODIFIER-24",
                                             "name": "More Mango Sauce",
                                             "sequence": 2,
                                             "availableStatus": "AVAILABLE",
                                             "price": 300
                                           }
                                         ]
                                       }
                                     ]
                                   }
                                 ]
                               }
                             ]
                           }
                         ]
                       };
      
      // Set content type and return 200 response with JSON data
      res.status(200).contentType('application/json').json(menuData);
      
    } catch (error) {
      console.error('Error in handleGetMenu:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while retrieving menu'
      });
    }
  }

  // Submit order endpoint handler
  async handleSubmitOrder(req, res) {
    try {
      console.log('POST /grab/order - Receiving order submission from Grab');
      console.log('Request Headers:', req.headers);
      console.log('Request Method:', req.method);
      console.log('Request URL:', req.originalUrl);
      console.log('Request Query Parameters:', req.query);
      console.log('Request Body:', JSON.stringify(req.body, null, 2));
      
      // Return 204 No Content - successful but no content returned
      res.status(204).end();
      
    } catch (error) {
      console.error('Error in handleSubmitOrder:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while processing order submission',
        error: error.message
      });
    }
  }

  // Push order state endpoint handler
  async handlePushOrderState(req, res) {
    try {
      console.log('PUT /grab/order/state - Receiving order status updates from Grab');
      console.log('Request Headers:', req.headers);
      console.log('Request Method:', req.method);
      console.log('Request URL:', req.originalUrl);
      console.log('Request Query Parameters:', req.query);
      console.log('Request Body:', JSON.stringify(req.body, null, 2));
      
      // Return 204 No Content - successful but no content returned
      res.status(204).end();
      
    } catch (error) {
      console.error('Error in handlePushOrderState:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while processing order state updates',
        error: error.message
      });
    }
  }

  // OAuth token endpoint handler
  async handleOAuthToken(req, res) {
    try {
      console.log('POST /grab/oauth/token - OAuth token request');
      console.log('Request payload:', req.body);
      
      const axios = require('axios');
      let data = JSON.stringify({
        "client_id": "25b782bd0ced45239e913cc80b5fc0ea",
        "client_secret": "y9Ox9oUqRTYtTQrd",
        "grant_type": "client_credentials",
        "scope": "food.partner_api"
      });

      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://partner-api.grab.com/grabid/v1/oauth2/token',
        headers: { 
          'Content-Type': 'application/json'
        },
        data : data
      };

      const response = await axios.request(config);
      console.log('Grab OAuth response:', JSON.stringify(response.data));
      
      // Return the response directly
      res.status(200).json(response.data);
      
    } catch (error) {
      console.error('Error in handleOAuthToken:', error);
      
      if (error.response) {
        // Forward the error response from Grab API
        res.status(error.response.status).json(error.response.data);
      } else {
        res.status(500).json({
          status: 'ERROR',
          message: 'Internal server error while processing OAuth token'
        });
      }
    }
  }

  // Menu Sync Webhook handler
  async handleMenuSyncWebhook(req, res) {
    try {
      console.log('POST /grab/webhook/menu-sync - Menu sync webhook');
      console.log('Request payload:', req.body);
      
      const webhookData = req.body;
      
      // TODO: Implement menu sync webhook logic
      // Process menu synchronization
      
      res.status(200).json({
        status: 'OK',
        message: 'Menu sync webhook processed successfully'
      });
    } catch (error) {
      console.error('Error in handleMenuSyncWebhook:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while processing menu sync webhook'
      });
    }
  }

  // Push Grab menu webhook handler - receives menu data from Grab
  async handlePushGrabMenu(req, res) {
    try {
      console.log('POST /grab/pushGrabMenu - Receiving menu data from Grab');
      console.log('Request Headers:', req.headers);
      console.log('Request Method:', req.method);
      console.log('Request URL:', req.originalUrl);
      console.log('Request Query Parameters:', req.query);
      console.log('Request Body:', JSON.stringify(req.body, null, 2));
      
      // Return 204 No Content - successful but no content returned
      res.status(204).end();
      
    } catch (error) {
      console.error('Error in handlePushGrabMenu:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while processing Grab menu data',
        error: error.message
      });
    }
  }

  // Push Integration Status webhook handler - receives integration status from Grab
  async handlePushIntegrationStatus(req, res) {
    try {
      console.log('POST /grab/pushIntegrationStatus - Receiving integration status from Grab');
      console.log('Request Headers:', req.headers);
      console.log('Request Method:', req.method);
      console.log('Request URL:', req.originalUrl);
      console.log('Request Query Parameters:', req.query);
      console.log('Request Body:', JSON.stringify(req.body, null, 2));
      
      // Return 204 No Content - successful but no content returned
      res.status(204).end();
      
    } catch (error) {
      console.error('Error in handlePushIntegrationStatus:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while processing Grab integration status',
        error: error.message
      });
    }
  }

  // Menu Sync State webhook handler - receives menu sync status updates from Grab
  async handleMenuSyncState(req, res) {
    try {
      console.log('POST /grab/menuSyncState - Receiving menu sync state from Grab');
      console.log('Request Headers:', req.headers);
      console.log('Request Method:', req.method);
      console.log('Request URL:', req.originalUrl);
      console.log('Request Query Parameters:', req.query);
      console.log('Request Body:', JSON.stringify(req.body, null, 2));
      
      // Return 204 No Content - successful but no content returned
      res.status(204).end();
      
    } catch (error) {
      console.error('Error in handleMenuSyncState:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while processing Grab menu sync state',
        error: error.message
      });
    }
  }

  // Integration status endpoint handler
  async handleIntegrationStatus(req, res) {
    try {
      console.log('GET /grab/integration/status - Getting integration status');
      console.log('Request payload:', req.query);
      
      // TODO: Implement integration status check logic
      const statusData = {
        status: 'active',
        lastSync: new Date().toISOString(),
        connected: true,
        partnerId: 'grab_partner_001'
      };

      res.status(200).json({
        status: 'OK',
        data: statusData
      });
    } catch (error) {
      console.error('Error in handleIntegrationStatus:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while checking integration status'
      });
    }
  }

  // OAuth scopes endpoint handler
  async handleOAuthScopes(req, res) {
    try {
      console.log('GET /grab/oauth/scopes - Getting OAuth scopes');
      console.log('Request payload:', req.query);
      
      // TODO: Implement OAuth scopes logic
      const scopesData = {
        scopes: [
          'read:menu',
          'write:menu',
          'read:orders',
          'write:orders',
          'read:restaurant',
          'write:restaurant'
        ]
      };

      res.status(200).json({
        status: 'OK',
        data: scopesData
      });
    } catch (error) {
      console.error('Error in handleOAuthScopes:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while retrieving OAuth scopes'
      });
    }
  }

  // Partner client ID endpoint handler
  async handlePartnerClientId(req, res) {
    try {
      console.log('GET /grab/partner/client-id - Getting partner client ID');
      console.log('Request payload:', req.query);
      
      // TODO: Implement partner client ID retrieval logic
      const clientIdData = {
        client_id: 'grab_client_id_sample_' + Date.now()
      };

      res.status(200).json({
        status: 'OK',
        data: clientIdData
      });
    } catch (error) {
      console.error('Error in handlePartnerClientId:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while retrieving partner client ID'
      });
    }
  }

  // Partner client secret endpoint handler
  async handlePartnerClientSecret(req, res) {
    try {
      console.log('GET /grab/partner/client-secret - Getting partner client secret');
      console.log('Request payload:', req.query);
      
      // TODO: Implement partner client secret retrieval logic
      const clientSecretData = {
        client_secret: 'grab_client_secret_sample_' + Date.now()
      };

      res.status(200).json({
        status: 'OK',
        data: clientSecretData
      });
    } catch (error) {
      console.error('Error in handlePartnerClientSecret:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while retrieving partner client secret'
      });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = GrabRouter; 