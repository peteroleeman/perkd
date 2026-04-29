const axios = require("axios");
const crypto = require("crypto");
const aws4 = require("aws4");
const dotenv = require("dotenv");
const { getCredentialsForStore } = require("../util/sqlAccountCredentials.js");

dotenv.config();

const useAws4Library = (process.env.USE_AWS4_LIBRARY || "true").toLowerCase() === "true";

function sign(key, msg) {
  return crypto.createHmac("sha256", key).update(msg).digest();
}

function buildQuerystring(urlObj) {
  if (!urlObj.search) return "";
  const params = urlObj.search.substring(1).split("&").filter(Boolean);
  const kvPairs = params.map((p) => p.split("=").map(decodeURIComponent));
  const sorted = kvPairs.sort(([a], [b]) => a.localeCompare(b));
  return sorted
    .map(([k, v = ""]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

function signRequest(method, urlObj, body = "", opts = {}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.substring(0, 8);

  // Credentials from opts or sqlAccountCredentials.json (default)
  const creds = (opts.accessKey && opts.secretKey)
    ? opts
    : { ...getCredentialsForStore(null), ...opts };
  const accessKey = creds.accessKey;
  const secretKey = creds.secretKey;
  const service = creds.service || "execute-api";
  const host = creds.host || "api.sql.my";
  const region = creds.region || "ap-southeast-1";
  const useAws4Lib = opts.useAws4Library !== undefined ? opts.useAws4Library : useAws4Library;

  let canonicalUri = urlObj.pathname;
  if (canonicalUri.endsWith("/*")) {
    canonicalUri = canonicalUri.replace(/\/\*$/, "/");
  }

  const canonicalQuerystring = buildQuerystring(urlObj);
  const payloadHash = crypto.createHash("sha256").update(body).digest("hex");
  const canonicalHeaders = `host:${host}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-date";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  let headers;
  if (useAws4Lib || opts.useAws4) {
    const signed = aws4.sign(
      {
        host,
        method,
        path: canonicalUri + (canonicalQuerystring ? `?${canonicalQuerystring}` : ""),
        service,
        region,
        headers: { "Content-Type": "application/json" },
        body,
      },
      {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      }
    );
    headers = signed.headers;
    headers["x-amz-content-sha256"] = payloadHash;
  } else {
    const kDate = sign("AWS4" + secretKey, dateStamp);
    const kRegion = sign(kDate, region);
    const kService = sign(kRegion, service);
    const kSigning = sign(kService, "aws4_request");
    const signature = crypto
      .createHmac("sha256", kSigning)
      .update(stringToSign)
      .digest("hex");

    const authorizationHeader = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    headers = {
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      Authorization: authorizationHeader,
      "Content-Type": "application/json",
    };
  }

  if (opts.headers) {
    headers = { ...headers, ...opts.headers };
  }

  let symbolString = "";
  for (let i = 0; i < 50; i += 1) {
    symbolString += "=";
  }
  console.log(symbolString, "\n");

  return headers;
}

async function sendRequest(method, path, body = null, query = "", opts = {}) {
  const queryString = query
    ? query.trim().startsWith("?")
      ? query.trim()
      : `?${query.trim()}`
    : "";
  const credsForHost = (opts.accessKey && opts.secretKey) ? opts : { ...getCredentialsForStore(null), ...opts };
  const requestHost = credsForHost.host || opts.host || "api.sql.my";
  const initialUrl = `https://${requestHost}${path}${queryString}`;
  const urlObj = new URL(initialUrl);

  let canonicalPath = urlObj.pathname;
  if (canonicalPath.endsWith("/*")) {
    canonicalPath = canonicalPath.slice(0, -2) + "/";
  }
  urlObj.pathname = canonicalPath;
  const requestUrl = urlObj.toString();

  const bodyString = body ? JSON.stringify(body) : "";
  const headers = signRequest(method, urlObj, bodyString, opts);

  console.log('[API REQUEST] data sent to axios:', {
    method,
    url: requestUrl,
    data: body || undefined,
  });
  if (body && body.sdsdocdetail) {
    console.log('[API REQUEST] sdsdocdetail:', JSON.stringify(body.sdsdocdetail, null, 2));
  }
  if (body && body.sdsknockoff && body.sdsknockoff.length > 0) {
    console.log('[API REQUEST] sdsknockoff:', JSON.stringify(body.sdsknockoff, null, 2));
  }

  const response = await axios({
    method,
    url: requestUrl,
    headers,
    data: body || undefined,
    responseType: opts.responseType || "json",
    timeout: opts.timeout || 20000,
  });

  console.log('[API REQUEST] response:', {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    data: response.data,
  });

  return opts.raw ? response : response.data;
}

function buildQuery(params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

module.exports = {
  sendRequest,
  buildQuery,
};

