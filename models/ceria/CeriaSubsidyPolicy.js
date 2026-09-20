/**
 * Firestore map under `subsidy_policy` on
 * `ceria_hub/{companyId}/company_data/settings`.
 * Mirrors Foodio Kitchen `CeriaSubsidyPolicy` / enums.
 */

const kCeriaSubsidyPolicyMap = 'subsidy_policy';
const kCeriaSubsidyMonthlyAllowanceRm = 'monthly_allowance_rm';
/** Firestore key from Kitchen; maps to `corporateDailyLimit` (0 = no limit). */
const kCeriaSubsidyCorporateDailyLimitRm = 'daily_limit_rm';
const kCeriaSubsidyCarryForwardMaxRm = 'carry_forward_max_rm';
const kCeriaSubsidyUsageAvailability = 'usage_availability';
const kCeriaSubsidyExpiryPolicy = 'expiry_policy';

/** @typedef {{ firestoreValue: string }} CeriaSubsidyUsageAvailabilityEnum */
const CeriaSubsidyUsageAvailability = {
  weekdayOnly: { firestoreValue: 'weekday_only' },
  fullWeek: { firestoreValue: 'full_week' },
};

/**
 * @param {string | null | undefined} raw
 * @returns {CeriaSubsidyUsageAvailabilityEnum}
 */
function ceriaSubsidyUsageAvailabilityFromFirestore(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  for (const key of Object.keys(CeriaSubsidyUsageAvailability)) {
    const v = CeriaSubsidyUsageAvailability[key];
    if (v.firestoreValue === s) return v;
  }
  return CeriaSubsidyUsageAvailability.weekdayOnly;
}

/** @typedef {{ firestoreValue: string }} CeriaSubsidyExpiryPolicyEnum */
const CeriaSubsidyExpiryPolicy = {
  monthlyReset: { firestoreValue: 'monthly_reset' },
};

/**
 * @param {string | null | undefined} raw
 * @returns {CeriaSubsidyExpiryPolicyEnum}
 */
function ceriaSubsidyExpiryPolicyFromFirestore(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  for (const key of Object.keys(CeriaSubsidyExpiryPolicy)) {
    const v = CeriaSubsidyExpiryPolicy[key];
    if (v.firestoreValue === s) return v;
  }
  return CeriaSubsidyExpiryPolicy.monthlyReset;
}

/**
 * @param {*} v
 * @returns {number}
 */
