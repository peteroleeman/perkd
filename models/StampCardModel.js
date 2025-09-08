'use strict';

const { v4: uuidv4 } = require('uuid');

// Firestore field keys for StampCardModel
const kStampCardModelId = 'id';
const kStampCardModelStoreId = 'storeId';
const kStampCardModelCompanyId = 'companyId';
const kStampCardModelLoyaltyCardId = 'loyaltyCardId';
const kStampCardModelUserId = 'userId';
const kStampCardModelTitle = 'title';
const kStampCardModelDescription = 'description';
const kStampCardModelStampIcon = 'stampIcon';
const kStampCardModelTotalStamps = 'totalStamps';
const kStampCardModelCreatedAt = 'createdAt';
const kStampCardModelExpiresAt = 'expiresAt';
const kStampCardModelCompletedAt = 'completedAt';
const kStampCardModelStatus = 'status';
const kStampCardModelConditionType = 'conditionType';
const kStampCardModelConditionParams = 'conditionParams';
const kStampCardModelStamps = 'stamps';
const kStampCardModelRewardByStamp = 'rewardByStamp';
const kStampCardModelRewardRedeemedByStamp = 'rewardRedeemedByStamp';
const kStampCardModelRelatedOrderIds = 'relatedOrderIds';
const kStampCardModelIsTest = 'isTest';
const kStampCardModelRewardRedeemed = 'rewardRedeemed';

// Supported status values
const kStampCardStatusInProgress = 'in_progress';
const kStampCardStatusCompleted = 'completed';
const kStampCardStatusExpired = 'expired';

// Supported condition types
const kStampCardConditionSpendThreshold = 'spend_threshold';
const kStampCardConditionParamThresholdAmount = 'thresholdAmount';

class StampEntry {
  constructor({ index, earnedAt = null, orderId = null }) {
    this.index = typeof index === 'number' ? index : parseInt(index ?? 0, 10) || 0;
    this.earnedAt = normalizeDate(earnedAt);
    this.orderId = orderId || null;
  }

  static empty(index) {
    return new StampEntry({ index, earnedAt: null, orderId: null });
  }

  toMap() {
    return {
      index: this.index,
      earnedAt: this.earnedAt || null,
      orderId: this.orderId || null,
    };
  }

  static fromMap(map) {
    if (!map) return null;
    const rawIndex = map.index ?? map['index'] ?? 0;
    const rawEarnedAt = map.earnedAt ?? map['earnedAt'] ?? null;
    const rawOrderId = map.orderId ?? map['orderId'] ?? null;
    return new StampEntry({
      index: typeof rawIndex === 'number' ? rawIndex : parseInt(String(rawIndex || '0'), 10) || 0,
      earnedAt: normalizeDate(rawEarnedAt),
      orderId: rawOrderId != null ? String(rawOrderId) : null,
    });
  }
}

class StampCardModel {
  constructor({
    id = '',
    storeId = '',
    companyId = '',
    loyaltyCardId = '',
    userId = '',
    title = '',
    description = '',
    stampIcon = '',
    totalStamps = 0,
    createdAt = new Date(),
    expiresAt = null,
    completedAt = null,
    status = kStampCardStatusInProgress,
    conditionType = kStampCardConditionSpendThreshold,
    conditionParams = {},
    stamps = [],
    rewardsByStamp = {},
    redeemedByStamp = {},
    relatedOrderIds = [],
    isTest = false,
    rewardRedeemed = false,
  } = {}) {
    this.id = id || `SC_${uuidv4()}`;
    this.storeId = storeId;
    this.companyId = companyId;
    this.loyaltyCardId = loyaltyCardId;
    this.userId = userId;
    this.title = title;
    this.description = description;
    this.stampIcon = stampIcon;
    this.totalStamps = toInteger(totalStamps, 0);
    this.createdAt = normalizeDate(createdAt) || new Date();
    this.expiresAt = normalizeDate(expiresAt);
    this.completedAt = normalizeDate(completedAt);
    this.status = status || kStampCardStatusInProgress;
    this.conditionType = conditionType || kStampCardConditionSpendThreshold;
    this.conditionParams = { ...(conditionParams || {}) };
    this.stamps = Array.isArray(stamps)
      ? stamps.map((s, i) => StampEntry.fromMap({ index: s.index ?? i, ...s }))
      : [];
    this.rewardsByStamp = normalizeRewardMap(rewardsByStamp);
    this.redeemedByStamp = normalizeRewardMap(redeemedByStamp);
    this.relatedOrderIds = Array.isArray(relatedOrderIds) ? relatedOrderIds.map(String) : [];
    this.isTest = Boolean(isTest);
    this.rewardRedeemed = Boolean(rewardRedeemed);

    // Ensure stamps length aligns with totalStamps (prefill empties)
    if (this.totalStamps > 0 && this.stamps.length < this.totalStamps) {
      for (let i = this.stamps.length; i < this.totalStamps; i += 1) {
        this.stamps.push(StampEntry.empty(i));
      }
    }
  }

