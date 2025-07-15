// import React, { Component } from 'react';
// import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
// import { ConsumeOption, PaymentOption } from '../global'
// import { DateTime } from "react-datetime";
// import moment from "moment";
// import MenuModel from './MenuModel';

const { v4: uuidv4, v5: uuidv5 } = require('uuid');
const {  PaymentOption } = require('../global');
const MenuModel = require('./MenuModel');


/*
"id": "ITEM_2953",
            "quantity": 1,
            "remark": "",
            "price": 9.50,
            "coupon_code": "",
            "discount_id": "",
            "discount_amount": "",
            "modifiers": [
                {"id": "MOD_1132", "price": 0, "quantity":  1},
                {"id": "MOD_7771", "price": 1.50, "quantity": 1}
            ]
*/

class OrderItemModel  {
    constructor(props) {
        this.id = props.id;
        this.quantity = props.quantity;
        this.remark = "";
        this.price = props.price;
        this.coupon_code = "";
        this.discount_id = "";
        this.discount_amount = props.discount;
        this.modifiers = "";
        this.sku = props.sku;
       
        
        // this.id = props.id;
        // this.menuid = props.menuid;
        // this.quantity = props.quantity;
        // this.price = props.price;
        // this.discount = props.discount;
        // this.img = props.img;
        // this.title = props.title;
        // this.subtitle = props.subtitle;
        // this.remark = props.remark;
        // this.store = props.store;
        // this.storeid = props.storeid;
        // this.orderid = props.orderid;
        // this.modinfo = props.modinfo;
        // this.modgroupinfo = props.modgroupinfo;
        // this.modprice = props.modprice;
        // this.timeslot = props.timeslot;
        // this.deliveryoption = props.deliveryoption;
        // this.orderdatetime = props.orderdatetime;
        // this.orderyear = props.orderyear;
        // this.ordermonth = props.ordermonth;
        // this.orderday = props.orderday;
        // this.orderhour = props.orderhour;
        // this.paymentstatus = props.paymentstatus;
        // this.submenus1 = props.submenus1;
        // this.submenus2 = props.submenus2;
        // this.submenus3 = props.submenus3;
        // this.submenus4 = props.submenus4;
        // this.submenus5 = props.submenus5;
        // this.category = props.category;
        // this.menusku = props.menusku;
        // this.location = props.location;
        // //public img link for perkd
        // this.publicimglink = props.publicimglink;

        // //this one getting from menu model
        // this.recomenus = props?.recomenus ?? "";
    }

    toOdooOrderItem()
    {
        let kId = "id";
        let kQuantity = "quantity";
        let kRemark = "remark";
        let kPrice = "price";
        let kCouponCode = "coupon_code";
        let kDiscounId = "discount_id";
        let kDiscountAmount = "discount_amount";
        let kModifiers = "modifiers";
        let itemMap = new Map(); 

        var itemId = this.id;
        // if((this.sku != "") && (this.sku != undefined))
        // {
        //     itemId = this.sku;
        // }

        itemMap.set(kId, itemId);
        itemMap.set(kQuantity, "" + this.quantity);
        itemMap.set(kRemark, "");
        itemMap.set(kPrice, "" + this.price);
        itemMap.set(kCouponCode , "");
        itemMap.set(kDiscounId , "");
        itemMap.set(kDiscountAmount, "" + this.discount);
        itemMap.set(kModifiers , "");

    }

    
    // lifecycle methods
    componentDidMount() {
        // called after the component is mounted
    }

    componentDidUpdate() {
        // called after the component is updated
    }

    componentWillUnmount() {
        // called before the component is unmounted
    }

