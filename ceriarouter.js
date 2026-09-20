const express = require('express');
const firebaseApp = require('./db');
const firebase = require('firebase');
const fireStore = firebaseApp.firestore();
const FieldValue = firebase.firestore.FieldValue;
const { buildEinvoiceOrderFromBody } = require('./util/build_einvoice_order');
const {
  encryptEmployeeId,
  decryptEmployeeId,
  extractCompanyIdFromBody,
  extractPlainEmployeeIdFromBody,
  extractEncryptedEmployeeIdFromBody,
  resolveEmployeeIdFromEncryptedBody,
} = require('./util/ceria_employee_crypto');
const {
  CeriaCompanySettingsModel,
} = require('./models/ceria/CeriaCompanySettingsModel');

const NEST = {
  self: 'self',
  corporate_balance: 'corporate_balance',
  corporate_daily_limit: 'corporate_daily_limit',
  corporate_spent_today: 'corporate_spent_today',
  corporate_day_key: 'corporate_day_key',
  corporate_allowance_renewed_at: 'corporate_allowance_renewed_at',
  corporate_daily_limit_renewed_at: 'corporate_daily_limit_renewed_at',
  daily_limit_overridden: 'daily_limit_overridden',
};

function readNum(v, fallback = 0) {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function roundRm(x) {
  return Math.round(readNum(x) * 100) / 100;
}

const MAX_BATCH_OPS = 450;

const BALANCE_ADJUSTMENT_FIELDS = {
  employee_user_id: 'employee_user_id',
  employee_id: 'employee_id',
  employee_name: 'employee_name',
  delta_rm: 'delta_rm',
  balance_before_rm: 'balance_before_rm',
  balance_after_rm: 'balance_after_rm',
  reason: 'reason',
  adjusted_at: 'adjusted_at',
  adjusted_by: 'adjusted_by',
  source: 'source',
  period_start: 'period_start',
  period_end: 'period_end',
  instruction_id: 'instruction_id',
};

const BALANCE_ADJUSTMENT_SOURCES = {
  corporateTopup: 'ceria_corporate_topup',
  manualCredits: 'ceria_manual_credits',
  hubAdmin: 'ceria_hub_admin',
  selfTopup: 'ceria_self_topup',
  proratedSubsidy: 'ceria_prorated_subsidy',
};

function balanceAdjustmentsCol(companyId) {
  return fireStore
    .collection('ceria_hub')
    .doc(companyId)
    .collection('balance_adjustments');
}

function buildBalanceAdjustmentData({
  employeeUserId,
  employeeId,
  employeeName,
  balanceBeforeRm,
  balanceAfterRm,
  source,
  adjustedBy,
  reason,
  periodStart,
  periodEnd,
  instructionId,
}) {
  const before = roundRm(balanceBeforeRm);
  const after = roundRm(balanceAfterRm);
  const deltaRm = roundRm(after - before);
  if (deltaRm === 0) return null;

  const data = {
    [BALANCE_ADJUSTMENT_FIELDS.employee_user_id]: employeeUserId,
    [BALANCE_ADJUSTMENT_FIELDS.employee_id]: employeeId || '',
    [BALANCE_ADJUSTMENT_FIELDS.employee_name]: employeeName || '',
    [BALANCE_ADJUSTMENT_FIELDS.delta_rm]: deltaRm,
    [BALANCE_ADJUSTMENT_FIELDS.balance_before_rm]: before,
    [BALANCE_ADJUSTMENT_FIELDS.balance_after_rm]: after,
    [BALANCE_ADJUSTMENT_FIELDS.reason]: reason || '',
    [BALANCE_ADJUSTMENT_FIELDS.adjusted_at]: FieldValue.serverTimestamp(),
    [BALANCE_ADJUSTMENT_FIELDS.adjusted_by]: adjustedBy,
    [BALANCE_ADJUSTMENT_FIELDS.source]: source,
  };
  if (periodStart) {
    data[BALANCE_ADJUSTMENT_FIELDS.period_start] = periodStart;
  }
  if (periodEnd) {
    data[BALANCE_ADJUSTMENT_FIELDS.period_end] = periodEnd;
  }
  if (instructionId) {
    data[BALANCE_ADJUSTMENT_FIELDS.instruction_id] = instructionId;
  }
  return data;
}

/**
 * Write a balance_adjustments doc directly (Ceria Corporate Report ledger).
 */
async function writeBalanceAdjustment({
  companyId,
  employeeUserId,
  employeeId,
  employeeName,
  balanceBeforeRm,
  balanceAfterRm,
  source,
  adjustedBy,
  reason,
}) {
  const data = buildBalanceAdjustmentData({
    employeeUserId,
    employeeId,
    employeeName,
    balanceBeforeRm,
    balanceAfterRm,
    source,
    adjustedBy,
    reason,
  });
  if (!data) return;

  const ref = balanceAdjustmentsCol(companyId).doc();
  await ref.set(data);
}

function queueBalanceAdjustmentOnTransaction(transaction, {
  companyId,
  employeeUserId,
  employeeId,
  employeeName,
  balanceBeforeRm,
  balanceAfterRm,
  source,
  adjustedBy,
  reason,
}) {
  const data = buildBalanceAdjustmentData({
    employeeUserId,
    employeeId,
    employeeName,
    balanceBeforeRm,
    balanceAfterRm,
    source,
    adjustedBy,
    reason,
  });
  if (!data) return;

  const ref = balanceAdjustmentsCol(companyId).doc();
  transaction.set(ref, data);
}

/**
 * Queue a balance_adjustments doc on the current batch (Ceria Corporate Report ledger).
 */
function queueBalanceAdjustment(batch, {
  companyId,
  employeeUserId,
  employeeId,
  employeeName,
  balanceBeforeRm,
  balanceAfterRm,
  source,
  adjustedBy,
  reason,
  periodStart,
  periodEnd,
  instructionId,
}) {
  const data = buildBalanceAdjustmentData({
    employeeUserId,
    employeeId,
    employeeName,
    balanceBeforeRm,
    balanceAfterRm,
    source,
    adjustedBy,
    reason,
    periodStart,
    periodEnd,
    instructionId,
  });
  if (!data) return;

  const ref = balanceAdjustmentsCol(companyId).doc();
  batch.set(ref, data);
}

/**
 * Atomically increment company self credits and dual-write user + ceria_hub employee.
 * Personal top-up is audited by the Paid store order — not balance_adjustments.
 */
async function recordSelfTopupLedgerEntry({
  companyId,
  userDocId,
  creditsToAdd,
  adjustedBy = 'UNKNOWN',
  reason = '',
  orderId = '',
}) {
  const cid = String(companyId || '').trim();
  const uid = String(userDocId || '').trim();
  const amount = roundRm(creditsToAdd);
  if (!cid || !uid || amount <= 0) {
    throw new Error('recordSelfTopupLedgerEntry: companyId, userDocId, and creditsToAdd are required');
  }

  const userRef = fireStore.collection('user').doc(uid);
  const empRef = fireStore
    .collection('ceria_hub')
    .doc(cid)
    .collection('employee')
    .doc(uid);
  const selfPath = `company_credit.${cid}.${NEST.self}`;
  const dayKey = todayDayKey();

  await fireStore.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    const empSnap = await transaction.get(empRef);

    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const empData = empSnap.exists ? empSnap.data() || {} : {};
    const empCc = empData.company_credit && empData.company_credit[cid];
    const userCc = userData.company_credit && userData.company_credit[cid];
    const wallet = mergeWalletForCompany(empCc, userCc, dayKey);
    const afterSelf = roundRm(roundRm(wallet[NEST.self]) + amount);
    const syncedSelfPayload = {
      ...resolveExistingCcForTopup(empCc, userCc, dayKey),
      [NEST.self]: afterSelf,
    };

    if (userSnap.exists) {
      transaction.update(userRef, { [selfPath]: FieldValue.increment(amount) });
    } else {
      transaction.set(
        userRef,
        buildNestedCompanyCreditObject(cid, syncedSelfPayload),
        { merge: true },
      );
    }

    if (empSnap.exists) {
      transaction.update(empRef, { [selfPath]: FieldValue.increment(amount) });
    } else {
      transaction.set(
        empRef,
        buildNestedCompanyCreditObject(cid, syncedSelfPayload),
        { merge: true },
      );
    }
  });
}

function todayDayKey(timeZone) {
  const tz = timeZone || process.env.TZ || 'Asia/Kuala_Lumpur';
  return new Date().toLocaleDateString('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function compareDateStrings(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function parseYmd(ymd) {
  const p = String(ymd || '').split('-');
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}

function formatYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayAfterYmd(endYmd) {
  const d = parseYmd(endYmd);
  d.setDate(d.getDate() + 1);
  return formatYmd(d);
}

function dateInWindow(dateYmd, startYmd, endYmd) {
  return (
    compareDateStrings(dateYmd, startYmd) >= 0 &&
    compareDateStrings(dateYmd, endYmd) <= 0
  );
}

function standingInstructionsCol(companyId) {
  return fireStore
    .collection('ceria_hub')
    .doc(companyId)
    .collection('standing_instructions');
}

function parseStandingInstruction(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    employee_user_id: String(data.employee_user_id || ''),
    employee_id: String(data.employee_id || ''),
    employee_name: String(data.employee_name || ''),
    type: String(data.type || '').toLowerCase(),
    status: String(data.status || '').toLowerCase(),
    period_start: String(data.period_start || ''),
    period_end: String(data.period_end || ''),
    corporate_credit_rm:
      data.corporate_credit_rm != null ? readNum(data.corporate_credit_rm) : null,
    daily_limit_rm:
      data.daily_limit_rm != null ? readNum(data.daily_limit_rm) : null,
    monthly_allowance_rm:
      data.monthly_allowance_rm != null ? readNum(data.monthly_allowance_rm) : null,
  };
}

