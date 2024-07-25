//引入模块
var http = require('http');
var qs = require('querystring');
var crypto = require('crypto');
const axios = require('axios');


var USER = "fcey@me.com";//必填，飞鹅云 www.feieyun.cn后台注册的账号名
var UKEY = "rVN3AhIH27JbJkEU";//必填，飞鹅云后台注册账号后生成的UKEY
var SN = "223510740";

//以下URL参数不需要修改
var HOST = "api.feieyun.cn";     //域名
var HOST_JP = "api.jp.feieyun.com"
var PORT = "80";		         //端口
var PATH = "/Api/Open/";         //接口路径




//**********测试时，打开下面注释掉方法的即可,更多接口文档信息,请访问官网开放平台查看**********


//添加打印机接口（支持批量）
//----------接口返回值说明----------
//正确例子：{"msg":"ok","ret":0,"data":{"ok":["sn#key#remark#carnum","316500011#abcdefgh#快餐前台"],"no":["316500012#abcdefgh#快餐前台#13688889999  （错误：识别码不正确）"]},"serverExecutedTime":3}
//错误：{"msg":"参数错误 : 该帐号未注册.","ret":-2,"data":null,"serverExecutedTime":37}

//提示：打印机编号(必填) # 打印机识别码(必填) # 备注名称(选填) # 流量卡号码(选填)，多台打印机请换行（\n）添加新打印机信息，每次最多100行(台)。
//var snlist = "sn1#key1#remark1#carnum1\nsn2#key2#remark2#carnum2"
//addprinter(snlist);



//方法1.打印订单
//----------接口返回值说明----------
//正确例子：{"msg":"ok","ret":0,"data":"xxxx_xxxx_xxxxxxxxx","serverExecutedTime":6}
//错误：{"msg":"错误信息.","ret":非零错误码,"data":null,"serverExecutedTime":5}

//提示：调用打印接口之前，必须登录后台在该账号下添加打印机，或者通过API接口，把打印机添加到该账号下面
//var sn = "xxxxx";//打印机编号（9位数字），必填，查看打印机底部标签
//print(sn);



//方法2.查询某订单是否打印成功
//----------接口返回值说明----------
//已打印：{"msg":"ok","ret":0,"data":true,"serverExecutedTime":6}
//未打印：{"msg":"ok","ret":0,"data":false,"serverExecutedTime":6}

//var strorderid = "xxxxxx_xxxxxx_xxxxx";//订单id，由方法1返回
//queryOrderState(strorderid);




//方法3.查询指定打印机某天的订单详情
//----------接口返回值说明----------
//正确例子：{"msg":"ok","ret":0,"data":{"print":6,"waiting":1},"serverExecutedTime":9}
//错误例子：{"msg":"参数错误 : 时间格式不正确。","ret":1001,"data":null,"serverExecutedTime":37}

//var sn = "xxxxx";//打印机编号（9位数字），必填，查看打印机底部标签
//var strdate = "2017-03-09";//注意日期格式为yyyy-MM-dd
//queryOrderInfoByDate(sn,strdate);





//方法4.查询打印机的状态
//提示：由于获取到打印机状态有延时，不建议使用本接口作为发单的依据
//如果有订单数据要打印，直接调用方法1传过来即可，不必先调用本接口获取打印机状态

//----------接口返回值说明-----------
//提示：返回的JOSN中文是编码过的
//{"msg":"ok","ret":0,"data":"离线","serverExecutedTime":9}
//{"msg":"ok","ret":0,"data":"在线，工作状态正常","serverExecutedTime":9}
//{"msg":"ok","ret":0,"data":"在线，工作状态不正常","serverExecutedTime":9}

//var sn = "xxxxx";//打印机编号（9位数字），必填，查看打印机底部标签
//queryPrinterStatus(sn);