  static new({
    storeId,
    companyId,
    loyaltyCardId = '',
    userId,
    title,
    description = '',
    stampIcon = '',
    totalStamps,
    conditionType = kStampCardConditionSpendThreshold,
    conditionParams = {},
    expiresAt = null,
    isTest = false,
  }) {
    return new StampCardModel({
      id: `SC_${uuidv4()}`,
      storeId,
      companyId,
      loyaltyCardId,
      userId,
      title,
      description,
      stampIcon,
      totalStamps: toInteger(totalStamps, 0),
      createdAt: new Date(),
      expiresAt: normalizeDate(expiresAt),
      completedAt: null,
      status: kStampCardStatusInProgress,
      conditionType,
      conditionParams,
      stamps: Array.from({ length: toInteger(totalStamps, 0) }, (_, i) => StampEntry.empty(i)),
      rewardsByStamp: {},
      redeemedByStamp: {},
      relatedOrderIds: [],
      isTest: Boolean(isTest),
      rewardRedeemed: false,
    });
  }

  static fromDocument(doc) {
    if (!doc || !doc.exists) return null;
    return StampCardModel.fromMap(doc.data());
  }

  static fromMap(data) {
    if (!data) return null;
    const d = data;
    const rawStamps = Array.isArray(d[kStampCardModelStamps]) ? d[kStampCardModelStamps] : [];
    return new StampCardModel({
      id: getString(d, kStampCardModelId, ''),
      storeId: getString(d, kStampCardModelStoreId, ''),
      companyId: getString(d, kStampCardModelCompanyId, ''),
      loyaltyCardId: getString(d, kStampCardModelLoyaltyCardId, ''),
      userId: getString(d, kStampCardModelUserId, ''),
      title: getString(d, kStampCardModelTitle, ''),
      description: getString(d, kStampCardModelDescription, ''),
      stampIcon: getString(d, kStampCardModelStampIcon, ''),
      totalStamps: toInteger(d[kStampCardModelTotalStamps], 0),
      createdAt: normalizeDate(d[kStampCardModelCreatedAt]),
      expiresAt: normalizeDate(d[kStampCardModelExpiresAt]),
      completedAt: normalizeDate(d[kStampCardModelCompletedAt]),
      status: getString(d, kStampCardModelStatus, kStampCardStatusInProgress),
      conditionType: getString(d, kStampCardModelConditionType, kStampCardConditionSpendThreshold),
      conditionParams: { ...(d[kStampCardModelConditionParams] || {}) },
      stamps: rawStamps.map((s, i) => StampEntry.fromMap({ index: s.index ?? i, ...s })),
      rewardsByStamp: normalizeRewardMap(d[kStampCardModelRewardByStamp] || {}),
      redeemedByStamp: normalizeRewardMap(d[kStampCardModelRewardRedeemedByStamp] || {}),
      relatedOrderIds: Array.isArray(d[kStampCardModelRelatedOrderIds]) ? d[kStampCardModelRelatedOrderIds].map(String) : [],
      isTest: Boolean(d[kStampCardModelIsTest] || false),
      rewardRedeemed: Boolean(d[kStampCardModelRewardRedeemed] || false),
    });
  }

  toMap() {
    return {
      [kStampCardModelId]: this.id,
      [kStampCardModelStoreId]: this.storeId,
      [kStampCardModelCompanyId]: this.companyId,
      [kStampCardModelLoyaltyCardId]: this.loyaltyCardId,
      [kStampCardModelUserId]: this.userId,
      [kStampCardModelTitle]: this.title,
      [kStampCardModelDescription]: this.description,
      [kStampCardModelStampIcon]: this.stampIcon,
      [kStampCardModelTotalStamps]: this.totalStamps,
      [kStampCardModelCreatedAt]: this.createdAt || new Date(),
      [kStampCardModelExpiresAt]: this.expiresAt || null,
      [kStampCardModelCompletedAt]: this.completedAt || null,
      [kStampCardModelStatus]: this.status,
      [kStampCardModelConditionType]: this.conditionType,
      [kStampCardModelConditionParams]: this.conditionParams,
      [kStampCardModelStamps]: this.stamps.map((s) => s.toMap()),
      [kStampCardModelRewardByStamp]: normalizeRewardMap(this.rewardsByStamp),
      [kStampCardModelRewardRedeemedByStamp]: normalizeRewardMap(this.redeemedByStamp),
      [kStampCardModelRelatedOrderIds]: this.relatedOrderIds,
      [kStampCardModelIsTest]: this.isTest,
      [kStampCardModelRewardRedeemed]: this.rewardRedeemed,
    };
  }