function findCoveringLimitChangeForTopup(instructions, employeeUserId, today) {
  for (const i of instructions) {
    if (i.employee_user_id !== employeeUserId) continue;
    if (i.type !== 'limit_change') continue;
    if (i.status !== 'scheduled' && i.status !== 'applied') continue;
    if (!dateInWindow(today, i.period_start, i.period_end)) continue;
    if (i.monthly_allowance_rm == null) continue;
    return i;
  }
  return null;
}

function hasOtherCoveringLimitChange(instructions, employeeUserId, excludeId, today) {
  for (const i of instructions) {
    if (i.id === excludeId) continue;
    if (i.employee_user_id !== employeeUserId) continue;
    if (i.type !== 'limit_change') continue;
    if (i.status !== 'scheduled' && i.status !== 'applied') continue;
    if (!dateInWindow(today, i.period_start, i.period_end)) continue;
    return true;
  }
  return false;
}

function resolveExistingCcForApply(empCc, userCc, dayKey) {
  const e = empCc && typeof empCc === 'object' ? empCc : {};
  const u = userCc && typeof userCc === 'object' ? userCc : {};
  const hasUserSelf = u[NEST.self] !== undefined && u[NEST.self] !== null;
  const self = hasUserSelf ? readNum(u[NEST.self]) : readNum(e[NEST.self]);

  const userBal = Number(u[NEST.corporate_balance]);
  const empBal = Number(e[NEST.corporate_balance]);
  const corporateBalance = Number.isFinite(userBal)
    ? userBal
    : Number.isFinite(empBal)
      ? empBal
      : 0;

  const dailyLimit =
    e[NEST.corporate_daily_limit] != null
      ? readNum(e[NEST.corporate_daily_limit])
      : readNum(u[NEST.corporate_daily_limit]);

  let spent = 0;
  let spentDayKey = dayKey;
  if (u[NEST.corporate_day_key] === dayKey) {
    spent = readNum(u[NEST.corporate_spent_today]);
    spentDayKey = dayKey;
  } else if (e[NEST.corporate_day_key] === dayKey) {
    spent = readNum(e[NEST.corporate_spent_today]);
    spentDayKey = dayKey;
  }

  const dailyLimitOverridden =
    e[NEST.daily_limit_overridden] === true || u[NEST.daily_limit_overridden] === true;

  return {
    [NEST.self]: self,
    [NEST.corporate_balance]: corporateBalance,
    [NEST.corporate_daily_limit]: dailyLimit,
    [NEST.corporate_spent_today]: spent,
    [NEST.corporate_day_key]: spentDayKey,
    [NEST.corporate_daily_limit_renewed_at]:
      u[NEST.corporate_daily_limit_renewed_at] ??
      e[NEST.corporate_daily_limit_renewed_at] ??
      null,
    [NEST.daily_limit_overridden]: dailyLimitOverridden,
  };
}

function buildWalletPayloadFromExisting(existingCc, dayKey, updates) {
  const prev =
    existingCc && typeof existingCc === 'object' ? existingCc : {};
  const prevDay = prev[NEST.corporate_day_key];
  const spent =
    prevDay === dayKey ? readNum(prev[NEST.corporate_spent_today]) : 0;

  const payload = {
    [NEST.self]: readNum(prev[NEST.self]),
    [NEST.corporate_balance]: readNum(prev[NEST.corporate_balance]),
    [NEST.corporate_daily_limit]: readNum(prev[NEST.corporate_daily_limit]),
    [NEST.corporate_spent_today]: spent,
    [NEST.corporate_day_key]: dayKey,
    [NEST.corporate_allowance_renewed_at]:
      prev[NEST.corporate_allowance_renewed_at] ?? null,
    [NEST.corporate_daily_limit_renewed_at]:
      prev[NEST.corporate_daily_limit_renewed_at] ?? null,
  };

  if (updates.corporate_balance !== undefined) {
    payload[NEST.corporate_balance] = roundRm(updates.corporate_balance);
  }
  if (updates.corporate_daily_limit !== undefined) {
    payload[NEST.corporate_daily_limit] = roundRm(updates.corporate_daily_limit);
  }
  if (updates.daily_limit_overridden !== undefined) {
    payload[NEST.daily_limit_overridden] = updates.daily_limit_overridden === true;
  }

  return payload;
}

function resolveDefaultAllocation(bodyDefault) {
  const envBalance = Number(process.env.DEFAULT_CORPORATE_BALANCE || 300);
  const envLimit = Number(process.env.DEFAULT_CORPORATE_DAILY_LIMIT || 5);
  const d = bodyDefault && typeof bodyDefault === 'object' ? bodyDefault : {};
  const b = Number(d.corporate_balance);
  const l = Number(d.corporate_daily_limit);
  return {
    corporate_balance: Number.isFinite(b) ? b : envBalance,
    corporate_daily_limit: Number.isFinite(l) ? l : envLimit,
  };
}

function resolveAllocation(docId, username, allocations, defaultAllocation) {
  const byId = allocations[docId];
  if (byId && typeof byId === 'object') {
    return { ...defaultAllocation, ...normalizeAllocationOverride(byId) };
  }
  const byUser = allocations[username];
  if (byUser && typeof byUser === 'object') {
    return { ...defaultAllocation, ...normalizeAllocationOverride(byUser) };
  }
  return { ...defaultAllocation };
}

function normalizeAllocationOverride(obj) {
  const out = {};
  if (obj.corporate_balance !== undefined && obj.corporate_balance !== null) {
    const n = Number(obj.corporate_balance);
    if (Number.isFinite(n)) out.corporate_balance = n;
  }
  if (obj.corporate_daily_limit !== undefined && obj.corporate_daily_limit !== null) {
    const n = Number(obj.corporate_daily_limit);
    if (Number.isFinite(n)) out.corporate_daily_limit = n;
  }
  return out;
}

/**
 * Merge `company_credit.{companyId}` from employee + user for `corporatePayload` prev state.
 * Prefer user for `self` and corporate_balance when present; spend uses whichever doc matches today.
 * @param {object | null | undefined} empCc
 * @param {object | null | undefined} userCc
 * @param {string} dayKey
 */
function resolveExistingCcForTopup(empCc, userCc, dayKey) {
  const e = empCc && typeof empCc === 'object' ? empCc : {};
  const u = userCc && typeof userCc === 'object' ? userCc : {};
  const hasUserSelf = u[NEST.self] !== undefined && u[NEST.self] !== null;
  const self = hasUserSelf
    ? Number(u[NEST.self]) || 0
    : Number(e[NEST.self]) || 0;

  const userBal = Number(u[NEST.corporate_balance]);
  const empBal = Number(e[NEST.corporate_balance]);
  const corporateBalance = Number.isFinite(userBal)
    ? userBal
    : Number.isFinite(empBal)
      ? empBal
      : 0;

  let spent = 0;
  if (u[NEST.corporate_day_key] === dayKey) {
    spent = Number(u[NEST.corporate_spent_today] || 0) || 0;
  } else if (e[NEST.corporate_day_key] === dayKey) {
    spent = Number(e[NEST.corporate_spent_today] || 0) || 0;
  }

  return {
    [NEST.self]: self,
    [NEST.corporate_balance]: corporateBalance,
    [NEST.corporate_spent_today]: spent,
    [NEST.corporate_day_key]: dayKey,
    [NEST.corporate_daily_limit_renewed_at]:
      u[NEST.corporate_daily_limit_renewed_at] ??
      e[NEST.corporate_daily_limit_renewed_at] ??
      null,
  };
}

function corporatePayload(allocation, existingCompanyCreditEntry, dayKey) {
  const prev =
    existingCompanyCreditEntry && typeof existingCompanyCreditEntry === 'object'
      ? existingCompanyCreditEntry
      : {};
  const prevDay = prev[NEST.corporate_day_key];
  const spent =
    prevDay === dayKey ? Number(prev[NEST.corporate_spent_today] || 0) : 0;

  return {
    [NEST.self]: Number(prev[NEST.self] || 0),
    [NEST.corporate_balance]: Number(allocation.corporate_balance),
    [NEST.corporate_daily_limit]: Number(allocation.corporate_daily_limit),
    [NEST.corporate_spent_today]: spent,
    [NEST.corporate_day_key]: dayKey,
    [NEST.corporate_allowance_renewed_at]: new Date().toISOString(),
    [NEST.corporate_daily_limit_renewed_at]:
      prev[NEST.corporate_daily_limit_renewed_at] ?? null,
  };
}

