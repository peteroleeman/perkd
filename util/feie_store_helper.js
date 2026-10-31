const UtilFeieOrderSlip = require('./util_feie_orderslip');

/**
 * Split store feies array into receipt / order-slip / label printers (Flutter logic).
 * @param {Array} feiesArray
 * @returns {{ receipt: object[], orderSlip: object[], label: object[] }}
 */
function getFeiePrintersFromFeiesArray(feiesArray) {
  const receipt = [];
  const orderSlip = [];
  const label = [];
  if (!Array.isArray(feiesArray)) return { receipt, orderSlip, label };
  for (const feie of feiesArray) {
    const type = String(feie?.type ?? feie?.Type ?? '').toUpperCase();
    if (type.includes('R')) receipt.push(feie);
    if (type.includes('O')) orderSlip.push(feie);
    if (type.includes('L')) label.push(feie);
  }
  return { receipt, orderSlip, label };
}

/**
 * @param {FirebaseFirestore.DocumentSnapshot} docSnapshot
 * @returns {object|null}
 */
function convertToStoreModel(docSnapshot) {
  if (!docSnapshot.exists) {
    return null;
  }

  const data = docSnapshot.data();

  return {
    id: docSnapshot.id,
    storecounter: data.storecounter || 0,
    title: data.title,
    currency: data.currency,
    initial: data.initial,
    companyid: data.companyid || data.companyId || '',
    loyaltycardids: Array.isArray(data.loyaltycardids) ? data.loyaltycardids : [],
    feies: data.feies || {},
    hasfeie: data.hasfeie,
    feieIsJP: !!(data.feieIsJP ?? data.feies?.isJP ?? true),
    feieTriggerViaApi: !!(data.feieTriggerViaApi ?? data.feies?.triggerViaApi),
    feieApiBaseUrl:
      data.feieApiBaseUrl ||
      data.feies?.apiBaseUrl ||
      process.env.FEIE_API_BASE_URL ||
      'https://api.foodio.online',
    feieOrderSlipStyle: 1,
    feieEnableIndividualSlip: !!(
      data.feieEnableIndividualSlip ?? data.feies?.enableIndividualSlip ?? false
    ),
    ...(Array.isArray(data.feies)
      ? (() => {
          const { receipt, orderSlip, label } = getFeiePrintersFromFeiesArray(data.feies);
          return {
            feiereceiptprinter: receipt,
            feieorderslipprinter: orderSlip,
            feielabelprinter: label,
          };
        })()
      : {
          feiereceiptprinter: Array.isArray(data.feiereceiptprinter)
            ? data.feiereceiptprinter
            : data.feies?.feiereceiptprinter || [],
          feieorderslipprinter: Array.isArray(data.feieorderslipprinter)
            ? data.feieorderslipprinter
            : data.feies?.feieorderslipprinter || [],
          feielabelprinter: Array.isArray(data.feielabelprinter)
            ? data.feielabelprinter
            : data.feies?.feielabelprinter || [],
        }),
    getTicket() {
      const paddedCounter = String(this.storecounter).padStart(4, '0');
      return 'e' + (this.initial || '') + paddedCounter;
    },
  };
}

/**
 * Resolve Firestore user document id from order phone (FU_ prefix).
 * @param {object} orderData
 * @returns {string|null}
 */
function resolveUserDocId(orderData) {
  const phone = (orderData?.userphonenumber ?? orderData?.userPhoneNumber ?? '')
    .toString()
    .trim();
  if (!phone) return null;
  return phone.startsWith('FU_') ? phone : `FU_${phone}`;
}

/**
 * O-type kitchen slip printers for a line item, with optional category filter.
 * @param {object[]} feies
 * @param {string} itemCategory
 * @returns {object[]}
 */
function getOrderSlipPrinters(feies, itemCategory) {
  return (feies || []).filter((feie) => {
    const type = String(feie?.type ?? feie?.Type ?? 'O');
    if (!type.includes('O')) return false;

    const cats = feie.categoryids;
    if (!cats || cats.length === 0) return true;
    return cats.includes(itemCategory);
  });
}

/**
 * Printers to use for kitchen slips: prefer raw feies array, else pre-split order-slip list.
 * @param {object} storeModel
 * @returns {object[]}
 */
function getStoreOrderSlipPrinterSource(storeModel) {
  if (Array.isArray(storeModel?.feies) && storeModel.feies.length > 0) {
    return storeModel.feies;
  }
  return storeModel?.feieorderslipprinter ?? [];
}

/**
 * Print O-type kitchen slips via kdsorderslipexap layout (Flutter UtilFeie parity).
 * @param {object} orderModel
 * @param {object} storeModel
 * @param {{ isReprint?: boolean }} [options]
 * @returns {Promise<{ jobsSent: number, errors: object[] }>}
 */
async function handleFeieKitchenSlipsOnly(orderModel, storeModel, options = {}) {
  const { isReprint = false } = options;
  const printers = getStoreOrderSlipPrinterSource(storeModel);

  if (!orderModel || !storeModel || printers.length === 0) {
    return { jobsSent: 0, errors: [], slipPrintPayloads: [] };
  }

  return UtilFeieOrderSlip.printFeieOrderSlipsForOrder(orderModel, storeModel, {
    isReprint,
    isJP: !!storeModel.feieIsJP,
    enableIndividual: storeModel.feieEnableIndividualSlip,
  });
}

function isFeieEnabledForStore(storeData, storeModel) {
  if (String(storeData?.hasfeie ?? '0') === '1') return true;
  const feies = storeData?.feies;
  if (Array.isArray(feies) && feies.length > 0) return true;
  const slipCount = (storeModel?.feieorderslipprinter ?? []).length;
  return slipCount > 0;
}

module.exports = {
  getFeiePrintersFromFeiesArray,
  convertToStoreModel,
  resolveUserDocId,
  getOrderSlipPrinters,
  getStoreOrderSlipPrinterSource,
  handleFeieKitchenSlipsOnly,
  isFeieEnabledForStore,
};
