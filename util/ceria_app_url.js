const CERIA_APP_HOSTS = {
  ceriapay: 'ceriapay.web.app',
  ceriarewards: 'ceriarewards.web.app',
  leaderenergy: 'leaderenergy.web.app',
};

const DEFAULT_CERIA_APP_VERSION = 'ceriarewards';

/**
 * @param {string|undefined|null} raw
 * @param {string} [defaultVersion]
 * @returns {{ ok: true, version: string } | { ok: false, message: string }}
 */
function resolveCeriaAppVersion(raw, defaultVersion = DEFAULT_CERIA_APP_VERSION) {
  const fallback = String(defaultVersion || DEFAULT_CERIA_APP_VERSION).trim().toLowerCase();
  const hasExplicitValue = raw !== undefined && raw !== null && String(raw).trim() !== '';
  const candidate = hasExplicitValue ? String(raw).trim().toLowerCase() : fallback;

  if (!CERIA_APP_HOSTS[candidate]) {
    return {
      ok: false,
      message: `Invalid version "${raw}". Allowed values: ceriapay, ceriarewards, leaderenergy`,
    };
  }

  return { ok: true, version: candidate };
}

/**
 * @param {string} version
 * @returns {string}
 */
function getCeriaAppBaseUrl(version) {
  const host = CERIA_APP_HOSTS[version] || CERIA_APP_HOSTS[DEFAULT_CERIA_APP_VERSION];
  return `https://${host}`;
}

/**
 * @param {string} version
 * @param {string} orderDocId
 * @returns {string}
 */
function getCeriaAppPayUrl(version, orderDocId) {
  return `${getCeriaAppBaseUrl(version)}/#/pay/${orderDocId}`;
}

module.exports = {
  CERIA_APP_HOSTS,
  DEFAULT_CERIA_APP_VERSION,
  resolveCeriaAppVersion,
  getCeriaAppBaseUrl,
  getCeriaAppPayUrl,
};
