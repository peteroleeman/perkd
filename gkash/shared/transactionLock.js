/**
 * Firestore-backed mutex for Gkash return handlers (collection: payment_locks).
 * Uses the same Firebase JS SDK instance as the rest of the app (see db.js).
 */
require('../../db');
const firebase = require('firebase');

const db = firebase.firestore();
const FieldValue = firebase.firestore.FieldValue;

const ALREADY_LOCKED = 'ALREADY_LOCKED';

/**
 * @param {string} orderId cart / order document id
 * @param {string} lockSource e.g. gkash_coinreturn
 * @param {number} lockTimeoutMinutes
 * @returns {Promise<boolean>} true if this invocation owns the lock
 */
async function acquireTransactionLock(orderId, lockSource, lockTimeoutMinutes = 5) {
  if (!orderId || String(orderId).trim() === '') {
    return false;
  }
  const id = String(orderId);
  const lockRef = db.collection('payment_locks').doc(id);
  try {
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(lockRef);
      if (snap.exists) {
        const data = snap.data() || {};
        const lockedAt = data.locked_at;
        let lockedMs = 0;
        if (lockedAt && typeof lockedAt.toDate === 'function') {
          lockedMs = lockedAt.toDate().getTime();
        } else if (lockedAt instanceof Date) {
          lockedMs = lockedAt.getTime();
        }
        if (lockedMs > 0) {
          const ageMin = (Date.now() - lockedMs) / 60000;
          if (ageMin < lockTimeoutMinutes) {
            throw new Error(ALREADY_LOCKED);
          }
        }
      }
      transaction.set(lockRef, {
        locked_at: FieldValue.serverTimestamp(),
        locked_by: lockSource,
        order_id: id,
      });
    });
    return true;
  } catch (e) {
    if (e && e.message === ALREADY_LOCKED) {
      return false;
    }
    throw e;
  }
}

async function releaseTransactionLock(orderId) {
  if (!orderId || String(orderId).trim() === '') {
    return;
  }
  try {
    await db.collection('payment_locks').doc(String(orderId)).delete();
  } catch (e) {
    // ignore
  }
}

module.exports = {
  acquireTransactionLock,
  releaseTransactionLock,
};
