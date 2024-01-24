import React, { Component } from 'react';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { DateTime } from "react-datetime";
import moment from "moment";
import OrderItemModel from '../OrderItemModel';
import ModifierModel from '../ModifierModel';
import OdooModifierModel from './OdooModifierModel';

class OdooOrderItemModel
{
    constructor(props) {
       
       
        var itemModel = props;
        if(!(itemModel instanceof OrderItemModel))
        {
            itemModel = new OrderItemModel(props);
        }
        
        
        this.id = itemModel.id;
        this.quantity = ""  + itemModel.quantity;
        this.remark = "";
        this.price =  this.getTotalPrice(itemModel?.modifiers ?? []);
        this.coupon_code = "";
        this.discount_id = "";
        this.discount_amount = "" + itemModel.discount;
        this.modifiers = itemModel.modifiers;

        this.setModifiers(itemModel?.modifiers ?? []);

    }

    /*
    return float value of total price
    */
    getTotalPrice(itemModifiers)
    {
        var totalPrice = parseFloat("" + this.price);
        for(let mod of itemModifiers)
        {
            var modifierModel = mod;
            if(!(modifierModel instanceof ModifierModel))
            {
                modifierModel = new ModifierModel(mod);
            }

            //convert the prce to float
            let modPrice = parseFloat("" + modifierModel.get_price());
            totalPrice = totalPrice + modPrice; //add modprice to totalprice
        }

        return totalPrice;
    }

    /*
    assign itemModel modifier to this.modifiers
    */
    setModifiers(itemModifiers)
    {
        this.modifiers = [];
        for(let mod of itemModifiers)
        {
            var modifierModel = mod;
            if(!(modifierModel instanceof ModifierModel))
            {
                modifierModel = new ModifierModel(mod);
            }

            let oModel = new OdooModifierModel(modifierModel);
            this.modifiers.push(oModel);
        }
    }
}

export default OdooOrderItemModel;