function companyCreditUpdateMap(companyId, payload) {
  const prefix = `company_credit.${companyId}`;
  const out = {};
  for (const [k, v] of Object.entries(payload)) {
    out[`${prefix}.${k}`] = v;
  }
  return out;
}

/** Dot-path patch for only daily spend fields (does not touch balance or limits). */
function companyCreditSpendDayPatchMap(companyId, dayKey) {
  const prefix = `company_credit.${companyId}`;
  return {
    [`${prefix}.${NEST.corporate_spent_today}`]: 0,
    [`${prefix}.${NEST.corporate_day_key}`]: dayKey,
    [`${prefix}.${NEST.corporate_daily_limit_renewed_at}`]: new Date().toISOString(),
  };
}

/** Nested map for `set(..., { merge: true })` when dot-notation must not be used (SDK v8). */
function buildNestedCompanyCreditObject(companyId, payload) {
  return {
    company_credit: {
      [companyId]: { ...payload },
    },
  };
}

/**
 * Reads subsidy policy + employees, builds carry-forward allocations.
 * newBalance = monthlyAllowanceRm + min(max(empCorporate, userCorporate), carryForwardMaxRm).
 * corporateDailyLimit from subsidy_policy.daily_limit_rm (0 = no limit), overridable via options.corporateDailyLimit.
 * @returns {{ ok: true, monthlyAllowanceRm, carryForwardMaxRm, corporateDailyLimit, allocations, docs } | { ok: false, code: string, message: string }}
 */
async function computeCarryForwardAllocations(companyId, options = {}) {
  const runId = options.logRunId || `carry-${Date.now()}`;

  const settingsRef = CeriaCompanySettingsModel.settingsRef(companyId, fireStore);
  const settingsSnap = await settingsRef.get();
  if (!settingsSnap.exists) {
    return {
      ok: false,
      code: 'SETTINGS_MISSING',
      message: `Ceria company settings not found: ceria_hub/${companyId}/company_data/settings`,
    };
  }

  const settingsModel = CeriaCompanySettingsModel.fromDocument(settingsSnap);
  const subsidy = settingsModel.subsidyPolicy;
  const monthlyAllowanceRm = Number(subsidy.monthlyAllowanceRm) || 0;
  const carryForwardMaxRm = Number(subsidy.carryForwardMaxRm) || 0;

  const corporateDailyLimit =
    options.corporateDailyLimit !== undefined &&
    options.corporateDailyLimit !== null &&
    String(options.corporateDailyLimit).trim() !== '' &&
    Number.isFinite(Number(options.corporateDailyLimit))
      ? Number(options.corporateDailyLimit)
      : Number(subsidy.corporateDailyLimit) || 0;

  console.log(
    '[CeriaRouter][CarryForwardTopup] policy',
    JSON.stringify({
      runId,
      companyId,
      monthlyAllowanceRm,
      carryForwardMaxRm,
      corporateDailyLimit,
      formula:
        'newBalance = monthlyAllowanceRm + min(max(employeeCorporateRm, userCorporateRm), carryForwardMaxRm)',
    }),
  );

  const empCol = fireStore
    .collection('ceria_hub')
    .doc(companyId)
    .collection('employee');
  const empSnap = await empCol.get();

  const instrSnap = await standingInstructionsCol(companyId).get();
  const standingInstructions = instrSnap.docs.map(parseStandingInstruction);
  const todayForTopup = todayDayKey(options.timeZone);

  console.log(
    '[CeriaRouter][CarryForwardTopup] employees_loaded',
    JSON.stringify({
      runId,
      companyId,
      employeeDocCount: empSnap.size,
    }),
  );

  const allocations = {};
  const activeDocs = [];
  for (const doc of empSnap.docs) {
    const data = doc.data() || {};
    if (data.employee_status === false) {
      continue;
    }
    activeDocs.push(doc);
    const username = (data.username ?? '').toString();
    const ccEmp =
      data.company_credit && data.company_credit[companyId]
        ? data.company_credit[companyId]
        : null;
    const rawEmp = ccEmp ? Number(ccEmp.corporate_balance) : NaN;
    const empBal = Number.isFinite(rawEmp) ? Math.max(rawEmp, 0) : 0;

    const userSnap = await fireStore.collection('user').doc(doc.id).get();
    let userBal = 0;
    if (userSnap.exists) {
      const ud = userSnap.data() || {};
      const ccUser =
        ud.company_credit && ud.company_credit[companyId]
          ? ud.company_credit[companyId]
          : null;
      const rawUser = ccUser ? Number(ccUser.corporate_balance) : NaN;
      if (Number.isFinite(rawUser)) userBal = Math.max(rawUser, 0);
    }

    const limitOverride = findCoveringLimitChangeForTopup(
      standingInstructions,
      doc.id,
      todayForTopup,
    );
    const effectiveMonthly =
      limitOverride && limitOverride.monthly_allowance_rm != null
        ? limitOverride.monthly_allowance_rm
        : monthlyAllowanceRm;

    const existingCorporate = Math.max(empBal, userBal);
    const carry = Math.min(existingCorporate, carryForwardMaxRm);
    const newBalance = effectiveMonthly + carry;
    const allocation = {
      corporate_balance: newBalance,
      corporate_daily_limit: corporateDailyLimit,
    };

    const empCc = ccEmp || {};
    const userCc =
      userSnap.exists && userSnap.data()
        ? (userSnap.data().company_credit || {})[companyId] || {}
        : {};
    if (
      empCc[NEST.daily_limit_overridden] === true ||
      userCc[NEST.daily_limit_overridden] === true
    ) {
      delete allocation.corporate_daily_limit;
    }

    allocations[doc.id] = allocation;

    console.log(
      '[CeriaRouter][CarryForwardTopup] employee_calc',
      JSON.stringify({
        runId,
        companyId,
        docId: doc.id,
        username,
        employeeCorporateBalance_rm: empBal,
        userCorporateBalance_rm: userBal,
        userDocExists: userSnap.exists,
        existingCorporate_rm: existingCorporate,
        carryForwardCap_rm: carryForwardMaxRm,
        carryApplied_rm: carry,
        monthlyAllowance_rm: effectiveMonthly,
        limitChangeOverride: limitOverride ? limitOverride.id : null,
        newCorporateBalance_rm: newBalance,
        corporateDailyLimit_rm: allocation.corporate_daily_limit ?? 'preserved',
      }),
    );
  }

  return {
    ok: true,
    monthlyAllowanceRm,
    carryForwardMaxRm,
    corporateDailyLimit,
    allocations,
    docs: activeDocs,
  };
}

/**
 * Applies company_credit patches for each employee doc (dual-write user + employee).
 */
async function processCorporateCreditsForEmployees({
  companyId,
  docs,
  defaultAllocation,
  allocations,
  timeZone,
  dryRun,
  ledgerSource = BALANCE_ADJUSTMENT_SOURCES.corporateTopup,
  adjustedBy = 'Corporate top-up scheduler',
  ledgerReason = null,
}) {
  const empCol = fireStore
    .collection('ceria_hub')
    .doc(companyId)
    .collection('employee');
  const dayKey = todayDayKey(timeZone);
  const previews = [];
  let batch = fireStore.batch();
  let ops = 0;
  let batchesCommitted = 0;

  const flush = async () => {
    if (ops === 0) return;
    if (!dryRun) {
      await batch.commit();
      batchesCommitted += 1;
    }
    batch = fireStore.batch();
    ops = 0;
  };

  for (const doc of docs) {
    const data = doc.data() || {};
    const docId = doc.id;
    const username = (data.username ?? '').toString();
    const displayname = (data.displayname ?? '').toString();

    const allocation = resolveAllocation(
      docId,
      username,
      allocations,
      defaultAllocation,
    );
    const empCc = data.company_credit && data.company_credit[companyId];
    const userSnap = await fireStore.collection('user').doc(docId).get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const userCc =
      userData.company_credit && userData.company_credit[companyId];
    const existingCc = resolveExistingCcForTopup(empCc, userCc, dayKey);
    const allocationResolved = { ...allocation };
    if (
      empCc[NEST.daily_limit_overridden] === true ||
      userCc[NEST.daily_limit_overridden] === true
    ) {
      allocationResolved.corporate_daily_limit = readNum(
        existingCc[NEST.corporate_daily_limit],
      );
    }
    const payload = corporatePayload(allocationResolved, existingCc, dayKey);
    const patch = companyCreditUpdateMap(companyId, payload);
    const balanceBeforeRm = roundRm(existingCc[NEST.corporate_balance] ?? 0);
    const balanceAfterRm = roundRm(payload[NEST.corporate_balance] ?? 0);

    previews.push({
      docId,
      username,
      displayname,
      allocation,
      payload,
    });

    if (!dryRun) {
      const userRef = fireStore.collection('user').doc(docId);
      const empRef = empCol.doc(docId);
      const nestedUser = buildNestedCompanyCreditObject(companyId, payload);
      batch.update(empRef, patch);
      if (userSnap.exists) {
        batch.update(userRef, patch);
      } else {
        batch.set(userRef, nestedUser, { merge: true });
      }
      ops += 2;
      if (roundRm(balanceAfterRm - balanceBeforeRm) !== 0) {
        queueBalanceAdjustment(batch, {
          companyId,
          employeeUserId: docId,
          employeeId: (data.employee_id ?? '').toString(),
          employeeName: displayname || username,
          balanceBeforeRm,
          balanceAfterRm,
          source: ledgerSource,
          adjustedBy,
          reason:
            ledgerReason ||
            `Corporate top-up (${dayKey})`,
        });
        ops += 1;
      }
    }

    if (ops >= MAX_BATCH_OPS) {
      await flush();
    }
  }

  await flush();

  return {
    previews,
    batchesCommitted: dryRun ? 0 : batchesCommitted,
    dayKey,
    timeZone,
    employeesProcessed: docs.length,
  };
}

