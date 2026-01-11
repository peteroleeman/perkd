const express = require('express');
const crypto = require('crypto');
const UtilFeie = require("./feie/util_feie");
const OrderModel = require("./models/OrderModel");
const OrderItemModel = require("./models/OrderItemModel");
const firebase = require("./db");
const fireStore = firebase.firestore();
const { v4: uuidv4 } = require('uuid');

/**
 * Format date to YYYY-MM-DD HH:mm:ss.SSS format
 * @param {Date} date - Date object (defaults to now)
 * @returns {string} Formatted date string
 */
function formatOrderDateTime(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

class PosRouter {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  //SECTION router
  initializeRoutes() {
    this.router.get('/about', function(req, res) {
     res.json({ message: 'Endpoint for POS integration v1.0'});
    });

    // Add printOrderSlipEx endpoints
    this.router.post('/kdsorderslipex', this.handlePrintOrderSlipExCN.bind(this));
    this.router.post('/kdsorderslipexap', this.handlePrintOrderSlipExJP.bind(this));
    
    // Add label printing endpoint
    this.router.post('/printlabelap', this.handlePrintLabel.bind(this));
    
    // Add e-invoice endpoint
    this.router.post('/einvoice', this.handleEInvoice.bind(this));
  }

  generateEncryptedToken() {
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

  async handlePrintOrderSlipExCN(req, res) {
    return this.printOrderSlipEx(req, res, false);
  }

  async handlePrintOrderSlipExJP(req, res) {
    return this.printOrderSlipEx(req, res, true);
  }

  async handlePrintLabel(req, res) {
    return this.printLabel(req, res);
  }

  /**
   * Function to add spaces between two strings for alignment in label printing
   * @param {string} strLeft - Left side string
   * @param {string} length - Max characters in a line
   * @returns {string} - Left string with spaces
   */
  leftRight(strLeft, length) {
    if (!strLeft || !length) return '';
    
    // For simplicity, assuming each Chinese character takes 2 spaces
    // This is a simple approximation of what the PHP function does
    let spacesNeeded = length - this.getStringWidth(strLeft);
    let spaces = '';
    
    for (let i = 0; i < spacesNeeded; i++) {
      spaces += ' ';
    }
    
    return strLeft + spaces;
  }
  
  /**
   * Calculate approximate width of a string (Chinese chars count as 2)
   * @param {string} str - Input string
   * @returns {number} - Approximate width
   */
  getStringWidth(str) {
    let width = 0;
    for (let i = 0; i < str.length; i++) {
      // Check if character is a Chinese character (very simplistic check)
      if (str.charCodeAt(i) > 127) {
        width += 2;
      } else {
        width += 1;
      }
    }
    return width;
  }

  /**
   * Print labels for order items
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async printLabel(req, res) {
    const feie = new UtilFeie();
    
    // Validate the request body
    if (!req.body) {
      return res.status(400).json({ error: 'Request body is missing or empty' });
    }

    const requiredFields = ['sn', 'orderId', 'tableId', 'orderItems'];
    for (const field of requiredFields) {
      if (!(field in req.body)) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    if (!Array.isArray(req.body.orderItems)) {
      return res.status(400).json({ error: 'orderItems must be an array' });
    }

    try {
      const { sn, orderId, tableId, orderItems, remark = "", name = "", phone = "" } = req.body;
      const totalItems = orderItems.length;
      const results = [];

      // Process each item in the order
      for (let i = 0; i < totalItems; i++) {
        const item = orderItems[i];
        const itemPosition = `${i+1}/${totalItems}`;
        
        // Create label content with TEXT tags (similar to the PHP example)
        let content = `<TEXT x="9" y="10" font="12" w="1" h="2" r="0">#${orderId}       ${tableId}      ${itemPosition}</TEXT>`;
        content += `<TEXT x="9" y="80" font="12" w="1" h="2" r="0">${item.title}</TEXT>`;
        
        // Process item remark - handle both string and array formats
        let itemRemarks = [];
        
        if (item.remark) {
          if (Array.isArray(item.remark)) {
            // Handle array of remark objects
            const remarkTexts = item.remark
              .filter(remarkObj => remarkObj && remarkObj.remark) // Filter out invalid objects
              .map(remarkObj => remarkObj.remark.trim()) // Extract remark text and trim
              .filter(text => text.length > 0); // Filter out empty strings
            
            itemRemarks = remarkTexts;
          } else if (typeof item.remark === 'string') {
            // Handle string remark
            const trimmedRemark = item.remark.trim();
            if (trimmedRemark) {
              itemRemarks = [trimmedRemark];
            }
          }
        }
        
        // Use global remark if item remark is empty
        if (itemRemarks.length === 0 && remark) {
          itemRemarks = [remark];
        }
        
        // Add remark fields below the title - each remark on a separate line
        let yPosition = 140; // Starting y position for remarks
        const lineHeight = 30; // Height between lines
        
        for (let j = 0; j < itemRemarks.length; j++) {
          content += `<TEXT x="9" y="${yPosition}" font="12" w="1" h="1" r="0">*: ${itemRemarks[j]}</TEXT>`;
          yPosition += lineHeight; // Move to next line
        }
        
        // Adjust contact info position based on number of remarks
        const contactYPosition = yPosition + 10; // Add some spacing after remarks
        
        // Add customer name and phone at the bottom if provided
        if (name || phone) {
          let contactInfo = "";
          if (name) {
            contactInfo += `${name}`;
          }
          if (phone) {
            if (contactInfo) {
              contactInfo += "       "; // Add spacing between name and phone
            }
            contactInfo += phone;
          }
          
          if (contactInfo) {
            content += `<TEXT x="9" y="${contactYPosition}" font="12" w="1" h="1" r="0">${contactInfo}</TEXT>`;
          }
        }
        
        // Print the label
        const printResult = await feie.printLabel(sn, content, 1, true);
        results.push({
          item: item.title,
          position: itemPosition,
          remark: itemRemarks.join(', '), // Keep as joined string for response
          remarkCount: itemRemarks.length,
          result: printResult
        });
      }
      
      res.json({ 
        message: 'Labels printed successfully', 
        orderId,
        tableId,
        itemsProcessed: totalItems,
        results
      });
    }
    catch(ex) {
      console.log(ex);
      res.status(500).json({ error: ex.toString() });
    }
  }

  //type 0 is small width, 1 is large width
  async printOrderSlipEx(req, res, isJP) {
    const feie = new UtilFeie();

    // Check if the token matches the valid token (replace this with your token validation logic)
   
    // Validate the request body
    if (!req.body) {
      res.status(400).json({ error: 'Request body is missing or empty' });
      return;
    }

    const requiredFields = ['sn', 'orderId', 'orderItems', 'type', 'isReprint'];
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

    try {
      let feieOrder = feie.createFeieOrderSlipFromJSON(req.body);
      let feieResult = await feie.printFeie2(feieOrder.sn, feie.printOrderItemSlipPOS(feieOrder, req.body.isReprint, req.body.type), isJP);
      
      res.json({ message: feieResult });
    }
    catch(ex) {
      console.log(ex);
      res.status(401).json({ error: ex });
    }
  }

  /**
   * Handle e-invoice submission
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async handleEInvoice(req, res) {
    try {
      // Validate the request body
      if (!req.body) {
        return res.status(400).json({ 
          success: false,
          message: 'Request body is missing or empty' 
        });
      }

      const { receipt_id, amount, currency, device_number, list, merchant_id } = req.body;

      // Validate required fields
      if (!receipt_id || !currency || !device_number || !list || !merchant_id) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields. Please provide receipt_id, amount, currency, device_number, list, and merchant_id'
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
      const requiredItemFields = ['goods_count', 'goods_description', 'goods_id', 'goods_name', 
                                'goods_photo', 'goods_price', 'goods_sku'];
      for (const item of list) {
        const missingFields = requiredItemFields.filter(field => item[field] == null);
        if (missingFields.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Missing required fields in list item: ${missingFields.join(', ')}`
          });
        }
      }

      // Calculate totals and generate ID
      const subtotal = list.reduce((sum, item) => sum + (item.goods_count * item.goods_price), 0);
      const grandTotal = parseFloat(amount || subtotal) || 0;
      const id = "O_" + uuidv4();

      // Query vending_merchant collection to get store information
      console.log("Querying vending_merchant for merchant_id:" + merchant_id + " device number:" + device_number);
      
      const merchantRef = fireStore.collection('vending_merchant').doc(merchant_id);
      const merchantDoc = await merchantRef.get();
      var storeId = "S_eeb1c111-2df6-4ecc-a66f-202e5b9a38cf"
      var storeTitle = "Fudmart";
      if (!merchantDoc.exists) {
        console.error("Merchant not found, use default", merchant_id);
//        return res.status(404).json({
//          success: false,
//          message: `Merchant with ID ${merchant_id} not found`
//        });
      }
      else
      {
        const merchantData = merchantDoc.data();
         storeId = merchantData.storeid;
         storeTitle = merchantData.title || "Unknown Store";
      }


      if (!storeId) {
        console.error("Store ID not found for merchant:", merchant_id);
        return res.status(400).json({
          success: false,
          message: `Store ID not found for merchant ${merchant_id}`
        });
      }

      console.log("Found store ID:", storeId);

      // Look up machine model from merchant_device collection using fridgemid
      // device_number parameter is actually the fridge mid
      let vendingDeviceNumber = device_number;
      let vendingMerchantId = merchant_id;
      
      try {
        console.log("Querying merchant_device for fridgemid:", device_number);
        
        // Query merchant_device collection where fridgemid matches device_number
        const machineModelQuery = await fireStore
          .collection('merchant_device')
          .where('fridgemid', '==', device_number)
          .limit(1)
          .get();

        if (!machineModelQuery.empty) {
          const machineModelDoc = machineModelQuery.docs[0];
          const machineModel = machineModelDoc.data();
          console.log("Machine model found:", machineModel.id);
          
          // Extract vendingdevicenumber and vendingmerchantid from machine model
          if (machineModel.vendingdevicenumber) {
            vendingDeviceNumber = machineModel.vendingdevicenumber;
            console.log("Using vendingdevicenumber from machine model:", vendingDeviceNumber);
          }
          if (machineModel.vendingmerchantid) {
            vendingMerchantId = machineModel.vendingmerchantid;
            console.log("Using vendingmerchantid from machine model:", vendingMerchantId);
          }
        } else {
          console.log("Machine model not found in merchant_device with fridgemid:", device_number, "- using original device_number and merchant_id");
        }
      } catch (machineModelError) {
        console.error("Error querying merchant_device:", machineModelError);
        // Continue with original values if lookup fails
      }

      // Save order data directly to Firestore
      const orderDocRef = fireStore
        .collection('myinvois')
        .doc(storeId)
        .collection('order')
        .doc(id);

      // Calculate order items first
      const orderitems = list.map(item => ({
        id: item.goods_id,
        sku: item.goods_sku,
        title: item.goods_name,
        quantity: item.goods_count,
        price: item.goods_price,
        discount_amount: 0,
        total_price: item.goods_count * item.goods_price
      }));

      // Calculate totalQty (sum of all item quantities) - integer
      const totalQty = orderitems.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
      
      // Calculate totalPrice (use grandTotal) - double
      const totalPrice = parseFloat(grandTotal.toFixed(2));
      
      // Calculate totalPaid (use totalPrice as default) - double
      const totalPaid = totalPrice;

      // Create order data directly as plain object for Firestore
      const orderData = {
        id: id,
        orderid: receipt_id,
        storetitle: storeTitle,
        store_merchant_code: merchant_id,
        orderdatetime: formatOrderDateTime(),
        payment_type: "E-Invoice",
        subtotal: subtotal,
        grand_total: grandTotal,
        mode: "einvoice",
        kiosk_machine: vendingDeviceNumber,
        customer_payment: grandTotal,
        currency: currency,
        // device_number: vendingDeviceNumber,
        // merchant_id: vendingMerchantId,
        devicenumber: vendingDeviceNumber,
        merchantid: vendingMerchantId,
        store_id: storeId,
        totalqty: totalQty,
        totalprice: totalPrice,
        totalpaid: totalPaid,
        orderitems: orderitems,
        created_at: new Date()
      };

      console.log(orderData);
      await orderDocRef.set(orderData);

      console.log(`OrderModel saved to Firestore: myinvois/${storeId}/order/${id}`);

      // Also save order data to myreport collection
      try {
        const myReportDocRef = fireStore
          .collection('myreport')
          .doc(storeId)
          .collection('order')
          .doc(id);
        
        await myReportDocRef.set(orderData);
        console.log(`OrderModel saved to Firestore: myreport/${storeId}/order/${id}`);
      } catch (myReportError) {
        console.error('Error saving to myreport collection:', myReportError);
        // Don't fail the request if myreport save fails
      }

      // Also save order data to store collection
      // try {
      //   const myReportDocRef = fireStore
      //     .collection('store')
      //     .doc(storeId)
      //     .collection('order')
      //     .doc(id);
        
      //   await myReportDocRef.set(orderData);
      //   console.log(`OrderModel saved to Firestore: myreport/${storeId}/order/${id}`);
      // } catch (myReportError) {
      //   console.error('Error saving to myreport collection:', myReportError);
      //   // Don't fail the request if myreport save fails
      // }

      // Save to vending_points collection
      try {
        // Calculate points from grand total (1 dollar = 10 points)
        const points = Math.floor(grandTotal * 10);
        
        // Use order ID as document ID
        const documentId = id;
        
        console.log('💾 [VENDING_POINTS] Saving pending points for:', documentId);
        console.log('💾 [VENDING_POINTS] Points:', points, 'Order ID:', id, 'Store ID:', storeId);

        // Prepare pending points document with order and pickup code data
        const pendingPointsData = {
          points: points,
          orderId: id,
          storeId: storeId,
          createdAt: new Date().toISOString(),
          orderData: orderData, // Store order data for later copying
        };

        // Check if order has pickup code data
        if (orderData.pickupcode || orderData.pickupCode || (orderData.merchantid && orderData.devicenumber)) {
          const pickupDocId = `${orderData.merchantid}_${orderData.devicenumber}`;
          pendingPointsData.pickupDocId = pickupDocId;
          pendingPointsData.pickupData = orderData; // Store pickup data for later copying
          console.log('📦 [VENDING_POINTS] Pickup code data found, doc ID:', pickupDocId);
        }

        // Save pending points document
        await fireStore.collection('vending_points').doc(documentId).set(pendingPointsData);
        console.log('✅ [VENDING_POINTS] Pending points saved to:', documentId);

        // Save order to vending_points subcollection
        await fireStore
          .collection('vending_points')
          .doc(documentId)
          .collection('order')
          .doc(id)
          .set(orderData);
        console.log('✅ [VENDING_POINTS] Order saved to vending_points subcollection');
      } catch (pendingPointsError) {
        console.error('❌ [VENDING_POINTS] Error saving pending points:', pendingPointsError);
        // Don't fail the request if pending points save fails
      }

      // Return success response with URL
      res.json({ 
        success: true,
        message: `https://myeinvois.com.my/#/${storeId}/${id}`
      });

    } catch (error) {
      console.error('Error processing e-invoice:', error);
      res.status(500).json({ 
        success: false,
        message: `Internal server error while processing e-invoice: ${error.message}`
      });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = PosRouter; 