const express = require('express');
const crypto = require('crypto');
const UtilFeie = require("./feie/util_feie");

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
        content += `<TEXT x="80" y="80" font="12" w="2" h="2" r="0">${item.title}</TEXT>`;
        
        // Add remark field below the title
        // First check if this item has its own remark, otherwise use the global remark
        const itemRemark = item.remark || remark;
        if (itemRemark) {
          content += `<TEXT x="9" y="140" font="12" w="1" h="1" r="0">*: ${itemRemark}</TEXT>`;
        }
        
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
            content += `<TEXT x="9" y="180" font="12" w="1" h="1" r="0">${contactInfo}</TEXT>`;
          }
        }
        
        // Print the label
        const printResult = await feie.printLabel(sn, content, 1, true);
        results.push({
          item: item.title,
          position: itemPosition,
          remark: itemRemark,
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

  getRouter() {
    return this.router;
  }
}

module.exports = PosRouter; 