//-----------------------以下方法实现----------------------------------
class UtilFeie
{
     addprinter(snlist)
     {
            try{
                var STIME = Math.floor(new Date().getTime() / 1000);//请求时间,当前时间的秒数
                var post_data = {
                    user:USER,//账号
                    stime:STIME,//当前时间的秒数，请求时间
                    sig:signature(STIME),//签名
                    apiname:"Open_printerAddlist",//不需要修改
                    printerContent:snlist//添加的打印机信息
                    };
                var content = qs.stringify(post_data);
                var options = {
                    hostname:HOST,
                    port: 80,
                    path: PATH,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                    }
                };
                var req = http.request(options, function (res) {
                    res.setEncoding('utf-8');
                    res.on('data', function (response){
                        //response是返回的JSON字符串
                        console.log(response);
                    });
                });
                req.on('error', function (e) {
                    console.log('error!');
                });
                req.write(content);
                req.end();

            }
            catch(ex)
            {
                console.log(ex);
                res.write(ex);
                res.end();
            }
    }

    async  checkPrinterQueue(printerSN) {

      try {
        // Make a GET request to the specified URL with the serial number
        const response = await axios.get(`https://us-central1-foodio-ab3b2.cloudfunctions.net/app/checkfeiequeue/${printerSN}`);
    
        // Extract the response data
        const responseData = response.data;
    
        // Return the response data
        
        return (responseData);
       

      } catch (error) {
        // Handle errors by logging and returning an empty string
       
        return( error.message);
        
      }
    }

    async checkFeieStatus(printerSN, isJP)
    {
      const USER = "fcey@me.com";
      const UKEY = "rVN3AhIH27JbJkEU";
      let SN = printerSN; // "223510740";
     
  
      const timeStamp = Math.floor(Date.now() / 1000).toString();
  
      const bytes = Buffer.from(`${USER}${UKEY}${timeStamp}`, 'utf-8');
      const SIG = crypto.createHash('sha1').update(bytes).digest('hex');
  
      // let content = "";
      // for (const contentItem of contentList) {
      //     content += contentItem;
      // }
  
      var url = 'http://api.feieyun.cn/Api/Open/';

      if(isJP)
        {
          'http://api.jp.feieyun.com/Api/Open/';
        }

      const headers = {
          'Content-Type': 'application/x-www-form-urlencoded',
      };
  
      const bodyContent = {
          user: USER,
          stime: timeStamp,
          sig: SIG,
          apiname: "Open_queryPrinterStatus",
          sn: SN,
          times: "1",
      };
  
      try {
          const response = await axios.post(url, bodyContent, { headers });
          const statusCode = response.status;

          return `${statusCode} : ${JSON.stringify(response.data)}}`;
          // Handle the response as needed
      } catch (error) {
          // Handle errors or exceptions
          console.error(`Error: ${error.message}`);

          return `Error : ${error.message}}`;
      }
  
      console.log(`Demo receipt sent to printer ${SN}`);

      return `Receipt sent to printer ${SN}`;
      // Handle state update if needed
    }

    async printFeie2(printerSN, contentList, isJP) {
      const USER = "fcey@me.com";
      const UKEY = "rVN3AhIH27JbJkEU";
      let SN = printerSN; // "223510740";
     
      console.log( "printer SN:" + printerSN);
  
      const timeStamp = Math.floor(Date.now() / 1000).toString();
  
      const bytes = Buffer.from(`${USER}${UKEY}${timeStamp}`, 'utf-8');
      const SIG = crypto.createHash('sha1').update(bytes).digest('hex');
  
      let content = "";
      for (const contentItem of contentList) {
          content += contentItem;
      }
  
      var url = 'http://api.feieyun.cn/Api/Open/';
      if(isJP)
        {
          url = 'http://api.jp.feieyun.com/Api/Open/';
        }


      const headers = {
          'Content-Type': 'application/x-www-form-urlencoded',
      };
  
      const bodyContent = {
          user: USER,
          stime: timeStamp,
          sig: SIG,
          apiname: "Open_printMsg",
          sn: SN,
          content: content,
          times: "1",
      };
  
      try {
          const response = await axios.post(url, bodyContent, { headers });
          const statusCode = response.status;

          return `${statusCode} : Request sent}`;
          // Handle the response as needed
      } catch (error) {
          // Handle errors or exceptions
          console.error(`Error: ${error.message}`);

          return `Error : ${error.message}}`;
      }
  
      console.log(`Demo receipt sent to printer ${SN}`);

      return `Receipt sent to printer ${SN}`;
      // Handle state update if needed
  }
  
  async printFeieFromContent(printerSN, content, isJP) {
    const USER = "fcey@me.com";
    const UKEY = "rVN3AhIH27JbJkEU";
    let SN = printerSN; // "223510740";
   
    console.log( "printer SN:" + printerSN);
    //console.log( "content to print" + content);

    const timeStamp = Math.floor(Date.now() / 1000).toString();

    const bytes = Buffer.from(`${USER}${UKEY}${timeStamp}`, 'utf-8');
    const SIG = crypto.createHash('sha1').update(bytes).digest('hex');

    
    var url = 'http://api.feieyun.cn/Api/Open/';
    if(isJP)
      {
        url = 'http://api.jp.feieyun.com/Api/Open/';
      }


    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
    };

    const bodyContent = {
        user: USER,
        stime: timeStamp,
        sig: SIG,
        apiname: "Open_printMsg",
        sn: SN,
        content: content,
        times: "1",
    };

    try {
        const response = await axios.post(url, bodyContent, { headers });
        const statusCode = response.status;
        console.log(JSON.stringify(response.data));
        return `${JSON.stringify(response.data)}`;
        // Handle the response as needed
    } catch (error) {
        // Handle errors or exceptions
        console.error(`Error: ${error.message}`);

        return `Error : ${error.message}}`;
    }

    console.log(`Demo receipt sent to printer ${SN}`);

    return `Receipt sent to printer ${SN}`;
    // Handle state update if needed
}



    async  printFeie(contentList) {

        let content = "";
        content = contentList.join('');

        return new Promise((resolve, reject) =>{


                 var sn = this.SN;



                var STIME = Math.floor(new Date().getTime() / 1000);//请求时间,当前时间的秒数
                var post_data = {
                    user: this.USER,//账号
                    stime:this.STIME,//当前时间的秒数，请求时间
                    sig:this.signature(STIME),//签名
                    apiname:"Open_printMsg",//不需要修改
                    sn:sn,//打印机编号
                    content:content,//打印内容
                    times:"1"//打印联数,默认为1
                    };
                var content = qs.stringify(post_data);

                console.log(post_data);

                var options = {
                    hostname: this.HOST,
                    port: 80,
                    path: this.PATH,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                    }
                };
                var req = http.request( options, function (res) {
                    res.setEncoding('utf-8');
                    res.on('data', function (response){
                        //response是返回的JSON字符串
                        //服务器返回值，建议要当做日志记录起来
                        console.log(response);
                        resolve(response);
                    });
                });
                req.on('error', function (e) {
                    console.log('error!');
                    console.log(e);
                    reject(e);
                });
                req.write(content);
                req.end();

                console.log("print done");
                //return "Print data posted to cloud successfully";
            });
    }



    print(isJP)
    {
             return new Promise((resolve, reject) =>{


            var sn = SN;



            //标签说明：
            //单标签:
            //"<BR>"为换行,"<CUT>"为切刀指令(主动切纸,仅限切刀打印机使用才有效果)
            //"<LOGO>"为打印LOGO指令(前提是预先在机器内置LOGO图片),"<PLUGIN>"为钱箱或者外置音响指令
            //成对标签：
            //"<CB></CB>"为居中放大一倍,"<B></B>"为放大一倍,"<C></C>"为居中,<L></L>字体变高一倍
            //<W></W>字体变宽一倍,"<QR></QR>"为二维码,"<BOLD></BOLD>"为字体加粗,"<RIGHT></RIGHT>"为右对齐
            //拼凑订单内容时可参考如下格式
            //根据打印纸张的宽度，自行调整内容的格式，可参考下面的样例格式

            var orderInfo;
            orderInfo = "<CB>测试打印</CB><BR>";//标题字体如需居中放大,就需要用标签套上
            orderInfo += "名称　　　　　 单价  数量 金额<BR>";
            orderInfo += "--------------------------------<BR>";
            orderInfo += "番　　　　　　 1.0    1   1.0<BR>";
            orderInfo += "番茄　　　　　 10.0   10  10.0<BR>";
            orderInfo += "番茄炒　　　　 10.0   100 100.0<BR>";
            orderInfo += "番茄炒粉　　　 100.0  100 100.0<BR>";
            orderInfo += "番茄炒粉粉　　 1000.0 1   100.0<BR>";
            orderInfo += "番茄炒粉粉粉粉 100.0  100 100.0<BR>";
            orderInfo += "番茄炒粉粉粉粉 15.0   1   15.0<BR>";
            orderInfo += "备注：快点送到xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx<BR>";
            orderInfo += "--------------------------------<BR>";
            orderInfo += "合计：xx.0元<BR>";
            orderInfo += "送货地点：xxxxxxxxxxxxxxxxx<BR>";
            orderInfo += "联系电话：138000000000<BR>";
            orderInfo += "订餐时间：2011-01-06 19:30:10<BR><BR>";
            orderInfo += "----------请扫描二维码----------";
            orderInfo += "<QR>http://www.dzist.com</QR>";//把二维码字符串用标签套上即可自动生成二维码
        var STIME = Math.floor(new Date().getTime() / 1000);//请求时间,当前时间的秒数
        var post_data = {
            user: USER,//账号
            stime:STIME,//当前时间的秒数，请求时间
            sig:this.signature(STIME),//签名
            apiname:"Open_printMsg",//不需要修改
            sn:sn,//打印机编号
            content:orderInfo,//打印内容
            times:"1"//打印联数,默认为1
            };
        var content = qs.stringify(post_data);

       var host = HOST;
       if(isJP)
        {
          host = HOST_JP;
        }

        var options = {
            hostname: host,
            port: 80,
            path: PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            }
        };
        var req = http.request(options, function (res) {
            res.setEncoding('utf-8');
            res.on('data', function (response){
                //response是返回的JSON字符串
                //服务器返回值，建议要当做日志记录起来
                console.log(response);
                resolve(response);
            });
        });
        req.on('error', function (e) {
            console.log('error!');
            console.log(e);
            reject(e);
        });
        req.write(content);
        req.end();

        console.log("print done");
        //return "Print data posted to cloud successfully";
    });
    }


 queryOrderState(strorderid){
	var STIME = Math.floor(new Date().getTime() / 1000);//请求时间,当前时间的秒数
	var post_data = {
		user:USER,//账号
		stime:STIME,//当前时间的秒数，请求时间
		sig:signature(STIME),//签名
		apiname:"Open_queryOrderState",//不需要修改
		orderid:strorderid//订单id由方法1返回
		};
	var content = qs.stringify(post_data);
	var options = {
		hostname:HOST,
		port: 80,
		path:PATH,
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
		}
	};
	var req = http.request(options, function (res) {
		res.setEncoding('utf-8');
		res.on('data', function (response){
			//response是返回的JSON字符串
			console.log(response);
		});
	});
	req.on('error', function (e) {
		console.log('error!');
	});
	req.write(content);
	req.end();
}

 queryOrderInfoByDate(sn,strdate){
	var STIME = Math.floor(new Date().getTime() / 1000);//请求时间,当前时间的秒数
	var post_data = {
		user:USER,//账号
		stime:STIME,//当前时间的秒数，请求时间
		sig: this.signature(STIME),//签名
		apiname:"Open_queryOrderInfoByDate",//不需要修改
		sn:sn,//打印机编号
		date:strdate,//日期
		};
	var content = qs.stringify(post_data);
	var options = {
		hostname:HOST,
		port: 80,
		path: PATH,
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
		}
	};
	var req = http.request(options, function (res) {
		res.setEncoding('utf-8');
		res.on('data', function (response){
			//response是返回的JSON字符串
			console.log(response);
		});
	});
	req.on('error', function (e) {
		console.log('error!');
	});
	req.write(content);
	req.end();
}


 queryPrinterStatus(sn){
	var STIME = Math.floor(new Date().getTime() / 1000);//请求时间,当前时间的秒数
	var post_data = {
		user:USER,//账号
		stime:STIME,//当前时间的秒数，请求时间
		sig:signature(STIME),//签名
		apiname:"Open_queryPrinterStatus",//不需要修改
		sn:sn//打印机编号
		};
	var content = qs.stringify(post_data);
	var options = {
		hostname:HOST,
		port: 80,
		path: PATH,
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
		}
	};
	var req = http.request(options, function (res) {
		res.setEncoding('utf-8');
		res.on('data', function (response){
			//response是返回的JSON字符串
			console.log(response);
		});
	});
	req.on('error', function (e) {
		console.log('error!');
	});
	req.write(content);
	req.end();
    }

 signature(STIME){
    //var textValue = "${this.USER}${this.UKEY}${STIME}";
    console.log(USER);
    console.log(UKEY);
    console.log(STIME);
    var textValue = USER + UKEY + STIME;
    console.log("generating signature with parameter below");
    console.log(textValue);
	return crypto.createHash('sha1').update(textValue).digest('hex');//获取签名
    }


    printSampleReceipt(type = 0) {
      let receiptLen = 32;
      let keyLen = 23;
      let valueLen = 8;

      if (type === 1) {
        receiptLen = 48;
        keyLen = 10;
        valueLen = 38;
      }

      const receipt = [];

      const receiptLine = new ReceiptLine();
      receiptLine.init(receiptLen);
      receiptLine.addText("<CB>测试打印</CB>");
      receiptLine.addLine("-");

      for (const line of receiptLine.getReceipt()) {
        receipt.push(line);
      }

      const dualTable = new ReceiptDualTable();
      dualTable.init(keyLen, valueLen);
      dualTable.addKey("名称");
      dualTable.addValue("金额");
      dualTable.addKey("1x 蛋炒饭");
      dualTable.addValue("2.50");
      dualTable.addKey("备注：加辣");
      dualTable.addValue("");
      dualTable.addKey("10x 蛋炒饭");
      dualTable.addValue("25.00");
      dualTable.addKey("100x 蛋炒饭");
      dualTable.addValue("250.00");

      dualTable.addKey("1x Char Koay Teow");
      dualTable.addValue("2.50");
      dualTable.addKey("10x Char Koay Teow");
      dualTable.addValue("25.00");
      dualTable.addKey("100x Char Koay Teow");
      dualTable.addValue("250.00");

      for (const line of dualTable.getReceipt()) {
        receipt.push(line);
      }

      receiptLine.refresh();
      receiptLine.addLine("-");

      for (const line of receipt) {
        console.log(line);
      }

      return receipt;
    }


    printSampleOrderSlip(type = 0) {
      let receiptLen = 32;
      if (type === 1) {
        receiptLen = 48;
      }

      const receiptLine = new ReceiptLine();
      receiptLine.init(receiptLen);
      receiptLine.addText(ReceiptFormat.setCenterBIG("测试打印"));
      receiptLine.addText("蛋炒饭");
      receiptLine.addText("<RIGHT>1</RIGHT>");

      return receiptLine.getReceipt();
    }


  //SECTION create data from JSON
 createFeieSNFromJSON(snData)
 {
  const result = new feieSN(snData);
   
  return result;
 }

  createFeieOrderFromJSON(jsonData) {
   
    //test data is meant to test out the jsonData input, in case jsonData input no longer working
    const testData = {
      "sn" : "223510740",
      "orderId": "12345",
      "storeTitle": "MDV",
      "mobileAssignedTable": "A1",
      "totalPrice": "RM 100",
      "name": "John Doe",
      "userPhoneNumber": "1234567890",
      "orderItems": [
        {
          "title": "Item 1",
          "qty": 2,
          "modInfo": "Extra cheese",
          "setMenu1": "Side Salad",
          "setMenu2": "Soft Drink"
        },
        {
          "title": "Item 2",
          "qty": 1,
          "modInfo": "",
          "setMenu1": "",
          "setMenu2": ""
        }
        // Add more order items as needed
      ]
    };
    
    const order = new feieOrder(jsonData);
    
    console.log(order);

    return order;

  }

  createFeieOrderSlipFromJSON(jsonData)
  {
    const testData = 
    {
      "sn": "223510740",
      "orderId": "POS_12345",
      "dateTime" : "02/05/2024 Mon 01:00PM",
      "storeTitle": "MDV",
      "buzzer": "13",
      "remark": "this is a long remark entered by end user",
      "orderMode": "Take Away",
      "orderItems": [
        {
          "title": "Single Jr Cone",
          "qty": 1,
          "modInfo": [
            { "title": "Extra cheese", "qty": 1 }
          ]
        },
        {
          "title": "Single Jr Cone",
          "qty": 2,
          "modInfo": [
            { "title": "Chocolate", "qty": 1 },
            { "title": "Strawberry", "qty": 1 }
          ]
        },
        {
          "title": "Pizza",
          "qty": 1,
          "modInfo": [
            { "title": "Extra cheese", "qty": 1 }
          ]
        }
      ]
    }
    
    const order = new FeieOrderSlip(jsonData);
    
    console.log(order);

    return order;

  }

  createFeieOrderItemFromJSON(item) {
    return new feieOrderItem(
      item.title,
      item.qty,
      item.modInfo,
      item.setMenu1,
      item.setMenu2
    );
  }

  //SECTION print function
  printOrderItemSlip(orderModel, bReprint = false, type = 0) {
        //console.log(orderModel);

        const receipt = [];
        // const now = new Date();
        // const dateFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
        // const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });
        
        // const currentDate = dateFormatter.format(now);
        // const currentTime = timeFormatter.format(now);

        // const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'short' });

        let keyLen = 16 + 14;
        let valueLen = 2;

        if (type === 1) {
          keyLen = 24 + 22;
          valueLen = 2;
        }

        const dualTable = new ReceiptDualTable();
        const line = new ReceiptLine();
        line.init(keyLen + valueLen);
        dualTable.init(keyLen, valueLen);

        if (bReprint === true) {
          line.addText(ReceiptFormat.setCenterBIG("*DUPLICATE*"));
        }

        line.addText(
          ReceiptFormat.setRightAlign(`<BOLD>${orderModel.printerName}</BOLD>`));
        
       

        line.addText(  ReceiptFormat.setCenterBIG(`${orderModel.buzzer} (${orderModel.orderMode})`));
        line.addText("<BR>");
        line.addText(ReceiptFormat.setCenter(`${orderModel.dateTime}`));
        line.addText("<BR>");
        line.addText(
        ReceiptFormat.setBold(`**NOTE:` + "<BR>"));
        line.addText(orderModel.remark);
        line.addText("<BR>");


        line.addLine("-");

        for (const lineText of line.getReceipt()) {
          receipt.push(lineText);
        }

        // dualTable.refresh();
        // dualTable.addKey(`${orderModel?.orderId}`);
        // dualTable.addValue(orderModel?.mobileAssignedTable || "-");

        for (const lineText of dualTable.getReceipt()) {
          receipt.push(lineText);
        }

        let qty = 0;
        let title = "";
        let modInfo = "";
       
        for (const orderItem of orderModel.orderItems) {
          qty = orderItem.qty;
          title = orderItem.title;

          dualTable.refresh();
          dualTable.addKey(`${title}`);
          dualTable.addValue(`${qty}` || "-");

          for (const lineText of dualTable.getReceipt()) {
            receipt.push(lineText);
          }


          if (orderItem?.modInfo !== "" && orderItem?.modInfo !== "null"  && orderItem?.modInfo !== undefined) {
            //modInfo = (`S:${orderItem.modInfo}<BR>`);
             for(const mod of orderItem.modInfo)
             {
                let modTitle = mod.title;
                let modQty = mod.qty;

                dualTable.refresh();
                dualTable.addKey(`  ${modTitle}`);
                if(modQty > 1)
                {
                dualTable.addBoldValue(`${modQty}`);
                }
                else
                {
                  dualTable.addValue(`${modQty}`);
                }

                for (const lineText of dualTable.getReceipt()) {
                  receipt.push(lineText);
                }

                

             }

          }
          

         
          line.refresh();
          line.addLine("-");
          for (const lineText of line.getReceipt()) 
          {
             receipt.push(lineText);
          }

        }

        

        // line.addText(ReceiptFormat.setBIG(title) + "<BR>");
        // line.addText(
        //   ReceiptFormat.setRightAlign(`<B>${totalQty}</B>`));

        // if (modInfo !== "" && modInfo !== "null") {
        //   line.addText(`${modInfo}<BR>`);
        // }

        // if (menu1 !== "") {
        //   line.addText(`${menu1}<BR>`);
        // }
        // if (menu2 !== "") {
        //   line.addText(`${menu2}<BR>`);
        // }
        // if (menu3 !== "") {
        //   line.addText(`${menu3}<BR>`);
        // }
        // if (menu4 !== "") {
        //   line.addText(`${menu4}<BR>`);
        // }
        // if (menu5 !== "") {
        //   line.addText(`${menu5}<BR>`);
        // }

        // line.addText("<BR>");
        // line.addText(`${orderModel?.name}<BR>`);
        // line.addText(orderModel?.userPhoneNumber || "-");

        // for (const lineText of line.getReceipt()) {
        //   receipt.push(lineText);
        // }

        //console.log("Feie order slip printed");
        return receipt;
      }

      //bReprint = false as default
      //type = 0 as default. 0 is normal receipt, 1 is wide receipt
      printOrderReceiptFromOrder(orderModel, bReprint, type ) {
    

          const receipt = [];

          const now = new Date();
          // const dateFormatter = format(now, 'yyyy-MM-dd');
          // const timeFormatter = format(now, 'HH:mm:ss');
          // const currentDate = dateFormatter;
          // const currentTime = timeFormatter;


const dateFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

const currentDate = dateFormatter.format(now);
const currentTime = timeFormatter.format(now);

          let dateLen = 16;
          let timeLen = 16;
          if (type === 1) {
              dateLen = 24;
              timeLen = 24;
          }

          const dualTable = new ReceiptDualTable();
          const line = new ReceiptLine();
          line.init(dateLen + timeLen);
          dualTable.init(dateLen, timeLen);

          if (bReprint === true) {
              line.addText('*DUPLICATE*');
          }

          if ((orderModel?.storeTitle || "") !== "") {
              line.addText(orderModel?.storeTitle);
          }

          line.addText(`${currentDate} ${currentTime}`);
          line.addText(orderModel.orderId || "-");

          // ... (Skipping other parts for brevity)

          for (let lineItem of line.getReceipt()) {
              receipt.push(lineItem);
          }

          console.log(receipt);
          // ... (Skipping other parts for brevity)

          // Printing the summary
          let keyLen = 10;
          let valueLen = 22;

          if (type === 1) {
              keyLen = 3;
              valueLen = 38 + 7;
          }

          dualTable.init(keyLen, valueLen);
          dualTable.addKey("");
          dualTable.addValue("Currency");

          // ... (Skipping other parts for brevity)

          for (let line of dualTable.getReceipt()) {
              receipt.push(line);
          }

          line.refresh();

          receipt.push(`Total ${orderModel.totalPrice}`);
          receipt.push('* * *');

          // ... (Skipping other parts for brevity)

          return receipt;
      }


}


