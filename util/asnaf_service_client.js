'use strict';
const actions=new Set(['get-balance','deduct-balance','payment-status','refund-payment','dispense-result']);
function createAsnafClient({env=process.env,request}={}) {
 const endpoint=env.SMART_KOTAK_VENDING_URL;
 return async function call(action,input){
  const failure=(status,code,message)=>({status,data:{success:false,ok:false,code,message}});
  if(!actions.has(action))return failure(404,'NOT_FOUND','Unknown Asnaf endpoint');
  if(!endpoint)return failure(503,'VENDING_DISABLED','Asnaf vending is not configured');
  let url;try{url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error();}catch{return failure(503,'VENDING_DISABLED','Asnaf service URL must be an HTTPS origin');}
  try{
   const send=request||require('axios').request;
   const response=await send({method:'POST',url:`${url.origin}/smart-kotak/vending/${action}`,data:input,headers:{'Content-Type':'application/json'},timeout:15000,maxRedirects:0,maxContentLength:128*1024,maxBodyLength:128*1024,validateStatus:()=>true});
   if(response.status===200&&response.data?.ok===true&&response.data?.success===true)return {status:200,data:response.data};
   if([400,401,403,404,409,503].includes(response.status)&&response.data?.ok===false)return {status:response.status,data:response.data};
   return failure(503,'UNKNOWN_RESULT','Unable to confirm payment. Recover with the original receipt.');
  }catch{return failure(503,'UNKNOWN_RESULT','Unable to confirm payment. Recover with the original receipt.');}
 };
}
module.exports={createAsnafClient,actions};