  // Business helpers
  get earnedCount() {
    return this.stamps.filter((s) => Boolean(s.earnedAt)).length;
  }

  get isCompleted() {
    return this.status === kStampCardStatusCompleted;
  }

  get isExpired() {
    return Boolean(this.expiresAt) && new Date(this.expiresAt).getTime() < Date.now();
  }

  getNextEmptyStampIndex() {
    for (let i = 0; i < this.stamps.length; i += 1) {
      if (!this.stamps[i].earnedAt) return i;
    }
    return -1;
  }

  canEarnFromOrder(orderTotal) {
    if (this.isExpired || this.isCompleted) return false;
    if (this.conditionType === kStampCardConditionSpendThreshold) {
      const threshold = parseFloat(this.conditionParams[kStampCardConditionParamThresholdAmount] ?? 0);
      return Number(orderTotal) >= Number.isFinite(threshold) ? threshold : 0;
    }
    return false;
  }

  earnNextStamp({ orderId = null, atDate = new Date() } = {}) {
    if (this.isExpired || this.isCompleted) return false;
    const idx = this.getNextEmptyStampIndex();
    if (idx < 0) return false;
    this.stamps[idx].earnedAt = normalizeDate(atDate) || new Date();
    this.stamps[idx].orderId = orderId || null;
    if (orderId && !this.relatedOrderIds.includes(orderId)) {
      this.relatedOrderIds.push(orderId);
    }
    if (this.earnedCount >= this.totalStamps) {
      this.status = kStampCardStatusCompleted;
      this.completedAt = new Date();
    }
    return true;
  }

  rewardsForStampNumber(stampNumber) {
    const key = String(stampNumber);
    return Array.isArray(this.rewardsByStamp[key]) ? this.rewardsByStamp[key] : [];
  }

  markRewardsRedeemedForStamp(stampNumber, voucherIds = []) {
    const key = String(stampNumber);
    const already = new Set(this.redeemedByStamp[key] || []);
    voucherIds.forEach((v) => already.add(String(v)));
    this.redeemedByStamp[key] = Array.from(already);
    return this.redeemedByStamp[key];
  }
}

// Helpers
function toInteger(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    try { return value.toDate(); } catch (_) { /* ignore */ }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getString(obj, key, fallback = '') {
  const v = obj[key];
  if (v == null) return fallback;
  return String(v);
}

function normalizeRewardMap(mapLike) {
  const out = {};
  if (!mapLike || typeof mapLike !== 'object') return out;
  Object.keys(mapLike).forEach((k) => {
    const key = String(k);
    const list = mapLike[k];
    if (Array.isArray(list)) {
      out[key] = list.map((v) => String(v));
    }
  });
  return out;
}

module.exports = {
  // Classes
  StampCardModel,
  StampEntry,
  // Constants
  kStampCardModelId,
  kStampCardModelStoreId,
  kStampCardModelCompanyId,
  kStampCardModelLoyaltyCardId,
  kStampCardModelUserId,
  kStampCardModelTitle,
  kStampCardModelDescription,
  kStampCardModelStampIcon,
  kStampCardModelTotalStamps,
  kStampCardModelCreatedAt,
  kStampCardModelExpiresAt,
  kStampCardModelCompletedAt,
  kStampCardModelStatus,
  kStampCardModelConditionType,
  kStampCardModelConditionParams,
  kStampCardModelStamps,
  kStampCardModelRewardByStamp,
  kStampCardModelRewardRedeemedByStamp,
  kStampCardModelRelatedOrderIds,
  kStampCardModelIsTest,
  kStampCardModelRewardRedeemed,
  kStampCardStatusInProgress,
  kStampCardStatusCompleted,
  kStampCardStatusExpired,
  kStampCardConditionSpendThreshold,
  kStampCardConditionParamThresholdAmount,
};


