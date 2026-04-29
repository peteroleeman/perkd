// Sales Invoice CLI - Get List, Add, Update & Delete Function
// Command: node cli/salesInvoiceCli.js
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

class SalesInvoiceApi {
  constructor() {
    this.basePath = "/salesinvoice"; // base path
  }

  /**
   * Get sales invoice list with pagination (default: offset=0, limit=5)
   */
  async get_list(offset = 0, limit = 5) {
    const invoicePath = this.basePath;
    const query = `offset=${offset}&limit=${limit}`;
    console.log("\n--- Fetching sales invoice list (offset = 0, limit = 5) ---");
    const data = await sendRequest("GET", invoicePath, null, query);

    // Force limit client-side if API ignore
    if (data && Array.isArray(data.data)) {
      data.data = data.data.slice(offset, offset + limit);
    }

    debugPrintJson(data);
    return data;
  }

  /**
   * Get a single sales invoice by docno
   */
  async get_single(docno) {
    const invoicePath = this.basePath;
    const query = `docno=${encodeURIComponent(docno)}`;
    console.log(`\n--- Fetching single sales invoice '${docno}' ---`);

    try {
      const data = await sendRequest("GET", invoicePath, null, query);
      debugPrintJson(data);
      return data;
    } catch (err) {
      console.error(`Failed to fetch invoice '${docno}':`, err.message);
      throw err;
    }
  }

  /**
   * Print a sales invoice as PDF
   *
   * Args:
   *    docno: document number of the sales invoice
   *    reportName: name of the report want to be print (E.g. Sales Invoice 8 (SST 1))
   *    savePath: output folder (E.g. ./PDF)
   */
  async print(docno, reportName = "Sales Invoice 8 (SST 1)", savePath = "./PDF") {
    console.log(`\n--- Printing sales invoice '${docno}' to PDF ---`);

    // Step 1: Find dockey for the given docno
    const existing = await this.get_single(docno);
    if (!existing || !Array.isArray(existing.data) || existing.data.length === 0) {
      throw new Error(`Invoice '${docno}' not found`);
    }

    const record = existing.data[0];
    const dockey = record.dockey;
    const invoicePath = `${this.basePath}/${dockey}`;

    const pdfData = await sendRequest("GET", invoicePath, null, "", {
      headers: { "Content-Type": `application/pdf;template=${reportName}` },
      responseType: "arraybuffer",
      raw: true,
    });

    const fullSavePath = `${savePath}/Sales_Invoice_${docno}.pdf`;
    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath, { recursive: true });
    }
    fs.writeFileSync(fullSavePath, pdfData);
    console.log(`PDF saved: ${fullSavePath}`);
  }

  /**
   * Create a new sales invoice
   */
  async create(payload) {
    console.log("\n--- Creating sales invoice ---");
    try {
      const data = await sendRequest("POST", this.basePath, payload);
      debugPrintJson(data);
      return data;
    } catch (err) {
      console.error("Failed to create invoice:", err.message);
      throw err;
    }
  }

  /**
   * Edit an existing sales invoice
   */
  async update(dockey, payload) {
    console.log(`\n--- Editing sales invoice dockey: ${dockey} ---`);

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
      const invoicePath = `${this.basePath}/${dockey}`;
      const data = await sendRequest("PUT", invoicePath, finalPayload);
      debugPrintJson(data);
      console.log("Invoice updated successfully.");
      return data;
    } catch (err) {
      console.error(`Failed to edit invoice ${dockey}:`, err.message);
      throw err;
    }
  }

  /**
   * Delete a sales invoice by docno
   */
  async delete(dockey) {
    const invoicePath = `${this.basePath}/${dockey}`;
    console.log(`\n--- Deleting sales invoice dockey: ${dockey} ---`);
    try {
      const data = await sendRequest("DELETE", invoicePath);
      debugPrintJson(data);
      return data;
    } catch (err) {
      console.error(`Failed to delete invoice ${dockey}:`, err.message);
      throw err;
    }
  }
}

const ivApi = new SalesInvoiceApi();
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

async function SL_IV() {
  try {
    // Example: Get invoice list
    console.log("\n================= Invoice List =================");
    if (await confirm("Proceed to fetch sales invoice list?")) {
      const list = await ivApi.get_list();
      console.table(JSON.stringify(list, null, 2));
    }

    // Example: Get single invoice
    console.log("\n================= Single Invoice =================");
    if (await confirm("Do you want to fetch a single invoice?")) {
      const docno = await ask("Enter docno: ");
      const list = await ivApi.get_single(docno.trim());
      console.table(JSON.stringify(list, null, 2));
    }

    // Example: Print invoice PDF
    console.log("\n================= Print Invoice =================");
    if (await confirm("Do you want to print an invoice to PDF?")) {
      const docno = await ask("Enter docno to print: ");
      await ivApi.print(docno.trim());
    }

    // Example: Create new sales invoice
    console.log("\n================= Create New Invoice =================");
    if (await confirm("Do you want to create new invoice?")) {
      const payload = loadJson(JSON_FOLDER + "SL_IV-New.json"); // Make sure file name is correct
      if (payload) {
        await ivApi.create(payload);
      } else {
        console.log("Skipped create invoice (no valid JSON)");
      }
    }

    // Example: Edit existing sales invoice
    console.log("\n================= Edit Invoice =================");
    if (await confirm("Do you want to edit an invoice?")) {
      const payload = loadJson(JSON_FOLDER + "SL_IV-Edit.json"); // Make sure the file name is correct
      if (!payload || !payload.docno) {
        console.log("The file must contain Docno.");
      } else {
        const docno = payload.docno.trim();
        console.log(`\n--- Looking for invoice docno '${docno}' ---`);

        // Fetching record by docno
        const existing = await ivApi.get_single(docno);
        if (
          !existing ||
          !Array.isArray(existing.data) ||
          existing.data.length === 0
        ) {
          console.log(`Invoice docno '${docno}' not found.`);
        } else {
          const record = existing.data[0];
          const dockey = record.dockey;
          const updatecount = record.updatecount;

          console.log(`Found dockey '${dockey}', updatecount '${updatecount}'`);

          //Merge fields into payload
          const finalPayload = {
            ...payload,
            dockey,
            updatecount,
          };

          // Write back updated JSON (so user can see updatecount added)
          fs.writeFileSync(
            JSON_FOLDER + "SL_IV-Edit.json", // Make sure file name is correct
            JSON.stringify(finalPayload, null, 2)
          );

          await ivApi.update(dockey, finalPayload);
        }
      }
    }

    // Example: Delete existing sales invoice
    console.log("\n================= Delete Invoice =================");
    if (await confirm("Do you want to delete an invoice?")) {
      const docno = await ask("Enter docno to delete: ");
      if (!docno) {
        console.log(`Invalid docno, please provide a valid docno.`);
      } else {
        const existing = await ivApi.get_single(docno);
        if (
          !existing ||
          !Array.isArray(existing.data) ||
          existing.data.length === 0
        ) {
          console.log(`Invoice with docno '${docno}' not found.`);
        } else {
          const record = existing.data[0];
          const dockey = record.dockey;

          console.log(`--- Deleting invoice '${docno}' ---`);
          await ivApi.delete(dockey);
        }
      }
    }
  } catch (err) {
    console.error("\nError:", err.message);
  } finally {
    console.log(`--- End of the Script ---`);
    rl.close();
  }
}

const currentFile = __filename;
const entryFile = path.resolve(process.argv[1]);

if (currentFile === entryFile) {
  SL_IV();
}

module.exports = { SalesInvoiceApi };

