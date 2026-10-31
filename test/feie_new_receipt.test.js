'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const UtilFeie = require('../feie/util_feie');

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




const UtilFeieReceipt = require('../util/util_feie_receipt');
const { buildFeieNewReceipt } = require('../util/util_feie_new_receipt');

const RECEIPT_ROUTES = [
  ['/newkdsreceipt', '/kdsreceipt', false, false],
  ['/newkdsreceiptap', '/kdsreceiptap', true, false],
  ['/newkdsreceiptapvoid', '/kdsreceiptapvoid', true, true],
];

function receiptBody(overrides = {}) {
  return payload({
    storeId: 'TEST-STORE', orderType: 1, paymentType: 'Cash',
    cashAmount: 68, totalPaid: 68, ...overrides,
  });
}

function printed(content) {
  return content.map((row) => row.replace(/<[^>]+>/g, '')).join('\n');
}

function cells(value) {
  return [...value].reduce((sum, char) => sum + (char.codePointAt(0) <= 127 ? 1 : 2), 0);
}

test('new customer receipts use redesigned totals and correct region, width and VOID status', async () => {
  const harness = loadRouter();
  for (const [route, , isJP, isVoid] of RECEIPT_ROUTES) {
    for (const type of [0, 1, '1']) {
      for (const isReprint of [false, true, 'true']) {
        const body = receiptBody({ type, isReprint });
        const response = await harness.post(route, body);
        assert.equal(response.statusCode, 200);
        assert.equal(response.body.message, 'mock-print-result');
        const call = harness.calls.at(-1);
        assert.equal(call.sn, body.sn);
        assert.equal(call.isJP, isJP);
        const output = printed(call.content);
        assert.equal(output.includes('TRANSACTION VOIDED'), isVoid);
        assert.equal(output.includes('*DUPLICATE*'), isReprint === true);
        for (const value of [body.storeTitle, '1793359562404',
          'Extra sauce x3', 'Less spicy', 'Cash', '68.00']) {
          assert.ok(output.replace(/\n */g, '').includes(value), 'Missing content: ' + value);
        }
        assert.equal((output.match(/TAKE AWAY/g) || []).length, 1);
        assert.ok(call.content.join('').includes(
          '<QR>https://myeinvois.com.my/#/TEST-STORE/1793359562404</QR>'));
        assert.ok(call.content.some((row) => row.includes('<B>') && row.includes(isVoid ? 'ORIGINAL TOTAL' : 'TOTAL')));
        if (isVoid) {
          assert.ok(output.includes('Original payment'));
          assert.ok(output.includes('VOID COPY'));
          assert.ok(output.includes('Receipt lookup'));
          assert.ok(!output.includes('Valid till'));
          assert.ok(!output.includes('Paid with'));
          assert.ok(!/refund/i.test(output));
        } else {
          assert.ok(output.includes('Paid with'));
          assert.ok(output.includes('Cash received'));
          assert.ok(output.includes('Scan for receipt / e-invoice'));
          assert.ok(output.includes('Valid till'));
        }
        for (const row of call.content) {
          if (row.includes('<QR>')) continue;
          const value = row.replace(/<[^>]+>/g, '');
          const width = Number(type) === 1 ? 48 : 32;
          assert.ok(cells(value) <= width / (row.includes('<B>') ? 2 : 1), 'Overflow: ' + row);
          for (const tag of ['B', 'BOLD', 'C', 'RIGHT']) {
            assert.equal(row.split('<' + tag + '>').length, row.split('</' + tag + '>').length);
          }
        }
      }
    }
  }
});

test('receipt endpoint alone controls VOID status', async () => {
  const harness = loadRouter();
  for (const [route, , , isVoid] of RECEIPT_ROUTES) {
    await harness.post(route, receiptBody({
      bVoid: !isVoid, isVoid: !isVoid, void: !isVoid, cancelled: !isVoid,
    }));
    assert.equal(printed(harness.calls.at(-1).content).includes('TRANSACTION VOIDED'), isVoid);
  }
});

