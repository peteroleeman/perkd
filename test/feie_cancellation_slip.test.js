'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const UtilFeie = require('../feie/util_feie');
const { buildFeieCancellationSlip } = require('../util/util_feie_cancellation_slip');
const { printOrderItemSlipPOSByStyle } = require('../util/util_feie_orderslip');

function payload(overrides = {}) {
  return {
    sn: 'TEST-NOT-A-REAL-PRINTER',
    orderId: '1793359562404',
    dateTime: '2026-10-30T11:27:00Z',
    storeTitle: 'FF Hairy Crab & Crayfish',
    orderMode: 'Take Away',
    table: 'B7',
    remark: 'Kitchen note',
    type: 0,
    style: 0,
    isReprint: false,
    cancelled: true,
    orderItems: [{
      title: '1斤小龙虾 (456) / 500g Crawfish 456',
      qty: 2,
      isTakeAway: true,
      modInfo: [{ title: 'Extra sauce', qty: 3 }],
      remark: 'Less spicy',
      setMenu1: 'Rice',
      setMenu2: 'Tea',
    }, { title: 'Dine-in item', qty: 1, isTakeAway: false }],
    ...overrides,
  };
}

function plain(content) {
  return content.join('').replace(/<BR>/g, '\n').replace(/<[^>]+>/g, '');
}

function loadRouter() {
  const calls = [];
  let printError;
  class MockFeie extends UtilFeie {
    async printFeie2(sn, content, isJP) {
      calls.push({ sn, content, isJP });
      if (printError) throw printError;
      return 'mock-print-result';
    }
  }
  const filename = path.join(__dirname, '../posrouter.js');
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    exports: module.exports,
    process,
    console: { log() {}, error() {} },
    require(name) {
      if (name === './feie/util_feie') return MockFeie;
      if (name === './db') return { firestore: () => ({}) };
      if (name === './models/OrderModel' || name === './models/OrderItemModel') return class {};
      return localRequire(name);
    },
  }, { filename });
  const router = new module.exports().getRouter();
  return {
    calls,
    failWith(error) { printError = error; },
    async post(route, body) {
      const layer = router.stack.find((entry) => entry.route?.path === route && entry.route.methods.post);
      assert.ok(layer, `Missing POST route: ${route}`);
      const response = {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
      };
      await layer.route.stack[0].handle({ body }, response);
      return response;
    },
  };
}

test('cancellation layout preserves content and fits both widths in all styles', () => {
  for (const type of [0, 1]) {
    for (const style of [0, 1, 2]) {
      const order = new UtilFeie().createFeieOrderSlipFromJSON(payload());
      const content = buildFeieCancellationSlip(order, type, style);
      const printed = plain(content);
      assert.ok(printed.startsWith('ORDER CANCELLED\nDO NOT PREPARE\n订单已取消 / 请勿制作\n'));
      assert.ok(printed.indexOf('DO NOT PREPARE') < printed.indexOf('Take Away'));
      assert.ok(printed.includes('Order: 1793359562404'));
      assert.ok(!printed.includes(order.storeTitle));
      assert.ok(printed.includes('B7'));
      assert.ok(printed.includes('Kitchen note'));
      for (const value of ['2 x ' + order.orderItems[0].title, '3 x Extra sauce',
        'Less spicy', 'Rice', 'Tea', '1 x Dine-in item']) {
        assert.ok(printed.replace(/\n */g, '').includes(value), `Lost text: ${value}`);
      }
      assert.equal((printed.match(/\*TAKE AWAY\*/g) || []).length, 1);
      assert.ok(!printed.includes('Item code:'));
      assert.equal((printed.match(/ORDER CANCELLED/g) || []).length, 1);
      assert.equal((printed.match(/DO NOT PREPARE/g) || []).length, 1);
      assert.equal(content.filter((row) => /^-+<BR>$/.test(row)).length, 2);
      assert.equal(content.some((row) => row.includes('<B>')), style === 2);
      assert.ok(content.includes('-'.repeat((type === 1 ? 48 : 32) - 1) + '<BR>'));
      for (const row of content) {
        const value = row.replace(/<[^>]+>/g, '');
        const cells = [...value].reduce((sum, char) => sum + (char.codePointAt(0) <= 127 ? 1 : 2), 0);
        const max = (type === 1 ? 48 : 32) / (row.includes('<B>') ? 2 : 1);
        assert.ok(cells <= max, `Overflow: ${row}`);
        for (const tag of ['C', 'L', 'B', 'BOLD']) {
          assert.equal(row.split('<' + tag + '>').length, row.split('</' + tag + '>').length);
        }
      }
    }
  }
});

test('long bilingual titles keep their final characters and set-menu aliases', () => {
  const title = '小龙虾'.repeat(25) + ' Crawfish '.repeat(12) + 'FINAL456';
  for (const type of [0, 1]) {
    for (const style of [0, 1, 2]) {
      const printed = plain(buildFeieCancellationSlip(payload({
        orderItems: [{ title, qty: 5, s1: 'Alias rice', s2: 'Alias tea', modInfo: 'null' }],
      }), type, style)).replace(/\n/g, '');
      assert.ok(printed.includes('5 x ' + title));
      assert.ok(printed.includes('Alias rice'));
      assert.ok(printed.includes('Alias tea'));
    }
  }
  assert.doesNotThrow(() => buildFeieCancellationSlip({ orderItems: [] }));
});

