'use strict';

const { ReceiptFormat, orderItemIsTakeAway } = require('../feie/util_feie');

function cellWidth(value) {
  return [...String(value)].reduce((sum, char) => sum + (char.codePointAt(0) <= 127 ? 1 : 2), 0);
}

function wrapText(value, width) {
  const rows = [];
  for (const paragraph of String(value).split(/\r\n|\r|\n/)) {
    let remaining = [...paragraph];
    if (!remaining.length) rows.push('');
    while (remaining.length) {
      let used = 0;
      let end = 0;
      let wordBreak = 0;
      while (end < remaining.length) {
        const size = cellWidth(remaining[end]);
        if (used + size > width) break;
        used += size;
        if (remaining[end] === ' ') wordBreak = end + 1;
        end++;
      }
      const count = end < remaining.length && wordBreak ? wordBreak : end;
      rows.push(remaining.slice(0, count).join(''));
      remaining = remaining.slice(count);
    }
  }
  return rows;
}

function present(value) {
  return value != null && String(value).trim() !== '' && value !== 'null' && value !== '-';
}

function money(value) {
  if (!present(value)) return '0.00';
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]).toFixed(2) : String(value);
}

function dateTime(raw) {
  const date = present(raw) ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return String(raw);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const two = (value) => String(value).padStart(2, '0');
  return `${two(date.getDate())} ${months[date.getMonth()]} ${date.getFullYear()}  ${two(date.getHours())}:${two(date.getMinutes())}`;
}

function orderMode(order) {
  const raw = order.ordertype ?? order.orderType ?? order.getOrderType?.() ?? order.orderMode;
  if (!present(raw)) return '';
  if (raw === 1 || raw === '1' || /take/i.test(String(raw))) return 'TAKE AWAY';
  if (raw === 0 || raw === '0' || /dine/i.test(String(raw))) return 'DINE IN';
  return String(raw).toUpperCase();
}

function remarkText(value) {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => entry?.remark ?? String(entry)).filter(present).join(', ');
}

