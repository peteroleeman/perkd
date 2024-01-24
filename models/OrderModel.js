import React from "react";
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { ConsumeOption, PaymentOption } from '../global'
import { DateTime } from "react-datetime";
import moment from "moment";
import OrderCalUtil from "../utils/OrderCalUtil";
import { ThreeSixty } from "@mui/icons-material";
import OrderItemModel from "./OrderItemModel";
import OdooOrderItemModel from "./odoo/OdooOrderItemModel";


class OrderModel {
    constructor(props) {
        //super(doc);

        //let props = doc.data();
        this.id = props.id;
        this.storeid = props.storeid;
        this.storetitle = props.storetitle;
        this.storeaddress = props.storeaddress;
        this.storeimg = props.storeimg;
        this.storeisopen = props.storeisopen;
        this.orderdatetime = props.orderdatetime;
        this.orderid = props.orderid
        this.totalqty = props.totalqty;
        this.totalprice = props.totalprice;
        this.roundng = props.roundng;
        this.tax = props.tax;
        this.taxinclusive = props.taxinclusive;
        this.servicecharge = props.servicecharge;
        this.totaldiscount = props.totaldiscount;
        this.totalpaid = props.totalpaid;
        this.totalchanged = props.totalchanged;
        this.subtotal = props.subtotal ?? 0.0;
        this.receiptdiscount = props.receiptdiscount;
        this.paymenttype = props.paymenttype;
        this.transactiondetail = props.transactiondetail;
        this.timeslot = props.timeslot;
        this.status = props.status;
        this.paymentstatus = props.paymentstatus;
        this.deliveryoption = props.deliveryoption;
        this.mobileassignedtable = props.mobileassignedtable;
        this.transactionid = props.transactionid;
        this.voucher = props.voucher;
        this.orderyear = props.orderyear;
        this.ordermonth = props.ordermonth;
        this.orderday = props.orderday;
        this.orderhour = props.orderhour;
        this.orderitems = props.orderitems;
        this.orders = props.orders;
        this.orderoriginal = props.orderoriginal;
        //List<OrderItemModel> orderItemList = [];
        this.pax = props.pax;
        this.name = props.name;
        this.userphonenumber = props.userphonenumber;
        this.email = props.email;
        this.epaymenttype = props.epaymenttype;
        this.epaymentdetail = props.epaymentdetail;
        this.isonhold = props.isonhold;
        this.serverid = props.serverid;
        this.collecteddatetime = props.collecteddatetime;
        this.paymentvouchers = props.paymentvouchers;
        this.ordertype = props.ordertype;
        this.kdsstatuslist = props.kdsstatuslist;
        this.cashamount = props.cashamount;
        this.epayamount = props.epayamount;
        this.cashvoucheramount = props.cashvoucheramount;
        this.ipaytransid = props.ipaytransid;
        this.ordervariant = props.ordervariant;
        this.orderitemsrecent = props.orderitemsrecent;
        this.orderfromonline = props.orderfromonline;
        this.onlineorderid = props.onlineorderid;


       

    }

    toOdooOrder()
    {
        let kRemark = "remark";
        let kBillDiscountAmount = "bill_discount_amount";
        let kOrderId = "order_id";
        let kItems = "items";
        let kCustomerPayment = "customer_payment";
        let kBillDiscountId = "bill_discount_id";
        let kGrandTotal = "grand_total";
        let kMode = "mode";
        let kGatewayPayment = "gateway_payment";
        let kVDiscountTotal = "vdiscount_total";
        let kStoreMerchantCode = "store_merchant_code";
        let kShortOrderNumber = "short_order_number";
        let kMemberCode = "member_code";
        let kSubTotal = "subtotal";
        let kPaymentReference = "payment_reference";
        let kOrderDateTime = "order_datetime";
        let kPaymentType = "payment_type";

        let orderMap = new Map();
        orderMap.set(kRemark, "");
        orderMap.set(kBillDiscountAmount, "");
        orderMap.set(kOrderId, this.orderid);
        orderMap.set(kItems, "");
        orderMap.set(kCustomerPayment, "" + this.totalpaid);
        orderMap.set(kBillDiscountId,"");
        orderMap.set(kGrandTotal, "" + this.totalprice);
        orderMap.set(kMode, "dine_in");
        orderMap.set(kGatewayPayment, "");
        orderMap.set(kVDiscountTotal, "");
        orderMap.set(kStoreMerchantCode , "MDV1");
        orderMap.set(kShortOrderNumber , this.orderid);
        orderMap.set(kMemberCode , "");
        orderMap.set(kSubTotal , "");
        orderMap.set(kPaymentReference , "");
        orderMap.set(kOrderDateTime, this.orderdatetime);
        orderMap.set(kPaymentType, "Credit Card");

        let itemList = [];
        for(let item of this.orderitems)
        {
            let itemModel = item;
            if(!(itemModel instanceof OrderItemModel))
            {
                itemModel = new OrderItemModel(item);
            }

            let odooItemModel = new OdooOrderItemModel(itemModel);
            itemList.push(odooItemModel);
        }
        orderMap.set(kItems, itemList);

        return orderMap;
    }

