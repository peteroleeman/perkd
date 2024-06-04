
const OrderModel = require('../OrderModel');
const OdooOrderItemModel = require('./OdooOrderItemModel');
const OrderItemModel = require('../OrderItemModel');

class OdooOrderModel {
    constructor(props) {
        // Initialize the OdooOrderModel with props

        // If props is not an instance of OrderModel, create a new instance
        let orderModel = props instanceof OrderModel ? props : new OrderModel(props);

        // Assign properties
        this.id = orderModel.id;
        this.remark = "";
        this.bill_discount_amount = "";
        this.order_id = orderModel.orderid;
        this.items = "";
        this.customer_payment = orderModel.totalpaid.toString();
        this.bill_discount_id = "";
        this.grand_total = orderModel.totalprice.toString();
        this.mode = "dine_in";
        this.gateway_payment = "";
        this.vdiscount_total = "";
        this.store_merchant_code = "MDV1";
        this.short_order_number = orderModel.orderid;
        this.member_code = "";
        this.subtotal = orderModel.subtotal.toString();
        this.payment_reference = "";
        this.order_datetime = orderModel.orderdatetime;
        this.payment_type = "Credit Card";

        // Process order items
        let itemList = [];
        for (let item of orderModel.orderitems) {
            let itemModel = item instanceof OrderItemModel ? item : new OrderItemModel(item);
            var odooItemModel = new OdooOrderItemModel(itemModel);

            console.log("getDiscountid with " + odooItemModel.id);
            const discountId = getDiscountId(odooItemModel.id);
            console.log("getDiscountid with result is " + discountId);
            if(discountId)
                {
                    odooItemModel.discount_id = discountId;
                    console.log("done assign getDiscountid with result is " + discountId);
                }

            itemList.push(odooItemModel);

            
        }
        this.items = itemList;

        // Create print data for feie
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

        // Fill print data with order items
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


    //Method to check for discount id for limited time
    getDiscountId(itemId) {

        const discounts = [
          {
            discountId: "RP1683",
            applicableItems: [
              "ITEM_9246",
              "ITEM_9247",
              "ITEM_9243",
              "ITEM_9244",
              "ITEM_9022"
            ]
          },
          {
            discountId: "RP1684",
            applicableItems: [
              "ITEM_9650",
              "ITEM_9414"
            ]
          }
        ];
  
        for (const discount of discounts) {
          if (discount.applicableItems.includes(itemId)) {
            return discount.discountId;
          }
        }
        return null; // Return null if the item is not part of any discount list
      }
  

    // Method to get the JSON structure output for the print function
    toJSONForFeiePrint() {
        return {
            orderId: this.printData.orderId,
            mobileAssignedTable: this.printData.mobileAssignedTable,
            name: this.printData.name,
            storeTitle: this.printData.storeTitle,
            orderDateTime: this.printData.orderDateTime,
            totalPrice: this.printData.totalPrice,
            userPhoneNumber: this.printData.userPhoneNumber,
            orderItems: [...this.printData.orderItems]
        };
    }
}

module.exports = OdooOrderModel;
