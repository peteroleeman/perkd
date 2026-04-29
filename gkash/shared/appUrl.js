const url = require('url');

/**
 * Resolve Flutter web host from ?version= on the return URL or body, then env default.
 * Mirrors GKashRouter.getVersionBaseUrl behavior with process.env.APP_URL override.
 * @param {import('express').Request} req
 * @param {boolean} isBeta
 * @returns {string} origin without trailing slash
 */
function getBaseUrlFromRequest(req, isBeta) {
  const parsed = url.parse(req.url || '', true);
  const version =
    (parsed.query && parsed.query.version) ||
    (req.body && req.body.version) ||
    undefined;

  if (version) {
    const versionMap = {
      ab3b2: 'https://foodio-online-ab3b2.web.app',
      code8: 'https://foodio-online-code8.web.app',
      cloud9: 'https://foodio-online-cloud9.web.app',
      best10: 'https://foodio-online-best10.web.app',
      market: 'https://foodio-market.web.app',
    };
    const base = versionMap[String(version).toLowerCase()];
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
  return 'https://foodio-online-best10.web.app';
}

module.exports = { getBaseUrlFromRequest };
