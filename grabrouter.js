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

    // Get menu endpoint
    //https://{{api-endpoint}}/<any-path>/pushGrabMenu
    this.router.post('/merchant/pushGrabMenu', this.handleGetMenu.bind(this));

    // Submit order endpoint
    this.router.post('/order', this.handleSubmitOrder.bind(this));

    // Push order state endpoint
    this.router.post('/order/state', this.handlePushOrderState.bind(this));

    // OAuth token endpoint
    this.router.post('/oauth/token', this.handleOAuthToken.bind(this));

    // Menu Sync Webhook
    this.router.post('/webhook/menu-sync', this.handleMenuSyncWebhook.bind(this));

    // Push Grab menu endpoint
    this.router.post('/menu/push', this.handlePushGrabMenu.bind(this));

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
      console.log('Request IP:', req.ip);
      console.log('Request User Agent:', req.get('User-Agent'));
      
      // Extract required parameters
    //   const { merchantID, partnerMerchantID } = req.query;
    //   const authHeader = req.headers.authorization;
      
    //   // Validate required parameters
    //   if (!merchantID) {
    //     return res.status(400).json({
    //       status: 'ERROR',
    //       message: 'Bad Request: merchantID is required'
    //     });
    //   }
      
    //   if (!partnerMerchantID) {
    //     return res.status(400).json({
    //       status: 'ERROR',
    //       message: 'Bad Request: partnerMerchantID is required'
    //     });
    //   }
      
    //   // Validate Authorization header
    //   if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //     return res.status(401).json({
    //       status: 'ERROR',
    //       message: 'Unauthorized: Bearer token is required'
    //     });
    //   }
      
    //   const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
    //   console.log('MerchantID:', merchantID);
    //   console.log('PartnerMerchantID:', partnerMerchantID);
    //   console.log('Bearer Token:', token);
      
      // TODO: Validate bearer token
      
      const menuData = {
        "merchantID": merchantID,
        "partnerMerchantID": partnerMerchantID,
        "currency": {
          "code": "SGD",
          "symbol": "S$",
          "exponent": 2
        },
        "sellingTimes": [
          {
            "startTime": "2022-03-01 10:00:00",
            "endTime": "2025-01-21 22:00:00",
            "id": "partner-sellingTimeID-1",
            "name": "Lunch deal",
            "serviceHours": {
              "mon": {
                "openPeriodType": "OpenPeriod",
                "periods": [
                  {
                    "startTime": "11:30",
                    "endTime": "21:30"
                  }
                ]
              },
              "tue": {
                "openPeriodType": "OpenPeriod",
                "periods": [
                  {
                    "startTime": "11:30",
                    "endTime": "21:30"
                  }
                ]
              },
              "wed": {
                "openPeriodType": "OpenPeriod",
                "periods": [
                  {
                    "startTime": "11:30",
                    "endTime": "21:30"
                  }
                ]
              },
              "thu": {
                "openPeriodType": "OpenPeriod",
                "periods": [
                  {
                    "startTime": "11:30",
                    "endTime": "21:30"
                  }
                ]
              },
              "fri": {
                "openPeriodType": "OpenPeriod",
                "periods": [
                  {
                    "startTime": "11:30",
                    "endTime": "21:30"
                  }
                ]
              },
              "sat": {
                "openPeriodType": "OpenPeriod",
                "periods": [
                  {
                    "startTime": "11:30",
                    "endTime": "21:30"
                  }
                ]
              },
              "sun": {
                "openPeriodType": "OpenPeriod",
                "periods": [
                  {
                    "startTime": "11:30",
                    "endTime": "21:30"
                  }
                ]
              }
            }
          }
        ],
        "categories": [
          {
            "id": "category_id",
            "name": "Value set",
            "nameTranslation": {
              "property1": "translation",
              "property2": "translation"
            },
            "availableStatus": "AVAILABLE",
            "sellingTimeID": "partner-sellingTimeID-1",
            "sequence": 1,
            "items": [
              {
                "id": "item_id",
                "name": "Crispy burger with smoked salmon",
                "nameTranslation": {
                  "property1": "translation",
                  "property2": "translation"
                },
                "availableStatus": "AVAILABLE",
                "description": "Crispy burger with smoked salmon is a delicious twist on a classic burger. Made with a perfectly cooked beef patty and topped with smoked salmon, fresh greens, and a creamy sauce.",
                "descriptionTranslation": {
                  "property1": "translation",
                  "property2": "translation"
                },
                "price": 1900,
                "photos": [
                  "http://example.com/image_url.jpg"
                ],
                "specialType": null,
                "taxable": false,
                "barcode": "GTIN",
                "sellingTimeID": "partner-sellingTimeID-1",
                "maxStock": 15,
                "sequence": 1,
                "advancedPricing": {
                  "Delivery_OnDemand_GrabApp": 30,
                  "Delivery_Scheduled_GrabApp": 25,
                  "SelfPickUp_OnDemand_GrabApp": 25,
                  "DineIn_OnDemand_GrabApp": 25,
                  "Delivery_OnDemand_StoreFront": 25,
                  "Delivery_Scheduled_StoreFront": 25,
                  "SelfPickUp_OnDemand_StoreFront": 25
                },
                "purchasability": {
                  "Delivery_OnDemand_GrabApp": true,
                  "Delivery_Scheduled_GrabApp": true,
                  "SelfPickUp_OnDemand_GrabApp": true,
                  "DineIn_OnDemand_GrabApp": true,
                  "Delivery_OnDemand_StoreFront": true,
                  "Delivery_Scheduled_StoreFront": true,
                  "SelfPickUp_OnDemand_StoreFront": true
                },
                "modifierGroups": [
                  {
                    "id": "modifier_group_id",
                    "name": "Add on",
                    "nameTranslation": {
                      "property1": "translation",
                      "property2": "translation"
                    },
                    "availableStatus": "AVAILABLE",
                    "selectionRangeMin": 0,
                    "selectionRangeMax": 1,
                    "sequence": 1,
                    "modifiers": [
                      {
                        "id": "modifier_id",
                        "name": "Smoked tuna",
                        "nameTranslation": {},
                        "availableStatus": "AVAILABLE",
                        "price": 200,
                        "barcode": "GTIN",
                        "sequence": 1,
                        "advancedPricing": {}
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };
      
      res.status(200).json(menuData);
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
      console.log('POST /grab/order - Submitting order');
      console.log('Request payload:', req.body);
      
      // TODO: Implement order submission logic
      const orderData = req.body;
      
      // Basic validation
      if (!orderData || !orderData.orderId) {
        return res.status(400).json({
          status: 'ERROR',
          message: 'Bad Request: Order ID is required'
        });
      }

      // Process order here
      const processedOrder = {
        orderId: orderData.orderId,
        status: 'confirmed',
        estimatedDeliveryTime: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes from now
      };

      res.status(200).json({
        status: 'OK',
        data: processedOrder
      });
    } catch (error) {
      console.error('Error in handleSubmitOrder:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while processing order'
      });
    }
  }

  // Push order state endpoint handler
  async handlePushOrderState(req, res) {
    try {
      console.log('POST /grab/order/state - Pushing order state');
      console.log('Request payload:', req.body);
      
      const stateData = req.body;
      
      // Basic validation
      if (!stateData || !stateData.orderId || !stateData.status) {
        return res.status(400).json({
          status: 'ERROR',
          message: 'Bad Request: Order ID and status are required'
        });
      }

      // TODO: Implement order state update logic
      // Update order status in database
      
      res.status(200).json({
        status: 'OK',
        message: 'Order state updated successfully'
      });
    } catch (error) {
      console.error('Error in handlePushOrderState:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while updating order state'
      });
    }
  }

  // OAuth token endpoint handler
  async handleOAuthToken(req, res) {
    try {
      console.log('POST /grab/oauth/token - OAuth token request');
      console.log('Request payload:', req.body);
      
      const tokenRequest = req.body;
      
      // Basic validation
      if (!tokenRequest || !tokenRequest.grant_type) {
        return res.status(400).json({
          status: 'ERROR',
          message: 'Bad Request: Grant type is required'
        });
      }

      // TODO: Implement OAuth token generation logic
      const tokenResponse = {
        access_token: 'sample_access_token_' + Date.now(),
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'read write'
      };

      res.status(200).json({
        status: 'OK',
        data: tokenResponse
      });
    } catch (error) {
      console.error('Error in handleOAuthToken:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while processing OAuth token'
      });
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

  // Push Grab menu endpoint handler
  async handlePushGrabMenu(req, res) {
    try {
      console.log('POST /grab/menu/push - Pushing menu to Grab');
      console.log('Request payload:', req.body);
      
      const menuData = req.body;
      
      // TODO: Implement menu push logic
      // Push menu to Grab platform
      
      res.status(200).json({
        status: 'OK',
        message: 'Menu pushed to Grab successfully'
      });
    } catch (error) {
      console.error('Error in handlePushGrabMenu:', error);
      res.status(500).json({
        status: 'ERROR',
        message: 'Internal server error while pushing menu to Grab'
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