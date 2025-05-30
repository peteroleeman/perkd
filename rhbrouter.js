const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const firebase = require("./db");
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const fireStore = firebase.firestore();
const TicketRouter = require('./ticketrouter');

class RHBRouter {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
    //UAT
    // this.appId = "c6786f2f07454da095765968ea6b4269"; //"3cb5e3f7fb1b45a690ec7fc992184b53";
    // this.apiKey = "gIGccv8RuGRFmMx+Rwq2HLMDpYEygfgZAaF3b23CQ3k="; //"Np7eimWRZFjzfCDtO/iYSWzCYBFeP0PmpiaG5PSCqdk=";
    // this.apiBaseUrl =  "https://uat.myduitnow.com/v1.1.0.0";//"https://sit.myduitnow.com/v1.1.0.0/Web";
    
    //SIT
    this.appId = "3cb5e3f7fb1b45a690ec7fc992184b53";
    this.apiKey = "Np7eimWRZFjzfCDtO/iYSWzCYBFeP0PmpiaG5PSCqdk=";
    this.apiBaseUrl =  "https://sit.myduitnow.com/v1.1.0.0/Web";
    

    // Service control
    this.serviceRunning = false;
    this.serviceInterval = null;
    this.CONTROL_DOC_ID = 'payment_service_control';
    this.lastInvoiceNo = null;
  
    
    // Initialize ticket service
    this.ticketService = new TicketRouter();
    