test('customer receipt item names, modifiers and notes retain alignment and wrapped text', () => {
  const title = '小龙虾'.repeat(18) + ' 500g Crawfish FINAL';
  const note = 'No spring onion and sauce separately ' + '少辣'.repeat(18);
  for (const type of [0, 1]) {
    const body = receiptBody({ type, orderItems: [{
      title, qty: 12, isTakeAway: true,
      modInfo: [{ title: 'Extra sauce', qty: 2 }],
      remark: [{ remark: note }],
      submenus1: [{ title: 'Steamed rice' }],
    }] });
    const content = buildFeieNewReceipt({ id: body.storeId }, body, { type });
    const start = content.findIndex((row) => row.includes('12x '));
    const end = content.findIndex((row, index) => index > start && /^-+<BR>$/.test(row));
    const lines = content.slice(start, end).map((row) => row.replace(/<[^>]+>/g, ''));
    assert.ok(lines[0].startsWith('12x '));
    assert.ok(lines.slice(1).every((row) => row.startsWith('    ')));
    const titles = content.slice(start, end).filter((row) => row.includes('<BOLD>'))
      .map((row, index) => row.replace(/<[^>]+>/g, '').slice(4)).join('');
    assert.equal(titles, title);
    const details = content.slice(start, end).filter((row) => !row.includes('<BOLD>'))
      .map((row) => row.replace(/<[^>]+>/g, '').slice(4)).join('');
    assert.ok(details.includes('+ Extra sauce x2'));
    assert.ok(details.includes('+ Steamed rice'));
    assert.ok(details.includes('Note: ' + note));
  }
});

test('new customer receipts retain validation without printing invalid requests', async () => {
  const harness = loadRouter();
  for (const [route] of RECEIPT_ROUTES) {
    const empty = await harness.post(route, undefined);
    assert.equal(empty.statusCode, 400);
    assert.equal(empty.body.error, 'Request body is missing or empty');
    for (const field of ['sn', 'orderId', 'orderItems']) {
      const body = receiptBody();
      delete body[field];
      const response = await harness.post(route, body);
      assert.equal(response.statusCode, 400);
      assert.equal(response.body.error, 'Missing required field: ' + field);
    }
    for (const orderItems of [null, {}, 'not an array']) {
      const response = await harness.post(route, receiptBody({ orderItems }));
      assert.equal(response.statusCode, 400);
      assert.equal(response.body.error, 'orderItems must be an array');
    }
  }
  assert.equal(harness.calls.length, 0);
});

test('new customer receipts support minimal input, split payments and existing field aliases', async () => {
  const harness = loadRouter();
  for (const [route] of RECEIPT_ROUTES) {
    assert.equal((await harness.post(route, {
      sn: 'TEST-NOT-A-REAL-PRINTER', orderId: 'TEST-EMPTY', orderItems: [],
    })).statusCode, 200);
    assert.ok(printed(harness.calls.at(-1).content).includes('0.00'));
  }
  const content = buildFeieNewReceipt({}, {
    storetitle: 'Alias store', orderid: 'Alias order', onlineorderid: 'Online order',
    storeid: 'Alias store ID', orderDateTime: 'unparsed date',
    ordertype: 0, paymenttype: 'Split', cashamount: 10, epayamount: 20,
    epaymenttype: 'Card', totalprice: 'RM 30.00',
    mobileassignedtable: 'Table 7', name: 'Sample Guest', userphonenumber: 'TEST-CONTACT',
    orderitems: [{ title: 'Tea', quantity: 2, isTakeAway: true, modinfo: 'Less ice' }],
  });
  const output = printed(content);
  for (const value of ['Alias store', 'Alias order', 'Online order', 'unparsed date',
    'DINE IN', 'Card', '20.00', '10.00', '30.00', 'Table 7',
    'Sample Guest', 'TEST-CONTACT', '+ Take Away', '+ Less ice']) {
    assert.ok(output.replace(/\n */g, '').includes(value), 'Missing alias content: ' + value);
  }
});

test('legacy customer receipt routes still use the original layout', async () => {
  const harness = loadRouter();
  for (const [, legacy, isJP, isVoid] of RECEIPT_ROUTES) {
    const body = receiptBody({ isReprint: true });
    assert.equal((await harness.post(legacy, body)).statusCode, 200);
    const call = harness.calls.at(-1);
    assert.equal(call.isJP, isJP);
    assert.deepEqual(call.content, UtilFeieReceipt.printOrderReceiptFromOrder(
      { title: body.storeTitle, id: body.storeId }, body,
      { type: 0, bReprint: true, bVoid: isVoid },
    ));
  }
});

test('new customer receipt routes preserve existing print-error responses', async () => {
  const harness = loadRouter();
  const error = new Error('Mock receipt transport failure');
  harness.failWith(error);
  for (const [route] of RECEIPT_ROUTES) {
    const response = await harness.post(route, receiptBody());
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.error, error);
  }
});