class ReceiptFormat {
  static setBold(text) {
    return `<BOLD>${text}</BOLD>`;
  }

  static setCenterBIG(text) {
    return `<CB>${text}</CB>`;
  }

  static setBIG(text) {
    return `<B>${text}</B>`;
  }

  static setQR(text) {
    return `<QR>${text}</QR>`;
  }

  static setRightAlign(text) {
    return `<RIGHT>${text}</RIGHT>`;
  }

  static setCenter(text) {
    return `<C>${text}</C>`;
  }
}

class ReceiptSubChunk {
  constructor() {
    this.index = 0;
    this.textLen = 5;
    this.values = [];
  }

  setLine(index, value, textLength) {
    this.index = index;
    this.textLen = textLength;
    this.values.push(value);
  }

  setChunk(index, value, textLength, padChar, padType) {
    this.index = index;
    this.textLen = textLength;
    const returnList = this.splitText(value, textLength);

    for (const sItem of returnList) {
      let remainLen = textLength - this.getTextLen(sItem.toString());
      remainLen = remainLen < 0 ? 0 : remainLen;

      let fullText = '';
      if (padType === -1) {
        fullText = sItem;
      } else if (padType === 0) {
        fullText = `${' '.padEnd(remainLen, ' ')}${sItem}`;
        if (remainLen === 0) {
          fullText = sItem;
        }
      } else if (padType === 1) {
        fullText = `${sItem}${' '.padEnd(remainLen, ' ')}`;
        if (remainLen === 0) {
          fullText = sItem;
        }
      }

      this.values.push(fullText);
    }
  }

