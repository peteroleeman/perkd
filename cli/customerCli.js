// Customer - Get List, Add, Update & Delete Function
// Command: node cli/customerCli.js
// Updated on 01 Oct 2025
const { sendRequest } = require("../api/APICommon.cjs");
const fs = require("fs");
const readline = require("readline");
const path = require("path");

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
        `[${idx + 1}] code= ${item.code}, dockey= ${item.dockey}, name= ${item.companyname}`
      );
    });
  } else if (Array.isArray(data.data)) {
    console.log(`Found ${data.data.length} record(s):`);
    data.data.forEach((item, idx) => {
      console.log(
        `[${idx + 1}] code= ${item.code}, dockey= ${item.dockey}, name= ${item.companyname}`
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

class CustomerApi {
  constructor() {
    this.basePath = "/customer"; // base path
  }

  /**
   * Get customer list with pagination (default: offset=0, limit=5)
   */
  async get_list(offset = 0, limit = 5) {
    const query = `offset=${offset}&limit=${limit}`;
    console.log(`\n--- Fetching customer list (offset = ${offset}, limit = ${limit}) ---`);
    const data = await sendRequest("GET", this.basePath, null, query);

    // Force limit client-side if API ignore
    if (data && Array.isArray(data.data)) {
      data.data = data.data.slice(offset, offset + limit);
    }

    debugPrintJson(data);
    return data;
  }

  /**
   * Get a single customer by code
   */
  async get_single(code) {
    const query = `code=${encodeURIComponent(code)}`;
    console.log(`\n--- Fetching single customer '${code}' ---`);
    try {
      const data = await sendRequest("GET", this.basePath, null, query);
      debugPrintJson(data);
      return data;
    } catch (err) {
      console.error(`Failed to fetch customer '${code}':`, err.message);
      throw err;
    }
  }

  /**
   * Create new customer
   */
  async create(payload) {
    console.log("\n--- Creating new customer ---");
    try {
      const data = await sendRequest("POST", this.basePath, payload);
      debugPrintJson(data);
      console.log("Customer created successfully.");
      return data;
    } catch (err) {
      console.error(
        "Failed to create customer:",
        err.response?.data || err.message
      );
      throw err;
    }
  }

  /**
   * Update existing customer (by dockey when available)
   */
  async update(identifier, payload) {
    if (!identifier) throw new Error("Dockey or code required for update");
    console.log(`\n--- Updating customer: ${identifier} ---`);

    // Ensure code is included in payload when available
    const finalPayload = payload?.code ? payload : { ...payload, code: identifier };
    const pathName = `${this.basePath}/${encodeURIComponent(identifier)}`;

    try {
      const data = await sendRequest("PUT", pathName, finalPayload);
      debugPrintJson(data);
      console.log("Customer updated successfully.");
      return data;
    } catch (err) {
      console.error(
        `Failed to update customer '${identifier}':`,
        err.response?.data || err.message
      );
      throw err;
    }
  }

  /**
   * Delete customer by dockey (or code when dockey is unavailable)
   */
  async delete(identifier) {
    const pathName = `${this.basePath}/${encodeURIComponent(identifier)}`;
    console.log(`\n--- Deleting customer: ${identifier} ---`);
    try {
      const data = await sendRequest("DELETE", pathName);
      debugPrintJson(data);
      console.log("Customer deleted successfully.");
      return data;
    } catch (err) {
      console.error(
        `Failed to delete customer '${identifier}':`,
        err.response?.data || err.message
      );
      throw err;
    }
  }
}

// ========== Runner ==========

const custApi = new CustomerApi();
const JSON_FOLDER = "./JSON/"; // your json folder file path, is same path as node.js, leave it blank

// Readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 *
 * Helper to ask question and return Promise<string>
 */
function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function confirm(message) {
  const ans = (await ask(`${message} (y/n): `)).toLowerCase();
  return ans === "y" || ans === "yes";
}

// Helper to load JSON file
function loadJson(filename) {
  try {
    const file = fs.readFileSync(filename, "utf8");
    return JSON.parse(file);
  } catch (err) {
    console.error(`Failed to read ${filename}:`, err.message);
    return null;
  }
}

async function AR_Customer() {
  try {
    // Customer list
    console.log("\n================= Customer List =================");
    if (await confirm("Proceed to fetch customer list?")) {
      const list = await custApi.get_list();
      console.table(JSON.stringify(list, null, 2));
    }

    // Single customer
    console.log("\n================= Fetch Single Customer =================");
    if (await confirm("Do you want to fetch a single customer?")) {
      const code = await ask("Enter customer code: ");
      const cust = await custApi.get_single(code.trim());
      console.log(`\n--- Fetching customer code '${code}' ---`);
      console.table(JSON.stringify(cust, null, 2));
    }

    // Create new customer
    console.log("\n================= Create New Customer =================");
    if (await confirm("Do you want to create a new customer?")) {
      const payload = loadJson(JSON_FOLDER + "AR_Customer-New.json"); // Make sure file name is correct
      if (payload) {
        await custApi.create(payload);
      } else {
        console.log("Skipped create customer (no valid JSON).");
      }
    }

    // Edit existing customer
    console.log("\n================= Edit Customer =================");
    if (await confirm("Do you want to edit a customer?")) {
      const payload = loadJson(JSON_FOLDER + "AR_Customer-Edit.json"); // Make sure the file name is correct
      if (!payload?.code) {
        console.log("The file must contain customer code.");
      } else {
        const code = payload.code.trim();
        console.log(`\n--- Looking for customer code '${code}' ---`);

        // Fetch existing record by code
        const existing = await custApi.get_single(code);

        // normalize record extraction
        const record =
          (existing && existing.data && existing.data[0]) ||
          (existing && existing.items && existing.items[0]) ||
          existing;

        if (!record) {
          console.log(`Customer Code '${code}' not found.`);
        } else {
          const dockey = record.dockey;
          const identifier = dockey || code;
          const finalPayload = { ...record, ...payload, dockey, code };

          fs.writeFileSync(
            JSON_FOLDER + "AR_Customer-Edit.json",
            JSON.stringify(finalPayload, null, 2)
          );

          await custApi.update(identifier, finalPayload);
        }
      }
    }

    // Delete existing customer
    console.log("\n================= Delete Customer =================");
    if (await confirm("Do you want to delete a customer?")) {
      const code = await ask("Enter customer code to delete: ");
      if (code) {
        console.log(`--- Deleting customer '${code}' ---`);
        const existing = await custApi.get_single(code.trim());

        const record =
          (existing && existing.data && existing.data[0]) ||
          (existing && existing.items && existing.items[0]) ||
          existing;

        if (!record) {
          console.log(`Customer Code '${code}' not found.`);
        } else {
          const identifier = record.dockey || code.trim();
          await custApi.delete(identifier);
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
  AR_Customer();
}

module.exports = { CustomerApi };

