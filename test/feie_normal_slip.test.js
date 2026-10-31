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


test('new normal endpoints preserve styles 0 and 1 for both regions, widths and reprints', async () => {
  const harness = loadRouter();
  const feie = new UtilFeie();
  for (const [route, isJP] of [
    ['/newkdsorderslipex', false], ['/newkdsorderslipexap', true],
  ]) {
    for (const type of [0, 1]) {
      for (const style of [0, 1]) {
        for (const isReprint of [false, true]) {
          const body = payload({ type, style, isReprint, cancelled: true });
          const response = await harness.post(route, body);
          assert.equal(response.statusCode, 200);
          assert.equal(response.body.message, 'mock-print-result');
          const call = harness.calls.at(-1);
          assert.equal(call.sn, body.sn);
          assert.equal(call.isJP, isJP);
          const expected = printOrderItemSlipPOSByStyle(
            feie, feie.createFeieOrderSlipFromJSON(body), isReprint, type, false, style,
          );
          assert.deepEqual(call.content, expected);
          assert.ok(!plain(call.content).includes('ORDER CANCELLED'));
          assert.ok(!plain(call.content).includes('DO NOT PREPARE'));
        }
      }
    }
  }
});

test('new normal endpoints retain validation without printing invalid requests', async () => {
  const harness = loadRouter();
  for (const route of ['/newkdsorderslipex', '/newkdsorderslipexap']) {
    const empty = await harness.post(route, undefined);
    assert.equal(empty.statusCode, 400);
    assert.equal(empty.body.error, 'Request body is missing or empty');
    for (const field of ['sn', 'orderId', 'orderItems', 'type', 'isReprint']) {
      const body = payload();
      delete body[field];
      const response = await harness.post(route, body);
      assert.equal(response.statusCode, 400);
      assert.equal(response.body.error, 'Missing required field: ' + field);
    }
    const invalid = await harness.post(route, payload({ orderItems: null }));
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.body.error, 'orderItems must be an array');
  }
  assert.equal(harness.calls.length, 0);
});

test('new normal endpoints retain print-error responses', async () => {
  const harness = loadRouter();
  const error = new Error('Mock print failure');
  harness.failWith(error);
  for (const route of ['/newkdsorderslipex', '/newkdsorderslipexap']) {
    const response = await harness.post(route, payload());
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.error, error);
  }
});

function rows(content) {
  return content.map((row) => row.replace(/<BR>/g, '').replace(/<[^>]+>/g, ''));
}

function cellCount(value) {
  return [...value].reduce((sum, char) => sum + (char.codePointAt(0) <= 127 ? 1 : 2), 0);
}

