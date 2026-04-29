const express = require('express');
const { sendRequest, buildQuery } = require('./api/APICommon.cjs');
const { getCredentialsForStore } = require('./util/sqlAccountCredentials');
require('./db'); // Initialize firebase app
const firebase = require('firebase'); // Import firebase namespace for FieldValue
const fireStore = firebase.firestore();
const FieldValue = firebase.firestore.FieldValue;

class SqlAccountRouter {
  constructor() {
    this.router = express.Router();
    
    // Constants from sample/server.js
    this.SQL_PATH = "/salesinvoice/*";
    this.SQL_BASE_PATH = this.SQL_PATH.replace(/\/\*$/, "");
    this.CASH_SALES_PATH = "/cashsales/*";
    this.CASH_SALES_BASE_PATH = this.CASH_SALES_PATH.replace(/\/\*$/, "");
    this.STOCK_COLLECTION_PATH = "/stockitem";
    this.STOCK_LOOKUP_PATH = `${this.STOCK_COLLECTION_PATH}/*`;
    this.STOCK_REMOTE_PAGE_LIMIT = 50;
    this.STOCK_MAX_LIMIT = 250;
    this.STOCK_GROUP_COLLECTION_PATH = "/stockgroup";
    this.STOCK_GROUP_LOOKUP_PATH = `${this.STOCK_GROUP_COLLECTION_PATH}/*`;
    this.CUSTOMER_COLLECTION_PATH = "/customer";
    this.CUSTOMER_LOOKUP_PATH = `${this.CUSTOMER_COLLECTION_PATH}/*`;
    this.CUSTOMER_REMOTE_PAGE_LIMIT = 50;
    this.CUSTOMER_MAX_LIMIT = 250;
    this.CUSTOMER_PAYMENT_PATH = "/customerpayment";
    this.CUSTOMER_PAYMENT_REMOTE_PAGE_LIMIT = 50;
    this.CUSTOMER_PAYMENT_MAX_LIMIT = 250;
    this.STOCK_ADJUSTMENT_PATH = "/stockadjustment";
    this.STOCK_ADJUSTMENT_REMOTE_PAGE_LIMIT = 50;
    this.STOCK_ADJUSTMENT_MAX_LIMIT = 250;
    this.SALES_REMOTE_PAGE_LIMIT = 50;
    this.SALES_MAX_LIMIT = 250;
    
    this.initializeRoutes();
  }

  initializeRoutes() {
    // Credentials endpoint
    this.router.get('/credentials', this.getCredentials.bind(this));

    // Sales Invoice endpoints
    this.router.get('/salesinvoice', this.getSalesInvoice.bind(this));
    this.router.get('/salesinvoice/:dockey', this.getSalesInvoiceByDockey.bind(this));
    this.router.post('/salesinvoice', this.createSalesInvoice.bind(this));
    this.router.put('/salesinvoice/:dockey', this.updateSalesInvoice.bind(this));
    this.router.delete('/salesinvoice/:dockey', this.deleteSalesInvoice.bind(this));
    this.router.post('/salesinvoice/preview', this.previewSalesInvoice.bind(this));
    this.router.post('/salesinvoice/sync', this.syncSalesInvoice.bind(this));
    this.router.post('/salesinvoice/fromorder', this.createInvoiceFromOrder.bind(this));

    // Cash Sales endpoints - specific routes must come before parameterized routes
    this.router.get('/cashsales', this.getCashSales.bind(this));
    this.router.post('/cashsales', this.createCashSales.bind(this));
    this.router.post('/cashsales/preview', this.previewCashSales.bind(this));
    this.router.post('/cashsales/sync', this.syncCashSales.bind(this));
    this.router.post('/cashsales/fromorder', this.createCashSalesFromOrder.bind(this));
    this.router.put('/cashsales/fromorder', this.updateCashSalesFromOrder.bind(this));
    this.router.get('/cashsales/by-docno/:docno', this.getCashSalesByDocno.bind(this));
    this.router.get('/cashsales/:dockey', this.getCashSalesByDockey.bind(this));
    this.router.put('/cashsales/:dockey', this.updateCashSales.bind(this));
    this.router.delete('/cashsales/:dockey', this.deleteCashSales.bind(this));

    // Stock Item endpoints
    this.router.get('/stockitem', this.getStockItem.bind(this));
    // Must be registered before /stockitem/:dockey so "sync-firestore" is not treated as a dockey
    this.router.post('/stockitem/sync-firestore', this.syncStockItemsToFirestore.bind(this));
    this.router.post('/stockitem/sync-firestore/:storeId', this.syncStockItemsToFirestore.bind(this));
    this.router.get('/stockitem/:dockey', this.getStockItemByDockey.bind(this));
    this.router.post('/stockitem', this.createStockItem.bind(this));
    this.router.put('/stockitem/:dockey', this.updateStockItem.bind(this));
    this.router.delete('/stockitem/:dockey', this.deleteStockItem.bind(this));
    this.router.get('/stockitem/search/:code', this.searchStockItemByCode.bind(this));
    this.router.get('/stockitem/all', this.getAllStockItems.bind(this));

    // Stock Group endpoints
    this.router.get('/stockgroup', this.getStockGroup.bind(this));
    this.router.get('/stockgroup/:dockey', this.getStockGroupByDockey.bind(this));
    this.router.post('/stockgroup', this.createStockGroup.bind(this));
    this.router.put('/stockgroup/:dockey', this.updateStockGroup.bind(this));
    this.router.delete('/stockgroup/:dockey', this.deleteStockGroup.bind(this));
    this.router.get('/stockgroup/search/:code', this.searchStockGroupByCode.bind(this));
    this.router.get('/stockgroup/all', this.getAllStockGroups.bind(this));

    // Customer Payment endpoints
    this.router.get('/customerpayment', this.getCustomerPayment.bind(this));
    this.router.post('/customerpayment/create', this.createCustomerPaymentWithParams.bind(this));
    this.router.post('/customerpayment/void', this.voidCustomerPaymentByDocno.bind(this));
    this.router.get('/customerpayment/:dockey', this.getCustomerPaymentByDockey.bind(this));
    this.router.post('/customerpayment', this.createCustomerPayment.bind(this));
    this.router.put('/customerpayment/:dockey', this.updateCustomerPayment.bind(this));
    this.router.delete('/customerpayment/by-docno/:docno', this.deleteCustomerPaymentByDocno.bind(this));
    this.router.delete('/customerpayment/:dockey', this.deleteCustomerPayment.bind(this));

    // Stock Adjustment endpoints
    this.router.get('/stockadjustment', this.getStockAdjustment.bind(this));
    this.router.get('/stockadjustment/:dockey', this.getStockAdjustmentByDockey.bind(this));
    this.router.post('/stockadjustment', this.createStockAdjustment.bind(this));
    this.router.put('/stockadjustment/:dockey', this.updateStockAdjustment.bind(this));
    this.router.delete('/stockadjustment/:dockey', this.deleteStockAdjustment.bind(this));

    // Customer endpoints - order matters: specific routes before wildcard
    this.router.get('/customer/phone/:phone', this.getCustomerByPhone.bind(this));
    this.router.get('/customer', this.getCustomer.bind(this));
    this.router.get('/customer/*', this.getCustomerWildcard.bind(this));
    this.router.post('/customer', this.createCustomer.bind(this));
    this.router.put('/customer/:identifier', this.updateCustomer.bind(this));
    this.router.delete('/customer/:identifier', this.deleteCustomer.bind(this));
    this.router.get('/customer/search/:code', this.searchCustomerByCode.bind(this));
    this.router.get('/customer/all', this.getAllCustomers.bind(this));
  }

  // Helper functions
  buildSqlItemPath(identifier) {
    return `${this.SQL_BASE_PATH}/${encodeURIComponent(identifier)}`;
  }

  buildCashSalesPath(identifier) {
    return `${this.CASH_SALES_BASE_PATH}/${encodeURIComponent(identifier)}`;
  }

  buildStockItemPath(identifier) {
    return `${this.STOCK_COLLECTION_PATH}/${encodeURIComponent(identifier)}`;
  }

  buildStockGroupPath(identifier) {
    return `${this.STOCK_GROUP_COLLECTION_PATH}/${encodeURIComponent(identifier)}`;
  }

  buildCustomerPaymentPath(identifier) {
    return `${this.CUSTOMER_PAYMENT_PATH}/${encodeURIComponent(identifier)}`;
  }

  buildStockAdjustmentPath(identifier) {
    return `${this.STOCK_ADJUSTMENT_PATH}/${encodeURIComponent(identifier)}`;
  }

  buildCustomerPath(identifier) {
    return `${this.CUSTOMER_COLLECTION_PATH}/${encodeURIComponent(identifier)}`;
  }

  /**
   * Resolve storeId from request (query for GET, body for POST/PUT).
   * @param {Object} req - Express request
   * @returns {string|null} Store ID or null
   */
  getStoreIdFromRequest(req) {
    if (!req) return null;
    return req.query?.storeId ?? req.query?.storeid ?? req.body?.storeId ?? req.body?.storeid ?? req.body?.order?.storeId ?? req.body?.order?.storeid ?? null;
  }

  /**
   * Make API request; uses per-store credentials when storeId provided.
   * @param {string|null} storeId - Store ID for credentials (optional)
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {Object} body - Request body
   * @param {string} query - Query string
   * @returns {Promise<Object>}
   */
  async _requestWithOptionalStore(storeId, method, path, body = null, query = "") {
    if (storeId) {
      return this.sendRequestWithCredentials(storeId, method, path, body, query );
    }
    return sendRequest(method, path, body, query);
  }

  /**
   * Fetch store document data from Firestore by storeId (for SQL Account payment mapping).
   * @param {string} storeId - Store document ID
   * @returns {Promise<Object|null>} Store data or null if not found
   */
  async getStoreData(storeId) {
    if (!storeId) return null;
    try {
      const snap = await fireStore.collection('store').doc(storeId).get();
      return snap.exists ? snap.data() : null;
    } catch (e) {
      console.warn('[SQL Account] getStoreData error:', e.message);
      return null;
    }
  }

  /**
   * Map order paymentType (e.g. "Cash", "Credit Card", "Touch 'n Go") to store's SQL Account payment code.
   * @param {string} paymentType - Payment type label from mixedpayments[].paymentType
   * @param {Object} store - Store document data with sqlaccount_code_cash, sqlaccount_code_credit_card, sqlaccount_code_ewallet
   * @returns {string|null} The mapped code or null if not set
   */
  mapPaymentTypeToSqlCode(paymentType, store) {
    if (!store || !paymentType) return null;
    const t = String(paymentType).trim().toLowerCase();
    if (t.includes('cash')) {
      const code = store.sqlaccount_code_cash ?? store.sqlAccountCodeCash ?? '';
      return code ? String(code).trim() : null;
    }
    if (t.includes('credit') && t.includes('card')) {
      const code = store.sqlaccount_code_credit_card ?? store.sqlAccountCodeCreditCard ?? '';
      return code ? String(code).trim() : null;
    }
    const code = store.sqlaccount_code_ewallet ?? store.sqlAccountCodeEwallet ?? '';
    return code ? String(code).trim() : null;
  }

  pickFirstRecord(payload) {
    if (!payload) return null;
    if (Array.isArray(payload.data) && payload.data.length) {
      return payload.data[0];
    }
    if (Array.isArray(payload.items) && payload.items.length) {
      return payload.items[0];
    }
    return payload;
  }

