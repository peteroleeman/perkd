'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const UtilFeie = require('../feie/util_feie');
const { buildFeieNormalSlip } = require('../util/util_feie_normal_slip');
const { printOrderItemSlipPOSByStyle } = require('../util/util_feie_orderslip');

function loadAutomaticPrinter() {
  const calls = [];
  class MockFeie extends UtilFeie {
    async printFeie2(sn, content, isJP) {
      calls.push({ sn, content, isJP });
      return 'mock-print-result';
    }
  }
  const filename = path.join(__dirname, '../util/util_feie_orderslip.js');
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, console,
    require(name) {
      return name === '../feie/util_feie' ? MockFeie : localRequire(name);
    },
  }, { filename });
  return { printer: module.exports, calls };
}

function order(overrides = {}) {
  return {
    sn: 'TEST-NOT-A-REAL-PRINTER',
    orderId: 'AUTO-TEST-1793370039184',
    dateTime: '2026-10-30T12:39:00Z',
    orderMode: 'Take Away',
    type: 0,
    orderItems: [{
      title: '1斤小龙虾 / 500g Crawfish', qty: 1,
      modInfo: [{ title: 'Extra sauce', qty: 2 }], remark: 'Less spicy',
    }],
    ...overrides,
  };
}

test('automatic kitchen printing uses the new renderer for default and explicit style 2', async () => {
  const { printer, calls } = loadAutomaticPrinter();
  const feie = new UtilFeie();
  for (const style of [undefined, 2]) {
    for (const type of [0, 1]) {
      for (const isJP of [false, true]) {
        const body = order({ style, type, isReprint: true });
        const result = await printer.executePrintOrderSlipEx(body, { isJP });
        assert.equal(result, 'mock-print-result');
        const call = calls.at(-1);
        assert.equal(call.sn, body.sn);
        assert.equal(call.isJP, isJP);
        const payload = printer.buildOrderSlipPayload(body, { individual: false, style: 2 });
        const expected = buildFeieNormalSlip(feie, feie.createFeieOrderSlipFromJSON(payload), true, type, 2);
        assert.deepEqual(call.content, expected);
        assert.ok(call.content.some((row) => row.includes('Qty 1')));
        assert.ok(call.content.some((row) => row.includes('Order:')));
        assert.ok(call.content.some((row) => row.includes('2x Extra sauce')));
      }
    }
  }
});

test('automatic individual slips retain one-per-unit expansion and numbering', async () => {
  const { printer, calls } = loadAutomaticPrinter();
  const body = order({
    orderItems: [{ title: 'Crab', qty: 2 }, { title: 'Rice', qty: 1 }],
  });
  const result = await printer.printOrderSlipsRespectingIndividual(body, {
    enableIndividual: true, isJP: true,
  });
  assert.equal(result.jobsSent, 3);
  assert.equal(calls.length, 3);
  for (let index = 0; index < calls.length; index++) {
    const firstRow = calls[index].content[0].replace(/<[^>]+>/g, '');
    assert.ok(firstRow.startsWith('Qty 1'));
    assert.ok(firstRow.endsWith(`${index + 1}/3`));
    assert.equal(result.payloads[index].receiptCurrent, index + 1);
    assert.equal(result.payloads[index].receiptTotal, 3);
    assert.equal(result.payloads[index].style, 2);
  }
});

test('automatic styles 0/1 and cancellation output keep their previous renderer', async () => {
  const { printer, calls } = loadAutomaticPrinter();
  const feie = new UtilFeie();
  for (const [style, cancelled] of [[0, false], [1, false], [2, true]]) {
    const body = order({ style });
    await printer.executePrintOrderSlipEx(body, { cancelled });
    const payload = printer.buildOrderSlipPayload(body, { individual: false, style });
    assert.deepEqual(calls.at(-1).content, printOrderItemSlipPOSByStyle(
      feie, feie.createFeieOrderSlipFromJSON(payload), false, body.type, cancelled, style,
    ));
  }
});

