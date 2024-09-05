const { addDebugLog } = require("./util_log");
const { adjustFloat } = require("./util_order_cal");


const SCOPE_TYPE_ORDER = "order";
const SCOPE_TYPE_ITEMS = "items";

const DISCOUNT_TYPE_PERCENTAGE = "percentage";
const DISCOUNT_TYPE_NET = "net";

let Promo_VerticalPromo = [
    { sku: "ITEM_96592", price: 16.00, qty: 5, name: "Merdeka Tart", discount_id: "VP1" },
    { sku: "ITEM_91822", price: 4.00, qty: 2, name: "31st Day", discount_id: "VP2" },
]


let Promo_BundleDisount = [
    // { sku: "ITEM_9659", discount: 1.00, discount_type: "net", qty: 2, name: "Bundle Discount" , discount_id : "BD1" },
    // { sku: "ITEM_9182", discount: 10, discount_type: "percentage", qty: 2, name: "Bundle Discount", discount_id :"BD2" },
];
let Promo_BillDiscount = [
    // {discount: 1.00, discount_type: "net", name: "satu ringgit", discount_id: "RM1"}
];

class PromoManager {
    constructor(promoList) {
        this.promo_list = promoList;
        this.promo_effective = new Map(); // Changed to Map
        this.promo_on = [];
        this.promo_map = new Map(); // Changed to Map
    }

    //bundle discount
 getDiscountPrice(skuId, price, discountDetail) {
    const priceVal = parseFloat(String(price));
    let discountVal = priceVal;
    const discountDetailText = String(discountDetail);

   
        if (skuId === "") {
            return priceVal;
        }

        const promo = getMenuOfItemDiscount(skuId, priceVal);

        if (promo === "") {
            return priceVal;
        }
        return promo.price;
    
}

 getPriceOfVerticalPromo(menuSKU) {
     for (let i = 0; i < Promo_VerticalPromo.length; i++) {
         if (Promo_VerticalPromo[i].sku == menuSKU) {
             return Promo_VerticalPromo[i].price;
        }
    }
    return -999;
}

 isDisplayDiscountPrice(discountDetail, qty) {
    if ((discountDetail || "") == "") {
        return false;
    }

    if (checkIsVerticalPromoWithDisountDetail(discountDetail || "") == true) {
        return true;
    }

    if (checkIsBundleDiscountWithDisountDetail(discountDetail || "") == true) {
        return true;
    }

    return true;
}

 isMenuDisplayDiscountPrice(discountDetail, qty) {
    if ((discountDetail || "") === "") {
        return false;
    }

    if (checkIsVerticalPromoWithDisountDetail(discountDetail || "") == true) {
        return false;
    }

    if (checkIsBundleDiscountWithDisountDetail(discountDetail || "") == true) {
        return false;
    }

    return true;
}

 checkIsBillDiscount() {
     if (Promo_BundleDisount.length > 0) {
        return true;
    }

    return false;
}

 getBillLevelDiscount() {
     return Promo_BundleDisount[0];
}

 checkIsVerticalPromoWithDisountDetail(discountDetail) {
     for (let i = 0; i < Promo_VerticalPromo.length; i++) {
         if (Promo_VerticalPromo[i].discount_id == discountDetail) {
            return true;
        }
    }

    return false;
}

 getVerticalPromoNameWithSKU(menuSKU) {
     for (let i = 0; i < Promo_VerticalPromo.length; i++) {
         if (Promo_VerticalPromo[i].sku == menuSKU) {
             return Promo_VerticalPromo[i].name;
        }
    }
    return "";
}

 getVerticalPromoIdWithSKU(menuSKU) {
     for (let i = 0; i < Promo_VerticalPromo.length; i++) {
         if (Promo_VerticalPromo[i].sku == menuSKU) {
             return Promo_VerticalPromo[i].discount_id;
        }
    }
    return "";
}

 getVerticalPromoDescriptionWithDiscountId(discountId) {
     for (let i = 0; i < Promo_VerticalPromo.length; i++) {
         if (Promo_VerticalPromo[i].discount_id == discountId) {
             return Promo_VerticalPromo[i].name;
        }
    }
    return "";
}

 checkIsBundleDiscountWithDisountDetail(discountDetail) {
     for (let i = 0; i < Promo_BundleDisount.length; i++) {
         if (Promo_BundleDisount[i].discount_id == discountDetail) {
            return true;
        }
    }

    return false;
}

 checkIsBundleDiscountWithSKU(sku) {
     for (let i = 0; i < Promo_BundleDisount.length; i++) {
         if (Promo_BundleDisount[i].sku == sku) {
            return true;
        }
    }

    return false;
}