/**
 * Apply due standing instructions (join / resign / limit change) at 01:30 KL.
 * @param {{ companyId: string, dryRun?: boolean, timeZone?: string, logRunId?: string }} p
 */
async function applyStandingInstructionsCore(p) {
  const companyId = (p.companyId ?? '').toString().trim();
  if (!companyId) {
    return { success: false, code: 'MISSING_COMPANY_ID', message: 'companyId is required' };
  }

  const dryRun = p.dryRun === true;
  const timeZone =
    (p.timeZone && String(p.timeZone).trim()) ||
    process.env.TZ ||
    'Asia/Kuala_Lumpur';
  const runId = p.logRunId || `apply-standing-${Date.now()}`;
  const today = todayDayKey(timeZone);
  const dayKey = today;

  const policyResult = await loadSubsidyPolicy(companyId);
  if (!policyResult.ok) {
    return {
      success: false,
      code: policyResult.code,
      message: policyResult.message,
    };
  }
  const defaultDailyLimit = Number(policyResult.subsidyPolicy.corporateDailyLimit) || 0;

  const instrSnap = await standingInstructionsCol(companyId).get();
  const instructions = instrSnap.docs.map(parseStandingInstruction);

  const joinItems = [];
  const limitStartItems = [];
  const resignItems = [];
  const limitExpireItems = [];

  for (const instr of instructions) {
    if (instr.status === 'cancelled' || instr.status === 'expired') continue;

    if (
      instr.type === 'join' &&
      instr.status === 'scheduled' &&
      compareDateStrings(instr.period_start, today) <= 0
    ) {
      joinItems.push(instr);
      continue;
    }

    if (
      instr.type === 'limit_change' &&
      instr.status === 'scheduled' &&
      dateInWindow(today, instr.period_start, instr.period_end)
    ) {
      limitStartItems.push(instr);
      continue;
    }

    if (
      instr.type === 'resign' &&
      instr.status === 'scheduled' &&
      compareDateStrings(instr.period_start, today) <= 0
    ) {
      resignItems.push(instr);
      continue;
    }

    if (
      instr.type === 'limit_change' &&
      (instr.status === 'scheduled' || instr.status === 'applied') &&
      compareDateStrings(today, dayAfterYmd(instr.period_end)) >= 0
    ) {
      limitExpireItems.push(instr);
    }
  }

  const workQueue = [
    ...joinItems,
    ...limitStartItems,
    ...resignItems,
    ...limitExpireItems,
  ];

  console.log(
    '[CeriaRouter][ApplyStanding] start',
    JSON.stringify({
      runId,
      companyId,
      dryRun,
      today,
      timeZone,
      join: joinItems.length,
      limitStart: limitStartItems.length,
      resign: resignItems.length,
      limitExpire: limitExpireItems.length,
    }),
  );

  const empCol = fireStore
    .collection('ceria_hub')
    .doc(companyId)
    .collection('employee');

  const previews = [];
  let batch = fireStore.batch();
  let ops = 0;
  let batchesCommitted = 0;

  const flush = async () => {
    if (ops === 0) return;
    if (!dryRun) {
      await batch.commit();
      batchesCommitted += 1;
    }
    batch = fireStore.batch();
    ops = 0;
  };

  const queueDualWrite = async (employeeUserId, empPatch, userPatch, statusPatch) => {
    const empRef = empCol.doc(employeeUserId);
    const userRef = fireStore.collection('user').doc(employeeUserId);
    const userSnap = await fireStore.collection('user').doc(employeeUserId).get();

    const empUpdate = { ...statusPatch, ...empPatch };
    const userUpdate = { ...statusPatch, ...userPatch };

    if (!dryRun) {
      batch.update(empRef, empUpdate);
      if (userSnap.exists) {
        batch.update(userRef, userUpdate);
      } else if (Object.keys(userPatch).length > 0) {
        const nested = {};
        for (const [k, v] of Object.entries(userPatch)) {
          if (k.startsWith('company_credit.')) {
            const parts = k.split('.');
            if (!nested.company_credit) nested.company_credit = {};
            if (!nested.company_credit[parts[1]]) nested.company_credit[parts[1]] = {};
            nested.company_credit[parts[1]][parts[2]] = v;
          } else {
            nested[k] = v;
          }
        }
        batch.set(userRef, nested, { merge: true });
      }
      ops += 2;
    }
  };

  for (const instr of workQueue) {
    const employeeUserId = instr.employee_user_id;
    if (!employeeUserId) continue;

    const empSnap = await empCol.doc(employeeUserId).get();
    if (!empSnap.exists) {
      previews.push({
        instructionId: instr.id,
        type: instr.type,
        skipped: true,
        reason: 'employee_not_found',
      });
      continue;
    }

    const empData = empSnap.data() || {};
    const userSnap = await fireStore.collection('user').doc(employeeUserId).get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const empCc = (empData.company_credit || {})[companyId];
    const userCc = (userData.company_credit || {})[companyId];
    const existingCc = resolveExistingCcForApply(empCc, userCc, dayKey);

    const instrRef = standingInstructionsCol(companyId).doc(instr.id);
    const freshInstrSnap = await instrRef.get();
    if (!freshInstrSnap.exists) continue;
    const freshInstr = parseStandingInstruction(freshInstrSnap);
    if (freshInstr.status === 'cancelled' || freshInstr.status === 'expired') {
      continue;
    }

    const displayName =
      instr.employee_name ||
      (empData.displayname ?? '').toString() ||
      (empData.username ?? '').toString();
    const employeeIdField = (empData.employee_id ?? instr.employee_id ?? '').toString();

    if (instr.type === 'join' && freshInstr.status === 'scheduled') {
      const creditAdd = roundRm(instr.corporate_credit_rm ?? 0);
      const newBalance = roundRm(existingCc[NEST.corporate_balance] + creditAdd);
      const walletUpdates = {
        corporate_balance: newBalance,
        corporate_daily_limit: readNum(instr.daily_limit_rm),
        daily_limit_overridden: true,
      };
      const payload = buildWalletPayloadFromExisting(existingCc, dayKey, walletUpdates);
      const patch = companyCreditUpdateMap(companyId, payload);
      const statusPatch = { employee_status: true };

      previews.push({
        instructionId: instr.id,
        type: 'join',
        employeeUserId,
        creditAdd,
        newBalance,
      });

      if (!dryRun) {
        await queueDualWrite(employeeUserId, patch, patch, statusPatch);
        if (creditAdd !== 0) {
          queueBalanceAdjustment(batch, {
            companyId,
            employeeUserId,
            employeeId: employeeIdField,
            employeeName: displayName,
            balanceBeforeRm: existingCc[NEST.corporate_balance],
            balanceAfterRm: newBalance,
            source: BALANCE_ADJUSTMENT_SOURCES.proratedSubsidy,
            adjustedBy: 'Standing instructions worker',
            reason: `Join prorata (${instr.period_start} → ${instr.period_end})`,
            periodStart: instr.period_start,
            periodEnd: instr.period_end,
            instructionId: instr.id,
          });
          ops += 1;
        }
        batch.update(instrRef, {
          status: 'applied',
          applied_at: FieldValue.serverTimestamp(),
        });
        ops += 1;
      }

      if (ops >= MAX_BATCH_OPS) await flush();
      continue;
    }

    if (instr.type === 'limit_change' && freshInstr.status === 'scheduled' &&
        dateInWindow(today, instr.period_start, instr.period_end)) {
      const walletUpdates = {};
      if (instr.daily_limit_rm != null) {
        walletUpdates.corporate_daily_limit = readNum(instr.daily_limit_rm);
        walletUpdates.daily_limit_overridden = true;
      }
      const payload = buildWalletPayloadFromExisting(existingCc, dayKey, walletUpdates);
      const patch = companyCreditUpdateMap(companyId, payload);

      previews.push({
        instructionId: instr.id,
        type: 'limit_change_start',
        employeeUserId,
        dailyLimit: instr.daily_limit_rm,
      });

      if (!dryRun) {
        if (Object.keys(walletUpdates).length > 0) {
          await queueDualWrite(employeeUserId, patch, patch, {});
        }
        batch.update(instrRef, {
          status: 'applied',
          applied_at: FieldValue.serverTimestamp(),
        });
        ops += Object.keys(walletUpdates).length > 0 ? 3 : 1;
      }

      if (ops >= MAX_BATCH_OPS) await flush();
      continue;
    }

    if (instr.type === 'resign' && freshInstr.status === 'scheduled') {
      previews.push({
        instructionId: instr.id,
        type: 'resign',
        employeeUserId,
      });

      if (!dryRun) {
        await queueDualWrite(employeeUserId, {}, {}, { employee_status: false });
        batch.update(instrRef, {
          status: 'applied',
          applied_at: FieldValue.serverTimestamp(),
        });
        ops += 1;
      }

      if (ops >= MAX_BATCH_OPS) await flush();
      continue;
    }

    if (
      instr.type === 'limit_change' &&
      (freshInstr.status === 'scheduled' || freshInstr.status === 'applied') &&
      compareDateStrings(today, dayAfterYmd(instr.period_end)) >= 0
    ) {
      const missedWindow =
        freshInstr.status === 'scheduled' &&
        compareDateStrings(today, instr.period_end) > 0;

      previews.push({
        instructionId: instr.id,
        type: 'limit_change_expire',
        employeeUserId,
        missedWindow,
      });

      if (!dryRun) {
        if (!missedWindow) {
          const otherCovering = hasOtherCoveringLimitChange(
            instructions,
            employeeUserId,
            instr.id,
            today,
          );
          if (!otherCovering) {
            const walletUpdates = {
              corporate_daily_limit: defaultDailyLimit,
              daily_limit_overridden: false,
            };
            const payload = buildWalletPayloadFromExisting(
              existingCc,
              dayKey,
              walletUpdates,
            );
            const patch = companyCreditUpdateMap(companyId, payload);
            await queueDualWrite(employeeUserId, patch, patch, {});
          }
        }
        batch.update(instrRef, { status: 'expired' });
        ops += 1;
      }

      if (ops >= MAX_BATCH_OPS) await flush();
    }
  }

  await flush();

  return {
    success: true,
    mode: 'apply_standing_instructions',
    companyId,
    dryRun,
    today,
    timeZone,
    instructionsProcessed: workQueue.length,
    batchesCommitted: dryRun ? 0 : batchesCommitted,
    previews,
  };
}

