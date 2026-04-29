const fs = require('fs');
const path = require('path');

// Cache for credentials to avoid reading file on every request
let credentialsCache = null;
let lastModified = null;

/**
 * Load credentials from JSON file or environment variables
 * @param {string|null|undefined} storeId - Store ID to get credentials for (optional)
 * @returns {Object} Credentials object with accessKey, secretKey, host, region, service
 */
function getCredentialsForStore(storeId) {
  console.log('🔑 [CREDENTIALS] getCredentialsForStore called with storeId:', storeId);
  
  // If no storeId provided, use default from environment variables
  if (!storeId) {
    console.log('🔑 [CREDENTIALS] No storeId provided, using default credentials');
    const defaultCreds = getDefaultCredentials();
    console.log('🔑 [CREDENTIALS] Default credentials - Access Key:', defaultCreds.accessKey);
    console.log('🔑 [CREDENTIALS] Default credentials - Secret Key:', defaultCreds.secretKey ? '***' + defaultCreds.secretKey.slice(-4) : 'EMPTY');
    console.log('🔑 [CREDENTIALS] Default credentials - Host:', defaultCreds.host);
    return defaultCreds;
  }

  const credentialsFile = path.join(__dirname, '..', 'sqlAccountCredentials.json');
  
  try {
    // Check if file exists
    if (!fs.existsSync(credentialsFile)) {
      console.log(`[SQL Account] Credentials file not found, using default credentials for store: ${storeId}`);
      const defaultCreds = getDefaultCredentials();
      console.log('🔑 [CREDENTIALS] File not found - Access Key:', defaultCreds.accessKey);
      console.log('🔑 [CREDENTIALS] File not found - Secret Key:', defaultCreds.secretKey ? '***' + defaultCreds.secretKey.slice(-4) : 'EMPTY');
      return defaultCreds;
    }

    // Check if file was modified (for hot-reloading in development)
    const stats = fs.statSync(credentialsFile);
    if (!credentialsCache || stats.mtimeMs !== lastModified) {
      const fileContent = fs.readFileSync(credentialsFile, 'utf8');
      credentialsCache = JSON.parse(fileContent);
      lastModified = stats.mtimeMs;
      console.log(`[SQL Account] Credentials file loaded/refreshed`);
      console.log('🔑 [CREDENTIALS] Available stores in credentials file:', Object.keys(credentialsCache));
    }

    // Get credentials for specific store
    if (credentialsCache[storeId]) {
      console.log(`✅ [CREDENTIALS] Found credentials for store: ${storeId}`);
      const creds = credentialsCache[storeId];
      const result = {
        accessKey: creds.accessKey,
        secretKey: creds.secretKey,
        host: creds.host || 'api.sql.my',
        region: creds.region || 'ap-southeast-1',
        service: creds.service || 'execute-api',
      };
      console.log('🔑 [CREDENTIALS] Store credentials - Access Key:', result.accessKey);
      console.log('🔑 [CREDENTIALS] Store credentials - Secret Key:', result.secretKey ? '***' + result.secretKey.slice(-4) : 'EMPTY');
      console.log('🔑 [CREDENTIALS] Store credentials - Host:', result.host);
      return result;
    }

    // Fallback to default in credentials file if store not found
    if (credentialsCache.default) {
      console.warn(`⚠️ [CREDENTIALS] Store ${storeId} not found in credentials file, using default from file`);
      const creds = credentialsCache.default;
      const result = {
        accessKey: creds.accessKey,
        secretKey: creds.secretKey,
        host: creds.host || 'api.sql.my',
        region: creds.region || 'ap-southeast-1',
        service: creds.service || 'execute-api',
      };
      console.log('🔑 [CREDENTIALS] Default from file - Access Key:', result.accessKey);
      console.log('🔑 [CREDENTIALS] Default from file - Secret Key:', result.secretKey ? '***' + result.secretKey.slice(-4) : 'EMPTY');
      console.log('🔑 [CREDENTIALS] Default from file - Host:', result.host);
      return result;
    }

    // Final fallback to default from credentials file
    console.warn(`⚠️ [CREDENTIALS] Store ${storeId} not found, using default from sqlAccountCredentials.json`);
    const envCreds = getDefaultCredentials();
    console.log('🔑 [CREDENTIALS] Env credentials - Access Key:', envCreds.accessKey);
    console.log('🔑 [CREDENTIALS] Env credentials - Secret Key:', envCreds.secretKey ? '***' + envCreds.secretKey.slice(-4) : 'EMPTY');
    return envCreds;
  } catch (error) {
    console.error(`❌ [CREDENTIALS] Error loading credentials for store ${storeId}:`, error);
    const errorCreds = getDefaultCredentials();
    console.log('🔑 [CREDENTIALS] Error fallback - Access Key:', errorCreds.accessKey);
    console.log('🔑 [CREDENTIALS] Error fallback - Secret Key:', errorCreds.secretKey ? '***' + errorCreds.secretKey.slice(-4) : 'EMPTY');
    return errorCreds;
  }
}

/**
 * Get default credentials from sqlAccountCredentials.json (default key)
 * @returns {Object} Default credentials with accessKey, secretKey, host, region, service
 */
function getDefaultCredentials() {
  const credentialsFile = path.join(__dirname, '..', 'sqlAccountCredentials.json');
  if (!fs.existsSync(credentialsFile)) {
    throw new Error('sqlAccountCredentials.json not found. SQL API credentials must be configured in this file.');
  }
  const content = fs.readFileSync(credentialsFile, 'utf8');
  const data = JSON.parse(content);
  if (!data.default) {
    throw new Error('sqlAccountCredentials.json must have a "default" entry with accessKey, secretKey, host, region, service.');
  }
  const creds = data.default;
  const result = {
    accessKey: creds.accessKey,
    secretKey: creds.secretKey,
    host: creds.host || 'api.sql.my',
    region: creds.region || 'ap-southeast-1',
    service: creds.service || 'execute-api',
  };
  console.log('🔑 [CREDENTIALS] getDefaultCredentials from file - Access Key:', result.accessKey);
  console.log('🔑 [CREDENTIALS] getDefaultCredentials from file - Secret Key:', result.secretKey ? '***' + result.secretKey.slice(-4) : 'EMPTY');
  return result;
}

/**
 * Clear credentials cache (useful for testing or manual refresh)
 */
function clearCredentialsCache() {
  credentialsCache = null;
  lastModified = null;
}

module.exports = {
  getCredentialsForStore,
  getDefaultCredentials,
  clearCredentialsCache,
};