function buildFeieNewReceipt(storeModel, orderModel, options = {}) {
  const order = orderModel ?? {};
  const width = options.type === 1 ? 48 : 32;
  const receipt = [];
  const text = (value, { center = false, bold = false, big = false, indent = '', prefix = '' } = {}) => {
    if (!present(value)) return;
    const available = (big ? width / 2 : width) - cellWidth(indent) - cellWidth(prefix);
    const rows = wrapText(value, Math.max(2, available));
    rows.forEach((row, index) => {
      let formatted = indent + (index === 0 ? prefix : ' '.repeat(cellWidth(prefix))) + row;
      if (big) formatted = ReceiptFormat.setBIG(formatted);
      if (bold) formatted = ReceiptFormat.setBold(formatted);
      if (center) formatted = ReceiptFormat.setCenter(formatted);
      receipt.push(formatted + (center ? '' : '<BR>'));
    });
  };
  const rule = (char = '-') => receipt.push(char.repeat(width - 1) + '<BR>');
  const pair = (label, value, { big = false, bold = false } = {}) => {
    const limit = big ? width / 2 : width;
    const left = String(label);
    const right = String(value);
    const gap = limit - cellWidth(left) - cellWidth(right);
    if (gap >= 1) {
      text(left + ' '.repeat(gap) + right, { big, bold });
    } else {
      text(left, { big, bold });
      for (let row of wrapText(right, limit)) {
        if (big) row = ReceiptFormat.setBIG(row);
        if (bold) row = ReceiptFormat.setBold(row);
        receipt.push(ReceiptFormat.setRightAlign(row) + '<BR>');
      }
    }
  };
  const isVoid = options.bVoid === true;
  if (options.bReprint === true) text('*DUPLICATE*', { center: true, bold: true });
  if (isVoid) {
    text('VOID', { center: true, big: true, bold: true });
    text('TRANSACTION VOIDED', { center: true, bold: true });
  }
  text(order.storetitle ?? order.storeTitle ?? storeModel?.title, { center: true, bold: true });
  text(orderMode(order), { center: true, big: true, bold: true });
  text(dateTime(order.dateTime ?? order.orderDateTime), { center: true });
  const orderId = order.orderid ?? order.orderId ?? '';
  text(present(orderId) ? `Order: ${orderId}` : '', { center: true });
  const onlineId = order.onlineorderid ?? order.onlineOrderId;
  if (present(onlineId) && onlineId !== orderId) text(`Online: ${onlineId}`);
  text(remarkText(order.remark), { center: true });
  for (const [label, value] of [
    ['Table', order.table ?? order.buzzer ?? order.mobileassignedtable ?? order.mobileAssignedTable],
    ['Name', order.name], ['Contact', order.userphonenumber ?? order.userPhoneNumber],
  ]) {
    if (present(value)) pair(label, value);
  }
  rule();

  for (const item of order.orderitems ?? order.orderItems ?? order.getOrderItems?.() ?? []) {
    const prefix = `${item.qty ?? item.quantity ?? 1}x`.padEnd(4, ' ');
    text(item.title ?? '', { prefix, bold: true });
    const detail = (value) => text(value, { indent: ' '.repeat(cellWidth(prefix)) });
    if (orderItemIsTakeAway(item) && orderMode(order) !== 'TAKE AWAY') detail('+ Take Away');
    const modInfo = item.modinfo ?? item.modInfo;
    if (present(modInfo)) {
      const mods = Array.isArray(modInfo) ? modInfo : [modInfo];
      for (const mod of mods) {
        const title = typeof mod === 'object' && mod != null ? mod.title : mod;
        if (present(title)) detail(`+ ${title}${mod?.qty > 1 ? ` x${mod.qty}` : ''}`);
      }
    }
    for (let index = 1; index <= 5; index++) {
      const submenus = item[`submenus${index}`] ?? item[`subMenus${index}`];
      if (Array.isArray(submenus)) {
        for (const submenu of submenus) {
          const title = submenu?.title ?? submenu;
          if (present(title)) detail(`+ ${title}`);
        }
      }
    }
    const note = remarkText(item.remark);
    if (present(note)) detail(`Note: ${note}`);
  }
  rule();

  const payment = order.paymenttype ?? order.paymentType ?? order.getPaymentType?.();
  if (present(payment)) pair(isVoid ? 'Original payment' : 'Paid with', payment);
  const cash = order.cashamount ?? order.cashAmount ?? order.getCashAmount?.() ?? 0;
  const epay = order.epayamount ?? order.epayAmount ?? order.getEPayAmount?.() ?? 0;
  if (!isVoid && Number(money(cash)) > 0) pair('Cash received', money(cash));
  if (Number(money(epay)) > 0) {
    pair(order.epaymenttype ?? order.ePaymentType ?? 'ePayment', money(epay));
  }
  rule('=');
  const total = order.totalpaid ?? order.totalPaid ?? order.totalprice ?? order.totalPrice
    ?? order.getTotalAmount?.() ?? 0;
  pair(isVoid ? 'ORIGINAL TOTAL' : 'TOTAL', money(total), { big: true, bold: true });
  rule();

  if (isVoid) {
    text('VOID COPY', { center: true, bold: true });
    text('Original transaction details', { center: true });
    text('Receipt lookup', { center: true });
  } else {
    text('Scan for receipt / e-invoice', { center: true });
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    text(`Valid till ${lastDay.getDate()} ${months[lastDay.getMonth()]} ${lastDay.getFullYear()}`, { center: true });
  }
  // Preserve the existing receipt URL; VOID wording does not imply a refund.
  const storeId = storeModel?.id ?? order.storeid ?? order.storeId ?? order.store_id ?? '';
  const lookupId = order.id ?? order.orderid ?? order.orderId ?? '';
  receipt.push(ReceiptFormat.setQR(`https://myeinvois.com.my/#/${storeId}/${lookupId}`));
  return receipt;
}

module.exports = { buildFeieNewReceipt };
