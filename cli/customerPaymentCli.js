// Customer Payment - Get List, Add, Update & Delete Function
// Command: node cli/customerPaymentCli.js
// Same pattern as stockGroupCli: list, get by docno, create, edit, delete
const { sendRequest, buildQuery } = require("../api/APICommon.cjs");
const fs = require("fs");
const readline = require("readline");
const path = require("path");

const CUSTOMER_PAYMENT_PATH = "/customerpayment";

/**
 * Pretty-print JSON responses for debugging
 */
function debugPrintJson(data) {
  if (!data) {
    console.log("No data returned.");
    return;
  }

  if (Array.isArray(data.items)) {
    console.log(`Found ${data.items.length} records:`);
    data.items.forEach((item, idx) => {
      console.log(
        `[${idx + 1}] docno= ${item.docno}, dockey= ${item.dockey}, code= ${item.code}, docamt= ${item.docamt}`
      );
    });
  } else if (Array.isArray(data.data)) {
    console.log(`Found ${data.data.length} record(s):`);
    data.data.forEach((item, idx) => {
      console.log(
        `[${idx + 1}] docno= ${item.docno}, dockey= ${item.dockey}, code= ${item.code}, docamt= ${item.docamt}`
      );
    });
  } else if (typeof data === "object") {
    console.log("Single record:");
    Object.entries(data).forEach(([k, v]) => {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    });
  } else {
    console.log("Raw:", data);
  }
}

function pickFirstRecord(payload) {
  if (!payload) return null;
  if (Array.isArray(payload.data) && payload.data.length) return payload.data[0];
  if (Array.isArray(payload.items) && payload.items.length) return payload.items[0];
  return payload;
}

function sanitizeCustomerPaymentUpdatePayload(payload = {}) {
  const finalPayload = { ...payload };
  delete finalPayload.code;
  return finalPayload;
}

class CustomerPaymentApi {
  constructor() {
    this.basePath = CUSTOMER_PAYMENT_PATH;
  }

  /**
   * Get customer payment list with pagination
   */
  async get_list(offset = 0, limit = 10) {
    const query = buildQuery({ offset, limit });
    console.log("\n--- Fetching customer payment list ---");
    const data = await sendRequest("GET", this.basePath, null, query);

    if (data && Array.isArray(data.data)) {
      data.data = data.data.slice(offset, offset + limit);
    }

    debugPrintJson(data);
    return data;
  }

  /**
   * Get a single customer payment by docno
   */
  async get_single(docno) {
    const query = buildQuery({ docno });
    console.log(`\n--- Fetching single customer payment docno '${docno}' ---`);
    try {
      const data = await sendRequest("GET", this.basePath, null, query);
      debugPrintJson(data);
      return data;
    } catch (err) {
      console.error(`Failed to fetch customer payment '${docno}':`, err.message);
      throw err;
    }
  }

  /**
   * Get a single customer payment by dockey (direct GET by id)
   */
  async get_by_dockey(dockey) {
    const pathName = `${this.basePath}/${encodeURIComponent(dockey)}`;
    console.log(`\n--- Fetching customer payment dockey '${dockey}' ---`);
    try {
      const data = await sendRequest("GET", pathName);
      debugPrintJson(data);
      return data;
    } catch (err) {
      console.error(`Failed to fetch customer payment dockey '${dockey}':`, err.message);
      throw err;
    }
  }

