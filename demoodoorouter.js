const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const UtilFeie = require("./feie/util_feie");
const OrderModel = require('./models/OrderModel')
const { PromoScope, PromoMain, PromoList }  = require("./util/util_promo")

const firebase = require("./db");
const { Console } = require('console');
const OdooOrderModel = require('./models/odoo/OdooOrderModel');
const MenuModel = require('./models/MenuModel');
const { default: CatModel } = require('./models/CatModel');
const { PromoManager } = require('./util/promo_manager');
const { addDebugLog } = require('./util/util_log');
const fireStore = firebase.firestore();

/*!SECTION
Staging: https://staging.gspos.odoo.my/
Production: https://gspos.hosted.my/ 
*/

class DemoOdooRouter {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  //SECTION router
  initializeRoutes() {

    this.router.get('/about', function(req, res) {
     res.json({ message: 'Endpoint for Stagging Odoo integration v1.29'});
    });

    this.router.post('/gettoken', this.getToken.bind(this));
    this.router.post('/checktoken', this.checkToken.bind(this));
    this.router.post('/syncmenu', this.syncMenu.bind(this));
    this.router.post('/syncodoo', this.triggerSyncOdoo.bind(this));
    this.router.post('/syncpromo', this.triggerSyncPromo.bind(this));
    
    this.router.post('/synccall', this.syncCall.bind(this));
    this.router.post('/ovoidorder', this.voidOrder.bind(this));
    this.router.post('/oquerycoupon', this.queryCoupon.bind(this));
    this.router.post('/oquerymember', this.queryMember.bind(this));
    this.router.post('/oquerymembercode', this.queryMemberCode.bind(this));
    this.router.post('/oquerytoken', this.queryToken.bind(this));
    this.router.post('/omenumapping', this.menuMapping.bind(this));


    this.router.post("/setkioskfooter", this.setKioskReceiptFooter.bind(this));
    this.router.post('/setorder', this.setOrder.bind(this));
    //this.router.post('/repostorder', this.repostOrder.bind(this));

    //promo
    this.router.post("/promo", this.handlePromo.bind(this) );
    
    //real time stock
    this.router.post('/checkstock', this.checkStock.bind(this));

    //feie test
    this.router.post('/kdstest', this.handlePrintTestCN.bind(this));
    this.router.post('/kdstestap', this.handlePrintTestJP.bind(this));
    // this.router.post('/kdssample', this.printSample.bind(this));
     //this.router.post('/kdssampleorderslip', this.printSampleOrderSlip.bind(this));

     //feie actual print
     this.router.post('/kdsreceipt', this.handlePrintReceiptCN.bind(this));
     this.router.post('/kdsreceiptap', this.handlePrintReceiptJP.bind(this));

     this.router.post('/kdsorderslip', this.handlePrintOrderSlipCN.bind(this));
     this.router.post('/kdsorderslipap', this.handlePrintOrderSlipJP.bind(this));

     this.router.post('/kdsstatus', this.handleCheckStatusCN.bind(this));
     this.router.post('/kdsstatusap', this.handleCheckStatusJP.bind(this));


  }

  
  //SECTION Odoo related
  // Define other route handler methods here
    generateEncryptedToken()
   {
      // Get today's date in ISO format (YYYY-MM-DD)
      const today = new Date().toISOString().slice(0, 10);

      // Create a hash using the SHA-256 algorithm
      const hash = crypto.createHash('sha256');

      // Update the hash with today's date
      hash.update(today);

      // Generate the hexadecimal representation of the hash
      const encryptedToken = hash.digest('hex');

      return encryptedToken;
    }

    triggerMenuSync(storeId)
    {

        console.log("triggerMenuSync " + storeId);

        //https://demo-c6qevkp34a-uc.a.run.app/odgetmenu?storeid=TRX
        const url = 'https://demo-c6qevkp34a-uc.a.run.app/oddemogetmenu?storeid=' + storeId;
        console.log(url);

        axios.get(url)
          .then(response => {
            //console.log('triggersync:', response.data);
            // Handle the response data as needed
          })
          .catch(error => {
            //console.error('triggersync error:', error.message);
            // Handle any errors that occurred during the request
          });
    }

    async triggerSyncPromo()
    {
      var promoList = [];
      var odooPromotCollectionRef = fireStore.collection("odoopromo");
      var promoResult = await odooPromotCollectionRef.get();
      if(!promoResult.empty)
        {
        for (var doc of promoResult.docs)
          {
            const promoMain = new PromoMain(doc.data());
            promoList.push(promoMain);
          }
        }

        let promoManager = new PromoManager();
        promoManager.setPromoList(promoList);
        promoManager.generatePromotion();

        
        addDebugLog(promoList);

    }