  getChunk(index) {
    try {
      const text = this.values[index] || '';
      return text;
    } catch (ex) {
      console.log(ex.toString());
    }

    return '';
  }

  getChunkLength() {
    return this.values.length || 0;
  }

  splitText(input, splitLen) {
    let len = 0;
    let text = '';
    const returnList = [];

    if (this.getTextLen(input) <= splitLen) {
      returnList.push(input);
    } else {
      for (let i = 0; i < input.length; i++) {
        const char = input[i];
        len += this.isAllCharEnglish(char) ? 1 : 2;
        text += char;

        if (len >= splitLen) {
          returnList.push(text);
          text = '';
          len = 0;
        }
      }
    }

    return returnList;
  }

  getTextLen(input) {
    // Implement your own logic for getting the text length
    // This is a placeholder for the missing UtilString.getTextLen function
    // You may need to replace it with your actual implementation.
    return input.length;
  }

  isAllCharEnglish(char) {
    // Implement your own logic for checking if a character is English
    // This is a placeholder for the missing UtilString.isAllCharEnglish function
    // You may need to replace it with your actual implementation.
    return /^[A-Za-z]+$/.test(char);
  }
}

class ReceiptLine {
  constructor() {
    this.receiptLen = 32;
    this.lineList = [];
  }

