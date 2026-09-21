'use strict';
// Calls only an explicitly selected loopback or HTTPS staging endpoint. It
// simulates protocol requests, never a physical motor or proof of dispensing.
const fs=require('node:fs');
async function main(){
 const [action,file]=process.argv.slice(2),{actions}=require('../util/asnaf_service_client');
 if(!actions.has(action)||!file)throw Error('Usage: node scripts/asnaf_simulator.js ACTION request.json');
 const url=new URL(process.env.ASNAF_TEST_API_ORIGIN||'');
 if(!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Select an HTTPS staging origin or loopback origin');
 if(process.env.ASNAF_TEST_CONFIRMED!=='true')throw Error('Set ASNAF_TEST_CONFIRMED=true only for the intended disposable test scope');
 const response=await fetch(`${url.origin}/asnaf/${action}`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-asnaf-device-id':process.env.ASNAF_DEVICE_ID||'','x-asnaf-device-token':process.env.ASNAF_DEVICE_TOKEN||''},body:fs.readFileSync(file,'utf8'),signal:AbortSignal.timeout(20000)});
 const result=await response.json();console.log(JSON.stringify({httpStatus:response.status,...result},null,2));if(!response.ok||result.ok!==true)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