test('new endpoints send redesigned cancellation tickets to the correct region', async () => {
  const harness = loadRouter();
  for (const [route, isJP] of [
    ['/newkdsorderslipexcancel', false], ['/newkdsorderslipexapcancel', true],
  ]) {
    const response = await harness.post(route, payload());
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.message, 'mock-print-result');
    const call = harness.calls.at(-1);
    assert.equal(call.sn, 'TEST-NOT-A-REAL-PRINTER');
    assert.equal(call.isJP, isJP);
    assert.ok(plain(call.content).startsWith('ORDER CANCELLED\nDO NOT PREPARE\n订单已取消'));
  }
});

test('false, omitted, and non-boolean flags use the existing normal-slip dispatcher', async () => {
  const harness = loadRouter();
  const feie = new UtilFeie();
  for (const route of ['/newkdsorderslipexcancel', '/newkdsorderslipexapcancel']) {
    for (const style of [0, 1, 2]) {
      for (const cancelled of [false, undefined, 'true']) {
        const body = payload({ style, cancelled, isReprint: true });
        const response = await harness.post(route, body);
        assert.equal(response.statusCode, 200);
        const expected = printOrderItemSlipPOSByStyle(
          feie, feie.createFeieOrderSlipFromJSON(body), true, body.type, false, style,
        );
        assert.deepEqual(harness.calls.at(-1).content, expected);
      }
    }
  }
});

test('new endpoints retain missing-field and item-array validation without printing', async () => {
  const harness = loadRouter();
  for (const route of ['/newkdsorderslipexcancel', '/newkdsorderslipexapcancel']) {
    let response = await harness.post(route, undefined);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'Request body is missing or empty');
    for (const field of ['sn', 'orderId', 'orderItems', 'type', 'isReprint']) {
      const body = payload();
      delete body[field];
      response = await harness.post(route, body);
      assert.equal(response.statusCode, 400);
      assert.equal(response.body.error, 'Missing required field: ' + field);
    }
    response = await harness.post(route, payload({ orderItems: {} }));
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'orderItems must be an array');
  }
  assert.equal(harness.calls.length, 0);
});

test('new endpoints preserve the existing print-error response', async () => {
  const harness = loadRouter();
  const error = new Error('Mock transport failure');
  harness.failWith(error);
  const response = await harness.post('/newkdsorderslipexcancel', payload());
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, error);
});

test('legacy routes still use the original receipt builders and cancellation semantics', async () => {
  const harness = loadRouter();
  const feie = new UtilFeie();
  for (const [route, isJP, cancelled] of [
    ['/kdsorderslipexcancel', false, true],
    ['/kdsorderslipexapcancel', true, true],
    ['/kdsorderslipex', false, false],
    ['/kdsorderslipexap', true, false],
  ]) {
    for (const style of [0, 1, 2]) {
      const body = payload({ style });
      const response = await harness.post(route, body);
      assert.equal(response.statusCode, 200);
      const call = harness.calls.at(-1);
      assert.equal(call.isJP, isJP);
      assert.deepEqual(call.content, printOrderItemSlipPOSByStyle(
        feie, feie.createFeieOrderSlipFromJSON(body), false, body.type, cancelled, style,
      ));
    }
  }
});

test('item details align under the item title, including wrapped continuations', () => {
  for (const type of [0, 1]) {
    for (const style of [0, 1, 2]) {
      const content = buildFeieCancellationSlip(payload({
        orderItems: [{
          title: 'Crawfish', qty: 12, isTakeAway: true,
          modInfo: [{ title: 'Extra sauce', qty: 2 }],
          remark: 'Less spicy ' + '小辣'.repeat(30),
          setMenu1: 'Rice', setMenu2: 'Tea',
        }],
      }), type, style);
      const rows = plain(content).split('\n');
      const start = rows.indexOf('12 x Crawfish');
      assert.ok(start >= 0);
      const details = rows.slice(start + 1, rows.findIndex((row, i) => i > start && /^-+$/.test(row)));
      assert.ok(details.some((row) => row.startsWith('     Less spicy')));
      assert.ok(details.includes('     Rice'));
      assert.ok(details.includes('     Tea'));
      assert.ok(details.every((row) => row.startsWith('     ')));
      const unindented = details.map((row) => row.slice(5)).join('');
      assert.ok(unindented.includes('2 x Extra sauce'));
      assert.ok(unindented.includes('Less spicy ' + '小辣'.repeat(30)));
      for (const row of details) {
        const cells = [...row].reduce((sum, char) => sum + (char.codePointAt(0) <= 127 ? 1 : 2), 0);
        assert.ok(cells <= (type === 1 ? 48 : 32) / (style === 2 ? 2 : 1));
      }
    }
  }
});
