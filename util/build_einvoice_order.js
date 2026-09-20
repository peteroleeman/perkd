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

const DEFAULT_STORE_ID = 'S_eeb1c111-2df6-4ecc-a66f-202e5b9a38cf';
const DEFAULT_STORE_TITLE = 'Fudmart';

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

  const { receipt_id, amount, currency, device_number, list, merchant_id } = body;
  if (!receipt_id || !currency || !device_number || !list || !merchant_id) {
    return {
      ok: false,
      code: 'MISSING_FIELDS',
      message:
        'Missing required fields. Please provide receipt_id, amount, currency, device_number, list, and merchant_id',
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

/**
 * Build order document from /pos/einvoice-style payload.
 * @param {object} body
 * @param {import('firebase-admin').firestore.Firestore} fireStore
 * @param {{ paymentType?: string, mode?: string, orderId?: string }} [options]
 * @returns {Promise<{ ok: false, code: string, message: string } | { ok: true, orderData: object, storeId: string, id: string, grandTotal: number, subtotal: number }>}
 */
async function buildEinvoiceOrderFromBody(body, fireStore, options = {}) {
  const validated = validateEinvoiceBody(body);
  if (!validated.ok) return validated;

  const { receipt_id, amount, currency, device_number, list, merchant_id } = validated.body;
  const paymentType = options.paymentType || 'E-Invoice';
  const mode = options.mode || 'einvoice';
  const id = options.orderId || `O_${uuidv4()}`;

  const subtotal = list.reduce((sum, item) => sum + item.goods_count * item.goods_price, 0);
  const grandTotal = parseFloat(amount || subtotal) || 0;

  console.log(
    'Querying vending_merchant for merchant_id:',
    merchant_id,
    'device number:',
    device_number,
  );

  const merchantRef = fireStore.collection('vending_merchant').doc(merchant_id);
  const merchantDoc = await merchantRef.get();
  let storeId = DEFAULT_STORE_ID;
  let storeTitle = DEFAULT_STORE_TITLE;

  if (!merchantDoc.exists) {
    console.error('Merchant not found, use default', merchant_id);
  } else {
    const merchantData = merchantDoc.data();
    storeId = merchantData.storeid;
    storeTitle = merchantData.title || 'Unknown Store';
  }

  if (!storeId) {
    return {
      ok: false,
      code: 'STORE_NOT_FOUND',
      message: `Store ID not found for merchant ${merchant_id}`,
    };
  }

  console.log('Found store ID:', storeId);

  let vendingDeviceNumber = device_number;
  let vendingMerchantId = merchant_id;

  try {
    console.log('Querying merchant_device for fridgemid:', device_number);
    const machineModelQuery = await fireStore
      .collection('merchant_device')
      .where('fridgemid', '==', device_number)
      .limit(1)
      .get();

    if (!machineModelQuery.empty) {
      const machineModel = machineModelQuery.docs[0].data();
      if (machineModel.vendingdevicenumber) {
        vendingDeviceNumber = machineModel.vendingdevicenumber;
      }
      if (machineModel.vendingmerchantid) {
        vendingMerchantId = machineModel.vendingmerchantid;
      }
    } else {
      console.log(
        'Machine model not found in merchant_device with fridgemid:',
        device_number,
        '- using original device_number and merchant_id',
      );
    }
  } catch (machineModelError) {
    console.error('Error querying merchant_device:', machineModelError);
  }

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
    store_merchant_code: merchant_id,
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
  };
}

module.exports = {
  buildEinvoiceOrderFromBody,
  validateEinvoiceBody,
  formatOrderDateTime,
};
