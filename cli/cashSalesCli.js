// Cash Sales - Get List, PDF, Add, Update & Delete Function
// Command: npm run cash-sales (or node src/cashSalesCli.js)
import { sendRequest } from "../sample/api/APICommon.js"; // base client
import fs from "fs";
import readline from "readline";

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

export class CashSalesApi {
  constructor() {
    this.basePath = "/cashsales"; // base path
  }

  /**
   * Get cash sales list with pagination (default: offset=0, limit=5)
   */
  async get_list(offset = 0, limit = 5) {
    const path = this.basePath;
    const query = `offset=${offset}&limit=${limit}`;
    console.log("\n--- Fetching cash sales list (offset = 0, limit = 5) ---");
    const data = await sendRequest("GET", path, null, query);

    // Force limit client-side if API ignore
    if (data && Array.isArray(data.data)) {
      data.data = data.data.slice(offset, offset + limit);
    }

    debugPrintJson(data);
    return data;
  }

  /**
   * Get a single cash sale by docno
   */
  async get_single(docno) {
    const path = this.basePath;
    const query = `docno=${encodeURIComponent(docno)}`;
    console.log(`\n--- Fetching single cash sale '${docno}' ---`);

    try {
      const data = await sendRequest("GET", path, null, query);
      debugPrintJson(data);
      return data;
    } catch (err) {
      console.error(`Failed to fetch cash sale '${docno}':`, err.message);
      throw err;
    }
  }

  /**
   * Print a cash sale as PDF
   *
   * Args:
   *    docno: document number of the cash sale
   *    reportName: name of the report want to be print (E.g. Cash Sales)
   *    savePath: output folder (E.g. ./PDF)
   */
  async print(docno, reportName = "Cash Sales", savePath = "./PDF") {
    console.log(`\n--- Printing cash sale '${docno}' to PDF ---`);

    // Step 1: Find dockey for the given docno
    const existing = await this.get_single(docno);
    if (!existing || !Array.isArray(existing.data) || existing.data.length === 0) {
      throw new Error(`Cash sale '${docno}' not found`);
    }

    const record = existing.data[0];
    const dockey = record.dockey;
    const path = `${this.basePath}/${dockey}`;

    const pdfData = await sendRequest("GET", path, null, "", {
      headers: { "Content-Type": `application/pdf;template=${reportName}` },
      responseType: "arraybuffer",
      raw: true,
    });

    const fullSavePath = `${savePath}/Cash_Sales_${docno}.pdf`;
    fs.mkdirSync(savePath, { recursive: true });
    fs.writeFileSync(fullSavePath, pdfData);
    console.log(`PDF saved: ${fullSavePath}`);
  }

  /**
   * Create a new cash sale
   */
  async create(payload) {
    console.log("\n--- Creating cash sale ---");
    try {
      const data = await sendRequest("POST", this.basePath, payload);
      debugPrintJson(data);
      return data;
    } catch (err) {
      console.error("Failed to create cash sale:", err.message);
      throw err;
    }
  }

  /**
   * Edit an existing cash sale
   */
  async update(dockey, payload) {
    console.log(`\n--- Editing cash sale dockey: ${dockey} ---`);

    try {
      // Step 1: Fetch existing record to get updatecount
      const query = `dockey=${encodeURIComponent(dockey)}`;
      const existing = await sendRequest("GET", this.basePath, null, query);

      console.log("Existing record:", JSON.stringify(existing, null, 2));

      const record =
        (existing.data && existing.data[0]) ||
        (existing.items && existing.items[0]) ||
        existing;

      if (!record || typeof record.updatecount === "undefined") {
        throw new Error("Updatecount missing. Try fetching via list API with dockey filter.");
      }

      // Step 2: Merge updatecount into payload
      const finalPayload = {
        ...payload,
        updatecount: record.updatecount,
      };

      // Step 3: Send PUT request with updatecount
      const path = `${this.basePath}/${dockey}`;
      const data = await sendRequest("PUT", path, finalPayload);
      debugPrintJson(data);
      console.log("Cash sale updated successfully.");
      return data;
    } catch (err) {
      console.error(`Failed to edit cash sale ${dockey}:`, err.message);
      throw err;
    }
  }

