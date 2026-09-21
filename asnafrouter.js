'use strict';
const {createAsnafClient,actions}=require('./util/asnaf_service_client');
class AsnafRouter {
 constructor({express=require('express'),client=createAsnafClient()}={}){
  this.router=express.Router();
  this.router.use(express.json({limit:'128kb'}));
  for(const action of actions)this.router.post(`/${action}`,async(req,res)=>{
   res.set('Cache-Control','no-store');
   if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))return res.status(400).json({success:false,ok:false,code:'INVALID_REQUEST',message:'JSON object required'});
   try{const result=await client(action,req.body);return res.status(result.status).json(result.data);}
   catch{return res.status(503).json({success:false,ok:false,code:'UNKNOWN_RESULT',message:'Unable to confirm payment. Recover with the original receipt.'});}
  });
 }
 getRouter(){return this.router;}
}
module.exports=AsnafRouter;