/**
 * Sets corporate_spent_today to 0 and corporate_day_key to today for each employee (dual-write user).
 * @param {{ companyId: string, dryRun?: boolean, timeZone?: string, docIds?: string[], logRunId?: string }} p
 */
async function resetCorporateSpendTodayCore(p) {
  const companyId = (p.companyId ?? '').toString().trim();
  if (!companyId) {
    return { success: false, code: 'MISSING_COMPANY_ID', message: 'companyId is required' };
  }

  const dryRun = p.dryRun === true;
  const timeZone =
    (p.timeZone && String(p.timeZone).trim()) ||
    process.env.TZ ||
    'Asia/Kuala_Lumpur';
  const runId = p.logRunId || `reset-spend-${Date.now()}`;
  const dayKey = todayDayKey(timeZone);

  let docIdFilter = null;
  if (p.docIds !== undefined && p.docIds !== null) {
    if (!Array.isArray(p.docIds)) {
      return {
        success: false,
        code: 'INVALID_DOC_IDS',
        message: 'docIds must be an array of strings when provided',
      };
    }
    docIdFilter = new Set(p.docIds.map((id) => String(id)));
  }

  const empCol = fireStore
    .collection('ceria_hub')
    .doc(companyId)
    .collection('employee');
  const snap = await empCol.get();
  let docs = snap.docs;
  if (docIdFilter) {
    docs = docs.filter((d) => docIdFilter.has(d.id));
  }

  console.log(
    '[CeriaRouter][ResetSpendToday] start',
    JSON.stringify({
      runId,
      companyId,
      dryRun,
      dayKey,
      timeZone,
      employeeDocCount: docs.length,
    }),
  );

  const patch = companyCreditSpendDayPatchMap(companyId, dayKey);
  const nestedUserSparse = buildNestedCompanyCreditObject(companyId, {
    [NEST.corporate_spent_today]: 0,
    [NEST.corporate_day_key]: dayKey,
    [NEST.corporate_daily_limit_renewed_at]: new Date().toISOString(),
  });

  const previews = [];
  let batch = fireStore.batch();
  let ops = 0;
  let batchesCommitted = 0;

  const flush = async () => {
    if (ops === 0) return;
    if (!dryRun) {
      await batch.commit();
      batchesCommitted += 1;
    }
    batch = fireStore.batch();
    ops = 0;
  };

  for (const doc of docs) {
    const data = doc.data() || {};
    const docId = doc.id;
    const username = (data.username ?? '').toString();
    const displayname = (data.displayname ?? '').toString();

    previews.push({ docId, username, displayname, dayKey });

    if (!dryRun) {
      const userRef = fireStore.collection('user').doc(docId);
      const empRef = empCol.doc(docId);
      const userSnap = await fireStore.collection('user').doc(docId).get();

      batch.update(empRef, patch);
      if (userSnap.exists) {
        batch.update(userRef, patch);
      } else {
        batch.set(userRef, nestedUserSparse, { merge: true });
      }
      ops += 2;
    }

    if (ops >= MAX_BATCH_OPS) {
      await flush();
    }
  }

  await flush();

  return {
    success: true,
    mode: 'reset_corporate_spend_today',
    companyId,
    dryRun,
    dayKey,
    timeZone,
    employeesProcessed: docs.length,
    batchesCommitted: dryRun ? 0 : batchesCommitted,
    previews,
  };
}

/**
 * Full carry-forward top-up: compute from Firestore policy + balances, then apply (or dry-run).
 * Used by HTTP route and by CronRouter for same-process dry-run preview.
 * @param {{ companyId: string, dryRun?: boolean, timeZone?: string, corporateDailyLimit?: *, logRunId?: string }} p
 */
async function executeCorporateCarryForwardTopupCore(p) {
  const companyId = (p.companyId ?? '').toString().trim();
  if (!companyId) {
    return { success: false, code: 'MISSING_COMPANY_ID', message: 'companyId is required' };
  }

  const dryRun = p.dryRun === true;
  const timeZone =
    (p.timeZone && String(p.timeZone).trim()) ||
    process.env.TZ ||
    'Asia/Kuala_Lumpur';
  const runId = p.logRunId || `carry-${Date.now()}`;

  const computed = await computeCarryForwardAllocations(companyId, {
    corporateDailyLimit: p.corporateDailyLimit,
    logRunId: runId,
    timeZone,
  });

  if (!computed.ok) {
    return {
      success: false,
      code: computed.code,
      message: computed.message,
    };
  }

  const defaultAllocation = {
    corporate_balance: 0,
    corporate_daily_limit: computed.corporateDailyLimit,
  };

  const writeResult = await processCorporateCreditsForEmployees({
    companyId,
    docs: computed.docs,
    defaultAllocation,
    allocations: computed.allocations,
    timeZone,
    dryRun,
    ledgerSource: BALANCE_ADJUSTMENT_SOURCES.corporateTopup,
    adjustedBy: 'Corporate top-up scheduler',
    ledgerReason: `Corporate top-up run ${runId}`,
  });

  return {
    success: true,
    mode: 'carry_forward_topup',
    companyId,
    dryRun,
    monthlyAllowanceRm: computed.monthlyAllowanceRm,
    carryForwardMaxRm: computed.carryForwardMaxRm,
    corporateDailyLimit: computed.corporateDailyLimit,
    allocations: computed.allocations,
    ...writeResult,
  };
}

const FIELDS = {
  COMPANY_CREDIT: 'company_credit',
  EMPLOYEE_ID: 'employee_id',
  EMPLOYEE_STATUS: 'employee_status',
};

const DEFAULT_TZ = 'Asia/Kuala_Lumpur';

function nowInTimeZone(timeZone = DEFAULT_TZ) {
  return new Date(new Date().toLocaleString('en-US', { timeZone }));
}

function emptyWallet() {
  return {
    [NEST.self]: 0,
    [NEST.corporate_balance]: 0,
    [NEST.corporate_daily_limit]: 0,
    [NEST.corporate_spent_today]: 0,
    [NEST.corporate_day_key]: '',
  };
}

function normalizeWallet(raw, dayKey) {
  const w = { ...emptyWallet(), ...(raw || {}) };
  w[NEST.self] = readNum(w[NEST.self]);
  w[NEST.corporate_balance] = readNum(w[NEST.corporate_balance]);
  w[NEST.corporate_daily_limit] = readNum(w[NEST.corporate_daily_limit]);
  w[NEST.corporate_spent_today] = readNum(w[NEST.corporate_spent_today]);
  w[NEST.corporate_day_key] = String(w[NEST.corporate_day_key] || '');

  if (w[NEST.corporate_day_key] !== dayKey) {
    w[NEST.corporate_spent_today] = 0;
    w[NEST.corporate_day_key] = dayKey;
  }
  return w;
}

