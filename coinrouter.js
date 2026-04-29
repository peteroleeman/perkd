const express = require('express');
const firebase = require("./db");
const fireStore = firebase.firestore();
const axios = require('axios');
const FormData = require('form-data');

class CoinRouter {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.get('/about', function(req, res) {
      res.json({ message: 'Endpoint for Coin integration v1.0.0' });
    });
    this.router.post('/status/callback', this.handleStatusCallback.bind(this));
    this.router.post('/setcoin', this.setCoin.bind(this));
    this.router.post('/setboot', this.setBoot.bind(this));
  }

  async handleStatusCallback(req, res) {
    try {
      // Get all data provided by customer
      const data = req.body || {};

      // Extract mid from the data
      let mid = null;

      // Try to parse from data.msg first (normal structure)
      if (data.msg) {
        try {
          const msgData = JSON.parse(data.msg);
          mid = msgData.mid;
        } catch (e) {
          console.log('Could not parse msg field:', e.message);
        }
      }

      // If mid not found, use regex to extract mid from raw JSON string
      if (!mid) {
        try {
          const rawString = JSON.stringify(data);
          // Match mid pattern: "mid": "value" or \"mid\": \"value\" etc
          const midMatch = rawString.match(/mid[\\\"':]+\s*[\\\"']*([a-f0-9]{32})/i);
          if (midMatch && midMatch[1]) {
            mid = midMatch[1];
            console.log('Extracted mid using regex:', mid);
          }
        } catch (e) {
          console.log('Could not extract mid using regex:', e.message);
        }
      }

      // Fallback to timestamp if mid not found
      const documentId = mid || Date.now().toString();

      // Console log the incoming data
      console.log('=== Coin Status Callback Received ===');
      console.log('mid:', mid);
      console.log('Document ID (mid):', documentId);
      console.log('Raw Data:', JSON.stringify(data, null, 2));
      console.log('=====================================');

      // Prepare data with timestamp
      const documentData = {
        ...data,
        received_at: new Date().toISOString()
      };

      // Store to Firestore coin_transactions collection with mid as document ID
      const docRef = fireStore
        .collection('coin_transactions')
        .doc(documentId);

      await docRef.set(documentData);

      console.log(`Coin status callback saved with document ID: ${documentId}`);

      return res.status(200).json({
        success: true,
        message: 'Status callback saved successfully',
        document_id: documentId
      });

    } catch (error) {
      console.error('Error processing coin status callback:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Internal server error while processing status callback',
        error: error.message
      });
    }
  }

  async setCoin(req, res) {
    try {
      const { sn, count, delay, mid } = req.body;

      // Validate required parameters
      if (!sn || count === undefined || delay === undefined || !mid) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: sn, count, delay, and mid are required'
        });
      }

      // Prepare payload for MQTT
      const ts = Date.now().toString();
      const payload = {
        sn: sn,
        ts: ts,
        mid: mid,
        tag: "",
        data: [{
          ac: "1010",
          val: {
            count: count,
            in_delay: delay,
            out_delay: delay
          }
        }]
      };

      // Create FormData
      const data = new FormData();
      data.append('topic', `tbqv1/${mid}`);
      data.append('payload', JSON.stringify(payload));
      data.append('encode', '2');
      data.append('msglen', '5000');
      data.append('delay', delay.toString());

      // Prepare axios config
      const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'http://cn.kgeasy.com:8009/mqtt',
        headers: {
          ...data.getHeaders()
        },
        data: data
      };

      // Send to MQTT endpoint
      const response = await axios.request(config);

      // Store to Firestore for record keeping
      const coinData = {
        sn: sn,
        count: count,
        delay_in: delay,
        delay_out: delay,
        mid: mid,
        mqtt_response: response.data,
        updated_at: new Date().toISOString()
      };

      // const docRef = fireStore
      //   .collection('coin_settings')
      //   .doc(mid);

      // await docRef.set(coinData, { merge: true });

      console.log(`Coin settings sent to MQTT for mid: ${mid}, sn: ${sn}, count: ${count}, delay: ${delay}`);
      console.log('MQTT Payload Sent:', JSON.stringify(payload));
      console.log('MQTT Response:', JSON.stringify(response.data));

      return res.status(200).json({
        success: true,
        message: 'Coin settings sent successfully',
        payload_sent: payload,
        mqtt_response: response.data,
        data: coinData
      });

    } catch (error) {
      console.error('Error setting coin:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Internal server error while setting coin',
        error: error.message
      });
    }
  }

  async setBoot(req, res) {
    try {
      const { sn, val, delay, mid } = req.body;

      // Validate required parameters
      if (!sn || val === undefined || delay === undefined || !mid) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: sn, val, delay, and mid are required'
        });
      }

      // Prepare payload for MQTT
      const ts = Date.now().toString();
      const payload = {
        sn: sn,
        ts: ts,
        mid: mid,
        tag: "",
        data: [{
          ac: "0001",
          val: val
        }]
      };

      // Create FormData
      const data = new FormData();
      data.append('topic', `tbqv1/${mid}`);
      data.append('payload', JSON.stringify(payload));
      data.append('encode', '2');
      data.append('msglen', '150');
      data.append('delay', delay.toString());

      // Prepare axios config
      const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'http://cn.kgeasy.com:8009/mqtt',
        headers: {
          ...data.getHeaders()
        },
        data: data
      };

      // Send to MQTT endpoint
      const response = await axios.request(config);

      // Store to Firestore for record keeping
      const bootData = {
        sn: sn,
        val: val,
        delay: delay,
        mid: mid,
        mqtt_response: response.data,
        updated_at: new Date().toISOString()
      };

      // const docRef = fireStore
      //   .collection('coin_boot_settings')
      //   .doc(mid);

      // await docRef.set(bootData, { merge: true });

      console.log(`Boot settings sent to MQTT for mid: ${mid}, sn: ${sn}, val: ${val}, delay: ${delay}`);
      console.log('MQTT Payload Sent:', JSON.stringify(payload));
      console.log('MQTT Response:', JSON.stringify(response.data));

      return res.status(200).json({
        success: true,
        message: 'Boot settings sent successfully',
        payload_sent: payload,
        mqtt_response: response.data,
        data: bootData
      });

    } catch (error) {
      console.error('Error setting boot:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Internal server error while setting boot',
        error: error.message
      });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = CoinRouter;

