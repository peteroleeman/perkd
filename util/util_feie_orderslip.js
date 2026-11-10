/**
 * UtilFeieOrderSlip - JavaScript port of Flutter UtilFeie order-slip logic.
 * Converts orders to KDS slip JSON; automatic style 2 uses the new normal renderer
 * (legacy endpoint dispatch remains unchanged).
 */
const UtilFeie = require('../feie/util_feie');
const { buildFeieNormalSlip } = require('./util_feie_normal_slip');
const { orderItemIsTakeAway } = UtilFeie;

const EMBEDDED_MOD_PRICE_SUFFIX = / \(\d+(\.\d+)?\)$/;

function trimStr(v) {
  if (v == null || v === '') return '';
  return String(v).trim();
}

function trimOrderItemRemark(item) {
  const r = item?.remark;
  if (r == null || r === '') return '';
  if (Array.isArray(r)) {
    return r
      .map((x) => (x && typeof x === 'object' && x.remark != null ? String(x.remark) : String(x)))
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ');
  }
  return String(r).trim();
}

function stripEmbeddedModPrice(title) {
  return String(title ?? '').replace(EMBEDDED_MOD_PRICE_SUFFIX, '').trim();
}

function itemIsOwnContainer(item) {
  const v = item?.isOwnContainer ?? item?.isowncontainer ?? item?.is_own_container;
  if (v === true || v === 1 || v === '1') return true;
  if (typeof v === 'string' && v.toLowerCase() === 'true') return true;
  return false;
}

function normalizeOrderType(raw) {
  if (raw === 1 || raw === '1') return 'Take Away';
  if (raw === 0 || raw === '0') return 'Dine In';
  const s = String(raw ?? '').trim();
  if (!s) return 'Dine In';
  const u = s.toUpperCase();
  if (u.includes('TAKE')) return 'Take Away';
  if (u.includes('DINE')) return 'Dine In';
  return s;
}

function isOffPremiseOrderServiceType(orderType) {
  const t = normalizeOrderType(orderType);
  return t === 'Take Away' || /take/i.test(t);
}

function effectiveIsOwnContainer(order, item, orderType) {
  if (itemIsOwnContainer(item)) return true;
  const whole =
    order?.wholeorderowncontainer ??
    order?.wholeOrderOwnContainer ??
    false;
  if (whole && isOffPremiseOrderServiceType(orderType)) return true;
  return false;
}

function feieOrderRemark(order) {
  const buzzer =
    order?.buzzerid ??
    order?.buzzerId ??
    order?.buzzer ??
    order?.tablebuzzer ??
    order?.tableBuzzer ??
    '';
  const id = trimStr(buzzer);
  return id ? `Buzzer: ${id}` : '';
}

function orderDateTimeFromOrder(order) {
  const raw =
    order?.orderdatetime ??
    order?.orderDateTime ??
    order?.createdat ??
    order?.createdAt ??
    '';
  if (!raw) return new Date().toISOString();
  if (raw instanceof Date) return raw.toISOString();
  const s = String(raw).trim();
  if (!s) return new Date().toISOString();
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return s;
}

function getPrinterCategoryIds(printer) {
  const ids =
    printer?.categoryids ??
    printer?.categoryIds ??
    printer?.categorynames ??
    printer?.categoryNames ??
    [];
  return Array.isArray(ids) ? ids.map((c) => String(c)) : [];
}

function matchesPrinterCategory(menuCategory, categoryIds) {
  if (!categoryIds || categoryIds.length === 0) return true;
  const cat = String(menuCategory ?? '');
  return categoryIds.includes(cat);
}

function orderItemMatchesCategoryIds(orderItem, categoryIds) {
  if (!categoryIds || categoryIds.length === 0) return true;
  const cat = orderItem?.category ?? '';
  return categoryIds.includes(String(cat));
}