    async triggerSyncOdoo() 
    {

      const FirebaseDB = {
        cat : "cat",
        mainCat : "maincat",
        store : "store",
        menu: "menu",
        odoo :"odoo",
        order : "order",
        todayOrder: "today_order"
      }

      //promo list
      var promoList = [];
      var odooPromotCollectionRef = fireStore.collection("odoopromo");
      var promoResult = await odooPromotCollectionRef.get();
      if (!promoResult.empty) {
        for (var doc of promoResult.docs) {
          const promoMain = new PromoMain(doc.data());
          promoList.push(promoMain);
        }
      }

      let promoManager = new PromoManager();
      promoManager.setPromoList(promoList);
      promoManager.generatePromotion();


      addDebugLog(promoList);


      //menu list
      
      var menuFull = [];
      var odooMap = new Map();
      var modPrice = new Map();
      var menuNotAvailable = [];
      var menuToHide = [];
      var menuRealTime = [];

      var storeConfiguredId = "S_ab87a396-8d11-45cb-9d4a-84a6b977980b";
      var odooConfigureId = "MDV3";
      //const menuCollectionRef = collection(db, FirebaseDB.store, storeConfiguredId, FirebaseDB.menu);
      //const mainCatCollectionRef = collection(db, FirebaseDB.store, storeConfiguredId, FirebaseDB.mainCat);

      const menuCollectionRef = fireStore.collection(FirebaseDB.store).doc(storeConfiguredId).collection(FirebaseDB.menu);
      const mainCatCollectionRef = fireStore.collection(FirebaseDB.odoo).doc(odooConfigureId).collection(FirebaseDB.mainCat);

      var odooMainCatCollectionRef = fireStore.collection(FirebaseDB.odoo).doc(odooConfigureId).collection(FirebaseDB.cat);

      console.log("trigger sync odoo");

      var odooResult = await odooMainCatCollectionRef.get();
       
       if(!odooResult.empty)
       {
          for(var doc of odooResult.docs)
          {
              
            
           
            var odooMenu = doc.data();

           

            if((odooMenu?.id ?? "") != "")
            {
                odooMap.set(odooMenu.id, odooMenu);
            
              if((odooMenu?.availableStatus ?? "") == "UNAVAILABLE")
              {
                menuNotAvailable.push(odooMenu.id);
               
              }

              if((odooMenu?.real_time?.toLowerCase() ?? "") == "true")
                {
                  menuRealTime.push(odooMenu.id);
                }

                modPrice.set(odooMenu.id, parseFloat( odooMenu.price ?? "0.00" ));

            }

          }
       }
       else
       {
          console.log("odoo result is empty");
       }
      

       var menuResult =  await menuCollectionRef.get();

       console.log("menu result gotten");

       if (!menuResult.empty)
       {
      
        for(var doc of menuResult.docs)
          {
              var menuModel = doc.data();

              
              
             
              if((menuModel?.menusku ?? "") != "")
              {
                 //handle the promotion
                var verticalPromoResult = promoManager.isMenuOfVerticalPromo(menuModel?.menusku ?? "");
                if (verticalPromoResult != -999) {
                  //addDebugLog("**** SET TO VERTICAL **********");
                  menuModel.discountDetail = promoManager.getVerticalPromoIdWithSKU(menuModel?.menusku ?? "");//PromoOption.vertical_promo;
                  //addDebugLog(menu.discountDetail);
                }

                //check if this is bundle discount
                var bundleDiscountResult = promoManager.isMenuOfBundleDiscount(menuModel?.menusku ?? "");
                if (bundleDiscountResult != -999) {
                  //addDebugLog("**** SET TO BUNDLE ********** with " + menu?.sku ?? "");
                  var discountIdFound = promoManager.getBundleDiscountIdWithSKU(menuModel?.menusku ?? "");
                  //addDebugLog("discount id found " + discountIdFound);
                  menuModel.discountDetail = discountIdFound;
                  //addDebugLog("after set");
                  //addDebugLog(menu);

                }

                if (promoManager.isMenuOfItemDiscount(menuModel?.menusku ?? "") == true) {
                  //addDebugLog("gUsePromoManager TRUE");
                  var result = promoManager.getMenuOfItemDiscount(menuModel?.menusku ?? "", menuModel?.menuprice);
                  //addDebugLog("promoManager.isMenuOfItemDiscount menu sku " + menu.sku);
                  //addDebugLog(result);
                  if (result != "") {
                    menuModel.discountDetail = result.id;
                    menuModel.discountTitle = promoManager.getDiscountDetail(result.id);

                    //addDebugLog("**** SET TO ITEM DISCOUNT ********** " + menu.sku);
                    //addDebugLog(menu.discountDetail);
                  }
                  //addDebugLog(result);
                }


                 //handle the odoo

                 var odooMenu = odooMap.get(menuModel.menusku);
                 
                 menuModel.isSoldOut = odooMenu?.isSoldOut ?? false; //odooMenu?.isSoldOut
                 menuModel.isShow = odooMenu?.isShow ?? true;
                 //menuModel.discountDetail = odooMenu?.discountDetail ?? "";

                 if (odooMenu?.qty != undefined && odooMenu?.qty != "")
                  {
                    
                      menuModel.qty = odooMenu?.qty ?? 0;
                     
                    
                  }
      
                  if(odooMenu?.menuprice != undefined)
                  {
                    var menuValue = parseFloat(String(odooMenu?.menuprice ?? "0.0"));
                   
                     menuModel.menuprice = parseFloat(String(odooMenu?.menuprice ?? "0.0"));
      
                  }


                  //now check for mg
                  for(var mg of menuModel?.modifiergroups ?? [])
                    {
                       
                      //3008
                      for (var optionG of mg?.optiongroups ?? []) {
                        for (var option of optionG?.groups ?? []) {
                          if (menuNotAvailable.includes(option?.sku ?? "-")) {
                            option.isSoldOut = true;
                            
            
                          }
                          else {
                            option.isSoldOut = false;
            
            
                          }

                          console.log("option issoldout:" +option.isSoldOut);
            
                          //show or hide
                          if (menuToHide.includes(option?.sku ?? "-")) {
                            option.isShow = false;
            
            
                          }
                          else {
                            option.isShow = true;
            
            
                          }
            
                          console.log("option.isshow:" + option.isShow);
            
                          //assign price from odoo
                          if (modPrice.has(option?.sku)) {
                            option.price = modPrice.get(option?.sku);
                            //addDebugLog("assigning option to " + option.price);
                            console.log("option.price:" + option.price);
                          }
                        }
                      }
                              
                       for(var mod of (mg?.modifiers ?? []))
                        {
                         
                           
            
                            if(menuNotAvailable?.includes(mod?.sku ?? "-"))
                            {
                              mod.isSoldOut = true;
                              console.log("mod.issoldout:" + mod.isSoldOut);
                              
                            }
                            else
                            {
                              mod.isSoldOut = false;
                              console.log("mod.issoldout:" +mod.isSoldOut);
                              
                            }
            
                            //show or hidden
            
                           
            
                            if(menuToHide?.includes(mod?.sku ?? "-"))
                              {
                                mod.isShow = false;
                                console.log("mod.isshow:" +mod.isShow);
                                
                              }
                              else
                              {
                                mod.isShow = true;
                                console.log("mod.isshow:" +mod.isShow);
                                
                              }
                              
                             
            
                            if(menuRealTime?.includes(mod?.sku ?? "-"))
                              {
                                mod.real_time = "true";
                                console.log("mod.real_time:" + mod.real_time);
                              }
                              else
                              {
                                mod.real_time = "false";
                                console.log("mod.real_time:" + mod.real_time);
                              }
            
                              //assign price from odoo
                              if(modPrice.has(mod?.sku))
                                {
                                  mod.price = modPrice.get(mod?.sku);
            
                                  console.log("mod.price:" + mod.price);
                                  //addDebugLog("assigning mod to " + mod.price);
                                }
            
                         
                        }
                    }


              }    
                //console.log(menuModel.data());
                console.log(menuModel.title + " " + menuModel.id + " " + menuModel.menusku);
                console.log(menuModel);
                fireStore.collection(FirebaseDB.store).doc("superstore").collection(FirebaseDB.menu).doc(menuModel.id).set(menuModel);
          }
       }
       else
       {
         console.log("menu is empty");
       }
      

       
       


       

       return;

       
       Array.from(odooMap.entries()).map(([key, menu]) => {
        for(var odooMG of menu?.modifiergroups ?? [])
          {
            for(var odooM of odooMG?.modifiers ?? [])
              {
                if(odooM.availableStatus == "UNAVAILABLE")
                  {
                    menuNotAvailable.push(odooM.id);
                    addDebugLog("UNAVAILABLE " + odooM.title + " " + odooM.id);
                  }
                  
                  if(odooM.availableStatus == "HIDE")
                    {
                      menuToHide.push(odooM.id);
                      
                    addDebugLog("HIDE " + odooM.title + " " + odooM.id);
                      //addDebugLog("HIDE" );
                      //addDebugLog(odooM);
                      
                    }
                    else
                    {
                      //addDebugLog("SHOW " + odooM.title + " " + odooM.id);
                    }
                  

                  if((odooM?.real_time?.toLowerCase() ?? "") == "true")
                    {
                      menuRealTime.push(odooM.id);
                    }

                    //addDebugLog(odooM);
                    modPrice.set(odooM.id, parseFloat( odooM.price ?? "0.00" ));
              }
          }

        
    });

       //now compare odoo and foodio menu
       for (var catStruct of menuFull) {
        var bFound = false;
        var index = 0;
        var odooMenu = odooMap.get(catStruct.menu.sku);
        if ((odooMenu != null) && (odooMenu != undefined) && (odooMenu != "" ))
        {


          if ((odooMenu?.id ?? "-") == (catStruct?.menu?.sku ?? "")) //index = 0
          {

            
              catStruct.menu.isSoldOut = odooMenu?.isSoldOut ?? false; //odooMenu?.isSoldOut
              catStruct.menu.isShow = odooMenu?.isShow ?? true;
              catStruct.menu.discountDetail = odooMenu?.discountDetail;

              
              //check if this is vertical promo
              var verticalPromoResult = isMenuOfVerticalPromo(odooMenu?.id);
              if (verticalPromoResult != -999) {
                catStruct.menu.discountDetail = getVerticalPromoIdWithSKU(odooMenu?.id) //PromoOption.vertical_promo;
              }

              //check if this is bundle discount
              var bundleDiscountResult = isMenuOfBundleDiscount(odooMenu?.id);
            if (bundleDiscountResult != -999) {
              catStruct.menu.discountDetail = getBundleDiscountIdWithSKU(odooMenu?.id);
            }


            
            if (odooMenu?.qty != undefined && odooMenu?.qty != "")
            {
              
                catStruct.menu.qty = odooMenu?.qty ?? 0;
               
              
            }

            if(odooMenu?.menuprice != undefined)
            {
              var menuValue = parseFloat(String(odooMenu?.menuprice ?? "0.0"));
              if (catStruct?.menu?.menuprice != menuValue)
              {
                catStruct.menu.menuprice = parseFloat(String(odooMenu?.menuprice ?? "0.0"));

                
              }
            }

            for(var mg of catStruct.menu?.modifiergroups ?? [])
              {
                 
                //3008
                for (var optionG of mg?.optiongroups ?? []) {
                  for (var option of optionG?.groups ?? []) {
                    if (menuNotAvailable.includes(option?.sku ?? "-")) {
                      option.isSoldOut = true;


                    }
                    else {
                      option.isSoldOut = false;


                    }

                    //show or hide
                    if (menuToHide.includes(option?.sku ?? "-")) {
                      option.isShow = false;


                    }
                    else {
                      option.isShow = true;


                    }


                    //assign price from odoo
                    if (modPrice.has(option?.sku)) {
                      option.price = modPrice.get(option?.sku);
                      //addDebugLog("assigning option to " + option.price);
                    }
                  }
                }
                        
                 for(var mod of (mg?.modifiers ?? []))
                  {
                   
                     

                      if(menuNotAvailable?.includes(mod?.sku ?? "-"))
                      {
                        mod.isSoldOut = true;
                        
                      }
                      else
                      {
                        mod.isSoldOut = false;
                        
                      }

                      //show or hidden

                     

                      if(menuToHide?.includes(mod?.sku ?? "-"))
                        {
                          mod.isShow = false;
                          
                        }
                        else
                        {
                          mod.isShow = true;
                          
                        }
                        
                        if (gModifierToHide.includes(mod?.id ?? "-")) {
                         mod.isShow = false;
                        }


                      if(menuRealTime?.includes(mod?.sku ?? "-"))
                        {
                          mod.real_time = "true";
                        }
                        else
                        {
                          mod.real_time = "false";
                        }

                        //assign price from odoo
                        if(modPrice.has(mod?.sku))
                          {
                            mod.price = modPrice.get(mod?.sku);

                            //addDebugLog("assigning mod to " + mod.price);
                          }

                   
                  }
              }

           
           
          }
          else {
           
          }
        }
        else
        {
         
        }

     

      }
      


    }

