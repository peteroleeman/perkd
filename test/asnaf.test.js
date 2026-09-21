const test=require('node:test'),assert=require('node:assert/strict');
const {createAsnafClient}=require('../util/asnaf_service_client');
const env={SMART_KOTAK_VENDING_URL:'https://example.invalid',SMART_KOTAK_VENDING_SERVICE_TOKEN:'x'.repeat(32)},headers={'x-asnaf-device-id':'fixture','x-asnaf-device-token':'y'.repeat(32)};
test('disabled by default and missing machine credentials fail closed',async()=>{
 assert.equal((await createAsnafClient({env:{}})('deduct-balance',{},headers)).status,503);
 assert.equal((await createAsnafClient({env})('deduct-balance',{},{})).status,401);
});
test('preserves receipt and body, pins service auth and disallows redirects',async()=>{
 const body={receipt_id:'receipt',amount:3.5};
 const c=createAsnafClient({env,request:async options=>{assert.equal(options.data,body);assert.equal(options.maxRedirects,0);assert.equal(options.headers.Authorization,`Bearer ${env.SMART_KOTAK_VENDING_SERVICE_TOKEN}`);return {status:200,data:{ok:true,success:true,paymentId:'p'}};}});
 assert.equal((await c('deduct-balance',body,headers)).data.paymentId,'p');
});
test('timeouts and unexpected success bodies remain unknown, never paid',async()=>{
 for(const request of [async()=>{throw Error('timeout');},async()=>({status:200,data:{ok:false}}),async()=>({status:302,data:{}})]){
 const r=await createAsnafClient({env,request})('deduct-balance',{},headers);assert.equal(r.status,503);assert.equal(r.data.ok,false);}
});
test('preserves backend business status and no corporate endpoint is accepted',async()=>{
 const c=createAsnafClient({env,request:async()=>({status:409,data:{ok:false,success:false,code:'RECEIPT_CONFLICT'}})});
 assert.equal((await c('deduct-balance',{},headers)).data.code,'RECEIPT_CONFLICT');assert.equal((await c('../ceria/deduct-balance',{},headers)).status,404);
});
