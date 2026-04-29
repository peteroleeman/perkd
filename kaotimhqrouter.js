const express = require('express');
const {BigQuery} = require('@google-cloud/bigquery');
const firebase = require("./db");
const fireStore = firebase.firestore();

class KaotimHQRouter {

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
    res.json({ version: '1.0.0', service: 'KaotimHQ API' });
  }

  /**
   * Query BigQuery to get kaotim_hq raw data with pagination support
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
 async queryBigQuery(req, res) {
  try {
    // Extract pagination parameters from request body
    const limit = parseInt(req.body.limit) || 100; // Default to 100 records
    const offset = parseInt(req.body.offset) || 0; // Default to starting from the beginning
    const storeIds = req.body.storeIds || null; // Get list of storeIds
    const storeId = req.body.storeId || null; // Get the storeId filter
    
    // Build the WHERE clause for filtering
    let whereClause = 'WHERE operation != \'DELETE\'';
    
    let idList = [];
    if (Array.isArray(storeIds)) {
      idList = storeIds;
    } else if (storeId) {
      idList = [storeId];
    }

    if (idList.length > 0) {
        // Create a pattern to match the storeId in the document_name
        // Based on sample: projects/foodio-ab3b2/databases/(default)/documents/kaotim_hq/S_e7409d65-c856-482f-ac40-d9497eea8b1b_2026-01-10
        const conditions = idList.map(id => `document_name LIKE '%/kaotim_hq/${id}_%'`);
        whereClause += ` AND (${conditions.join(' OR ')})`;
    }

    // Build query with pagination and filtering
    const query = `
      SELECT * 
      FROM \`foodio-ab3b2.firestore_kaotim_hq.kaotim_hq_raw_changelog\`
      ${whereClause}
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Get total count in a separate query (for first page only)
    let totalCount = null;
    if (offset === 0) {
      const countQuery = `
        SELECT COUNT(*) as total_count 
        FROM \`foodio-ab3b2.firestore_kaotim_hq.kaotim_hq_raw_changelog\`
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

    console.log(`Successfully queried BigQuery for kaotim_hq, retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${storeId ? ', filtered by storeId: ' + storeId : ''})`);

    return res.status(200).json({
      success: true,
      count: rows.length,
      total: totalCount,
      offset: offset,
      limit: limit,
      storeId: storeId,
      hasMore: rows.length === limit, // Indicate if there might be more records
      nextOffset: offset + limit, // Provide the next offset for pagination
      data: rows
    });
    
  } catch (error) {
    console.error('Error querying BigQuery for kaotim_hq:', error.message);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to query BigQuery for kaotim_hq',
      error: error.message
    });
  }
}

  /**
   * Query BigQuery and return only the parsed data field for kaotim_hq
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async queryRawData(req, res) {
    try {
      // Extract pagination parameters from request body
      const limit = parseInt(req.body.limit) || 100; // Default to 100 records
      const offset = parseInt(req.body.offset) || 0; // Default to starting from the beginning
      const storeIds = req.body.storeIds || null; // Get list of storeIds
      const storeId = req.body.storeId || null; // Get the storeId filter

      // Build the WHERE clause for filtering
      let whereClause = 'WHERE operation != \'DELETE\'';
      
      let idList = [];
      if (Array.isArray(storeIds)) {
        idList = storeIds;
      } else if (storeId) {
        idList = [storeId];
      }

      if (idList.length > 0) {
        // Create a pattern to match the storeId in the document_name
        // Based on sample: projects/foodio-ab3b2/databases/(default)/documents/kaotim_hq/S_e7409d65-c856-482f-ac40-d9497eea8b1b_2026-01-10
        const conditions = idList.map(id => `document_name LIKE '%/kaotim_hq/${id}_%'`);
        whereClause += ` AND (${conditions.join(' OR ')})`;
      }


      // Query to get all raw records
      const query = `
        SELECT document_id, data, timestamp
        FROM \`foodio-ab3b2.firestore_kaotim_hq.kaotim_hq_raw_changelog\`
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      // Get total count in a separate query (for first page only)
      let totalCount = null;
      if (offset === 0) {
        const countQuery = `
          SELECT COUNT(*) as total_count 
          FROM \`foodio-ab3b2.firestore_kaotim_hq.kaotim_hq_raw_changelog\`
          ${whereClause}
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
            timestamp: row.timestamp,
            ...dataObj
          };
        } catch (parseError) {
          console.error(`Error parsing data for document ${row.document_id}:`, parseError);
          return { 
            id: row.document_id,
            timestamp: row.timestamp,
            error: 'Failed to parse data',
            rawData: row.data
          };
        }
      });

      console.log(`Successfully queried latest kaotim_hq raw data, retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${storeId ? ', filtered by storeId: ' + storeId : ''})`);

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
      console.error('Error querying kaotim_hq raw data:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to query kaotim_hq raw data',
        error: error.message
      });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = KaotimHQRouter;