   async setKioskReceiptFooter(req,res)
    {
      try{

        const authHeader = req.headers['authorization'];

         if (!authHeader) {
              return res.status(401).json({ error: 'Authorization header missing' });
         }

         const authHeaderParts = authHeader.split(' ');

             if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
               return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
             }

             const token = authHeaderParts[1]; // Extract the token

        //const token = authHeader.split(' ')[1]; // Assuming "Bearer <token>", split by space and get the token
        const { footer } = req.body;
        //console.log("setKioskReceiptFooter:" + token + " " + JSON.stringify(footer));

        // Check if the token matches the valid token (replace this with your token validation logic)
        if(footer != "")
        {
            if (token == this.generateEncryptedToken()) {
              const footerString = JSON.stringify(footer);
              console.log("writing footstring");
              console.log(footer);
              await fireStore.collection("odoo").doc("footer").set({ message: footerString  });
              
              res.status(200).json({ message: footerString  });
            } else {
              res.status(401).json({ error: 'Invalid token' });
            }
        }
        else
        {
              res.status(401).json({ error: 'Invalid footer' });
        }
        }
        catch(ex)
        {
              res.status(401).json({ error: ex.toString() });
        }
    }


    voidOrder(req,res)
    {

      const authHeader = req.headers['authorization'];

      if (!authHeader) {
           return res.status(401).json({ error: 'Authorization header missing' });
      }

      const authHeaderParts = authHeader.split(' ');

          if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
          }

          const token = authHeaderParts[1]; // Extract the token


      const { order_id, remark} = req.body;
      

      let data = JSON.stringify({
        "order_id": order_id,
        "remark": remark,
      });
      
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://staging.gspos.odoo.my/api/kiosks/voidorder',
        headers: { 
          'Authorization': 'Bearer ' + token, 
          'Content-Type': 'application/json', 
          
        },
        data : data
      };
      
      axios.request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));
        res.status(200).json(JSON.stringify(response.data));
      })
      .catch((error) => {
        console.log(error);
        res.status(401).json(JSON.stringify(error?.config?.data ?? error));
      });
      

    }


    queryCoupon(req,res)
    {

      const authHeader = req.headers['authorization'];

      if (!authHeader) {
           return res.status(401).json({ error: 'Authorization header missing' });
      }

      const authHeaderParts = authHeader.split(' ');

          if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
          }

          const token = authHeaderParts[1]; // Extract the token


      const { coupon_code} = req.body;
      if(token == '')
      {
        res.status(401).json({ error: 'Please provide a token' });
        return;
      }

      if(coupon_code == '')
      {
        res.status(401).json({ error: 'Please provide a coupon code' });
        return;
      }

      let data = JSON.stringify({
        "coupon_code": coupon_code
      });
      
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://staging.gspos.odoo.my/api/kiosks/querycoupon',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': 'Bearer ' + token, 
          'Cookie': 'session_id=f3892e4827051f5315646787eb1acf6acaade537'
        },
        data : data
      };
      
      axios.request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));
        res.status(200).json(JSON.stringify(response.data));
      })
      .catch((error) => {
        console.log(error);
        res.status(401).json({ error: error });
      });
      
    }


    menuMapping(req,res)
    {
      console.log("trigger menu mapping");
      
      const authHeader = req.headers['authorization'];

      if (!authHeader) {
           return res.status(401).json({ error: 'Authorization header missing' });
      }

      const authHeaderParts = authHeader.split(' ');

          if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
          }

          const token = authHeaderParts[1]; // Extract the token


      const { odoo_id, kiosk_id} = req.body;
      if(token == '')
      {
        res.status(401).json({ error: 'Please provide a token' });
        return;
      }


      if(odoo_id == '')
      {
        res.status(401).json({ error: 'Please provide a odoo id' });
        return;
      }

      if(kiosk_id == '')
        {
          res.status(401).json({ error: 'Please provide a kiosk id' });
          return;
        }

      console.log("menumapping " + odoo_id + " " + kiosk_id + " with token " + token);

      let data = JSON.stringify({
       
        "odoo_id":  odoo_id, 
        "kiosk_id" : kiosk_id
      });
      
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://staging.gspos.odoo.my/api/kiosks/menumapping',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': 'Bearer ' + token, 
          
        },
        data : data
      };
      
      axios.request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));
        res.status(200).json(JSON.stringify(response.data));
      })
      .catch((error) => {
        console.log(error);
        res.status(401).json({ error: error });
      });

    }

    queryMember(req,res)
    {
      console.log("trigger query member");
      
      const authHeader = req.headers['authorization'];

      if (!authHeader) {
           return res.status(401).json({ error: 'Authorization header missing' });
      }

      const authHeaderParts = authHeader.split(' ');

          if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
          }

          const token = authHeaderParts[1]; // Extract the token


      const { mobile_phone} = req.body;
      if(token == '')
      {
        res.status(401).json({ error: 'Please provide a token' });
        return;
      }


      if(mobile_phone == '')
      {
        res.status(401).json({ error: 'Please provide a mobile phone' });
        return;
      }

      console.log("querymember " + mobile_phone + " with token " + token);

      let data = JSON.stringify({
       
        "mobile_phone":  mobile_phone //"0123456789"
      });
      
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://staging.gspos.odoo.my/api/kiosks/querymember',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': 'Bearer ' + token, 
          'Cookie': 'session_id=f3892e4827051f5315646787eb1acf6acaade537'
        },
        data : data
      };
      
      axios.request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));
        res.status(200).json(JSON.stringify(response.data));
      })
      .catch((error) => {
        console.log(error);
        res.status(401).json({ error: error });
      });

    }

    checkStock(req, res)
    {

      const authHeader = req.headers['authorization'];

      if (!authHeader) {
           return res.status(401).json({ error: 'Authorization header missing' });
      }

      const authHeaderParts = authHeader.split(' ');

      if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
      }

      const token = authHeaderParts[1]; // Extract the token
      
      console.log(token);
      console.log(JSON.stringify(req.body));

      const axios = require('axios');
          // let data = JSON.stringify({
          //   "store_merchant_code": "MDV1",
          //   "modifiers": [
          //     "MOD_1132",
          //     "MOD_8797",
          //     "ITEM_8946"
          //   ]
          // });

          let data = JSON.stringify(req.body);

          let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://staging.gspos.odoo.my/api/kiosks/realtime',
            headers: { 
              'Content-Type': 'application/json', 
              'Authorization': 'Bearer ' + token, 
             
            },
            data : data
          };

          axios.request(config)
          .then((response) => {
            console.log(JSON.stringify(response.data));
            res.status(200).json(JSON.stringify(response.data));
          })
          .catch((error) => {
            console.log(error);
            res.status(401).json({ error: error });
          });

    }


    queryMemberCode(req,res)
    {
      console.log("trigger query member");
      
      const authHeader = req.headers['authorization'];

      if (!authHeader) {
           return res.status(401).json({ error: 'Authorization header missing' });
      }

      const authHeaderParts = authHeader.split(' ');

          if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
          }

          const token = authHeaderParts[1]; // Extract the token


      const { member_code} = req.body;
      if(token == '')
      {
        res.status(401).json({ error: 'Please provide a token' });
        return;
      }


      if(member_code == '')
      {
        res.status(401).json({ error: 'Please provide a member code' });
        return;
      }

      console.log("querymembercode " + member_code + " with token " + token);

      let data = JSON.stringify({
       
        "member_code":  member_code //"0123456789"
      });
      
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://staging.gspos.odoo.my/api/kiosks/querymember',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': 'Bearer ' + token, 
          'Cookie': 'session_id=f3892e4827051f5315646787eb1acf6acaade537'
        },
        data : data
      };
      
      axios.request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));
        res.status(200).json(JSON.stringify(response.data));
      })
      .catch((error) => {
        console.log(error);
        res.status(401).json({ error: error });
      });

    }


    queryToken(req,res)
    {
      console.log("queryToken");


      const { endpoint, phrase } = req.body;
      if(endpoint !== 'odoo')
      {
        res.status(401).json({ error: 'Invalid endpoint provided' });
        return;
      }

      if(phrase !== 'odoo')
      {
           res.status(401).json({ error: 'Invalid endpoint phrase provided' });
           return;
      }


      let data = JSON.stringify({
        // "db": "GS_ERP_P1_GOLIVE_FUGU_20_JULY_2022",
        "db": "GS_ERP_P1_GOLIVE_FUGU_20_JULY_2022",
        "login": "kiosk",
        "password": "Ls$Mr4k;ZTWwQ}9Ppc5/Gu"
      });
      
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://staging.gspos.odoo.my/api/auth/jsontoken',
        headers: { 
          'Content-Type': 'application/json'
        },
        data : data
      };
      
      axios.request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));
        res.status(200).json(JSON.stringify(response.data));
      })
      .catch((error) => {
        console.log(error);
        res.status(401).json({ error: error });
      });
      

    }

    getToken(req, res) {
      // Logic to generate a token (for demonstration purposes, generating a random token here)
     // const { endpoint,phrase } = req.body;
     try{


       const { endpoint, phrase } = req.body;

      console.log("gettoken:" + endpoint + " " + phrase);

      if(endpoint !== 'odoo')
      {
        res.status(401).json({ error: 'Invalid endpoint provided' });
        return;
      }

      if(phrase !== 'odoo')
      {
           res.status(401).json({ error: 'Invalid endpoint phrase provided' });
           return;
      }

      const token = this.generateEncryptedToken();
      res.json({ token });
      }
      catch(ex)
      {
            res.status(401).json({ error: ex.toString() });
      }
    }

    checkToken(req, res) {

      let token = req.params.token ?? "";

      // Check if the token matches the valid token (replace this with your token validation logic)
      if (token == this.generateEncryptedToken()) {
        res.json({ message: 'Token is valid' });
      } else {
        res.status(401).json({ error: 'Invalid token' });
      }
    }

    async setOrder(req,res) 
    {

      const { orderid, storeid } = req.body;

      if(orderid == '')
      {
           res.status(401).json({ error: 'Invalid order id provided' });
           return;
      }

      if(storeid == '')
      {
           res.status(401).json({ error: 'Invalid store id provided' });
           return;
      }

      //const storeRef = await fireStore.collection("store").doc("S_5aca69dd-e964-45ea-ae6d-e1061e28f737");
      const orderRef = await fireStore.collection("odoo").doc(storeid).collection("order").doc(orderid);
      const doc = await orderRef.get();
      //console.log(doc.data());
      if(doc?.data() == null || doc?.data() == undefined)
      {
        return res.status(404).json({ error: orderid + ' from ' + storeid + ' not found' });
      }

      var orderModel = new OrderModel(doc.data());
      //orderModel.toOdooOrder();
      const authHeader = req.headers['authorization'];

      if (!authHeader) {
           return res.status(401).json({ error: 'Authorization header missing' });
      }

      const authHeaderParts = authHeader.split(' ');

          if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
          }

          const token = authHeaderParts[1]; // Extract the token

          var orderNumber = orderModel.order_id;
          orderModel.order_id = "ZEAL_" + storeid + "_" + orderNumber;
          //orderModel.short_order_number =  storeid + "_" + orderNumber;
           orderModel.store_merchant_code = storeid;      

           
    
    let data2 = JSON.stringify(orderModel) ;   
     
    
    //console.log("data:");
