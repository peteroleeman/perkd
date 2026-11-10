'use strict';

const {
  ReceiptFormat,
  ReceiptLine,
  orderItemIsTakeAway,
  formatSlipDateTimeStyle1,
} = require('../feie/util_feie');

// Wrap plain text before applying Feie tags, independently of legacy chunking.
function wrapText(text, width) {
  const rows = [];
  for (const paragraph of String(text).split(/\r\n|\r|\n/)) {
    let row = '';
    let used = 0;
    for (const char of paragraph) {
      const size = char.codePointAt(0) <= 0x7f ? 1 : 2;
      if (used + size > width && row) {
        rows.push(row);
        row = '';
        used = 0;
      }
      row += char;
      used += size;
    }
    rows.push(row);
  }
  return rows;
}

function buildFeieCancellationSlip(order, type = 0, style = 0) {
  const width = type === 1 ? 48 : 32;
  const receipt = [];
  const divider = new ReceiptLine();
  divider.init(width);
  divider.addLine('-');
  const rule = () => receipt.push(...divider.getReceipt());
  const text = (value, { center = false, big = false, tall = false, bold = false } = {}) => {
    for (let row of wrapText(value, big ? width / 2 : width)) {
      if (big) row = ReceiptFormat.setBIG(row);
      if (tall) row = `<L>${row}</L>`;
      if (bold) row = ReceiptFormat.setBold(row);
      if (center) row = ReceiptFormat.setCenter(row);
      receipt.push(`${row}<BR>`);
    }
  };
  const optional = (value, options) => {
    if (value != null && String(value).trim() && value !== 'null') text(value, options);
  };

  text('ORDER CANCELLED', { center: true, tall: true, bold: true });
  text('DO NOT PREPARE', { center: true, bold: true });
  text('订单已取消 / 请勿制作', { center: true, bold: true });
  optional(order.orderMode, { center: true, bold: true });
  optional(order.orderId ? `Order: ${order.orderId}` : '');
  optional(formatSlipDateTimeStyle1(order.dateTime ?? ''));
  optional(order.table ? `Table: ${order.table}` : '');
  optional(order.remark);
  rule();

  const itemOptions = { big: style === 2 };
  for (const item of order.orderItems ?? []) {
    const quantityPrefix = `${item.qty ?? 0} x `;
    text(`${quantityPrefix}${item.title ?? ''}`, itemOptions);
    const indent = ' '.repeat(Math.min(quantityPrefix.length, 8));
    const detail = (value) => {
      if (value == null || !String(value).trim() || value === 'null') return;
      const detailWidth = (style === 2 ? width / 2 : width) - indent.length;
      for (const row of wrapText(value, detailWidth)) {
        text(`${indent}${row}`, itemOptions);
      }
    };
    if (orderItemIsTakeAway(item)) detail('*TAKE AWAY*');
    if (Array.isArray(item.modInfo)) {
      for (const mod of item.modInfo) {
        detail(mod.isPortionLine === true ? mod.title : `${mod.qty ?? 1} x ${mod.title ?? ''}`);
      }
    }
    detail(item.remark);
    detail(item.setMenu1 ?? item.s1);
    detail(item.setMenu2 ?? item.s2);
  }
  rule();
  return receipt;
}

module.exports = { buildFeieCancellationSlip };
