const CryptoJS = require('crypto-js');

const PLAIN_PREFIX = 'CERIA:';

function extractCompanyIdFromBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  return String(b.company_id || b.companyId || '').trim();
}

function extractPlainEmployeeIdFromBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  return String(b.employee_id || b.employeeId || '').trim();
}

function extractEncryptedEmployeeIdFromBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  return String(
    b.encrypted_employee_id || b.encoded_employee_id || b.encryptedEmployeeId || '',
  ).trim();
}

/**
 * @param {string} employeeId
 * @param {string} companyId AES passphrase
 * @returns {string}
 */
function encryptEmployeeId(employeeId, companyId) {
  const slug = String(employeeId || '').trim();
  const key = String(companyId || '').trim();
  if (!slug) {
    const err = new Error('EMPLOYEE_ID_REQUIRED');
    err.code = 'EMPLOYEE_ID_REQUIRED';
    throw err;
  }
  if (!key) {
    const err = new Error('COMPANY_ID_REQUIRED');
    err.code = 'COMPANY_ID_REQUIRED';
    throw err;
  }
  return CryptoJS.AES.encrypt(`${PLAIN_PREFIX}${slug}`, key).toString();
}

/**
 * @param {string} encrypted
 * @param {string} companyId AES passphrase
 * @returns {{ ok: true, employeeId: string } | { ok: false, code: string, message: string }}
 */
function decryptEmployeeId(encrypted, companyId) {
  const ciphertext = String(encrypted || '').trim();
  const key = String(companyId || '').trim();

  if (!key) {
    return { ok: false, code: 'COMPANY_ID_REQUIRED', message: 'company_id is required' };
  }
  if (!ciphertext) {
    return {
      ok: false,
      code: 'ENCRYPTED_EMPLOYEE_ID_REQUIRED',
      message: 'encrypted_employee_id is required',
    };
  }

  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, key);
    const plaintext = bytes.toString(CryptoJS.enc.Utf8);

    if (!plaintext || !plaintext.startsWith(PLAIN_PREFIX)) {
      return {
        ok: false,
        code: 'INVALID_ENCRYPTED_EMPLOYEE_ID',
        message: 'Invalid encrypted employee id or wrong company_id',
      };
    }

    const employeeId = plaintext.slice(PLAIN_PREFIX.length).trim();
    if (!employeeId) {
      return {
        ok: false,
        code: 'INVALID_ENCRYPTED_EMPLOYEE_ID',
        message: 'Decrypted employee id is empty',
      };
    }

    return { ok: true, employeeId };
  } catch (_) {
    return {
      ok: false,
      code: 'INVALID_ENCRYPTED_EMPLOYEE_ID',
      message: 'Failed to decrypt employee id',
    };
  }
}

/**
 * Decrypt encrypted employee id from request body using company_id as key.
 * @param {object} body
 * @returns {{ ok: true, companyId: string, employeeId: string } | { ok: false, code: string, message: string }}
 */
function resolveEmployeeIdFromEncryptedBody(body) {
  const companyId = extractCompanyIdFromBody(body);
  if (!companyId) {
    return { ok: false, code: 'COMPANY_ID_REQUIRED', message: 'company_id is required' };
  }

  const encrypted = extractEncryptedEmployeeIdFromBody(body);
  if (!encrypted) {
    return {
      ok: false,
      code: 'ENCRYPTED_EMPLOYEE_ID_REQUIRED',
      message: 'encrypted_employee_id is required',
    };
  }

  const decrypted = decryptEmployeeId(encrypted, companyId);
  if (!decrypted.ok) return decrypted;

  return { ok: true, companyId, employeeId: decrypted.employeeId };
}

module.exports = {
  PLAIN_PREFIX,
  encryptEmployeeId,
  decryptEmployeeId,
  extractCompanyIdFromBody,
  extractPlainEmployeeIdFromBody,
  extractEncryptedEmployeeIdFromBody,
  resolveEmployeeIdFromEncryptedBody,
};
