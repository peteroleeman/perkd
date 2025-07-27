const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const UtilFeie = require("./feie/util_feie");
const querystring = require('querystring');
const bodyParser = require('body-parser');
const url = require('url');
const UtilDateTime = require("./util/util_datetime");
const firebase = require("./db");
const CryptoJS = require('crypto-js');
const kSecurePhase = "foodio_foodio";
const fireStore = firebase.firestore();
const kBaseUrl = "http://43.128.71.13:8001/api";

class VendingRouter {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.get('/about', function(req, res) {
     res.json({ message: `Endpoint for Vending integration v1.0.1`});
    });
    
   
    this.router.post('/checkmembership', this.checkMembership.bind(this));
    this.router.post('/redeemvoucher', this.redeemVoucher.bind(this));
    this.router.post('/checkvoucher', this.checkVoucher.bind(this));
    this.router.post('/getstock', this.handleGetStock.bind(this));
    this.router.post('/datasetcollected', this.dataSetCollected.bind(this));
    this.router.post('/datasetuncollected', this.dataSetUnCollected.bind(this));
    this.router.post('/datagetorder', this.dataGetOrder.bind(this));
    this.router.post('/login', this.handleLogin.bind(this));
    this.router.post('/register', this.handleRegister.bind(this));
    this.router.post('/memberinfo', this.handleMemberInfo.bind(this));
    this.router.post('/goodslist', this.handleGoodsList.bind(this));
    this.router.post('/createorder', this.handleCreateOrder.bind(this));
    this.router.post('/checkorder', this.handleCheckOrder.bind(this));
    this.router.post('/payment/callback', this.handlePaymentCallback.bind(this));
    this.router.post('/pickup', this.handlePickup.bind(this));
    this.router.post('/pickupsuccess', this.handlePickupSuccess.bind(this));

  }


  async dataSetUnCollected(req, res) {
    try {
      // Extract required parameters from request
      const { userid, orderid } = req.body;
  
      // Validate required parameters
      if (!userid || !orderid) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: userId and orderId are required'
        });
      }
  
      // First check if order exists and its current status
      const storeOrderRef = fireStore
        .collection('store')
        .doc("online")
        .collection('order')
        .doc(orderid);
  
      const orderDoc = await storeOrderRef.get();
  
      // Check if order exists
      if (!orderDoc.exists) {
        return res.status(404).json({
          success: false,
          message: `Order ${orderid} not found`
        });
      }
  
      const orderData = orderDoc.data();
  
      // Check if order is not collected (status !== 3)
      if (orderData.status !== 3) {
        return res.status(400).json({
          success: false,
          message: `Order ${orderid} is not in collected status`,
          currentStatus: orderData.status
        });
      }
  
      // Get current timestamp
      const formattedDateTime = new UtilDateTime().getDateTimeString("yyyyMMddHHmmss");
      
      // Prepare update data
      const updateData = { 
        collectedDateTime: null,
        status: 0, // Set back to ready for collection
      };
  
      // Update order in user collection
      const userOrderRef = fireStore
        .collection('user')
        .doc(`FU_${userid}`)
        .collection('order')
        .doc(orderid);
  
      // Execute both updates in a batch for atomicity
      const batch = fireStore.batch();
      batch.update(storeOrderRef, updateData);
      batch.update(userOrderRef, updateData);
      
      // Commit the batch
      await batch.commit();
  
      console.log(`Order ${orderid} marked as uncollected for user ${userid}`);
      
      return res.status(200).json({
        success: true,
        message: 'Order successfully marked as uncollected',
      });
      
    } catch (error) {
      console.error('Error setting order as uncollected:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to mark order as uncollected',
        error: error.message
      });
    }
  }

  async dataSetCollected(req, res) {
  try {
    // Extract required parameters from request
    const { userid, orderid } = req.body;

    // Validate required parameters
    if (!userid || !orderid ) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: userId and orderId are required'
      });
    }


    // First check if order exists and its current status
    const storeOrderRef = fireStore
      .collection('store')
      .doc("online")
      .collection('order')
      .doc(orderid);

    const orderDoc = await storeOrderRef.get();

    // Check if order exists
    if (!orderDoc.exists) {
      return res.status(404).json({
        success: false,
        message: `Order ${orderid} not found`
      });
    }

    const orderData = orderDoc.data();

    // Check if order is already collected (status 3)
    if (orderData.status === 3) {
      return res.status(400).json({
        success: false,
        message: `Order ${orderid} has already been collected`,
        collectedDateTime: orderData.collectedDateTime || 'Unknown'
      });
    }


    // Get current timestamp
    const formattedDateTime = new UtilDateTime().getDateTimeString("yyyyMMddHHmmss");
    
    // Prepare update data
    const updateData = { 
      collectedDateTime: formattedDateTime,
      status: 3 //kStatusCollected
    };

  

    // Update order in user collection
    const userOrderRef = fireStore
      .collection('user')
      .doc(`FU_${userid}`)
      .collection('order')
      .doc(orderid);

    // Execute both updates in a batch for atomicity
    const batch = fireStore.batch();
    batch.update(storeOrderRef, updateData);
    batch.update(userOrderRef, updateData);
    
    // Commit the batch
    await batch.commit();

    console.log(`Order ${orderid} marked as collected for user ${userid}`);
    
    return res.status(200).json({
      success: true,
      message: 'Order successfully marked as collected',
      collectedAt: formattedDateTime
    });
    
  } catch (error) {
    console.error('Error setting order as collected:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to mark order as collected',
      error: error.message
    });
  }
}

  async dataGetOrder(req, res) {
  try {
    // Extract parameters from request
    const orderid = req.query.orderId || req.body.orderid;
    
    // Validate required parameters
    if (!orderid) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: orderId is required'
      });
    }

    // Define the reference to the order document
    const orderRef = fireStore
      .collection('store')
      .doc("online")
      .collection('order')
      .doc(orderid);

    // Get the document
    const orderDoc = await orderRef.get();

    // Check if the document exists
    if (!orderDoc.exists) {
      return res.status(404).json({
        success: false,
        message: `Order with ID ${orderid}`
      });
    }

    // Extract the order data
    const orderData = orderDoc.data();

    // Add the orderId to the data
    const responseData = {
      id: orderid,
      ...orderData
    };

    return res.status(200).json({
      success: true,
      message: 'Order retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Error retrieving order:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve order',
      error: error.message
    });
  }
}

  async checkMembership(req, res) {
    try {
      // Validate the request body
      if (!req.body) {
        return res.status(400).json({ error: 'Request body is missing or empty' });
      }

      const { membership } = req.body;
      if (!membership) {
        return res.status(400).json({ error: 'Membership QR code is required' });
      }

      // Decrypt the membership QR code
      const bytes = CryptoJS.AES.decrypt(membership, kSecurePhase);
      const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

      // Check if it starts with "FOODIO:"
      if (!decryptedText.startsWith('FOODIO:')) {
        return res.status(400).json({ error: 'Invalid membership format' });
      }

      // Extract phone number
      const phoneNumber = decryptedText.split(':')[1];
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Invalid phone number format' });
      }

      // Check in Firestore using the exact path format from Flutter code
      const userRef = fireStore.collection('user');
      const userDoc = await userRef.doc("FU_" + phoneNumber).get();

      if (!userDoc.exists) {
        return res.json({ 
          isValid: false,
          message: 'User not found'
        });
      }

      // Get user data and return it directly
      const userData = userDoc.data();
      
      return res.json({
        isValid: true,
        message: 'Valid user',
        phoneNumber: phoneNumber,
        userData: userData  // Return the complete Firestore document data
      });

    } catch (error) {
      console.error('Error checking membership:', error);
      return res.status(500).json({ 
        error: 'Error validating membership',
        details: error.message 
      });
    }
  }


  async redeemVoucher(req, res) {
    try {
        // Validate the request body
        if (!req.body) {
            return res.status(400).json({ error: 'Request body is missing or empty' });
        }

        const { membership } = req.body;
        if (!membership) {
            return res.status(400).json({ error: 'Membership code is required' });
        }

        // Decrypt the membership QR code
        const bytes = CryptoJS.AES.decrypt(membership, kSecurePhase);
        const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

        // Check if it starts with "FOODIO:"
        if (!decryptedText.startsWith('FOODIO:')) {
            return res.status(400).json({ error: 'Invalid membership format' });
        }

        // Extract phone number
        const phoneNumber = decryptedText.split(':')[1];
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }

        // Check if voucher already exists
        const voucherRef = fireStore.collection('voucher');
        const voucherDoc = await voucherRef.doc("V_" + phoneNumber).get();

        if (voucherDoc.exists) {
            return res.json({
                success: false,
                message: 'Voucher already redeemed',
                phoneNumber: phoneNumber
            });
        }

        // Create new voucher document
        const currentDate = new Date();
        const voucherData = {
            phoneNumber: phoneNumber,
            redeemDate: currentDate,
            status: 'ACTIVE',
            type: 'New member',
            createdAt: currentDate,
            updatedAt: currentDate
        };

        await voucherRef.doc("V_" + phoneNumber).set(voucherData);

        return res.json({
            success: true,
            message: 'Voucher successfully redeemed',
            phoneNumber: phoneNumber,
            voucherData: voucherData
        });

    } catch (error) {
        console.error('Error redeeming voucher:', error);
        return res.status(500).json({
            error: 'Error redeeming voucher',
            details: error.message
        });
    }
  }

  async checkVoucher(req, res) {
    try {
        // Validate the request body
        if (!req.body) {
            return res.status(400).json({ error: 'Request body is missing or empty' });
        }

        const { membership } = req.body;
        if (!membership) {
            return res.status(400).json({ error: 'Membership code is required' });
        }

        // Decrypt the membership QR code
        const bytes = CryptoJS.AES.decrypt(membership, kSecurePhase);
        const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

        // Check if it starts with "FOODIO:"
        if (!decryptedText.startsWith('FOODIO:')) {
            return res.status(400).json({ error: 'Invalid membership format' });
        }

        // Extract phone number
        const phoneNumber = decryptedText.split(':')[1];
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }

        // Check if voucher already exists
        const voucherRef = fireStore.collection('voucher');
        const voucherDoc = await voucherRef.doc("V_" + phoneNumber).get();

        if (voucherDoc.exists) {
            return res.json({
                valid: false,
                message: 'Voucher already redeemed',
                phoneNumber: phoneNumber
            });
        }

        // Create new voucher document
        
        return res.json({
          valid: true,
          message: 'Voucher still available',
          phoneNumber: phoneNumber
      });

    } catch (error) {
        console.error('Error checking voucher:', error);
        return res.status(500).json({
            error: 'Error checking voucher',
            details: error.message
        });
    }
  }

  /**
   * Fetches stock details from the dispenser API
   * @param {string} mid - The machine ID to get stock for
   * @returns {Promise<Object>} - Returns a promise that resolves to the stock data or an error object
   */
  async getStock(mid) {
    try {
      // Validate input
      if (!mid) {
        return {
          success: false,
          message: 'Machine ID (mid) is required',
          data: null
        };
      }

      // Create form data
      const FormData = require('form-data');
      const data = new FormData();
      data.append('mid', mid);

      // Configure the request
      const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'http://dispenser.sayhi.asia/index.php/api/GetStock/detail',
        headers: { 
          ...data.getHeaders()
        },
        data: data
      };

      // Make the request
      const response = await axios.request(config);
      
      // Log success (optional)
      console.log(`Successfully fetched stock data for machine ${mid}`);
      
      // Return the data with success status
      return {
        success: true,
        message: 'Stock data retrieved successfully',
        data: response.data
      };
    } catch (error) {
      // Log the error for debugging
      console.error('Error fetching stock data:', error);
      
      // Provide detailed error information if available
      if (error.response) {
        console.error("Response status:", error.response.status);
        console.error("Response data:", error.response.data);
      }
      
      // Return error response
      return {
        success: false,
        message: `Failed to fetch stock data: ${error.message}`,
        data: null
      };
    }
  }

  /**
   * Route handler for stock retrieval API endpoint
   */
  async handleGetStock(req, res) {
    try {
      // Validate the request body
      if (!req.body) {
        return res.status(400).json({ 
          success: false, 
          message: 'Request body is missing or empty',
          data: null
        });
      }

      const { mid } = req.body;
      if (!mid) {
        return res.status(400).json({ 
          success: false, 
          message: 'Machine ID (mid) is required',
          data: null
        });
      }

      // Call the getStock method
      const result = await this.getStock(mid);
      
      // Return the result directly to the client
      return res.json(result);
    } catch (error) {
      console.error('Error in getStock route handler:', error);
      return res.status(500).json({
        success: false,
        message: `Server error while fetching stock data: ${error.message}`,
        data: null
      });
    }
  }

  async handleLogin(req, res) {
    try {
      // Validate request body
      const { device_number, merchant_id, mobile, mobile_area_code, password } = req.body;

      // Check for required fields
      if (!device_number || !merchant_id || !mobile || !mobile_area_code || !password) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters. Please provide device_number, merchant_id, mobile, mobile_area_code, and password'
        });
      }

      // Prepare request to external API
      const loginData = {
        device_number,
        merchant_id,
        mobile,
        mobile_area_code,
        password
      };

      // Make request to external API
      const response = await axios({
        method: 'POST',
        url: `${kBaseUrl}/vending/members/login`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: loginData
      });

      // Return the response from the external API
      //return res.status(200).json(response.data);

      return res.status(200).json({
                success: true,
                message: response.data || '',
                error: ""
              });

    } catch (error) {
      console.error('Error in login:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Login failed',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error during login',
        error: error.message
      });
    }
  }

  async handleRegister(req, res) {
    try {
      // Validate request body
      const { 
        avatar,
        birthday,
        device_number,
        email,
        merchant_id,
        mobile,
        mobile_area_code,
        nickname,
        password
      } = req.body;

      // Check for required fields
      const requiredFields = {
        device_number,
        merchant_id,
        mobile,
        mobile_area_code,
        password,
        email,
        nickname,
        birthday
      };

      const missingFields = Object.entries(requiredFields)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required parameters: ${missingFields.join(', ')}`
        });
      }

      // Prepare request to external API
      const registerData = {
        avatar: avatar || '',  // Make avatar optional
        birthday,
        device_number,
        email,
        merchant_id,
        mobile,
        mobile_area_code,
        nickname,
        password
      };

      // Make request to external API
      const response = await axios({
        method: 'POST',
        url: `${kBaseUrl}/vending/members/register`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: registerData
      });

      // Return the response from the external API
      return res.status(200).json(response.data);

    } catch (error) {
      console.error('Error in registration:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Registration failed',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error during registration',
        error: error.message
      });
    }
  }

  async handleMemberInfo(req, res) {
    try {
      // Get token from request body
      const { token } = req.body;

      // Check if token is provided
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authorization token is required in request body'
        });
      }

      // Make request to external API
      const response = await axios({
        method: 'GET',
        url: `${kBaseUrl}/vending/members/info`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      // Return the response from the external API
      return res.status(200).json(response.data);

    } catch (error) {
      console.error('Error fetching member info:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        // Special handling for 401 unauthorized errors
        if (error.response.status === 401) {
          return res.status(401).json({
            success: false,
            message: 'Invalid or expired token',
            error: error.response.data
          });
        }

        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Failed to fetch member info',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error while fetching member info',
        error: error.message
      });
    }
  }

  async handleGoodsList(req, res) {
    try {
      // Get query parameters
      const { device_number, merchant_id } = req.body;

      // Validate required parameters
      if (!device_number || !merchant_id) {
        return res.status(400).json({
          success: false,
          message: 'Both device_number and merchant_id are required query parameters'
        });
      }

      // Make request to external API
      const response = await axios({
        method: 'GET',
        url: `${kBaseUrl}/vending/devices/goods_list`,
        params: {
          device_number,
          merchant_id
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Return the response from the external API
      return res.status(200).json(response.data);

    } catch (error) {
      console.error('Error fetching goods list:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Failed to fetch goods list',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error while fetching goods list',
        error: error.message
      });
    }
  }

  async handleCreateOrder(req, res) {
    try {
      // Get token and order details from request body
      const { 
        token,
        order_details
      } = req.body;

      // Validate token
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authorization token is required in request body'
        });
      }

      // Validate order_details exists
      if (!order_details) {
        return res.status(400).json({
          success: false,
          message: 'order_details object is required in request body'
        });
      }

      // Extract order details
      const { 
        amount,
        currency,
        device_number,
        list,
        merchant_id,
        remark
      } = order_details;

      // Validate required parameters
      if ( !currency || !device_number || !list || !merchant_id) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters in order_details. Please provide amount, currency, device_number, list, and merchant_id'
        });
      }

      // Validate list structure
      if (!Array.isArray(list) || list.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'List must be a non-empty array of goods'
        });
      }

      // Validate each item in the list
//      const requiredItemFields = ['goods_count', 'goods_description', 'goods_id', 'goods_name',
//                                'goods_photo', 'goods_price', 'goods_sku'];
//      for (const item of list) {
//        const missingFields = requiredItemFields.filter(field => !item[field]);
//        if (missingFields.length > 0) {
//          return res.status(400).json({
//            success: false,
//            message: `Missing required fields in list item: ${missingFields.join(', ')}`
//          });
//        }
//      }

      // Make request to external API
      const response = await axios({
        method: 'POST',
        url: `${kBaseUrl}/vending/orders/purchase`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        data: {
          amount,
          currency,
          device_number,
          list,
          merchant_id,
          remark
        }
      });

      // Return the response from the external API
      return res.status(200).json(response.data);

    } catch (error) {
      console.error('Error creating order:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        // Special handling for 401 unauthorized errors
        if (error.response.status === 401) {
          return res.status(401).json({
            success: false,
            message: 'Invalid or expired token',
            error: error.response.data
          });
        }

        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Failed to create order',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error while creating order',
        error: error.message
      });
    }
  }

  async handleCheckOrder(req, res) {
    try {
      // Get token and orderId from request body
      const { token, orderId } = req.body;

      // Validate token
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authorization token is required in request body'
        });
      }

      // Validate orderId
      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required in request body'
        });
      }

      // Make request to external API
      const response = await axios({
        method: 'GET',
        url: `${kBaseUrl}/vending/orders/${orderId}`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      // Return the response from the external API
      //return res.status(200).json(response.data);
       return res.status(200).json({
                  success: true,
                  message: response.data,
                  error: ""
                });

    } catch (error) {
      console.error('Error checking order:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        // Special handling for 401 unauthorized errors
        if (error.response.status === 401) {
          return res.status(401).json({
            success: false,
            message: 'Invalid or expired token',
            error: error.response.data
          });
        }

        // Special handling for 404 not found errors
        if (error.response.status === 404) {
          return res.status(404).json({
            success: false,
            message: 'Order not found',
            error: error.response.data
          });
        }

        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Failed to check order',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error while checking order',
        error: error.message
      });
    }
  }

  async handlePaymentCallback(req, res) {
    try {
      // Get payment details from request body
      const { 
        amount,
        currency,
        order_id,
        payed_time,
        payment_channel,
        remark,
        status,
        transaction_id,
        transaction_type
      } = req.body;

      // Validate required fields
      const requiredFields = {
        amount,
        currency,
        order_id,
        payed_time,
        payment_channel,
        status,
        transaction_id,
        transaction_type
      };

      const missingFields = Object.entries(requiredFields)
        .filter(([_, value]) => value === undefined || value === null)
        .map(([key]) => key);

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required parameters: ${missingFields.join(', ')}`
        });
      }

      // Validate numeric fields
      if (typeof amount !== 'number' || typeof payed_time !== 'number') {
        return res.status(400).json({
          success: false,
          message: 'amount and payed_time must be numbers'
        });
      }

      // Make request to external API
      const response = await axios({
        method: 'POST',
        url: `${kBaseUrl}/open/vending/app/payment/callback`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: {
          amount,
          currency,
          order_id,
          payed_time,
          payment_channel,
          remark: remark || '',  // Make remark optional
          status,
          transaction_id,
          transaction_type
        }
      });

      // Return the response from the external API
      return res.status(200).json(response.data);

    } catch (error) {
      console.error('Error processing payment callback:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Failed to process payment callback',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error while processing payment callback',
        error: error.message
      });
    }
  }

  async handlePickup(req, res) {
    try {
      // Get token and orderId from request body
      const { token, orderId } = req.body;

      // Validate token
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authorization token is required in request body'
        });
      }

      // Validate orderId
      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required in request body'
        });
      }

      // Make request to external API with Bearer token authorization
      const response = await axios({
        method: 'POST',
        url: `${kBaseUrl}/vending/orders/${orderId}/pickup`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      // Return the response from the external API
      return res.status(200).json({
        success: true,
        message: response.data,
        error: ""
      });

    } catch (error) {
      console.error('Error processing pickup order:', error);
      
      // If the error is from the external API, forward its response
      if (error.response) {
        // Special handling for 401 unauthorized errors
        if (error.response.status === 401) {
          return res.status(401).json({
            success: false,
            message: 'Invalid or expired token',
            error: error.response.data
          });
        }

        // Special handling for 404 not found errors
        if (error.response.status === 404) {
          return res.status(404).json({
            success: false,
            message: 'Order not found',
            error: error.response.data
          });
        }

        return res.status(error.response.status).json({
          success: false,
          message: error.response.data.message || 'Failed to process pickup order',
          error: error.response.data
        });
      }

      // For other errors, return a generic error message
      return res.status(500).json({
        success: false,
        message: 'Internal server error while processing pickup order',
        error: error.message
      });
    }
  }

  async handlePickupSuccess(req, res) {
    try {
      // DEBUG: Log function entry with timestamp and request details
      console.log('=== handlePickupSuccess TRIGGERED ===');
      console.log('=====================================');

      // Get required parameters from request body
      const { remark, merchant_id, device_number } = req.body;

      // DEBUG: Log extracted parameters
      console.log('Extracted parameters:');
      console.log('- remark:', remark);
      console.log('- merchant_id:', merchant_id);
      console.log('- device_number:', device_number);

      // Validate required parameters
      if (!remark || !merchant_id || !device_number) {
        console.log('DEBUG: Validation failed - missing required parameters');
        console.log('- remark exists:', !!remark);
        console.log('- merchant_id exists:', !!merchant_id);
        console.log('- device_number exists:', !!device_number);
        
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: remark, merchant_id, and device_number are all required'
        });
      }

      // Create document ID by combining merchant_id and device_number
      const documentId = `${merchant_id}_${device_number}`;
      
      // DEBUG: Log document ID creation
      console.log('DEBUG: Created document ID:', documentId);

      // Reference to the pickup document in Firestore
      const pickupDocRef = fireStore
        .collection('user')
        .doc(`FU_${remark}`)
        .collection('pickup')
        .doc(documentId);

      // Reference to the pickup_success document in Firestore
      const pickupSuccessDocRef = fireStore
        .collection('user')
        .doc(`FU_${remark}`)
        .collection('pickup_success')
        .doc(documentId);

      // DEBUG: Log Firestore paths
      console.log('DEBUG: Firestore paths:');
      console.log('- Pickup collection path:', `user/FU_${remark}/pickup/${documentId}`);
      console.log('- Pickup success collection path:', `user/FU_${remark}/pickup_success/${documentId}`);

      // Check if document exists before attempting to move
      console.log('DEBUG: Checking if pickup document exists...');
      const docSnapshot = await pickupDocRef.get();

      if (!docSnapshot.exists) {
        console.log('DEBUG: Pickup document NOT found - returning 404');
        console.log('- Document ID:', documentId);
        console.log('- User ID:', `FU_${remark}`);
        
        return res.status(404).json({
          success: false,
          message: `Pickup record with ID ${documentId} not found for user ${remark}`,
          user_id: `FU_${remark}`
        });
      }

      // Get the document data
      const pickupData = docSnapshot.data();

      // Add timestamp for when it was moved to pickup_success
      const pickupSuccessData = {
        ...pickupData,
        pickup_success_timestamp: new Date(),
        moved_from_pickup_at: new Date().toISOString()
      };

      // Use batch operation to move data atomically
      const batch = fireStore.batch();
      
      // Add to pickup_success collection
      batch.set(pickupSuccessDocRef, pickupSuccessData);
      
      // Remove from pickup collection
      batch.delete(pickupDocRef);
      
      // Commit the batch operation
      await batch.commit();

      console.log(`Successfully moved pickup record ${documentId} to pickup_success for user FU_${remark}`);

      // DEBUG: Log success response details
      console.log('DEBUG: Preparing success response...');
      console.log('DEBUG: Response data:', {
        success: true,
        moved_document_id: documentId,
        user_id: `FU_${remark}`,
        pickup_success_timestamp: pickupSuccessData.pickup_success_timestamp
      });
      console.log('=== handlePickupSuccess COMPLETED SUCCESSFULLY ===');

      return res.status(200).json({
        success: true,
        message: 'Pickup record successfully moved to pickup_success',
        moved_document_id: documentId,
        user_id: `FU_${remark}`,
        pickup_success_timestamp: pickupSuccessData.pickup_success_timestamp
      });

    } catch (error) {
      // DEBUG: Enhanced error logging
      console.log('=== handlePickupSuccess ERROR OCCURRED ===');
      console.log('Error timestamp:', new Date().toISOString());
      console.log('Error message:', error.message);
      console.log('Error stack:', error.stack);
      console.log('Request body at time of error:', JSON.stringify(req.body, null, 2));
      console.log('==========================================');
      
      console.error('Error processing pickup success:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Internal server error while processing pickup success',
        error: error.message
      });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = VendingRouter;