function feieModInfoListFromModInfoString(modInfo) {
  const modInfoList = [];
  const raw = trimStr(modInfo);
  if (!raw || raw === 'null') return modInfoList;

  if (raw.includes(',')) {
    for (const mod of raw.split(',')) {
      const t = trimStr(mod);
      if (!t) continue;
      modInfoList.push({ title: stripEmbeddedModPrice(t), qty: 1 });
    }
    return modInfoList;
  }

  try {
    const modInfoMap = JSON.parse(raw);
    if (modInfoMap && typeof modInfoMap === 'object' && !Array.isArray(modInfoMap)) {
      for (const value of Object.values(modInfoMap)) {
        if (value && typeof value === 'object') {
          modInfoList.push({
            title: stripEmbeddedModPrice(value.title ?? ''),
            qty: parseInt(String(value.qty ?? '1'), 10) || 1,
          });
        }
      }
      return modInfoList;
    }
  } catch (_) {
    // fall through
  }

  modInfoList.push({ title: stripEmbeddedModPrice(raw), qty: 1 });
  return modInfoList;
}

function feieModInfoListFromOrderItem(orderItem) {
  const fromDetail = [];
  const modDetail = orderItem?.modifiers ?? orderItem?.modifierDetail;
  if (modDetail && typeof modDetail === 'object') {
    for (const modifierList of Object.values(modDetail)) {
      if (!Array.isArray(modifierList)) continue;
      for (const modifier of modifierList) {
        const title = trimStr(modifier?.title);
        if (title) fromDetail.push({ title, qty: 1 });
      }
    }
  }
  if (fromDetail.length > 0) return fromDetail;

  return feieModInfoListFromValue(orderItem?.modinfo ?? orderItem?.modInfo);
}

function feieModInfoListFromValue(modInfo) {
  if (!modInfo || modInfo === 'null') return [];
  if (Array.isArray(modInfo)) {
    return modInfo.map((m) => ({
      title: stripEmbeddedModPrice(
        typeof m === 'object' && m != null ? m.title ?? String(m) : String(m),
      ),
      qty:
        typeof m === 'object' && m != null
          ? parseInt(String(m.qty ?? '1'), 10) || 1
          : 1,
    }));
  }
  if (typeof modInfo === 'object') {
    return [
      {
        title: stripEmbeddedModPrice(modInfo.title ?? ''),
        qty: parseInt(String(modInfo.qty ?? '1'), 10) || 1,
      },
    ];
  }
  return feieModInfoListFromModInfoString(modInfo);
}

