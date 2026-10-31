'use strict';

const { ReceiptFormat, orderItemIsTakeAway } = require('../feie/util_feie');

// Wrap before adding markup. Keep whitespace and final partial lines intact.
function wrapText(value, width) {
  const rows = [];
  for (const paragraph of String(value).split(/\r\n|\r|\n/)) {
    let remaining = [...paragraph];
    if (!remaining.length) rows.push('');
    while (remaining.length) {
      let cells = 0;
      let end = 0;
      let wordBreak = 0;
      while (end < remaining.length) {
        const size = remaining[end].codePointAt(0) <= 127 ? 1 : 2;
        if (cells + size > width) break;
        cells += size;
        if (remaining[end] === ' ') wordBreak = end + 1;
        end++;
      }
      // Prefer a space boundary unless the rest already fits on this line.
      const count = end < remaining.length && wordBreak ? wordBreak : end;
      rows.push(remaining.slice(0, count).join(''));
      remaining = remaining.slice(count);
    }
  }
  return rows;
}

function formatDateTime(raw) {
  if (raw == null || raw === '') return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const two = (value) => String(value).padStart(2, '0');
  return `${two(date.getDate())} ${months[date.getMonth()]} ${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

function buildStyle2Slip(order, isReprint, type) {
  const width = type === 1 ? 48 : 32;
  const itemWidth = width / 2;
  const receipt = [];
  const text = (value, { big = false, bold = false, center = false, indent = '' } = {}) => {
    if (value == null || String(value).trim() === '' || value === 'null') return;
    for (const row of wrapText(value, (big ? itemWidth : width) - indent.length)) {
      let formatted = indent + row;
      if (big) formatted = ReceiptFormat.setBIG(formatted);
      if (bold) formatted = ReceiptFormat.setBold(formatted);
      if (center) formatted = ReceiptFormat.setCenter(formatted);
      // Feie centered blocks advance the line; an extra BR adds a blank row.
      receipt.push(formatted + (center ? '' : '<BR>'));
    }
  };
  const rule = () => receipt.push('-'.repeat(width - 1) + '<BR>');
  const items = order.orderItems ?? [];
  const quantity = items.length === 1 ? `Qty ${items[0].qty ?? 0}` : '';
  const numbering = order.receiptCurrent != null && order.receiptTotal != null && Number(order.receiptTotal) > 0
    ? `${order.receiptCurrent}/${order.receiptTotal}` : '';
  if (quantity.length + numbering.length <= itemWidth) {
    text(quantity.padEnd(itemWidth - numbering.length, ' ') + numbering, { big: true, bold: true });
  } else {
    text(quantity, { big: true, bold: true });
    for (const row of wrapText(numbering, itemWidth)) {
      receipt.push(ReceiptFormat.setRightAlign(ReceiptFormat.setBold(ReceiptFormat.setBIG(row))) + '<BR>');
    }
  }
  if (isReprint === true) text('*DUPLICATE*', { center: true, bold: true });
  text(String(order.orderMode ?? '').toUpperCase(), { center: true, big: true, bold: true });
  text(formatDateTime(order.dateTime));
  if (order.orderId != null && String(order.orderId) !== '') text(`Order: ${order.orderId}`);
  if (order.table) text(`Table / Buzzer: ${order.table}`);
  text(order.remark);
  rule();
  const detailOptions = { big: true, indent: '  ' };
  for (const item of items) {
    const title = items.length === 1 ? (item.title ?? '') : `${item.qty ?? 0} x ${item.title ?? ''}`;
    text(title, { big: true, bold: true });
    if (orderItemIsTakeAway(item)) text('*TAKE AWAY*', detailOptions);
    if (Array.isArray(item.modInfo)) {
      for (const mod of item.modInfo) {
        text(`${mod.qty ?? 1}x ${mod.title ?? ''}`, detailOptions);
      }
    }
    text(item.remark, detailOptions);
    text(item.setMenu1 ?? item.s1, detailOptions);
    text(item.setMenu2 ?? item.s2, detailOptions);
  }
  rule();
  return receipt;
}

// New normal endpoints and automatic KDS printing share the redesigned style 2.
function buildFeieNormalSlip(feie, order, isReprint = false, type = 0, style = 0) {
  if (style === 2) return buildStyle2Slip(order, isReprint, type);
  return feie.printOrderItemSlipPOS(order, isReprint, type, false, style);
}

module.exports = { buildFeieNormalSlip };
