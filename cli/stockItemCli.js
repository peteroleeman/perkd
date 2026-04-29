// Stock Item - Get List, Add, Update & Delete Function
// Command: node cli/stockItemCli.js
// Updated on 04 Oct 2025
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
        `[${idx + 1}] code= ${item.code}, dockey= ${item.dockey}, desc= ${item.description}, stockgroup= ${item.stockgroup}`
      );
    });
  } else if (Array.isArray(data.data)) {
    console.log(`Found ${data.data.length} record(s):`);
    data.data.forEach((item, idx) => {
      console.log(
        `[${idx + 1}] code= ${item.code}, dockey= ${item.dockey}, desc= ${item.description}, stockgroup= ${item.stockgroup}`
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

class StockItemApi {
  constructor() {
    this.basePath = "/stockitem"; // base path
  }

  /**
   * Get stock item list
   */
  async get_list(offset = 0, limit = 10) {
    const query = `offset=${offset}&limit=${limit}`;
    console.log("\n--- Fetching stock item list ---");
    const data = await sendRequest("GET", this.basePath, null, query);

    if (data && Array.isArray(data.data)) {
      data.data = data.data.slice(offset, offset + limit);
    }

    debugPrintJson(data);
    return data;
  }

  /**
   * Get a single stock item by code
   */
  async get_single(code) {
    const query = `code=${encodeURIComponent(code)}`;
    console.log(`\n--- Fetching single stock item '${code}' ---`);
    try {
      const data = await sendRequest("GET", this.basePath, null, query);
      debugPrintJson(data);
      return data;
    } catch (err) {
      console.error(`Failed to fetch stock item '${code}':`, err.message);
      throw err;
    }
  }

  /**
   * Create new stock item
   */
  async create(payload) {
    console.log("\n--- Creating new stock item ---");
    try {
      const data = await sendRequest("POST", this.basePath, payload);
      debugPrintJson(data);
      console.log("Stock item created successfully.");
      return data;
    } catch (err) {
      console.error("Failed to create stock item:", err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Update existing stock item
   */
  async update(dockey, payload) {
    if (!dockey) throw new Error("Dockey required for update");
    console.log(`\n--- Updating stock item dockey: ${dockey} ---`);

    const finalPayload = { ...payload, dockey };
    const pathName = `${this.basePath}/${encodeURIComponent(dockey)}`;

    try {
      const data = await sendRequest("PUT", pathName, finalPayload);
      debugPrintJson(data);
      console.log("Stock item updated successfully.");
      return data;
    } catch (err) {
      console.error(
        `Failed to update stock item '${dockey}':`,
        err.response?.data || err.message
      );
      throw err;
    }
  }

  /**
   * Delete stock item by dockey
   */
  async delete(dockey) {
    const pathName = `${this.basePath}/${encodeURIComponent(dockey)}`;
    try {
      const data = await sendRequest("DELETE", pathName);
      debugPrintJson(data);
      console.log("Stock item deleted successfully.");
      return data;
    } catch (err) {
      console.error(`Failed to delete stock item '${dockey}':`, err.response?.data || err.message);
      throw err;
    }
  }
}

// ========== Runner ==========

const itemApi = new StockItemApi();
const JSON_FOLDER = "./JSON/"; // your json folder file path, if same path as node.js, leave it blank

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

async function ST_Item() {
  try {
    // List stock items
    console.log("\n================= Stock Item List =================");
    if (await confirm("Proceed to fetch stock item list?")) {
      const list = await itemApi.get_list();
      console.table(JSON.stringify(list, null, 2));
    }

    // Single stock item
    console.log("\n================= Single Stock Item =================");
    if (await confirm("Do you want to fetch a single stock item?")) {
      const code = await ask("Enter stock item code: ");
      const item = await itemApi.get_single(code.trim());
      console.log(`\n--- Fetching stock item code '${code}' ---`);
      console.table(JSON.stringify(item, null, 2));
    }

    // Create stock item
    console.log("\n================= Create New Stock Item =================");
    if (await confirm("Do you want to create a new stock item?")) {
      const payload = loadJson(JSON_FOLDER + "ST_Item-New.json"); // Make sure your file name is correct
      if (payload) {
        await itemApi.create(payload);
      } else {
        console.log("Skipped create stock item (no valid JSON).");
      }
    }

    // Edit stock item
    console.log("\n================= Edit Stock Item =================");
    if (await confirm("Do you want to edit a stock item?")) {
      const payload = loadJson(JSON_FOLDER + "ST_Item-Edit.json");
      if (!payload?.code) {
        console.log("The file must contain stock item code.");
      } else {
        const code = payload.code.trim();
        console.log(`\n--- Looking for stock item code '${code}' ---`);

        // Fetch existing record by code
        const existing = await itemApi.get_single(code);

        // Normalize record extraction
        const record =
          (existing && existing.data && existing.data[0]) ||
          (existing && existing.items && existing.items[0]) ||
          existing;

        if (!record) {
          console.log(`Stock Item Code '${code}' not found.`);
        } else {
          const dockey = record.dockey;

          const finalPayload = { ...record, ...payload, dockey };

          fs.writeFileSync(
            JSON_FOLDER + "ST_Item-Edit.json",
            JSON.stringify(finalPayload, null, 2)
          );

          await itemApi.update(dockey, finalPayload);
        }
      }
    }

    // Delete stock item
    console.log("\n================= Delete Stock Item =================");
    if (await confirm("Do you want to delete a stock item?")) {
      const code = await ask("Enter stock item code to delete: ");
      if (code) {
        console.log(`--- Deleting stock item '${code}' ---`);
        const existing = await itemApi.get_single(code.trim());

        const record =
          (existing && existing.data && existing.data[0]) ||
          (existing && existing.items && existing.items[0]) ||
          existing;

        if (!record) {
          console.log(`Stock Item Code '${code}' not found.`);
        } else {
          const dockey = record.dockey;
          await itemApi.delete(dockey);
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
  ST_Item();
}

module.exports = { StockItemApi };

