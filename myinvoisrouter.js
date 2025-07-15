const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const {BigQuery} = require('@google-cloud/bigquery');
const firebase = require("./db");
const fireStore = firebase.firestore();

class MyInvoisRouter {

   InvoisURL = 'https://preprod-api.myinvois.hasil.gov.my';

  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
    this.bigquery = this.initializeBigQuery();
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
    this.router.post('/validate', this.validateTIN.bind(this));
    this.router.post('/login', this.login.bind(this));
    this.router.post('/loginonbehalf', this.loginOnBehalf.bind(this));
    this.router.post('/submit', this.submitDocument.bind(this));
    this.router.post('/getdocdetail', this.getDocDetail.bind(this));
    this.router.post('/querybigquery', this.queryBigQuery.bind(this));
    this.router.post('/queryrawdata', this.queryRawData.bind(this));
    this.router.post('/generatereport', this.generateConsolidatedReport.bind(this));
    this.router.post('/generateinvois', this.generateInvoiceEndpoint.bind(this));
    this.router.post('/generateorderinvois', this.generateOrderInvoiceEndpoint.bind(this));
    this.router.post('/searchtin', this.searchTIN.bind(this));
    this.router.post('/moveordertocompleted', this.moveOrderToCompletedEndpoint.bind(this));
    this.router.post('/checkorderinvoice', this.checkOrderInvoiceEndpoint.bind(this));
    this.router.post('/validateandupdateinvoice', this.validateAndUpdateInvoiceEndpoint.bind(this));
    this.router.post('/deletebigqueryrecord', this.deleteBigQueryRecordEndpoint.bind(this));
    this.router.post('/deleteallstoreentries', this.deleteAllStoreEntriesEndpoint.bind(this));
    this.router.post('/queryconsolidateddata', this.queryConsolidatedDataEndpoint.bind(this));
  }

  about(req, res) {
    res.json({ version: '1.0.0' });
  }

  async submitDocument(req, res) {
    try {
      const { token, documents } = req.body;
      
      if (!token || !documents || !Array.isArray(documents) || documents.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: token and documents array are required'
        });
      }

      const url = this.InvoisURL + '/api/v1.0/documentsubmissions';
      
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      const data = {
        documents: documents
      };

      const response = await axios.post(url, data, { headers });
      
      return res.status(200).json({
        success: true,
        data: response.data
      });
      
    } catch (error) {
      console.error('Error submitting document:', error.message);
      
      return res.status(error.response?.status || 500).json({
        success: false,
        message: 'Failed to submit document',
        error: error.message,
        details: error.response?.data
      });
    }
  }

  async login(req, res) {
    try {
      const { client_id, client_secret } = req.body;
      
      if (!client_id || !client_secret) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: client_id and client_secret are required'
        });
      }

      const url = this.InvoisURL + '/connect/token';
      
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
      };

      const data = querystring.stringify({
        client_id: client_id,
        client_secret: client_secret,
        grant_type: 'client_credentials',
        scope: 'InvoicingAPI'
      });

      const response = await axios.post(url, data, { headers });
      
      return res.status(200).json({
        success: true,
        data: response.data
      });
      
    } catch (error) {
      console.error('Error during login:', error.message);
      
      return res.status(error.response?.status || 500).json({
        success: false,
        message: 'Failed to login',
        error: error.message,
        details: error.response?.data
      });
    }
  }

  async loginOnBehalf(req, res) {
    try {
      const { client_id, client_secret, onbehalfof } = req.body;
      
      if (!client_id || !client_secret || !onbehalfof) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: client_id, client_secret, and onbehalfof are required'
        });
      }

      const url = this.InvoisURL + '/connect/token';
      
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'onbehalfof': onbehalfof
      };

      const data = querystring.stringify({
        client_id: client_id,
        client_secret: client_secret,
        grant_type: 'client_credentials',
        scope: 'InvoicingAPI'
      });

      const response = await axios.post(url, data, { headers });
      
      return res.status(200).json({
        success: true,
        data: response.data
      });
      
    } catch (error) {
      console.error('Error during login on behalf:', error.message);
      
      return res.status(error.response?.status || 500).json({
        success: false,
        message: 'Failed to login on behalf',
        error: error.message,
        details: error.response?.data
      });
    }
  }

  async validateTIN(req, res) {
    try {
      const { token, tin, idType, idValue } = req.body;
      
      if (!token || !tin || !idType || !idValue) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: token, tin, idType, and idValue are required'
        });
      }

      const url = this.InvoisURL +  `/api/v1.0/taxpayer/validate/${tin}?idType=${idType}&idValue=${idValue}`;
      
      const headers = {
        'Authorization': token
      };

      const response = await axios.get(url, { headers });

      console.log(response.data);
      
      return res.status(200).json({
        success: true,
        data: response.data
      });
      
    } catch (error) {
      console.error('Error validating TIN:', error.message);
      
      return res.status(error.response?.status || 500).json({
        success: false,
        message: 'Failed to validate TIN',
        error: error.message,
        details: error.response?.data
      });
    }
  }

  /**
   * Search for a TIN using an NRIC or other ID value
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async searchTIN(req, res) {
    try {
      const { token, idType, idValue } = req.body;
      
      if (!token || !idType || !idValue) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: token, idType, and idValue are required'
        });
      }

      const url = `${this.InvoisURL}/api/v1.0/taxpayer/search/tin?idType=${idType}&idValue=${idValue}`;
      
      const headers = {
        'Authorization': `Bearer ${token}`
      };

      console.log(`Searching TIN with ID type ${idType} and value ${idValue}`);
      const response = await axios.get(url, { headers });
      
      return res.status(200).json({
        success: true,
        data: response.data
      });
      
    } catch (error) {
      console.error('Error searching TIN:', error.message);
      
      return res.status(error.response?.status || 500).json({
        success: false,
        message: 'Failed to search TIN',
        error: error.message,
        details: error.response?.data
      });
    }
  }

  /**
   * Get document details from MyInvois API
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getDocDetail(req, res) {
    try {
      const { token, uuid } = req.body;
      
      if (!token || !uuid) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: token and uuid are required'
        });
      }

      const url = `${this.InvoisURL}/api/v1.0/documents/${uuid}/details`;
      
      const headers = {
        'Authorization': `Bearer ${token}`
      };

      const response = await axios.get(url, { headers });

      return res.status(200).json({
        success: true,
        data: response.data
      });
      
    } catch (error) {
      console.error('Error getting document details:', error.message);
      
      return res.status(error.response?.status || 500).json({
        success: false,
        message: 'Failed to get document details',
        error: error.message,
        details: error.response?.data
      });
    }
  }

  /**
   * Query BigQuery to get myinvois raw data with pagination support
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async queryBigQuery(req, res) {
    try {
      // Extract pagination parameters from request body
      const limit = parseInt(req.body.limit) || 100; // Default to 100 records
      const offset = parseInt(req.body.offset) || 0; // Default to starting from the beginning
      const storeid = req.body.storeid || null; // Get the storeId filter
      
      // Build the WHERE clause for storeId filtering
      let whereClause = 'WHERE operation != \'DELETE\'';
      if (storeid) {
        // Create a pattern to match the storeId in the document_name
        whereClause += ` AND document_name LIKE '%/myinvois/${storeid}/%'`;
      }

      // Build query with pagination and filtering
      const query = `
        SELECT * 
        FROM \`foodio-ab3b2.firestore_myinvois.myinvois_raw_latest\`
        ${whereClause}
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      // Get total count in a separate query (for first page only)
      let totalCount = null;
      if (offset === 0) {
        const countQuery = `
          SELECT COUNT(*) as total_count 
          FROM \`foodio-ab3b2.firestore_myinvois.myinvois_raw_latest\`
          ${whereClause}
        `;
        
        const [countRows] = await this.bigquery.query({ query: countQuery });
        totalCount = countRows[0].total_count;
      }

      // Set query options
      const options = {
        query: query,
        location: 'US', // Set the appropriate location
        useQueryCache: true
      };

      // Run the main query
      const [rows] = await this.bigquery.query(options);

      console.log(`Successfully queried BigQuery, retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${storeid ? ', filtered by storeId: ' + storeid : ''})`);

      return res.status(200).json({
        success: true,
        count: rows.length,
        total: totalCount,
        offset: offset,
        limit: limit,
        storeId: storeid,
        hasMore: rows.length === limit, // Indicate if there might be more records
        nextOffset: offset + limit, // Provide the next offset for pagination
        data: rows
      });
      
    } catch (error) {
      console.error('Error querying BigQuery:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to query BigQuery',
        error: error.message
      });
    }
  }

  /**
   * Query BigQuery and return only the parsed data field
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async queryRawData(req, res) {
    try {
      // Extract pagination parameters from request body
      const limit = parseInt(req.body.limit) || 100; // Default to 100 records
      const offset = parseInt(req.body.offset) || 0; // Default to starting from the beginning
      const storeid = req.body.storeid || null; // Get the storeId filter
      
      // Build the WHERE clause for storeId filtering
      let whereClause = 'WHERE operation != \'DELETE\'';
      if (storeid) {
        // Create a pattern to match the storeId in the document_name
        whereClause += ` AND document_name LIKE '%/myinvois/${storeid}/%'`;
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
          FROM \`foodio-ab3b2.firestore_myinvois.myinvois_raw_latest\`
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
            FROM \`foodio-ab3b2.firestore_myinvois.myinvois_raw_latest\`
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
        location: 'US',
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

      console.log(`Successfully queried latest raw data, retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${storeid ? ', filtered by storeId: ' + storeid : ''})`);

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
      console.error('Error querying raw data:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to query raw data',
        error: error.message
      });
    }
  }

  /**
   * Internal method to consolidate order data and generate summary
   * @param {string} storeId - The store ID to get data for
   * @returns {Promise<Object>} - Consolidated report data
   */
  async _consolidateOrderSummary(storeId) {
    try {
      // Start timing
      const startTime = new Date();
      const batchTimings = [];
      
      console.log(`Starting order consolidation at ${startTime.toString()}`);
      
      // Reset orders and summary
      const allOrders = [];
      let consolidatedSummary = {
        totalAmount: 0.0,
        totalTax: 0.0,
        totalServiceCharge: 0.0,
        totalDiscount: 0.0,
        totalRounding: 0.0,
        totalOrders: 0.0,
      };
      
      // Try to use the generateReport API to get consolidated data
      console.log('Attempting to use generateReport API to get consolidated data...');
      try {
        // Call to generateConsolidatedReport method in this class
        const reportResult = await this.generateConsolidatedReport({
          body: { storeid: storeId }
        }, {
          status: () => ({ json: (data) => data }),
          json: (data) => data
        });
        
        if (reportResult.success && reportResult.totals) {
          const totals = reportResult.totals;
          const count = reportResult.count || 0;
          
          // Map API response to consolidatedSummary
          consolidatedSummary = {
            totalAmount: totals.totalPrice || 0.0,
            totalTax: totals.tax || 0.0,
            totalServiceCharge: totals.serviceCharge || 0.0,
            totalDiscount: totals.totalDiscount || 0.0,
            totalRounding: totals.totalRounding || 0.0,
            totalOrders: count,
          };
          
          const endTime = new Date();
          const totalDuration = endTime - startTime;
          
          console.log(`Successfully used generateReport API to get consolidated data in ${totalDuration}ms`);
          
          return {
            success: true,
            orders: reportResult.orders || [],
            summary: consolidatedSummary,
            reportData: reportResult,
            performance: {
              startTime: startTime.toString(),
              endTime: endTime.toString(),
              totalDurationMs: totalDuration,
              dataSource: 'MyInvois API',
            }
          };
        } else {
          console.log('generateReport API returned success=false or missing totals.');
        }
      } catch (e) {
        console.error(`Error using generateReport API: ${e}. Falling back to alternate data source.`);
      }
      
      // This should never happen, but just in case
      return {
        success: false,
        error: 'No data source selected',
      };
    } catch (e) {
      console.error(`Error consolidating orders: ${e}`);
      return {
        success: false,
        orders: [],
        summary: {
          totalAmount: 0.0,
          totalTax: 0.0,
          totalServiceCharge: 0.0,
          totalDiscount: 0.0,
          totalRounding: 0.0,
          totalOrders: 0.0,
        },
        error: e.toString(),
      };
    }
  }

  /**
   * Internal method to load supplier data from Firestore
   * Similar to loadSupplierData in Dart implementation
   * @param {string} storeId - The store ID to load supplier data for
   * @returns {Promise<Object|null>} - Supplier data or null if not found
   */
  async _loadSupplierData(storeId) {
    try {
      console.log(`Loading supplier data for store ID: ${storeId}`);
      
      // Get supplier document from Firestore following path:
      // collection(store) -> doc(storeid) -> collection(supplier) -> doc(storeid)
      const supplierRef = fireStore.collection('store').doc(storeId).collection('supplier').doc(storeId);
      const supplierDoc = await supplierRef.get();
      
      if (supplierDoc.exists) {
        console.log(`Supplier data found for store ID: ${storeId}`);
        return supplierDoc.data();
      } else {
        console.log(`No supplier data found for store ID: ${storeId}`);
        return null;
      }
    } catch (e) {
      console.error(`Error loading supplier data: ${e}`);
      return null;
    }
  }

  /**
   * Generate a consolidated report by querying BigQuery and returning just the count
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async generateConsolidatedReport(req, res) {
    try {
      // Extract parameters from request body
      const { storeid } = req.body;
      
      if (!storeid) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameter: storeid'
        });
      }

      // Build query with filtering by storeId
      // const query = `
      //   SELECT document_id, data
      //   FROM \`foodio-ab3b2.firestore_myinvois.myinvois_raw_latest\`
      //   WHERE operation != 'DELETE' AND document_name LIKE '%/myinvois/${storeid}/%'
        
      // `;

      const query = `
      SELECT document_id, data, timestamp
      FROM \`foodio-ab3b2.firestore_myinvois.myinvois_raw_latest\`
      WHERE operation != 'DELETE' 
        AND document_name LIKE '%/myinvois/${storeid}/%'
        AND EXTRACT(YEAR FROM DATETIME(TIMESTAMP(timestamp), "Asia/Kuala_Lumpur")) = 
            EXTRACT(YEAR FROM DATE_SUB(CURRENT_DATE("Asia/Kuala_Lumpur"), INTERVAL 1 MONTH))
        AND EXTRACT(MONTH FROM DATETIME(TIMESTAMP(timestamp), "Asia/Kuala_Lumpur")) = 
            EXTRACT(MONTH FROM DATE_SUB(CURRENT_DATE("Asia/Kuala_Lumpur"), INTERVAL 1 MONTH))
      ORDER BY timestamp DESC
    `;
    
      // Set query options
      const options = {
        query: query,
        location: 'US',
        useQueryCache: true
      };

      // Run the main query
      const [rows] = await this.bigquery.query(options);
      console.log(`Retrieved ${rows.length} rows for consolidated report`);

      // Initialize variables for totals
      const totals = {
        totalPrice: 0,
        ePayAmount: 0,
        totalPaid: 0,
        serviceCharge: 0,
        cashVoucherAmount: 0,
        tax: 0,
        totalChanged: 0,
        totalDiscount: 0,
        taxInclusive: 0,
        itemPrice: 0,
        itemDiscount: 0,
        totalPax: 0,
        totalCashAmount: 0,
        totalQuantity: 0,
        totalRounding: 0
      };

      // Process each record into a list
      const processedData = [];
      let orders = []
      let recordsProcessed = 0;
      
      for (const row of rows) {
        try {
          // Parse the data field
          const parsedData = JSON.parse(row.data);
          
          // Add to our in-memory list
          processedData.push({
            id: row.document_id,
            ...parsedData
          });
          
          

          orders.push(
            {
              id: parsedData.orderid,
              totalPrice : parseFloat(parsedData.totalprice || 0),
              ePayAmount : parseFloat(parsedData.epayamount || 0),
              totalPaid : parseFloat(parsedData.totalpaid || 0),
              serviceCharge : parseFloat(parsedData.servicecharge || 0),
              cashVoucherAmount : parseFloat(parsedData.cashvoucheramount || 0),
              tax : parseFloat(parsedData.tax || 0),
              totalChanged : parseFloat(parsedData.totalchanged || 0),
              totalDiscount : parseFloat(parsedData.totaldiscount || 0),
              taxInclusive : parseFloat(parsedData.taxinclusive || 0),
              totalRounding : parseFloat(parsedData.roundng || 0),
          
          // Calculate pax and cash amount
              totalPax : parseInt(parsedData.pax || 0),
              totalCashAmount : parseFloat(parsedData.cashamount || 0)
            }
          )

          // Calculate amount fields
          totals.totalPrice += parseFloat(parsedData.totalprice || 0);
          totals.ePayAmount += parseFloat(parsedData.epayamount || 0);
          totals.totalPaid += parseFloat(parsedData.totalpaid || 0);
          totals.serviceCharge += parseFloat(parsedData.servicecharge || 0);
          totals.cashVoucherAmount += parseFloat(parsedData.cashvoucheramount || 0);
          totals.tax += parseFloat(parsedData.tax || 0);
          totals.totalChanged += parseFloat(parsedData.totalchanged || 0);
          totals.totalDiscount += parseFloat(parsedData.totaldiscount || 0);
          totals.taxInclusive += parseFloat(parsedData.taxinclusive || 0);
          totals.totalRounding += parseFloat(parsedData.roundng || 0);
          
          // Calculate pax and cash amount
          totals.totalPax += parseInt(parsedData.pax || 0);
          totals.totalCashAmount += parseFloat(parsedData.cashamount || 0);
          
          // Calculate total quantity from order items
          let recordQuantity = 0;
          
          // Process order items if they exist
          if (parsedData.orderitems && Array.isArray(parsedData.orderitems)) {
            parsedData.orderitems.forEach(item => {
              totals.itemPrice += parseFloat(item.price || 0);
              totals.itemDiscount += parseFloat(item.discount || 0);
              
              // Add item quantity to totals
              const itemQuantity = parseInt(item.quantity || 0);
              recordQuantity += itemQuantity;
              totals.totalQuantity += itemQuantity;
            });
          }
          
          // If no order items, check for totalqty field
          if (recordQuantity === 0 && parsedData.totalqty) {
            const totalQty = parseInt(parsedData.totalqty || 0);
            totals.totalQuantity += totalQty;
          }
          
          recordsProcessed++;
        } catch (parseError) {
          console.error(`Error parsing data for document ${row.document_id}:`, parseError);
        }
      }
      
      // Round all totals to 2 decimal places for currency values
      Object.keys(totals).forEach(key => {
        totals[key] = parseFloat(totals[key].toFixed(2));
      });
      
      console.log(`Successfully processed ${recordsProcessed} records into list`);

      // Return success with count and totals information
      return res.status(200).json({
        success: true,
        message: 'Consolidated report generated successfully',
        count: processedData.length,
        orders: orders,
        totals: totals,
        timestamp: new Date().toISOString()
        
      });
      
    } catch (error) {
      console.error('Error generating consolidated report:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to generate consolidated report',
        error: error.message
      });
    }
  }

  /**
   * Generates a summary XML from supplier model and consolidated order data
   * @param {Object} supplierModel - The supplier model containing all supplier information
   * @param {Object} consolidatedSummary - The consolidated order summary data
   * @returns {string} The generated XML string
   */
  _generateSummaryXml(supplierModel, consolidatedSummary, orders = [], option) {
    // Make sure supplier data is loaded
    if (!supplierModel) {
      throw new Error('Supplier data must be loaded before generating XML');
    }
    
    // Get the summarized data
    const totalAmount = consolidatedSummary.totalAmount || 0.0;
    const totalTax = consolidatedSummary.totalTax || 0.0;
    const totalServiceCharge = consolidatedSummary.totalServiceCharge || 0.0;
    const totalRounding = consolidatedSummary.totalRounding || 0.0;
    const totalDiscount = consolidatedSummary.totalDiscount || 0.0;
    const subtotal = totalAmount - totalTax - totalServiceCharge - totalRounding;
    const totalOrders = consolidatedSummary.totalOrders || 0;
    
    // Import required classes
    const InvoiceLine = require('./InvoiceLine');
    const InvoiceHeader = require('./InvoiceHeader');
    
    // Create a list of consolidated invoice lines (one line per order type)
    const consolidatedLines = [];
    
    // Check if we should generate detailed lines for each order
    if (option && Array.isArray(orders) && orders.length > 0) {
      const orderIds = orders.map(order => order.id).join(', ');
      console.log(`Original Order IDs: ${orderIds}`);

      // Helper function to extract the numeric part and prefix of an ID
      const extractIdParts = (id) => {
        const idStr = String(id);
        // Extract prefix (non-numeric characters at beginning) and numeric part
        const match = idStr.match(/^([^\d]*)(\d+)$/);
        if (match) {
          return {
            prefix: match[1] || '', // Non-numeric prefix (could be empty)
            numericPart: parseInt(match[2], 10), // Numeric part as integer
            fullId: idStr // Full original ID
          };
        }
        // If no numeric part, return the original as prefix
        return {
          prefix: idStr,
          numericPart: 0, // Default numeric value
          fullId: idStr
        };
      };

      // Group by prefix first, then sort each group by numeric value
      const groupedByPrefix = {};
      orders.forEach(order => {
        const { prefix, numericPart } = extractIdParts(order.id);
        if (!groupedByPrefix[prefix]) {
          groupedByPrefix[prefix] = [];
        }
        groupedByPrefix[prefix].push({
          ...order,
          _numericPart: numericPart // Add numeric part for sorting
        });
      });

      // Sort orders within each prefix group and flatten
      const sortedOrders = [];
      Object.keys(groupedByPrefix).forEach(prefix => {
        // Sort this prefix group by numeric part
        const sortedGroup = groupedByPrefix[prefix].sort((a, b) => a._numericPart - b._numericPart);
        sortedOrders.push(...sortedGroup);
      });

      // Replace original orders with sorted orders
      orders = sortedOrders;

      console.log(`Sorted Order IDs: ${orders.map(order => order.id).join(', ')}`);
      
      // Group consecutive order IDs (must be same prefix and consecutive numbers)
      const orderGroups = [];
      let currentGroup = [];
      
      // Helper function to check if IDs are consecutive
      const isConsecutive = (id1, id2) => {
        const parts1 = extractIdParts(id1);
        const parts2 = extractIdParts(id2);
        
        // Must have same prefix and consecutive numeric parts
        return parts1.prefix === parts2.prefix && 
               parts2.numericPart === parts1.numericPart + 1;
      };
      
      // Process each order to group consecutive IDs
      orders.forEach((order, index) => {
        if (index === 0 || !isConsecutive(orders[index-1].id, order.id)) {
          // Start a new group
          if (currentGroup.length > 0) {
            orderGroups.push([...currentGroup]);
          }
          currentGroup = [order];
        } else {
          // Add to current group
          currentGroup.push(order);
        }
      });
      
      // Add the last group if it exists
      if (currentGroup.length > 0) {
        orderGroups.push(currentGroup);
      }
      
      console.log(`Grouped ${orders.length} orders into ${orderGroups.length} groups`);
      
      
      // Create invoice lines for each group
      orderGroups.forEach((group, groupIndex) => {
        // Sum up financial values for this group
        const groupSubtotal = group.reduce((sum, order) => sum + (order.totalPrice - order.tax - order.serviceCharge - order.totalRounding), 0);
        const groupTax = group.reduce((sum, order) => sum + order.tax, 0);
        const groupServiceCharge = group.reduce((sum, order) => sum + order.serviceCharge, 0);
        const groupRounding = group.reduce((sum, order) => sum + order.totalRounding, 0);
        
        // Create description
        let itemDescription;
        if (group.length === 1) {
          itemDescription = `Order #${group[0].id}`;
        } else {
          itemDescription = `Orders #${group[0].id}-${group[group.length-1].id}`;
        }
        
        console.log(`Creating invoice line for group ${groupIndex + 1}: ${itemDescription}`);
        // Add invoice line for this group
        consolidatedLines.push(
          new InvoiceLine({
            id: (groupIndex + 1).toString(),
            quantity: group.length.toString(),
            lineExtensionAmount: groupSubtotal.toFixed(2),
            taxAmount: groupTax.toFixed(2),
            itemDescription: itemDescription,
            originCountryCode: "MY",
            ptcClassificationCode: "", // refer to standard
            classClassificationCode: "004", // refer to standard
            priceAmount: (groupSubtotal / group.length).toFixed(2),
            itemPriceExtensionAmount: groupSubtotal.toFixed(2),
            unitCode: "C62", // refer to standard
            currencyID: "MYR"
          })
        );
      });
    } else {
      // Add a single invoice line for all orders (original behavior)
      consolidatedLines.push(
        new InvoiceLine({
          id: "1",
          quantity: totalOrders.toString(),
          lineExtensionAmount: subtotal.toFixed(2),
          taxAmount: totalTax.toFixed(2),
          itemDescription: "Consolidated Orders",
          originCountryCode: "MY",
          ptcClassificationCode: "", // refer to standard
          classClassificationCode: "004", // refer to standard
          priceAmount: (totalOrders > 0 ? (subtotal / totalOrders) : subtotal).toFixed(2),
          itemPriceExtensionAmount: subtotal.toFixed(2),
          unitCode: "C62", // refer to standard
          currencyID: "MYR",
        })
      );
    }
    
    // Get supplier information
    const registrationName = supplierModel.registrationName || "";
    const companyID = supplierModel.companyID || "";
    const addressLine1 = supplierModel.addressLine1 || "";
    const addressLine2 = supplierModel.addressLine2 || "";
    const addressLine3 = supplierModel.addressLine3 || "";
    const city = supplierModel.city || "Kuala Lumpur";
    const postalZone = supplierModel.postalZone || "50480";
    const countrySubentityCode = supplierModel.countrySubentityCode || "14";
    const countryCode = supplierModel.countryCode || "MYS";
    const tin = supplierModel.tin || "";
    const nric = supplierModel.nric || "";
    const industryCode = supplierModel.industryCode || "46510";
    const industryName = supplierModel.industryName || "Wholesale of computer hardware, software and peripherals";
    const telephone = supplierModel.telephone || "";
    const email = supplierModel.email || "";
    const certEX = supplierModel.certEX || "";

    // Format the current date for the ID
    const now = new Date();
    const yearMonth = now.toISOString().substring(0, 7).replace('-', '');
    
    // Create invoice header
    const invoiceHeader = new InvoiceHeader({
      id: `CONS-${yearMonth}`,
      dateTime: now,
      // Supplier information from supplier model
      supplierRegistrationName: registrationName,
      supplierCompanyID: companyID,
      supplierAddressLine1: addressLine1,
      supplierCity: city,
      supplierPostalZone: postalZone,
      supplierCountrySubentityCode: countrySubentityCode,
      supplierAddressLine2: addressLine2,
      supplierAddressLine3: addressLine3,
      supplierCountryCode: countryCode,
      supplierTIN: tin,
      supplierNRIC: nric,
      supplierIndustryCode: industryCode,
      supplierIndustryName: industryName,
      supplierTelephone: telephone,
      supplierEmail: email,
      supplierCertEX: certEX,
      // Generic customer information for consolidated report
      customerPartyName: "Consolidated Buyers",
      customerTIN: "EI00000000010",
      customerBRN: "NA",
      customerAddressLine1: "NA",
      customerAddressLine2: "NA",
      customerAddressLine3: "NA",
      customerCity: "",
      customerPostalZone: "",
      customerCountrySubentityCode: "",
      customerCountryCode: "MYS",
      customerEmail: "",
      customerPhone: "",
      // Financial information
      paymentMeansCode: "",
      invoiceLines: consolidatedLines,
      taxAmount: totalTax.toFixed(2),
      lineExtensionAmount: subtotal.toFixed(2),
      taxExclusiveAmount: subtotal.toFixed(2),
      taxInclusiveAmount: (subtotal + totalTax).toFixed(2),
      allowanceTotalAmount: totalDiscount.toFixed(2),
      chargeTotalAmount: totalServiceCharge.toFixed(2),
      payableRoundingAmount: totalRounding.toFixed(2),
      payableAmount: totalAmount.toFixed(2),
      currencyID: "MYR",
    });
    
    // Generate and return the full XML
    return invoiceHeader.toFullXml();
  }

  /**
   * Helper method to validate document with MyInvois API
   * @param {string} accessToken - API token
   * @param {string} uuid - Document UUID
   * @returns {Promise<Object>} Validation result
   */
  async _validateDocument(accessToken, uuid) {
    try {
      if (!accessToken || !uuid) {
        console.error('Missing required parameters for validation: token and uuid are required');
        return {
          success: false,
          isValid: false,
          error: 'Missing required parameters: token and uuid'
        };
      }

      // Call the MyInvois API
      const url = `${this.InvoisURL}/api/v1.0/documents/${uuid}/details`;
      
      const headers = {
        'Authorization': `Bearer ${accessToken}`
      };

      console.log(`Validating document ${uuid} with token ${accessToken.substring(0, 10)}...`);
      const response = await axios.get(url, { headers });
      console.log('Validation response received');
      
      const documentDetails = response.data;
      const isValid = documentDetails.status === 'Valid';
      
      return {
        success: true,
        isValid: isValid,
        documentDetails: documentDetails,
        error: null
      };
    } catch (error) {
      console.error(`Error validating document: ${error.message}`);
      return {
        success: false,
        isValid: false,
        error: error.message,
        documentDetails: null
      };
    }
  }

    /**   * Generate a full invoice summary, optionally submit to API   * @param {Object} options - Options for generation and submission   * @param {boolean} options.submitToApi - Whether to submit to API   * @param {Object} options.supplierModel - Optional supplier model to use instead of loading from DB   * @param {string} options.storeId - Store ID to use for data   * @param {boolean} options.detailedLines - Whether to generate detailed invoice lines for each order   * @returns {Promise<Object>} Result of the generation process   */
  async generateFullInvoiceSummary(options = {}) {
    try {
      const storeId = options.storeId;
      if (!storeId) {
        return {
          success: false,
          error: 'Store ID is required'
        };
      }
      
      // First load supplier data if not provided as parameter
      let supplier = options.supplierModel;
      
      if (!supplier) {
        supplier = await this._loadSupplierData(storeId);
      }
      
      if (!supplier) {
        return {
          success: false,
          error: 'Failed to load supplier data'
        };
      }
      
      // Then load all orders and summarize
      const orderData = await this._consolidateOrderSummary(storeId);
      
      // Generate XML if data was loaded successfully
      let xmlContent = '';
      if (orderData.success) {
                // Generate XML using the supplier and consolidated summary
        console.log('Generating XML content...');
        // Pass the orders array and options to the XML generator
        const detailedLines = true;
        xmlContent = this._generateSummaryXml(
          supplier,
          orderData.summary,
          orderData.orders || [],
          detailedLines
        );

        //console.log('XML content generated successfully');
        //console.log('XML content:', xmlContent);
        
        // Generate unique invoice ID
        const now = new Date();
        const yearMonth = now.toISOString().substring(0, 7).replace('-', '');
        const invoiceId = `CONS-${yearMonth}`;
        
        // Generate Base64 encoding of XML content
        const base64String = Buffer.from(xmlContent).toString('base64');
        
        // Generate SHA256 hash
        const crypto = require('crypto');
        const sha256Hex = crypto.createHash('sha256').update(xmlContent).digest('hex');
        
        // Create document model for submission
        const InvoiceDocumentModel = require('./InvoiceDocumentModel');
        const invoiceDocumentModel = new InvoiceDocumentModel({
          codeNumber: invoiceId,
          documentHash: sha256Hex,
          document: base64String,
          format: "XML",
          xml: xmlContent,
          createdAt: new Date(),
          status: "pending"
        });
        
        // Convert to map for API and Firestore operations

        const documentData = invoiceDocumentModel.toMap();
        
        // Save document to Firestore before API submission
        //console.log('Saving invoice document to Firestore...' + documentData);
        const saveResult = await this._saveInvoiceToFirestore(storeId, invoiceId, documentData);
        if (!saveResult.success) {
          return {
            success: false,
            error: `Failed to save invoice to Firestore: ${saveResult.error}`,
            step: 'firestore_save'
          };
        }
        
        // Return data with document submission format
        const result = {
          success: true,
          supplier: supplier,
          orders: orderData.orders || [],
          summary: orderData.summary,
          documentData: documentData,
          firestoreSave: saveResult
        };
        
        // If submitToApi is true, also submit the document to the API
        console.log('options.submitToApi:', options.submitToApi);
        if (options.submitToApi) {
          console.log('Submitting document to API...');
          const submissionResult = await this._submitToApi({
            documentData, 
            supplier
          
          });
          
          result.submission = submissionResult;
          
          // Update Firestore with submission results
          //console.log("submissionResult:", submissionResult);
          if (submissionResult.success) {
            const updateResult = await this._updateInvoiceWithSubmissionResults(
              storeId,
              invoiceId, 
              submissionResult
            );
            result.firestoreUpdate = updateResult;
            
            // Perform validation if enabled
            console.log('Performing validation after submission...');
            console.log(options.validateAfterSubmit);
            console.log(submissionResult);
            if (options.validateAfterSubmit !== false && submissionResult.documentUuid) {
              console.log('Validating document after submission...');
              const validationResult = await this._validateDocument(
                submissionResult.accessToken,
                submissionResult.documentUuid
              );
              
              const validationUpdateResult = await this._updateInvoiceWithValidationResults(
                storeId,
                invoiceId,
                validationResult
              );
              console.log('Validation result:', validationResult);
              result.validation = validationResult;
              console.log('Validation update result:', validationUpdateResult);
              result.validationUpdate = validationUpdateResult;
            }
            else
            {
              console.log('Validation skipped after submission.');
            }
          }
        }
        
        return result;
      } else {
        return {
          success: false,
          error: 'No orders found to generate report',
          summary: orderData.summary
        };
      }
    } catch (e) {
      console.error('Error in generateFullInvoiceSummary:', e);
      return {
        success: false,
        error: e.toString()
      };
    }
  }

  /**
   * Submit document to MyInvois API
   * @param {Object} params - Parameters for submission
   * @param {Object} params.documentData - Document data to submit
   * @param {Object} params.supplier - Supplier model data
   * @param {string} params.accessToken - Optional access token to use instead of getting a new one
   * @returns {Promise<Object>} Result of the submission
   */
  async _submitToApi(params = {}) {
    try {
      const { documentData, supplier, accessToken: providedToken } = params;
      
      // Validate supplier model is loaded or provided as parameter
      if (!supplier) {
        return {
          success: false,
          error: 'Failed to load supplier data',
          step: 'initialization'
        };
      }
      
      // Check if client ID and secret are available
      if (!supplier.clientId || !supplier.clientSecret) {
        return {
          success: false,
          error: 'Client ID or Client Secret is missing in supplier settings',
          step: 'initialization'
        };
      }

      // Process status updates
      const statusUpdates = [];
      
      // Get fresh token before submission if not provided
      let accessToken = providedToken || "";
      
      if (!accessToken) {
        statusUpdates.push('Getting fresh API token...');
        const tokenResult = await this.login(
          { body: { client_id: supplier.clientId, client_secret: supplier.clientSecret } },
          { status: () => ({ json: (data) => data }), json: (data) => data }
        );

        if (!tokenResult.success) {
          return {
            success: false,
            error: `Error getting access token: ${tokenResult.message || tokenResult.error}`,
            rawResponse: tokenResult,
            step: 'token_generation'
          };
        }

        // Use the fresh token
        accessToken = tokenResult.data.access_token;
        if (!accessToken) {
          return {
            success: false,
            error: 'No access token available. Please try again.',
            step: 'token_generation'
          };
        }
      } else {
        statusUpdates.push('Using provided API token...');
      }
      
      // Prepare document for submission
      statusUpdates.push('Preparing submission with document...');
      const documents = [
        {
          format: documentData.format,
          documentHash: documentData.documentHash,
          codeNumber: documentData.codeNumber,
          document: documentData.document
        }
      ];
      
      // Submit document to API
      statusUpdates.push('Submitting document to API...');
      // console.log("content for document submission");
      // console.log("token:" + accessToken);
      // console.log("documents:" + JSON.stringify(documents));
      const submissionResult = await this.submitDocument(
        { body: { token: accessToken, documents } },
        { status: () => ({ json: (data) => data }), json: (data) => data }
      );
      
      // Check for successful submission
      const submissionSuccess = submissionResult.success || false;
      let hasRejectedDocs = false;
      let documentUuid = null;
      
      if (submissionSuccess) {
        try {
          if (submissionResult.data && 
              submissionResult.data.rejectedDocuments && 
              submissionResult.data.rejectedDocuments.length > 0) {
            hasRejectedDocs = true;
          }
          
          // Extract UUID for document validation if available
          console.log('Submission result:', submissionResult.data);
          console.log("hasRejectedDocs:", hasRejectedDocs);
         
          if (!hasRejectedDocs) {
            try {
              const acceptedDocumentList = submissionResult.data.acceptedDocuments || [];
              console.log("acceptedDocumentList:", acceptedDocumentList);
              if (acceptedDocumentList.length > 0) {
                documentUuid = acceptedDocumentList[0].uuid;
              }
            } catch (e) {
              console.error('Error parsing response for UUID:', e);
            }
          }
        } catch (e) {
          console.error('Error checking rejected documents:', e);
        }
      }
      
      // If submission failed or document was rejected, return error
      if (!submissionSuccess || hasRejectedDocs) {
        return {
          success: false,
          error: hasRejectedDocs ? 'Document rejected due to validation errors' : 'Document submission failed',
          response: submissionResult.data,
          rawResponse: submissionResult,
          step: 'submission',
          statusUpdates
        };
      }
      
      // Return successful submission result without validation
      statusUpdates.push('Document submitted successfully');
      return {
        success: true,
        response: submissionResult.data,
        rawResponse: submissionResult,
        documentUuid,
        statusUpdates,
        step: 'submitted',
        accessToken
      };
    } catch (e) {
      console.error('Error in _submitToApi:', e);
      return {
        success: false,
        error: e.toString(),
        step: 'exception'
      };
    }
  }

  /**
   * Save invoice document to Firestore
   * @param {string} storeId - The store ID
   * @param {string} documentId - Document ID (invoice code number)
   * @param {Object} documentData - Document data to save
   * @returns {Promise<Object>} Result of the save operation
   */
  async _saveInvoiceToFirestore(storeId, documentId, documentData) {
    try {
      if (!documentId) {
        return {
          success: false,
          error: 'No invoice code number provided'
        };
      }
      
      // Create InvoiceDocumentModel from documentData if it's not already a model
      const InvoiceDocumentModel = require('./InvoiceDocumentModel');
      let invoiceModel;
      
      if (documentData instanceof InvoiceDocumentModel) {
        invoiceModel = documentData;
      } else {
        invoiceModel = InvoiceDocumentModel.fromMap(documentData);
      }
      
      // Define collection names for pending and completed invoices
      const pendingCollectionName = 'myinvois_auto_pending';
      
      // Reference to the pending collection in Firestore
      const documentRef = fireStore
        .collection('myinvois')
        .doc(storeId)
        .collection(pendingCollectionName)
        .doc(documentId);
      
      // Save document data to Firestore
      await documentRef.set(invoiceModel.toMap());
      
      return {
        success: true,
        docId: documentId,
        message: `Invoice saved to ${pendingCollectionName} collection`
      };
    } catch (error) {
      console.error(`Error saving invoice to Firestore: ${error.message}`);
      return {
        success: false,
        error: `Failed to save invoice to Firestore: ${error.message}`
      };
    }
  }

  /**
   * Update invoice document in Firestore with submission results
   * @param {string} storeId - The store ID
   * @param {string} docId - Document ID (invoice code number)
   * @param {Object} submissionResult - Result of the submission
   * @returns {Promise<Object>} Result of the update operation
   */
  async _updateInvoiceWithSubmissionResults(storeId, docId, submissionResult) {
    try {
      // Define collection names
      const pendingCollectionName = 'myinvois_auto_pending';
      
      // Reference to the document in pending collection
      const documentRef = fireStore
        .collection('myinvois')
        .doc(storeId)
        .collection(pendingCollectionName)
        .doc(docId);
      
      // Get current document data
      const docSnapshot = await documentRef.get();
      if (!docSnapshot.exists) {
        return {
          success: false,
          error: 'Invoice document not found in pending collection'
        };
      }
      
      // Create InvoiceDocumentModel from document snapshot
      const InvoiceDocumentModel = require('./InvoiceDocumentModel');
      const invoiceModel = InvoiceDocumentModel.fromDocument(docSnapshot);
      
      // Make a copy of submissionResult with current date for submittedAt
      // and ensure no undefined values
      const cleanSubmissionResult = {
        success: submissionResult.success || false,
        step: submissionResult.step || '-',
        documentUuid: submissionResult.documentUuid || null,
        response: submissionResult.response || null,
        error: submissionResult.error || null,
        submittedAt: new Date()
      };
      
      // Update model with submission results
      const updatedModel = invoiceModel.withSubmissionResults(cleanSubmissionResult);
      
      // Convert to a clean object with no undefined values
      const updateData = JSON.parse(JSON.stringify(updatedModel.toMap()));
      
      // Update document in Firestore
      await documentRef.update(updateData);
      
      return {
        success: true,
        docId: docId,
        message: 'Invoice updated with submission results'
      };
    } catch (error) {
      console.error(`Error updating invoice with submission results: ${error.message}`);
      return {
        success: false,
        error: `Failed to update invoice with submission results: ${error.message}`
      };
    }
  }

  /**
   * Update invoice document in Firestore with validation results
   * @param {string} storeId - The store ID
   * @param {string} docId - Document ID (invoice code number)
   * @param {Object} validationResult - Result of the validation
   * @returns {Promise<Object>} Result of the update operation
   */
  async _updateInvoiceWithValidationResults(storeId, docId, validationResult) {
    try {
      // Define collection names
      const pendingCollectionName = 'myinvois_auto_pending';
      
      // Reference to the document in pending collection
      const documentRef = fireStore
        .collection('myinvois')
        .doc(storeId)
        .collection(pendingCollectionName)
        .doc(docId);
      
      // Get current document data
      const docSnapshot = await documentRef.get();
      if (!docSnapshot.exists) {
        return {
          success: false,
          error: 'Invoice document not found in pending collection'
        };
      }
      
      // Create InvoiceDocumentModel from document snapshot
      const InvoiceDocumentModel = require('./InvoiceDocumentModel');
      const invoiceModel = InvoiceDocumentModel.fromDocument(docSnapshot);
      
      // Clean validation result to avoid undefined values
      const cleanValidationResult = {
        success: validationResult.success || false,
        isValid: validationResult.isValid || false,
        documentDetails: validationResult.documentDetails || null,
        error: validationResult.error || null,
        validatedAt: new Date()
      };
      
      // Update model with validation results
      const updatedModel = invoiceModel.withValidationResults(cleanValidationResult);
      
      // Convert to a clean object with no undefined values
      const updateData = JSON.parse(JSON.stringify(updatedModel.toMap()));
      
      // Update document in Firestore
      await documentRef.update(updateData);
      
      // If document is valid, move it to completed collection
      let movedToCompleted = false;

      console.log("validationResult:", validationResult);

      if (validationResult.success && validationResult.isValid === true) {
        console.log("Moving invoice to completed collection...");
        const moveResult = await this._moveInvoiceToCompletedCollection(storeId, docId);
        movedToCompleted = moveResult.success;
      }
      
      return {
        success: true,
        docId: docId,
        message: 'Invoice updated with validation results',
        movedToCompleted: movedToCompleted
      };
    } catch (error) {
      console.error(`Error updating invoice with validation results: ${error.message}`);
      return {
        success: false,
        error: `Failed to update invoice with validation results: ${error.message}`
      };
    }
  }

  /**
   * Move a valid invoice document from pending to completed collection
   * @param {string} storeId - The store ID
   * @param {string} docId - Document ID (invoice code number)
   * @returns {Promise<Object>} Result of the move operation
   */
  async _moveInvoiceToCompletedCollection(storeId, docId) {
    try {
      // Define collection names
      const pendingCollectionName = 'myinvois_auto_pending';
      const doneCollectionName = 'myinvois_auto_done';
      
      // References to source and destination documents
      const sourceRef = fireStore
        .collection('myinvois')
        .doc(storeId)
        .collection(pendingCollectionName)
        .doc(docId);
      
      const destRef = fireStore
        .collection('myinvois')
        .doc(storeId)
        .collection(doneCollectionName)
        .doc(docId);
      
      // Get the source document
      const sourceDoc = await sourceRef.get();
      if (!sourceDoc.exists) {
        return {
          success: false,
          error: 'Source document not found in pending collection'
        };
      }
      
      // Create InvoiceDocumentModel from document snapshot
      const InvoiceDocumentModel = require('./InvoiceDocumentModel');
      const invoiceModel = InvoiceDocumentModel.fromDocument(sourceDoc);
      
      // Mark as completed with current date timestamp
      const completedModel = invoiceModel.asCompleted();
      
      // Convert to a clean object with no undefined values
      const completedData = JSON.parse(JSON.stringify(completedModel.toMap()));
      
      // Save to destination collection
      await destRef.set(completedData);
      
      // Delete from source collection
      await sourceRef.delete();
      
      return {
        success: true,
        docId: docId,
        message: 'Invoice moved from pending to completed collection'
      };
    } catch (error) {
      console.error(`Error moving invoice to completed collection: ${error.message}`);
      return {
        success: false,
        error: `Failed to move invoice to completed collection: ${error.message}`
      };
    }
  }

  /**
   * Get current timestamp in ISO format with no special characters
   * @returns {string} Formatted timestamp
   */
  getCurrentTimestamp() {
    const now = new Date();
    return now.toISOString()
      .replace(/[-:]/g, '')  // Remove dashes and colons
      .replace(/\.\d+/, '')  // Remove milliseconds
      .replace('T', '');     // Remove T separator
  }

  /**
   * API endpoint to generate a full invoice summary, with optional submission to MyInvois
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async generateInvoiceEndpoint(req, res) {
    try {
      const { storeId, submitToApi,  validateAfterSubmit } = req.body;
      
      if (!storeId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameter: storeId'
        });
      }
      
     
      // Call the internal method with the provided options
      const result = await this.generateFullInvoiceSummary({
        storeId,
        submitToApi: submitToApi === true,
        validateAfterSubmit: validateAfterSubmit === true,
        detailedLines: true
      });
      
      // Return the result
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in generateInvoiceEndpoint:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to generate invoice',
        error: error.message
      });
    }
  }

  /**
   * API endpoint to generate an invoice for a single order
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async generateOrderInvoiceEndpoint(req, res) {
    try {
      const { orderId, storeId, customerInfo, submitToApiOption, token } = req.body;
      
      if (!orderId || !storeId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: orderId and storeId are required'
        });
      }
      
      // Call the internal method with the provided options
      const result = await this.generateInvoiceForOrder({
        orderId,
        storeId,
        customerInfo: customerInfo || {},
        submitToApiOption: submitToApiOption === true,
        token: token || null
      });
      
      // Return the result
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in generateOrderInvoiceEndpoint:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to generate invoice for order',
        error: error.message
      });
    }
  }

  /**
   * Generate invoice for a single order
   * @param {Object} options - Options for generation
   * @param {string} options.orderId - ID of the order to generate invoice for
   * @param {string} options.storeId - Store ID
   * @param {Object} options.customerInfo - Customer information
   * @param {boolean} options.submitToApiOption - Whether to submit to the API
   * @param {string} options.token - Optional API token to use for submission
   * @returns {Promise<Object>} Result of the generation process
   */
  async generateInvoiceForOrder(options = {}) {
        const kTaxInclusive = 0;
        const kTaxExclusive = 1;
        const kUserDefault = "default";


    try {
      const { orderId, storeId, customerInfo = {}, submitToApiOption = false, token = null } = options;
      
      // Load the supplier model for the specified store
      const supplier = await this._loadSupplierData(storeId);
      
      if (!supplier) {
        return {
          success: false,
          error: 'Supplier information not found for store: ' + storeId
        };
      }
      
      // Load the specific order
      const orderRef = fireStore
        .collection('myinvois')
        .doc(storeId)
        .collection('order')
        .doc(orderId);
      
      const orderSnapshot = await orderRef.get();
      
      if (!orderSnapshot.exists) {
        return {
          success: false,
          error: 'Order not found with ID: ' + orderId
        };
      }
      
      const order = orderSnapshot.data();

      console.log('Order data:', order);
      
      // Extract financial values from the order
      const totalPrice = parseFloat(order.totalprice || '0.0');
      const tax = parseFloat(order.tax || '0.0');
      const serviceCharge = parseFloat(order.servicecharge || '0.0');
      const rounding = parseFloat(order.roundng || '0.0');
      const discount = parseFloat(order.totaldiscount || '0.0');
      const subtotal = totalPrice - tax - serviceCharge - rounding;
      
      // Process order items from the order
      const selectedItems = [];
      
      if (order.orderitems && Array.isArray(order.orderitems) && order.orderitems.length > 0) {
        for (const item of order.orderitems) {
          // Get the price and quantity from the order item

          console.log(item);

          const price = parseFloat(item.price || 0.0);
          const taxamount = parseFloat(item.taxamount || 0.0);
          const taxpercentage = parseFloat(item.taxpercentage || 0.0);
          const qty = parseInt(item.quantity || 0);
          const totalItemPrice = price * qty;
          const totalTaxAmount = taxamount * qty;
          
          // Create an item structured for invoice generation
          const orderItem = {
            id: item.id || item.menuId || Date.now().toString(),
            name: item.title || 'Item',
            price: price,
            qty: qty.toString(),
            total: totalItemPrice.toFixed(2),
            totaltax : totalTaxAmount.toFixed(2),
            taxpercentage: taxpercentage,
          };
          
          selectedItems.push(orderItem);
        }
      }
      
      // Create invoice lines from selected items
      const InvoiceLine = require('./InvoiceLine');
      const invoiceLines = [];
      
      var count = 1;
      for (const item of selectedItems) {
        invoiceLines.push(
          new InvoiceLine({
            id: count.toString(),
            quantity: item.qty,
            lineExtensionAmount: item.total,
            taxAmount: item.totaltax, // Individual tax not tracked per item
            taxPercentage: item.taxpercentage,
            itemDescription: item.name,
            originCountryCode: "MY",
            ptcClassificationCode: "", // refer to standard
            classClassificationCode: "022", // refer to standard
            priceAmount: item.price.toString(),
            itemPriceExtensionAmount: item.total,
            unitCode: "C62", // refer to standard
            currencyID: "MYR"
          })
        );

        count ++;
      }
      
      // Load store settings from Firestore
      const storeRef = fireStore.collection('store').doc(storeId);
      const storeDoc = await storeRef.get();

      if (!storeDoc.exists) {
        return {
          success: false,
          error: 'Store settings not found for store: ' + storeId
        };
      }

      const storeData = storeDoc.data();
      const storeTaxSettings = {
        serviceCharge: parseFloat(storeData.servicecharge || '0.0'),
        tax: parseFloat(storeData.tax || '0.0'),
        taxType: storeData.taxtype || kTaxInclusive,
        isTaxEnabled: storeData.istaxenabled || false,
        isServiceChargeEnabled: storeData.isservicechargeenabled || false,
        isRoundingForCashOnly: storeData.isroundingforcashonly || false
      };
      
      // Add service charge line if applicable
      if (serviceCharge > 0) {
        // Calculate tax for service charge based on store settings
        let serviceChargeTaxAmount = 0;
        if (storeTaxSettings.isTaxEnabled) {
          if (storeTaxSettings.taxType === kTaxInclusive) {
            // For inclusive tax, calculate tax portion from service charge
            serviceChargeTaxAmount = (serviceCharge * storeTaxSettings.tax) / (100 + storeTaxSettings.tax);
          } else {
            // For exclusive tax, calculate additional tax
            serviceChargeTaxAmount = (serviceCharge * storeTaxSettings.tax) / 100;
          }
        }

        // Add service charge as a separate line item
        invoiceLines.push(
          new InvoiceLine({
            id: count.toString(),
            quantity: "1",
            lineExtensionAmount: serviceCharge.toFixed(2),
            taxAmount: serviceChargeTaxAmount.toFixed(2),
            taxPercentage: storeTaxSettings.isTaxEnabled ? storeTaxSettings.tax : 0,
            itemDescription: `Service Charge (${storeTaxSettings.serviceCharge}%)`,
            originCountryCode: "MY",
            ptcClassificationCode: "NR", // refer to standard
            classClassificationCode: "022",
            priceAmount: serviceCharge.toFixed(2),
            itemPriceExtensionAmount: serviceCharge.toFixed(2),
            unitCode: "C62", // refer to standard
            currencyID: "MYR"
          })
        );
        count++;

        console.log(`Added service charge line item: ${serviceCharge.toFixed(2)} with tax ${serviceChargeTaxAmount.toFixed(2)}`);
      }
      
      // If no items were processed, add a fallback line
      if (invoiceLines.length === 0) {
        invoiceLines.push(
          new InvoiceLine({
            id: "1",
            quantity: "1",
            lineExtensionAmount: subtotal.toFixed(2),
            taxAmount: tax.toFixed(2),
            itemDescription: "Order #" + orderId,
            originCountryCode: "MY",
            ptcClassificationCode: "", // refer to standard
            classClassificationCode: "022", // refer to standard
            priceAmount: subtotal.toFixed(2),
            itemPriceExtensionAmount: subtotal.toFixed(2),
            unitCode: "C62", // refer to standard
            currencyID: "MYR"
          })
        );
      }
      
      // Generate a unique invoice ID based on order ID
      const invoiceId = "INV-" + (orderId);
      
      // Create invoice header with all details
      const InvoiceHeader = require('./InvoiceHeader');
      const invoiceHeader = new InvoiceHeader({
        id: invoiceId,
        dateTime: new Date(),
        // Supplier information from supplier model
        supplierRegistrationName: supplier.registrationName,
        supplierCompanyID: supplier.companyID,
        supplierAddressLine1: supplier.addressLine1,
        supplierAddressLine2: supplier.addressLine2,
        supplierAddressLine3: supplier.addressLine3,
        supplierCity: supplier.city,
        supplierPostalZone: supplier.postalZone,
        supplierCountrySubentityCode: supplier.countrySubentityCode,
        supplierCountryCode: supplier.countryCode,
        supplierTIN: supplier.tin,
        supplierNRIC: supplier.nric,
        supplierIndustryCode: supplier.industryCode,
        supplierIndustryName: supplier.industryName,
        supplierTelephone: supplier.telephone,
        supplierEmail: supplier.email,
        supplierCertEX: supplier.certEX,
        
        // Customer information from parameters, falling back to order data
        customerPartyName: customerInfo.customerPartyName || order.name || '',
        customerRegistrationName: customerInfo.customerRegistrationName || '',
        customerTIN: customerInfo.customerTIN || '',
        customerBRN: customerInfo.customerBRN || '',
        customerNRIC: customerInfo.customerNRIC || '',
        customerAddressLine1: customerInfo.customerAddressLine1 || '',
        customerAddressLine2: customerInfo.customerAddressLine2 || '',
        customerAddressLine3: customerInfo.customerAddressLine3 || '',
        customerCity: customerInfo.customerCity || '',
        customerPostalZone: customerInfo.customerPostalZone || '',
        customerCountrySubentityCode: customerInfo.customerCountrySubentityCode || '',
        customerCountryCode: customerInfo.customerCountryCode || 'MYS',
        customerEmail: customerInfo.customerEmail || order.email || '',
        customerPhone: customerInfo.customerPhone || order.userPhoneNumber || '',
        customerTelephone: customerInfo.customerTelephone || order.userPhoneNumber || '',
        
        // Financial information
        paymentMeansCode: "",
        invoiceLines: invoiceLines,
        taxAmount: tax.toFixed(2),
        lineExtensionAmount: subtotal.toFixed(2),
        taxExclusiveAmount: subtotal.toFixed(2),
        taxInclusiveAmount: (subtotal + tax).toFixed(2),
        allowanceTotalAmount: discount.toFixed(2),
        chargeTotalAmount: serviceCharge.toFixed(2),
        payableRoundingAmount: rounding.toFixed(2),
        payableAmount: totalPrice.toFixed(2),
        currencyID: "MYR"
      });
      
      // Generate the full XML
      const xmlContent = invoiceHeader.toFullXml();

      console.log("XML Content:");
      console.log(xmlContent);
      
      // Generate Base64 encoding of XML content
      const base64String = Buffer.from(xmlContent).toString('base64');
      
      // Generate SHA256 hash
      const crypto = require('crypto');
      const sha256Hex = crypto.createHash('sha256').update(xmlContent).digest('hex');
      
      // Create InvoiceDocumentModel
      const InvoiceDocumentModel = require('./InvoiceDocumentModel');
      const invoiceDocumentModel = new InvoiceDocumentModel({
        codeNumber: invoiceId,
        documentHash: sha256Hex,
        document: base64String,
        format: "XML",
        xml: xmlContent,
        createdAt: new Date(),
        status: "pending"
      });
      
      // Convert to map for API and Firestore operations
      const documentData = invoiceDocumentModel.toMap();
      // Add additional metadata
      documentData.orderId = orderId; // Save reference to original order
      documentData.storeId = storeId; // Store reference to the store
      documentData.items = selectedItems; // Store the items for reference
      
      // Save document to Firestore
      const saveResult = await this._saveInvoiceToFirestore(storeId, invoiceId, documentData);
      if (!saveResult.success) {
        return {
          success: false,
          error: 'Failed to save invoice to Firestore: ' + saveResult.error,
          step: 'firestore_save'
        };
      }
      
      // Prepare result
      const result = {
        success: true,
        invoiceId: invoiceId,
        orderId: orderId,
        supplier: supplier,
        items: selectedItems,
        documentData: documentData,
        firestoreSave: saveResult
      };
      
      // If submitToApi is true, also submit the document to the API
      if (submitToApiOption) {


        console.log("Submitting document to API...");
        console.log(documentData);




        const submissionResult = await this._submitToApi({
          documentData, 
          supplier,
          accessToken: token
        });
        result.submission = submissionResult;

        console.log("submission result");
        console.log(submissionResult)
        
        // Update Firestore with submission results
        const updateResult = await this._updateInvoiceWithSubmissionResults(
          storeId,
          invoiceId, 
          submissionResult
        );
        result.firestoreUpdate = updateResult;
        
        // If submission was successful and we have a document UUID, validate it
        if (submissionResult.success && submissionResult.documentUuid) {
          const documentUuid = submissionResult.documentUuid;
          const accessToken = submissionResult.accessToken;
          
          // Validate the document
          console.log('Validating document after submission...');
          const validationResult = await this._validateDocument(
            accessToken,
            documentUuid
          );
          
          console.log('Validation result:', validationResult);
          const validationUpdateResult = await this._updateInvoiceWithValidationResults(
            storeId,
            invoiceId,
            validationResult
          );
          
          result.validation = validationResult;
          result.validationUpdate = validationUpdateResult;
        }
      }
      
      return result;
    } catch (e) {
      console.error('Error in generateInvoiceForOrder:', e);
      return {
        success: false,
        error: e.toString()
      };
    }
  }

  /**
   * Move an order document from source collection to completed collection
   * @param {string} storeId - The store ID
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Result of the move operation
   */
  async _moveOrderToCompletedCollection(storeId, orderId) {
    try {
      if (!storeId || !orderId) {
        return {
          success: false,
          error: 'Missing required parameters: storeId and orderId are required'
        };
      }

      // Define collection paths
      const sourceCollection = 'myinvois';
      const destinationCollection = 'myinvois_done';
      
      // References to source and destination documents
      const sourceRef = fireStore
        .collection(sourceCollection)
        .doc(storeId)
        .collection('order')
        .doc(orderId);
      
      const destRef = fireStore
        .collection(destinationCollection)
        .doc(storeId)
        .collection('order')
        .doc(orderId);
      
      // Get the source document
      const sourceDoc = await sourceRef.get();
      if (!sourceDoc.exists) {
        return {
          success: false,
          error: `Source document not found: ${sourceCollection}/${storeId}/order/${orderId}`
        };
      }
      
      // Get document data
      const orderData = sourceDoc.data();
      
      // Add timestamp for when it was moved
      const dataToMove = {
        ...orderData,
        moved_at: new Date(),
        status: 'completed'
      };
      
      // Save to destination collection
      await destRef.set(dataToMove);
      
      // Delete from source collection
      await sourceRef.delete();
      
      console.log(`Successfully moved order ${orderId} for store ${storeId} to ${destinationCollection}`);
      
      return {
        success: true,
        orderId: orderId,
        storeId: storeId,
        message: `Order document successfully moved to ${destinationCollection}`
      };
    } catch (error) {
      console.error(`Error moving order to completed collection: ${error.message}`);
      return {
        success: false,
        error: `Failed to move order document: ${error.message}`,
        orderId: orderId,
        storeId: storeId
      };
    }
  }

  /**
   * Check if order exists in my_vois_done and check for related invoice documents
   * @param {string} storeId - The store ID
   * @param {string} orderId - Order ID
   * @param {boolean} includeDocData - Whether to include full document data (default: false)
   * @returns {Promise<Object>} Status information and document details
   */
  async _checkOrderInvoiceStatus(storeId, orderId, includeDocData = false) {
    try {
      if (!storeId || !orderId) {
        return {
          success: false,
          error: 'Missing required parameters: storeId and orderId are required'
        };
      }

      // Define collection paths
      const doneCollection = 'myinvois_done';
      const pendingInvoiceCollection = 'myinvois_auto_pending';
      const doneInvoiceCollection = 'myinvois_auto_done';
      
      // Check if order exists in done collection
      const doneOrderRef = fireStore
        .collection(doneCollection)
        .doc(storeId)
        .collection('order')
        .doc(orderId);
      
      const doneOrderDoc = await doneOrderRef.get();
      const orderExists = doneOrderDoc.exists;
      let orderData = null;
      
      if (orderExists) {
        if (includeDocData) {
          orderData = doneOrderDoc.data();
        }
        console.log(`Order ${orderId} found in ${doneCollection} collection`);
      } else {
        console.log(`Order ${orderId} not found in ${doneCollection} collection`);
        // Check original collection as well
        const sourceOrderRef = fireStore
          .collection('my_invois')
          .doc(storeId)
          .collection('order')
          .doc(orderId);
        
        const sourceOrderDoc = await sourceOrderRef.get();
        if (sourceOrderDoc.exists) {
          if (includeDocData) {
            orderData = sourceOrderDoc.data();
          }
          console.log(`Order ${orderId} found in my_invois collection`);
        } else {
          return {
            success: false,
            exists: false,
            error: `Order document not found in any collection: ${orderId}`
          };
        }
      }
      
      // Generate invoice ID using the same pattern as in the other function
      const invoiceId = "INV-" + orderId;
      
      // Check if invoice exists in pending collection
      const pendingInvoiceRef = fireStore
        .collection('myinvois')
        .doc(storeId)
        .collection(pendingInvoiceCollection)
        .doc(invoiceId);
      
      const pendingInvoiceDoc = await pendingInvoiceRef.get();
      const pendingInvoiceExists = pendingInvoiceDoc.exists;
      
      // Check if invoice exists in done collection
      const doneInvoiceRef = fireStore
        .collection('myinvois')
        .doc(storeId)
        .collection(doneInvoiceCollection)
        .doc(invoiceId);
      
      const doneInvoiceDoc = await doneInvoiceRef.get();
      const doneInvoiceExists = doneInvoiceDoc.exists;
      
      // Determine status and collect document data
      let status = 'none';
      let invoiceData = null;
      
      if (doneInvoiceExists) {
        status = 'done';
        if (includeDocData) {
          invoiceData = doneInvoiceDoc.data();
        }
        console.log(`Invoice ${invoiceId} found in ${doneInvoiceCollection} collection`);
      } else if (pendingInvoiceExists) {
        status = 'pending';
        if (includeDocData) {
          invoiceData = pendingInvoiceDoc.data();
        }
        console.log(`Invoice ${invoiceId} found in ${pendingInvoiceCollection} collection`);
      } else {
        console.log(`No invoice found for order ${orderId} (invoice ID: ${invoiceId})`);
      }
      
      // Build response object
      const result = {
        success: true,
        orderExists: orderExists,
        invoiceId: invoiceId,
        invoiceStatus: status,
        storeId: storeId,
        orderId: orderId
      };
      
      // Only include document data if requested
      if (includeDocData) {
        result.orderData = orderData;
        result.invoiceData = invoiceData;
      }
      
      return result;
    } catch (error) {
      console.error(`Error checking order invoice status: ${error.message}`);
      return {
        success: false,
        error: `Failed to check order invoice status: ${error.message}`,
        orderId: orderId,
        storeId: storeId
      };
    }
  }

  /**
   * API endpoint to move an order to the completed collection
   * @param {Object} req - Express request object with storeId and orderId in body
   * @param {Object} res - Express response object
   */
  async moveOrderToCompletedEndpoint(req, res) {
    try {
      const { storeId, orderId } = req.body;
      
      if (!storeId || !orderId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: storeId and orderId are required'
        });
      }
      
      // Call the internal method
      const result = await this._moveOrderToCompletedCollection(storeId, orderId);
      
      // Return the result
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in moveOrderToCompletedEndpoint:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to move order to completed collection',
        error: error.message
      });
    }
  }

  /**
   * API endpoint to check an order's invoice status
   * @param {Object} req - Express request object with storeId and orderId in body
   * @param {Object} res - Express response object
   */
  async checkOrderInvoiceEndpoint(req, res) {
    try {
      const { storeId, orderId, includeDocData } = req.body;
      
      if (!storeId || !orderId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: storeId and orderId are required'
        });
      }
      
      // Convert includeDocData to boolean, defaulting to false
      const shouldIncludeData = includeDocData === true;
      
      // Call the internal method with the includeDocData parameter
      const result = await this._checkOrderInvoiceStatus(storeId, orderId, shouldIncludeData);
      
      // Return the result
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in checkOrderInvoiceEndpoint:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to check order invoice status',
        error: error.message
      });
    }
  }

  /**
   * API endpoint to validate a document and update the corresponding invoice
   * @param {Object} req - Express request object with token, uuid, storeId, and invoiceId in body
   * @param {Object} res - Express response object
   */
  async validateAndUpdateInvoiceEndpoint(req, res) {
    try {
      const { token, uuid, storeId, invoiceId } = req.body;
      
      if (!token || !uuid || !storeId || !invoiceId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: token, uuid, storeId, and invoiceId are required'
        });
      }

      // First get document details
      const url = `${this.InvoisURL}/api/v1.0/documents/${uuid}/details`;
      const headers = {
        'Authorization': `Bearer ${token}`
      };

      const response = await axios.get(url, { headers });

      // Validate the document
      console.log('Validating document...');
      const validationResult = await this._validateDocument(token, uuid);
      
      // Update invoice with validation results
      console.log('Updating invoice with validation results...');
      const validationUpdateResult = await this._updateInvoiceWithValidationResults(
        storeId,
        invoiceId,
        validationResult
      );

      return res.status(200).json({
        success: true,
        data: response.data,
        validation: validationResult,
        validationUpdate: validationUpdateResult
      });
      
    } catch (error) {
      console.error('Error in validateAndUpdateInvoiceEndpoint:', error.message);
      
      return res.status(error.response?.status || 500).json({
        success: false,
        message: 'Failed to validate and update invoice',
        error: error.message,
        details: error.response?.data
      });
    }
  }

  /**
   * API endpoint to delete a record from BigQuery based on orderId
   * @param {Object} req - Express request object with orderId in body
   * @param {Object} res - Express response object
   */
  async deleteBigQueryRecordEndpoint(req, res) {
    try {
      const { orderId } = req.body;
      
      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameter: orderId is required'
        });
      }

      // Hardcoded credentials - same as in other BigQuery methods
      const credentials = {
        "type": "service_account",
        "project_id": "foodio-ab3b2",
        "private_key_id": "783981daf70c7577f7b29cdaccbacbdfd3dfcbe2",
        "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQChX45UDg90ghjQ\nU+YDKVEzYWU08z5zBcbtcFN8RK+73p6mkURlhFsayxUH5SVY8u/92rKBe4OMSwZy\nXiQf9Mixr0NlTn3tr5XpK8Gq1GkHXc0LH8njcz82ZEu+d0jys6w/GBqLfOOI7HPc\n1USMNAqOFx0gOYGS/vNuXI/IP4OftJoy60Q84VWd0yBFwOpediA8UpJLVWUKZ/ha\nJ09eBNwfjpUv2hE2RVrhZ1RVKztBNTkdBlpjxXMLQQ9l2Zh4BLr5oRhNiibeE3tL\nvGNEHbqpWE70L/E+psKZ+PpmZWI3DjAdyr1MXFkmB4evVZ1i/DKh0TVcg/vnQgnt\nPJekuLV1AgMBAAECggEAH8oxwShF7idE2SF2AfBtQShyJhS3HDSqpBLJN4VWczWf\nXmPmq/L/eY9BNN101omBMqqXGL/qwcPz4KrgBfWUZcCHj9j/IMhCyXznuY3/pMZb\nQtI/1NFaxg3LCBn6omk3yPQoIot3TX17M6lFyDLmU2iFQdhiSMF11itg3ct5VAgR\nUzLb7QSnyPFez0j3sIsNRtwXvQXfgjcyvvwEWZTb+rd8jZ48n5XNlUYEK2JJmjc+\nZRe3QmnVPhevjirtZpik3cDbUKsXQY8HlGTQlOEEeDvnGBtgcDzuzNGpqWG33nFr\nDdKo8ryioLcmlkVjEElsrCtSaHYLm/oAxoRhOsZNbwKBgQDXZXfsxvjO35wmnsau\nIHdcq1++xhwHj+P88MRq9va2H8JY/GESQFgehCbgiLqBTPBFSEaKpNsQ3INyrUcl\nl8E9BJahpMXE8NS41+UKdPWMvoT1TnSeGFtQMIWm5381RZPhYQ/MSoV80VVPc8pN\nB6GZqt/purbenOp7hbzsbElk8wKBgQC/yw66TL33ucepPkklBbxrlmTmRrOb9Rpn\nfrT8nxtxRJWruegDQdKugeIv77oBCloO3GkxNja9wOkGQ0ZnYn+alQZ5//nkYKm+\nRSgFXZ160YG35MIa+OYwtssl/NghvJ5MBBHx5sqHoo71QJxo3KDNYVgYr6mZf2lg\nm/Zy0HY19wKBgFOl8SO/xaI5Tp/k6012CESxvPYOY5ZAOA7jxbOwgvEJdmUuZdg7\nqrz3H031a1CJe4m8XsC68uQibt3bExUzUPUMUh8mKTOpP0MlfKpJ744f8ux88mbv\nGI8UuOKvZkRe5+YP1p3ElwB5HwNC+V5ex1Aw/tH7E8dx8tHThyHdj8cnAoGBALAZ\nM4afG/WvIMImrGZP4/cs+avt0tAptnq8flVNiZbwkDRC1+LVtyn/m7zD8hcueA4Z\nFoTW8GA+Fjdn4ebfK6a1mmK+Q6YLkw9e1CZJFGVGpEJCym6VhlXIILLae2BOnVHS\nkt93NxJekcBh+LrXiNXKwWa5M5H6yLipuxkkisV1AoGAamEj4hEH6H+XlAGP4dzP\nrvD7itMwg9/RxXaakP7JGgeUiCOedFhz5p/GtdjyeE/Gnqo5XPGMZUdOPjq79Ld1\n2BkO5chQkoJrZj7tu3Aozf9Xc5E9lAkmL6ISk3K8RSfgWJTOKSz7IjW92oUM/ros\n8Pq6ipW5jCmnrdJskQf0IZo=\n-----END PRIVATE KEY-----\n",
        "client_email": "bigquery-writer@foodio-ab3b2.iam.gserviceaccount.com",
        "client_id": "109208958086189621894",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/bigquery-writer%40foodio-ab3b2.iam.gserviceaccount.com",
        "universe_domain": "googleapis.com"
      };

      // Create BigQuery client with hardcoded credentials
      const bigquery = new BigQuery({
        projectId: 'foodio-ab3b2',
        credentials: credentials
      });

      // Build the DELETE query with parameterization for safety
      const queryOptions = {
        query: `
          DELETE FROM \`foodio-ab3b2.firestore_myinvois.myinvois_raw_changelog\`
          WHERE document_id = @orderId
        `,
        params: {
          orderId: orderId
        },
        location: 'US',
        useQueryCache: false
      };

      // Execute the DELETE query
      await bigquery.query(queryOptions);

      console.log(`Successfully deleted record with document_id (orderId): ${orderId} from BigQuery`);

      return res.status(200).json({
        success: true,
        message: `Successfully deleted record with document_id (orderId): ${orderId} from BigQuery`,
        orderId: orderId
      });
      
    } catch (error) {
      console.error('Error deleting record from BigQuery:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to delete record from BigQuery',
        error: error.message,
        orderId: req.body.orderId
      });
    }
  }

  /**
   * API endpoint to delete all records from BigQuery for a specific storeId
   * @param {Object} req - Express request object with storeId in body
   * @param {Object} res - Express response object
   */
  async deleteAllStoreEntriesEndpoint(req, res) {
    try {
      const { storeId } = req.body;
      
      if (!storeId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameter: storeId is required'
        });
      }

      // Hardcoded credentials - same as in other BigQuery methods
      const credentials = {
        "type": "service_account",
        "project_id": "foodio-ab3b2",
        "private_key_id": "783981daf70c7577f7b29cdaccbacbdfd3dfcbe2",
        "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQChX45UDg90ghjQ\nU+YDKVEzYWU08z5zBcbtcFN8RK+73p6mkURlhFsayxUH5SVY8u/92rKBe4OMSwZy\nXiQf9Mixr0NlTn3tr5XpK8Gq1GkHXc0LH8njcz82ZEu+d0jys6w/GBqLfOOI7HPc\n1USMNAqOFx0gOYGS/vNuXI/IP4OftJoy60Q84VWd0yBFwOpediA8UpJLVWUKZ/ha\nJ09eBNwfjpUv2hE2RVrhZ1RVKztBNTkdBlpjxXMLQQ9l2Zh4BLr5oRhNiibeE3tL\nvGNEHbqpWE70L/E+psKZ+PpmZWI3DjAdyr1MXFkmB4evVZ1i/DKh0TVcg/vnQgnt\nPJekuLV1AgMBAAECggEAH8oxwShF7idE2SF2AfBtQShyJhS3HDSqpBLJN4VWczWf\nXmPmq/L/eY9BNN101omBMqqXGL/qwcPz4KrgBfWUZcCHj9j/IMhCyXznuY3/pMZb\nQtI/1NFaxg3LCBn6omk3yPQoIot3TX17M6lFyDLmU2iFQdhiSMF11itg3ct5VAgR\nUzLb7QSnyPFez0j3sIsNRtwXvQXfgjcyvvwEWZTb+rd8jZ48n5XNlUYEK2JJmjc+\nZRe3QmnVPhevjirtZpik3cDbUKsXQY8HlGTQlOEEeDvnGBtgcDzuzNGpqWG33nFr\nDdKo8ryioLcmlkVjEElsrCtSaHYLm/oAxoRhOsZNbwKBgQDXZXfsxvjO35wmnsau\nIHdcq1++xhwHj+P88MRq9va2H8JY/GESQFgehCbgiLqBTPBFSEaKpNsQ3INyrUcl\nl8E9BJahpMXE8NS41+UKdPWMvoT1TnSeGFtQMIWm5381RZPhYQ/MSoV80VVPc8pN\nB6GZqt/purbenOp7hbzsbElk8wKBgQC/yw66TL33ucepPkklBbxrlmTmRrOb9Rpn\nfrT8nxtxRJWruegDQdKugeIv77oBCloO3GkxNja9wOkGQ0ZnYn+alQZ5//nkYKm+\nRSgFXZ160YG35MIa+OYwtssl/NghvJ5MBBHx5sqHoo71QJxo3KDNYVgYr6mZf2lg\nm/Zy0HY19wKBgFOl8SO/xaI5Tp/k6012CESxvPYOY5ZAOA7jxbOwgvEJdmUuZdg7\nqrz3H031a1CJe4m8XsC68uQibt3bExUzUPUMUh8mKTOpP0MlfKpJ744f8ux88mbv\nGI8UuOKvZkRe5+YP1p3ElwB5HwNC+V5ex1Aw/tH7E8dx8tHThyHdj8cnAoGBALAZ\nM4afG/WvIMImrGZP4/cs+avt0tAptnq8flVNiZbwkDRC1+LVtyn/m7zD8hcueA4Z\nFoTW8GA+Fjdn4ebfK6a1mmK+Q6YLkw9e1CZJFGVGpEJCym6VhlXIILLae2BOnVHS\nkt93NxJekcBh+LrXiNXKwWa5M5H6yLipuxkkisV1AoGAamEj4hEH6H+XlAGP4dzP\nrvD7itMwg9/RxXaakP7JGgeUiCOedFhz5p/GtdjyeE/Gnqo5XPGMZUdOPjq79Ld1\n2BkO5chQkoJrZj7tu3Aozf9Xc5E9lAkmL6ISk3K8RSfgWJTOKSz7IjW92oUM/ros\n8Pq6ipW5jCmnrdJskQf0IZo=\n-----END PRIVATE KEY-----\n",
        "client_email": "bigquery-writer@foodio-ab3b2.iam.gserviceaccount.com",
        "client_id": "109208958086189621894",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/bigquery-writer%40foodio-ab3b2.iam.gserviceaccount.com",
        "universe_domain": "googleapis.com"
      };

      // Create BigQuery client with hardcoded credentials
      const bigquery = new BigQuery({
        projectId: 'foodio-ab3b2',
        credentials: credentials
      });

      // First, get count of records to be deleted
      const countQuery = `
        SELECT COUNT(*) as total_count 
        FROM \`foodio-ab3b2.firestore_myinvois.myinvois_raw_changelog\`
        WHERE document_name LIKE '%/myinvois/${storeId}/%'
      `;

      const [countRows] = await bigquery.query({ query: countQuery });
      const totalCount = countRows[0].total_count;

      if (totalCount === 0) {
        return res.status(200).json({
          success: true,
          message: `No records found for storeId: ${storeId}`,
          deletedCount: 0
        });
      }

      // Build the DELETE query with parameterization for safety
      const deleteQuery = `
        DELETE FROM \`foodio-ab3b2.firestore_myinvois.myinvois_raw_changelog\`
        WHERE document_name LIKE '%/myinvois/${storeId}/%'
      `;

      // Execute the DELETE query
      await bigquery.query({ query: deleteQuery });

      console.log(`Successfully deleted ${totalCount} records for storeId: ${storeId} from BigQuery`);

      return res.status(200).json({
        success: true,
        message: `Successfully deleted all records for storeId: ${storeId} from BigQuery`,
        deletedCount: totalCount,
        storeId: storeId
      });
      
    } catch (error) {
      console.error('Error deleting store entries from BigQuery:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to delete store entries from BigQuery',
        error: error.message,
        storeId: req.body.storeId
      });
    }
  }

  /**
   * Query all consolidated data for report submission
   * Returns raw data from BigQuery filtered by store and previous month (Malaysia time)
   */
  async queryConsolidatedDataEndpoint(req, res) {
    try {
      // Extract parameters from request body
      const { storeid } = req.body;
      
      if (!storeid) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameter: storeid'
        });
      }

      // Build query with filtering by storeId and previous month in Malaysia time
      const query = `
        SELECT document_id, data, timestamp
        FROM \`foodio-ab3b2.firestore_myinvois.myinvois_raw_latest\`
        WHERE operation != 'DELETE' 
          AND document_name LIKE '%/myinvois/${storeid}/%'
          AND EXTRACT(YEAR FROM DATETIME(TIMESTAMP(timestamp), "Asia/Kuala_Lumpur")) = 
              EXTRACT(YEAR FROM DATE_SUB(CURRENT_DATE("Asia/Kuala_Lumpur"), INTERVAL 1 MONTH))
          AND EXTRACT(MONTH FROM DATETIME(TIMESTAMP(timestamp), "Asia/Kuala_Lumpur")) = 
              EXTRACT(MONTH FROM DATE_SUB(CURRENT_DATE("Asia/Kuala_Lumpur"), INTERVAL 1 MONTH))
        ORDER BY timestamp DESC
      `;

      // Set query options
      const options = {
        query: query,
        location: 'US',
        useQueryCache: true
      };

      console.log(`Querying consolidated data for store: ${storeid}`);
      console.log(`Query: ${query}`);

      // Execute the query
      const [rows] = await this.bigquery.query(options);
      console.log(`Retrieved ${rows.length} records for consolidated data query`);

      // Process raw data into structured format
      const consolidatedData = [];
      let totalRecords = 0;
      let processedRecords = 0;
      let errorRecords = 0;

      for (const row of rows) {
        totalRecords++;
        try {
          // Parse the JSON data
          const parsedData = JSON.parse(row.data);
          
          // Add structured record with metadata
          consolidatedData.push({
            document_id: row.document_id,
            timestamp: row.timestamp,
            order_data: parsedData,
            // Extract key order information for quick reference
            order_summary: {
              order_id: parsedData.orderid || parsedData.id,
              total_price: parseFloat(parsedData.totalprice || 0),
              payment_type: parsedData.paymenttype,
              order_datetime: parsedData.orderdatetime,
              store_id: parsedData.storeid,
              total_paid: parseFloat(parsedData.totalpaid || 0),
              epay_amount: parseFloat(parsedData.epayamount || 0),
              tax: parseFloat(parsedData.tax || 0),
              service_charge: parseFloat(parsedData.servicecharge || 0),
              total_discount: parseFloat(parsedData.totaldiscount || 0)
            }
          });
          
          processedRecords++;
        } catch (parseError) {
          console.error(`Error parsing data for document ${row.document_id}:`, parseError);
          errorRecords++;
          
          // Still include the record but mark it as having parse errors
          consolidatedData.push({
            document_id: row.document_id,
            timestamp: row.timestamp,
            raw_data: row.data,
            parse_error: parseError.message,
            order_summary: null
          });
        }
      }

      // Calculate summary statistics
      const totalAmount = consolidatedData
        .filter(record => record.order_summary)
        .reduce((sum, record) => sum + record.order_summary.total_price, 0);

      const totalTax = consolidatedData
        .filter(record => record.order_summary)
        .reduce((sum, record) => sum + record.order_summary.tax, 0);

      const totalServiceCharge = consolidatedData
        .filter(record => record.order_summary)
        .reduce((sum, record) => sum + record.order_summary.service_charge, 0);

      // Return comprehensive response
      return res.status(200).json({
        success: true,
        message: 'Consolidated data retrieved successfully',
        query_info: {
          store_id: storeid,
          query_period: 'Previous Month (Malaysia Time)',
          query_timestamp: new Date().toISOString(),
          total_records: totalRecords,
          processed_records: processedRecords,
          error_records: errorRecords
        },
        summary_statistics: {
          total_amount: parseFloat(totalAmount.toFixed(2)),
          total_tax: parseFloat(totalTax.toFixed(2)),
          total_service_charge: parseFloat(totalServiceCharge.toFixed(2)),
          average_order_value: processedRecords > 0 ? parseFloat((totalAmount / processedRecords).toFixed(2)) : 0
        },
        data: consolidatedData
      });

    } catch (error) {
      console.error('Error querying consolidated data:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to query consolidated data',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = MyInvoisRouter; 