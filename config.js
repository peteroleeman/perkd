const dotenv = require("dotenv");
const assert = require("assert");

dotenv.config();

const {
  PORT,
  HOST,
  HOST_URL,
  API_KEY,
  AUTH_DOMAIN,
  DATABASE_URL,
  PROJECT_ID,
  STORAGE_BUCKET,
  MESSAGING_SENDER_ID,
  APP_ID
} = process.env;

// adding init assertions
//assert(PORT, "Application port is required");
//assert(HOST_URL, "Service endpoint is required");
assert(DATABASE_URL, "Firebase database endpoint is required");
assert(PROJECT_ID, "Firebase project id is required");
assert(APP_ID, "Firebase app id is required");

module.exports = {
  port: PORT,
  host: HOST,
  url: HOST_URL,
  firebaseConfig: {
    apiKey: API_KEY,
    authDomain: AUTH_DOMAIN,
    databaseURL: DATABASE_URL,
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET,
    messagingSenderId: MESSAGING_SENDER_ID,
    appId: APP_ID
  }
};