  /**
   * Create new customer payment
   */
  async create(payload) {
    console.log("\n--- Creating new customer payment ---");
    try {
      const data = await sendRequest("POST", this.basePath, payload);
      debugPrintJson(data);
      console.log("Customer payment created successfully.");
      return data;
    } catch (err) {
      console.error("Failed to create customer payment:", err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Update existing customer payment
   */
  async update(dockey, payload) {
    if (!dockey) throw new Error("Dockey required for update");
    console.log(`\n--- Updating customer payment dockey: ${dockey} ---`);

    try {
      const existing = await sendRequest("GET", `${this.basePath}/${encodeURIComponent(dockey)}`);
      const record = pickFirstRecord(existing);

      if (!record || typeof record.updatecount === "undefined") {
        throw new Error("Unable to resolve updatecount for the target customer payment.");
      }

      const finalPayload = sanitizeCustomerPaymentUpdatePayload({
        ...record,
        ...payload,
        dockey: record.dockey,
        docno: record.docno,
        updatecount: record.updatecount,
      });

      const pathName = `${this.basePath}/${encodeURIComponent(dockey)}`;
      const data = await sendRequest("PUT", pathName, finalPayload);
      debugPrintJson(data);
      console.log("Customer payment updated successfully.");
      return data;
    } catch (err) {
      console.error(
        `Failed to update customer payment '${dockey}':`,
        err.response?.data || err.message
      );
      throw err;
    }
  }

  /**
   * Delete customer payment by dockey
   */
  async delete(dockey) {
    const pathName = `${this.basePath}/${encodeURIComponent(dockey)}`;
    try {
      const data = await sendRequest("DELETE", pathName);
      debugPrintJson(data);
      console.log("Customer payment deleted successfully.");
      return data;
    } catch (err) {
      console.error(`Failed to delete customer payment '${dockey}':`, err.response?.data || err.message);
      throw err;
    }
  }
}

// ========== Runner ==========

const paymentApi = new CustomerPaymentApi();
const JSON_FOLDER = "./JSON/";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function confirm(message) {
  const ans = (await ask(`${message} (y/n): `)).toLowerCase();
  return ans === "y" || ans === "yes";
}

function loadJson(filename) {
  try {
    const file = fs.readFileSync(filename, "utf8");
    return JSON.parse(file);
  } catch (err) {
    console.error(`Failed to read ${filename}:`, err.message);
    return null;
  }
}

async function AR_PM() {
  try {
    // List customer payments
    console.log("\n================= Customer Payment List =================");
    if (await confirm("Proceed to fetch customer payment list?")) {
      const list = await paymentApi.get_list(0, 10);
      console.log(JSON.stringify(list, null, 2));
    }

    // Single customer payment by docno
    console.log("\n================= Single Customer Payment =================");
    if (await confirm("Do you want to fetch a single customer payment?")) {
      const docno = await ask("Enter customer payment docno: ");
      const doc = await paymentApi.get_single(docno.trim());
      console.log(JSON.stringify(doc, null, 2));
    }

    // Create customer payment
    console.log("\n================= Create New Customer Payment =================");
    if (await confirm("Do you want to create a new customer payment?")) {
      const payload = loadJson(JSON_FOLDER + "AR_PM-New.json");
      if (payload) {
        await paymentApi.create(payload);
      } else {
        console.log("Skipped create customer payment (no valid JSON).");
      }
    }

    // Edit customer payment
    console.log("\n================= Edit Customer Payment =================");
    if (await confirm("Do you want to edit a customer payment?")) {
      const payload = loadJson(JSON_FOLDER + "AR_PM-Edit.json");
      if (!payload?.docno) {
        console.log("The file must contain customer payment docno.");
      } else {
        const docno = payload.docno.trim();
        console.log(`\n--- Looking for customer payment docno '${docno}' ---`);

        const existing = await paymentApi.get_single(docno);
        const record = pickFirstRecord(existing);

        if (!record) {
          console.log(`Customer payment docno '${docno}' not found.`);
        } else {
          const dockey = record.dockey;
          const finalPayload = sanitizeCustomerPaymentUpdatePayload({
            ...record,
            ...payload,
            dockey,
            docno: record.docno,
            updatecount: record.updatecount,
          });

          fs.writeFileSync(
            JSON_FOLDER + "AR_PM-Edit.json",
            JSON.stringify(finalPayload, null, 2)
          );

          await paymentApi.update(dockey, finalPayload);
        }
      }
    }

    // Delete customer payment
    console.log("\n================= Delete Customer Payment =================");
    if (await confirm("Do you want to delete a customer payment?")) {
      const docno = await ask("Enter customer payment docno to delete: ");
      if (docno) {
        console.log(`--- Deleting customer payment '${docno}' ---`);
        const existing = await paymentApi.get_single(docno.trim());
        const record = pickFirstRecord(existing);

        if (!record) {
          console.log(`Customer payment docno '${docno}' not found.`);
        } else {
          await paymentApi.delete(record.dockey);
        }
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    console.log("--- End of the Script ---");
    rl.close();
  }
}

const currentFile = __filename;
const entryFile = path.resolve(process.argv[1]);

if (currentFile === entryFile) {
  AR_PM();
}

module.exports = { CustomerPaymentApi };
