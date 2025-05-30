const express = require('express');
const firebase = require('./db');
const fireStore = firebase.firestore();

class TicketRouter {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.get('/about', this.about.bind(this));
    this.router.post('/getTicket', this.getTicket.bind(this));
    this.router.post('/getTicketTransaction', this.getTicketTransaction.bind(this));
  }

  about(req, res) {
    res.json({ version: '1.0.0', name: 'Ticket Service Router' });
  }

  /**
   * Core function to generate a ticket ID based on store data
   * @param {Object} storeData - The store document data
   * @returns {string} The generated ticket ID
   */
  generateTicketId(storeData) {
    // Get the current counter value and initial
    const storeCounter = storeData.storeCounter || 0;
    const initial = storeData.initial || "";
    
    // Increment the counter
    const newCounter = storeCounter + 1;
    
    // Format the ticket ID with initial + 4-digit padded counter
    const paddedCounter = String(newCounter).padStart(4, '0');
    return initial + paddedCounter;
  }

  /**
   * Get a ticket ID with a Firestore transaction
   * This can be called from other services and returns a Promise with the ticket ID
   * @param {string} storeId - The store ID
   * @returns {Promise<string>} A promise that resolves to the ticket ID
   */
  async generateTicketWithTransaction(storeId) {
    if (!storeId) {
      throw new Error('Missing storeId parameter');
    }

    let ticketId = '';
    
    // Use a Firestore transaction to safely increment the counter
    await fireStore.runTransaction(async (transaction) => {
      // Get the store document reference
      const storeDocRef = fireStore.collection('store').doc(storeId);
      
      // Get the store document in the transaction
      const storeDoc = await transaction.get(storeDocRef);
      
      if (!storeDoc.exists) {
        throw new Error(`Store with ID ${storeId} not found`);
      }
      
      const storeData = storeDoc.data();
      ticketId = this.generateTicketId(storeData);
      
      // Update the store document with the new counter
      transaction.update(storeDocRef, { 
        storeCounter: (storeData.storeCounter || 0) + 1 
      });
    });
    
    return ticketId;
  }

  /**
   * Get a ticket ID without a transaction (less safe for concurrency)
   * This can be called from other services and returns a Promise with the ticket ID
   * @param {string} storeId - The store ID
   * @returns {Promise<string>} A promise that resolves to the ticket ID
   */
  async generateTicketWithoutTransaction(storeId) {
    if (!storeId) {
      throw new Error('Missing storeId parameter');
    }
    
    // Get the store document
    const storeDocRef = fireStore.collection('store').doc(storeId);
    const storeDoc = await storeDocRef.get();
    
    if (!storeDoc.exists) {
      throw new Error(`Store with ID ${storeId} not found`);
    }
    
    const storeData = storeDoc.data();
    const ticketId = this.generateTicketId(storeData);
    
    // Update the store document with the new counter
    await storeDocRef.update({ 
      storeCounter: (storeData.storeCounter || 0) + 1 
    });
    
    return ticketId;
  }

  /**
   * Get a new ticket ID for a store
   * Uses a Firestore transaction to safely increment the counter
   */
  async getTicketTransaction(req, res) {
    try {
      const { storeId } = req.body;
      
      if (!storeId) {
        return res.status(400).json({ success: false, error: 'Missing storeId parameter' });
      }

      const ticketId = await this.generateTicketWithTransaction(storeId);
      
      return res.json({
        success: true,
        ticketId
      });
      
    } catch (error) {
      console.error('Error generating ticket ID:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to generate ticket ID',
        message: error.message
      });
    }
  }

  /**
   * Alternative implementation without using a transaction
   * Less safe but simpler - for demonstration purposes
   */
  async getTicket(req, res) {
    try {
      const { storeId } = req.body;
      
      if (!storeId) {
        return res.status(400).json({ success: false, error: 'Missing storeId parameter' });
      }
      
      const ticketId = await this.generateTicketWithoutTransaction(storeId);
      
      return res.json({
        success: true,
        ticketId
      });
      
    } catch (error) {
      console.error('Error generating ticket ID:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to generate ticket ID',
        message: error.message
      });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = TicketRouter; 