    getOrderItems()
    {
        if (this.orderitems == null || this.orderitems == undefined)
        {
            return [];
        }
         
        return this.orderitems;
    }

     updateCalSummary(orders)
    {
        let calSummary = new OrderCalUtil().calSummary(orders);
        /*
         totalqty: totalQty,
        totalprice: totalPrice.toFixed(2),
        totaldiscount: totalDiscount.toFixed(2),
        subtotal : subTotal.toFixed(2),
        tax: tax.toFixed(2),
        */

       this.totalqty = calSummary.totalqty;
       this.totalprice = calSummary.totalprice;
       this.totaldiscount = calSummary.totaldiscount;
       this.totalpaid = calSummary.totalprice;
         this.subtotal = calSummary.subtotal;
       this.totalchanged = "0.00";
         this.servicecharge = calSummary.serviceCharge;
        this.tax = calSummary.tax;
         this.taxinclusive = calSummary.taxinclusive;
         this.roundng = calSummary.rounding;
       
         this.orderitems = [];
       for(let orderItem of orders)
       {
           this.orderitems.push(orderItem);
       }

       



    }

    updateOrderType(type)
    {
        this.orderType = type;
    }

    getSubTotal()
    {
        let total = 0.0;
        for(let orderItem in this.orderitems)
        {
            total = total + ((orderItem.quantity * orderItem.price) - orderItem.discount);
        }

        return total;
    }

    updateOrderId(orderId)
    {
        this.orderid = orderId;
        this.onlineorderid = orderId;

    }
}

function CreateNewOrder(storeModel, orderId) {

    const gTakeAway = "Take Away";
    const gDineIn = "Dine In";
    const kOrderTypeDineIn = 0;
    const kOrderTypeTakeAway = 1;
    const kOrderNoSelection = -1;

    const kPayByRazer = 0;
    const kPayByIpay = 1;
    const kPayByCash = 2;
    const kPayByOther = 3;
    const kPayByVoucher = 4;

    const today = moment().format("YYYY-MM-DD hh:mm:ss");
    const todayYear = moment().format("YYYY");
    const todayMonth = moment().format("M");
    const todayDay = moment().format("D");
    const todayHour = moment().format("hh");
    const v4Id = uuidv4();

    return new OrderModel ( {
        id: "O_" + v4Id,
        storeid: storeModel.props.id,
        storetitle: storeModel.props.title,
        storeaddress: storeModel.props.address,
        storeimg: storeModel.props.img,
        storeisopen: storeModel.props.isopen,
        orderid: orderId,
        opendatetime: storeModel.props.opendate ?? "" + " " + storeModel.props.opentime ?? "",
        orderdatetime: today,
        orderyear: todayYear,
        ordermonth: todayMonth,
        orderday: todayDay,
        orderhour: todayHour,
        timeslot: "",
        mobileassignedtable: "",
        status: "0", //this means kStatusStart, next is kStatusPreparing etc
        deliveryoption: gDineIn,
        paymentstatus: 0, //0: kPaid
        transactionId: "", //for online transcation id
        voucher: "",
        pax: "1",
        epaymenttype: "",
        epaymentdetail: "",
        userphonenumber: "",
        name: "",
        email: "",
        receiptdiscount: "0.0", //set to no discount
        //v5
        //isOrderOnHold: orderModel.isOrderOnHold, //not relevant
        //serverId: orderModel.serverId, //not relevant
        //v6
        //collectedDateTime: orderModel.collectedDateTime, //not relevant
        //v7
        paymentvouchers: "", //set to none first
        transactiondetail: "", //use to record transaction detail
        ordertype: kOrderTypeDineIn, //redundant as delivery option
        paymentType: kPayByIpay,
        //v8
        //cashAmount: orderModel.cashAmount,//no relevant
        epayamount: "0.0", //need to capture payment amount
        //cashVoucherAmount: orderModel.cashVoucherAmount, //not relevant
        //v9
        ipaytransid: "", //to capture ipay transaction id

        //v10
        //orderVariant: 1, //not relevant

        orderitems: [], //later need to set to order items
        //orderItemsRecent: [], //not relevant
        //v13
        orderfromonline: "true",
        onlineorderid: orderId
    })


   
}


export default OrderModel;
export {CreateNewOrder};