  init(lenValue) {
    this.lineList = [];
    this.receiptLen = lenValue;
  }

  refresh() {
    this.lineList = [];
  }

  addLine(lineChar) {
    const index = this.lineList.length;
    const subChunk = new ReceiptSubChunk();
    subChunk.setLine(index, lineChar, 0);
    this.lineList.push(subChunk);
  }

  addText(text) {
    const index = this.lineList.length;
    const subChunk = new ReceiptSubChunk();
    const sLine = text;
    subChunk.setChunk(index, sLine, this.receiptLen, '-', -1);
    this.lineList.push(subChunk);
  }

  isLine(index) {
    if (index > this.lineList.length - 1) {
      return false;
    }

    const subChunk = this.lineList[index];
    return subChunk.textLen === 0;
  }

  getLine(index) {
    const subChunk = this.lineList[index];
    const lineChar = subChunk.values[0];
    return `${lineChar.padEnd(this.receiptLen - 1, lineChar)}<BR>`;
  }

  geString(index, subIndex) {
    if (index > this.lineList.length - 1) {
      return '';
    }

    const subChunk = this.lineList[index];
    return subChunk.getChunk(subIndex);
  }

  getReceipt() {
    const returnMap = {};

    for (let index = 0; index < this.lineList.length; index++) {
      if (this.isLine(index)) {
        returnMap[Object.keys(returnMap).length] = this.getLine(index);
      } else {
        for (let subIndex = 0; subIndex < this.lineList[index].getChunkLength(); subIndex++) {
          const sText = this.geString(index, subIndex);
          returnMap[Object.keys(returnMap).length] = `${sText}`;
        }
      }
    }

    return Object.values(returnMap);
  }
}

