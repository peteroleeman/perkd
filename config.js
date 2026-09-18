const dotenv = require("dotenv");
const assert = require("assert");

dotenv.config();

const {
  PORT,
  HOST,
  HOST_URL,
  API_KEY,
  AUTH_DOMAIN,
  DATABASE_URL: DATABASE_URL_ENV,
  PROJECT_ID: PROJECT_ID_ENV,
  STORAGE_BUCKET,
  MESSAGING_SENDER_ID,
  APP_ID
} = process.env;

// Cloud Run sets GOOGLE_CLOUD_PROJECT; Firebase client SDK still wants databaseURL for initializeApp.
const PROJECT_ID =
  PROJECT_ID_ENV || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

const DATABASE_URL =
  DATABASE_URL_ENV ||
  process.env.FIREBASE_DATABASE_URL ||
  (PROJECT_ID ? `https://${PROJECT_ID}.firebaseio.com` : undefined);

// adding init assertions
//assert(PORT, "Application port is required");
//assert(HOST_URL, "Service endpoint is required");
assert(
  DATABASE_URL,
  "Firebase database endpoint is required (set DATABASE_URL or FIREBASE_DATABASE_URL, or set PROJECT_ID / GOOGLE_CLOUD_PROJECT so https://<project>.firebaseio.com can be used)"
);
assert(PROJECT_ID, "Firebase project id is required (set PROJECT_ID or rely on GOOGLE_CLOUD_PROJECT on Cloud Run)");
assert(APP_ID, "Firebase app id is required (APP_ID from Firebase console web app config)");

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