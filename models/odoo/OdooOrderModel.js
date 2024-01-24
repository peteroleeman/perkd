
import React, { Component } from 'react';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { DateTime } from "react-datetime";
import moment from "moment";
import OrderModel from '../OrderModel';
import OdooOrderItemModel from './OdooOrderItemModel';
import OrderItemModel from '../OrderItemModel';


class OdooOrderModel
{

    constructor(props){
       

        var orderModel = props;
        if(!(orderModel instanceof OrderModel))
        {
            orderModel = new OrderModel(props);
        }

        this.id = orderModel.id;
        this.remark = "";
        this.bill_discount_amount = "";
        this.order_id = orderModel.orderid;
        this.items = "";
        this.customer_payment =  "" + orderModel.totalpaid;
        this.bill_discount_id = "";
        this.grand_total = "" + orderModel.totalprice;
        this.mode = "dine_in";
        this.gateway_payment = "";
        this.vdiscount_total = "";
        this.store_merchant_code = "MDV1";
        this.short_order_number = orderModel.orderid;
        this.member_code = "";
        this.subtotal = "" + orderModel.subtotal;
        this.payment_reference = "";
        this.order_datetime = orderModel.orderdatetime;
        this.payment_type = "Credit Card";

        let itemList = [];
        for(let item of orderModel.orderitems)
        {
            let itemModel = item;
            if(!(itemModel instanceof OrderItemModel))
            {
                itemModel = new OrderItemModel(item);
            }

            let odooItemModel = new OdooOrderItemModel(itemModel);
           
            itemList.push(odooItemModel);
        }

        this.items =  itemList;//JSON.parse( JSON.stringify(itemList));


        //create print data meant for feie
                this.printData = {
                    orderId: this.id,
                    mobileAssignedTable: this.mode === "dine_in" ? this.short_order_number : "",
                    name: "", // You may need to fill this information based on your business logic
                    userPhoneNumber: "", // You may need to fill this information based on your business logic
                    storeTitle: "",
                    orderDateTime: this.order_datetime,
                    totalPrice: this.customer_payment,
                    orderItems: []
                };

                for (let odooItemModel of this.items) {
                    this.printData.orderItems.push({
                        title: odooItemModel.title,
                        qty: odooItemModel.quantity,
                        modInfo: odooItemModel.modInfo,
                        setMenu1: odooItemModel.setMenu1,
                        setMenu2: odooItemModel.setMenu2
                    });
                }
    }

     // Method to get the JSON structure output for the print function
        toJSONForFeiePrint() {
            return {
                orderId: this.printData.orderId,
                mobileAssignedTable: this.printData.mobileAssignedTable,
                name: this.printData.name,
                storeTitle : this.printData.storeTitle,
                orderDateTime : this.printData.orderDateTime,
                totalPrice : this.printData.totalPrice,
                userPhoneNumber: this.printData.userPhoneNumber,
                orderItems: [...this.printData.orderItems]
            };
        }
}

export default OdooOrderModel;