const express = require('express');
const {BigQuery} = require('@google-cloud/bigquery');
const firebase = require("./db");
const fireStore = firebase.firestore();

class KaotimLogRouter {

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
    this.router.post('/querybydays', this.queryByDays.bind(this));
    this.router.post('/querybyactivitytype', this.queryByActivityType.bind(this));
    this.router.post('/querybydaterange', this.queryByDateRange.bind(this));
  }

  about(req, res) {
    res.json({ version: '1.0.0', service: 'Kaotim Activity Log API' });
  }

  /**
   * Query BigQuery to get kaotim activity log raw data with pagination support
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
        whereClause += ` AND document_name LIKE '%/kaotim_hq/${storeid}/activity_log/%'`;
      }

      // Build query with pagination and filtering
      const query = `
        SELECT * 
        FROM \`foodio-ab3b2.firestore_kaotim_log.kaotim_log_raw_changelog\`
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
          FROM \`foodio-ab3b2.firestore_kaotim_log.kaotim_log_raw_changelog\`
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

      console.log(`Successfully queried BigQuery for kaotim activity log, retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${storeid ? ', filtered by storeId: ' + storeid : ''})`);

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
      console.error('Error querying BigQuery for kaotim activity log:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to query BigQuery for kaotim activity log',
        error: error.message
      });
    }
  }

  /**
   * Query BigQuery and return only the parsed data field for kaotim activity log
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
        whereClause += ` AND document_name LIKE '%/kaotim_hq/${storeid}/activity_log/%'`;
      }

      // Query to get all raw records
      const query = `
        SELECT document_id, data, timestamp
        FROM \`foodio-ab3b2.firestore_kaotim_log.kaotim_log_raw_changelog\`
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
          FROM \`foodio-ab3b2.firestore_kaotim_log.kaotim_log_raw_changelog\`
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

      console.log(`Successfully queried latest kaotim activity log raw data, retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${storeid ? ', filtered by storeId: ' + storeid : ''})`);

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
      console.error('Error querying kaotim activity log raw data:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to query kaotim activity log raw data',
        error: error.message
      });
    }
  }

  /**
   * Query BigQuery to get kaotim activity log data for a specified number of days from current date with pagination support
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async queryByDays(req, res) {
    try {
      // Extract pagination parameters from request body
      const limit = parseInt(req.body.limit) || 100; // Default to 100 records
      const offset = parseInt(req.body.offset) || 0; // Default to starting from the beginning
      const storeid = req.body.storeid || null; // Get the storeId filter
      const days = parseInt(req.body.days); // Get the number of days (required)
      
      // Validate days parameter - minimum is 1
      if (!days || isNaN(days) || days < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid days parameter. Days must be a number and at least 1.',
          error: 'Days parameter is required and must be >= 1'
        });
      }
      
      // Build the WHERE clause for filtering - last N days from today
      let whereClause = `WHERE operation != 'DELETE' AND DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)`;
      
      if (storeid) {
        // Create a pattern to match the storeId in the document_name
        whereClause += ` AND document_name LIKE '%/kaotim_hq/${storeid}/activity_log/%'`;
      }

      // Build query with pagination and filtering
      const query = `
        SELECT 
          document_name,
          operation,
          data,
          timestamp,
          document_id,
          event_id
        FROM \`foodio-ab3b2.firestore_kaotim_log.kaotim_log_raw_changelog\`
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
          FROM \`foodio-ab3b2.firestore_kaotim_log.kaotim_log_raw_changelog\`
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

      console.log(`Successfully queried BigQuery for last ${days} days kaotim activity log data, retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${storeid ? ', filtered by storeId: ' + storeid : ''})`);

      return res.status(200).json({
        success: true,
        count: rows.length,
        total: totalCount,
        offset: offset,
        limit: limit,
        days: days,
        storeId: storeid,
        hasMore: rows.length === limit, // Indicate if there might be more records
        nextOffset: offset + limit, // Provide the next offset for pagination
        data: rows
      });
      
    } catch (error) {
      console.error('Error querying BigQuery for specified days kaotim activity log data:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to query BigQuery for specified days kaotim activity log data',
        error: error.message
      });
    }
  }

  /**
   * Query BigQuery to get kaotim activity log data filtered by activity type
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async queryByActivityType(req, res) {
    try {
      // Extract parameters from request body
      const limit = parseInt(req.body.limit) || 100;
      const offset = parseInt(req.body.offset) || 0;
      const storeid = req.body.storeid || null;
      const activityType = req.body.activityType; // Required parameter
      
      // Validate activityType parameter
      if (!activityType) {
        return res.status(400).json({
          success: false,
          message: 'Activity type parameter is required',
          error: 'activityType parameter is missing'
        });
      }
      
      // Build the WHERE clause for filtering
      let whereClause = `WHERE operation != 'DELETE' AND JSON_EXTRACT_SCALAR(data, '$.activityType') = '${activityType}'`;
      
      if (storeid) {
        whereClause += ` AND document_name LIKE '%/kaotim_hq/${storeid}/activity_log/%'`;
      }

      // Build query with pagination and filtering
      const query = `
        SELECT 
          document_name,
          operation,
          data,
          timestamp,
          document_id,
          event_id
        FROM \`foodio-ab3b2.firestore_kaotim_log.kaotim_log_raw_changelog\`
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
          FROM \`foodio-ab3b2.firestore_kaotim_log.kaotim_log_raw_changelog\`
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

      console.log(`Successfully queried BigQuery for kaotim activity log by type '${activityType}', retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${storeid ? ', filtered by storeId: ' + storeid : ''})`);

      return res.status(200).json({
        success: true,
        count: rows.length,
        total: totalCount,
        offset: offset,
        limit: limit,
        activityType: activityType,
        storeId: storeid,
        hasMore: rows.length === limit,
        nextOffset: offset + limit,
        data: rows
      });
      
    } catch (error) {
      console.error('Error querying BigQuery for kaotim activity log by type:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to query BigQuery for kaotim activity log by type',
        error: error.message
      });
    }
  }

  /**
   * Query BigQuery to get kaotim activity log data within a specific date range
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async queryByDateRange(req, res) {
    try {
      // Extract parameters from request body
      const limit = parseInt(req.body.limit) || 100;
      const offset = parseInt(req.body.offset) || 0;
      const storeid = req.body.storeid || null;
      const startDate = req.body.startDate; // Format: YYYY-MM-DD
      const endDate = req.body.endDate; // Format: YYYY-MM-DD
      
      // Validate date parameters
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date and end date are required',
          error: 'startDate and endDate parameters are missing'
        });
      }
      
      // Build the WHERE clause for filtering
      let whereClause = `WHERE operation != 'DELETE' AND DATE(timestamp) BETWEEN '${startDate}' AND '${endDate}'`;
      
      if (storeid) {
        whereClause += ` AND document_name LIKE '%/kaotim_hq/${storeid}/activity_log/%'`;
      }

      // Build query with pagination and filtering
      const query = `
        SELECT 
          document_name,
          operation,
          data,
          timestamp,
          document_id,
          event_id
        FROM \`foodio-ab3b2.firestore_kaotim_log.kaotim_log_raw_changelog\`
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
          FROM \`foodio-ab3b2.firestore_kaotim_log.kaotim_log_raw_changelog\`
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

      console.log(`Successfully queried BigQuery for kaotim activity log from ${startDate} to ${endDate}, retrieved ${rows.length} rows (offset: ${offset}, limit: ${limit}${storeid ? ', filtered by storeId: ' + storeid : ''})`);

      return res.status(200).json({
        success: true,
        count: rows.length,
        total: totalCount,
        offset: offset,
        limit: limit,
        startDate: startDate,
        endDate: endDate,
        storeId: storeid,
        hasMore: rows.length === limit,
        nextOffset: offset + limit,
        data: rows
      });
      
    } catch (error) {
      console.error('Error querying BigQuery for kaotim activity log by date range:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to query BigQuery for kaotim activity log by date range',
        error: error.message
      });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = KaotimLogRouter;
