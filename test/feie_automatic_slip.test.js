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
