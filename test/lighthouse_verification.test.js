'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');

// Load the actual UserRouter with injected dependencies. Never boot server.js,
// Firebase, BigQuery, GKash, cron or a production connection from these tests.
function fixture({projectId = 'foodio-ab3b2', rows = [{storeid:'123456', password:'fixture-legacy'}], fail = false} = {}) {
  const reads = [], logs = [];
  const db = {collection(name) {
    reads.push(name); assert.equal(name, 'merchant');
    return {where(field, op, value) {
      assert.deepEqual([field, op, value], ['username', '==', '123456']);
      return {limit(n) {
        assert.equal(n, 2);
        return {async get() {
          if (fail) throw Error('must-not-leak-database-detail');
          return {empty:rows.length === 0, size:rows.length, docs:rows.map(row => ({data:() => row}))};
        }};
      }};
    }};
  }};
  const module = {exports:{}};
  const dependencies = {
    express,
    'node:crypto':require('node:crypto'),
    '@google-cloud/bigquery':{BigQuery:class {}},
    './db':{options:{projectId}, firestore:() => db},
    './gkashrouter':class {},
    './models/UserModel':{UserModel:class {}},
    './models/OrderModel':{CreateNewOrder:class {}},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../userrouter.js'), 'utf8'), {
    module, exports:module.exports, process:{env:{}},
    console:{error:(...args) => logs.push(args.join(' '))},
    require(name) {assert.ok(name in dependencies, `Unexpected dependency: ${name}`);return dependencies[name];},
  }, {filename:'userrouter.js'});
  return {router:new module.exports().getRouter(), reads, logs};
}
async function request(config, body, contentType = 'application/json') {
  const f = fixture(config), app = express();
  app.use(express.json({limit:'16kb'})); app.use('/user', f.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/user/verifylighthousepassword`, {
      method:'POST', headers:{'Content-Type':contentType}, body:JSON.stringify(body),
    });
    return {...f, status:response.status, cache:response.headers.get('cache-control'), body:await response.json()};
  } finally {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
}
test('actual route accepts correct password without service headers and returns only boolean', async () => {
  const r = await request({}, {password:'fixture-legacy'});
  assert.equal(r.status, 200); assert.equal(r.cache, 'no-store'); assert.deepEqual(r.body, {ok:true});
  assert.deepEqual(r.reads, ['merchant']); assert.deepEqual(r.logs, []);
});
test('wrong passwords and missing merchant return false, not unavailable', async () => {
  for (const config of [{}, {rows:[]}]) {
    const r = await request(config, {password:'wrong-fixture'});
    assert.equal(r.status, 200); assert.deepEqual(r.body, {ok:false});
  }
});
test('legacy short passwords and exact whitespace are preserved', async () => {
  for (const password of ['x7', ' fixture ']) {
    const r = await request({rows:[{storeid:123456, password}]}, {password});
    assert.equal(r.status, 200); assert.deepEqual(r.body, {ok:true});
  }
  const r = await request({rows:[{storeid:'123456', password:' fixture '}]}, {password:'fixture'});
  assert.deepEqual(r.body, {ok:false});
});
test('invalid inputs do not read Firestore', async () => {
  for (const password of [undefined, null, false, 123, [], {}, '', 'x'.repeat(257)]) {
    const r = await request({}, {password}); assert.equal(r.status, 400); assert.equal(r.body.ok, false); assert.deepEqual(r.reads, []);
  }
  const r = await request({}, {password:'fixture-legacy'}, 'text/plain');
  assert.equal(r.status, 400); assert.deepEqual(r.reads, []);
});
test('wrong project and ambiguous merchant fail closed', async () => {
  const r = await request({projectId:'other-project'}, {password:'fixture-legacy', projectId:'foodio-ab3b2'});
  assert.equal(r.status, 503); assert.deepEqual(r.reads, []);
  const duplicate = await request({rows:[{password:'fixture-legacy'}, {password:'fixture-legacy'}]}, {password:'fixture-legacy'});
  assert.equal(duplicate.status, 503); assert.equal(duplicate.body.ok, false);
});
test('wrong store, locked/disabled and unusable stored passwords never grant access', async () => {
  for (const override of [{storeid:'other'}, {locked:true}, {disabled:true}, {password:''}, {password:123}, {password:null}]) {
    const r = await request({rows:[{storeid:'123456', password:'fixture-legacy', ...override}]}, {password:'fixture-legacy'});
    assert.equal(r.status, 200); assert.deepEqual(r.body, {ok:false});
  }
});
test('database failure returns unavailable without leaking credential or database contents', async () => {
  const r = await request({fail:true}, {password:'private-fixture-input'});
  assert.equal(r.status, 503); assert.deepEqual(r.body, {ok:false, error:'Verification unavailable'});
  assert.deepEqual(r.logs, ['Lighthouse password verification failed']);
  assert.doesNotMatch(JSON.stringify({body:r.body, logs:r.logs}), /private-fixture|must-not-leak/);
});
test('existing routes retain their authentication handlers', () => {
  const {router} = fixture();
  const routes = router.stack.filter(layer => layer.route).map(layer => layer.route);
  for (const name of ['/about','/checkuser','/querybigquery','/generatetoken','/addloyaltypoints','/savependingpoints','/claimpendingpoints','/deletependingpoints']) assert.ok(routes.some(route => route.path === name));
  const endpoint = routes.find(route => route.path === '/verifylighthousepassword');
  assert.equal(endpoint.stack.length, 1); assert.equal(endpoint.stack[0].name, 'bound verifyLighthousePassword');
  const existing = routes.find(route => route.path === '/addloyaltypoints');
  assert.equal(existing.stack[0].name, 'bound validateBearerToken');
});
