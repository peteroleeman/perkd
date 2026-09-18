/**
 * UtilFeieReceipt - JavaScript port of Flutter UtilFeieReceipt
 * Receipt formatting for Feie cloud printers.
 * Matches the format used by the foodioonline Flutter app when calling api.foodio.online
 * (e.g. /odoo/kdsorderslipfrominfoap, /pos/printlabelap)
 *
 * Order slip (kitchen) printing: use util_feie_orderslip.js (/pos/kdsorderslipexap layout).
 *
 * Flutter _handleFeieReceipt sample logic (reference):
 * 1. Guard: if (getFeieCount() <= 0 || paymentStatus != paid) return;
 * 2. Receipt printers: for each device in getFeieReceiptPrinter(),
 *    printFeie(device.title, printOrderReceiptFromOrder(store, order, type: device.getReceiptType()))
 * 3. Order slip printers: for each device in getFeieOrderSlipPrinter(),
 *    for each order item: feieOrder = convertToFeieOrder(order); feieOrder.sn = device.title;
 *    feieOrder.printerName = device.info; feieOrder.type = device.getReceiptType();
 *    UtilFeie.printOrderSlip(feieOrder) -> calls api.foodio.online
 * 4. Label printers: for each device in getFeieLabelPrinter(), if orderMode == "TAKE AWAY",
 *    feieOrder = convertToFeieOrder(order); feieOrder.sn = printer.title; feieOrder.printerName = printer.info;
 *    printOrderLabel(feieOrder) -> calls api.foodio.online/pos/printlabelap
 */
const UtilFeie = require('../feie/util_feie');
const ReceiptFormat = UtilFeie.ReceiptFormat;
const ReceiptLine = UtilFeie.ReceiptLine;
const ReceiptDualTable = UtilFeie.ReceiptDualTable;

/** Line-item note from OrderItemModel.remark (string or [{ remark }][]) */
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

/** Maps ordertype / orderType (0|1 or strings) to a receipt label; matches gkash Feie slip logic. */
function formatOrderTypeLabel(raw) {
  if (raw === null || raw === undefined || raw === '') return '-';
  if (raw === 1 || raw === '1') return 'Take Away';
  if (raw === 0 || raw === '0') return 'Dine In';
  const s = String(raw).trim();
  if (s === '1') return 'Take Away';
  if (s === '0') return 'Dine In';
  const u = s.toUpperCase();
  if (u.includes('TAKE')) return 'Take Away';
  if (u.includes('DINE')) return 'Dine In';
  const n = Number(s);
  if (!Number.isNaN(n)) {
    if (n === 1) return 'Take Away';
    if (n === 0) return 'Dine In';
    return 'Dine In';
  }
  return s;
}

function hasReceiptField(value) {
  if (value == null) return false;
  const s = String(value).trim();
  return s !== '' && s !== '-';
}

function formatReceiptTotal(orderModel) {
  const raw = orderModel?.totalpaid ?? orderModel?.totalPaid
    ?? orderModel?.totalprice ?? orderModel?.totalPrice
    ?? orderModel?.getTotalAmount?.() ?? '';
  if (raw == null || raw === '') return '0.00';
  const str = String(raw).trim();
  const direct = parseFloat(str);
  if (!Number.isNaN(direct) && /^-?\d/.test(str)) return direct.toFixed(2);
  const match = str.match(/[\d,]+\.?\d*/);
  if (match) {
    const num = parseFloat(match[0].replace(/,/g, ''));
    if (!Number.isNaN(num)) return num.toFixed(2);
  }
  return str;
}