/**
 * Merge per-company wallet from ceria_hub employee + user docs (dual-write sources).
 * Prefer user for self/corporate_balance; daily limit from employee wallet when set.
 */
function mergeWalletForCompany(empCc, userCc, dayKey) {
  const e = empCc && typeof empCc === 'object' ? empCc : {};
  const u = userCc && typeof userCc === 'object' ? userCc : {};

  const hasUserSelf = u[NEST.self] !== undefined && u[NEST.self] !== null;
  const self = hasUserSelf ? readNum(u[NEST.self]) : readNum(e[NEST.self]);

  const userBal = Number(u[NEST.corporate_balance]);
  const empBal = Number(e[NEST.corporate_balance]);
  const corporateBalance =
    u[NEST.corporate_balance] != null && Number.isFinite(userBal)
      ? userBal
      : Number.isFinite(empBal)
        ? empBal
        : 0;

  const dailyLimit =
    e[NEST.corporate_daily_limit] != null
      ? readNum(e[NEST.corporate_daily_limit])
      : readNum(u[NEST.corporate_daily_limit]);

  let spent = 0;
  let spentDayKey = dayKey;
  if (u[NEST.corporate_day_key] === dayKey) {
    spent = readNum(u[NEST.corporate_spent_today]);
    spentDayKey = dayKey;
  } else if (e[NEST.corporate_day_key] === dayKey) {
    spent = readNum(e[NEST.corporate_spent_today]);
    spentDayKey = dayKey;
  }

  return normalizeWallet(
    {
      [NEST.self]: self,
      [NEST.corporate_balance]: corporateBalance,
      [NEST.corporate_daily_limit]: dailyLimit,
      [NEST.corporate_spent_today]: spent,
      [NEST.corporate_day_key]: spentDayKey,
    },
    dayKey,
  );
}

function remainingDailyLimit(wallet) {
  const limit = wallet[NEST.corporate_daily_limit];
  if (limit <= 0) return Infinity;
  return Math.max(0, limit - wallet[NEST.corporate_spent_today]);
}

function maxCorporateDrawable(wallet, subsidyPolicy, localDate) {
  if (!subsidyPolicy.isUsageAllowedOn(localDate)) return 0;
  return Math.min(wallet[NEST.corporate_balance], remainingDailyLimit(wallet));
}

function computeAvailability(wallet, subsidyPolicy, dayKey, localDate) {
  const w = normalizeWallet(wallet, dayKey);
  const corpAvail = roundRm(maxCorporateDrawable(w, subsidyPolicy, localDate));
  const selfAvail = roundRm(w[NEST.self]);
  const dailyLimit = w[NEST.corporate_daily_limit];
  const remainingToday =
    dailyLimit > 0 ? Math.max(0, dailyLimit - w[NEST.corporate_spent_today]) : null;

  return {
    wallet: w,
    corporateBalance: roundRm(w[NEST.corporate_balance]),
    selfBalance: roundRm(w[NEST.self]),
    corporateDailyLimit: roundRm(dailyLimit),
    corporateSpentToday: roundRm(w[NEST.corporate_spent_today]),
    remainingToday: remainingToday == null ? null : roundRm(remainingToday),
    corporateAvailable: corpAvail,
    selfAvailable: selfAvail,
    totalAvailable: roundRm(corpAvail + selfAvail),
    corporateUsageAllowedToday: subsidyPolicy.isUsageAllowedOn(localDate),
  };
}

async function loadSubsidyPolicy(companyId) {
  const settingsSnap = await CeriaCompanySettingsModel.settingsRef(companyId, fireStore).get();
  if (!settingsSnap.exists) {
    return {
      ok: false,
      code: 'SETTINGS_MISSING',
      message: `Ceria company settings not found: ceria_hub/${companyId}/company_data/settings`,
    };
  }
  const settingsModel = CeriaCompanySettingsModel.fromDocument(settingsSnap);
  return { ok: true, subsidyPolicy: settingsModel.subsidyPolicy };
}

async function resolveEmployee(companyId, employeeSlug) {
  const slug = String(employeeSlug || '').trim();
  if (!slug) {
    return { ok: false, code: 'EMPLOYEE_ID_REQUIRED', message: 'employeeId is required' };
  }

  const corpDocId = `CORP_${slug}`;
  const ceriaRef = fireStore
    .collection('ceria_hub')
    .doc(companyId)
    .collection('employee')
    .doc(corpDocId);
  let snap = await ceriaRef.get();

  if (!snap.exists) {
    const q = await fireStore
      .collection('ceria_hub')
      .doc(companyId)
      .collection('employee')
      .where(FIELDS.EMPLOYEE_ID, '==', slug)
      .limit(1)
      .get();
    if (q.empty) {
      return { ok: false, code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' };
    }
    snap = q.docs[0];
  }

  const userDocId = snap.id;
  return {
    ok: true,
    userDocId,
    data: snap.data() || {},
    ceriaRef: fireStore
      .collection('ceria_hub')
      .doc(companyId)
      .collection('employee')
      .doc(userDocId),
    userRef: fireStore.collection('user').doc(userDocId),
  };
}

function splitDeduction(wallet, amountRm, subsidyPolicy, dayKey, localDate) {
  const w = normalizeWallet(wallet, dayKey);
  const amount = roundRm(amountRm);
  const fromCorporate = roundRm(
    Math.min(amount, maxCorporateDrawable(w, subsidyPolicy, localDate)),
  );
  const remainder = roundRm(amount - fromCorporate);
  const fromSelf = roundRm(Math.min(remainder, w[NEST.self]));

  if (fromCorporate + fromSelf + 1e-9 < amount) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message: 'Insufficient combined corporate and self balance',
      available: roundRm(fromCorporate + w[NEST.self]),
    };
  }

  const updated = {
    ...w,
    [NEST.corporate_balance]: roundRm(w[NEST.corporate_balance] - fromCorporate),
    [NEST.corporate_spent_today]: roundRm(w[NEST.corporate_spent_today] + fromCorporate),
    [NEST.self]: roundRm(w[NEST.self] - fromSelf),
  };

  return { ok: true, fromCorporate, fromSelf, updated };
}

function remainingTodayFromWallet(wallet) {
  const dailyLimit = wallet[NEST.corporate_daily_limit];
  const spent = wallet[NEST.corporate_spent_today];
  return dailyLimit > 0 ? Math.max(0, roundRm(dailyLimit - spent)) : null;
}

function buildCompanyPaymentDetail({
  companyId,
  beforeWallet,
  afterWallet,
  fromCorporate,
  fromSelf,
  dayKey,
}) {
  const beforeRemaining = remainingTodayFromWallet(beforeWallet);
  const afterRemaining = remainingTodayFromWallet(afterWallet);
  return {
    company_id: companyId,
    company_balance_before_rm: roundRm(beforeWallet[NEST.corporate_balance]),
    company_balance_after_rm: roundRm(afterWallet[NEST.corporate_balance]),
    store_credits_before_rm: roundRm(beforeWallet[NEST.self]),
    store_credits_after_rm: roundRm(afterWallet[NEST.self]),
    corporate_spent_today_before_rm: roundRm(beforeWallet[NEST.corporate_spent_today]),
    corporate_spent_today_after_rm: roundRm(afterWallet[NEST.corporate_spent_today]),
    corporate_limit_remaining_before_rm: beforeRemaining,
    corporate_limit_remaining_after_rm: afterRemaining,
    corporate_day_key: dayKey,
    corporate_pool_draw_rm: roundRm(fromCorporate),
    self_store_credits_draw_rm: roundRm(fromSelf),
  };
}

async function ceriaGetBalanceCore({ companyId, encryptedEmployeeId, timeZone }) {
  const cid = String(companyId || '').trim();
  if (!cid) {
    return { success: false, code: 'COMPANY_ID_REQUIRED', message: 'companyId is required' };
  }

  const enc = String(encryptedEmployeeId || '').trim();
  if (!enc) {
    return {
      success: false,
      code: 'ENCRYPTED_EMPLOYEE_ID_REQUIRED',
      message: 'encrypted_employee_id is required',
    };
  }

  const decrypted = decryptEmployeeId(enc, cid);
  if (!decrypted.ok) {
    return { success: false, code: decrypted.code, message: decrypted.message };
  }
  const slug = decrypted.employeeId;

  const tz =
    (timeZone && String(timeZone).trim()) || process.env.TZ || DEFAULT_TZ;
  const resolved = await resolveEmployee(cid, slug);
  if (!resolved.ok) return { success: false, code: resolved.code, message: resolved.message };

  const policyResult = await loadSubsidyPolicy(cid);
  if (!policyResult.ok) {
    return { success: false, code: policyResult.code, message: policyResult.message };
  }

  const dayKey = todayDayKey(tz);
  const localDate = nowInTimeZone(tz);

  const userSnap = await fireStore.collection('user').doc(resolved.userDocId).get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const empCc = (resolved.data[FIELDS.COMPANY_CREDIT] || {})[cid];
  const userCc = (userData[FIELDS.COMPANY_CREDIT] || {})[cid];
  const mergedWallet = mergeWalletForCompany(empCc, userCc, dayKey);
  const avail = computeAvailability(mergedWallet, policyResult.subsidyPolicy, dayKey, localDate);

  return {
    success: true,
    ok: true,
    userDocId: resolved.userDocId,
    employeeId: resolved.data[FIELDS.EMPLOYEE_ID] || slug,
    displayName: resolved.data.displayname || resolved.data.display_name || '',
    wallets: {
      corporateBalance: avail.corporateBalance,
      selfBalance: avail.selfBalance,
      corporateDailyLimit: avail.corporateDailyLimit,
      corporateSpentToday: avail.corporateSpentToday,
      remainingToday: avail.remainingToday,
      corporateAvailable: avail.corporateAvailable,
      selfAvailable: avail.selfAvailable,
      totalAvailable: avail.totalAvailable,
      corporateUsageAllowedToday: avail.corporateUsageAllowedToday,
      corporateDayKey: avail.wallet[NEST.corporate_day_key],
    },
    subsidyPolicy: {
      usageAvailability: policyResult.subsidyPolicy.usageAvailability.firestoreValue,
      dailyLimitRm: roundRm(policyResult.subsidyPolicy.corporateDailyLimit),
    },
  };
}