class ReceiptDualTable {
  constructor() {
    this.keyLen = 26;
    this.valueLen = 6;
    this.keyList = [];
    this.valueList = [];
  }

  init(keyLenValue, valueLenValue) {
    this.keyLen = keyLenValue;
    this.valueLen = valueLenValue;
    this.keyList = [];
    this.valueList = [];
  }

  refresh() {
    this.keyList = [];
    this.valueList = [];
  }

  addKeyLine(lineChar) {
    const index = this.keyList.length;
    const subChunk = new ReceiptSubChunk();
    const sLine = lineChar.padEnd(this.keyLen - 1, lineChar);
    subChunk.setChunk(index, sLine, this.keyLen, ' ', 1);
    this.keyList.push(subChunk);
  }

  addValueLine(lineChar) {
    const index = this.valueList.length;
    const subChunk = new ReceiptSubChunk();
    const sLine = lineChar.padEnd(this.valueLen - 1, lineChar);
    subChunk.setChunk(index, sLine, this.valueLen, ' ', 1);
    this.valueList.push(subChunk);
  }

  addLine(lineChar) {
    const index = this.keyList.length;
    const subChunk = new ReceiptSubChunk();
    subChunk.setLine(index, lineChar, 0);
    this.keyList.push(subChunk);
  }