 getBundleDiscountNameWithSKU(menuSKU) {
     for (let i = 0; i < Promo_BundleDisount.length; i++) {
         if (Promo_BundleDisount[i].sku == menuSKU) {
             return Promo_BundleDisount[i].name;
        }
    }
    return "";
}

 getBundleDiscountIdWithSKU(menuSKU) {
    let result = "";
     for (let i = 0; i < Promo_BundleDisount.length; i++) {
         if (Promo_BundleDisount[i].sku == menuSKU) {
             result = Promo_BundleDisount[i].discount_id;
            break;
        }
    }
    return result;
}

 getBundleDiscountDescriptionWithDiscountId(discountId) {
     for (let i = 0; i < Promo_BundleDisount.length; i++) {
         if (Promo_BundleDisount[i].discount_id == discountId) {
             return Promo_BundleDisount[i].name;
        }
    }
    return "";
}


isMenuOfBundleDiscount(menuSKU) {
    for (let i = 0; i < Promo_BundleDisount.length; i++) {
        if (Promo_BundleDisount[i].sku === menuSKU) {
            return Promo_BundleDisount[i].discount;
        }
    }
    return -999;
}

 getDiscountDetail(discountDetail) {
    addDebugLog(discountDetail);

    if (checkIsVerticalPromoWithDisountDetail(discountDetail || "") == true) {
        return getVerticalPromoDescriptionWithDiscountId(discountDetail || "");
    }

    if (checkIsBundleDiscountWithDisountDetail(discountDetail || "") == true) {
        return getBundleDiscountDescriptionWithDiscountId(discountDetail || "");
    }

   
        return getDiscountDescription(discountDetail || "");
    

    
}



    //menu disco
    isMenuOfItemDiscount(id) {
        const stringId = String(id);
        return this.promo_effective.has(stringId);
    }

    getMenuOfItemDiscount(id, menuprice) {
        const stringId = String(id);

        

        if (this.promo_effective.has(stringId)) {
            const promo = this.promo_effective.get(stringId)[0];
            const { name, type, value, discount_id, scope_min_quantity } = promo;

            if (scope_min_quantity > 1) {
                return "";
            }

            let adjustedValue;
            if (type === DISCOUNT_TYPE_NET) {
                adjustedValue = (parseFloat(menuprice) || 0.0) - parseFloat(value);
            } else if (type === DISCOUNT_TYPE_PERCENTAGE) {
                adjustedValue = (parseFloat(menuprice) || 0.0) * (1 - (parseFloat(value) / 100));
            } else {
                adjustedValue = parseFloat(menuprice) || 0.0;
            }

            return { id: discount_id, name, price: adjustFloat(adjustedValue) };
        } else {
            return "";
        }
    }

    getDiscountDescription(discountId) {
        return this.promo_map.get(discountId) || "";
    }

    getDiscountImagePath(discountId) {
        return `/images/promo/${discountId}.jpg`;
    }

    isMenuOfVerticalPromo(menuSKU) {
        const promo = Promo_VerticalPromo.find(p => p.sku === menuSKU);
        return promo ? promo.price : -999;
    }

    setPromoList(newPromoList) {
        if (Array.isArray(newPromoList)) {
            this.promo_list = newPromoList;
        }
    }

    getPromoList() {
        return this.promo_list;
    }

    getEffectivePromoList() {
        return this.promo_effective;
    }

    getEffectiveFullInfoList() {
        return this.promo_on;
    }

    getEffectivePromoListBySKU(sku) {
        return this.promo_effective.get(sku) || [];
    }

