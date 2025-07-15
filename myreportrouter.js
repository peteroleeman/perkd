const express = require('express');
const {BigQuery} = require('@google-cloud/bigquery');
const firebase = require("./db");
const fireStore = firebase.firestore();

class MyReportRouter {

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
    this.router.post('/querybigquery', this.queryBigQuery.bind(this));
    this.router.post('/queryrawdata', this.queryRawData.bind(this));
  }

  about(req, res) {
    res.json({ version: '1.0.0', service: 'MyReport API' });
  }

  /**
   * Query BigQuery to get myreport raw data with pagination support
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
      whereClause += ` AND document_name LIKE '%/myreport/${storeid}/%'`;
    }

    // Build query with pagination and filtering
    const query = `
      SELECT * 
      FROM \`foodio-ab3b2.firestore_myreport.myreport_raw_latest\`
      ${whereClause}
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Get total count in a separate query (for first page only)
    let totalCount = null;
    if (offset === 0) {
      const countQuery = `
        SELECT COUNT(*) as total_count 
        FROM \`foodio-ab3b2.firestore_myreport.myreport_raw_latest\`
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

    console.log(`Successfully queried BigQuery for myreport, retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${storeid ? ', filtered by storeId: ' + storeid : ''})`);

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
    console.error('Error querying BigQuery for myreport:', error.message);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to query BigQuery for myreport',
      error: error.message
    });
  }
}

  /**
   * Query BigQuery and return only the parsed data field for myreport
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
        whereClause += ` AND document_name LIKE '%/myreport/${storeid}/%'`;
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
          FROM \`foodio-ab3b2.firestore_myreport.myreport_raw_latest\`
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
            FROM \`foodio-ab3b2.firestore_myreport.myreport_raw_latest\`
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

      console.log(`Successfully queried latest myreport raw data, retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${storeid ? ', filtered by storeId: ' + storeid : ''})`);

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
      console.error('Error querying myreport raw data:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to query myreport raw data',
        error: error.message
      });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = MyReportRouter; 