  addKey(text) {
    const index = this.keyList.length;
    const subChunk = new ReceiptSubChunk();
    subChunk.setChunk(index, text, this.keyLen, ' ', 1);
    this.keyList.push(subChunk);
  }

  addValue(text) {
    const index = this.valueList.length;
    const subChunk = new ReceiptSubChunk();

    let remainLen = this.valueLen - this.getTextLen(text.toString());
    remainLen = remainLen < 0 ? 0 : remainLen;

    const newText = `<RIGHT>${' '.padEnd(remainLen, ' ')}${text}</RIGHT>`;
    if (remainLen === 0) {
      newText = `<RIGHT>${text}</RIGHT>`;
    }

    subChunk.setChunk(index, newText, this.getTextLen(newText), ' ', 0);
    this.valueList.push(subChunk);
  }

  addBoldValue(text) {
    const index = this.valueList.length;
    const subChunk = new ReceiptSubChunk();

    let remainLen = this.valueLen - this.getTextLen(text.toString());
    remainLen = remainLen < 0 ? 0 : remainLen;

    const newText = `<RIGHT><BOLD>${' '.padEnd(remainLen, ' ')}${text}</BOLD></RIGHT>`;
    if (remainLen === 0) {
      newText = `<RIGHT><BOLD>${text}</BOLD></RIGHT>`;
    }

    subChunk.setChunk(index, newText, this.getTextLen(newText), ' ', 0);
    this.valueList.push(subChunk);
  }

  isLine(index) {
    if (index > this.keyList.length - 1) {
      return false;
    }

    const subChunk = this.keyList[index];
    return subChunk.textLen === 0;
  }

  getTextLen(input) {
    // Implement your own logic for getting the text length
    // This is a placeholder for the missing UtilString.getTextLen function
    // You may need to replace it with your actual implementation.
    return input.length;
  }


  getLine(index) {
    const subChunk = this.keyList[index];
    const lineChar = subChunk.values[0];
    const receiptLen = this.keyLen + this.valueLen;
    return `${lineChar.padEnd(receiptLen - 1, lineChar)}`;
  }

  getKeyString(index, subIndex) {
    if (index > this.keyList.length - 1) {
      return '';
    }

    const subChunk = this.keyList[index];
    return subChunk.getChunk(subIndex);
  }

  getValueString(index, subIndex) {
    if (index > this.valueList.length - 1) {
      return '';
    }

    const subChunk = this.valueList[index];
    return subChunk.getChunk(subIndex);
  }