    effectivePromotions(promotions) {
        return promotions.filter(promotion => {
            const currentDateTime = new Date();
            const currentDay = currentDateTime.getDate().toString();
            const currentHour = currentDateTime.getHours();
            const currentMinute = currentDateTime.getMinutes();

            const startDateTime = new Date(promotion.conditions.start_time);
            const currentDateTimeUTC = currentDateTime.toISOString();
            const isSuspend = promotion?.suspend ?? true;
            let endDateTime = new Date(promotion.conditions.end_time);
            if (promotion.conditions?.end_time === "") {
                addDebugLog("end time is empty, set to tomorrow");
                const today = new Date();
                const tomorrow = new Date(today);
                tomorrow.setDate(today.getDate() + 1);
                endDateTime = tomorrow;
                addDebugLog(endDateTime);
            }

            addDebugLog("effective promotions:");
            addDebugLog(endDateTime);

            if (!isSuspend && (currentDateTimeUTC >= startDateTime.toISOString()) && (currentDateTimeUTC <= endDateTime.toISOString())) {
                if ((promotion?.conditions?.workingHour?.days?.length ?? 0) > 0) {
                    const workingDay = promotion.conditions.workingHour.days.find(day => day.day === currentDay);

                    if (workingDay) {
                        const workingPeriod = workingDay.periods.find(period => {
                            const [periodStartHour, periodStartMinute] = period.start_time.split(':').map(Number);
                            const [periodEndHour, periodEndMinute] = period.end_time.split(':').map(Number);

                            return (
                                (currentHour > periodStartHour || (currentHour === periodStartHour && currentMinute >= periodStartMinute)) &&
                                (currentHour < periodEndHour || (currentHour === periodEndHour && currentMinute <= periodEndMinute))
                            );
                        });

                        return workingPeriod !== undefined;
                    }
                } else if (Object.keys(promotion?.conditions?.workingHour?.hours ?? {}).length > 0) {
                    const currentDayOfWeek = currentDateTime.getDay();
                    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                    const currentDayName = days[currentDayOfWeek];

                    const workingPeriod = promotion.conditions.workingHour.hours[currentDayName].periods.find(period => {
                        const [periodStartHour, periodStartMinute] = period.start_time.split(':').map(Number);
                        const [periodEndHour, periodEndMinute] = period.end_time.split(':').map(Number);

                        return (
                            (currentHour > periodStartHour || (currentHour === periodStartHour && currentMinute >= periodStartMinute)) &&
                            (currentHour < periodEndHour || (currentHour === periodEndHour && currentMinute <= periodEndMinute))
                        );
                    });

                    return workingPeriod !== undefined;
                } else {
                    return true;
                }
            }

            return false;
        });
    }

    generatePromotion() {
        const idMap = new Map();
        const nameMap = new Map();

        Promo_BundleDisount = [];
        Promo_BillDiscount = [];

        addDebugLog("generatePromotion");
        var promoList = this.effectivePromotionsWithItemIds(this.promo_list);
        addDebugLog(promoList);
        this.promo_on = promoList;
        promoList.forEach(promotion => {
            const { discount_id, name, discount } = promotion;
            const { type, value, scope } = discount;


            addDebugLog("adding to name map " + discount_id + " " + name);

            nameMap.set(discount_id, name);

            if (scope.item_ids && scope.item_ids.length > 0) {
                const promoInfo = {
                    discount_id,
                    name,
                    type,
                    value,
                    scope_type: scope.type,
                    scope_min_quantity: scope.min_quantity
                };

                scope.item_ids.forEach(id => {
                    if (idMap.has(id)) {
                        idMap.get(id).push(promoInfo);
                    } else {
                        idMap.set(id, [promoInfo]);
                    }

                    //add to vertical promo list
                    if (scope.min_quantity > 1) {

                      
                        if (!Promo_BundleDisount.some(item => item.sku == id)) {
                            Promo_BundleDisount.push(
                                {
                                    sku: id,
                                    discount: value,
                                    discount_type: type,
                                    qty: scope.min_quantity,
                                    name: name,
                                    discount_id: discount_id
                                }
                            );
                        }
                    }

                });


            }
            else {

                const promoInfo = {
                    name,
                    type,
                    value,
                    scope_type: scope.type,
                    scope_min_quantity: scope.min_quantity
                };

                if (promoInfo.scope_type == SCOPE_TYPE_ORDER) {
                    var id = "ALL";
                    if (idMap.has(id)) {
                        idMap.get(id).push(promoInfo);
                    } else {
                        idMap.set(id, [promoInfo]);
                    }

                    //{ discount: 1.00, discount_type: "net", name: "satu ringgit", discount_id: "RM1" }
                    // gBillDiscount.push({
                    //     discount: value,
                    //     discount_type: type,
                    //     name : name,
                    //     discount_id : discount_id
                    // })

                    if (!Promo_BillDiscount.some(item => item.discount_id == discount_id)) {
                        Promo_BillDiscount.push({
                            discount: value,
                            discount_type: type,
                            name: name,
                            discount_id: discount_id
                        });
                    }
                }


            }
        });

        this.promo_effective = idMap;
        this.promo_map = nameMap;

        // addDebugLog("promo effective");
        // addDebugLog(this.promo_effective);
        // addDebugLog("promo_map");
        // addDebugLog(this.promo_map);
        // addDebugLog("promo on");
        // addDebugLog(this.promo_on);


        addDebugLog("this is bundle discount")
        //addDebugLog(Promo_BundleDisount);
    }

    effectivePromotionsWithItemIds(promotions) {
        return this.effectivePromotions(promotions);
    }

    getPromotionDetails(id) {
        return this.promo_effective.get(id) || null;
    }
}

module.exports = {
    PromoManager,
    SCOPE_TYPE_ORDER,
    SCOPE_TYPE_ITEMS,
    DISCOUNT_TYPE_PERCENTAGE,
    DISCOUNT_TYPE_NET
};