async function saveCeriaDeductOrders(orderData, storeId, userDocId) {
  const id = orderData.id;
  const batch = fireStore.batch();

  batch.set(
    fireStore.collection('myinvois').doc(storeId).collection('order').doc(id),
    orderData,
  );
  batch.set(
    fireStore.collection('user').doc(userDocId).collection('order').doc(id),
    orderData,
  );

  await batch.commit();
  console.log(`[CeriaDeduct] Order saved: myinvois/${storeId}/order/${id}`);
  console.log(`[CeriaDeduct] Order saved: user/${userDocId}/order/${id}`);

  try {
    await fireStore
      .collection('myreport')
      .doc(storeId)
      .collection('order')
      .doc(id)
      .set(orderData);
    console.log(`[CeriaDeduct] Order saved: myreport/${storeId}/order/${id}`);
  } catch (myReportError) {
    console.error('[CeriaDeduct] Error saving to myreport:', myReportError);
  }
}

async function ceriaDeductBalanceCore(body) {
  const companyId = String(body.company_id || body.companyId || '').trim();

  if (!companyId) {
    return { success: false, code: 'COMPANY_ID_REQUIRED', message: 'company_id is required' };
  }

  const decrypted = resolveEmployeeIdFromEncryptedBody(body);
  if (!decrypted.ok) {
    return { success: false, code: decrypted.code, message: decrypted.message };
  }
  const employeeId = decrypted.employeeId;

  const built = await buildEinvoiceOrderFromBody(body, fireStore, {
    paymentType: 'Ceria Corporate',
    mode: 'ceria_deduct',
  });
  if (!built.ok) {
    return { success: false, code: built.code || 'INVALID_REQUEST', message: built.message };
  }

  const amountRm = roundRm(built.grandTotal);
  if (amountRm <= 0) {
    return { success: false, code: 'INVALID_AMOUNT', message: 'amount must be greater than 0' };
  }

  const resolved = await resolveEmployee(companyId, employeeId);
  if (!resolved.ok) return { success: false, code: resolved.code, message: resolved.message };

  const policyResult = await loadSubsidyPolicy(companyId);
  if (!policyResult.ok) {
    return { success: false, code: policyResult.code, message: policyResult.message };
  }

  const timeZone = process.env.TZ || DEFAULT_TZ;
  const dayKey = todayDayKey(timeZone);
  const localDate = nowInTimeZone(timeZone);

  let deductResult;
  try {
    deductResult = await fireStore.runTransaction(async (tx) => {
      const ceriaSnap = await tx.get(resolved.ceriaRef);
      const userSnap = await tx.get(resolved.userRef);

      if (!ceriaSnap.exists) {
        const err = new Error('EMPLOYEE_NOT_FOUND');
        err.code = 'EMPLOYEE_NOT_FOUND';
        throw err;
      }

      const ceriaData = ceriaSnap.data() || {};
      if (ceriaData[FIELDS.EMPLOYEE_STATUS] === false) {
        const err = new Error('EMPLOYEE_INACTIVE');
        err.code = 'EMPLOYEE_INACTIVE';
        throw err;
      }

      const userData = userSnap.exists ? userSnap.data() || {} : {};
      const empCc = (ceriaData[FIELDS.COMPANY_CREDIT] || {})[companyId];
      const userCc = (userData[FIELDS.COMPANY_CREDIT] || {})[companyId];
      const mergedWallet = mergeWalletForCompany(empCc, userCc, dayKey);
      const beforeWallet = { ...mergedWallet };

      const split = splitDeduction(
        mergedWallet,
        amountRm,
        policyResult.subsidyPolicy,
        dayKey,
        localDate,
      );

      if (!split.ok) {
        const err = new Error(split.message);
        err.code = split.code;
        err.available = split.available;
        throw err;
      }

      const patch = buildNestedCompanyCreditObject(companyId, split.updated);
      tx.set(resolved.userRef, patch, { merge: true });
      tx.set(resolved.ceriaRef, patch, { merge: true });

      return {
        fromCorporate: split.fromCorporate,
        fromSelf: split.fromSelf,
        updated: split.updated,
        beforeWallet,
      };
    });
  } catch (error) {
    if (error.code === 'EMPLOYEE_NOT_FOUND') {
      return { success: false, code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' };
    }
    if (error.code === 'EMPLOYEE_INACTIVE') {
      return { success: false, code: 'EMPLOYEE_INACTIVE', message: 'Employee is inactive' };
    }
    if (error.code === 'INSUFFICIENT_BALANCE') {
      return {
        success: false,
        code: 'INSUFFICIENT_BALANCE',
        message: error.message || 'Insufficient balance',
        available: error.available,
      };
    }
    throw error;
  }

  const companyPaymentDetail = buildCompanyPaymentDetail({
    companyId,
    beforeWallet: deductResult.beforeWallet,
    afterWallet: deductResult.updated,
    fromCorporate: deductResult.fromCorporate,
    fromSelf: deductResult.fromSelf,
    dayKey,
  });

  const orderData = {
    ...built.orderData,
    employee_id: employeeId,
    company_id: companyId,
    is_corporate: true,
    corporate: true,
    company_payment_detail: companyPaymentDetail,
  };

  try {
    await saveCeriaDeductOrders(orderData, built.storeId, resolved.userDocId);
  } catch (orderSaveError) {
    console.error('[CeriaDeduct] CRITICAL: wallet deducted but order save failed', {
      orderId: built.id,
      userDocId: resolved.userDocId,
      companyId,
      employeeId,
      amountRm,
      error: orderSaveError.message,
    });
    return {
      success: false,
      code: 'ORDER_SAVE_FAILED',
      message:
        'Balance was deducted but order persistence failed — manual reconciliation required',
      orderId: built.id,
      userDocId: resolved.userDocId,
      deducted: {
        fromCorporate: deductResult.fromCorporate,
        fromSelf: deductResult.fromSelf,
      },
    };
  }

  const dailyLimit = deductResult.updated[NEST.corporate_daily_limit];
  const spent = deductResult.updated[NEST.corporate_spent_today];

  return {
    success: true,
    ok: true,
    orderId: built.id,
    userDocId: resolved.userDocId,
    employeeId: resolved.data[FIELDS.EMPLOYEE_ID] || employeeId,
    amountRm,
    reference: body.reference || null,
    deducted: {
      fromCorporate: deductResult.fromCorporate,
      fromSelf: deductResult.fromSelf,
    },
    balancesAfter: {
      corporateBalance: deductResult.updated[NEST.corporate_balance],
      selfBalance: deductResult.updated[NEST.self],
      corporateSpentToday: spent,
      remainingToday: dailyLimit > 0 ? Math.max(0, roundRm(dailyLimit - spent)) : null,
    },
    companyPaymentDetail,
  };
}

function ceriaBalanceHttpStatus(code) {
  if (code === 'EMPLOYEE_NOT_FOUND') return 404;
  if (code === 'EMPLOYEE_INACTIVE' || code === 'INSUFFICIENT_BALANCE') return 409;
  if (code === 'ORDER_SAVE_FAILED') return 500;
  return 400;
}

function encryptEmployeeIdCore({ companyId, employeeId }) {
  const cid = String(companyId || '').trim();
  const eid = String(employeeId || '').trim();
  if (!cid) {
    return { success: false, code: 'COMPANY_ID_REQUIRED', message: 'company_id is required' };
  }
  if (!eid) {
    return { success: false, code: 'EMPLOYEE_ID_REQUIRED', message: 'employee_id is required' };
  }
  try {
    const encryptedEmployeeId = encryptEmployeeId(eid, cid);
    return {
      success: true,
      ok: true,
      company_id: cid,
      employee_id: eid,
      encrypted_employee_id: encryptedEmployeeId,
    };
  } catch (error) {
    return {
      success: false,
      code: error.code || 'ENCRYPT_FAILED',
      message: error.message || String(error),
    };
  }
}

function decryptEmployeeIdCore({ companyId, encryptedEmployeeId }) {
  const cid = String(companyId || '').trim();
  const enc = String(encryptedEmployeeId || '').trim();
  if (!cid) {
    return { success: false, code: 'COMPANY_ID_REQUIRED', message: 'company_id is required' };
  }
  const result = decryptEmployeeId(enc, cid);
  if (!result.ok) {
    return { success: false, code: result.code, message: result.message };
  }
  return {
    success: true,
    ok: true,
    company_id: cid,
    employee_id: result.employeeId,
  };
}

function verifyEmployeeIdCore(params) {
  return decryptEmployeeIdCore(params);
}

class CeriaRouter {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.get('/about', this.about.bind(this));
    this.router.post('/set-corporate-credits', this.setCorporateCredits.bind(this));
    this.router.post(
      '/execute-corporate-carry-forward-topup',
      this.executeCorporateCarryForwardTopup.bind(this),
    );
    this.router.post(
      '/reset-corporate-spend-today',
      this.resetCorporateSpendToday.bind(this),
    );
    this.router.post(
      '/reset-corporate',
      this.resetCorporateSpendToday.bind(this),
    );
    this.router.post(
      '/apply-standing-instructions',
      this.applyStandingInstructions.bind(this),
    );
    this.router.post('/get-balance', this.getBalance.bind(this));
    this.router.post('/deduct-balance', this.deductBalance.bind(this));
    this.router.post('/encrypt-employee-id', this.encryptEmployeeId.bind(this));
    this.router.post('/decrypt-employee-id', this.decryptEmployeeId.bind(this));
    this.router.post('/verify-employee-id', this.verifyEmployeeId.bind(this));
  }

  getRouter() {
    return this.router;
  }

  about(req, res) {
    res.json({ version: '1.0.3', service: 'Ceria corporate credit API' });
  }

  async encryptEmployeeId(req, res) {
    try {
      const body = req.body || {};
      const out = encryptEmployeeIdCore({
        companyId: extractCompanyIdFromBody(body),
        employeeId: extractPlainEmployeeIdFromBody(body),
      });
      if (!out.success) {
        return res.status(ceriaBalanceHttpStatus(out.code)).json({
          ok: false,
          success: false,
          code: out.code,
          message: out.message,
        });
      }
      return res.status(200).json(out);
    } catch (error) {
      console.error('encryptEmployeeId error:', error);
      return res.status(500).json({
        ok: false,
        success: false,
        message: error.message || String(error),
      });
    }
  }

  async decryptEmployeeId(req, res) {
    try {
      const body = req.body || {};
      const out = decryptEmployeeIdCore({
        companyId: extractCompanyIdFromBody(body),
        encryptedEmployeeId: extractEncryptedEmployeeIdFromBody(body),
      });
      if (!out.success) {
        return res.status(ceriaBalanceHttpStatus(out.code)).json({
          ok: false,
          success: false,
          code: out.code,
          message: out.message,
        });
      }
      return res.status(200).json(out);
    } catch (error) {
      console.error('decryptEmployeeId error:', error);
      return res.status(500).json({
        ok: false,
        success: false,
        message: error.message || String(error),
      });
    }
  }

  async verifyEmployeeId(req, res) {
    return this.decryptEmployeeId(req, res);
  }

  async getBalance(req, res) {
    try {
      const body = req.body || {};
      const out = await ceriaGetBalanceCore({
        companyId: extractCompanyIdFromBody(body),
        encryptedEmployeeId: extractEncryptedEmployeeIdFromBody(body),
        timeZone: body.timeZone,
      });
      if (!out.success) {
        return res.status(ceriaBalanceHttpStatus(out.code)).json({
          ok: false,
          success: false,
          code: out.code,
          message: out.message,
        });
      }
      return res.status(200).json(out);
    } catch (error) {
      console.error('getBalance error:', error);
      return res.status(500).json({
        ok: false,
        success: false,
        message: error.message || String(error),
      });
    }
  }

  async deductBalance(req, res) {
    try {
      const out = await ceriaDeductBalanceCore(req.body || {});
      if (!out.success) {
        return res.status(ceriaBalanceHttpStatus(out.code)).json({
          ok: false,
          success: false,
          code: out.code,
          message: out.message,
          available: out.available,
        });
      }
      return res.status(200).json(out);
    } catch (error) {
      console.error('deductBalance error:', error);
      return res.status(500).json({
        ok: false,
        success: false,
        message: error.message || String(error),
      });
    }
  }

  async resetCorporateSpendToday(req, res) {
    try {
      const body = req.body || {};
      const out = await resetCorporateSpendTodayCore({
        companyId: body.companyId,
        dryRun: body.dryRun === true,
        timeZone: body.timeZone,
        docIds: body.docIds,
        logRunId: body.logRunId,
      });
      if (!out.success) {
        return res.status(400).json({
          success: false,
          message: out.message || 'Request failed',
          code: out.code,
        });
      }
      return res.status(200).json(out);
    } catch (error) {
      console.error('resetCorporateSpendToday error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || String(error),
      });
    }
  }

  async applyStandingInstructions(req, res) {
    try {
      const body = req.body || {};
      const out = await applyStandingInstructionsCore({
        companyId: body.companyId,
        dryRun: body.dryRun === true,
        timeZone: body.timeZone,
        logRunId: body.logRunId,
      });
      if (!out.success) {
        return res.status(400).json({
          success: false,
          message: out.message || 'Request failed',
          code: out.code,
        });
      }
      return res.status(200).json(out);
    } catch (error) {
      console.error('applyStandingInstructions error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || String(error),
      });
    }
  }

  async executeCorporateCarryForwardTopup(req, res) {
    try {
      const body = req.body || {};
      const out = await executeCorporateCarryForwardTopupCore({
        companyId: body.companyId,
        dryRun: body.dryRun === true,
        timeZone: body.timeZone,
        corporateDailyLimit: body.corporateDailyLimit,
      });
      if (!out.success) {
        const status = out.code === 'SETTINGS_MISSING' ? 400 : 400;
        return res.status(status).json({
          success: false,
          message: out.message || 'Request failed',
          code: out.code,
        });
      }
      return res.status(200).json(out);
    } catch (error) {
      console.error('executeCorporateCarryForwardTopup error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || String(error),
      });
    }
  }

  async setCorporateCredits(req, res) {
    try {
      const body = req.body || {};
      const companyId = (body.companyId ?? '').toString().trim();
      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: 'companyId is required',
        });
      }

      const dryRun = body.dryRun === true;
      const timeZone =
        (body.timeZone && String(body.timeZone).trim()) ||
        process.env.TZ ||
        'Asia/Kuala_Lumpur';
      const defaultAllocation = resolveDefaultAllocation(body.default);
      const allocations =
        body.allocations && typeof body.allocations === 'object' && !Array.isArray(body.allocations)
          ? body.allocations
          : {};

      let docIdFilter = null;
      if (body.docIds !== undefined && body.docIds !== null) {
        if (!Array.isArray(body.docIds)) {
          return res.status(400).json({
            success: false,
            message: 'docIds must be an array of strings when provided',
          });
        }
        docIdFilter = new Set(body.docIds.map((id) => String(id)));
      }

      const empCol = fireStore
        .collection('ceria_hub')
        .doc(companyId)
        .collection('employee');
      const snap = await empCol.get();

      let docs = snap.docs;
      if (docIdFilter) {
        docs = docs.filter((d) => docIdFilter.has(d.id));
      }

      const result = await processCorporateCreditsForEmployees({
        companyId,
        docs,
        defaultAllocation,
        allocations,
        timeZone,
        dryRun,
        ledgerSource: BALANCE_ADJUSTMENT_SOURCES.manualCredits,
        adjustedBy: 'set-corporate-credits API',
        ledgerReason: `Corporate credits set (${todayDayKey(timeZone)})`,
      });

      return res.status(200).json({
        success: true,
        dryRun,
        companyId,
        dayKey: result.dayKey,
        timeZone: result.timeZone,
        employeesProcessed: result.employeesProcessed,
        batchesCommitted: result.batchesCommitted,
        previews: result.previews,
      });
    } catch (error) {
      console.error('setCorporateCredits error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || String(error),
      });
    }
  }
}

CeriaRouter.executeCorporateCarryForwardTopupCore = executeCorporateCarryForwardTopupCore;
CeriaRouter.resetCorporateSpendTodayCore = resetCorporateSpendTodayCore;
CeriaRouter.applyStandingInstructionsCore = applyStandingInstructionsCore;
CeriaRouter.ceriaGetBalanceCore = ceriaGetBalanceCore;
CeriaRouter.ceriaDeductBalanceCore = ceriaDeductBalanceCore;
CeriaRouter.encryptEmployeeIdCore = encryptEmployeeIdCore;
CeriaRouter.decryptEmployeeIdCore = decryptEmployeeIdCore;
CeriaRouter.verifyEmployeeIdCore = verifyEmployeeIdCore;
CeriaRouter.recordSelfTopupLedgerEntry = recordSelfTopupLedgerEntry;
CeriaRouter.writeBalanceAdjustment = writeBalanceAdjustment;

module.exports = CeriaRouter;