function modifierTitlesWithCounts(titles) {
  const counts = new Map();
  for (const title of titles) {
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  return [...counts].map(([title, count]) => count > 1 ? `${title} x${count}` : title);
}

function portionLabel(portion) {
  const label = trimStr(portion?.label);
  if (label) return label;
  const size = Number(portion?.size);
  const unit = trimStr(portion?.unit);
  return Number.isFinite(size) && size > 0 && unit
    ? `${Number(size.toFixed(3))}${unit}`
    : '';
}

function feiePortionModifiers(orderItem) {
  const portions = orderItem?.portions;
  const portionLine = (title) => ({ title, isPortionLine: true });
  if (!Array.isArray(portions) || !portions.length || !portions.every(portionLabel)) {
    const summary = typeof orderItem?.portionsummary === 'string' ? orderItem.portionsummary : '';
    const lines = summary.split('|').map((line) => line.trim()).filter(Boolean);
    return lines.length ? lines.map(portionLine) : feieModInfoListFromOrderItem(orderItem);
  }

  const remainingPortionPicks = new Map();
  const lines = portions.map((portion) => {
    const free = [];
    const paid = [];
    const modifiers = Array.isArray(portion.modifiers) ? portion.modifiers : [];
    for (const modifier of modifiers) {
      const title = trimStr(modifier?.title);
      if (!title) continue;
      const matchTitle = stripEmbeddedModPrice(title);
      remainingPortionPicks.set(matchTitle, (remainingPortionPicks.get(matchTitle) ?? 0) + 1);
      const price = Number(modifier.price);
      (Number.isFinite(price) && price !== 0 ? paid : free).push(title);
    }
    const freeText = modifierTitlesWithCounts(free).join(', ');
    const paidText = modifierTitlesWithCounts(paid).map((title) => `+ ${title}`).join(', ');
    const selections = [freeText, paidText].filter(Boolean).join(' ');
    const label = portionLabel(portion);
    return portionLine(selections ? `${label}: ${selections}` : label);
  });

  const flat = feieModInfoListFromValue(orderItem.modinfo ?? orderItem.modInfo);
  if (!flat.length) return [...lines, ...feieModInfoListFromOrderItem(orderItem)];
  for (const modifier of flat) {
    const title = stripEmbeddedModPrice(modifier.title);
    const remaining = remainingPortionPicks.get(title) ?? 0;
    const used = Math.min(modifier.qty, remaining);
    if (used <= 0) {
      lines.push(modifier);
      continue;
    }
    remainingPortionPicks.set(title, remaining - used);
    if (modifier.qty > used) lines.push({ ...modifier, qty: modifier.qty - used });
  }
  return lines;
}

function orderItemIsSet(orderItem) {
  for (let s = 1; s <= 5; s++) {
    const key = `submenus${s}`;
    const alt = `subMenus${s}`;
    const subs = orderItem?.[key] ?? orderItem?.[alt] ?? [];
    if (Array.isArray(subs) && subs.length > 0) return true;
  }
  return !!(orderItem?.isset ?? orderItem?.isSet);
}

function appendSetSubmenuModifiers(orderItem, modInfoList, categoryIds = []) {
  if (!orderItemIsSet(orderItem)) return;
  const filterByCategory = categoryIds.length > 0;

  function appendSubmenus(submenus, prefix) {
    if (!Array.isArray(submenus)) return;
    for (const submenu of submenus) {
      const menuModel =
        submenu && typeof submenu === 'object' ? submenu : { title: String(submenu) };
      if (menuModel.id === 'no_selection') continue;
      if (
        filterByCategory &&
        !matchesPrinterCategory(menuModel.category, categoryIds)
      ) {
        continue;
      }
      const title = trimStr(menuModel.title ?? menuModel);
      if (!title) continue;
      modInfoList.push({ title: `${prefix}:${title}`, qty: 1 });
    }
  }

  for (let s = 1; s <= 5; s++) {
    const subs = orderItem?.[`submenus${s}`] ?? orderItem?.[`subMenus${s}`] ?? [];
    if (subs.length > 0) appendSubmenus(subs, `S${s}`);
  }
}

function buildFeieOrderItem(order, orderItem, categoryIds = []) {
  const orderType =
    order?.ordertype ?? order?.orderType ?? order?.getOrderType?.() ?? 'Dine In';
  const modInfoList = feiePortionModifiers(orderItem);
  appendSetSubmenuModifiers(orderItem, modInfoList, categoryIds);

  return {
    title: orderItem?.title ?? '',
    qty: orderItem?.qty ?? orderItem?.quantity ?? 1,
    modInfo: modInfoList,
    remark: trimOrderItemRemark(orderItem),
    isTakeAway: orderItemIsTakeAway(orderItem),
    isOwnContainer: effectiveIsOwnContainer(order, orderItem, orderType),
  };
}

function getReceiptTypeFromFeieType(typeRaw) {
  const s = String(typeRaw ?? '');
  const m = s.match(/(\d)\s*$/);
  if (m) return parseInt(m[1], 10) || 0;
  return 0;
}

function getPrinterReceiptType(printer) {
  const rt = printer?.receipttype ?? printer?.receiptType;
  if (rt != null && rt !== '') {
    const n = parseInt(String(rt), 10);
    if (!Number.isNaN(n)) return n;
  }
  return getReceiptTypeFromFeieType(printer?.type);
}

function getFeieOrderSlipPrinters(storeModel) {
  if (Array.isArray(storeModel?.feieorderslipprinter) && storeModel.feieorderslipprinter.length > 0) {
    return storeModel.feieorderslipprinter;
  }
  if (Array.isArray(storeModel?.feies) && storeModel.feies.length > 0) {
    return storeModel.feies.filter((feie) =>
      String(feie?.type ?? feie?.Type ?? '').toUpperCase().includes('O'),
    );
  }
  return [];
}

/** Automatic kitchen slips default to the redesigned style 2. */
const ORDER_SLIP_STYLE = 2;

function normalizeOrderSlipStyle(raw) {
  const n = Number(raw);
  if (n === 1) return 1;
  if (n === 2) return 2;
  return 0;
}

function resolveEffectiveOrderSlipStyle(style, feieOrderStyle) {
  if (style != null) return normalizeOrderSlipStyle(style);
  if (feieOrderStyle != null) return normalizeOrderSlipStyle(feieOrderStyle);
  return ORDER_SLIP_STYLE;
}

function slipStyleUsesCombinedItemTitle(style) {
  return style === 1 || style === 2;
}

function printOrderItemSlipPOSByStyle(feie, order, bReprint, type, cancelled, style) {
  if (style === 2) {
    return feie.printOrderItemSlipPOSKitchenBig(order, bReprint, type, cancelled);
  }
  return feie.printOrderItemSlipPOS(order, bReprint, type, cancelled, style);
}

function resolveEnableIndividual(storeModel, enableOverride) {
  if (enableOverride != null) return !!enableOverride;
  return !!(
    storeModel?.feieEnableIndividualSlip ??
    storeModel?.feies?.enableIndividualSlip ??
    false
  );
}

class UtilFeieOrderSlip {
  static convertToFeieOrder(order, isReprint = false, storeModel = null) {
    const orderTypeRaw = order?.ordertype ?? order?.orderType ?? order?.getOrderType?.() ?? '';
    const items = order?.orderitems ?? order?.orderItems ?? order?.getOrderItems?.() ?? [];
    const orderItems = items.map((item) => buildFeieOrderItem(order, item, []));

    return {
      sn: '',
      printerName: '',
      orderId: order?.orderid ?? order?.orderId ?? order?.id ?? '',
      //storeTitle: storeModel?.title ?? order?.storetitle ?? order?.storeTitle ?? '',
      //table: order?.mobileassignedtable ?? order?.mobileAssignedTable ?? '',
      isReprint: !!isReprint,
      type: 0,
      remark: feieOrderRemark(order),
      //orderMode: normalizeOrderType(orderTypeRaw),
      orderItems,
      dateTime: orderDateTimeFromOrder(order),
      style: ORDER_SLIP_STYLE,
      cancelled: false,
      receiptCurrent: null,
      receiptTotal: null,
    };
  }

  static convertToFeieOrderWithCategoryIds(order, isReprint, categoryIds, storeModel = null) {
    const base = UtilFeieOrderSlip.convertToFeieOrder(order, isReprint, storeModel);
    const cats = Array.isArray(categoryIds) ? categoryIds.map(String) : [];
    const items = order?.orderitems ?? order?.orderItems ?? order?.getOrderItems?.() ?? [];
    base.orderItems = [];

    for (const item of items) {
      if (!orderItemMatchesCategoryIds(item, cats)) continue;
      base.orderItems.push(buildFeieOrderItem(order, item, cats));
    }
    return base;
  }

  static convertToFeieOrderWithCategoryFilter(order, isReprint, printer, storeModel = null) {
    const categoryIds = getPrinterCategoryIds(printer);
    const feieOrder = UtilFeieOrderSlip.convertToFeieOrderWithCategoryIds(
      order,
      isReprint,
      categoryIds,
      storeModel,
    );
    feieOrder.sn = printer?.title ?? printer?.sn ?? '';
    feieOrder.printerName = printer?.info ?? '';
    feieOrder.type = getPrinterReceiptType(printer);
    return feieOrder;
  }

  static feieIndividualOrderMode(item) {
    const base = item.isTakeAway ? 'Take Away' : 'Dine In';
    if (item.isOwnContainer && item.isTakeAway) return `${base} BYOC`;
    return base;
  }

  static feieCombinedItemTitle(item, style) {
    if (!slipStyleUsesCombinedItemTitle(style)) return item.title;
    let t = item.title ?? '';
    if (item.isTakeAway) {
      t += ' >> TA';
      if (item.isOwnContainer) t += ' BYOC';
    }
    return t;
  }

  static buildOrderSlipPayload(feieOrder, { individual = false, style } = {}) {
    const slipStyle = resolveEffectiveOrderSlipStyle(style, feieOrder.style);
    const payload = { ...feieOrder };
    if (payload.orderDateTime && !payload.dateTime) {
      payload.dateTime = payload.orderDateTime;
    }
    payload.style = slipStyle;

    if (individual) {
      if (feieOrder.orderItems?.length > 0) {
        payload.orderMode = UtilFeieOrderSlip.feieIndividualOrderMode(
          feieOrder.orderItems[0],
        );
      }
    } else if (slipStyleUsesCombinedItemTitle(slipStyle) && Array.isArray(feieOrder.orderItems)) {
      payload.orderItems = feieOrder.orderItems.map((item) => ({
        ...item,
        title: UtilFeieOrderSlip.feieCombinedItemTitle(item, slipStyle),
      }));
    }
    return payload;
  }

  static copyOrderWithItems(order, items) {
    return {
      ...order,
      orderItems: items,
    };
  }

  static expandToIndividualSlips(feieOrder) {
    const slips = [];
    for (const item of feieOrder.orderItems ?? []) {
      const unitQty = item.qty < 1 ? 1 : item.qty;
      for (let i = 0; i < unitQty; i++) {
        slips.push(
          UtilFeieOrderSlip.copyOrderWithItems(feieOrder, [
            {
              ...item,
              qty: 1,
            },
          ]),
        );
      }
    }
    return slips;
  }

  static buildKdsOrderSlipExApiBody(
    feieOrder,
    { individual = false, style, cancelled = false } = {},
  ) {
    const slipStyle = resolveEffectiveOrderSlipStyle(style, feieOrder.style);
    const payload = UtilFeieOrderSlip.buildOrderSlipPayload(feieOrder, {
      individual,
      style: slipStyle,
    });
    const body = {
      ...payload,
      sn: feieOrder.sn,
      printerName: feieOrder.printerName ?? '',
      type: feieOrder.type ?? 0,
      isReprint: !!feieOrder.isReprint,
      individual: !!individual,
      style: slipStyle,
    };
    if (feieOrder.receiptCurrent != null) {
      body.receiptCurrent = feieOrder.receiptCurrent;
    }
    if (feieOrder.receiptTotal != null) {
      body.receiptTotal = feieOrder.receiptTotal;
    }
    if (cancelled) {
      body.cancelled = true;
    }
    if (body.orderDateTime && !body.dateTime) {
      body.dateTime = body.orderDateTime;
      delete body.orderDateTime;
    }
    if (body.buzzer && !body.table) {
      body.table = body.buzzer;
    }
    return body;
  }

  /**
   * Server-side KDS print core; normal style 2 shares the new endpoint renderer.
   * @param {object} body - kdsorderslipexap JSON body
   * @param {{ isJP?: boolean, cancelled?: boolean }} opts
   */
  static async executePrintOrderSlipEx(body, { isJP = true, cancelled = false } = {}) {
    const feie = new UtilFeie();
    const normalized = { ...body };
    if (normalized.orderDateTime && !normalized.dateTime) {
      normalized.dateTime = normalized.orderDateTime;
    }
    if (normalized.buzzer && !normalized.table) {
      normalized.table = normalized.buzzer;
    }

    const style =
      normalized.style != null && normalized.style !== ''
        ? normalizeOrderSlipStyle(normalized.style)
        : ORDER_SLIP_STYLE;
    const isReprint = !!normalized.isReprint;
    const type = normalized.type ?? 0;
    const payload = UtilFeieOrderSlip.buildOrderSlipPayload(normalized, {
      individual: !!normalized.individual,
      style,
    });

    const feieOrder = feie.createFeieOrderSlipFromJSON(payload);
    const content = style === 2 && !cancelled
      ? buildFeieNormalSlip(feie, feieOrder, isReprint, type, style)
      : printOrderItemSlipPOSByStyle(feie, feieOrder, isReprint, type, cancelled, style);
    return feie.printFeie2(feieOrder.sn, content, isJP);
  }

  static async printOrderSlip(feieOrder, { individual = false, isJP = true, style } = {}) {
    const body = UtilFeieOrderSlip.buildKdsOrderSlipExApiBody(feieOrder, {
      individual,
      style: resolveEffectiveOrderSlipStyle(style, feieOrder.style),
    });
    await UtilFeieOrderSlip.executePrintOrderSlipEx(body, { isJP, cancelled: false });
    return body;
  }

  static async printOrderSlipsRespectingIndividual(
    feieOrder,
    { isJP = true, enableIndividual = false, style } = {},
  ) {
    const payloads = [];
    if (!feieOrder.orderItems || feieOrder.orderItems.length === 0) {
      return { jobsSent: 0, payloads };
    }

    const slipStyle = resolveEffectiveOrderSlipStyle(style, feieOrder.style);

    if (!enableIndividual) {
      feieOrder.receiptCurrent = null;
      feieOrder.receiptTotal = null;
      const body = await UtilFeieOrderSlip.printOrderSlip(feieOrder, {
        individual: false,
        isJP,
        style: slipStyle,
      });
      payloads.push(body);
      return { jobsSent: 1, payloads };
    }

    const slips = UtilFeieOrderSlip.expandToIndividualSlips(feieOrder);
    const total = slips.length;
    for (let i = 0; i < slips.length; i++) {
      const slip = slips[i];
      slip.receiptCurrent = i + 1;
      slip.receiptTotal = total;
      slip.sn = feieOrder.sn;
      slip.type = feieOrder.type;
      slip.isReprint = feieOrder.isReprint;
      slip.printerName = feieOrder.printerName;
      slip.style = slipStyle;
      const body = await UtilFeieOrderSlip.printOrderSlip(slip, {
        individual: true,
        isJP,
        style: slipStyle,
      });
      payloads.push(body);
    }
    return { jobsSent: total, payloads };
  }

  static async printOrderSlipCancellation(feieOrder, { isJP = true, style } = {}) {
    const body = UtilFeieOrderSlip.buildKdsOrderSlipExApiBody(
      { ...feieOrder, receiptCurrent: null, receiptTotal: null },
      {
        individual: false,
        style: resolveEffectiveOrderSlipStyle(style, feieOrder.style),
        cancelled: true,
      },
    );
    await UtilFeieOrderSlip.executePrintOrderSlipEx(body, { isJP, cancelled: true });
    return body;
  }

  /**
   * @param {object} _order
   * @param {object} store
   * @param {{ isReprint?: boolean, enableIndividual?: boolean, isJP?: boolean }} [opts]
   * Kitchen slip style is always style 2 (ignores store style).
   */
  static async printFeieOrderSlipsForOrder(
    order,
    store,
    { isReprint = false, enableIndividual, isJP = true } = {},
  ) {
    const printers = getFeieOrderSlipPrinters(store);
    const slipStyle = ORDER_SLIP_STYLE;
    const individual = resolveEnableIndividual(store, enableIndividual);

    let jobsSent = 0;
    const errors = [];
    const slipPrintPayloads = [];

    for (const printer of printers) {
      const sn = trimStr(printer?.title ?? printer?.sn);
      if (!sn) continue;

      try {
        const feieOrder = UtilFeieOrderSlip.convertToFeieOrderWithCategoryFilter(
          order,
          isReprint,
          printer,
          store,
        );
        if (!feieOrder.orderItems || feieOrder.orderItems.length === 0) {
          continue;
        }
        feieOrder.style = slipStyle;

        const result = await UtilFeieOrderSlip.printOrderSlipsRespectingIndividual(
          feieOrder,
          { isJP, enableIndividual: individual, style: slipStyle },
        );
        jobsSent += result.jobsSent;
        if (result.payloads?.length) {
          slipPrintPayloads.push(...result.payloads);
        }
      } catch (err) {
        errors.push({
          sn,
          printer: printer?.info ?? '',
          error: err?.message ?? String(err),
        });
      }
    }

    return { jobsSent, errors, slipPrintPayloads };
  }

  static async printFeieOrderSlipCancellationsForVoid(order, store, { isJP = true } = {}) {
    const printers = getFeieOrderSlipPrinters(store);
    const slipStyle = ORDER_SLIP_STYLE;
    const errors = [];

    for (const printer of printers) {
      const sn = trimStr(printer?.title ?? printer?.sn);
      if (!sn) continue;

      try {
        const feieOrder = UtilFeieOrderSlip.convertToFeieOrderWithCategoryFilter(
          order,
          true,
          printer,
          store,
        );
        if (!feieOrder.orderItems || feieOrder.orderItems.length === 0) {
          continue;
        }
        feieOrder.style = slipStyle;
        await UtilFeieOrderSlip.printOrderSlipCancellation(feieOrder, {
          isJP,
          style: slipStyle,
        });
      } catch (err) {
        errors.push({
          sn,
          printer: printer?.info ?? '',
          error: err?.message ?? String(err),
        });
      }
    }

    return { errors };
  }
}

module.exports = UtilFeieOrderSlip;
module.exports.normalizeOrderSlipStyle = normalizeOrderSlipStyle;
module.exports.printOrderItemSlipPOSByStyle = printOrderItemSlipPOSByStyle;