console.log(data2);

//   "order_id": "ZEAL_TRX_000001",
//   "short_order_number": "TRX-00001",
//   "store_merchant_code": "TRX",
//   "order_datetime": "2024-03-31T18:00:00.000Z",
//   "member_code": "31BRMUo5pVJjPGyIBZjneDIbQ",
//   "remark": "Request plastic bag and give more tissue",
//   "items": [
//     {
//       "id": "ITEM_2953",
//       "quantity": 1,
//       "remark": "",
//       "price": 9.5,
//       "coupon_code": "",
//       "discount_id": "",
//       "discount_amount": "",
//       "modifiers": [
//         {
//           "id": "MOD_1132",
//           "price": 0,
//           "quantity": 1
//         },
//         {
//           "id": "MOD_7771",
//           "price": 1.5,
//           "quantity": 1
//         }
//       ]
//     }
//   ],
//   "bill_discount_id": "",
//   "bill_discount_amount": "",
//   "customer_payment": 11,
//   "gateway_payment": "",
//   "payment_type": "Credit Card",
//   "payment_reference": "CIMB891021313",
//   "subtotal": 11,
//   "discount_total": "",
//   "grand_total": 11,
//   "mode": "dine_in"
// });

let config = {
  method: 'post',
  maxBodyLength: Infinity,
  url: 'https://staging.gspos.odoo.my/api/kiosks/order',
  headers: { 
    'Content-Type': 'application/json', 
    'Authorization': 'Bearer ' + token, 
   
  },
  data : data2
};

