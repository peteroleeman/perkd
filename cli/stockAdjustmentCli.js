import { sendRequest } from "./api/APICommon.js";
import fs from "fs";
import readline from "readline";
import { fileURLToPath } from "url";
import path from "path";

function debugPrintJson(data) {
  if (!data) {
    console.log("No data returned.");
    return;
  }

  if (Array.isArray(data.items)) {
    console.log(`Found ${data.items.length} records:`);
    data.items.forEach((item, idx) => {
      console.log(
        `[${idx + 1}] docno= ${item.docno}, dockey= ${item.dockey}, amount= ${item.docamt}`
      );
    });
  } else if (Array.isArray(data.data)) {
    console.log(`Found ${data.data.length} record(s):`);
    data.data.forEach((item, idx) => {
      console.log(
        `[${idx + 1}] docno= ${item.docno}, dockey= ${item.dockey}, amount= ${item.docamt}`
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

function pickFirstRecord(data) {
  if (!data) return null;
  if (Array.isArray(data.data) && data.data.length > 0) return data.data[0];
  if (Array.isArray(data.items) && data.items.length > 0) return data.items[0];
  return typeof data === "object" ? data : null;
}

export class StockAdjustmentApi {
  constructor() {
    this.basePath = "/stockadjustment";
  }

  async get_list(offset = 0, limit = 5) {
    const query = `offset=${offset}&limit=${limit}`;
    console.log("\n--- Fetching stock adjustment list ---");
    const data = await sendRequest("GET", this.basePath, null, query);

    if (data && Array.isArray(data.data)) {
      data.data = data.data.slice(offset, offset + limit);
    }

    debugPrintJson(data);
    return data;
  }

  async get_single(docno) {
    const query = `docno=${encodeURIComponent(docno)}`;
    console.log(`\n--- Fetching single stock adjustment '${docno}' ---`);

    try {
      const data = await sendRequest("GET", this.basePath, null, query);
      debugPrintJson(data);
      return data;
    } catch (err) {
      console.error(`Failed to fetch stock adjustment '${docno}':`, err.message);
      throw err;
    }
  }

  async create(payload) {
    console.log("\n--- Creating stock adjustment ---");
    try {
      const data = await sendRequest("POST", this.basePath, payload);
      debugPrintJson(data);
      console.log("Stock adjustment created successfully.");
      return data;
    } catch (err) {
      console.error("Failed to create stock adjustment:", err.response?.data || err.message);
      throw err;
    }
  }

  async update(dockey, payload) {
    console.log(`\n--- Editing stock adjustment dockey: ${dockey} ---`);

    try {
      const existing = await sendRequest("GET", `${this.basePath}/${encodeURIComponent(dockey)}`);
      const record = pickFirstRecord(existing);

      if (!record || typeof record.updatecount === "undefined") {
        throw new Error("Updatecount missing. Unable to update stock adjustment.");
      }

      const finalPayload = {
        ...record,
        ...payload,
        dockey: record.dockey,
        docno: record.docno,
        updatecount: record.updatecount,
      };

      const pathName = `${this.basePath}/${encodeURIComponent(dockey)}`;
      const data = await sendRequest("PUT", pathName, finalPayload);
      debugPrintJson(data);
      console.log("Stock adjustment updated successfully.");
      return data;
    } catch (err) {
      console.error(`Failed to edit stock adjustment ${dockey}:`, err.response?.data || err.message);
      throw err;
    }
  }

  async delete(dockey) {
    const pathName = `${this.basePath}/${encodeURIComponent(dockey)}`;
    console.log(`\n--- Deleting stock adjustment dockey: ${dockey} ---`);
    try {
      const data = await sendRequest("DELETE", pathName);
      debugPrintJson(data);
      console.log("Stock adjustment deleted successfully.");
      return data;
    } catch (err) {
      console.error(
        `Failed to delete stock adjustment ${dockey}:`,
        err.response?.data || err.message
      );
      throw err;
    }
  }
}

const adjustmentApi = new StockAdjustmentApi();

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

async function askJsonPath(prompt, fallbackFile = "") {
  const suffix = fallbackFile ? ` [default: ${fallbackFile}]` : "";
  const answer = (await ask(`${prompt}${suffix}: `)).trim();
  return answer || fallbackFile;
}

async function ST_Adjustment() {
  try {
    console.log("\n================= Stock Adjustment List =================");
    if (await confirm("Proceed to fetch stock adjustment list?")) {
      const list = await adjustmentApi.get_list();
      console.table(JSON.stringify(list, null, 2));
    }

    console.log("\n================= Single Stock Adjustment =================");
    if (await confirm("Do you want to fetch a single stock adjustment?")) {
      const docno = await ask("Enter docno: ");
      const data = await adjustmentApi.get_single(docno.trim());
      console.table(JSON.stringify(data, null, 2));
    }

    console.log("\n================= Create New Stock Adjustment =================");
    if (await confirm("Do you want to create new stock adjustment?")) {
      const payloadPath = await askJsonPath("Enter payload JSON file path");
      if (!payloadPath) {
        console.log("Skipped create stock adjustment (no file path provided)");
      } else {
        const payload = loadJson(payloadPath);
        if (payload) {
          await adjustmentApi.create(payload);
        } else {
          console.log("Skipped create stock adjustment (no valid JSON)");
        }
      }
    }

    console.log("\n================= Edit Stock Adjustment =================");
    if (await confirm("Do you want to edit a stock adjustment?")) {
      const payloadPath = await askJsonPath("Enter edit payload JSON file path");
      const payload = payloadPath ? loadJson(payloadPath) : null;
      if (!payload || !payload.docno) {
        console.log("The file must contain docno.");
      } else {
        const docno = payload.docno.trim();
        console.log(`\n--- Looking for stock adjustment docno '${docno}' ---`);
        const existing = await adjustmentApi.get_single(docno);
        const record = pickFirstRecord(existing);

        if (!record || !record.dockey) {
          console.log(`Stock adjustment docno '${docno}' not found.`);
        } else {
          const finalPayload = {
            ...record,
            ...payload,
            dockey: record.dockey,
            docno: record.docno,
            updatecount: record.updatecount,
          };

          if (payloadPath) {
            fs.writeFileSync(payloadPath, JSON.stringify(finalPayload, null, 2));
          }

          await adjustmentApi.update(record.dockey, finalPayload);
        }
      }
    }

    console.log("\n================= Delete Stock Adjustment =================");
    if (await confirm("Do you want to delete a stock adjustment?")) {
      const docno = await ask("Enter docno to delete: ");
      if (!docno) {
        console.log("Invalid docno, please provide a valid docno.");
      } else {
        const existing = await adjustmentApi.get_single(docno.trim());
        const record = pickFirstRecord(existing);

        if (!record || !record.dockey) {
          console.log(`Stock adjustment with docno '${docno}' not found.`);
        } else {
          await adjustmentApi.delete(record.dockey);
        }
      }
    }
  } catch (err) {
    console.error("\nError:", err.message);
  } finally {
    console.log("--- End of the Script ---");
    rl.close();
  }
}

const currentFile = fileURLToPath(import.meta.url);
const entryFile = path.resolve(process.argv[1]);

if (currentFile === entryFile) {
  ST_Adjustment();
}
