const express = require('express');
const moment = require('moment');
const firebase = require('./db');
const {
  convertToStoreModel,
  resolveUserDocId,
  handleFeieKitchenSlipsOnly,
  isFeieEnabledForStore,
  getStoreOrderSlipPrinterSource,
} = require('./util/feie_store_helper');

const fireStore = firebase.firestore();

const K_STATUS_START_VALUES = [0, '0'];
const K_STATUS_PREPARING = 1;
/** Flutter OrderModel field: skip kitchen slip print when true */
const K_ORDER_MODEL_SLIP_PRINTED = 'slipprinted';
/** kdsorderslipexap request bodies sent when slips were printed */
const K_ORDER_MODEL_SLIP_PRINT_PAYLOAD = 'slipprintpayload';
const STORE_TZ_OFFSET_MIN = 8 * 60;
const LOOKBACK_DAYS = 7;
const DATE_FMT = 'YYYY-MM-DD HH:mm:ss';

function isStartStatus(status) {
  return status === 0 || status === '0';
}

function nowInStoreTz() {
  return moment().utcOffset(STORE_TZ_OFFSET_MIN).startOf('minute');
}

function logPrepMonitor(event, payload = {}) {
  console.log(`[KdsRouter][PrepMonitor] ${event}`, JSON.stringify(payload));
}

/**
 * Mirror patch to today_order and user order only (not printserver).
 * Optionally include canonical store order doc (e.g. feiepreprinted flag).
 */
async function mirrorOrderPatch(storeId, orderId, orderData, patch, { includeStoreOrder = true } = {}) {
  const batch = fireStore.batch();
  const refs = [
    fireStore.collection('store').doc(storeId).collection('today_order').doc(orderId),
  ];

  if (includeStoreOrder) {
    refs.unshift(fireStore.collection('store').doc(storeId).collection('order').doc(orderId));
  }

  for (const ref of refs) {
    batch.set(ref, patch, { merge: true });
  }

  const userDocId = resolveUserDocId(orderData);
  if (userDocId) {
    batch.set(
      fireStore.collection('user').doc(userDocId).collection('order').doc(orderId),
      patch,
      { merge: true },
    );
  }

  await batch.commit();
}