axios.request(config)
.then((response) => {
  
  console.log(JSON.stringify(response.data));
  var orderDOC = doc.data();
  orderDOC.odoo_response = JSON.stringify(response.data);
  fireStore.collection("odoo_done").doc(storeid).collection("order").doc(orderDOC.id).set((orderDOC));
  fireStore.collection("odoo").doc(storeid).collection("order").doc(orderDOC.id).delete();
  res.status(200).json(response.data );
  
})
.catch((error) => {
  console.log("Error: " + orderModel.order_id);
  console.log(error);
  //var orderDOC = doc.data();
  //orderDOC.odoo_response = error.toString();
  //fireStore.collection("odoo_done").doc(storeid).collection("order").doc(orderDOC.id).set((orderDOC));
 
  res.status(401).json({ error: error });
});

}

// async repostOrder(req,res) 
// {

//   const { orderid, storeid } = req.body;

//   if(orderid == '')
//   {
//        res.status(401).json({ error: 'Invalid order id provided' });
//        return;
//   }

//   if(storeid == '')
//   {
//        res.status(401).json({ error: 'Invalid store id provided' });
//        return;
//   }

//   //const storeRef = await fireStore.collection("store").doc("S_5aca69dd-e964-45ea-ae6d-e1061e28f737");
//   const orderRef = await fireStore.collection("kiosk_recover").doc(orderid);
//   const doc = await orderRef.get();
//   //console.log(doc.data());
//   if(doc?.data() == null || doc?.data() == undefined)
//   {
//     return res.status(404).json({ error: orderid + ' from ' + storeid + ' not found' });
//   }

