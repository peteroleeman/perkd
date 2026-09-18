const url = require('url');

const VERSION_MAP = {
  ceriapay: 'https://ceriapay.web.app',
  ceriarewards: 'https://ceriarewards.web.app',
  leaderenergy: 'https://leaderenergy.web.app',
  ab3b2: 'https://foodio-online-ab3b2.web.app',
  code8: 'https://foodio-online-code8.web.app',
  cloud9: 'https://foodio-online-cloud9.web.app',
  best10: 'https://foodio-online-best10.web.app',
  market: 'https://foodio-market.web.app',
};

/**
 * Gkash payment forms POST body field `version` (e.g. 1.5.5) is the Gkash API version,
 * not the Flutter app host code on returnurl query `version=ceriarewards`.
 * @param {string|undefined} raw
 * @returns {string|undefined} normalized app host code if valid
 */
function normalizeAppHostVersion(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  const s = String(raw).toLowerCase().trim();
  if (!s || /^\d+\.\d/.test(s)) {
    return undefined;
  }
  return VERSION_MAP[s] ? s : undefined;
}

/**
 * Resolve Flutter web host from explicit version, ?version= on the return URL, or body.
 * Mirrors GKashRouter.getVersionBaseUrl behavior with process.env.APP_URL override.
 * @param {import('express').Request} req
 * @param {boolean} isBeta
 * @param {string|undefined} [explicitVersion] version from route handler argument
 * @returns {string} origin without trailing slash
 */
function getBaseUrlFromRequest(req, isBeta, explicitVersion) {
  const parsed = url.parse(req.url || '', true);
  const version =
    normalizeAppHostVersion(explicitVersion) ||
    normalizeAppHostVersion(parsed.query && parsed.query.version) ||
    normalizeAppHostVersion(req.body && req.body.version) ||
    undefined;

  if (version) {
    const base = VERSION_MAP[version];
    if (base) {
      return base.replace(/\/$/, '');
    }
  }

  const envUrl = process.env.APP_URL && String(process.env.APP_URL).trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  if (isBeta) {
    return 'https://foodio-online-cloud9.web.app';
  }
  return 'https://foodio-market.web.app';
}

module.exports = { getBaseUrlFromRequest, normalizeAppHostVersion, VERSION_MAP };