async function monitorStorePreparation(storeId) {
  const runId = `prep-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const storeRef = fireStore.collection('store').doc(storeId);
  const storeSnap = await storeRef.get();
  if (!storeSnap.exists) {
    throw new Error(`Store not found: ${storeId}`);
  }

  const storeData = storeSnap.data();
  const storeModel = convertToStoreModel(storeSnap);
  const feieEnabled = isFeieEnabledForStore(storeData, storeModel);
  const printerCount = getStoreOrderSlipPrinterSource(storeModel).length;

  const now = nowInStoreTz();
  const nowStr = now.format(DATE_FMT);
  const lookbackStr = now.clone().subtract(LOOKBACK_DAYS, 'days').format(DATE_FMT);

  logPrepMonitor('start', {
    runId,
    storeId,
    storeTitle: storeData?.title ?? storeModel?.title ?? '',
    feieEnabled,
    printerCount,
    lookbackStr,
    nowStr,
    query: {
      status: K_STATUS_START_VALUES,
      preparationdatetimeGte: lookbackStr,
      preparationdatetimeLte: nowStr,
    },
  });

  const snap = await storeRef
    .collection('order')
    .where('status', 'in', K_STATUS_START_VALUES)
    .where('preparationdatetime', '>=', lookbackStr)
    .where('preparationdatetime', '<=', nowStr)
    .get();

  logPrepMonitor('query_complete', {
    runId,
    storeId,
    matchCount: snap.size,
  });

  let scanned = 0;
  let promoted = 0;
  let printed = 0;
  let skipped = 0;
  const errors = [];
  const promotedOrderIds = [];
  const skippedDetails = [];

  for (const doc of snap.docs) {
    scanned++;
    const data = doc.data();

    if (!(data.preparationdatetime || '').toString().trim()) {
      skipped++;
      skippedDetails.push({ orderId: doc.id, reason: 'empty_preparationdatetime' });
      continue;
    }

    try {
      const orderRef = doc.ref;
      let didPromote = false;

      await fireStore.runTransaction(async (tx) => {
        const fresh = await tx.get(orderRef);
        if (!fresh.exists || !isStartStatus(fresh.data().status)) {
          return;
        }
        tx.set(orderRef, { status: K_STATUS_PREPARING }, { merge: true });
        didPromote = true;
      });

      if (!didPromote) {
        skipped++;
        skippedDetails.push({
          orderId: doc.id,
          reason: 'not_start_status_anymore',
          orderid: data.orderid ?? data.orderId ?? '',
          preparationdatetime: data.preparationdatetime,
        });
        continue;
      }

      await mirrorOrderPatch(storeId, doc.id, data, { status: K_STATUS_PREPARING });
      promoted++;
      promotedOrderIds.push({
        orderId: doc.id,
        orderid: data.orderid ?? data.orderId ?? '',
        preparationdatetime: data.preparationdatetime,
      });

      logPrepMonitor('promoted', {
        runId,
        storeId,
        orderId: doc.id,
        orderid: data.orderid ?? data.orderId ?? '',
        preparationdatetime: data.preparationdatetime,
      });

      const orderModel = { ...data, id: doc.id, status: K_STATUS_PREPARING };

      const slipPrinted = !!(data[K_ORDER_MODEL_SLIP_PRINTED] ?? data.feiepreprinted);
      if (feieEnabled && !slipPrinted) {
        const printResult = await handleFeieKitchenSlipsOnly(orderModel, storeModel);

        if (printResult.errors.length > 0) {
          for (const pe of printResult.errors) {
            errors.push({ orderId: doc.id, ...pe });
          }
        }

        printed += printResult.jobsSent;

        const noPrintersConfigured = printerCount === 0;
        const printComplete =
          printResult.errors.length === 0 &&
          (printResult.jobsSent > 0 || noPrintersConfigured);

        logPrepMonitor('feie_print', {
          runId,
          storeId,
          orderId: doc.id,
          jobsSent: printResult.jobsSent,
          printErrors: printResult.errors.length,
          slipprinted: printComplete,
        });

        if (printComplete) {
          const printPatch = {
            [K_ORDER_MODEL_SLIP_PRINTED]: true,
            slipprintedat: nowStr,
            feiepreprinted: true,
            feiepreprintedat: nowStr,
          };
          if (printResult.slipPrintPayloads?.length > 0) {
            printPatch[K_ORDER_MODEL_SLIP_PRINT_PAYLOAD] = printResult.slipPrintPayloads;
          }
          await mirrorOrderPatch(storeId, doc.id, data, printPatch, {
            includeStoreOrder: true,
          });
        }
      } else if (feieEnabled && slipPrinted) {
        logPrepMonitor('feie_skipped', {
          runId,
          storeId,
          orderId: doc.id,
          reason: 'already_slipprinted',
        });
      }
    } catch (err) {
      errors.push({ orderId: doc.id, error: err?.message ?? String(err) });
      logPrepMonitor('order_error', {
        runId,
        storeId,
        orderId: doc.id,
        error: err?.message ?? String(err),
      });
    }
  }

  const result = {
    runId,
    storeId,
    scanned,
    promoted,
    printed,
    skipped,
    errors,
    ranAt: nowStr,
    lookbackStr,
    nowStr,
    feieEnabled,
    printerCount,
    promotedOrderIds,
    skippedDetails,
  };

  logPrepMonitor('summary', {
    runId,
    storeId,
    scanned,
    promoted,
    printed,
    skipped,
    errorCount: errors.length,
    feieEnabled,
    printerCount,
    promotedOrderIds: promotedOrderIds.map((o) => o.orderid || o.orderId),
    skippedReasons: skippedDetails.reduce((acc, s) => {
      acc[s.reason] = (acc[s.reason] || 0) + 1;
      return acc;
    }, {}),
  });

  if (errors.length > 0) {
    logPrepMonitor('errors', { runId, storeId, errors });
  }

  return result;
}

class KdsRouter {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.get('/about', (req, res) => {
      res.json({ message: 'KDS preparation monitor v1.0' });
    });
    this.router.post('/preparation-monitor', this.handlePreparationMonitor.bind(this));
  }

  async handlePreparationMonitor(req, res) {
    const storeId = (req.body?.storeId ?? req.body?.storeid ?? '').toString().trim();
    if (!storeId) {
      return res.status(400).json({ error: 'storeId is required' });
    }

    try {
      const result = await monitorStorePreparation(storeId);
      return res.json(result);
    } catch (err) {
      console.error('[KdsRouter][PrepMonitor] failed', JSON.stringify({
        storeId,
        error: err?.message ?? String(err),
      }));
      return res.status(500).json({ error: err?.message ?? String(err) });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = KdsRouter;
module.exports.monitorStorePreparation = monitorStorePreparation;