//   //var foodioModel = new OrderModel(doc.data());

  
//   var foodioModel = new OrderModel(doc.data());
//   var orderModel = new OdooOrderModel(foodioModel);

//   console.log(orderModel);

//   //orderModel.toOdooOrder();
//   const authHeader = req.headers['authorization'];

//   if (!authHeader) {
//        return res.status(401).json({ error: 'Authorization header missing' });
//   }

//   const authHeaderParts = authHeader.split(' ');

//       if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
//         return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
//       }

//       const token = authHeaderParts[1]; // Extract the token

//       var orderNumber = orderModel.order_id;
//       orderModel.order_id = "ZEAL_" + storeid + "_" + orderNumber;
//       //orderModel.short_order_number =  storeid + "_" + orderNumber;
//        orderModel.store_merchant_code = storeid;      

       

// let data2 = JSON.stringify(orderModel) ;   
 

// //console.log("data:");
// console.log(data2);

// //   "order_id": "ZEAL_TRX_000001",
// //   "short_order_number": "TRX-00001",
// //   "store_merchant_code": "TRX",
// //   "order_datetime": "2024-03-31T18:00:00.000Z",
// //   "member_code": "31BRMUo5pVJjPGyIBZjneDIbQ",
// //   "remark": "Request plastic bag and give more tissue",
// //   "items": [
// //     {
// //       "id": "ITEM_2953",
// //       "quantity": 1,
// //       "remark": "",
// //       "price": 9.5,
// //       "coupon_code": "",
// //       "discount_id": "",
// //       "discount_amount": "",
// //       "modifiers": [
// //         {
// //           "id": "MOD_1132",
// //           "price": 0,
// //           "quantity": 1
// //         },
// //         {
// //           "id": "MOD_7771",
// //           "price": 1.5,
// //           "quantity": 1
// //         }
// //       ]
// //     }
// //   ],
// //   "bill_discount_id": "",
// //   "bill_discount_amount": "",
// //   "customer_payment": 11,
// //   "gateway_payment": "",
// //   "payment_type": "Credit Card",
// //   "payment_reference": "CIMB891021313",
// //   "subtotal": 11,
// //   "discount_total": "",
// //   "grand_total": 11,
// //   "mode": "dine_in"
// // });

// let config = {
// method: 'post',
// maxBodyLength: Infinity,
// url: 'https://staging.gspos.odoo.my/api/kiosks/order',
// headers: { 
// 'Content-Type': 'application/json', 
// 'Authorization': 'Bearer ' + token, 

// },
// data : data2
// };

// axios.request(config)
// .then((response) => {

// console.log(JSON.stringify(response.data));
// //var orderDOC = doc.data();
// //orderDOC.odoo_response = JSON.stringify(response.data);
// //fireStore.collection("odoo_done").doc(storeid).collection("order").doc(orderDOC.id).set((orderDOC));
// //fireStore.collection("odoo").doc(storeid).collection("order").doc(orderDOC.id).delete();
// res.status(200).json(response.data );

// })
// .catch((error) => {
// console.log("Error: " + orderModel.order_id);
// console.log(error);
// //var orderDOC = doc.data();
// //orderDOC.odoo_response = error.toString();
// //fireStore.collection("odoo_done").doc(storeid).collection("order").doc(orderDOC.id).set((orderDOC));

// res.status(401).json({ error: error });
// });

