const test=require('node:test'),assert=require('node:assert/strict');
const {createAsnafClient}=require('../util/asnaf_service_client');
const env={SMART_KOTAK_VENDING_URL:'https://example.invalid'};
test('disabled without endpoint and rejects invalid origins',async()=>{
 assert.equal((await createAsnafClient({env:{}})('deduct-balance',{})).status,503);
 for(const endpoint of ['http://example.invalid','https://example.invalid/path','https://user:pass@example.invalid'])assert.equal((await createAsnafClient({env:{SMART_KOTAK_VENDING_URL:endpoint}})('deduct-balance',{})).status,503);
});
test('CERIA-style request needs only the endpoint, preserves body and disallows redirects',async()=>{
 const body={receipt_id:'receipt',amount:3.5};
 const c=createAsnafClient({env,request:async options=>{assert.equal(options.data,body);assert.equal(options.maxRedirects,0);assert.deepEqual(options.headers,{'Content-Type':'application/json'});return {status:200,data:{ok:true,success:true,paymentId:'p'}};}});
 assert.equal((await c('deduct-balance',body)).data.paymentId,'p');
});
test('timeouts and unexpected success bodies remain unknown, never paid',async()=>{
 for(const request of [async()=>{throw Error('timeout');},async()=>({status:200,data:{ok:false}}),async()=>({status:302,data:{}})]){
 const r=await createAsnafClient({env,request})('deduct-balance',{});assert.equal(r.status,503);assert.equal(r.data.ok,false);}
});
test('preserves backend business status and no corporate endpoint is accepted',async()=>{
 const c=createAsnafClient({env,request:async()=>({status:409,data:{ok:false,success:false,code:'RECEIPT_CONFLICT'}})});
 assert.equal((await c('deduct-balance',{})).data.code,'RECEIPT_CONFLICT');assert.equal((await c('../ceria/deduct-balance',{})).status,404);
});