test('new style 2 uses a compact header and large aligned details on both paper widths', async () => {
  const harness = loadRouter();
  const dateTime = new Date(2026, 9, 30, 20, 39).toISOString();
  for (const [route, isJP] of [
    ['/newkdsorderslipex', false], ['/newkdsorderslipexap', true],
  ]) {
    for (const type of [0, 1]) {
      for (const isReprint of [false, true]) {
        const body = payload({ style: 2, type, isReprint, dateTime,
          receiptCurrent: 1, receiptTotal: 3 });
        const response = await harness.post(route, body);
        assert.equal(response.statusCode, 200);
        assert.equal(response.body.message, 'mock-print-result');
        const call = harness.calls.at(-1);
        assert.equal(call.sn, body.sn);
        assert.equal(call.isJP, isJP);
        const printedRows = rows(call.content);
        const dividerIndexes = printedRows.flatMap((row, i) => /^-+$/.test(row) ? [i] : []);
        assert.equal(dividerIndexes.length, 2);
        const header = printedRows.slice(0, dividerIndexes[0]).join('\n');
        assert.ok(header.includes('TAKE AWAY'));
        assert.ok(header.includes('1/3'));
        assert.ok(header.includes('30 Oct 2026 20:39'));
        assert.ok(header.includes('Order: 1793359562404'));
        assert.ok(header.includes('B7'));
        assert.ok(header.includes('Kitchen note'));
        assert.ok(!header.includes(body.storeTitle));
        assert.equal(header.includes('*DUPLICATE*'), isReprint);
        assert.ok(!header.includes('TEST PRINT ONLY'));
        const headerMarkup = call.content.slice(0, dividerIndexes[0]);
        assert.ok(headerMarkup[0].includes('<B>'), 'Corner labels must be enlarged');
        const modeLine = headerMarkup.find((line) => line.includes('TAKE AWAY'));
        assert.equal(modeLine, '<C><BOLD><B>TAKE AWAY</B></BOLD></C>');
        for (const line of headerMarkup.filter((line) =>
          line.includes('30 Oct') || line.includes('Order:') || line.includes('Kitchen note'))) {
          assert.ok(!line.includes('<B>'), 'Metadata must stay small');
        }
        const itemRows = printedRows.slice(dividerIndexes[0] + 1, dividerIndexes[1]);
        const itemMarkup = call.content.slice(dividerIndexes[0] + 1, dividerIndexes[1]);
        assert.ok(itemMarkup.every((row) => row.includes('<B>') && row.includes('</B>')));
        const details = itemRows.filter((row) => row.startsWith('  ')).map((row) => row.slice(2)).join('');
        for (const value of ['3x Extra sauce', 'Less spicy', 'Rice', 'Tea', '*TAKE AWAY*']) {
          assert.ok(details.includes(value), 'Missing detail: ' + value);
        }
        assert.ok(!plain(call.content).includes('*:'));
        assert.ok(!plain(call.content).includes('ORDER CANCELLED'));
        for (let i = 0; i < printedRows.length; i++) {
          const doubled = call.content[i].includes('<B>');
          assert.ok(cellCount(printedRows[i]) <= (type === 1 ? 48 : 32) / (doubled ? 2 : 1));
          for (const tag of ['B', 'C', 'BOLD']) {
            assert.equal(call.content[i].split('<' + tag + '>').length,
              call.content[i].split('</' + tag + '>').length);
          }
        }
      }
    }
  }
});

test('style 2 preserves long bilingual names, full order references and detail continuations', () => {
  const title = '1斤小龙虾 / 500g Crawfish ' + '小龙虾'.repeat(24) + ' FINAL456';
  const note = 'Sauce packed separately please ' + '少辣'.repeat(25) + ' END';
  const reference = 'TEST-BIG-1793363957272-REFERENCE-KEEP-ALL';
  for (const type of [0, 1]) {
    const order = new UtilFeie().createFeieOrderSlipFromJSON(payload({
      orderId: reference, receiptCurrent: 2, receiptTotal: 3,
      orderItems: [{
        title, qty: 12, modInfo: [{ title: 'Extra sauce', qty: 2 }],
        remark: note, s1: 'Rice', s2: 'Tea',
      }],
    }));
    const content = buildFeieNormalSlip(new UtilFeie(), order, false, type, 2);
    const printedRows = rows(content);
    const firstDivider = printedRows.findIndex((row) => /^-+$/.test(row));
    const header = printedRows.slice(0, firstDivider).join('');
    assert.ok(header.includes('Order: ' + reference));
    assert.ok(header.includes('Qty 12')); assert.ok(header.includes('2/3'));
    const itemRows = printedRows.slice(firstDivider + 1, -1);
    const detailStart = itemRows.findIndex((row) => row.startsWith('  '));
    assert.ok(itemRows.slice(0, detailStart).join('') === title);
    const detailRows = itemRows.slice(detailStart);
    assert.ok(detailRows.every((row) => row.startsWith('  ')));
    const details = detailRows.map((row) => row.slice(2)).join('');
    assert.equal(details, '2x Extra sauce' + note + 'Rice' + 'Tea');
    const width = type === 1 ? 24 : 16;
    assert.ok(itemRows.every((row) => cellCount(row) <= width));
  }
});