  removeNullValues(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.removeNullValues(item));
    }

    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== null && v !== "----")
        .map(([k, v]) => [k, this.removeNullValues(v)])
    );
  }

  /**
   * Firestore document id for a SQL Account stock summary row (dockey preferred).
   * @param {Object} item
   * @param {number} index - fallback index when no stable id
   * @returns {string}
   */
  stockItemFirestoreDocId(item, index) {
    const key = item?.dockey ?? item?.docKey ?? item?.DocKey;
    const code = item?.code ?? item?.Code ?? item?.stockcode ?? item?.StockCode;
    let id =
      key != null && String(key).trim() !== ''
        ? String(key).trim()
        : code != null && String(code).trim() !== ''
          ? String(code).trim()
          : `idx_${index}`;
    id = id.replace(/[/\\]/g, '_');
    if (id.length > 800) id = id.slice(0, 800);
    return id || `idx_${index}`;
  }

  mapReportOrderToSqlInvoice(order = {}) {
    const header = order.header || {};
    const items = Array.isArray(order.items) ? order.items : [];
    const payments = Array.isArray(order.payments) ? order.payments : [];

    const normalizedItems = items.map((item, idx) => {
      const qty = Number(item.qty || 1);
      const net = Number(item.net || item.netAmount || 0);
      return {
        ItemCode: item.itemCode || `MENU-${idx + 1}`,
        Description: item.name || item.description || "Sales Item",
        Qty: qty,
        UPrice: qty ? net / qty : net,
        TaxCode: item.taxCode || "SR",
        TaxAmount: Number(item.taxAmount || 0),
        Discount: Number(item.discount || 0),
        LineTotal: net,
      };
    });

    const totalNet = normalizedItems.reduce((sum, line) => sum + line.LineTotal, 0);
    const serviceCharge = Number(header.serviceCharge || 0);
    const sst = Number(header.sst || header.tax || 0);
    const discounts = Number(header.discount || 0);

    return {
      DocNo: header.orderId || header.ref || "TEMP-ORDER",
      DocDate: header.orderDate || new Date().toISOString().slice(0, 10),
      CusCode: header.customerCode || "CASH",
      Description: header.remarks || "Report+ Sales Sync",
      Items: normalizedItems,
      Summary: {
        SubTotal: totalNet,
        ServiceCharge: serviceCharge,
        SST: sst,
        Discount: discounts,
        GrandTotal: totalNet + serviceCharge + sst - discounts,
      },
      Payments: payments.map((pmt, idx) => ({
        PayType: pmt.type || `PAY-${idx + 1}`,
        Amount: Number(pmt.amount || 0),
        Reference: pmt.reference || header.orderId,
      })),
      Metadata: {
        SourceSystem: "Report+ Foodio",
        Location: header.location || order.outlet || "",
        CreatedAt: header.orderDateTime || new Date().toISOString(),
      },
    };
  }

  async fetchStockRecordByCode(code, storeId = null) {
    if (!code) {
      const err = new Error("Stock item code is required.");
      err.statusCode = 400;
      throw err;
    }

    const query = buildQuery({ code });
    const summary = await this._requestWithOptionalStore(storeId, "GET", this.STOCK_LOOKUP_PATH, null, query);
    const summaryRecord = this.pickFirstRecord(summary);
    if (!summaryRecord || !summaryRecord.dockey) {
      const err = new Error(`Stock item '${code}' not found.`);
      err.statusCode = 404;
      throw err;
    }

    const detail = await this._requestWithOptionalStore(storeId, "GET", this.buildStockItemPath(summaryRecord.dockey));
    const detailRecord = this.pickFirstRecord(detail);

    return {
      summary,
      detail,
      record: { ...summaryRecord, ...(detailRecord || {}) },
    };
  }

  /**
   * Enrich an array of summary stock items with detail data.
   * For each item, fetches the detail by dockey and merges the fields.
   * If a detail fetch fails for an item, the summary data is returned as-is.
   * @param {Array} summaryItems - Array of summary-level stock item objects
   * @returns {Promise<Array>} Array of enriched stock item objects
   */
  async enrichStockItemsWithDetail(summaryItems, storeId = null) {
    const enriched = [];
    for (const item of summaryItems) {
      if (item.dockey) {
        try {
          const detail = await this._requestWithOptionalStore(storeId, "GET", this.buildStockItemPath(item.dockey));
          const detailRecord = this.pickFirstRecord(detail);
          enriched.push({ ...item, ...(detailRecord || {}) });
        } catch (e) {
          // If detail fetch fails for an item, return the summary data as-is
          enriched.push(item);
        }
      } else {
        enriched.push(item);
      }
    }
    return enriched;
  }

  async fetchStockItemsRange(offset = 0, limit = this.STOCK_REMOTE_PAGE_LIMIT, storeId = null) {
    const normalizedOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;
    const requestedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : this.STOCK_REMOTE_PAGE_LIMIT;
    const targetLimit = Math.min(requestedLimit, this.STOCK_MAX_LIMIT);

    let remaining = targetLimit;
    let nextOffset = normalizedOffset;
    let lastResponse = null;
    const combined = [];

    while (remaining > 0) {
      const batchLimit = Math.min(remaining, this.STOCK_REMOTE_PAGE_LIMIT);
      const query = buildQuery({ offset: nextOffset, limit: batchLimit });
      const response = await this._requestWithOptionalStore(storeId, "GET", this.STOCK_COLLECTION_PATH, null, query);
      lastResponse = response;

      const batch = Array.isArray(response?.data) ? response.data : [];
      combined.push(...batch);

      const fetched = batch.length;
      if (fetched < batchLimit) {
        break;
      }
      remaining -= fetched;
      nextOffset += fetched;
    }

    const pagination = {
      offset: normalizedOffset,
      limit: targetLimit,
      count: combined.length,
    };

    if (lastResponse && typeof lastResponse === "object") {
      return {
        ...lastResponse,
        pagination,
        data: combined.slice(0, targetLimit),
      };
    }

    return { pagination, data: combined.slice(0, targetLimit) };
  }

  async fetchStockGroupRecordByCode(code) {
    if (!code) {
      const err = new Error("Stock group code is required.");
      err.statusCode = 400;
      throw err;
    }

    const query = buildQuery({ code });
    const summary = await sendRequest("GET", this.STOCK_GROUP_LOOKUP_PATH, null, query);
    const summaryRecord = this.pickFirstRecord(summary);
    if (!summaryRecord || !summaryRecord.dockey) {
      const err = new Error(`Stock group '${code}' not found.`);
      err.statusCode = 404;
      throw err;
    }

    const detail = await sendRequest("GET", this.buildStockGroupPath(summaryRecord.dockey));
    const detailRecord = this.pickFirstRecord(detail);

    return {
      summary,
      detail,
      record: { ...summaryRecord, ...(detailRecord || {}) },
    };
  }

  async fetchStockGroupsRange(offset = 0, limit = this.STOCK_REMOTE_PAGE_LIMIT) {
    const normalizedOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;
    const requestedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : this.STOCK_REMOTE_PAGE_LIMIT;
    const targetLimit = Math.min(requestedLimit, this.STOCK_MAX_LIMIT);

    let remaining = targetLimit;
    let nextOffset = normalizedOffset;
    let lastResponse = null;
    const combined = [];

    while (remaining > 0) {
      const batchLimit = Math.min(remaining, this.STOCK_REMOTE_PAGE_LIMIT);
      const query = buildQuery({ offset: nextOffset, limit: batchLimit });
      const response = await sendRequest("GET", this.STOCK_GROUP_COLLECTION_PATH, null, query);
      lastResponse = response;

      const batch = Array.isArray(response?.data) ? response.data : [];
      combined.push(...batch);

      const fetched = batch.length;
      if (fetched < batchLimit) {
        break;
      }
      remaining -= fetched;
      nextOffset += fetched;
    }

    const pagination = {
      offset: normalizedOffset,
      limit: targetLimit,
      count: combined.length,
    };

    if (lastResponse && typeof lastResponse === "object") {
      return {
        ...lastResponse,
        pagination,
        data: combined.slice(0, targetLimit),
      };
    }

    return { pagination, data: combined.slice(0, targetLimit) };
  }

  async fetchCustomerRecordByCode(code, storeId = null) {
    if (!code) {
      const err = new Error("Customer code is required.");
      err.statusCode = 400;
      throw err;
    }

    const query = buildQuery({ code });
    const summary = await this._requestWithOptionalStore(storeId, "GET", this.CUSTOMER_LOOKUP_PATH, null, query);
    const summaryRecord = this.pickFirstRecord(summary);
    if (!summaryRecord || !summaryRecord.dockey) {
      const err = new Error(`Customer '${code}' not found.`);
      err.statusCode = 404;
      throw err;
    }

    const detail = await this._requestWithOptionalStore(storeId, "GET", this.buildCustomerPath(summaryRecord.dockey));
    const detailRecord = this.pickFirstRecord(detail);

    return {
      summary,
      detail,
      record: { ...summaryRecord, ...(detailRecord || {}) },
    };
  }

  async fetchCustomersRange(offset = 0, limit = this.CUSTOMER_REMOTE_PAGE_LIMIT, storeId = null) {
    const normalizedOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;
    const requestedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : this.CUSTOMER_REMOTE_PAGE_LIMIT;
    const targetLimit = Math.min(requestedLimit, this.CUSTOMER_MAX_LIMIT);

    let remaining = targetLimit;
    let nextOffset = normalizedOffset;
    let lastResponse = null;
    const combined = [];

    while (remaining > 0) {
      const batchLimit = Math.min(remaining, this.CUSTOMER_REMOTE_PAGE_LIMIT);
      const query = buildQuery({ offset: nextOffset, limit: batchLimit });
      const response = await this._requestWithOptionalStore(storeId, "GET", this.CUSTOMER_COLLECTION_PATH, null, query);
      lastResponse = response;

      const batch = Array.isArray(response?.data) ? response.data : [];
      combined.push(...batch);

      const fetched = batch.length;
      if (fetched < batchLimit) {
        break;
      }
      remaining -= fetched;
      nextOffset += fetched;
    }

    const pagination = {
      offset: normalizedOffset,
      limit: targetLimit,
      count: combined.length,
    };

    if (lastResponse && typeof lastResponse === "object") {
      return {
        ...lastResponse,
        pagination,
        data: combined.slice(0, targetLimit),
      };
    }

    return { pagination, data: combined.slice(0, targetLimit) };
  }

  async fetchInvoicesRange(offset = 0, limit = this.SALES_REMOTE_PAGE_LIMIT, storeId = null) {
    const normalizedOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;
    const requestedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : this.SALES_REMOTE_PAGE_LIMIT;
    const targetLimit = Math.min(requestedLimit, this.SALES_MAX_LIMIT);

    let remaining = targetLimit;
    let nextOffset = normalizedOffset;
    let lastResponse = null;
    const combined = [];

    while (remaining > 0) {
      const batchLimit = Math.min(remaining, this.SALES_REMOTE_PAGE_LIMIT);
      const query = buildQuery({
        offset: nextOffset,
        limit: batchLimit,
      });

      const response = await this._requestWithOptionalStore(storeId, "GET", this.SQL_PATH, null, query);
      lastResponse = response;

      const batch = Array.isArray(response?.data) ? response.data : [];
      combined.push(...batch);

      const fetched = batch.length;
      if (fetched < batchLimit) {
        break;
      }
      remaining -= fetched;
      nextOffset += fetched;
    }

    const pagination = {
      offset: normalizedOffset,
      limit: targetLimit,
      count: combined.length,
    };

    if (lastResponse && typeof lastResponse === "object") {
      return {
        ...lastResponse,
        pagination,
        data: combined.slice(0, targetLimit),
      };
    }

    return { pagination, data: combined.slice(0, targetLimit) };
  }

  async fetchCashSalesRange(offset = 0, limit = this.SALES_REMOTE_PAGE_LIMIT, storeId = null) {
    const normalizedOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;
    const requestedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : this.SALES_REMOTE_PAGE_LIMIT;
    const targetLimit = Math.min(requestedLimit, this.SALES_MAX_LIMIT);

    let remaining = targetLimit;
    let nextOffset = normalizedOffset;
    let lastResponse = null;
    const combined = [];

    while (remaining > 0) {
      const batchLimit = Math.min(remaining, this.SALES_REMOTE_PAGE_LIMIT);
      const query = buildQuery({
        offset: nextOffset,
        limit: batchLimit,
      });

      const response = await this._requestWithOptionalStore(storeId, "GET", this.CASH_SALES_PATH, null, query);
      lastResponse = response;

      const batch = Array.isArray(response?.data) ? response.data : [];
      combined.push(...batch);

      const fetched = batch.length;
      if (fetched < batchLimit) {
        break;
      }
      remaining -= fetched;
      nextOffset += fetched;
    }

    const pagination = {
      offset: normalizedOffset,
      limit: targetLimit,
      count: combined.length,
    };

    if (lastResponse && typeof lastResponse === "object") {
      return {
        ...lastResponse,
        pagination,
        data: combined.slice(0, targetLimit),
      };
    }

    return { pagination, data: combined.slice(0, targetLimit) };
  }

  buildError(err) {
    if (err.response) {
      return {
        message: err.response.data?.message || err.response.statusText,
        status: err.response.status,
        data: err.response.data,
      };
    }
    return { message: err.message || "Unknown error" };
  }

  // Sales Invoice route handlers
  async getSalesInvoice(req, res) {
    try {
      const storeId = this.getStoreIdFromRequest(req);
      if (req.query.docNo) {
        const query = buildQuery({ docNo: req.query.docNo });
        const data = await this._requestWithOptionalStore(storeId, "GET", this.SQL_PATH, null, query);
        return res.json(data);
      }

      const offset = typeof req.query.offset !== "undefined" ? Number(req.query.offset) : 0;
      const limit = typeof req.query.limit !== "undefined" ? Number(req.query.limit) : this.SALES_REMOTE_PAGE_LIMIT;
      const data = await this.fetchInvoicesRange(offset, limit, storeId);
      res.json(data);
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async getSalesInvoiceByDockey(req, res) {
    try {
      const { dockey } = req.params;
      if (!dockey) {
        return res.status(400).json({ message: "Invoice dockey is required." });
      }
      const storeId = this.getStoreIdFromRequest(req);
      const data = await this._requestWithOptionalStore(storeId, "GET", this.buildSqlItemPath(dockey));
      res.json(data);
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async createSalesInvoice(req, res) {
    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Invoice payload is required." });
      }
      const storeId = this.getStoreIdFromRequest(req);
      const data = await this._requestWithOptionalStore(storeId, "POST", this.SQL_BASE_PATH, req.body);
      res.status(201).json({ status: "created", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async updateSalesInvoice(req, res) {
    try {
      const dockey = req.params.dockey;
      if (!dockey) {
        return res.status(400).json({ message: "Invoice dockey is required." });
      }
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Update payload is required." });
      }

      const storeId = this.getStoreIdFromRequest(req);
      // Always look up the latest record so we send a valid master payload.
      const existing = await this._requestWithOptionalStore(storeId, "GET", this.buildSqlItemPath(dockey));
      const record = this.pickFirstRecord(existing);
      if (!record || typeof record.updatecount === "undefined") {
        return res
          .status(400)
          .json({ message: "Unable to resolve updatecount for the target invoice." });
      }

      // Merge server-resolved fields into the final payload.
      const finalPayload = this.removeNullValues({
        ...record,
        ...req.body,
        dockey: record.dockey,
        docno: record.docno,
        updatecount: (record.updatecount || 0) + 1,
      });

      console.log("finalPayload", finalPayload);

      const pathName = this.buildSqlItemPath(dockey);
      const data = await this._requestWithOptionalStore(storeId, "PUT", pathName, finalPayload);
      res.json({ status: "updated", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async deleteSalesInvoice(req, res) {
    try {
      const dockey = req.params.dockey;
      if (!dockey) {
        return res.status(400).json({ message: "Invoice dockey is required." });
      }

      const pathName = this.buildSqlItemPath(dockey);
      const data = await sendRequest("DELETE", pathName);
      res.json({ status: "deleted", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  previewSalesInvoice(req, res) {
    const payload = this.mapReportOrderToSqlInvoice(req.body || {});
    res.json({
      payload,
      note: "Preview only. Use /salesinvoice/sync to send to SQL Accounting.",
    });
  }

  async syncSalesInvoice(req, res) {
    try {
      const payload = this.mapReportOrderToSqlInvoice(req.body || {});
      const data = await sendRequest("POST", this.SQL_PATH, payload, "", {
        headers: req.body?.__headers,
      });
      res.json({ status: "synced", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  // Cash Sales route handlers
  async getCashSales(req, res) {
    try {
      const storeId = this.getStoreIdFromRequest(req);
      if (req.query.docNo) {
        const query = buildQuery({ docNo: req.query.docNo });
        const data = await this._requestWithOptionalStore(storeId, "GET", this.CASH_SALES_PATH, null, query);
        return res.json(data);
      }

      const offset = typeof req.query.offset !== "undefined" ? Number(req.query.offset) : 0;
      const limit = typeof req.query.limit !== "undefined" ? Number(req.query.limit) : this.SALES_REMOTE_PAGE_LIMIT;
      const data = await this.fetchCashSalesRange(offset, limit, storeId);
      res.json(data);
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async getCashSalesByDockey(req, res) {
    try {
      const { dockey } = req.params;
      if (!dockey) {
        return res.status(400).json({ message: "Cash sales dockey is required." });
      }
      const storeId = this.getStoreIdFromRequest(req);
      const data = await this._requestWithOptionalStore(storeId, "GET", this.buildCashSalesPath(dockey));
      res.json(data);
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  /**
   * GET /sqlaccount/cashsales/by-docno/:docno
   * Lookup cash sales by document number (same SQL API query as GET /cashsales?docNo=...)
   */
  async getCashSalesByDocno(req, res) {
    try {
      const { docno } = req.params;
      if (!docno) {
        return res.status(400).json({ message: "Cash sales docno is required." });
      }
      const storeId = this.getStoreIdFromRequest(req);
      const query = buildQuery({ docNo: docno });
      const data = await this._requestWithOptionalStore(storeId, "GET", this.CASH_SALES_PATH, null, query);
      res.json(data);
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async createCashSales(req, res) {
    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Cash sales payload is required." });
      }
      const storeId = this.getStoreIdFromRequest(req);
      const data = await this._requestWithOptionalStore(storeId, "POST", this.CASH_SALES_BASE_PATH, req.body);
      res.status(201).json({ status: "created", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async updateCashSales(req, res) {
    try {
      const dockey = req.params.dockey;
      if (!dockey) {
        return res.status(400).json({ message: "Cash sales dockey is required." });
      }
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Update payload is required." });
      }

      const storeId = this.getStoreIdFromRequest(req);

      // Always look up the latest record so we send a valid master payload.
      const existing = await this._requestWithOptionalStore(storeId, "GET", this.buildCashSalesPath(dockey));
      const record = this.pickFirstRecord(existing);
      if (!record || typeof record.updatecount === "undefined") {
        return res
          .status(400)
          .json({ message: "Unable to resolve updatecount for the target cash sale." });
      }

      // Merge server-resolved fields into the final payload.
      const finalPayload = this.removeNullValues({
        ...record,
        ...req.body,
        dockey: record.dockey,
        docno: record.docno,
        updatecount: (record.updatecount || 0) + 1,
      });

      console.log("Final payload for updating cash sales:", finalPayload);

      const pathName = this.buildCashSalesPath(dockey);
      const data = await this._requestWithOptionalStore(storeId, "PUT", pathName, finalPayload);
      res.json({ status: "updated", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async deleteCashSales(req, res) {
    try {
      const dockey = req.params.dockey;
      if (!dockey) {
        return res.status(400).json({ message: "Cash sales dockey is required." });
      }

      const pathName = this.buildCashSalesPath(dockey);
      const data = await sendRequest("DELETE", pathName);
      res.json({ status: "deleted", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  // Customer Payment route handlers
  async getCustomerPayment(req, res) {
    try {
      const docno = req.query.docno || req.query.docNo;
      if (docno) {
        console.log('[CUSTOMER PAYMENT] getCustomerPayment (by docno):', docno);
        const query = buildQuery({ docno });
        const data = await sendRequest("GET", this.CUSTOMER_PAYMENT_PATH, null, query);
        return res.json(data);
      }

      const offset = typeof req.query.offset !== "undefined" ? Number(req.query.offset) : 0;
      const limit = typeof req.query.limit !== "undefined"
        ? Number(req.query.limit)
        : this.CUSTOMER_PAYMENT_REMOTE_PAGE_LIMIT;
      console.log('[CUSTOMER PAYMENT] getCustomerPayment (list): offset=', offset, 'limit=', limit);
      const query = buildQuery({ offset, limit });
      const data = await sendRequest("GET", this.CUSTOMER_PAYMENT_PATH, null, query);
      res.json(data);
    } catch (error) {
      console.warn('[CUSTOMER PAYMENT] getCustomerPayment error:', error.response?.status, error.message);
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async getCustomerPaymentByDockey(req, res) {
    try {
      const { dockey } = req.params;
      if (!dockey) {
        return res.status(400).json({ message: "Customer payment dockey is required." });
      }
      console.log('[CUSTOMER PAYMENT] getCustomerPaymentByDockey:', dockey);
      const data = await sendRequest("GET", this.buildCustomerPaymentPath(dockey));
      res.json(data);
    } catch (error) {
      console.warn('[CUSTOMER PAYMENT] getCustomerPaymentByDockey error: dockey=', req.params?.dockey, error.response?.status, error.message);
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async createCustomerPayment(req, res) {
    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Customer payment payload is required." });
      }
      const docno = req.body.docno;
      const code = req.body.code;
      console.log('[CUSTOMER PAYMENT] createCustomerPayment: docno=', docno, 'code=', code, 'amount=', req.body.docamt);
      const data = await sendRequest("POST", this.CUSTOMER_PAYMENT_PATH, req.body);
      console.log('[CUSTOMER PAYMENT] createCustomerPayment success:', docno);
      res.status(201).json({ status: "created", data });
    } catch (error) {
      console.warn('[CUSTOMER PAYMENT] createCustomerPayment error:', error.response?.status, error.message);
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async updateCustomerPayment(req, res) {
    try {
      const { dockey } = req.params;
      if (!dockey) {
        return res.status(400).json({ message: "Customer payment dockey is required." });
      }
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Update payload is required." });
      }
      console.log('[CUSTOMER PAYMENT] updateCustomerPayment: dockey=', dockey);

      const existing = await sendRequest("GET", this.buildCustomerPaymentPath(dockey));
      const record = this.pickFirstRecord(existing);
      if (!record || typeof record.updatecount === "undefined") {
        return res
          .status(400)
          .json({ message: "Unable to resolve updatecount for the target customer payment." });
      }

      const finalPayload = this.removeNullValues({
        ...record,
        ...req.body,
        dockey: record.dockey,
        docno: record.docno,
        updatecount: record.updatecount,
      });
      delete finalPayload.code;

      const data = await sendRequest("PUT", this.buildCustomerPaymentPath(dockey), finalPayload);
      console.log('[CUSTOMER PAYMENT] updateCustomerPayment success:', dockey);
      res.json({ status: "updated", data });
    } catch (error) {
      console.warn('[CUSTOMER PAYMENT] updateCustomerPayment error: dockey=', req.params?.dockey, error.response?.status, error.message);
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async deleteCustomerPayment(req, res) {
    try {
      const { dockey } = req.params;
      if (!dockey) {
        return res.status(400).json({ message: "Customer payment dockey is required." });
      }
      console.log('[CUSTOMER PAYMENT] deleteCustomerPayment: dockey=', dockey);
      const data = await sendRequest("DELETE", this.buildCustomerPaymentPath(dockey));
      console.log('[CUSTOMER PAYMENT] deleteCustomerPayment success:', dockey);
      res.json({ status: "deleted", data });
    } catch (error) {
      console.warn('[CUSTOMER PAYMENT] deleteCustomerPayment error: dockey=', req.params?.dockey, error.response?.status, error.message);
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  /**
   * Helper: Create customer payment with docno, code, payment method, amount.
   * @param {Object} params
   * @param {string} params.docno - Document number (e.g. "CS3_2")
   * @param {string} params.code - Customer code (e.g. "29421101")
   * @param {string} params.paymentMethod - Payment method code (e.g. "310-001")
   * @param {string|number} params.amount - Payment amount (e.g. "400.00" or 400)
   * @param {string} [params.description="Payment For A/c"] - Description
   * @param {Array} [params.sdsknockoff] - Knockoff lines e.g. [{ doctype: "IV", docno: "CS-002", koamt: "400.00", knockoff: true }]
   * @param {string} [params.knockoffDocno] - Cash sale/invoice docno to link payment to; when provided and sdsknockoff is empty, builds sdsknockoff with koamt=amount
   * @param {string} [params.docdate] - Doc date YYYY-MM-DD (default: today)
   * @param {string} [params.postdate] - Post date YYYY-MM-DD (default: today)
   * @param {string|null} [params.storeId] - Store ID for credentials; when provided uses sendRequestWithCredentials
   * @returns {Promise<{ success: boolean, data?: any, message?: string }>}
   */
  async helperCreateCustomerPaymentWithParams({
    docno,
    code,
    paymentMethod,
    amount,
    description = "Payment For A/c",
    sdsknockoff = [],
    knockoffDocno = null,
    docdate,
    postdate,
    storeId = null,
  }) {
    const result = { success: false, data: null, message: "" };
    console.log('[CUSTOMER PAYMENT] helperCreateCustomerPaymentWithParams: docno=', docno, 'code=', code, 'paymentMethod=', paymentMethod, 'amount=', amount, 'storeId=', storeId ?? 'none');
    if (!docno || !code || !paymentMethod) {
      result.message = "docno, code, and paymentMethod are required.";
      console.warn('[CUSTOMER PAYMENT] helperCreateCustomerPaymentWithParams validation failed:', result.message);
      return result;
    }
    const date = new Date();
    const dateStr = docdate || postdate || this.formatDateYYYYMMDD(date);
    const docamtStr = amount != null && amount !== "" ? String(amount) : "";

    let finalSdsknockoff = Array.isArray(sdsknockoff) ? sdsknockoff : [];
    if (finalSdsknockoff.length === 0 && knockoffDocno && docamtStr) {
      finalSdsknockoff = [
        {
          doctype: "IV",
          docno: String(knockoffDocno),
          koamt: docamtStr,
          knockoff: true,
        },
      ];
    }

    const payload = {
      docno: String(docno),
      code: String(code),
      docdate: dateStr,
      postdate: dateStr,
      description: description || "Payment For A/c",
      paymentmethod: String(paymentMethod),
      docamt: docamtStr,
      bankcharge: "0.00",
      sdsknockoff: finalSdsknockoff,
      cancelled: false,
    };
    try {
      const data = storeId
        ? await this.sendRequestWithCredentials(storeId, "POST", this.CUSTOMER_PAYMENT_PATH, payload)
        : await sendRequest("POST", this.CUSTOMER_PAYMENT_PATH, payload);
      result.success = true;
      result.data = data;
      console.log('[CUSTOMER PAYMENT] helperCreateCustomerPaymentWithParams success: docno=', docno);
      return result;
    } catch (e) {
      result.message = e.response?.data?.message || e.message || "Create customer payment failed.";
      if (e.response?.data) result.data = e.response.data;
      console.warn('[CUSTOMER PAYMENT] helperCreateCustomerPaymentWithParams error: docno=', docno, 'message=', result.message);
      return result;
    }
  }

  /**
   * Helper: Void customer payment by docno (looks up dockey then deletes).
   * @param {Object} params
   * @param {string} params.docno - Document number of the customer payment to void
   * @param {string|null} [params.storeId] - Store ID for credentials; when provided uses sendRequestWithCredentials
   * @returns {Promise<{ success: boolean, data?: any, message?: string }>}
   */
  async helperVoidCustomerPaymentByDocno({ docno, storeId = null }) {
    const result = { success: false, data: null, message: "" };
    console.log('[CUSTOMER PAYMENT] helperVoidCustomerPaymentByDocno: docno=', docno, 'storeId=', storeId ?? 'none');
    if (!docno) {
      result.message = "docno is required.";
      console.warn('[CUSTOMER PAYMENT] helperVoidCustomerPaymentByDocno validation failed: docno required');
      return result;
    }
    try {
      const query = buildQuery({ docno: String(docno) });
      const list = storeId
        ? await this.sendRequestWithCredentials(storeId, "GET", this.CUSTOMER_PAYMENT_PATH, null, query)
        : await sendRequest("GET", this.CUSTOMER_PAYMENT_PATH, null, query);
      const record = this.pickFirstRecord(list);
      if (!record || record.dockey == null) {
        result.message = `Customer payment with docno '${docno}' not found.`;
        console.warn('[CUSTOMER PAYMENT] helperVoidCustomerPaymentByDocno not found:', docno);
        return result;
      }
      const dockey = record.dockey;
      const data = storeId
        ? await this.sendRequestWithCredentials(storeId, "DELETE", this.buildCustomerPaymentPath(dockey))
        : await sendRequest("DELETE", this.buildCustomerPaymentPath(dockey));
      result.success = true;
      result.data = data;
      console.log('[CUSTOMER PAYMENT] helperVoidCustomerPaymentByDocno success: docno=', docno, 'dockey=', dockey);
      return result;
    } catch (e) {
      result.message = e.response?.data?.message || e.message || "Void customer payment failed.";
      if (e.response?.data) result.data = e.response.data;
      console.warn('[CUSTOMER PAYMENT] helperVoidCustomerPaymentByDocno error: docno=', docno, 'message=', result.message);
      return result;
    }
  }

  async createCustomerPaymentWithParams(req, res) {
    try {
      const { docno, code, paymentMethod, amount, description, sdsknockoff, knockoffDocno, docdate, postdate } = req.body || {};
      console.log('[CUSTOMER PAYMENT] createCustomerPaymentWithParams (route): docno=', docno, 'code=', code, 'paymentMethod=', paymentMethod, 'amount=', amount);
      const result = await this.helperCreateCustomerPaymentWithParams({
        docno,
        code,
        paymentMethod,
        amount,
        description,
        sdsknockoff,
        knockoffDocno,
        docdate,
        postdate,
      });
      if (result.success) {
        console.log('[CUSTOMER PAYMENT] createCustomerPaymentWithParams (route) success: docno=', docno);
        return res.status(201).json({ status: "created", data: result.data });
      }
      console.warn('[CUSTOMER PAYMENT] createCustomerPaymentWithParams (route) failed: docno=', docno, 'message=', result.message);
      return res.status(400).json({ message: result.message, data: result.data });
    } catch (error) {
      console.warn('[CUSTOMER PAYMENT] createCustomerPaymentWithParams (route) error:', error.response?.status, error.message);
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async voidCustomerPaymentByDocno(req, res) {
    try {
      const { docno } = req.body || {};
      console.log('[CUSTOMER PAYMENT] voidCustomerPaymentByDocno (route): docno=', docno);
      const result = await this.helperVoidCustomerPaymentByDocno({ docno });
      if (result.success) {
        console.log('[CUSTOMER PAYMENT] voidCustomerPaymentByDocno (route) success: docno=', docno);
        return res.json({ status: "voided", data: result.data });
      }
      console.warn('[CUSTOMER PAYMENT] voidCustomerPaymentByDocno (route) failed: docno=', docno, 'message=', result.message);
      return res.status(400).json({ message: result.message, data: result.data });
    } catch (error) {
      console.warn('[CUSTOMER PAYMENT] voidCustomerPaymentByDocno (route) error:', error.response?.status, error.message);
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async deleteCustomerPaymentByDocno(req, res) {
    try {
      const { docno } = req.params;
      if (!docno) {
        return res.status(400).json({ message: "docno is required." });
      }
      console.log('[CUSTOMER PAYMENT] deleteCustomerPaymentByDocno (route): docno=', docno);
      const result = await this.helperVoidCustomerPaymentByDocno({ docno });
      if (result.success) {
        console.log('[CUSTOMER PAYMENT] deleteCustomerPaymentByDocno (route) success: docno=', docno);
        return res.json({ status: "deleted", data: result.data });
      }
      console.warn('[CUSTOMER PAYMENT] deleteCustomerPaymentByDocno (route) failed: docno=', docno, 'message=', result.message);
      return res.status(404).json({ message: result.message, data: result.data });
    } catch (error) {
      console.warn('[CUSTOMER PAYMENT] deleteCustomerPaymentByDocno (route) error:', error.response?.status, error.message);
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  // Stock Adjustment route handlers
  async getStockAdjustment(req, res) {
    try {
      const docno = req.query.docno || req.query.docNo;
      if (docno) {
        const query = buildQuery({ docno });
        const data = await sendRequest("GET", this.STOCK_ADJUSTMENT_PATH, null, query);
        return res.json(data);
      }

      const offset = typeof req.query.offset !== "undefined" ? Number(req.query.offset) : 0;
      const limit = typeof req.query.limit !== "undefined"
        ? Number(req.query.limit)
        : this.STOCK_ADJUSTMENT_REMOTE_PAGE_LIMIT;
      const query = buildQuery({ offset, limit });
      const data = await sendRequest("GET", this.STOCK_ADJUSTMENT_PATH, null, query);
      res.json(data);
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async getStockAdjustmentByDockey(req, res) {
    try {
      const { dockey } = req.params;
      if (!dockey) {
        return res.status(400).json({ message: "Stock adjustment dockey is required." });
      }
      const data = await sendRequest("GET", this.buildStockAdjustmentPath(dockey));
      res.json(data);
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async createStockAdjustment(req, res) {
    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Stock adjustment payload is required." });
      }
      const data = await sendRequest("POST", this.STOCK_ADJUSTMENT_PATH, req.body);
      res.status(201).json({ status: "created", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async updateStockAdjustment(req, res) {
    try {
      const { dockey } = req.params;
      if (!dockey) {
        return res.status(400).json({ message: "Stock adjustment dockey is required." });
      }
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Update payload is required." });
      }

      const existing = await sendRequest("GET", this.buildStockAdjustmentPath(dockey));
      const record = this.pickFirstRecord(existing);
      if (!record || typeof record.updatecount === "undefined") {
        return res
          .status(400)
          .json({ message: "Unable to resolve updatecount for the target stock adjustment." });
      }

      const finalPayload = this.removeNullValues({
        ...record,
        ...req.body,
        dockey: record.dockey,
        docno: record.docno,
        updatecount: record.updatecount,
      });

      const data = await sendRequest("PUT", this.buildStockAdjustmentPath(dockey), finalPayload);
      res.json({ status: "updated", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async deleteStockAdjustment(req, res) {
    try {
      const { dockey } = req.params;
      if (!dockey) {
        return res.status(400).json({ message: "Stock adjustment dockey is required." });
      }
      const data = await sendRequest("DELETE", this.buildStockAdjustmentPath(dockey));
      res.json({ status: "deleted", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  previewCashSales(req, res) {
    const payload = this.mapReportOrderToSqlInvoice(req.body || {});
    res.json({
      payload,
      note: "Preview only. Use /cashsales/sync to send to SQL Accounting.",
    });
  }

  async syncCashSales(req, res) {
    try {
      const payload = this.mapReportOrderToSqlInvoice(req.body || {});
      const data = await sendRequest("POST", this.CASH_SALES_PATH, payload, "", {
        headers: req.body?.__headers,
      });
      res.json({ status: "synced", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  // Stock Item route handlers
  async getStockItem(req, res) {
    try {
      const storeId = this.getStoreIdFromRequest(req);
      const code = req.query.code;
      if (code) {
        const includeDetail = req.query.detail !== "false";
        const result = await this.fetchStockRecordByCode(code, storeId);
        return res.json(includeDetail ? result : { summary: result.summary, record: result.record });
      }

      const offset = typeof req.query.offset !== "undefined" ? Number(req.query.offset) : 0;
      const limit = typeof req.query.limit !== "undefined" ? Number(req.query.limit) : this.STOCK_REMOTE_PAGE_LIMIT;
      const data = await this.fetchStockItemsRange(offset, limit, storeId);

      // If detail=true, enrich each item with detail-level data (uom, refcost, refprice, sdsuom, etc.)
      if (req.query.detail === "true") {
        const enrichedData = await this.enrichStockItemsWithDetail(data.data || [], storeId);
        return res.json({ ...data, data: enrichedData });
      }

      res.json(data);
    } catch (error) {
      const status = error.statusCode || error.response?.status || 500;
      res.status(status).json(this.buildError(error));
    }
  }

  async getStockItemByDockey(req, res) {
    try {
      const { dockey } = req.params;
      if (!dockey) {
        return res.status(400).json({ message: "Stock item dockey is required." });
      }
      const storeId = this.getStoreIdFromRequest(req);
      const data = await this._requestWithOptionalStore(storeId, "GET", this.buildStockItemPath(dockey));
      res.json(data);
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async createStockItem(req, res) {
    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Stock item payload is required." });
      }
      const storeId = this.getStoreIdFromRequest(req);
      const data = await this._requestWithOptionalStore(storeId, "POST", this.STOCK_COLLECTION_PATH, req.body);
      res.status(201).json({ status: "created", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async updateStockItem(req, res) {
    try {
      const { dockey } = req.params;
      if (!dockey) {
        return res.status(400).json({ message: "Stock item dockey is required." });
      }
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Update payload is required." });
      }

      const storeId = this.getStoreIdFromRequest(req);
      let finalPayload = req.body;
      if (typeof finalPayload.updatecount === "undefined") {
        const existing = await this._requestWithOptionalStore(storeId, "GET", this.buildStockItemPath(dockey));
        const record = this.pickFirstRecord(existing);
        if (!record || typeof record.updatecount === "undefined") {
          return res
            .status(400)
            .json({ message: "Unable to resolve updatecount for the target stock item." });
        }
        finalPayload = this.removeNullValues({ ...finalPayload, updatecount: (record.updatecount || 0) + 1 });
      } else {
        finalPayload = this.removeNullValues(finalPayload);
      }

      const pathName = this.buildStockItemPath(dockey);
      const data = await this._requestWithOptionalStore(storeId, "PUT", pathName, finalPayload);
      res.json({ status: "updated", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async deleteStockItem(req, res) {
    try {
      const { dockey } = req.params;
      if (!dockey) {
        return res.status(400).json({ message: "Stock item dockey is required." });
      }

      const pathName = this.buildStockItemPath(dockey);
      const data = await sendRequest("DELETE", pathName);
      res.json({ status: "deleted", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  // Stock Group route handlers
  async getStockGroup(req, res) {
    try {
      const code = req.query.code;
      if (code) {
        const includeDetail = req.query.detail !== "false";
        const result = await this.fetchStockGroupRecordByCode(code);
        return res.json(includeDetail ? result : { summary: result.summary, record: result.record });
      }

      const offset = typeof req.query.offset !== "undefined" ? Number(req.query.offset) : 0;
      const limit = typeof req.query.limit !== "undefined" ? Number(req.query.limit) : this.STOCK_REMOTE_PAGE_LIMIT;
      const data = await this.fetchStockGroupsRange(offset, limit);
      res.json(data);
    } catch (error) {
      const status = error.statusCode || error.response?.status || 500;
      res.status(status).json(this.buildError(error));
    }
  }

  async getStockGroupByDockey(req, res) {
    try {
      const { dockey } = req.params;
      if (!dockey) {
        return res.status(400).json({ message: "Stock group dockey is required." });
      }
      const data = await sendRequest("GET", this.buildStockGroupPath(dockey));
      res.json(data);
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async createStockGroup(req, res) {
    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Stock group payload is required." });
      }
      const data = await sendRequest("POST", this.STOCK_GROUP_COLLECTION_PATH, req.body);
      res.status(201).json({ status: "created", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async updateStockGroup(req, res) {
    try {
      const { dockey } = req.params;
      if (!dockey) {
        return res.status(400).json({ message: "Stock group dockey is required." });
      }
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Update payload is required." });
      }

      let finalPayload = req.body;
      if (typeof finalPayload.updatecount === "undefined") {
        const existing = await sendRequest("GET", this.buildStockGroupPath(dockey));
        const record = this.pickFirstRecord(existing);
        if (!record || typeof record.updatecount === "undefined") {
          return res
            .status(400)
            .json({ message: "Unable to resolve updatecount for the target stock group." });
        }
        finalPayload = this.removeNullValues({ ...finalPayload, updatecount: (record.updatecount || 0) + 1 });
      } else {
        finalPayload = this.removeNullValues(finalPayload);
      }

      const pathName = this.buildStockGroupPath(dockey);
      const data = await sendRequest("PUT", pathName, finalPayload);
      res.json({ status: "updated", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async deleteStockGroup(req, res) {
    try {
      const { dockey } = req.params;
      if (!dockey) {
        return res.status(400).json({ message: "Stock group dockey is required." });
      }

      const pathName = this.buildStockGroupPath(dockey);
      const data = await sendRequest("DELETE", pathName);
      res.json({ status: "deleted", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  // Customer route handlers
  async getCustomer(req, res) {
    try {
      const storeId = this.getStoreIdFromRequest(req);
      const code = req.query.code;
      if (code) {
        const includeDetail = req.query.detail !== "false";
        const result = await this.fetchCustomerRecordByCode(code, storeId);
        return res.json(includeDetail ? result : { summary: result.summary, record: result.record });
      }

      const offset = typeof req.query.offset !== "undefined" ? Number(req.query.offset) : 0;
      const limit = typeof req.query.limit !== "undefined" ? Number(req.query.limit) : this.CUSTOMER_REMOTE_PAGE_LIMIT;
      const data = await this.fetchCustomersRange(offset, limit, storeId);
      res.json(data);
    } catch (error) {
      const status = error.statusCode || error.response?.status || 500;
      res.status(status).json(this.buildError(error));
    }
  }

  async getCustomerByPhone(req, res) {
    try {
      const storeId = this.getStoreIdFromRequest(req);
      const { phone } = req.params;
      if (!phone) {
        return res.status(400).json({ message: "Customer phone is required." });
      }
      const query = buildQuery({ phone1: phone });
      const data = await this._requestWithOptionalStore(storeId, "GET", this.CUSTOMER_COLLECTION_PATH, null, query);
      res.json(data);
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async getCustomerWildcard(req, res) {
    try {
      const storeId = this.getStoreIdFromRequest(req);
      const query = buildQuery(req.query || {});
      const data = await this._requestWithOptionalStore(storeId, "GET", `${this.CUSTOMER_COLLECTION_PATH}/*`, null, query);
      res.json(data);
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async createCustomer(req, res) {
    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Customer payload is required." });
      }
      const storeId = this.getStoreIdFromRequest(req);
      const data = await this._requestWithOptionalStore(storeId, "POST", this.CUSTOMER_COLLECTION_PATH, req.body);
      res.status(201).json({ status: "created", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async updateCustomer(req, res) {
    try {
      const { identifier } = req.params;
      if (!identifier) {
        return res.status(400).json({ message: "Customer identifier is required." });
      }
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Update payload is required." });
      }
      const storeId = this.getStoreIdFromRequest(req);
      const pathName = this.buildCustomerPath(identifier);
      const data = await this._requestWithOptionalStore(storeId, "PUT", pathName, req.body);
      res.json({ status: "updated", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  async deleteCustomer(req, res) {
    try {
      const { identifier } = req.params;
      if (!identifier) {
        return res.status(400).json({ message: "Customer identifier is required." });
      }

      const pathName = this.buildCustomerPath(identifier);
      const data = await sendRequest("DELETE", pathName);
      res.json({ status: "deleted", data });
    } catch (error) {
      res.status(error.response?.status || 500).json(this.buildError(error));
    }
  }

  // Helper function route handlers (exposed as HTTP endpoints)
  async createInvoiceFromOrder(req, res) {
    try {
      if (!req.body || !req.body.order) {
        return res.status(400).json({ message: "Order object is required in request body." });
      }
      const storeId = this.getStoreIdFromRequest(req);
      const result = await this.helperCreateInvoiceFromOrder({ order: req.body.order, storeId });
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message || "Internal server error" 
      });
    }
  }

  async createCashSalesFromOrder(req, res) {
    try {
      if (!req.body || !req.body.order) {
        return res.status(400).json({ message: "Order object is required in request body." });
      }
      const storeId = req.body?.storeId ?? req.body?.storeid ?? req.body?.order?.storeId ?? req.body?.order?.storeid ?? null;
      const result = await this.helperCreateCashSalesFromOrder({ order: req.body.order, action: 'create', paymentBreakdown: req.body.paymentBreakdown, storeId });
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message || "Internal server error" 
      });
    }
  }

  async updateCashSalesFromOrder(req, res) {
    try {
      if (!req.body || !req.body.order) {
        return res.status(400).json({ message: "Order object is required in request body." });
      }
      const storeId = req.body?.storeId ?? req.body?.storeid ?? req.body?.order?.storeId ?? req.body?.order?.storeid ?? null;
      const result = await this.helperCreateCashSalesFromOrder({ 
        order: req.body.order, 
        action: 'update',
        cancelled: req.body.cancelled,
        paymentBreakdown: req.body.paymentBreakdown,
        storeId 
      });
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message || "Internal server error" 
      });
    }
  }

  async searchStockItemByCode(req, res) {
    try {
      const { code } = req.params;
      if (!code) {
        return res.status(400).json({ message: "Stock item code is required." });
      }
      const storeId = this.getStoreIdFromRequest(req);
      const result = await this.helperSearchStockItem({ code, storeId });
      if (result.success) {
        res.json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message || "Internal server error" 
      });
    }
  }

  async getAllStockItems(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const storeId = this.getStoreIdFromRequest(req);
      const result = await this.helperGetAllStockItems({ limit, storeId });
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error"
      });
    }
  }

  /**
   * POST /sqlaccount/stockitem/sync-firestore
   * POST /sqlaccount/stockitem/sync-firestore/:storeId
   * Fetches all stock items from SQL Account (paginated) for the given store credentials
   * and writes each page to Firestore immediately: sqlaccount/{storeId}/stockitem/{dockey|code|idx}
   */
  async syncStockItemsToFirestore(req, res) {
    try {
      const storeId =
        req.params?.storeId ??
        req.query?.storeId ??
        req.query?.storeid ??
        req.body?.storeId ??
        req.body?.storeid ??
        null;
      if (!storeId || String(storeId).trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'storeId is required (path, query, or body).',
        });
      }
      const sid = String(storeId).trim();
      const pageSize = Math.min(
        Math.max(parseInt(req.query.pageSize || req.body?.pageSize, 10) || 100, 1),
        this.STOCK_REMOTE_PAGE_LIMIT
      );
      const enrich =
        String(req.query.enrich || req.body?.enrich || '').toLowerCase() === 'true' ||
        req.body?.enrich === true;

      const parentRef = fireStore.collection('sqlaccount').doc(sid);
      const firestoreBatchSize = 400;
      let currentOffset = 0;
      let totalFetched = 0;
      let totalWritten = 0;
      let hasMore = true;
      let pageNumber = 0;

      // Mark sync as started
      await parentRef.set(
        {
          syncStartedAt: FieldValue.serverTimestamp(),
          syncStatus: 'running',
          syncCompletedAt: null,
          lastSyncError: null,
        },
        { merge: true }
      );

      console.log(`[SQL Account] Starting incremental sync for store ${sid}, pageSize=${pageSize}, enrich=${enrich}`);

      while (hasMore) {
        pageNumber++;
        console.log(`[SQL Account] Fetching page ${pageNumber} (offset=${currentOffset}, limit=${pageSize})...`);

        // Fetch one page from SQL Account
        const query = buildQuery({ offset: currentOffset, limit: pageSize });
        let pageResponse;
        try {
          pageResponse = await this._requestWithOptionalStore(sid, 'GET', this.STOCK_COLLECTION_PATH, null, query);
        } catch (fetchErr) {
          console.error(`[SQL Account] Failed to fetch page ${pageNumber}:`, fetchErr.message);
          
          // Mark sync as failed
          await parentRef.set(
            {
              syncStatus: 'failed',
              syncCompletedAt: FieldValue.serverTimestamp(),
              lastSyncError: `Failed to fetch page ${pageNumber}: ${fetchErr.message}`,
              lastStockSyncCount: totalFetched,
            },
            { merge: true }
          );
          
          return res.status(502).json({
            success: false,
            message: `Failed to fetch page ${pageNumber}: ${fetchErr.message}`,
            totalFetched,
            totalWritten,
          });
        }

        let pageItems = Array.isArray(pageResponse?.data) ? pageResponse.data : [];
        const fetchedCount = pageItems.length;
        console.log(`[SQL Account] Page ${pageNumber} fetched: ${fetchedCount} items`);

        if (fetchedCount === 0) {
          hasMore = false;
          console.log(`[SQL Account] No more items, stopping pagination.`);
          break;
        }

        // Optional: enrich each page's items with detail
        if (enrich && pageItems.length > 0) {
          console.log(`[SQL Account] Enriching page ${pageNumber} with detail...`);
          pageItems = await this.enrichStockItemsWithDetail(pageItems, sid);
        }

        // Write this page to Firestore immediately
        console.log(`[SQL Account] Writing page ${pageNumber} to Firestore...`);
        for (let i = 0; i < pageItems.length; i += firestoreBatchSize) {
          const batch = fireStore.batch();
          const chunk = pageItems.slice(i, i + firestoreBatchSize);
          for (let j = 0; j < chunk.length; j++) {
            const item = chunk[j];
            const globalIndex = totalFetched + i + j;
            const docId = this.stockItemFirestoreDocId(item, globalIndex);
            const cleaned = this.removeNullValues(item) || {};
            const docRef = parentRef.collection('stockitem').doc(docId);
            batch.set(
              docRef,
              {
                ...cleaned,
                _storeId: sid,
                _syncedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
          await batch.commit();
          totalWritten += chunk.length;
        }
        console.log(`[SQL Account] Page ${pageNumber} written: ${pageItems.length} docs (total written: ${totalWritten})`);

        totalFetched += fetchedCount;

        // Continue pagination if this page was full
        if (fetchedCount < pageSize) {
          hasMore = false;
          console.log(`[SQL Account] Last page (partial), stopping pagination.`);
        } else {
          currentOffset += fetchedCount;
        }
      }

      // Mark sync as completed successfully (merge: true preserves syncStartedAt)
      await parentRef.set(
        {
          syncStatus: 'done',
          syncCompletedAt: FieldValue.serverTimestamp(),
          lastStockSyncCount: totalFetched,
          lastSyncError: null,
        },
        { merge: true }
      );

      console.log(`[SQL Account] Sync complete: ${totalFetched} items fetched, ${totalWritten} docs written`);

      return res.status(200).json({
        success: true,
        storeId: sid,
        firestorePath: `sqlaccount/${sid}/stockitem`,
        itemCount: totalFetched,
        documentsWritten: totalWritten,
        pagesProcessed: pageNumber,
        enrich,
      });
    } catch (error) {
      console.error('[SQL Account] syncStockItemsToFirestore:', error);
      
      // Mark sync as failed
      try {
        const sid = String(
          req.params?.storeId ??
          req.query?.storeId ??
          req.query?.storeid ??
          req.body?.storeId ??
          req.body?.storeid ??
          ''
        ).trim();
        
        if (sid) {
          await fireStore.collection('sqlaccount').doc(sid).set(
            {
              syncStatus: 'failed',
              syncCompletedAt: FieldValue.serverTimestamp(),
              lastSyncError: error.message || error.toString(),
            },
            { merge: true }
          );
        }
      } catch (updateErr) {
        console.error('[SQL Account] Failed to update sync status on error:', updateErr);
      }
      
      return res.status(500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  }

  async searchStockGroupByCode(req, res) {
    try {
      const { code } = req.params;
      if (!code) {
        return res.status(400).json({ message: "Stock group code is required." });
      }
      const result = await this.helperSearchStockGroup({ code });
      if (result.success) {
        res.json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error"
      });
    }
  }

  async getAllStockGroups(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const result = await this.helperGetAllStockGroups({ limit });
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error"
      });
    }
  }

  async searchCustomerByCode(req, res) {
    try {
      const { code } = req.params;
      if (!code) {
        return res.status(400).json({ message: "Customer code is required." });
      }
      const result = await this.helperSearchCustomer({ code });
      if (result.success) {
        res.json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message || "Internal server error" 
      });
    }
  }

  async getAllCustomers(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const result = await this.helperGetAllCustomers({ limit });
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message || "Internal server error" 
      });
    }
  }

  /**
   * GET /sqlaccount/credentials?storeId=xxx
   * Returns SQL Account access credentials for a store (or default if storeId omitted)
   */
  async getCredentials(req, res) {
    try {
      const storeId = req.query.storeId || req.query.storeid || null;
      const credentials = this.getAccessCredentials(storeId);
      res.json(credentials);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get credentials',
      });
    }
  }

  getRouter() {
    return this.router;
  }

  // ============================================================
  // Internal Helper Functions (for use by other modules)
  // ============================================================

  /**
   * Wrapper for sendRequest that automatically includes credentials for a store
   * If storeId is not provided, uses default credentials from environment variables
   * @param {string|null|undefined} storeId - Store ID to get credentials for (optional)
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {Object} body - Request body
   * @param {string} query - Query string
   * @param {Object} opts - Additional options
   */
  async sendRequestWithCredentials(storeId, method, path, body = null, query = "", opts = {}) {
    console.log('🌐 [API REQUEST] sendRequestWithCredentials called');
    console.log('🌐 [API REQUEST] StoreId:', storeId);
    console.log('🌐 [API REQUEST] Method:', method);
    console.log('🌐 [API REQUEST] Path:', path);
    
    const credentials = getCredentialsForStore(storeId);
    
    console.log('🔑 [API REQUEST] Retrieved credentials - Access Key:', credentials.accessKey);
    console.log('🔑 [API REQUEST] Retrieved credentials - Secret Key:', credentials.secretKey ? '***' + credentials.secretKey.slice(-4) : 'EMPTY');
    console.log('🔑 [API REQUEST] Retrieved credentials - Host:', credentials.host);
    console.log('🔑 [API REQUEST] Retrieved credentials - Region:', credentials.region);
    console.log('🔑 [API REQUEST] Retrieved credentials - Service:', credentials.service);
    
    return sendRequest(method, path, body, query, {
      ...opts,
      ...credentials,
    });
  }

  /**
   * Get SQL Account access credentials for a store
   * @param {string|null|undefined} storeId - Store ID to get credentials for (null/undefined uses default)
   * @returns {Object} Credentials with accessKey, secretKey, host, region, service
   */
  getAccessCredentials(storeId) {
    return getCredentialsForStore(storeId);
  }

  /**
   * Clean phone number to use as customer code
   * Removes +, -, leading 01, and leading 6
   * @param {string} phoneNumber - Phone number to clean
   * @returns {string} Cleaned phone number
   */
  cleanPhoneNumberForCode(phoneNumber) {
    if (!phoneNumber) {
      return phoneNumber;
    }

    let cleaned = phoneNumber;

    // First check if it contains "+6" and remove it
    if (cleaned.includes('+6')) {
      cleaned = cleaned.replace('+6', '');
    }

    // Remove remaining +, dashes
    cleaned = cleaned.replace(/\+/g, '').replace(/-/g, '');

    // Remove leading 01
    if (cleaned.length >= 2 && cleaned.startsWith('01')) {
      cleaned = cleaned.substring(2);
    }

    // Remove leading 6 (if still present)
    if (cleaned.length > 0 && cleaned[0] === '6') {
      cleaned = cleaned.substring(1);
    }

    return cleaned;
  }

  /**
   * Format date to YYYYMMDD format
   * @param {Date} date - Date object to format
   * @returns {string} Formatted date string
   */
  formatDateYYYYMMDD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Internal helper: Get stock item(s) with pagination
   * @param {Object} options - Options object
   * @param {number} options.limit - Number of items to fetch (default: 1)
   * @param {number} options.offset - Offset for pagination (default: 0)
   * @returns {Promise<Object>} Result object with success, message, data, and response
   */
  async helperGetStockItem({ limit = 1, offset = 0, storeId = null } = {}) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: ''
    };

    try {
      const data = await this.fetchStockItemsRange(offset, limit, storeId);
      result.success = true;
      result.data = data;
      result.response = JSON.stringify(data);
    } catch (e) {
      result.message = `Error: ${e.message || e.toString()}`;
    }

    return result;
  }

  /**
   * Internal helper: Get all stock items by paginating through all data
   * @param {Object} options - Options object
   * @param {number} options.limit - Page size for each request (default: 100)
   * @param {Function} options.progressCallback - Callback function(total, fetched) for progress updates
   * @returns {Promise<Object>} Result object with success, message, data, response, and totalFetched
   */
  async helperGetAllStockItems({ limit = 100, progressCallback = null, storeId = null } = {}) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: '',
      totalFetched: 0,
    };

    try {
      const allData = [];
      let currentOffset = 0;
      let totalCount = 0;
      let hasMore = true;

      while (hasMore) {
        const pageResult = await this.helperGetStockItem({
          limit,
          offset: currentOffset,
          storeId,
        });

        if (!pageResult.success) {
          result.message = pageResult.message;
          return result;
        }

        const pageData = pageResult.data;
        if (!pageData) {
          result.message = 'Invalid response structure';
          return result;
        }

        // Get pagination info from current response
        if (pageData.pagination) {
          if (totalCount === 0) {
            totalCount = pageData.pagination.count || 0;
          }
        }

        // Get data array from current page
        if (pageData.data && Array.isArray(pageData.data)) {
          const pageItems = pageData.data;
          const itemsCount = pageItems.length;
          allData.push(...pageItems);

          // Report progress if callback provided
          if (progressCallback) {
            progressCallback(totalCount, allData.length);
          }

          // Continue pagination until the number of items returned is not equal to limit
          if (itemsCount < limit || pageItems.length === 0) {
            hasMore = false;
          } else {
            currentOffset += limit;
          }
        } else {
          hasMore = false;
        }
      }

      // Build final response with combined data
      const finalResponse = {
        pagination: {
          offset: 0,
          limit: limit,
          count: totalCount,
        },
        data: allData,
      };

      result.success = true;
      result.data = finalResponse;
      result.totalFetched = allData.length;
      result.response = JSON.stringify(finalResponse);

    } catch (e) {
      result.message = `Error: ${e.message || e.toString()}`;
    }

    return result;
  }

  /**
   * Internal helper: Search stock item by code
   * @param {Object} options - Options object
   * @param {string} options.code - Stock item code to search
   * @returns {Promise<Object>} Result object with success, message, data, and response
   */
  async helperSearchStockItem({ code, storeId = null }) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: ''
    };

    try {
      if (!code) {
        result.message = 'Please provide a code to search';
        return result;
      }

      const data = await this.fetchStockRecordByCode(code, storeId);
      result.success = true;
      result.data = data;
      result.response = JSON.stringify(data);
    } catch (e) {
      result.message = `Error: ${e.message || e.toString()}`;
    }

    return result;
  }

  /**
   * Internal helper: Get stock group(s) with pagination
   * @param {Object} options - Options object
   * @param {number} options.limit - Number of items to fetch (default: 1)
   * @param {number} options.offset - Offset for pagination (default: 0)
   * @returns {Promise<Object>} Result object with success, message, data, and response
   */
  async helperGetStockGroup({ limit = 1, offset = 0 } = {}) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: ''
    };

    try {
      const data = await this.fetchStockGroupsRange(offset, limit);
      result.success = true;
      result.data = data;
      result.response = JSON.stringify(data);
    } catch (e) {
      result.message = `Error: ${e.message || e.toString()}`;
    }

    return result;
  }

  /**
   * Internal helper: Get all stock groups by paginating through all data
   * @param {Object} options - Options object
   * @param {number} options.limit - Page size for each request (default: 100)
   * @param {Function} options.progressCallback - Callback function(total, fetched) for progress updates
   * @returns {Promise<Object>} Result object with success, message, data, response, and totalFetched
   */
  async helperGetAllStockGroups({ limit = 100, progressCallback = null } = {}) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: '',
      totalFetched: 0,
    };

    try {
      const allData = [];
      let currentOffset = 0;
      let totalCount = 0;
      let hasMore = true;

      while (hasMore) {
        const pageResult = await this.helperGetStockGroup({
          limit,
          offset: currentOffset,
        });

        if (!pageResult.success) {
          result.message = pageResult.message;
          return result;
        }

        const pageData = pageResult.data;
        if (!pageData) {
          result.message = 'Invalid response structure';
          return result;
        }

        if (pageData.pagination) {
          if (totalCount === 0) {
            totalCount = pageData.pagination.count || 0;
          }
        }

        if (pageData.data && Array.isArray(pageData.data)) {
          const pageItems = pageData.data;
          const itemsCount = pageItems.length;
          allData.push(...pageItems);

          if (progressCallback) {
            progressCallback(totalCount, allData.length);
          }

          if (itemsCount < limit || pageItems.length === 0) {
            hasMore = false;
          } else {
            currentOffset += limit;
          }
        } else {
          hasMore = false;
        }
      }

      const finalResponse = {
        pagination: {
          offset: 0,
          limit: limit,
          count: totalCount,
        },
        data: allData,
      };

      result.success = true;
      result.data = finalResponse;
      result.totalFetched = allData.length;
      result.response = JSON.stringify(finalResponse);

    } catch (e) {
      result.message = `Error: ${e.message || e.toString()}`;
    }

    return result;
  }

  /**
   * Internal helper: Search stock group by code
   * @param {Object} options - Options object
   * @param {string} options.code - Stock group code to search
   * @returns {Promise<Object>} Result object with success, message, data, and response
   */
  async helperSearchStockGroup({ code }) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: ''
    };

    try {
      if (!code) {
        result.message = 'Please provide a code to search';
        return result;
      }

      const data = await this.fetchStockGroupRecordByCode(code);
      result.success = true;
      result.data = data;
      result.response = JSON.stringify(data);
    } catch (e) {
      result.message = `Error: ${e.message || e.toString()}`;
    }

    return result;
  }

  /**
   * Internal helper: Get customer(s) with pagination
   * @param {Object} options - Options object
   * @param {number} options.limit - Number of items to fetch (default: 1)
   * @param {number} options.offset - Offset for pagination (default: 0)
   * @returns {Promise<Object>} Result object with success, message, data, and response
   */
  async helperGetCustomer({ limit = 1, offset = 0 } = {}) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: ''
    };

    try {
      const data = await this.fetchCustomersRange(offset, limit);
      result.success = true;
      result.data = data;
      result.response = JSON.stringify(data);
    } catch (e) {
      result.message = `Error: ${e.message || e.toString()}`;
    }

    return result;
  }

  /**
   * Internal helper: Get all customers by paginating through all data
   * @param {Object} options - Options object
   * @param {number} options.limit - Page size for each request (default: 100)
   * @param {Function} options.progressCallback - Callback function(total, fetched) for progress updates
   * @returns {Promise<Object>} Result object with success, message, data, response, and totalFetched
   */
  async helperGetAllCustomers({ limit = 100, progressCallback = null } = {}) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: '',
      totalFetched: 0,
    };

    try {
      const allData = [];
      let currentOffset = 0;
      let totalCount = 0;
      let hasMore = true;

      while (hasMore) {
        const pageResult = await this.helperGetCustomer({
          limit,
          offset: currentOffset,
        });

        if (!pageResult.success) {
          result.message = pageResult.message;
          return result;
        }

        const pageData = pageResult.data;
        if (!pageData) {
          result.message = 'Invalid response structure';
          return result;
        }

        // Get pagination info from current response
        if (pageData.pagination) {
          if (totalCount === 0) {
            totalCount = pageData.pagination.count || 0;
          }
        }

        // Get data array from current page
        if (pageData.data && Array.isArray(pageData.data)) {
          const pageItems = pageData.data;
          const itemsCount = pageItems.length;
          allData.push(...pageItems);

          // Report progress if callback provided
          if (progressCallback) {
            progressCallback(totalCount, allData.length);
          }

          // Continue pagination until the number of items returned is not equal to limit
          if (itemsCount < limit || pageItems.length === 0) {
            hasMore = false;
          } else {
            currentOffset += limit;
          }
        } else {
          hasMore = false;
        }
      }

      // Build final response with combined data
      const finalResponse = {
        pagination: {
          offset: 0,
          limit: limit,
          count: totalCount,
        },
        data: allData,
      };

      result.success = true;
      result.data = finalResponse;
      result.totalFetched = allData.length;
      result.response = JSON.stringify(finalResponse);

    } catch (e) {
      result.message = `Error: ${e.message || e.toString()}`;
    }

    return result;
  }

  /**
   * Internal helper: Search customer by code
   * @param {Object} options - Options object
   * @param {string} options.code - Customer code to search
   * @returns {Promise<Object>} Result object with success, message, data, and response
   */
  async helperSearchCustomer({ code }) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: ''
    };

    try {
      if (!code) {
        result.message = 'Please provide a code to search';
        return result;
      }

      // Clean the code if it appears to be a phone number
      let cleanedCode = this.cleanPhoneNumberForCode(code);
      if (!cleanedCode) {
        cleanedCode = code;
      }

      const data = await this.fetchCustomerRecordByCode(cleanedCode);
      result.success = true;
      result.data = data;
      result.response = JSON.stringify(data);
    } catch (e) {
      result.message = `Error: ${e.message || e.toString()}`;
    }

    return result;
  }

  /**
   * Internal helper: Create customer
   * @param {Object} options - Options object
   * @param {string} options.code - Customer code (required)
   * @param {string} options.companyName - Company name (required)
   * @param {string} options.phone1 - Phone number (optional)
   * @param {string} options.email - Email address (optional)
   * @param {string|null} options.storeId - Store ID for credentials (optional)
   * @returns {Promise<Object>} Result object with success, message, data, and response
   */
  async helperCreateCustomer({ code, companyName, phone1 = null, email = null, storeId = null }) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: ''
    };

    try {
      if (!code) {
        result.message = 'Please provide a code';
        return result;
      }

      // Clean the code if it appears to be a phone number
      let cleanedCode = this.cleanPhoneNumberForCode(code);
      if (!cleanedCode) {
        cleanedCode = code;
      }

      if (!companyName) {
        result.message = 'Please provide a company name';
        return result;
      }

      // Build request body
      const sdsBranch = {
        attention: companyName,
      };
      if (phone1) {
        sdsBranch.phone1 = phone1;
      }
      if (email) {
        sdsBranch.email = email;
      }

      const requestBody = {
        code: cleanedCode,
        companyname: companyName,
        sdsbranch: [sdsBranch]
      };

      const data = await this.sendRequestWithCredentials(storeId, "POST", this.CUSTOMER_COLLECTION_PATH, requestBody);
      result.success = true;
      result.data = data;
      result.response = JSON.stringify(data);
    } catch (e) {
      // Enhanced error handling to capture API response details
      if (e.response) {
        const status = e.response.status;
        const statusText = e.response.statusText;
        const errorData = e.response.data;
        result.message = `Error ${status} ${statusText}: ${JSON.stringify(errorData || {})}`;
        result.response = JSON.stringify(errorData || {});
      } else if (e.request) {
        result.message = `Error: No response received from server. ${e.message || e.toString()}`;
      } else {
        result.message = `Error: ${e.message || e.toString()}`;
      }
    }

    return result;
  }

  /**
   * Internal helper: Create sales invoice
   * @param {Object} options - Options object
   * @param {Object} options.invoiceData - Invoice data payload
   * @param {string|null} options.storeId - Store ID for credentials (optional)
   * @returns {Promise<Object>} Result object with success, message, data, and response
   */
  async helperCreateSalesInvoice({ invoiceData, storeId = null }) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: ''
    };

    try {
      const data = await this.sendRequestWithCredentials(storeId, "POST", this.SQL_BASE_PATH, invoiceData);
      result.success = true;
      result.data = data;
      result.response = JSON.stringify(data);
    } catch (e) {
      // Enhanced error handling to capture API response details
      if (e.response) {
        const status = e.response.status;
        const statusText = e.response.statusText;
        const errorData = e.response.data;
        result.message = `Error ${status} ${statusText}: ${JSON.stringify(errorData || {})}`;
        result.response = JSON.stringify(errorData || {});
      } else if (e.request) {
        result.message = `Error: No response received from server. ${e.message || e.toString()}`;
      } else {
        result.message = `Error: ${e.message || e.toString()}`;
      }
    }

    return result;
  }

  /**
   * Internal helper: Create cash sales
   * @param {Object} options - Options object
   * @param {Object} options.cashSalesData - Cash sales data payload
   * @param {string|null} options.storeId - Store ID for credentials (optional)
   * @returns {Promise<Object>} Result object with success, message, data, and response
   */
  async helperCreateCashSales({ cashSalesData, storeId = null }) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: ''
    };

    try {
      const data = await this.sendRequestWithCredentials(storeId, "POST", this.CASH_SALES_BASE_PATH, cashSalesData);
      result.success = true;
      result.data = data;
      result.response = JSON.stringify(data);
    } catch (e) {
      // Enhanced error handling to capture API response details
      if (e.response) {
        const status = e.response.status;
        const statusText = e.response.statusText;
        const errorData = e.response.data;
        result.message = `Error ${status} ${statusText}: ${JSON.stringify(errorData || {})}`;
        result.response = JSON.stringify(errorData || {});
      } else if (e.request) {
        result.message = `Error: No response received from server. ${e.message || e.toString()}`;
      } else {
        result.message = `Error: ${e.message || e.toString()}`;
      }
    }

    return result;
  }

  /**
   * Internal helper: Update cash sales
   * @param {Object} options - Options object
   * @param {string} options.dockey - Cash sales dockey (required)
   * @param {Object} options.cashSalesData - Cash sales data payload
   * @param {string|null} options.storeId - Store ID for credentials (optional)
   * @returns {Promise<Object>} Result object with success, message, data, and response
   */
  async helperUpdateCashSales({ dockey, cashSalesData, storeId = null }) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: ''
    };

    try {
      if (!dockey) {
        result.message = 'Dockey is required for update';
        return result;
      }

      // Always look up the latest record so we send a valid master payload with updatecount.
      const existing = await this.sendRequestWithCredentials(storeId, "GET", this.buildCashSalesPath(dockey));
      const record = this.pickFirstRecord(existing);
      if (!record || typeof record.updatecount === "undefined") {
        result.message = "Unable to resolve updatecount for the target cash sale.";
        return result;
      }

      // Merge server-resolved fields into the final payload.
      let finalPayload;
      
      // Check if IRBM fields are being updated
      const hasIrbmFields = cashSalesData.irbm_uuid !== undefined || 
                            cashSalesData.irbm_longid !== undefined || 
                            (cashSalesData.irbm_status !== undefined && cashSalesData.irbm_status !== null);
      
      if (cashSalesData.cancelled === true) {
        // use simplified payload for cancellation/voiding
        finalPayload = {
          docno: record.docno,
          code: record.code,
          cancelled: true,
          p_paymentmethod: "",
          p_amount: 0,
          updatecount: (record.updatecount || 0) + 1,
        };
      } else if (hasIrbmFields) {
        // use minimal payload for IRBM fields update
        finalPayload = {
          docno: record.docno,
          code: record.code,
          updatecount: (record.updatecount || 0) + 1,
        };
        
        // Add IRBM fields if provided
        if (cashSalesData.irbm_uuid !== undefined) {
          finalPayload.irbm_uuid = cashSalesData.irbm_uuid;
        }
        if (cashSalesData.irbm_longid !== undefined) {
          finalPayload.irbm_longid = cashSalesData.irbm_longid;
        }
        if (cashSalesData.irbm_status !== undefined && cashSalesData.irbm_status !== null) {
          finalPayload.irbm_status = cashSalesData.irbm_status;
        }
        
        // Add EIV_UTC - current date/time in UTC format (ISO 8601 with milliseconds)
        const now = new Date();
        finalPayload.eiv_utc = now.toISOString();
      } else {
        finalPayload = this.removeNullValues({
          ...record,
          ...cashSalesData,
          dockey: record.dockey,
          docno: record.docno,
          updatecount: (record.updatecount || 0) + 1,
        });
      }

      console.log("finalPayload", JSON.stringify(finalPayload));

      const data = await this.sendRequestWithCredentials(storeId, "PUT", this.buildCashSalesPath(dockey), finalPayload);
      result.success = true;
      result.data = data;
      result.response = JSON.stringify(data);
    } catch (e) {
      // Enhanced error handling to capture API response details
      if (e.response) {
        const status = e.response.status;
        const statusText = e.response.statusText;
        const errorData = e.response.data;
        result.message = `Error ${status} ${statusText}: ${JSON.stringify(errorData || {})}`;
        result.response = JSON.stringify(errorData || {});
      } else if (e.request) {
        result.message = `Error: No response received from server. ${e.message || e.toString()}`;
      } else {
        result.message = `Error: ${e.message || e.toString()}`;
      }
    }

    return result;
  }

  /**
   * Internal helper: Build invoice payload from order model
   * NEW STRUCTURE: Tax at line level, service charge as separate line item
   * @param {Object} order - Order object containing order details
   * @returns {Object} Invoice payload object
   */
  buildInvoicePayloadFromOrder(order) {
    // Get order items
    const orderItems = [];
    if (order.orderItems && order.orderItems.length > 0) {
      for (const item of order.orderItems) {
        orderItems.push(item);
      }
    } else if (order.orderitems && order.orderitems.length > 0) {
      // Also check for lowercase 'orderitems' (for compatibility)
      for (const item of order.orderitems) {
        orderItems.push(item);
      }
    }

    // Format date
    const orderDateTime = parseInt(order.orderDateTime) || 0;
    const date = orderDateTime > 0
      ? new Date(orderDateTime)
      : new Date();
    const dateStr = this.formatDateYYYYMMDD(date);

    // Get customer code from phone number
    let customerCode = order.userPhoneNumber || order.userphonenumber || '';
    if (customerCode) {
      customerCode = this.cleanPhoneNumberForCode(customerCode);
    }
    if (!customerCode) {
      customerCode = '+60123456789'; //0Test-Cust
      customerCode = this.cleanPhoneNumberForCode(customerCode);
    }

    const customerName = order.name || customerCode;
    const customerPhone = order.userPhoneNumber || order.userphonenumber || customerCode;

    // Build sdsdocdetail with tax at line level
    const sdsDocDetail = [];

    // Parse tax rate from order (default to 0 if not available)
    let taxRate = 0.0;
    let taxLabel = '';
    try {
      const taxStr = order.totalTax || order.tax || '0';
      const totalTax = parseFloat(taxStr) || 0.0;
      const totalPriceStr = order.totalPrice || order.totalprice || '0';
      const totalPrice = parseFloat(totalPriceStr) || 0.0;

      // Calculate approximate tax rate if tax amount exists
      if (totalTax > 0 && totalPrice > 0) {
        // Estimate tax rate (common rates: 5%, 6%, 10%)
        const estimatedRate = (totalTax / (totalPrice - totalTax)) * 100;
        if (estimatedRate >= 9.5 && estimatedRate <= 10.5) {
          taxRate = 10.0;
          taxLabel = 'TAX 10%';
        } else if (estimatedRate >= 5.5 && estimatedRate <= 6.5) {
          taxRate = 6.0;
          taxLabel = 'TAX 6%';
        } else if (estimatedRate >= 4.5 && estimatedRate <= 5.5) {
          taxRate = 5.0;
          taxLabel = 'TAX 5%';
        } else {
          taxRate = estimatedRate;
          taxLabel = `TAX ${Math.round(estimatedRate)}%`;
        }

        //always set to 6% for now
        taxRate = 6.0;
        taxLabel = 'TAX 6%';

      }
    } catch (e) {
      // Keep default values
    }

    // Add order items with tax at line level
    for (const item of orderItems) {
      const sku = item.sku || '';
      if (sku) {
        const qty = parseFloat(item.qty || item.quantity || 1);
        const lineItem = {
          itemcode: sku,
          qty: qty.toFixed(2),
          unitprice: parseFloat(item.price || 0).toFixed(2),
          disc: ((parseFloat(item.discount ?? 0) || 0) * qty).toFixed(2),
        };

        // Add tax at line level if tax exists
        if (taxLabel && taxRate > 0) {
          lineItem.tax = taxLabel;
          lineItem.taxrate = `${Math.round(taxRate)}%`;
        }

        sdsDocDetail.push(lineItem);
      }
    }

    // Add service charge as a separate line item if it exists
    let serviceChargeAmount = 0.0;
    try {
      const serviceChargeStr = order.totalServiceCharge || order.servicecharge || '0';
      serviceChargeAmount = parseFloat(serviceChargeStr) || 0.0;
    } catch (e) {
      // Keep default 0
    }

    if (serviceChargeAmount > 0) {
      sdsDocDetail.push({
        description: 'Service charge',
        qty: '1',
        unitprice: serviceChargeAmount.toFixed(2),
      });
    }

    // Add receipt discount as a separate line item if not zero (negative amount)
    let receiptDiscountAmount = 0.0;
    try {
      const receiptDiscountStr = order.receiptDiscount || order.receiptdiscount || '0';
      receiptDiscountAmount = parseFloat(receiptDiscountStr) || 0.0;
    } catch (e) {
      // Keep default 0
    }

    if (receiptDiscountAmount !== 0) {
      sdsDocDetail.push({
        description: "Discount / Cash Voucher",
        qty: "1",
        unitprice: (0 - receiptDiscountAmount).toFixed(2),
      });
    }

    // Build invoice payload with new structure
    const payload = {
      docno: order.sqlaccountorderid || order.orderId || order.orderid || 'p00021',
      docdate: dateStr,
      postdate: dateStr,
      code: customerCode,
      attention: customerName,
      docamt: order.totalPrice || order.totalprice || '0.00',
      // p_amount: order.totalPrice || order.totalprice || '0.00',
      // p_paymentmethod: "310-001",
      //paymentstatus: (order.paymentStatus === '0' || order.paymentStatus === 0 || order.paymentStatus === 'Paid') ? 'Paid' : 'Unpaid',
      sdsdocdetail: sdsDocDetail,
      dattention: customerName,
      dphone1: customerPhone,
      taxdate: dateStr,
      irbm_status: 0,
      project: order.storeTitle || order.storetitle || '',
    };

    // Add IRBM fields if available
    const hasLongId = order?.longId && order.longId.trim() !== '';
    const hasUuid = order?.uuid && order.uuid.trim() !== '';
    if (hasLongId && hasUuid) {
      payload.irbm_status = 2;
      payload.irbm_uuid = order.uuid;
      payload.irbm_longid = order.longId;
    }

    return payload;
  }

  /**
   * Internal helper: Create invoice from order - automatically creates customer and invoice
   * @param {Object} options - Options object
   * @param {Object} options.order - Order object containing order details
   * @param {string|null} options.storeId - Store ID for credentials (optional)
   * @returns {Promise<Object>} Result object with success, message, data, response, customerCreated, customerResponse, and invoicePayload
   */
  async helperCreateInvoiceFromOrder({ order, storeId = null }) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: '',
      customerCreated: false,
      customerResponse: '',
      invoicePayload: null,
    };

    try {
      // Get order items
      const orderItems = [];
      if (order.orderItems && order.orderItems.length > 0) {
        for (const item of order.orderItems) {
          orderItems.push(item);
        }
      }

      // Format date
      const orderDateTime = parseInt(order.orderDateTime) || 0;
      const date = orderDateTime > 0
        ? new Date(orderDateTime)
        : new Date();
      const dateStr = this.formatDateYYYYMMDD(date);

      // Build sdsdocdetail and calculate subtotal
      const sdsDocDetail = [];
      let subtotal = 0.0;

      for (const item of orderItems) {
        const sku = item.sku || '';
        if (sku) {
          sdsDocDetail.push({
            itemcode: sku,
            qty: parseFloat(item.qty || 1).toFixed(2),
          });
        }
        // Calculate subtotal: sum of (qty * price) for all items
        subtotal += (item.qty || 1) * (item.price || 0);
      }

      // Get customer code from phone number
      let customerCode = order.userphonenumber || '';
      if (customerCode) {
        customerCode = this.cleanPhoneNumberForCode(customerCode);
      }
      if (!customerCode) {
        customerCode = '+60123456789'; //0Test-Cust
        customerCode = this.cleanPhoneNumberForCode(customerCode);
      }

      const customerName = order.name || customerCode;
      const customerPhone = order.userPhoneNumber || customerCode;

      // Step 1: Create customer (always attempt, regardless of whether it exists)
      const createCustomerResult = await this.helperCreateCustomer({
        code: customerCode,
        companyName: customerName,
        phone1: customerPhone,
        storeId: storeId,
      });

      // Store customer creation response
      let customerResponse = '';
      if (createCustomerResult.response) {
        try {
          const jsonResponse = JSON.parse(createCustomerResult.response);
          customerResponse = JSON.stringify(jsonResponse, null, 2);
        } catch (e) {
          customerResponse = createCustomerResult.response;
        }
      } else if (createCustomerResult.data) {
        customerResponse = JSON.stringify(createCustomerResult.data, null, 2);
      }

      result.customerCreated = createCustomerResult.success || false;
      result.customerResponse = customerResponse;

      // Step 2: Build invoice payload
      const paymentStatus = (order.paymentStatus === '0' || order.paymentStatus === 0 || order.paymentStatus === 'Paid')
        ? 'Paid'
        : 'Unpaid';

      // Check if longId and uuid exist and are not empty from order model
      const hasLongId = order?.longId && order.longId.trim() !== '';
      const hasUuid = order?.uuid && order.uuid.trim() !== '';
      
      // Set IRBM fields based on validation result
      let irbmStatus = 0;
      let irbmUuid = null;
      let irbmLongId = null;
      
      if (hasLongId && hasUuid) {
        irbmStatus = 2; // Status 2 means success
        irbmUuid = order.uuid;
        irbmLongId = order.longId;
        console.log('✅ [DEBUG] IRBM fields set from order model - Status: 2, UUID:', irbmUuid, 'LongId:', irbmLongId);
      } else {
        console.log('⚠️ [DEBUG] IRBM fields not available - Status: 0, UUID: null, LongId: null');
      }

      const payload = {
        docno: order.orderid || 'p00021',
        docdate: dateStr,
        postdate: dateStr,
        code: customerCode,
        attention: customerName,
        docamt: order.totalprice || '0.00',
        paymentstatus: paymentStatus,
        sdsdocdetail: sdsDocDetail,
        subtotal: subtotal.toFixed(2),
        discountamount: order.totaldiscount || '0.00',
        taxamount: order.tax || '0.00',
        servicecharge: order.servicecharge || '0.00',
        grandtotal: order.totalprice || '0.00',
        dattention: customerName,
        dphone1: order.userphonenumber || '',
        salestaxno: '',
        servicetaxno: '',
        taxdate: dateStr,
        irbm_status: irbmStatus,
        irbm_uuid: irbmUuid,
        irbm_longid: irbmLongId,
        external_customer_phone: order.userphonenumber || '',
        external_voucher: order.voucher || '',
      };

      result.invoicePayload = payload;

      // Step 3: Create invoice (always proceed regardless of customer creation result)
      // Note: Empty sdsdocdetail is allowed - let SQL Account API validate if needed
      const invoiceResult = await this.helperCreateSalesInvoice({ invoiceData: payload, storeId: storeId });

      if (invoiceResult.success) {
        result.success = true;
        result.data = invoiceResult.data;
        result.response = invoiceResult.response;
      } else {
        result.message = invoiceResult.message || 'Failed to create invoice';
        result.response = invoiceResult.response;
      }
    } catch (e) {
      // Enhanced error handling
      if (e.response) {
        const status = e.response.status;
        const statusText = e.response.statusText;
        const errorData = e.response.data;
        result.message = `Error ${status} ${statusText}: ${JSON.stringify(errorData || {})}`;
        result.response = JSON.stringify(errorData || {});
      } else {
        result.message = `Error: ${e.message || e.toString()}`;
      }
    }

    return result;
  }

  /**
   * Internal helper: Create or update cash sales from order - automatically creates customer and cash sale
   * @param {Object} options - Options object
   * @param {Object} options.order - Order object containing order details
   * @param {string} options.action - Action to perform: 'create' or 'update' (default: 'create')
   * @param {string|null} options.storeId - Store ID for credentials (optional)
   * @param {boolean|null} options.cancelled - Cancelled status to set on the cash sale (optional)
   * @param {Array|null} options.paymentBreakdown - Array of { paymentType, accountCode, amount } for customer payments (optional)
   * @returns {Promise<Object>} Result object with success, message, data, response, customerCreated, customerResponse, and cashSalesPayload
   */
  async helperCreateCashSalesFromOrder({ order, action = 'create', storeId = null, cancelled = null, paymentBreakdown = null }) {
    const result = {
      success: false,
      message: '',
      data: null,
      response: '',
      customerCreated: false,
      customerResponse: '',
      cashSalesPayload: null,
    };

    try {
      // Build cash sales payload using helper function (same structure as invoice)
      const payload = this.buildInvoicePayloadFromOrder(order);
      result.cashSalesPayload = payload;
      console.log('[CASH SALES] payload to be sent:', JSON.stringify(payload, null, 2));

      // Extract customer code and name from payload
      const customerCode = payload.code;
      const customerName = payload.attention;
      const customerPhone = payload.dphone1;

      console.log(`🔔 [CASH SALES] Starting process to ${action} cash sales`);
      console.log(payload);  

      // Step 1: Create customer (always attempt, regardless of whether it exists)
      const createCustomerResult = await this.helperCreateCustomer({
        code: customerCode,
        companyName: customerName,
        phone1: customerPhone,
        storeId: storeId,
      });

      console.log('📥 [CASH SALES] Customer creation result:', JSON.stringify(createCustomerResult, null, 2));

      // Store customer creation response
      let customerResponse = '';
      if (createCustomerResult.response) {
        try {
          const jsonResponse = JSON.parse(createCustomerResult.response);
          customerResponse = JSON.stringify(jsonResponse, null, 2);
        } catch (e) {
          customerResponse = createCustomerResult.response;
        }
      } else if (createCustomerResult.data) {
        customerResponse = JSON.stringify(createCustomerResult.data, null, 2);
      }

      result.customerCreated = createCustomerResult.success || false;
      result.customerResponse = customerResponse;

      // Step 3: Create or update cash sales (always proceed regardless of customer creation result)
      // Note: Empty sdsdocdetail is allowed - let SQL Account API validate if needed
      let cashSalesResult = null;

      // Add cancelled field to payload if provided
      if (cancelled !== null && cancelled !== undefined) {
        payload.cancelled = cancelled;
        console.log('ℹ️ [CASH SALES] Setting cancelled field to:', cancelled);
      }

      //console.log("payload before processing " + JSON.stringify(payload));
      
      if (action === 'update') {
        // For update, we need to find the existing cash sale by docno first
        console.log('🔄 [UPDATE] Starting update action for cash sales');
        try {
          const docno = payload.docno;
          console.log('🔍 [UPDATE] Searching for cash sale with docno:', docno);
          
          const query = buildQuery({ docNo: docno });
          console.log('🔍 [UPDATE] Query string:', query);
          
          const existingCashSales = await this.sendRequestWithCredentials(storeId, "GET", this.CASH_SALES_PATH, null, query);
          console.log('📥 [UPDATE] Existing cash sales response:', JSON.stringify(existingCashSales, null, 2));
          
          const existingRecord = this.pickFirstRecord(existingCashSales);
          console.log('📋 [UPDATE] Picked first record:', JSON.stringify(existingRecord, null, 2));
          
          if (existingRecord && existingRecord.dockey) {
            console.log('✅ [UPDATE] Found dockey:', existingRecord.dockey);

            // When cancelling: DELETE customer payments FIRST, then PUT cash sale
            if (cancelled === true) {
              const resolvedStoreId = order.storeid || order.storeId || storeId;
              const cashSalesDocno = payload.docno;
              const paymentDocnosToDelete = [];
              if (Array.isArray(paymentBreakdown) && paymentBreakdown.length > 0) {
                for (let idx = 0; idx < paymentBreakdown.length; idx++) {
                  const item = paymentBreakdown[idx];
                  const paymentType = item.paymentType != null ? String(item.paymentType).trim() : String(idx);
                  paymentDocnosToDelete.push(`${cashSalesDocno}_${paymentType}`);
                }
              } else {
                const mixedpayments = order.mixedpayments || order.mixedPayments;
                if (Array.isArray(mixedpayments) && mixedpayments.length > 0) {
                  for (const item of mixedpayments) {
                    const paymentType = item.paymentType != null ? String(item.paymentType).trim() : '';
                    if (paymentType) paymentDocnosToDelete.push(`${cashSalesDocno}_${paymentType}`);
                  }
                }
              }
              let customerPaymentsDeleted = 0;
              console.log('[CUSTOMER PAYMENT] cancelled=true, deleting payments BEFORE PUT: count=', paymentDocnosToDelete.length, 'docnos=', paymentDocnosToDelete);
              for (const paymentDocno of paymentDocnosToDelete) {
                try {
                  const voidResult = await this.helperVoidCustomerPaymentByDocno({
                    docno: paymentDocno,
                    storeId: resolvedStoreId,
                  });
                  if (voidResult.success) {
                    customerPaymentsDeleted++;
                    console.log('[CASH SALES] Customer payment deleted:', paymentDocno);
                  } else {
                    console.warn('[CASH SALES] Customer payment delete skipped (not found or error):', paymentDocno, voidResult.message);
                  }
                } catch (voidErr) {
                  console.warn('[CASH SALES] Customer payment delete error:', paymentDocno, voidErr.message || voidErr);
                }
              }
              result.customerPaymentsDeleted = customerPaymentsDeleted;
              console.log('[CUSTOMER PAYMENT] cancelled=true done: deleted=', customerPaymentsDeleted);
            }

            console.log('🔄 [UPDATE] Calling helperUpdateCashSales with dockey:', existingRecord.dockey);
            
            cashSalesResult = await this.helperUpdateCashSales({ 
              dockey: existingRecord.dockey, 
              cashSalesData: payload, 
              storeId: storeId,
            });
            
            console.log('📤 [UPDATE] Update result:', JSON.stringify(cashSalesResult, null, 2));
          } else {
            console.log('❌ [UPDATE] Cash sale not found or missing dockey');
            console.log('❌ [UPDATE] existingRecord:', existingRecord);
            console.log('❌ [UPDATE] dockey value:', existingRecord?.dockey);
            result.message = `Cash sale with docno '${docno}' not found for update`;
            result.response = JSON.stringify({ docno, action: 'update', error: 'Not found' });
            return result;
          }
        } catch (e) {
          console.log('❌ [UPDATE] Error finding cash sale for update:', e.message || e.toString());
          console.log('❌ [UPDATE] Error stack:', e.stack);
          result.message = `Error finding cash sale for update: ${e.message || e.toString()}`;
          return result;
        }
      } else {
        // Default action is 'create'
        cashSalesResult = await this.helperCreateCashSales({ cashSalesData: payload, storeId: storeId });
        console.log('[CASH SALES] helperCreateCashSales result:', JSON.stringify(cashSalesResult, null, 2));
      }

      if (cashSalesResult.success) {
        result.success = true;
        result.data = cashSalesResult.data;
        result.response = cashSalesResult.response;

        // Customer payments: when cancelled, delete existing; otherwise create
        const resolvedStoreId = order.storeid || order.storeId || storeId;
        const cashSalesDocno = payload.docno;
        const dateStr = payload.docdate || this.formatDateYYYYMMDD(new Date());
        const code = payload.code;
        let customerPaymentsCreated = 0;
        let customerPaymentsSkipped = 0;
        let customerPaymentsDeleted = 0;

        if (cancelled === true) {
          // Customer payments already deleted BEFORE PUT (in update block above); nothing more to do
          console.log('[CUSTOMER PAYMENT] cancelled=true: payments deleted before PUT, no further action');
        } else if (Array.isArray(paymentBreakdown) && paymentBreakdown.length > 0) {
          // Priority 1: Use paymentBreakdown directly (accountCode and amount from payload, no store lookup)
          console.log('[CUSTOMER PAYMENT] paymentBreakdown: count=', paymentBreakdown.length, 'storeId=', resolvedStoreId, 'cashSalesDocno=', cashSalesDocno);
          if (!resolvedStoreId) {
            console.warn('[CASH SALES] paymentBreakdown present but storeId missing; skipping customer payments');
          } else {
            for (let idx = 0; idx < paymentBreakdown.length; idx++) {
              const item = paymentBreakdown[idx];
              const accountCode = item.accountCode != null ? String(item.accountCode).trim() : '';
              const amount = item.amount;
              const numAmount = Number(amount);
              if (!accountCode) {
                console.warn('[CASH SALES] paymentBreakdown item missing accountCode; skipping', idx);
                customerPaymentsSkipped++;
                continue;
              }
              if (!Number.isFinite(numAmount) || numAmount <= 0) {
                console.warn('[CASH SALES] paymentBreakdown item invalid amount:', amount, '; skipping', idx);
                customerPaymentsSkipped++;
                continue;
              }
              const paymentType = item.paymentType != null ? String(item.paymentType).trim() : String(idx);
              const paymentDocno = `${cashSalesDocno}_${paymentType}`;
              try {
                const cpResult = await this.helperCreateCustomerPaymentWithParams({
                  docno: paymentDocno,
                  code,
                  paymentMethod: accountCode,
                  amount: numAmount,
                  knockoffDocno: cashSalesDocno,
                  docdate: dateStr,
                  postdate: dateStr,
                  storeId: resolvedStoreId,
                });
                if (cpResult.success) {
                  customerPaymentsCreated++;
                  console.log('[CASH SALES] Customer payment created:', paymentDocno, 'accountCode:', accountCode, 'amount:', numAmount);
                } else {
                  console.warn('[CASH SALES] Customer payment failed:', paymentDocno, cpResult.message);
                }
              } catch (cpErr) {
                console.warn('[CASH SALES] Customer payment error:', paymentDocno, cpErr.message || cpErr);
              }
            }
            result.customerPaymentsCreated = customerPaymentsCreated;
            result.customerPaymentsSkipped = customerPaymentsSkipped;
            console.log('[CUSTOMER PAYMENT] paymentBreakdown done: created=', customerPaymentsCreated, 'skipped=', customerPaymentsSkipped);
          }
        } else {
          // Priority 2: Fallback to mixedpayments + store lookup (backward compatibility)
          const mixedpayments = order.mixedpayments || order.mixedPayments;
          if (Array.isArray(mixedpayments) && mixedpayments.length > 0) {
            console.log('[CUSTOMER PAYMENT] mixedpayments: count=', mixedpayments.length, 'storeId=', resolvedStoreId, 'cashSalesDocno=', payload?.docno);
            if (!resolvedStoreId) {
              console.warn('[CASH SALES] mixedpayments present but storeId missing; skipping customer payments');
            } else {
              const storeData = await this.getStoreData(resolvedStoreId);
              if (!storeData) {
                console.warn('[CASH SALES] Store not found for storeId:', resolvedStoreId, '; skipping customer payments');
              } else {
                for (const item of mixedpayments) {
                  const paymentType = item.paymentType != null ? String(item.paymentType).trim() : '';
                  const amount = item.amount;
                  if (!paymentType) {
                    customerPaymentsSkipped++;
                    continue;
                  }
                  const sqlCode = this.mapPaymentTypeToSqlCode(paymentType, storeData);
                  if (!sqlCode) {
                    console.warn('[CASH SALES] No SQL payment mapping for paymentType:', paymentType, '; skipping customer payment');
                    customerPaymentsSkipped++;
                    continue;
                  }
                  const paymentDocno = `${cashSalesDocno}_${paymentType}`;
                  try {
                    const cpResult = await this.helperCreateCustomerPaymentWithParams({
                      docno: paymentDocno,
                      code,
                      paymentMethod: sqlCode,
                      amount,
                      knockoffDocno: cashSalesDocno,
                      docdate: dateStr,
                      postdate: dateStr,
                      storeId: resolvedStoreId,
                    });
                    if (cpResult.success) {
                      customerPaymentsCreated++;
                      console.log('[CASH SALES] Customer payment created:', paymentDocno, 'amount:', amount);
                    } else {
                      console.warn('[CASH SALES] Customer payment failed:', paymentDocno, cpResult.message);
                    }
                  } catch (cpErr) {
                    console.warn('[CASH SALES] Customer payment error:', paymentDocno, cpErr.message || cpErr);
                  }
                }
                result.customerPaymentsCreated = customerPaymentsCreated;
                result.customerPaymentsSkipped = customerPaymentsSkipped;
                console.log('[CUSTOMER PAYMENT] mixedpayments done: created=', customerPaymentsCreated, 'skipped=', customerPaymentsSkipped);
              }
            }
          }
        }
      } else {
        result.message = cashSalesResult.message || `Failed to ${action} cash sales`;
        result.response = cashSalesResult.response;
      }
    } catch (e) {
      // Enhanced error handling
      if (e.response) {
        const status = e.response.status;
        const statusText = e.response.statusText;
        const errorData = e.response.data;
        result.message = `Error ${status} ${statusText}: ${JSON.stringify(errorData || {})}`;
        result.response = JSON.stringify(errorData || {});
      } else {
        result.message = `Error: ${e.message || e.toString()}`;
      }
    }

    return result;
  }
}

module.exports = SqlAccountRouter;

