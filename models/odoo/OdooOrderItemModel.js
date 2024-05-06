const OrderItemModel = require('../OrderItemModel');
const ModifierModel = require('../ModifierModel');
const OdooModifierModel = require('./OdooModifierModel');

class OdooOrderItemModel {
    constructor(props) {
        // Initialize the OdooOrderItemModel with props
        //console.log("OdooOrderItemModel props");
        //console.log(props);
        // If props is not an instance of OrderItemModel, create a new instance
        let itemModel = props instanceof OrderItemModel ? props : new OrderItemModel(props);

        // Assign properties
        var itemId = itemModel.id;
        // if((itemModel.sku != "") && (itemModel.sku != undefined))
        // {
        //     itemId = itemModel.sku;
        // }

        this.id = itemId;
        this.quantity = itemModel.quantity;
        this.remark = ""; // You may want to set this based on your requirement
        this.price =  props.price; //this.getTotalPrice(itemModel.modifiers);
        this.coupon_code = "";
        this.discount_id = "";
        this.discount_amount = itemModel.discount;

        // var modList = [];
        // for(var mod in itemModel.modifiers)
        // {
        //     var modId = mod.id;
        //     if((mod.sku != "") && (mod.sku != undefined))
        //     {
        //         modId = mod.sku;
        //     }

        //     mod.id = modId;
        //     modList.push(mod);
        // }

        // itemModel.modifiers = modList;
        this.modifiers = this.setModifiers(itemModel.modifiers);
    }

    /*
    Return the total price including modifiers
    */
    getTotalPrice(itemModifiers) {
        let totalPrice = parseFloat(this.price);

        for (let mod of itemModifiers) {
            let modifierModel = mod instanceof ModifierModel ? mod : new ModifierModel(mod);

            // Add modifier price to total price
            let modPrice = parseFloat(modifierModel.get_price());
            totalPrice += modPrice;
        }

        return totalPrice;
    }

    /*
    Assign modifiers to this.modifiers
    */
    setModifiers(itemModifiers) {
        let modifiers = [];

        for (let mod of itemModifiers) {
            let modifierModel = mod instanceof ModifierModel ? mod : new ModifierModel(mod);
            let oModel = new OdooModifierModel(modifierModel);
            modifiers.push(oModel);
        }

        return modifiers;
    }
}

module.exports = OdooOrderItemModel;