// }

    syncMenu(req, res) 
    {
          //const { token,storeid } = req.body;
           try{

          const authHeader = req.headers['authorization'];

           if (!authHeader) {
                return res.status(401).json({ error: 'Authorization header missing' });
           }

           const authHeaderParts = authHeader.split(' ');

               if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
                 return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
               }

               const token = authHeaderParts[1]; // Extract the token

          //const token = authHeader.split(' ')[1]; // Assuming "Bearer <token>", split by space and get the token
          const { storeid } = req.body;
          console.log("syncmenu:" + token + " " + storeid);

          // Check if the token matches the valid token (replace this with your token validation logic)
          if(storeid != "")
          {
              if (token == this.generateEncryptedToken()) {

                console.log("about to triggerMenuSync");
                this.triggerMenuSync(storeid);

                res.json({ message: 'Sync done with ' + storeid });

                // const currentDate = new Date();
                // const formattedDate = currentDate.toLocaleString();

                // const syncRef = fireStore.collection("odoo").doc(storeid).collection("synccall").doc("999");
                // syncRef.set({ message: "demo trigger", datatime: formattedDate  });

              } else {
                res.status(401).json({ error: 'Invalid token' });
              }
          }
          else
          {
                res.status(401).json({ error: 'Invalid store' });
          }
          }
          catch(ex)
          {
                res.status(401).json({ error: ex.toString() });
          }
        }

        syncCall(req, res) 
        {
              //const { token,storeid } = req.body;
               try{
    
              const authHeader = req.headers['authorization'];
    
               if (!authHeader) {
                    return res.status(401).json({ error: 'Authorization header missing' });
               }
    
               const authHeaderParts = authHeader.split(' ');
    
                   if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
                     return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
                   }
    
                   const token = authHeaderParts[1]; // Extract the token
    
              //const token = authHeader.split(' ')[1]; // Assuming "Bearer <token>", split by space and get the token
              const {storeid, initial } = req.body;
              console.log("syncall:" + storeid + " " + initial);
    
              // Check if the token matches the valid token (replace this with your token validation logic)
              if(storeid != "")
              {
                  if (token == this.generateEncryptedToken()) {
    
                    const currentDate = new Date();
                    const formattedDate = currentDate.toLocaleString();
    
                    const syncRef = fireStore.collection("odoo").doc(storeid).collection("synccall").doc("99" + initial);
                    syncRef.set({ message: "demo trigger", datatime: formattedDate  });

                    res.json({ message: 'Sync called with ' + initial });
    
                    
    
                  } else {
                    res.status(401).json({ error: 'Invalid token' });
                  }
              }
              else
              {
                    res.status(401).json({ error: 'Invalid store' });
              }
              }
              catch(ex)
              {
                    res.status(401).json({ error: ex.toString() });
              }
            }
    

      //SECTION Feie related

      async handleCheckStatusCN(req,res)
      {
        return this.checkStatus(req,res, false);
      }

      async handleCheckStatusJP(req,res)
      {
        return this.checkStatus(req,res,true);
      }

      async checkStatus(req, res, isJP){
        const feie = new UtilFeie();

        
          // Check if the token matches the valid token (replace this with your token validation logic)
          const authHeader = req.headers['authorization'];

          if (!authHeader) {
              return res.status(401).json({ error: 'Authorization header missing' });
           }
           const authHeaderParts = authHeader.split(' ');

           if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
                return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
           }

           const token = authHeaderParts[1]; // Extract the token

          if (token == this.generateEncryptedToken()) {

          } else {
            res.status(401).json({ error: 'Invalid token' });
            return;
          }


          // Validate the request body
          if (!req.body) {
                  res.status(400).json({ error: 'Request body is missing or empty' });
                  return;
          }

          const requiredFields = ['sn'];
          for (const field of requiredFields) {
                  if (!(field in req.body)) {
                      res.status(400).json({ error: `Missing required field: ${field}` });
                      return;
                  }
          }

       

          try{

            let feieSN = feie.createFeieSNFromJSON(req.body);
            let feieResult = await feie.checkFeieStatus(feieSN.sn, isJP);
            
             res.json({ message: feieResult });
          }
          catch(ex)
          {
              console.log(ex);
              res.status(401).json({ error: ex });
          }

      }

      async handlePrintReceiptCN(req, res)
      {
          return this.printReceipt(req,res, false);
      }

      async handlePrintReceiptJP(req,res)
      {
        return this.printReceipt(req,res, true);
      }

      async printReceipt(req, res, isJP){
        const feie = new UtilFeie();

        
          // Check if the token matches the valid token (replace this with your token validation logic)
          const authHeader = req.headers['authorization'];

          if (!authHeader) {
              return res.status(401).json({ error: 'Authorization header missing' });
           }
           const authHeaderParts = authHeader.split(' ');

           if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
                return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
           }

           const token = authHeaderParts[1]; // Extract the token

          if (token == this.generateEncryptedToken()) {

          } else {
            res.status(401).json({ error: 'Invalid token' });
            return;
          }


          // Validate the request body
          if (!req.body) {
                  res.status(400).json({ error: 'Request body is missing or empty' });
                  return;
          }

          const requiredFields = ['sn', 'orderId', 'storeTitle', 'totalPrice', 'mobileAssignedTable', 'name', 'userPhoneNumber', 'orderItems'];
          for (const field of requiredFields) {
                  if (!(field in req.body)) {
                      res.status(400).json({ error: `Missing required field: ${field}` });
                      return;
                  }
          }

          if (!Array.isArray(req.body.orderItems)) {
                  res.status(400).json({ error: 'orderItems must be an array' });
                  return;
          }

          try{

            let feieOrder = feie.createFeieOrderFromJSON(req.body);
            let feieResult = await feie.printFeie2(feieOrder.sn, feie.printOrderReceiptFromOrder(feieOrder, false, 0), isJP);
            
             res.json({ message: feieResult });
          }
          catch(ex)
          {
              console.log(ex);
              res.status(401).json({ error: ex });
          }

      }

      async handlePrintOrderSlipCN(req,res)
      {
          return this.printOrderSlip(req, res, false);
      }

      async handlePrintOrderSlipJP(req,res)
      {
        return this.printOrderSlip(req, res, true);
      }


      async  savePromoToFirestore(promo) {
        if((promo?.discount_id ?? "") != "")
          {
        await fireStore.collection('odoopromo_demo').doc(promo?.discount_id).set(promo.toFirestore());
        console.log('Promo saved to Firestore');
          }
      }

      async handlePromo(req, res)
      {
        

        
          // Check if the token matches the valid token (replace this with your token validation logic)
          const authHeader = req.headers['authorization'];

          if (!authHeader) {
              return res.status(401).json({ error: 'Authorization header missing' });
           }
           const authHeaderParts = authHeader.split(' ');

           if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
                return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
           }

           const token = authHeaderParts[1]; // Extract the token

          if (token == this.generateEncryptedToken()) {

          } else {
            res.status(401).json({ error: 'Invalid token' });
            return;
          }


          // Validate the request body
          if (!req.body) {
                  res.status(400).json({ error: 'Request body is missing or empty' });
                  return;
          }

          
          try{

            //let feieOrder = feie.createFeieOrderFromJSON(req.body);
            

            const promo = new PromoMain(req.body);
            this.savePromoToFirestore(promo);

            console.log(promo);
            
             res.json({ message: promo.discount_id + " created" });
          }
          catch(ex)
          {
              console.log(ex);
              res.status(401).json({ error: ex });
          }
      }

      async printOrderSlip(req, res, isJP){
        const feie = new UtilFeie();

        
          // Check if the token matches the valid token (replace this with your token validation logic)
          const authHeader = req.headers['authorization'];

          if (!authHeader) {
              return res.status(401).json({ error: 'Authorization header missing' });
           }
           const authHeaderParts = authHeader.split(' ');

           if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
                return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
           }

           const token = authHeaderParts[1]; // Extract the token

          if (token == this.generateEncryptedToken()) {

          } else {
            res.status(401).json({ error: 'Invalid token' });
            return;
          }


          // Validate the request body
          if (!req.body) {
                  res.status(400).json({ error: 'Request body is missing or empty' });
                  return;
          }

          const requiredFields = ['sn', 'orderId', 'orderItems'];
          for (const field of requiredFields) {
                  if (!(field in req.body)) {
                      res.status(400).json({ error: `Missing required field: ${field}` });
                      return;
                  }
          }

          if (!Array.isArray(req.body.orderItems)) {
                  res.status(400).json({ error: 'orderItems must be an array' });
                  return;
          }

          try{

            //let feieOrder = feie.createFeieOrderFromJSON(req.body);
            let feieOrder = feie.createFeieOrderSlipFromJSON(req.body);

            let feieResult = await feie.printFeie2(feieOrder.sn, feie.printOrderItemSlip(feieOrder, false, 1),isJP);
            
             res.json({ message: feieResult });
          }
          catch(ex)
          {
              console.log(ex);
              res.status(401).json({ error: ex });
          }

      }

     async handlePrintTestCN(req,res) 
     {
        return this.printTest(req,res, false);
     }

     async handlePrintTestJP(req,res) 
     {
        return this.printTest(req,res, true);
     }

     async printTest(req, res, isJP)  {

            const feie = new UtilFeie();


            // Check if the token matches the valid token (replace this with your token validation logic)
            const authHeader = req.headers['authorization'];

            if (!authHeader) {
                return res.status(401).json({ error: 'Authorization header missing' });
             }
             const authHeaderParts = authHeader.split(' ');

             if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
                  return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
             }

             const token = authHeaderParts[1]; // Extract the token

            if (token == this.generateEncryptedToken()) {

            } else {
              res.status(401).json({ error: 'Invalid token' });
              return;
            }


            // Validate the request body
                if (!req.body) {
                    res.status(400).json({ error: 'Request body is missing or empty' });
                    return;
                }

                const requiredFields = ['orderId', 'mobileAssignedTable', 'name', 'userPhoneNumber', 'orderItems'];
                for (const field of requiredFields) {
                    if (!(field in req.body)) {
                        res.status(400).json({ error: `Missing required field: ${field}` });
                        return;
                    }
                }

                if (!Array.isArray(req.body.orderItems)) {
                    res.status(400).json({ error: 'orderItems must be an array' });
                    return;
                }



            try{
                   let feieResult = await feie.print(isJP);
                    res.json({ message: feieResult });
            }
            catch(ex)
            {
                console.log(ex);
                res.status(401).json({ error: ex });
            }

     }

    //  async printSample(req, res) {

    //              const feie = new UtilFeie();

    //               // Check if the token matches the valid token (replace this with your token validation logic)
    //                          const authHeader = req.headers['authorization'];

    //                          if (!authHeader) {
    //                              return res.status(401).json({ error: 'Authorization header missing' });
    //                           }
    //                           const authHeaderParts = authHeader.split(' ');

    //                           if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
    //                                return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
    //                           }

    //                           const token = authHeaderParts[1]; // Extract the token


    //              // Check if the token matches the valid token (replace this with your token validation logic)
    //              if (token == this.generateEncryptedToken()) {

    //              } else {
    //                res.status(401).json({ error: 'Invalid token' });
    //                return;

    //              }



    //               try{
    //                                 let feieResult = await feie.printFeie2(feie.printSampleReceipt());
    //                                  res.json({ message: feieResult });
    //                          }
    //                          catch(ex)
    //                          {
    //                              console.log(ex);
    //                              res.status(401).json({ error: ex });
    //                          }

    //       }

    // async printSampleOrderSlip(req, res) {

    //                 const feie = new UtilFeie();
    //                  // Check if the token matches the valid token (replace this with your token validation logic)
    //                             const authHeader = req.headers['authorization'];

    //                             if (!authHeader) {
    //                                 return res.status(401).json({ error: 'Authorization header missing' });
    //                              }
    //                              const authHeaderParts = authHeader.split(' ');

    //                              if (authHeaderParts.length !== 2 || authHeaderParts[0] !== 'Bearer') {
    //                                   return res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer token' });
    //                              }

    //                              const token = authHeaderParts[1]; // Extract the token


    //                 // Check if the token matches the valid token (replace this with your token validation logic)
    //                 if (token == this.generateEncryptedToken()) {
    //                   //res.json({ message: 'Token is valid' });
    //                 } else {
    //                   res.status(401).json({ error: 'Invalid token' });
    //                   return;

    //                 }



    //                 try{
    //                                                     let feieResult = await feie.printFeie2(feie.printSampleOrderSlip());
    //                                                      res.json({ message: feieResult });
    //                                              }
    //                                              catch(ex)
    //                                              {
    //                                                  console.log(ex);
    //                                                  res.status(401).json({ error: ex });
    //                                              }

    //          }



  getRouter() {
    return this.router;
  }
}

module.exports = DemoOdooRouter;