  getReceipt() {
    const returnMap = {};

    for (let index = 0; index < this.keyList.length; index++) {
      if (this.isLine(index)) {
        returnMap[Object.keys(returnMap).length] = this.getLine(index);
      } else {
        for (let subIndex = 0; subIndex < this.keyList[index].getChunkLength(); subIndex++) {
          const sKey = this.getKeyString(index, subIndex);
          const sValue = this.getValueString(index, subIndex);
          returnMap[Object.keys(returnMap).length] = `${sKey}${sValue}`;
        }
      }
    }

    return Object.values(returnMap);
  }

  /*

  // Example JSON structure for orderModel
  {
    "storeTitle" : "Store A"
    "orderId": "12345",
    "totalPrice" : "RM 100"
    "mobileAssignedTable": "A1",
    "name": "John Doe",
    "userPhoneNumber": "1234567890",
    "orderItems": [
      {
        "title": "Item 1",
        "qty": 2,
        "modInfo": "Extra cheese",
        "setMenu1": "Side Salad",
        "setMenu2": "Soft Drink"
      },
      {
        "title": "Item 2",
        "qty": 1,
        "modInfo": "",
        "setMenu1": "",
        "setMenu2": ""
      }
      // Add more order items as needed
    ]
  }

  // Example JSON structure for element
  {
    "title": "Item 1",
    "qty": 2,
    "modInfo": "Extra cheese",
    "setMenu1": "Side Salad",
    "setMenu2": "Soft Drink"
  }
  */


  
}

class feieSN
{
  constructor(snData)
  {
    this.sn = snData.sn;
  }

}

class feieOrder {
  constructor(orderData) {
    // this.storeTitle = storeTitle
    // this.orderId = orderId;
    // this.totalPrice = totalPrice;
    // this.mobileAssignedTable = mobileAssignedTable;
    // this.name = name;
    // this.userPhoneNumber = userPhoneNumber;
    // this.orderItems = orderItems;//orderItems.map(item => new feieOrderItem(item.title, item.qty, item.modInfo, item.setMenu1, item.setMenu2));
    this.sn = orderData.sn;
    this.orderId = orderData.orderId;
    this.storeTitle = orderData.storeTitle;
    this.mobileAssignedTable = orderData.mobileAssignedTable;
    this.totalPrice = orderData.totalPrice;
    this.name = orderData.name;
    this.userPhoneNumber = orderData.userPhoneNumber;
    this.orderItems = orderData.orderItems.map(itemData => new feieOrderItem(itemData));
  
  }

}

class feieOrderItem {
  constructor(itemData) {
    this.title = itemData.title;
    this.qty = itemData.qty;
    this.modInfo = itemData.modInfo;
    this.setMenu1 = itemData.setMenu1;
    this.setMenu2 = itemData.setMenu2;
  }
}


class FeieOrderSlip {
  constructor(orderDetails) {
    this.dateTime = orderDetails.dateTime || '';
    this.printerName = orderDetails.printerName || '';
    this.sn = orderDetails.sn || '';
    this.orderId = orderDetails.orderId || '';
    this.storeTitle = orderDetails.storeTitle || '';
    this.buzzer = orderDetails.buzzer || '';
    this.remark = orderDetails.remark || '';
    this.orderMode = orderDetails.orderMode || '';
    this.orderItems = orderDetails.orderItems || [];
  }

  printOrderSummary() {
    console.log(`Printer Name: ${this.printerName}`);
    console.log(`Date Time: ${this.dateTime}`);
    console.log(`Order ID: ${this.orderId}`);
    console.log(`Store Title: ${this.storeTitle}`);
    console.log(`Buzzer: ${this.buzzer}`);
    console.log(`Remark: ${this.remark}`);
    console.log(`Order Mode: ${this.orderMode}`);
    
    if (this.orderItems.length > 0) {
      console.log('Order Items:');
      this.orderItems.forEach((item, index) => {
        console.log(`${index + 1}. ${item.qty}x ${item.title}`);
        if (item.modInfo && item.modInfo.length > 0) {
          console.log('   Modifications:');
          item.modInfo.forEach(mod => {
            console.log(`      ${mod.qty}x ${mod.title}`);
          });
        }
      });
    } else {
      console.log('No order items found.');
    }
  }
}

// Example usage:
const orderDetails = {
  sn: "223510740",
  dateTime: "02/05/2024 Mon 01:00PM",
  orderId: "POS_12345",
  storeTitle: "MDV",
  buzzer: "13",
  remark: "this is a long remark entered by end user",
  orderMode: "Take Away",
  orderItems: [
    {
      title: "Single Jr Cone",
      qty: 1,
      modInfo: [
        { title: "Extra cheese", qty: 1 }
      ]
    },
    {
      title: "Single Jr Cone",
      qty: 2,
      modInfo: [
        { title: "Chocolate", qty: 1 },
        { title: "Strawberry", qty: 1 }
      ]
    },
    {
      title: "Pizza",
      qty: 1,
      modInfo: [
        { title: "Extra cheese", qty: 1 }
      ]
    }
  ]
};




module.exports = UtilFeie;