test('style 2 prefers word boundaries and keeps dates and supplied remarks', () => {
  const feie = new UtilFeie();
  const order = feie.createFeieOrderSlipFromJSON(payload({
    dateTime: 'Unparsed date text',
    remark: 'TEST PRINT ONLY',
    receiptCurrent: 1, receiptTotal: 1,
    orderItems: [{ title: 'Crawfish', qty: 1,
      modInfo: [{ title: 'Extra sauce', qty: 2 }], remark: 'Less spicy' }],
  }));
  const content = buildFeieNormalSlip(feie, order, false, 0, 2);
  const printed = rows(content);
  assert.ok(printed.includes('Crawfish'));
  assert.ok(printed.includes('  2x Extra sauce'));
  assert.ok(printed.includes('  Less spicy'));
  assert.ok(printed.includes('Unparsed date text'));
  assert.ok(printed.includes('TEST PRINT ONLY'));
  const wrapped = rows(buildFeieNormalSlip(feie, { ...order,
    orderItems: [{ title: 'Garlic Crab with rice', qty: 1 }],
  }, false, 0, 2));
  assert.ok(wrapped.includes('Garlic Crab '));
  assert.ok(wrapped.includes('with rice'));
  assert.doesNotThrow(() => buildFeieNormalSlip(feie, { orderItems: [] }, false, 0, 2));
});

test('legacy normal routes retain style 2 baseline output', async () => {
  const harness = loadRouter();
  const feie = new UtilFeie();
  for (const [route, isJP] of [['/kdsorderslipex', false], ['/kdsorderslipexap', true]]) {
    const body = payload({ style: 2, isReprint: true });
    const response = await harness.post(route, body);
    assert.equal(response.statusCode, 200);
    const call = harness.calls.at(-1);
    assert.equal(call.isJP, isJP);
    assert.deepEqual(call.content, printOrderItemSlipPOSByStyle(
      feie, feie.createFeieOrderSlipFromJSON(body), true, body.type, false, 2,
    ));
  }
});

test('style 2 places quantity top-left and slip numbering top-right', () => {
  const feie = new UtilFeie();
  for (const type of [0, 1]) {
    for (const isReprint of [false, true]) {
      const order = feie.createFeieOrderSlipFromJSON(payload({
        receiptCurrent: 1, receiptTotal: 12,
        orderItems: [{ title: 'Crawfish', qty: 12 }],
      }));
      const first = rows(buildFeieNormalSlip(feie, order, isReprint, type, 2))[0];
      assert.equal(first, 'Qty 12'.padEnd((type === 1 ? 24 : 16) - 4) + '1/12');
    }
    const noNumber = rows(buildFeieNormalSlip(feie,
      feie.createFeieOrderSlipFromJSON(payload({ orderItems: [{ title: 'Rice', qty: 1 }] })),
      false, type, 2))[0];
    assert.equal(noNumber.trim(), 'Qty 1');
    const longNumber = buildFeieNormalSlip(feie, {
      orderItems: [{ title: 'Rice', qty: 1 }],
      receiptCurrent: '1'.repeat(40), receiptTotal: '2'.repeat(40),
    }, false, type, 2);
    assert.ok(longNumber.some((line) => line.includes('<RIGHT>')));
    assert.ok(rows(longNumber).every((line) => cellCount(line) <= (type === 1 ? 48 : 32)));
  }
});

test('style 2 shows individual quantity once and bolds item names but not details', () => {
  const feie = new UtilFeie();
  for (const type of [0, 1]) {
    const body = payload({
      receiptCurrent: 1, receiptTotal: 1,
      orderItems: [{ title: 'Crawfish', qty: 2,
        modInfo: [{ title: 'Extra sauce', qty: 3 }], remark: 'Less spicy' }],
    });
    const content = buildFeieNormalSlip(feie, feie.createFeieOrderSlipFromJSON(body), false, type, 2);
    const printed = rows(content);
    assert.ok(printed[0].startsWith('Qty 2'));
    assert.ok(printed[0].endsWith('1/1'));
    assert.ok(content.includes('<BOLD><B>Crawfish</B></BOLD><BR>'));
    assert.ok(!printed.some((row) => row.includes('2 x Crawfish')));
    assert.ok(content.includes('<B>  3x Extra sauce</B><BR>'));
    assert.ok(content.includes('<B>  Less spicy</B><BR>'));
    const combined = buildFeieNormalSlip(feie, feie.createFeieOrderSlipFromJSON(payload({
      orderItems: [{ title: 'Crab', qty: 2 }, { title: 'Rice', qty: 3 }],
    })), false, type, 2);
    assert.ok(combined.includes('<BOLD><B>2 x Crab</B></BOLD><BR>'));
    assert.ok(combined.includes('<BOLD><B>3 x Rice</B></BOLD><BR>'));
  }
});
