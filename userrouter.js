const express = require('express');
const { BigQuery } = require('@google-cloud/bigquery');
const firebase = require("./db");
const fireStore = firebase.firestore();
const GKashRouter = require("./gkashrouter");
const { UserModel } = require('./models/UserModel');
const { CreateNewOrder } = require('./models/OrderModel');

class UserRouter {

  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
    this.bigquery = this.initializeBigQuery();
    this.gkashRouter = new GKashRouter();
  }

  /**
   * Initialize BigQuery client with proper authentication
   */
  initializeBigQuery() {
    try {
      // Option 1: Use environment variable for service account key (recommended)
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        return new BigQuery({
          projectId: 'foodio-ab3b2',
          keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
        });
      }
      
      // Option 2: Use service account key from environment variable (JSON string)
      if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        return new BigQuery({
          projectId: 'foodio-ab3b2',
          credentials: credentials
        });
      }
      
      // Option 3: Use Application Default Credentials (for Cloud Run/GCE)
      return new BigQuery({
        projectId: 'foodio-ab3b2'
      });
      
    } catch (error) {
      console.error('Error initializing BigQuery client:', error);
      throw error;
    }
  }

  initializeRoutes() {
    this.router.get('/about', this.about.bind(this));
    this.router.post('/querybigquery', this.queryBigQuery.bind(this));
    this.router.post('/queryrawdata', this.queryRawData.bind(this));
    this.router.post('/querybigqueryo', this.queryBigQueryO.bind(this));
    this.router.post('/queryrawdatao', this.queryRawDataO.bind(this));
    this.router.post('/checkuser',this.checkUser.bind(this));
    this.router.post('/addloyaltypoints', this.validateBearerToken.bind(this), this.addLoyaltyPoints.bind(this));
    this.router.post('/generatetoken', this.generateToken.bind(this));

    // Pending points endpoints - reusing GKashRouter handlers
    this.router.post('/savependingpoints', this.validateBearerToken.bind(this), (req, res) => this.gkashRouter.handleSavePendingPoints(req, res));
    
    this.router.post('/claimpendingpoints', this.validateBearerToken.bind(this), (req, res) => {
        // Derive userId from phoneNumber if missing
        if (!req.body.userId && req.body.phoneNumber) {
            req.body.userId = `FU_${req.body.phoneNumber.trim()}`;
        }
        return this.gkashRouter.handleClaimPendingPoints(req, res);
    });

    this.router.post('/deletependingpoints', this.validateBearerToken.bind(this), (req, res) => {
        // Derive userId from phoneNumber if missing
        if (!req.body.userId && req.body.phoneNumber) {
            req.body.userId = `FU_${req.body.phoneNumber.trim()}`;
        }
        
        // Adapt body.userId to params.userId as expected by GKashRouter's handler
        if (req.body.userId && !req.params.userId) {
            req.params.userId = req.body.userId;
        }
        return this.gkashRouter.handleDeletePendingPoints(req, res);
    });
  }

  /**
   * Middleware to validate bearer token for sensitive endpoints.
   * Token can be sent via Authorization header (Bearer <token>) or body parameter (verificationToken or token).
   * The token is generated as: SHA256(hex(storeId + phoneNumber))
   */
  validateBearerToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const { storeId, phoneNumber, verificationToken, token } = req.body || {};
    const crypto = require('crypto-js');

    if (!storeId || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Store ID and Phone Number are required in request body'
      });
    }

    const input = storeId + phoneNumber;
    const hexInput = crypto.enc.Hex.stringify(crypto.enc.Utf8.parse(input));
    const expectedToken = crypto.SHA256(hexInput).toString();

    const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const tokenFromBody = verificationToken || token || null;
    const providedToken = tokenFromHeader || tokenFromBody;

    if (!providedToken || providedToken !== expectedToken) {
      console.warn(`Unauthorized access attempt to ${req.originalUrl} from ${req.ip} with storeId: ${storeId}`);
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid token for the given store and phone number'
      });
    }
    next();
  }

  /**
   * Generates a token based on storeId and phoneNumber
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  generateToken(req, res) {
    const { storeId, phoneNumber } = req.body;
    const crypto = require('crypto-js');

    if (!storeId || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Store ID and Phone Number are required'
      });
    }

    const input = storeId + phoneNumber;
    const hexInput = crypto.enc.Hex.stringify(crypto.enc.Utf8.parse(input));
    const token = crypto.SHA256(hexInput).toString();

    return res.status(200).json({
      success: true,
      token: token
    });
  }

  about(req, res) {
    res.json({ version: '1.0.0', service: 'User API' });
  }

  /**
   * Query BigQuery to get user raw data with pagination support
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
 async queryBigQuery(req, res) {
  try {
    // Extract pagination parameters from request body
    const limit = parseInt(req.body.limit) || 100; // Default to 100 records
    const offset = parseInt(req.body.offset) || 0; // Default to starting from the beginning
    const userid = req.body.userid || null; // Get the userId filter
    
    // Build the WHERE clause for filtering
    let whereClause = 'WHERE operation != \'DELETE\' AND document_id LIKE \'FU_%\'';
//    if (userid) {
//      // Create a pattern to match the userId in the document_name
//      whereClause += ` AND document_name LIKE '%/user/${userid}/%'`;
//    }
    if (userid) {
        // Create a pattern to match the userId in the document_name
        whereClause = `WHERE operation != 'DELETE' AND document_name LIKE '%/user/FU_${userid}/%'`;
      }

    // Build query with pagination and filtering
    const query = `
      SELECT * 
      FROM \`foodio-ab3b2.firestore_user.users_raw_latest\`
      ${whereClause}
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Get total count in a separate query (for first page only)
    let totalCount = null;
    if (offset === 0) {
      const countQuery = `
        SELECT COUNT(*) as total_count 
        FROM \`foodio-ab3b2.firestore_user.users_raw_latest\`
        ${whereClause}
      `;
      
      const [countRows] = await this.bigquery.query({ query: countQuery });
      totalCount = countRows[0].total_count;
    }

    // Set query options
    const options = {
      query: query,
      location: 'asia-southeast1', // Set the appropriate location
      useQueryCache: true
    };

    // Run the main query
    const [rows] = await this.bigquery.query(options);

    console.log(`Successfully queried BigQuery for users, retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${userid ? ', filtered by userId: ' + userid : ''})`);

    return res.status(200).json({
      success: true,
      count: rows.length,
      total: totalCount,
      offset: offset,
      limit: limit,
      userId: userid,
      hasMore: rows.length === limit, // Indicate if there might be more records
      nextOffset: offset + limit, // Provide the next offset for pagination
      data: rows
    });
    
  } catch (error) {
    console.error('Error querying BigQuery for users:', error.message);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to query BigQuery for users',
      error: error.message
    });
  }
}

  /**
   * Query BigQuery and return only the parsed data field for users
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async queryRawData(req, res) {
    try {
      // Extract pagination parameters from request body
      const limit = parseInt(req.body.limit) || 100; // Default to 100 records
      const offset = parseInt(req.body.offset) || 0; // Default to starting from the beginning
      const userid = req.body.userid || null; // Get the userId filter

      // Build the WHERE clause for filtering
      let whereClause = 'WHERE operation != \'DELETE\' AND document_id LIKE \'FU_%\'';
      if (userid) {
        // Create a pattern to match the userId in the document_name
        whereClause = `WHERE operation != 'DELETE' AND document_name LIKE '%/user/FU_${userid}/%'`;
      }


      // Enhanced query to get the latest records based on timestamp
      // Using a subquery with window functions to rank records by timestamp
      const query = `
        WITH RankedRecords AS (
          SELECT 
            document_id, 
            data,
            timestamp,
            ROW_NUMBER() OVER(PARTITION BY document_id ORDER BY timestamp DESC) as row_num
          FROM \`foodio-ab3b2.firestore_user.users_raw_latest\`
          ${whereClause}
        )
        SELECT document_id, data
        FROM RankedRecords
        WHERE row_num = 1
        ORDER BY timestamp DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      // Get total count in a separate query (for first page only)
      let totalCount = null;
      if (offset === 0) {
        const countQuery = `
          WITH UniqueDocuments AS (
            SELECT document_id, MAX(timestamp) as max_timestamp
            FROM \`foodio-ab3b2.firestore_user.users_raw_latest\`
            ${whereClause}
            GROUP BY document_id
          )
          SELECT COUNT(*) as total_count 
          FROM UniqueDocuments
        `;
        
        const [countRows] = await this.bigquery.query({ query: countQuery });
        totalCount = countRows[0].total_count;
      }

      // Set query options
      const options = {
        query: query,
        location: 'asia-southeast1',
        useQueryCache: true
      };

      // Run the main query
      const [rows] = await this.bigquery.query(options);

      // Parse the data field for each row (it's stored as a JSON string)
      const parsedData = rows.map(row => {
        try {
          const dataObj = JSON.parse(row.data);
          return {
            id: row.document_id,
            ...dataObj
          };
        } catch (parseError) {
          console.error(`Error parsing data for document ${row.document_id}:`, parseError);
          return { 
            id: row.document_id,
            error: 'Failed to parse data',
            rawData: row.data
          };
        }
      });

      console.log(`Successfully queried latest user raw data, retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${userid ? ', filtered by userId: ' + userid : ''})`);

      return res.status(200).json({
        success: true,
        count: parsedData.length,
        total: totalCount,
        offset: offset,
        limit: limit,
        hasMore: rows.length === limit,
        nextOffset: offset + limit,
        data: parsedData
      });
      
    } catch (error) {
      console.error('Error querying user raw data:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to query user raw data',
        error: error.message
      });
    }
  }

  /**
   * Query BigQuery to get order raw data with pagination support (O_% documents)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
 async queryBigQueryO(req, res) {
  try {
    // Extract pagination parameters from request body
    const limit = parseInt(req.body.limit) || 100; // Default to 100 records
    const offset = parseInt(req.body.offset) || 0; // Default to starting from the beginning
    const userid = req.body.userid || null; // Get the userId filter
    
    // Build the WHERE clause for filtering
    let whereClause = 'WHERE operation != \'DELETE\' AND document_id LIKE \'O_%\'';
//    if (userid) {
//      // Create a pattern to match the userId in the document_name
//      whereClause += ` AND document_name LIKE '%/user/${userid}/%'`;
//
//    }
    if (userid) {
        // Create a pattern to match the userId in the document_name
        whereClause = `WHERE operation != 'DELETE' AND document_name LIKE '%/user/FU_${userid}/%'`;
      }

    // Build query with pagination and filtering
    const query = `
      SELECT * 
      FROM \`foodio-ab3b2.firestore_user.users_raw_latest\`
      ${whereClause}
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Get total count in a separate query (for first page only)
    let totalCount = null;
    if (offset === 0) {
      const countQuery = `
        SELECT COUNT(*) as total_count 
        FROM \`foodio-ab3b2.firestore_user.users_raw_latest\`
        ${whereClause}
      `;
      
      const [countRows] = await this.bigquery.query({ query: countQuery });
      totalCount = countRows[0].total_count;
    }

    // Set query options
    const options = {
      query: query,
      location: 'asia-southeast1', // Set the appropriate location
      useQueryCache: true
    };

    // Run the main query
    const [rows] = await this.bigquery.query(options);

    console.log(`Successfully queried BigQuery for orders, retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${userid ? ', filtered by userId: ' + userid : ''})`);

    return res.status(200).json({
      success: true,
      count: rows.length,
      total: totalCount,
      offset: offset,
      limit: limit,
      userId: userid,
      hasMore: rows.length === limit, // Indicate if there might be more records
      nextOffset: offset + limit, // Provide the next offset for pagination
      data: rows
    });
    
  } catch (error) {
    console.error('Error querying BigQuery for orders:', error.message);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to query BigQuery for orders',
      error: error.message
    });
  }
}

  /**
   * Query BigQuery and return only the parsed data field for orders (O_% documents)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async queryRawDataO(req, res) {
    try {
      // Extract pagination parameters from request body
      const limit = parseInt(req.body.limit) || 100; // Default to 100 records
      const offset = parseInt(req.body.offset) || 0; // Default to starting from the beginning
      const userid = req.body.userid || null; // Get the userId filter

      // Build the WHERE clause for filtering
      let whereClause = 'WHERE operation != \'DELETE\' AND document_id LIKE \'O_%\'';
//      if (userid) {
//        // Create a pattern to match the userId in the document_name
//        whereClause += ` AND document_name LIKE '%/user/${userid}/%'`;
//      }
if (userid) {
        // Create a pattern to match the userId in the document_name
        whereClause = `WHERE operation != 'DELETE' AND document_name LIKE '%/user/FU_${userid}/%'`;
      }

      // Enhanced query to get the latest records based on timestamp
      // Using a subquery with window functions to rank records by timestamp
      const query = `
        WITH RankedRecords AS (
          SELECT 
            document_id, 
            data,
            timestamp,
            ROW_NUMBER() OVER(PARTITION BY document_id ORDER BY timestamp DESC) as row_num
          FROM \`foodio-ab3b2.firestore_user.users_raw_latest\`
          ${whereClause}
        )
        SELECT document_id, data
        FROM RankedRecords
        WHERE row_num = 1
        ORDER BY timestamp DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      // Get total count in a separate query (for first page only)
      let totalCount = null;
      if (offset === 0) {
        const countQuery = `
          WITH UniqueDocuments AS (
            SELECT document_id, MAX(timestamp) as max_timestamp
            FROM \`foodio-ab3b2.firestore_user.users_raw_latest\`
            ${whereClause}
            GROUP BY document_id
          )
          SELECT COUNT(*) as total_count 
          FROM UniqueDocuments
        `;
        
        const [countRows] = await this.bigquery.query({ query: countQuery });
        totalCount = countRows[0].total_count;
      }

      // Set query options
      const options = {
        query: query,
        location: 'asia-southeast1',
        useQueryCache: true
      };

      // Run the main query
      const [rows] = await this.bigquery.query(options);

      // Parse the data field for each row (it's stored as a JSON string)
      const parsedData = rows.map(row => {
        try {
          const dataObj = JSON.parse(row.data);
          return {
            id: row.document_id,
            ...dataObj
          };
        } catch (parseError) {
          console.error(`Error parsing data for document ${row.document_id}:`, parseError);
          return { 
            id: row.document_id,
            error: 'Failed to parse data',
            rawData: row.data
          };
        }
      });

      console.log(`Successfully queried latest order raw data, retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${userid ? ', filtered by userId: ' + userid : ''})`);

      return res.status(200).json({
        success: true,
        count: parsedData.length,
        total: totalCount,
        offset: offset,
        limit: limit,
        hasMore: rows.length === limit,
        nextOffset: offset + limit,
        data: parsedData
      });
      
    } catch (error) {
      console.error('Error querying order raw data:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to query order raw data',
        error: error.message
      });
    }
  }

  /**
   * Normalize phone number - handles +6 prefix and removes leading zeros
   * @param {string} phoneNumber - Phone number to normalize
   * @returns {string} Normalized phone number without +6 prefix
   */
  normalizePhoneNumber(phoneNumber) {
    if (!phoneNumber) {
      return '';
    }
    
    let normalized = phoneNumber.trim();
    
    // Remove +6 prefix if present
    if (normalized.startsWith('+6')) {
      normalized = normalized.substring(2);
    } else if (normalized.startsWith('6')) {
      normalized = normalized.substring(1);
    }
    
    // Remove leading 0 if present
    if (normalized.startsWith('0')) {
      normalized = normalized.substring(1);
    }
    
    return normalized;
  }

  /**
   * Check if user exists by phone number; apply points to user if exists, otherwise save as pending.
   * Requires: phoneNumber, points, storeId, orderId.
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async checkUser(req, res) {
    try {
      console.log('🔍 [CHECK_USER] ========== REQUEST ==========');
      const { phoneNumber, points, storeId, orderId } = req.body;
      console.log('🔍 [CHECK_USER] Body:', { phoneNumber, points, storeId, orderId });

      if (!phoneNumber) {
        console.log('❌ [CHECK_USER] Validation failed: phone number missing');
        return res.status(400).json({
          success: false,
          message: 'Phone number is required'
        });
      }

      const phone = phoneNumber.trim();
      if (!phone) {
        console.log('❌ [CHECK_USER] Validation failed: phone number empty after trim');
        return res.status(400).json({
          success: false,
          message: 'Phone number cannot be empty'
        });
      }

      const pointsToApply = points !== undefined && points !== null ? parseFloat(points) : null;
      if (pointsToApply === null || isNaN(pointsToApply) || pointsToApply <= 0) {
        console.log('❌ [CHECK_USER] Validation failed: points invalid or missing', { points, parsed: pointsToApply });
        return res.status(400).json({
          success: false,
          message: 'points is required and must be a positive number'
        });
      }

      if (!storeId || (typeof storeId === 'string' && !storeId.trim())) {
        console.log('❌ [CHECK_USER] Validation failed: storeId missing or empty');
        return res.status(400).json({
          success: false,
          message: 'storeId is required'
        });
      }

      if (!orderId || (typeof orderId === 'string' && !orderId.trim())) {
        console.log('❌ [CHECK_USER] Validation failed: orderId missing or empty');
        return res.status(400).json({
          success: false,
          message: 'orderId is required'
        });
      }

      const storeIdVal = typeof storeId === 'string' ? storeId.trim() : storeId;
      const orderIdVal = typeof orderId === 'string' ? orderId.trim() : orderId;
      console.log('🔍 [CHECK_USER] Valid params:', { phone, pointsToApply, storeIdVal, orderIdVal });

      // Check Firestore for FU_ document (using phone number as-is)
      const userDocRef = fireStore.collection('user').doc(`FU_${phone}`);
      const userDoc = await userDocRef.get();
      console.log('🔍 [CHECK_USER] User lookup FU_' + phone + ':', userDoc.exists ? 'EXISTS' : 'NOT FOUND');

      if (!userDoc.exists) {
        console.log('🔍 [CHECK_USER] User not found -> create order model and save pending points');
        const orderTotal = pointsToApply / 10;
        const minimalStore = {
          props: {
            id: storeIdVal,
            title: '',
            address: '',
            img: '',
            isopen: '',
            opendate: '',
            opentime: ''
          }
        };
        const orderModel = CreateNewOrder(minimalStore, orderIdVal);
        orderModel.id = orderIdVal;
        orderModel.storeid = storeIdVal;
        orderModel.totalprice = orderTotal;
        orderModel.totalpaid = orderTotal;
        orderModel.orderitems = [
          { qty: 1, title: 'item purchase from vending', price: orderTotal }
        ];
        orderModel.orderdatetime = new Date().toISOString();
        orderModel.paymentstatus = 0;
        orderModel.paymenttype = 'VENDING';

        const orderData = {
          id: orderModel.id,
          storeid: orderModel.storeid,
          totalprice: orderModel.totalprice,
          totalpaid: orderModel.totalpaid,
          orderitems: orderModel.orderitems,
          orderdatetime: orderModel.orderdatetime,
          paymentstatus: orderModel.paymentstatus,
          paymenttype: orderModel.paymenttype
        };
        console.log('🔍 [CHECK_USER] Order data prepared:', { id: orderData.id, storeid: orderData.storeid, totalpaid: orderData.totalpaid, orderitemsCount: orderData.orderitems?.length });
        // await fireStore
        //   .collection('store')
        //   .doc(storeIdVal)
        //   .collection('order')
        //   .doc(orderIdVal)
        //   .set(orderData);

        const result = await this.gkashRouter.savePendingPointsVending({
          phoneNumber: phone,
          points: pointsToApply,
          orderId: orderIdVal,
          storeId: storeIdVal,
          orderData
        });
        if (!result) {
          console.log('❌ [CHECK_USER] savePendingPointsVending returned false');
          return res.status(500).json({
            success: false,
            message: 'Failed to save pending points'
          });
        }
        console.log('✅ [CHECK_USER] User not found -> pending points saved. Points:', pointsToApply, 'orderId:', orderIdVal);
        return res.status(200).json({
          success: true,
          userExists: false,
          message: 'User does not exist; points saved as pending',
          phoneNumber: phone,
          pointsSavedAsPending: pointsToApply,
          storeId: storeIdVal,
          orderId: orderIdVal,
          loyaltyPoints: {}
        });
      }

      console.log('🔍 [CHECK_USER] User exists -> adding points to loyalty');
      const userModel = UserModel.fromDocument(userDoc);
      const previousPoints = userModel.getLoyaltyPoints(storeIdVal);
      userModel.addLoyaltyPoints(storeIdVal, pointsToApply);
      await userDocRef.update(userModel.toMap());
      const updatedDoc = await userDocRef.get();
      const updatedData = updatedDoc.data();
      const loyaltyPoints = updatedData.loyaltypoints || {};
      const newStorePoints = loyaltyPoints[storeIdVal] || 0;
      console.log('✅ [CHECK_USER] Points added. Store:', storeIdVal, 'previous:', previousPoints, 'added:', pointsToApply, 'new total:', newStorePoints);
      return res.status(200).json({
        success: true,
        userExists: true,
        message: 'User exists; points added',
        phoneNumber: phone,
        userId: userDoc.id,
        pointsAdded: pointsToApply,
        storeId: storeIdVal,
        orderId: orderIdVal,
        loyaltyPoints,
        storeLoyaltyPoints: loyaltyPoints[storeIdVal] || 0
      });

    } catch (error) {
      console.error('❌ [CHECK_USER] Error:', error.message);
      console.error('❌ [CHECK_USER] Stack:', error.stack);
      return res.status(500).json({
        success: false,
        message: 'Failed to check user',
        error: error.message
      });
    }
  }

  /**
   * Add loyalty points to user by phone number and store ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async addLoyaltyPoints(req, res) {
    try {
      const { phoneNumber, storeId, points } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required'
        });
      }

      // Use phone number exactly as provided by user
      const phone = phoneNumber.trim();

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number cannot be empty'
        });
      }

      if (!storeId) {
        return res.status(400).json({
          success: false,
          message: 'Store ID is required'
        });
      }

      if (points === undefined || points === null || isNaN(parseFloat(points))) {
        return res.status(400).json({
          success: false,
          message: 'Points must be a valid number'
        });
      }

      const pointsToAdd = parseFloat(points);
      if (pointsToAdd <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Points must be greater than 0'
        });
      }

      // Get user document reference (using phone number as-is)
      const userDocRef = fireStore.collection('user').doc(`FU_${phone}`);
      
      // Use transaction to safely update loyalty points
      await fireStore.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userDocRef);
        
        if (!userDoc.exists) {
          throw new Error('User not found');
        }

        const userData = userDoc.data();
        const userModel = UserModel.fromDocument(userDoc);
        
        // Get current points for this store
        const currentPoints = userModel.getLoyaltyPoints(storeId);
        
        // Add loyalty points
        userModel.addLoyaltyPoints(storeId, pointsToAdd);
        
        // Update the document
        transaction.update(userDocRef, userModel.toMap());
        
        return {
          previousPoints: currentPoints,
          newPoints: userModel.getLoyaltyPoints(storeId)
        };
      });

      // Get updated user data to return
      const updatedUserDoc = await userDocRef.get();
      const updatedUserData = updatedUserDoc.data();
      const updatedLoyaltyPoints = updatedUserData.loyaltypoints || {};

      return res.status(200).json({
        success: true,
        message: `Successfully added ${pointsToAdd} loyalty points`,
        phoneNumber: phone,
        storeId: storeId,
        pointsAdded: pointsToAdd,
        loyaltyPoints: updatedLoyaltyPoints,
        storeLoyaltyPoints: updatedLoyaltyPoints[storeId] || 0
      });

    } catch (error) {
      console.error('Error adding loyalty points:', error.message);
      
      if (error.message === 'User not found') {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to add loyalty points',
        error: error.message
      });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = UserRouter; 