function readDouble(v) {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {*} v
 * @returns {string | null}
 */
function readStr(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

class CeriaSubsidyPolicy {
  /**
   * @param {{
   *   monthlyAllowanceRm?: number,
   *   corporateDailyLimit?: number,
   *   carryForwardMaxRm?: number,
   *   usageAvailability?: CeriaSubsidyUsageAvailabilityEnum,
   *   expiryPolicy?: CeriaSubsidyExpiryPolicyEnum,
   * }} [p]
   */
  constructor({
    monthlyAllowanceRm = 0,
    corporateDailyLimit = 0,
    carryForwardMaxRm = 0,
    usageAvailability = CeriaSubsidyUsageAvailability.weekdayOnly,
    expiryPolicy = CeriaSubsidyExpiryPolicy.monthlyReset,
  } = {}) {
    this.monthlyAllowanceRm = readDouble(monthlyAllowanceRm);
    /** Maps to company_credit.corporate_daily_limit; 0 means no limit. */
    this.corporateDailyLimit = readDouble(corporateDailyLimit);
    this.carryForwardMaxRm = readDouble(carryForwardMaxRm);
    this.usageAvailability = usageAvailability;
    this.expiryPolicy = expiryPolicy;
  }

  static get defaults() {
    if (!CeriaSubsidyPolicy._defaults) {
      CeriaSubsidyPolicy._defaults = Object.freeze(new CeriaSubsidyPolicy());
    }
    return CeriaSubsidyPolicy._defaults;
  }

  /**
   * Before subsidy deduction: reject Saturday/Sunday when weekday_only.
   * @param {Date | number | string} local calendar instant in the intended local zone (caller supplies correct wall time).
   * @returns {boolean}
   */
  isUsageAllowedOn(local) {
    const d = local instanceof Date ? local : new Date(local);
    if (Number.isNaN(d.getTime())) return false;
    if (this.usageAvailability === CeriaSubsidyUsageAvailability.fullWeek) {
      return true;
    }
    const w = d.getDay();
    return w >= 1 && w <= 5;
  }

  /**
   * @param {Object | null | undefined} raw
   * @returns {CeriaSubsidyPolicy}
   */
  static fromFirestoreMap(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return CeriaSubsidyPolicy.defaults;
    }

    return new CeriaSubsidyPolicy({
      monthlyAllowanceRm: readDouble(raw[kCeriaSubsidyMonthlyAllowanceRm]),
      corporateDailyLimit: readDouble(raw[kCeriaSubsidyCorporateDailyLimitRm]),
      carryForwardMaxRm: readDouble(raw[kCeriaSubsidyCarryForwardMaxRm]),
      usageAvailability: ceriaSubsidyUsageAvailabilityFromFirestore(
        readStr(raw[kCeriaSubsidyUsageAvailability]),
      ),
      expiryPolicy: ceriaSubsidyExpiryPolicyFromFirestore(
        readStr(raw[kCeriaSubsidyExpiryPolicy]),
      ),
    });
  }

  toFirestoreMap() {
    return {
      [kCeriaSubsidyMonthlyAllowanceRm]: this.monthlyAllowanceRm,
      [kCeriaSubsidyCorporateDailyLimitRm]: this.corporateDailyLimit,
      [kCeriaSubsidyCarryForwardMaxRm]: this.carryForwardMaxRm,
      [kCeriaSubsidyUsageAvailability]: this.usageAvailability.firestoreValue,
      [kCeriaSubsidyExpiryPolicy]: this.expiryPolicy.firestoreValue,
    };
  }

  /**
   * @param {{
   *   monthlyAllowanceRm?: number,
   *   corporateDailyLimit?: number,
   *   carryForwardMaxRm?: number,
   *   usageAvailability?: CeriaSubsidyUsageAvailabilityEnum,
   *   expiryPolicy?: CeriaSubsidyExpiryPolicyEnum,
   * }} [p]
   */
  copyWith({
    monthlyAllowanceRm,
    corporateDailyLimit,
    carryForwardMaxRm,
    usageAvailability,
    expiryPolicy,
  } = {}) {
    return new CeriaSubsidyPolicy({
      monthlyAllowanceRm:
        monthlyAllowanceRm !== undefined
          ? monthlyAllowanceRm
          : this.monthlyAllowanceRm,
      corporateDailyLimit:
        corporateDailyLimit !== undefined
          ? corporateDailyLimit
          : this.corporateDailyLimit,
      carryForwardMaxRm:
        carryForwardMaxRm !== undefined
          ? carryForwardMaxRm
          : this.carryForwardMaxRm,
      usageAvailability:
        usageAvailability !== undefined
          ? usageAvailability
          : this.usageAvailability,
      expiryPolicy:
        expiryPolicy !== undefined ? expiryPolicy : this.expiryPolicy,
    });
  }
}

module.exports = {
  CeriaSubsidyPolicy,
  CeriaSubsidyUsageAvailability,
  CeriaSubsidyExpiryPolicy,
  ceriaSubsidyUsageAvailabilityFromFirestore,
  ceriaSubsidyExpiryPolicyFromFirestore,
  kCeriaSubsidyPolicyMap,
  kCeriaSubsidyMonthlyAllowanceRm,
  kCeriaSubsidyCorporateDailyLimitRm,
  kCeriaSubsidyCarryForwardMaxRm,
  kCeriaSubsidyUsageAvailability,
  kCeriaSubsidyExpiryPolicy,
};
