const firebase = require("firebase");
const firebaseApp = require("../db");
const fireStore = firebaseApp.firestore();

/**
 * A helper utility to save activity logs for Kaotim operations.
 * Records activities such as credit top-ups, stock takes, reorders, and transfers.
 * Logs are saved to Firestore under the store ID in the 'kaotim_hq' collection.
 */
class KaotimActivityLogger {
  // Activity Type Constants
  static ACTIVITY_TOPUP_CREDIT_PASSED = 'topup_credit_passed';
  static ACTIVITY_TOPUP_CREDIT_FAILED = 'topup_credit_failed';
  static ACTIVITY_SUBMIT_STOCK_TAKE = 'submit_stock_take';
  static ACTIVITY_PLACE_REORDER = 'place_reorder';
  static ACTIVITY_ACCEPT_REORDER = 'accept_reorder';
  static ACTIVITY_REQUEST_TRANSFER = 'request_transfer';
  static ACTIVITY_ACCEPT_TRANSFER = 'accept_transfer';
  static ACTIVITY_REJECT_TRANSFER = 'reject_transfer';

  /**
   * Logs an activity to the kaotim_hq/{storeId}/activity_log collection.
   * 
   * @param {Object} options - The logging options
   * @param {string} options.storeId - The ID of the store where the activity occurred (required)
   * @param {string} options.activityType - The type of activity (use constants defined in this class) (required)
   * @param {string} [options.description=''] - A human-readable description of what happened
   * @param {Object} [options.jsonData={}] - The related data model as a JSON object (e.g., OrderModel, TransferModel)
   * @param {Object} [options.user=null] - The user who performed the action
   * @param {string} [options.user.id] - User ID
   * @param {string} [options.user.displayName] - User display name
   * @param {string} [options.user.phoneNumber] - User phone number
   * @param {string} [options.user.email] - User email
   * @returns {Promise<Object|null>} The created log entry or null if failed
   */
  static async logActivity({
    storeId,
    activityType,
    description = '',
    jsonData = {},
    user = null
  }) {
    try {
      if (!storeId || storeId.trim() === '') {
        console.warn('Warning: Cannot log Kaotim activity without a storeId.');
        return null;
      }

      // Create a reference to the new log document
      const docRef = fireStore
        .collection('kaotim_hq')
        .doc(storeId)
        .collection('activity_log')
        .doc();

      const now = new Date();

      // Format timestamp as "January 15, 2026 at 8:59:08 PM UTC+8"
      const formatTimestamp = (date) => {
        const months = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        const month = months[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();
        
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be 12
        
        // Get timezone offset in hours
        const offsetMinutes = -date.getTimezoneOffset();
        const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
        const offsetMins = Math.abs(offsetMinutes) % 60;
        const offsetSign = offsetMinutes >= 0 ? '+' : '-';
        const timezone = offsetMins > 0 
          ? `UTC${offsetSign}${offsetHours}:${offsetMins.toString().padStart(2, '0')}`
          : `UTC${offsetSign}${offsetHours}`;
        
        return `${month} ${day}, ${year} at ${hours}:${minutes}:${seconds} ${ampm} ${timezone}`;
      };

      const logEntry = {
        id: docRef.id,
        activityType: activityType,
        description: description,
        timestamp: firebase.firestore.Timestamp.fromDate(now),
        dateTime: now.toISOString(),
        storeId: storeId,
        data: jsonData || {},
        // User details
        userId: user?.id || '',
        userName: user?.displayName || '',
        userPhone: user?.phoneNumber || '',
        userEmail: user?.email || ''
      };

      await docRef.set(logEntry);
      console.log(`Kaotim Activity Logged: ${activityType} for store ${storeId}`);
      
      return logEntry;
    } catch (error) {
      console.error(`Error logging Kaotim activity (${activityType}):`, error);
      // We generally don't want to throw here as it might disrupt the main flow
      return null;
    }
  }

  /**
   * Get activity logs for a specific store
   * 
   * @param {string} storeId - The store ID to get logs for
   * @param {Object} [options={}] - Query options
   * @param {number} [options.limit=50] - Maximum number of logs to retrieve
   * @param {string} [options.activityType] - Filter by activity type
   * @returns {Promise<Array>} Array of activity log entries
   */
  static async getActivityLogs(storeId, options = {}) {
    try {
      if (!storeId || storeId.trim() === '') {
        console.warn('Warning: Cannot get Kaotim activity logs without a storeId.');
        return [];
      }

      let query = fireStore
        .collection('kaotim_hq')
        .doc(storeId)
        .collection('activity_log')
        .orderBy('timestamp', 'desc');

      if (options.activityType) {
        query = query.where('activityType', '==', options.activityType);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      } else {
        query = query.limit(50);
      }

      const snapshot = await query.get();
      const logs = [];

      snapshot.forEach(doc => {
        logs.push(doc.data());
      });

      return logs;
    } catch (error) {
      console.error('Error getting Kaotim activity logs:', error);
      return [];
    }
  }
}

module.exports = KaotimActivityLogger;