test('automatic crawfish slips save and print bilingual portion lines in both paper widths', async () => {
  const { printer, calls } = loadAutomaticPrinter();
  const item = {
    title: '3斤小龙虾 (456) / 1.5kg Crawfish 456',
    qty: 2,
    modinfo: 'Mala,Wangi,黄瓜 / Cucumber,竹笋 / Bamboo',
    portions: [
      { label: '1.5斤', modifiers: [{ title: 'Mala', price: 0 }] },
      { label: '1.5斤', modifiers: [
        { title: 'Wangi', price: 0 },
        { title: '黄瓜 / Cucumber', price: 1 },
        { title: '竹笋 / Bamboo', price: 1 },
      ] },
    ],
  };
  const expected = [
    { title: '1.5斤: Mala', isPortionLine: true },
    { title: '1.5斤: Wangi + 黄瓜 / Cucumber, + 竹笋 / Bamboo', isPortionLine: true },
  ];

  for (const type of [0, 1]) {
    for (const enableIndividual of [false, true]) {
      const before = calls.length;
      const result = await printer.printFeieOrderSlipsForOrder(
        { orderid: 'TEST-PORTIONS', orderitems: [item] },
        { feieorderslipprinter: [{ title: 'TEST-NOT-A-REAL-PRINTER', receipttype: type }] },
        { enableIndividual },
      );
      assert.equal(result.jobsSent, enableIndividual ? 2 : 1);
      assert.equal(result.errors.length, 0);
      for (const saved of result.slipPrintPayloads) {
        assert.deepEqual(JSON.parse(JSON.stringify(saved.orderItems[0].modInfo)), expected);
        assert.equal(saved.orderItems[0].qty, enableIndividual ? 1 : 2);
      }
      for (const call of calls.slice(before)) {
        const rows = call.content.map((row) => row.replace(/<[^>]+>/g, ''));
        const start = rows.findIndex((row) => row.trim() === '1.5斤: Mala');
        assert.ok(start >= 0);
        assert.match(rows[start + 1], /^  1\.5斤: Wangi/);
        const portionRows = rows.slice(start, -1);
        assert.equal(portionRows.join('').replace(/\s+/g, ''),
          expected.map(({ title }) => title).join('').replace(/\s+/g, ''));
        assert.ok(portionRows.every((row) => [...row].reduce(
          (width, char) => width + (char.codePointAt(0) > 127 ? 2 : 1), 0,
        ) <= (type === 1 ? 24 : 16)));
      }
    }
  }
});

test('portion modifiers keep whole-item extras, legacy fallbacks, and set selections', () => {
  const { printer } = loadAutomaticPrinter();
  const items = printer.convertToFeieOrder({ orderitems: [
    {
      title: 'Split order',
      portions: [{ size: 1.5, unit: '斤', modifiers: [
        { title: 'Mala' }, { title: 'Mala' }, { title: 'Bamboo', price: 1 },
      ] }],
      modinfo: [{ title: 'Mala', qty: 3 }, { title: 'Bamboo', qty: 1 }, { title: 'Extra sauce', qty: 2 }],
      submenus1: [{ title: 'Rice' }],
      remark: 'Less spicy',
    },
    { portions: [{}], portionsummary: '1.5斤: Mala | 1.5斤: Wangi', modinfo: 'Mala,Wangi' },
    { portionsummary: ' | ', modinfo: 'Ginger' },
    { modifiers: { sauce: [{ title: 'Extra sauce' }] }, modinfo: 'Ignored by existing rules' },
  ] }).orderItems;
  assert.deepEqual(JSON.parse(JSON.stringify(items.map((item) => item.modInfo))), [
    [
      { title: '1.5斤: Mala x2 + Bamboo', isPortionLine: true },
      { title: 'Mala', qty: 1 },
      { title: 'Extra sauce', qty: 2 },
      { title: 'S1:Rice', qty: 1 },
    ],
    [{ title: '1.5斤: Mala', isPortionLine: true }, { title: '1.5斤: Wangi', isPortionLine: true }],
    [{ title: 'Ginger', qty: 1 }],
    [{ title: 'Extra sauce', qty: 1 }],
  ]);
  assert.equal(items[0].remark, 'Less spicy');
});
