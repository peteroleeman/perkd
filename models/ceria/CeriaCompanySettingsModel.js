/**
 * Stored at `ceria_hub/{companyId}/company_data/settings`.
 * Mirrors Foodio Kitchen `CeriaCompanySettingsModel` field keys for Node/Firestore.
 */

const firebase = require('../../db');
const {
  CeriaSubsidyPolicy,
  kCeriaSubsidyPolicyMap,
} = require('./CeriaSubsidyPolicy');

const kCeriaCompanySettingsAddress = 'address';
const kCeriaCompanySettingsLoyaltyCardId = 'loyalty_card_id';

class CeriaCompanySettingsModel {
  /**
   * @param {{ address?: string, loyaltyCardId?: string|null, subsidyPolicy?: CeriaSubsidyPolicy }} p
   */
  constructor({
    address = '',
    loyaltyCardId = null,
    subsidyPolicy = CeriaSubsidyPolicy.defaults,
  } = {}) {
    this.address = address;
    this.loyaltyCardId = loyaltyCardId;
    this.subsidyPolicy =
      subsidyPolicy instanceof CeriaSubsidyPolicy
        ? subsidyPolicy
        : CeriaSubsidyPolicy.fromFirestoreMap(subsidyPolicy);
  }

  static empty() {
    return new CeriaCompanySettingsModel({
      address: '',
      loyaltyCardId: null,
      subsidyPolicy: CeriaSubsidyPolicy.defaults,
    });
  }

  /**
   * @param {import('firebase').firestore.DocumentSnapshot} doc
   */
  static fromDocument(doc) {
    if (!doc.exists) {
      return CeriaCompanySettingsModel.empty();
    }

    const readStr = (key) => {
      try {
        const v = doc.get(key);
        if (v === undefined || v === null) return '';
        return String(v);
      } catch (_) {
        return '';
      }
    };

    const readOpt = (key) => {
      try {
        const v = doc.get(key);
        if (v === undefined || v === null) return null;
        const s = String(v);
        return s === '' ? null : s;
      } catch (_) {
        return null;
      }
    };

    let subsidyPolicy = CeriaSubsidyPolicy.defaults;
    try {
      const raw = doc.get(kCeriaSubsidyPolicyMap);
      subsidyPolicy = CeriaSubsidyPolicy.fromFirestoreMap(raw);
    } catch (_) {
      subsidyPolicy = CeriaSubsidyPolicy.defaults;
    }

    return new CeriaCompanySettingsModel({
      address: readStr(kCeriaCompanySettingsAddress),
      loyaltyCardId: readOpt(kCeriaCompanySettingsLoyaltyCardId),
      subsidyPolicy,
    });
  }

  toMap() {
    return {
      [kCeriaCompanySettingsAddress]: this.address,
      [kCeriaCompanySettingsLoyaltyCardId]: this.loyaltyCardId,
      [kCeriaSubsidyPolicyMap]: this.subsidyPolicy.toFirestoreMap(),
    };
  }

  /**
   * @param {{ address?: string, loyaltyCardId?: string|null, clearLoyaltyCardId?: boolean, subsidyPolicy?: CeriaSubsidyPolicy }} p
   */
  copyWith({
    address,
    loyaltyCardId,
    clearLoyaltyCardId = false,
    subsidyPolicy,
  } = {}) {
    return new CeriaCompanySettingsModel({
      address: address !== undefined ? address : this.address,
      loyaltyCardId: clearLoyaltyCardId
        ? null
        : loyaltyCardId !== undefined
          ? loyaltyCardId
          : this.loyaltyCardId,
      subsidyPolicy:
        subsidyPolicy !== undefined ? subsidyPolicy : this.subsidyPolicy,
    });
  }

  /**
   * @param {string} companyId
   * @param {import('firebase').firestore.Firestore} [firestore]
   */
  static settingsRef(companyId, firestore = firebase.firestore()) {
    return firestore
      .collection('ceria_hub')
      .doc(companyId)
      .collection('company_data')
      .doc('settings');
  }
}

module.exports = {
  CeriaCompanySettingsModel,
  kCeriaCompanySettingsAddress,
  kCeriaCompanySettingsLoyaltyCardId,
  kCeriaSubsidyPolicyMap,
};
