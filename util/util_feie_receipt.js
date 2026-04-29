/**
 * UtilFeieReceipt - JavaScript port of Flutter UtilFeieReceipt
 * Receipt formatting for Feie cloud printers.
 * Matches the format used by the foodioonline Flutter app when calling api.foodio.online
 * (e.g. /odoo/kdsorderslipfrominfoap, /pos/printlabelap)
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

    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const currentDate = dateFormatter.format(now);
    const currentTime = timeFormatter.format(now);

    let dateLen = 16;
    let timeLen = 16;
    if (type === 1) {
      dateLen = 24;
      timeLen = 24;
    }

    const dualTable = new ReceiptDualTable();
    const line = new ReceiptLine();
    line.init(dateLen + timeLen);
    dualTable.init(dateLen, timeLen);

    if (bReprint === true) {
      line.addMarkupLine(ReceiptFormat.setCenterBIG('*DUPLICATE*'));
      line.addMarkupLine('<BR>');
    }

    const storeTitle = orderModel?.storetitle ?? orderModel?.storeTitle ?? storeModel?.title ?? '';
    if (storeTitle !== '') {
      line.addMarkupLine(ReceiptFormat.setCenter(storeTitle));
      line.addMarkupLine('<BR>');
    }

    line.addMarkupLine(ReceiptFormat.setCenter(`${currentDate} ${currentTime}`));
    line.addMarkupLine('<BR>');
    line.addMarkupLine(ReceiptFormat.setCenterBIG(orderModel?.orderid ?? orderModel?.orderId ?? '-'));
    line.addMarkupLine('<BR>');

    const onlineOrderId = orderModel?.onlineorderid ?? orderModel?.onlineOrderId ?? '';
    const orderId = orderModel?.orderid ?? orderModel?.orderId ?? '';
    if (onlineOrderId !== orderId) {
      line.addMarkupLine(ReceiptFormat.setCenter(
        ReceiptFormat.setBold(orderModel?.onlineorderid ?? orderModel?.onlineOrderId ?? '-')
      ));
      line.addMarkupLine('<BR>');
    }

    const orderItems = orderModel?.orderitems ?? orderModel?.orderItems ?? orderModel?.getOrderItems?.() ?? [];
    for (const element of orderItems) {
      const title = element?.title ?? '';
      const qty = element?.qty ?? element?.quantity ?? 1;
      // Normal width (setBIG/<B> prints too large on narrow paper and wraps mid-title)
      line.addText(String(title) + '<BR>');
      line.addText(ReceiptFormat.setRightAlign(`x <B>${qty}</B>`));

      const modInfo = element?.modinfo ?? element?.modInfo;
      if (modInfo !== undefined && modInfo !== '' && modInfo !== 'null') {
        let modText = '';
        if (Array.isArray(modInfo)) {
          modText = modInfo.map(m => (typeof m === 'object' && m?.title) ? `${m.title}${(m?.qty > 1 ? ` x${m.qty}` : '')}` : String(m)).join(', ');
        } else if (modInfo && typeof modInfo === 'object') {
          modText = modInfo.title ? `${modInfo.title}${(modInfo.qty > 1 ? ` x${modInfo.qty}` : '')}` : '';
        } else {
          modText = String(modInfo);
        }
        if (modText) line.addText('S:' + modText + '<BR>');
      }

      // Handle submenu items - subMenus1 to subMenus5
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

      line.addText(ReceiptFormat.setCenter('* * *'));
    }

    for (const lineItem of line.getReceipt()) {
      receipt.push(lineItem);
    }

    // Summary section
    let keyLen = 10;
    let valueLen = 22;
    if (type === 1) {
      keyLen = 10;
      valueLen = 38;
    }
    dualTable.init(keyLen, valueLen);
    dualTable.addKey('');
    dualTable.addValue(orderModel?.currency ?? 'MYR');

    dualTable.addKey('Paid with');
    const paymentType = orderModel?.paymenttype ?? orderModel?.paymentType ?? orderModel?.getPaymentType?.() ?? '-';
    dualTable.addValue(paymentType);

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

    for (const l of dualTable.getReceipt()) {
      receipt.push(l);
    }

    line.refresh();
    const totalAmount = orderModel?.totalpaid ?? orderModel?.totalPaid ?? orderModel?.totalprice ?? orderModel?.totalPrice ?? orderModel?.getTotalAmount?.() ?? 0;
    line.addText(
      '<RIGHT>Total ' + ReceiptFormat.setBIG(parseFloat(totalAmount || 0).toFixed(2)) + '</RIGHT>'
    );
    line.addText(ReceiptFormat.setCenter('* * *'));

    for (const lineItem of line.getReceipt()) {
      receipt.push(lineItem);
    }

    let tableAssigned = orderModel?.mobileassignedtable ?? orderModel?.mobileAssignedTable ?? '-';
    if (tableAssigned === '') tableAssigned = '-';

    const orderTypeRaw = orderModel?.ordertype ?? orderModel?.orderType ?? orderModel?.getOrderType?.() ?? '';
    dualTable.refresh();
    dualTable.addKey('Type');
    dualTable.addValue(formatOrderTypeLabel(orderTypeRaw));
    dualTable.addKey('Table');
    dualTable.addValue(tableAssigned);
    dualTable.addKey('Name');
    dualTable.addValue(orderModel?.name ?? '-');
    dualTable.addKey('Contact');
    dualTable.addValue(orderModel?.userphonenumber ?? orderModel?.userPhoneNumber ?? '-');

    for (const l of dualTable.getReceipt()) {
      receipt.push(l);
    }

    line.refresh();
    line.addText(ReceiptFormat.setCenter('* * *'));
    line.addText(ReceiptFormat.setCenter('Scan QR for receipt'));
    line.addText(ReceiptFormat.setCenter('or to submit einvoice'));

    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const lastDayStr = lastDay.toISOString().slice(0, 10);
    line.addText(ReceiptFormat.setCenter(`Valid till ${lastDayStr}`));
    for (const l of line.getReceipt()) {
      receipt.push(l);
    }

    const storeId = storeModel?.id ?? orderModel?.storeid ?? orderModel?.storeId ?? '';
    const orderIdVal = orderModel?.id ?? orderModel?.orderid ?? orderModel?.orderId ?? '';
    const sQR = `<QR>https://myeinvois.com.my/#/${storeId}/${orderIdVal}</QR>`;
    receipt.push(sQR);

    return receipt;
  }

  /**
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