function resolveReceiptDateTime(orderModel) {
  const raw = orderModel?.dateTime ?? orderModel?.orderDateTime ?? '';
  let d = new Date();
  if (raw) {
    const parsed = new Date(String(raw).trim());
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  const dateFormatter = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
  return `${dateFormatter.format(d)}  ${timeFormatter.format(d)}`;
}

function resolveOrderTypeRaw(orderModel) {
  const raw = orderModel?.ordertype ?? orderModel?.orderType
    ?? (typeof orderModel?.getOrderType === 'function' ? orderModel.getOrderType() : undefined);
  if (raw == null || raw === '') return '';
  return raw;
}

function flushLine(line, receipt) {
  for (const l of line.getReceipt()) {
    receipt.push(l);
  }
}

function flushDualTable(dualTable, receipt) {
  for (const l of dualTable.getReceipt()) {
    receipt.push(l);
  }
}

function addCenteredDivider(line, receipt, char = '-', width = 32) {
  line.refresh();
  line.init(width);
  line.addMarkupLine(ReceiptFormat.setCenter(char.repeat(width)));
  flushLine(line, receipt);
}

function appendIndentedLine(line, receipt, width, text) {
  line.refresh();
  line.init(width);
  line.addMarkupLine(text);
  flushLine(line, receipt);
}

/** Feie renders extra gap if <BR> follows </C>; keep breaks inside one <C> block. */
function appendCenteredBlock(line, receipt, width, lines) {
  const content = lines.filter((l) => l != null && String(l).trim() !== '');
  if (content.length === 0) return;
  line.refresh();
  line.init(width);
  line.addMarkupLine(`<C>${content.join('<BR>')}</C>`);
  flushLine(line, receipt);
}

class UtilFeieReceipt {
  /**
   * @returns {string[]}
   */
  static printTest() {
    return [];
  }

  /**
   * Generate order receipt content for Feie printer
   * @param {Object} storeModel - Store data (title, etc)
   * @param {Object} orderModel - Order with orderitems/orderItems, paymenttype, etc
   * @param {Object} opts - { bReprint: boolean, type: 0|1 (0=normal, 1=wide) }
   * @returns {string[]} Receipt lines for Feie
   */
  static printOrderReceiptFromOrder(storeModel, orderModel, opts = {}) {
    const { bReprint = false, type = 0 } = opts;
    const receipt = [];
    const receiptWidth = type === 1 ? 48 : 32;
    const keyLen = 10;
    const valueLen = type === 1 ? 38 : 22;

    const now = new Date();
    const dualTable = new ReceiptDualTable();
    const line = new ReceiptLine();
    line.init(receiptWidth);

    if (bReprint === true) {
      line.refresh();
      line.init(receiptWidth);
      line.addMarkupLine(ReceiptFormat.setCenterBIG('*DUPLICATE*'));
      flushLine(line, receipt);
    }

    const storeTitle = orderModel?.storetitle ?? orderModel?.storeTitle ?? storeModel?.title ?? '';
    if (storeTitle !== '') {
      line.refresh();
      line.init(receiptWidth);
      line.addMarkupLine(`<C>${ReceiptFormat.setBold(storeTitle)}</C>`);
      flushLine(line, receipt);
    }

    addCenteredDivider(line, receipt, '=', receiptWidth);

    const headerLines = [];
    const remark = String(orderModel?.remark ?? '').trim();
    if (hasReceiptField(remark)) {
      headerLines.push(remark);
    }
    headerLines.push(resolveReceiptDateTime(orderModel));
    let hasOrderTypeInHeader = false;
    const orderTypeRaw = resolveOrderTypeRaw(orderModel);
    if (hasReceiptField(orderTypeRaw)) {
      const orderTypeLabel = formatOrderTypeLabel(orderTypeRaw);
      if (hasReceiptField(orderTypeLabel) && orderTypeLabel !== '-') {
        headerLines.push(orderTypeLabel);
        hasOrderTypeInHeader = true;
      }
    }
    appendCenteredBlock(line, receipt, receiptWidth, headerLines);

    if (hasOrderTypeInHeader) {
      addCenteredDivider(line, receipt, '-', receiptWidth);
    }

    dualTable.init(keyLen, valueLen);
    dualTable.addKey('Order No.');
    dualTable.addValue(orderModel?.orderid ?? orderModel?.orderId ?? '-');
    flushDualTable(dualTable, receipt);

    const onlineOrderId = orderModel?.onlineorderid ?? orderModel?.onlineOrderId ?? '';
    const orderId = orderModel?.orderid ?? orderModel?.orderId ?? '';
    if (onlineOrderId !== '' && onlineOrderId !== orderId) {
      dualTable.refresh();
      dualTable.init(keyLen, valueLen);
      dualTable.addKey('Online No.');
      dualTable.addValue(onlineOrderId);
      flushDualTable(dualTable, receipt);
    }

    addCenteredDivider(line, receipt, '-', receiptWidth);

    const orderItems = orderModel?.orderitems ?? orderModel?.orderItems ?? orderModel?.getOrderItems?.() ?? [];
    for (const element of orderItems) {
      const title = element?.title ?? '';
      const qty = element?.qty ?? element?.quantity ?? 1;
      const qtyLabel = `${qty}x`.padStart(5, ' ');

      appendIndentedLine(line, receipt, receiptWidth, `${qtyLabel}  ${title}<BR>`);

      if (UtilFeie.orderItemIsTakeAway(element)) {
        appendIndentedLine(line, receipt, receiptWidth, '     + Take Away<BR>');
      }

      const modInfo = element?.modinfo ?? element?.modInfo;
      if (modInfo !== undefined && modInfo !== '' && modInfo !== 'null') {
        if (Array.isArray(modInfo)) {
          for (const m of modInfo) {
            const modTitle = (typeof m === 'object' && m?.title) ? m.title : String(m);
            const modQty = (typeof m === 'object' && m?.qty > 1) ? ` x${m.qty}` : '';
            if (modTitle) {
              appendIndentedLine(line, receipt, receiptWidth, `     + ${modTitle}${modQty}<BR>`);
            }
          }
        } else if (modInfo && typeof modInfo === 'object' && modInfo.title) {
          appendIndentedLine(line, receipt, receiptWidth, `     + ${modInfo.title}<BR>`);
        } else {
          appendIndentedLine(line, receipt, receiptWidth, `     + ${String(modInfo)}<BR>`);
        }
      }

      for (let s = 1; s <= 5; s++) {
        const subMenus = element?.[`submenus${s}`] ?? element?.[`subMenus${s}`] ?? [];
        if (Array.isArray(subMenus) && subMenus.length > 0) {
          for (const menuItem of subMenus) {
            const itemTitle = (typeof menuItem === 'object' && menuItem !== null)
              ? (menuItem.title ?? menuItem) : String(menuItem);
            appendIndentedLine(line, receipt, receiptWidth, `     + ${itemTitle}<BR>`);
          }
        }
      }

      const lineRemark = trimOrderItemRemark(element);
      if (lineRemark) {
        appendIndentedLine(line, receipt, receiptWidth, `     Note: ${lineRemark}<BR>`);
      }
    }

    addCenteredDivider(line, receipt, '-', receiptWidth);

    dualTable.refresh();
    dualTable.init(keyLen, valueLen);

    const paymentType = orderModel?.paymenttype ?? orderModel?.paymentType ?? orderModel?.getPaymentType?.() ?? '';
    if (hasReceiptField(paymentType)) {
      dualTable.addKey('Paid with');
      dualTable.addValue(paymentType);
    }

    const cashAmount = orderModel?.cashamount ?? orderModel?.cashAmount ?? orderModel?.getCashAmount?.() ?? 0;
    if (parseFloat(cashAmount) > 0) {
      dualTable.addKey('Cash');
      dualTable.addValue(parseFloat(cashAmount).toFixed(2));
    }

    const epayAmount = orderModel?.epayamount ?? orderModel?.epayAmount ?? orderModel?.getEPayAmount?.() ?? 0;
    if (parseFloat(epayAmount) > 0) {
      const ePaymentTitle = (orderModel?.epaymenttype ?? orderModel?.ePaymentType ?? '') || 'ePayment';
      dualTable.addKey(ePaymentTitle);
      dualTable.addValue(parseFloat(epayAmount).toFixed(2));
    }

    dualTable.addKey('Total');
    dualTable.addValue(formatReceiptTotal(orderModel));
    flushDualTable(dualTable, receipt);

    addCenteredDivider(line, receipt, '-', receiptWidth);

    dualTable.refresh();
    dualTable.init(keyLen, valueLen);

    const orderTypeLabel = formatOrderTypeLabel(resolveOrderTypeRaw(orderModel));
    if (hasReceiptField(orderTypeLabel) && orderTypeLabel !== '-') {
      dualTable.addKey('Type');
      dualTable.addValue(orderTypeLabel);
    }

    const tableAssigned = orderModel?.table ?? orderModel?.buzzer
      ?? orderModel?.mobileassignedtable ?? orderModel?.mobileAssignedTable ?? '';
    if (hasReceiptField(tableAssigned)) {
      dualTable.addKey('Table');
      dualTable.addValue(tableAssigned);
    }

    const name = orderModel?.name ?? '';
    if (hasReceiptField(name)) {
      dualTable.addKey('Name');
      dualTable.addValue(name);
    }

    const contact = orderModel?.userphonenumber ?? orderModel?.userPhoneNumber ?? '';
    if (hasReceiptField(contact)) {
      dualTable.addKey('Contact');
      dualTable.addValue(contact);
    }

    if (dualTable.keyList.length > 0) {
      flushDualTable(dualTable, receipt);
      addCenteredDivider(line, receipt, '-', receiptWidth);
    }

    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const lastDayStr = `${String(lastDay.getDate()).padStart(2, '0')}/${String(lastDay.getMonth() + 1).padStart(2, '0')}/${lastDay.getFullYear()}`;
    appendCenteredBlock(line, receipt, receiptWidth, [
      'Scan QR for receipt',
      'or to submit einvoice',
      `Valid till ${lastDayStr}`,
    ]);

    const storeId = storeModel?.id ?? orderModel?.storeid ?? orderModel?.storeId ?? orderModel?.store_id ?? '';
    const orderIdVal = orderModel?.id ?? orderModel?.orderid ?? orderModel?.orderId ?? '';
    receipt.push(`<BR><QR>https://myeinvois.com.my/#/${storeId}/${orderIdVal}</QR>`);

    return receipt;
  }

  /**
   * @deprecated Use UtilFeieOrderSlip via /pos/kdsorderslipexap layout (util_feie_orderslip.js).
   * Generate order slip (kitchen slip)
   * @param {Object} orderModel - Order with orderItems
   * @param {Object} opts - { type: 0|1 }
   * @returns {string[]}
   */
  static printOrderSlip(orderModel, opts = {}) {
    const { type = 0 } = opts;
    const receipt = [];

    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const currentDate = dateFormatter.format(now);
    const currentTime = timeFormatter.format(now);

    let keyLen = 16;
    let valueLen = 16;
    if (type === 1) {
      keyLen = 24;
      valueLen = 24;
    }

    const dualTable = new ReceiptDualTable();
    const line = new ReceiptLine();
    line.init(keyLen + valueLen);
    dualTable.init(keyLen, valueLen);

    line.addText(ReceiptFormat.setCenter(`${currentDate} ${currentTime}`));
    for (const l of line.getReceipt()) {
      receipt.push(l);
    }

    dualTable.refresh();
    dualTable.addKey(orderModel?.orderid ?? orderModel?.orderId ?? '');
    dualTable.addValue(orderModel?.mobileassignedtable ?? orderModel?.mobileAssignedTable ?? '-');

    for (const l of dualTable.getReceipt()) {
      receipt.push(l);
    }

    const orderItems = orderModel?.orderitems ?? orderModel?.orderItems ?? [];
    let totalQty = 0;
    for (const el of orderItems) {
      totalQty += (el?.qty ?? 0);
    }

    line.refresh();
    for (const element of orderItems) {
      const title = element?.title ?? '';
      const qty = element?.qty ?? element?.quantity ?? 0;
      line.addText(String(title) + '<BR>');
      line.addText(ReceiptFormat.setRightAlign(`<B>${qty}/${totalQty}</B>`));

      const modInfo = element?.modinfo ?? element?.modInfo ?? '';
      if (modInfo !== '' && modInfo !== 'null') {
        line.addText('S:' + modInfo);
      }

      for (let s = 1; s <= 5; s++) {
        const key = `submenus${s}`;
        const subMenus = element?.[key] ?? element?.[`subMenus${s}`] ?? [];
        if (Array.isArray(subMenus) && subMenus.length > 0) {
          for (let i = 0; i < subMenus.length; i++) {
            const menuItem = subMenus[i];
            const itemTitle = (typeof menuItem === 'object' && menuItem !== null) ? (menuItem.title ?? menuItem) : String(menuItem);
            const label = subMenus.length === 1 ? `S${s}:` : `S${s}-${i + 1}:`;
            line.addText(label + itemTitle);
          }
        }
      }

      const lineRemark = trimOrderItemRemark(element);
      if (lineRemark) {
        line.addText('R: ' + lineRemark + '<BR>');
      }

      line.addText('<BR>');
      line.addText((orderModel?.name ?? '') + '<BR>');
      line.addText(orderModel?.userphonenumber ?? orderModel?.userPhoneNumber ?? '-');

      for (const l of line.getReceipt()) {
        receipt.push(l);
      }
    }

    return receipt;
  }

  /**
   * @deprecated Use UtilFeieOrderSlip via /pos/kdsorderslipexap layout (util_feie_orderslip.js).
   * Generate single order item slip
   * @param {Object} orderModel - Order
   * @param {Object} element - Order item
   * @param {Object} opts - { bReprint: boolean, type: 0|1 }
   * @returns {string[]}
   */
  static printOrderItemSlip(orderModel, element, opts = {}) {
    const { bReprint = false, type = 0 } = opts;
    const receipt = [];

    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const currentDate = dateFormatter.format(now);
    const currentTime = timeFormatter.format(now);

    let keyLen = 16;
    let valueLen = 16;
    if (type === 1) {
      keyLen = 24;
      valueLen = 24;
    }

    const dualTable = new ReceiptDualTable();
    const line = new ReceiptLine();
    line.init(keyLen + valueLen);
    dualTable.init(keyLen, valueLen);

    if (bReprint === true) {
      line.addText(ReceiptFormat.setCenterBIG('*DUPLICATE*'));
    }

    line.addText(ReceiptFormat.setCenter(`${currentDate} ${currentTime}`));
    for (const l of line.getReceipt()) {
      receipt.push(l);
    }

    dualTable.refresh();
    dualTable.addKey(orderModel?.orderid ?? orderModel?.orderId ?? '');
    dualTable.addValue(orderModel?.mobileassignedtable ?? orderModel?.mobileAssignedTable ?? '-');

    for (const l of dualTable.getReceipt()) {
      receipt.push(l);
    }

    const orderItems = orderModel?.orderitems ?? orderModel?.orderItems ?? [];
    let totalQty = 0;
    for (const el of orderItems) {
      totalQty += (el?.qty ?? 0);
    }

    line.refresh();
    const title = element?.title ?? '';
    const qty = element?.qty ?? element?.quantity ?? 0;
    line.addText(String(title) + '<BR>');
    line.addText(ReceiptFormat.setRightAlign(`<B>${qty}/${totalQty}</B>`));

    const modInfo = element?.modinfo ?? element?.modInfo ?? '';
    if (modInfo !== '' && modInfo !== 'null') {
      line.addText('S:' + modInfo + '<BR>');
    }

    for (let s = 1; s <= 5; s++) {
      const key = `submenus${s}`;
      const subMenus = element?.[key] ?? element?.[`subMenus${s}`] ?? [];
      if (Array.isArray(subMenus) && subMenus.length > 0) {
        for (let i = 0; i < subMenus.length; i++) {
          const menuItem = subMenus[i];
          const itemTitle = (typeof menuItem === 'object' && menuItem !== null) ? (menuItem.title ?? menuItem) : String(menuItem);
          const label = subMenus.length === 1 ? `S${s}:` : `S${s}-${i + 1}:`;
          line.addText(label + itemTitle + '<BR>');
        }
      }
    }

    const lineRemark = trimOrderItemRemark(element);
    if (lineRemark) {
      line.addText('R: ' + lineRemark + '<BR>');
    }

    line.addText('<BR>');
    line.addText((orderModel?.name ?? '') + '<BR>');
    line.addText(orderModel?.userphonenumber ?? orderModel?.userPhoneNumber ?? '-');

    for (const l of line.getReceipt()) {
      receipt.push(l);
    }

    return receipt;
  }

  /**
   * Sample order slip for testing
   * @param {Object} opts - { type: 0|1 }
   * @returns {string[]}
   */
  static printSampleOrderSlip(opts = {}) {
    const { type = 0 } = opts;
    let receiptLen = 32;
    if (type === 1) {
      receiptLen = 48;
    }

    const receiptLine = new ReceiptLine();
    receiptLine.init(receiptLen);
    receiptLine.addText(ReceiptFormat.setCenterBIG('测试打印'));
    receiptLine.addText('蛋炒饭');
    receiptLine.addText(ReceiptFormat.setRightAlign('1'));

    return receiptLine.getReceipt();
  }

  /**
   * Sample receipt for testing
   * @param {Object} opts - { type: 0|1 }
   * @returns {string[]}
   */
  static printSampleReceipt(opts = {}) {
    const { type = 0 } = opts;
    let receiptLen = 32;
    let keyLen = 23;
    let valueLen = 8;

    if (type === 1) {
      receiptLen = 48;
      keyLen = 10;
      valueLen = 38;
    }

    const receipt = [];
    const receiptLine = new ReceiptLine();
    receiptLine.init(receiptLen);
    receiptLine.addText('<CB>测试打印</CB>');
    receiptLine.addLine('-');

    for (const l of receiptLine.getReceipt()) {
      receipt.push(l);
    }

    const dualTable = new ReceiptDualTable();
    dualTable.init(keyLen, valueLen);
    dualTable.addKey('名称');
    dualTable.addValue('金额');
    dualTable.addKey('1x 蛋炒饭');
    dualTable.addValue('2.50');
    dualTable.addKey('备注：加辣');
    dualTable.addValue('');
    dualTable.addKey('10x 蛋炒饭');
    dualTable.addValue('25.00');
    dualTable.addKey('100x 蛋炒饭');
    dualTable.addValue('250.00');
    dualTable.addKey('1x Char Koay Teow');
    dualTable.addValue('2.50');
    dualTable.addKey('10x Char Koay Teow');
    dualTable.addValue('25.00');
    dualTable.addKey('100x Char Koay Teow');
    dualTable.addValue('250.00');

    for (const l of dualTable.getReceipt()) {
      receipt.push(l);
    }

    receiptLine.refresh();
    receiptLine.addLine('-');

    for (const l of receiptLine.getReceipt()) {
      receipt.push(l);
    }

    return receipt;
  }

  /**
   * Convert receipt lines to single string for Feie API
   * @param {string[]} contentList - Receipt lines
   * @returns {string}
   */
  static receiptToString(contentList) {
    return Array.isArray(contentList) ? contentList.join('') : '';
  }
}

module.exports = UtilFeieReceipt;
