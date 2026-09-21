const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const express=require('express');
const AsnafRouter=require('../asnafrouter');
const {createAsnafClient,actions}=require('../util/asnaf_service_client');
const env={SMART_KOTAK_VENDING_URL:'https://example.invalid'};
const vendingActions=['get-balance','deduct-balance','payment-status','dispense-result','refund-payment'];
function notPaid(r){
 assert.equal(r.status,503);assert.equal(r.data.ok,false);assert.equal(r.data.success,false);
 assert.equal(r.data.code,'UNKNOWN_RESULT');assert.equal(r.data.paymentStatus,undefined);assert.equal(r.data.paymentId,undefined);
}
async function withIsolatedApp(client,run){
 const app=express();app.use('/asnaf',new AsnafRouter({express,client}).getRouter());
 const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await run(`http://127.0.0.1:${server.address().port}`);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test('disabled without endpoint and rejects invalid origins',async()=>{
 assert.equal((await createAsnafClient({env:{}})('deduct-balance',{})).status,503);
 for(const endpoint of ['http://example.invalid','https://example.invalid/path','https://user:pass@example.invalid'])assert.equal((await createAsnafClient({env:{SMART_KOTAK_VENDING_URL:endpoint}})('deduct-balance',{})).status,503);
});
test('CERIA-style request needs only the endpoint, preserves body and disallows redirects',async()=>{
 const body={company_id:'company',merchant_id:'merchant',device_number:'device',receipt_id:'receipt',amount:3.5};
 const c=createAsnafClient({env,request:async options=>{
  assert.equal(options.method,'POST');assert.equal(options.url,'https://example.invalid/smart-kotak/vending/deduct-balance');
  assert.equal(options.data,body);assert.equal(options.maxRedirects,0);assert.equal(options.timeout,15000);
  assert.deepEqual(options.headers,{'Content-Type':'application/json'});assert.equal(options.headers['x-asnaf-key'],undefined);
  return {status:200,data:{ok:true,success:true,paymentId:'p',receipt_id:body.receipt_id,paymentStatus:'Paid'}};
 }});
 const r=await c('deduct-balance',body);assert.equal(r.data.paymentId,'p');assert.equal(r.data.receipt_id,'receipt');
});
test('timeouts and unexpected success bodies remain unknown, never paid',async()=>{
 for(const request of [async()=>{throw Error('timeout');},async()=>({status:200,data:{ok:false,paymentStatus:'Paid'}}),async()=>({status:302,data:{}}),async()=>({status:200,data:{ok:true,paymentStatus:'Paid'}})]){
 const r=await createAsnafClient({env,request})('deduct-balance',{});notPaid(r);}
});
test('preserves backend business status and no corporate endpoint is accepted',async()=>{
 const c=createAsnafClient({env,request:async()=>({status:409,data:{ok:false,success:false,code:'RECEIPT_CONFLICT'}})});
 assert.equal((await c('deduct-balance',{})).data.code,'RECEIPT_CONFLICT');assert.equal((await c('../ceria/deduct-balance',{})).status,404);
});
test('forwards every Kitchen vending action without service headers',async()=>{
 assert.deepEqual([...actions].sort(),[...vendingActions].sort());
 const seen=[];
 const c=createAsnafClient({env,request:async options=>{seen.push(options.url);assert.deepEqual(options.headers,{'Content-Type':'application/json'});return {status:200,data:{ok:true,success:true}};}});
 for(const action of vendingActions)assert.equal((await c(action,{receipt_id:'same'})).status,200);
 assert.deepEqual(seen,vendingActions.map(action=>`https://example.invalid/smart-kotak/vending/${action}`));
});
test('isolated router starts without server.js and preserves identifiers',async()=>{
 const captured=[];
 const body={company_id:'company',merchant_id:'merchant',device_number:'device',receipt_id:'VM-001',payment_id:'pay-1',qr_payload:'ASNAF:2:g:auth:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'};
 await withIsolatedApp(async(action,input)=>{captured.push({action,input});return {status:200,data:{ok:true,success:true,receipt_id:input.receipt_id,paymentId:input.payment_id||null,action}};},async origin=>{
  for(const action of vendingActions){
   const response=await fetch(`${origin}/asnaf/${action}`,{method:'POST',headers:{'Content-Type':'application/json','X-Asnaf-Key':'must-not-be-required'},body:JSON.stringify(body)});
   const data=await response.json();
   assert.equal(response.status,200);assert.equal(data.ok,true);assert.equal(data.receipt_id,'VM-001');
  }
 });
 assert.deepEqual(captured.map(r=>r.action),vendingActions);
 for(const row of captured){assert.equal(row.input.company_id,'company');assert.equal(row.input.merchant_id,'merchant');assert.equal(row.input.device_number,'device');assert.equal(row.input.receipt_id,'VM-001');}
 const src=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 assert.match(src,/app\.use\('\/asnaf', new AsnafRouter\(\)\.getRouter\(\)\)/);
 assert.match(src,/app\.use\('\/ceria', ceriaRouter\.getRouter\(\)\)/);
 assert.match(src,/app\.use\('\/vending', myVending\.getRouter\(\)\)/);
});
test('isolated router maps thrown clients and invalid bodies to unknown or invalid, never paid',async()=>{
 await withIsolatedApp(async()=>{throw Error('boom');},async origin=>{
  const timeout=await fetch(`${origin}/asnaf/deduct-balance`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receipt_id:'VM-001'})});
  const timed=await timeout.json();notPaid({status:timeout.status,data:timed});
  const bad=await fetch(`${origin}/asnaf/deduct-balance`,{method:'POST',headers:{'Content-Type':'application/json'},body:'[]'});
  const rejected=await bad.json();assert.equal(bad.status,400);assert.equal(rejected.ok,false);assert.equal(rejected.success,false);assert.equal(rejected.paymentStatus,undefined);
 });
});
test('live integration stays skipped unless an explicit test origin is confirmed',()=>{
 if(process.env.ASNAF_TEST_CONFIRMED==='true'&&process.env.ASNAF_TEST_API_ORIGIN)assert.fail('Live Asnaf requests are not executed from this suite; use scripts/asnaf_simulator.js against the disposable test scope');
});