  /**
   * Delete a cash sale by docno
   */
  async delete(dockey) {
    const path = `${this.basePath}/${dockey}`;
    console.log(`\n--- Deleting cash sale dockey: ${dockey} ---`);
    try {
      const data = await sendRequest("DELETE", path);
      debugPrintJson(data);
      return data;
    } catch (err) {
      console.error(`Failed to delete cash sale ${dockey}:`, err.message);
      throw err;
    }
  }
}

const csApi = new CashSalesApi();
const JSON_FOLDER = "./JSON/"; // your json folder file path, if same path as node.js, leave it blank

// Readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
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

async function SL_CS() {
  try {
    // Example: Get cash sales list
    console.log("\n================= Cash Sales List =================");
    if (await confirm("Proceed to fetch cash sales list?")) {
      const list = await csApi.get_list();
      console.table(JSON.stringify(list, null, 2));
    }

    // Example: Get single cash sale
    console.log("\n================= Single Cash Sale =================");
    if (await confirm("Do you want to fetch a single cash sale?")) {
      const docno = await ask("Enter docno: ");
      const list = await csApi.get_single(docno.trim());
      console.table(JSON.stringify(list, null, 2));
    }

    // Example: Print cash sale PDF
    console.log("\n================= Print Cash Sale =================");
    if (await confirm("Do you want to print a cash sale to PDF?")) {
      const docno = await ask("Enter docno to print: ");
      await csApi.print(docno.trim());
    }

    // Example: Create new cash sale
    console.log("\n================= Create New Cash Sale =================");
    if (await confirm("Do you want to create new cash sale?")) {
      const payload = loadJson(JSON_FOLDER + "SL_CS-New.json"); // Make sure file name is correct
      if (payload) {
        await csApi.create(payload);
      } else {
        console.log("Skipped create cash sale (no valid JSON)");
      }
    }

    // Example: Edit existing cash sale
    console.log("\n================= Edit Cash Sale =================");
    if (await confirm("Do you want to edit a cash sale?")) {
      const payload = loadJson(JSON_FOLDER + "SL_CS-Edit.json"); // Make sure the file name is correct
      if (!payload || !payload.docno) {
        console.log("The file must contain Docno.");
      } else {
        const docno = payload.docno.trim();
        console.log(`\n--- Looking for cash sale docno '${docno}' ---`);

        // Fetching record by docno
        const existing = await csApi.get_single(docno);
        if (!existing || !Array.isArray(existing.data) || existing.data.length === 0) {
          console.log(`Cash sale docno '${docno}' not found.`);
        } else {
          const record = existing.data[0];
          const dockey = record.dockey;
          const updatecount = record.updatecount;

          console.log(`Found dockey '${dockey}', updatecount '${updatecount}'`);

          // Merge fields into payload
          const finalPayload = {
            ...payload,
            dockey,
            updatecount,
          };

          // Write back updated JSON (so user can see updatecount added)
          fs.writeFileSync(
            JSON_FOLDER + "SL_CS-Edit.json", // Make sure file name is correct
            JSON.stringify(finalPayload, null, 2)
          );

          await csApi.update(dockey, finalPayload);
        }
      }
    }

    // Example: Delete existing cash sale
    console.log("\n================= Delete Cash Sale =================");
    if (await confirm("Do you want to delete a cash sale?")) {
      const docno = await ask("Enter docno to delete: ");
      if (!docno) {
        console.log("Invalid docno, please provide a valid docno.");
      } else {
        const existing = await csApi.get_single(docno);
        if (!existing || !Array.isArray(existing.data) || existing.data.length === 0) {
          console.log(`Cash sale with docno '${docno}' not found.`);
        } else {
          const record = existing.data[0];
          const dockey = record.dockey;

          console.log(`--- Deleting cash sale '${docno}' ---`);
          await csApi.delete(dockey);
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

import { fileURLToPath } from "url";
import path from "path";

const currentFile = fileURLToPath(import.meta.url);
const entryFile = path.resolve(process.argv[1]);

if (currentFile === entryFile) {
  SL_CS();
}
