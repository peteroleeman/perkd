const { v4: uuidv4 } = require('uuid');

const REQUIRED_ITEM_FIELDS = [
  'goods_count',
  'goods_description',
  'goods_id',
  'goods_name',
  'goods_photo',
  'goods_price',
  'goods_sku',
];

/**
 * Format date to YYYY-MM-DD HH:mm:ss.SSS format
 * @param {Date} date
 * @returns {string}
 */
function formatOrderDateTime(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * @param {object} body
 * @returns {{ ok: false, code: string, message: string } | { ok: true, body: object }}
 */
function validateEinvoiceBody(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, code: 'INVALID_BODY', message: 'Request body is missing or empty' };
  }

  const { receipt_id, currency, device_number, list } = body;
  if (!receipt_id || !currency || !device_number || !list) {
    return {
      ok: false,
      code: 'MISSING_FIELDS',
      message:
        'Missing required fields. Please provide receipt_id, currency, device_number, and list',
    };
  }

  if (!Array.isArray(list) || list.length === 0) {
    return {
      ok: false,
      code: 'INVALID_LIST',
      message: 'List must be a non-empty array of goods',
    };
  }

  for (const item of list) {
    const missingFields = REQUIRED_ITEM_FIELDS.filter((field) => item[field] == null);
    if (missingFields.length > 0) {
      return {
        ok: false,
        code: 'INVALID_LIST_ITEM',
        message: `Missing required fields in list item: ${missingFields.join(', ')}`,
      };
    }
  }

  return { ok: true, body };
}

function firstStoreId(machine) {
  const storeIds = machine.storeids || machine.storeIds || [];
  if (!Array.isArray(storeIds) || storeIds.length === 0) return '';
  return String(storeIds[0] || '').trim();
}

/**
 * @param {object} machine
 * @param {string} companyId
 * @returns {{ code: string, message: string } | null}
 */
function deviceCompanyMismatch(machine, companyId) {
  const machineCompanyId = String((machine && machine.companyid) || '').trim();
  if (!machineCompanyId || machineCompanyId === String(companyId || '').trim()) {
    return null;
  }
  return {
    code: 'DEVICE_COMPANY_MISMATCH',
    message: 'Device is not registered to this company',
  };
}

async function resolveStoreTitle(fireStore, storeId, machine) {
  const fromMachine = String((machine && machine.title) || '').trim();
  if (fromMachine) return fromMachine;
  const storeSnap = await fireStore.collection('store').doc(storeId).get();
  const fromStore =
    storeSnap.exists && storeSnap.data()
      ? String(storeSnap.data().title || '').trim()
      : '';
  return fromStore || 'Unknown Store';
}

/**
 * Build order document from a Ceria deduct payload.
 * Machine comes from merchant_device.fridgemid === device_number; storeid is
 * its first storeids entry and storetitle is its title (store title only if blank).
 * merchant_id on the body is ignored.
 * @param {object} body
 * @param {import('firebase-admin').firestore.Firestore} fireStore
 * @param {{ paymentType?: string, mode?: string, orderId?: string }} [options]
 * @returns {Promise<{ ok: false, code: string, message: string } | { ok: true, orderData: object, storeId: string, id: string, grandTotal: number, subtotal: number, machine: object }>}
 */
async function buildEinvoiceOrderFromBody(body, fireStore, options = {}) {
  const validated = validateEinvoiceBody(body);
  if (!validated.ok) return validated;

  const { receipt_id, amount, currency, device_number, list } = validated.body;
  const paymentType = options.paymentType || 'E-Invoice';
  const mode = options.mode || 'einvoice';
  const id = options.orderId || `O_${uuidv4()}`;

  const subtotal = list.reduce((sum, item) => sum + item.goods_count * item.goods_price, 0);
  const grandTotal = parseFloat(amount || subtotal) || 0;

  console.log('Querying merchant_device for fridgemid:', device_number);
  const machineModelQuery = await fireStore
    .collection('merchant_device')
    .where('fridgemid', '==', device_number)
    .limit(1)
    .get();

  if (machineModelQuery.empty) {
    return {
      ok: false,
      code: 'DEVICE_NOT_FOUND',
      message: `No machine found in merchant_device for device_number (fridgemid): ${device_number}`,
    };
  }

  const machine = machineModelQuery.docs[0].data() || {};
  const storeId = firstStoreId(machine);
  if (!storeId) {
    return {
      ok: false,
      code: 'STORE_NOT_FOUND',
      message: 'Machine model has no store linked (storeids empty).',
    };
  }

  const storeTitle = await resolveStoreTitle(fireStore, storeId, machine);
  const vendingDeviceNumber = machine.vendingdevicenumber || device_number;
  const vendingMerchantId = machine.vendingmerchantid || '';

  console.log('Found store ID:', storeId);

  const orderitems = list.map((item) => ({
    id: item.goods_id,
    sku: item.goods_sku,
    title: item.goods_name,
    quantity: item.goods_count,
    price: item.goods_price,
    discount_amount: 0,
    total_price: item.goods_count * item.goods_price,
  }));

  const totalQty = orderitems.reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 0), 0);
  const totalPrice = parseFloat(grandTotal.toFixed(2));
  const totalPaid = totalPrice;

  const orderData = {
    id,
    orderid: receipt_id,
    storetitle: storeTitle,
    store_merchant_code: vendingMerchantId,
    orderdatetime: formatOrderDateTime(),
    payment_type: paymentType,
    subtotal,
    grand_total: grandTotal,
    mode,
    kiosk_machine: vendingDeviceNumber,
    customer_payment: grandTotal,
    currency,
    devicenumber: vendingDeviceNumber,
    merchantid: vendingMerchantId,
    storeid: storeId,
    store_id: storeId,
    machine_model_id: machine.id,
    totalqty: totalQty,
    totalprice: totalPrice,
    totalpaid: totalPaid,
    orderitems,
    created_at: new Date(),
  };

  return {
    ok: true,
    orderData,
    storeId,
    id,
    grandTotal,
    subtotal,
    machine,
  };
}

module.exports = {
  buildEinvoiceOrderFromBody,
  validateEinvoiceBody,
  deviceCompanyMismatch,
  formatOrderDateTime,
};