    // render method
    // render() {
    //     // return the UI of the component
    //     return (
    //         <div>
    //             <h1>Order Item</h1>
    //             <p>ID: {this.state.id}</p>
    //             <p>Menu ID: {this.state.menuId}</p>
    //             <p>Quantity: {this.state.qty}</p>
    //             <p>Price: {this.state.price}</p>
    //             <p>Discount: {this.state.discount}</p>
    //             <p>Image: {this.state.img}</p>
    //             <p>Title: {this.state.title}</p>
    //             <p>Subtitle: {this.state.subTitle}</p>
    //             <p>Remark: {this.state.remark}</p>
    //             <p>Store: {this.state.store}</p>
    //             <p>Store ID: {this.state.storeId}</p>
    //             <p>Order ID: {this.state.orderId}</p>
    //             <p>Mod Info: {this.state.modInfo}</p>
    //             <p>Mod Price: {this.state.modPrice}</p>
    //             <p>Time Slot: {this.state.timeSlot}</p>
    //             <p>Delivery Option: {this.state.deliveryOption}</p>
    //             <p>Order Date Time: {this.state.orderDateTime}</p>
    //             <p>Order Year: {this.state.orderYear}</p>
    //             <p>Order Month: {this.state.orderMonth}</p>
    //             <p>Order Day: {this.state.orderDay}</p>
    //             <p>Order Hour: {this.state.orderHour}</p>
    //             <p>Payment Status: {this.state.paymentStatus}</p>
    //             <p>Sub Menu 1: {this.state.subMenus1}</p>
    //             <p>Sub Menu 2: {this.state.subMenus2}</p>
    //             <p>Sub Menu 3: {this.state.subMenus3}</p>
    //             <p>Sub Menu 4: {this.state.subMenus4}</p>
    //             <p>Sub Menu 5: {this.state.subMenus5}</p>
    //             <p>Category: {this.state.category}</p>
    //             <p>SKU: {this.state.menusku}</p>
    //             <p>Location: {this.state.location}</p>
    //         </div>
    //     );
    // }
}

/*

                    "title":"Coke",
                    "variantId":"899678900007",
                    "sku":"COLA_COKE01",
                    "unitPrice":3,
                    "inventory":10,
                    "quantity":1,
                    "images":["https://cdn.shopify.com/s/files/1/0726/1008/7230/products/279875_1.jpg"]

*/
function PerkdModelFromOrderItemModel(orderItemModel)
{
    const v4Id = uuidv4();
    return {
        "title": orderItemModel.title,
        "variantId" : "I" + v4Id,
        "sku": orderItemModel.menusku,
        "unitPrice": orderItemModel.price,
        "inventory": orderItemModel.quantity,
        "quantity": orderItemModel.quantity, //TODO - make sure to put in on hand quantity
        "images" : [orderItemModel?.publicimglink ?? ""]
    };
}

function OrderItemFromMenuModel(mModel, qty, orderId, timeSlot, consumeOption) {
    const today = moment().format("YYYY-MM-DD hh:mm:ss");
    const todayYear = moment().format("YYYY");
    const todayMonth = moment().format("MM");
    const todayDay = moment().format("DD");
    const todayHour = moment().format("hh");
    const v4Id = uuidv4();

    console.log("add menu model");
    console.log(menuModel);
    //menu model is raw

    var menuModel = mModel;
    if(!(menuModel instanceof MenuModel))
    {
        menuModel = new MenuModel(mModel);
    }

    return  OrderItemModel = {
        id : "I_" + v4Id,
        menuid : menuModel.get_id(),
        quantity : qty,
        price : menuModel.get_price(),
        discount : menuModel.get_discount(),
        img : menuModel.get_img(),
        title : menuModel.get_title(),
        subtitle : menuModel.get_subtitle(),
        remark : menuModel.get_remark(),
        store : menuModel.get_store(),
        storeid : menuModel.get_storeid(),
        orderid : orderId,
        modinfo : "",
        modprice : "",
        modgroupinfo:"",
        timeslot : timeSlot,
        deliveryoption : consumeOption,
         orderdatetime : today,
         orderyear : todayYear,
         ordermonth :todayMonth,
         orderday: todayDay,
         orderhour : todayHour,
        paymentstatus : PaymentOption.Paid,
        submenus1 : [],
        submenus2 : [],
        submenus3 : [],
        submenus4 : [],
        submenus5 : [],
        category : menuModel.get_category(),
        menusku : menuModel.get_menusku(),
        location : menuModel.get_racklocation(),
        publicimglink: menuModel?.get_publicimglink() ?? "",

        recomenus : menuModel?.get_recomenus() ?? "",
    }
}


module.exports = OrderItemModel; // Export the default value
module.exports.OrderItemFromMenuModel = OrderItemFromMenuModel; // Export the named class
module.exports.PerkdModelFromOrderItemModel = PerkdModelFromOrderItemModel; // Export the named class

// export default OrderItemModel;
// export { OrderItemFromMenuModel, PerkdModelFromOrderItemModel };