    // Initialize the service controller
    this.initServiceController();
  }

  initializeRoutes() {
    this.router.get('/about', this.about.bind(this));
    this.router.post('/callback', this.callback.bind(this));
    this.router.post('/payment/create', this.create.bind(this));
    
    // Add new endpoints for service control
    this.router.post('/service/start', this.startService.bind(this));
    this.router.post('/service/stop', this.stopService.bind(this));
    this.router.post('/service/checkstatus', this.getServiceStatus.bind(this));
    
    // New endpoint for saving order data
    this.router.post('/order/save', this.handleOrderSave.bind(this));
  }

  // Initialize the service controller document in database
  async initServiceController() {
    try {
      // We'll initialize service control during startService since we need storeId
      console.log('Service controller will be initialized during service start');
    } catch (error) {
      console.error('Error initializing service controller:', error);
    }
  }

  // Start the payment service
  async startService(req, res) {
    try {
      
      
      // if (!orderId || !storeId) {
      //   return res.status(400).json({ success: false, error: 'Missing orderId or storeId' });
      // }

      const requiredParams = [ 'storeId', 'orderId', 'BankCode', 'MerchantCode', 'OutletCode', 'Terminal', 'Amount', 'DeviceNo'];
      for (const param of requiredParams) {
        if (!req.body[param]) {
          return res.status(400).json({ error: `Missing required parameter: ${param}` });
        }
      }

      const { orderId, storeId, BankCode, MerchantCode, OutletCode, Terminal, InvoiceNo, Amount, DeviceNo } = req.body;

      // Check if BankCode is RHB
      if (req.body.BankCode !== 'RHB') {
        return res.status(400).json({ error: 'BankCode must be RHB' });
      }



      // Verify order exists in rhb_temp
      const orderRef = fireStore.collection("store").doc(storeId)
        .collection('rhb_temp').doc(orderId);
      const orderDoc = await orderRef.get();

      if (!orderDoc.exists) {
        return res.status(404).json({ success: false, error: 'Order not found in temp' });
      }

      // Check if control doc exists and create if needed
      const controlDocRef = fireStore.collection('duitnow_rhb').doc(storeId)
        .collection("control").doc(this.CONTROL_DOC_ID);
      const controlDoc = await controlDocRef.get();
      
      if (!controlDoc.exists) {
        // Create the control document if it doesn't exist
        //const { orderId, storeId, BankCode, MerchantCode, OutletCode, Terminal, InvoiceNo, Amount, DeviceNo } = req.body;

        await controlDocRef.set({
          controlFlag: false,
          isRunning: false,
          lastRunTime: new Date(),
          runCount: 0,
          status: 'initialized',
          createCount: 0,
          callbackCount: 0,
          timeoutCount: 0,

          // BankCode: BankCode,
          // MerchantCode: MerchantCode,
          // OutletCode: OutletCode,
          // Terminal: Terminal,
          // //InvoiceNo: InvoiceNo,
          // Amount: Amount,
          // DeviceNo: DeviceNo

        });
        console.log(`Service controller initialized for store ${storeId}`);
      }

      // Set up a listener for this specific store's control document
      if (!this.unsubscribeControlListener) {
        this.unsubscribeControlListener = controlDocRef.onSnapshot((doc) => {
          const data = doc.data();
          if (data && data.controlFlag === true && !this.serviceRunning) {
            this.startServiceLoop(storeId);
          } else if (data && data.controlFlag === false && this.serviceRunning) {
            this.stopServiceLoop(storeId);
          }
        }, (error) => {
          console.error('Error listening to control document:', error);
        });
      }

      await controlDocRef.update({
        controlFlag: true,
        status: 'starting',
        lastRunTime: new Date(),
        currentOrderId: orderId,
        currentStoreId: storeId,

        BankCode: BankCode,
          MerchantCode: MerchantCode,
          OutletCode: OutletCode,
          Terminal: Terminal,
          //InvoiceNo: InvoiceNo,
          Amount: Amount,
          DeviceNo: DeviceNo,

        orderData: orderDoc.data()
      });
      
      res.json({ success: true, message: 'Payment service is starting' });
    } catch (error) {
      console.error('Error starting service:', error);
      res.status(500).json({ success: false, error: 'Failed to start service' });
    }
  }

  // Stop the payment service
  async stopService(req, res) {
    try {
      const { orderId, storeId } = req.body;
      
      if (!orderId || !storeId) {
        return res.status(400).json({ success: false, error: 'Missing orderId or storeId' });
      }

      // Get the current control data
      const controlDocRef = fireStore.collection('duitnow_rhb').doc(storeId)
        .collection("control").doc(this.CONTROL_DOC_ID);
      const controlDoc = await controlDocRef.get();
      const controlData = controlDoc.exists ? controlDoc.data() : null;

      // Check if the order exists in rhb_temp before deleting, //NOTE: 15-April-25 no longer need to delete when stop service is triggered
      // const orderRef = fireStore.collection("store").doc(storeId)
      //   .collection('rhb_temp').doc(orderId);
      // const orderDoc = await orderRef.get();

      // if (orderDoc.exists) {
      //   // Delete the order from rhb_temp
      //   await orderRef.delete();
      //   console.log(`Order ${orderId} removed from rhb_temp for store ${storeId}`);
      // } else {
      //   console.log(`Order ${orderId} not found in rhb_temp for store ${storeId}`);
      // }

      // Update the control document
      await controlDocRef.update({
        controlFlag: false,
        status: 'stopping',
        lastRunTime: new Date(),
        // currentOrderId: null,
        // currentStoreId: null,
        // orderData: null
      });
      
      res.json({ 
        success: true, 
        message: 'Payment service is stopping'
       // orderRemoved: orderDoc.exists 
      });
    } catch (error) {
      console.error('Error stopping service:', error);
      res.status(500).json({ success: false, error: 'Failed to stop service' });
    }
  }

  // Get the current status of the payment service
  async getServiceStatus(req, res) {
    try {
      const { storeId } = req.body;
      
      if (!storeId) {
        return res.status(400).json({ success: false, error: 'Missing storeId parameter' });
      }
      
      const controlDoc = await fireStore.collection('duitnow_rhb').doc(storeId)
        .collection("control").doc(this.CONTROL_DOC_ID).get();
      
      if (controlDoc.exists) {
        const data = controlDoc.data();

        //console.log(data);
        res.json({
          isRunning: data.isRunning,
          controlFlag: data.controlFlag,
          lastRunTime: data.lastRunTime,
          status: data.status,
          runCount: data.runCount,
          createCount: data.createCount,
          callbackCount: data.callbackCount,
          timeoutCount: data.timeoutCount,
          lastInvoiceNo: data.lastInvoiceNo,
          currentOrderId: data.currentOrderId,
        currentStoreId: data.currentStoreId,
        orderData: data.orderData
        });
      } else {
        res.status(404).json({ error: 'Service control document not found for this store' });
      }
    } catch (error) {
      console.error('Error getting service status:', error);
      res.status(500).json({ error: 'Failed to get service status' });
    }
  }

  // The main service loop
  async startServiceLoop(storeId) {
    if (this.serviceRunning) return;
    
    console.log(`Starting payment service loop for store ${storeId}`);
    this.serviceRunning = true;
    this.currentStoreId = storeId;
    
    // Update database that the service is running
    await fireStore.collection('duitnow_rhb').doc(storeId)
      .collection("control").doc(this.CONTROL_DOC_ID).update({
        isRunning: true,
        status: 'running'
      });
    
    // Start the main loop
    this.runServiceIteration();
  }

  // Stop the service loop
  async stopServiceLoop(storeId) {
    if (!this.serviceRunning) return;
    
    console.log(`Stopping payment service loop for store ${storeId}`);
    this.serviceRunning = false;
    
    // Update database that the service has stopped
    await fireStore.collection('duitnow_rhb').doc(storeId)
      .collection("control").doc(this.CONTROL_DOC_ID).update({
        isRunning: false,
        status: 'stopped',
        lastRunTime: new Date()
      });

    // Cleanup the listener
    if (this.unsubscribeControlListener) {
      this.unsubscribeControlListener();
      this.unsubscribeControlListener = null;
    }
    
    this.currentStoreId = null;
  }

  /**
   * Save order data to permanent collections and optionally delete from temp
   * @param {string} storeId - The store ID
   * @param {string} originalOrderId - The original order ID from rhb_temp (also used as invoice/callback ID)
   * @param {boolean} deleteOriginal - Whether to delete the original order (default: false)
   * @returns {Promise<Object>} Result of the operation with success flag and message
   */
  async saveOrderData(storeId, originalOrderId, newOrderId, newTicketNumber = false, deleteOriginal = false) {
    try {
      // Get the callback data from duitnow_rhb
      const callbackDoc = await fireStore.collection('duitnow_rhb').doc(originalOrderId).get();
      const callbackData = callbackDoc.exists ? callbackDoc.data() : {
        type: 'manual_save',
        timestamp: new Date(),
        payload: { status: 'SUCCESS' }
      };

      
      // Get the original order from rhb_temp
      const originalOrderRef = fireStore.collection("store").doc(storeId)
        .collection('rhb_temp').doc(originalOrderId);
      const originalOrderDoc = await originalOrderRef.get();

      if (!originalOrderDoc.exists) {
        return {
          success: false,
          message: `Original order ${originalOrderId} not found in rhb_temp for store ${storeId}`
        };
      }

      var orderData = originalOrderDoc.data();

      if(newTicketNumber)
      {
         var newTicket = await this.ticketService.generateTicketWithTransaction(storeId);
        orderData.orderid = newTicket;
      }

      orderData.id = newOrderId;
      
      orderData.ePaymentDetail = {
        ...callbackData,
        originalOrderId: originalOrderId
      }
      
      // Save to today_order collection
      console.log("saving to today_order and order collection " + storeId + " " + newOrderId);
      console.log(orderData);
      await fireStore.collection("store").doc(storeId)
        .collection('today_order').doc(newOrderId)
        .set({
          ...orderData,
          
        });

      // Save to order collection
      await fireStore.collection("store").doc(storeId)
        .collection('order').doc(newOrderId)
        .set({
          ...orderData,
        
        });

      // Delete from rhb_temp if requested
      if (deleteOriginal) {
        await originalOrderRef.delete();
      }
      
      console.log(`Order processed successfully: ${originalOrderId} → ${newOrderId}`);
      
      return {
        success: true,
        message: `Order processed successfully: ${originalOrderId} → ${newOrderId}`,
        orderData: orderData,
        newOrderId: newOrderId
      };
    } catch (error) {
      console.error('Error saving order data:', error);
      return {
        success: false,
        message: `Error saving order data: ${error.message}`,
        error: error
      };
    }
  }

  // Single iteration of the service
  async runServiceIteration() {
    if (!this.serviceRunning || !this.currentStoreId) return;
    
    try {
      // Get the control document
      const controlDoc = await fireStore.collection('duitnow_rhb').doc(this.currentStoreId)
        .collection("control").doc(this.CONTROL_DOC_ID).get();
      const controlData = controlDoc.exists ? controlDoc.data() : null;
      
      // Check if we should still be running
      if (!controlData || !controlData.controlFlag) {
        await this.stopServiceLoop(this.currentStoreId);
        return;
      }

      const { currentOrderId, currentStoreId, orderData } = controlData;
      if (!currentOrderId || !currentStoreId || !orderData) {
        console.error('Missing order information in control document');
        await this.stopServiceLoop(this.currentStoreId);
        return;
      }
      
      // Update the run count and time
      await fireStore.collection('duitnow_rhb').doc(this.currentStoreId)
        .collection("control").doc(this.CONTROL_DOC_ID).update({
          runCount: (controlData.runCount || 0) + 1,
          lastRunTime: new Date(),
          status: 'processing'
        });
      
      // Get a new ticket ID from the ticket service
      var newOrderId = '';
      
        // Use the ticket service's transactional function directly
        //newOrderId = await this.ticketService.generateTicketWithTransaction(currentStoreId);
         const v4Id = uuidv4();
          newOrderId = "O_" + v4Id;
          console.log(`Generated new order ID: ${newOrderId}`);
     
      
      this.lastInvoiceNo = newOrderId;
      
      // Call the payment/create endpoint
      //const { orderId, storeId, BankCode, MerchantCode, OutletCode, Terminal, InvoiceNo, Amount, DeviceNo } = req.body;
      const paymentData = {
        BankCode: "RHB",
        MerchantCode: controlData.MerchantCode ?? "", //"B0001",
        OutletCode: controlData.OutletCode ?? "", // "B000196",
        Terminal:  controlData.Terminal ?? "", // "ServiceLoop",
        InvoiceNo: this.lastInvoiceNo,
        Amount: controlData.Amount || 1.00,
        DeviceNo: controlData.DeviceNo ?? "", // "ServiceLoop",
      };


      //console.log(controlData);
      console.log(`Service loop: Creating payment with invoice/order id ${this.lastInvoiceNo}`);
      //console.log(paymentData);
      
      // Trigger the payment creation
      const url = `${this.apiBaseUrl}/Payment/Create`;
      const hmacKey = this.generateHmacAuth(url, 'POST');
      
      // Send the payment request
      const response = await axios({
        method: 'POST',
        url: url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': hmacKey
        },
        data: paymentData,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false
        })
      });
      
      // Update the create count and store new order ID
      await fireStore.collection('duitnow_rhb').doc(this.currentStoreId)
        .collection("control").doc(this.CONTROL_DOC_ID).update({
          createCount: (controlData.createCount || 0) + 1,
          status: 'waiting_for_callback',
          newOrderId
        });
      
      // Save the payment request
      await fireStore.collection('duitnow_rhb').doc(this.lastInvoiceNo).set({
        type: 'payment_request',
        payload: paymentData,
        response: response.data,
        timestamp: new Date(),
        status: 'waiting_for_callback',
        originalOrderId: currentOrderId,
        storeId: currentStoreId,
        newOrderId
      });
      
      // Wait for callback or timeout
      const callbackReceived = await this.waitForCallback(this.lastInvoiceNo, 90000); // 90 seconds
      
      if (callbackReceived) {
        console.log(`Service loop: Callback received for invoice ${this.lastInvoiceNo}`);
        
        try {
          // Use the simplified saveOrderData function
          const saveResult = await this.saveOrderData(
            currentStoreId,
            currentOrderId,
            this.lastInvoiceNo, 
            true,// The lastInvoiceNo is used as the callback document ID
            false // Don't delete the original order for now
          );
          
          if (!saveResult.success) {
            console.error('Failed to save order data:', saveResult.message);
          }
        } catch (error) {
          console.error('Error processing order after callback:', error);
        }
        
        await fireStore.collection('duitnow_rhb').doc(currentStoreId)
          .collection("control").doc(this.CONTROL_DOC_ID).update({
            callbackCount: (controlData.callbackCount || 0) + 1,
            status: 'callback_received'
          });
      } else {
        console.log(`Service loop: Timeout waiting for callback for invoice ${this.lastInvoiceNo}`);
        await fireStore.collection('duitnow_rhb').doc(currentStoreId)
          .collection("control").doc(this.CONTROL_DOC_ID).update({
            timeoutCount: (controlData.timeoutCount || 0) + 1,
            status: 'timeout'
          });
      }
      
      // Schedule the next iteration
      if (this.serviceRunning) {
        setTimeout(() => this.runServiceIteration(), 5000); // 5 second pause between iterations
      }
    } catch (error) {
      console.error('Error in service iteration:', error);
      
      // Update the error status in database
      if (this.currentStoreId) {
        await fireStore.collection('duitnow_rhb').doc(this.currentStoreId)
          .collection("control").doc(this.CONTROL_DOC_ID).update({
            status: `error: ${error.message}`,
            lastRunTime: new Date()
          });
      }
      
      // Continue the loop despite errors
      if (this.serviceRunning) {
        setTimeout(() => this.runServiceIteration(), 10000); // 10 second pause after error
      }
    }
  }

  // Wait for callback or timeout
  async waitForCallback(invoiceNo, timeoutMs) {
    return new Promise((resolve) => {
      let timeoutId;
      let unsubscribe;
      
      // Set a timeout
      timeoutId = setTimeout(() => {
        if (unsubscribe) unsubscribe();
        resolve(false); // Timeout occurred
      }, timeoutMs);
      
      // Listen for changes to the document
      unsubscribe = fireStore.collection('duitnow_rhb').doc(invoiceNo)
        .onSnapshot((doc) => {
          const data = doc.data();
          if (data && data.type === 'callback') {
            // Callback received
            clearTimeout(timeoutId);
            unsubscribe();
            resolve(true);
          }
        }, (error) => {
          console.error(`Error listening for callback for invoice ${invoiceNo}:`, error);
          clearTimeout(timeoutId);
          unsubscribe();
          resolve(false);
        });
    });
  }

  about(req, res) {
    res.json({ version: '1.0.0' });
  }

  async callback(req, res) {
    try {
      // Log the incoming callback data
      console.log('Callback received:', req.body);
      
      // Create a data object to store in database
      const callbackData = {
        type: 'callback',
        payload: req.body,
        headers: req.headers,
        timestamp: new Date(),
        ip: req.ip || req.connection.remoteAddress
      };
      
      // Save to Firestore
      if (req.body && req.body.InvoiceNo) {
        // Save callback data to duitnow_rhb collection
        await fireStore.collection('duitnow_rhb').doc(req.body.InvoiceNo).set(callbackData);
        console.log('Callback data saved to Firestore with invoice ID:', req.body.InvoiceNo);
      } else {
        console.log("unable to save callback data to firestore, invoiceNo not found");
      }
      
      // Return HTTP status 200 with blank response body
      res.status(200).send();
    } catch (error) {
      console.error('Error processing callback:', error);
      // Still return success to the client even if processing fails
      res.status(200).send();
    }
  }


  async create(req, res) {
    try {
      // Log the incoming request
      console.log('Payment creation request:', req.body);
      
      // Validate required parameters
      const requiredParams = ['BankCode', 'MerchantCode', 'OutletCode', 'Terminal', 'InvoiceNo', 'Amount'];
      for (const param of requiredParams) {
        if (!req.body[param]) {
          return res.status(400).json({ error: `Missing required parameter: ${param}` });
        }
      }
      
      // Check if BankCode is RHB
      if (req.body.BankCode !== 'RHB') {
        return res.status(400).json({ error: 'BankCode must be RHB' });
      }
      
      // Prepare to forward request to DuitNow API
      const url = `${this.apiBaseUrl}/Payment/Create`;
      const hmacKey = this.generateHmacAuth(url, 'POST');
      console.log(hmacKey);
      console.log('Forwarding request to DuitNow API:', url);
      console.log('Request payload:', req.body);
      
      // Forward request to DuitNow API using axios
      const response = await axios({
        method: 'POST',
        url: url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': hmacKey
        },
        data: req.body,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false
        })
      });
      
      // Get response data (axios automatically parses JSON)
      const responseData = response.data;
      console.log('DuitNow API response:', responseData);
      
      // Return the response from DuitNow API
      return res.json(responseData);
    } catch (error) {
      console.error('Error in create payment:', error.message);
      
      // Handle axios error responses
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('DuitNow API error status:', error.response.status);
        console.error('DuitNow API error data:', error.response.data);
        return res.status(error.response.status).json(error.response.data || { error: 'Error calling DuitNow API' });
      } else if (error.request) {
        // The request was made but no response was received
        console.error('No response received from DuitNow API');
        return res.status(503).json({ error: 'No response from DuitNow API' });
      } else {
        // Something happened in setting up the request that triggered an Error
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  }
  
  // Helper method to generate HMAC authentication
  generateHmacAuth(url, method) {
    const hmacPrefix = "HMAC";
    const requestURI = encodeURIComponent(url);
    const requestMethod = method;
    const requestTimeStamp = Math.floor(Date.now() / 1000);
    const nonce = this.generateRandomString(10);
    
    const signatureRawData = this.appId + requestMethod + requestURI.toLowerCase() + requestTimeStamp + nonce;
    
    const hmac = crypto.createHmac('sha256', Buffer.from(this.apiKey, 'base64'));
    hmac.update(signatureRawData);
    const requestSignatureBase64String = hmac.digest('base64');
    
    const hmacKey = hmacPrefix + " " + this.appId + ":" + requestSignatureBase64String + ":" + nonce + ":" + requestTimeStamp;
    
    return hmacKey;
  }
  
  // Helper method to generate random string
  generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }

  getRouter() {
    return this.router;
  }

  /**
   * API endpoint to save order data
   * Accepts storeId, originalOrderId in request body
   */
  async handleOrderSave(req, res) {
    try {
      const { storeId, originalOrderId, newOrderId, newTicket, deleteOriginal } = req.body;
      
      // Validate required parameters
      if (!storeId || !originalOrderId || !newOrderId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Missing required parameters: storeId ,originalOrderId, newOrderId are required' 
        });
      }
      
      // Call the simplified save function with just storeId and originalOrderId
      const result = await this.saveOrderData(
        storeId,
        originalOrderId,
        newOrderId,
        !!newTicket,
        !!deleteOriginal // Convert to boolean
      );
      
      return res.json(result);
    } catch (error) {
      console.error('Error in order save endpoint:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
}

module.exports = RHBRouter; 