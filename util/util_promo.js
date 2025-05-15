
class PromoWorkingHour {
  constructor(periods) {
    this.periods = periods;
  }

  toFirestore() {
    return {
      periods: this.periods,
    };
  }
}

class PromoConditions {
  constructor(condition) {
    this.start_time = condition?.start_time ?? "";
    this.workingHour = condition?.workingHour ?? "";
    this.end_time = condition?.end_time ?? "";
  }

  toFirestore() {
    return {
      start_time: this.start_time,
      workingHour: this.workingHour,
      end_time : this.end_time
    };
  }
  
}

class PromoList
{
  constructor(promos)
  {
    this.promos = promos.map(promo => new PromoMain(promo) );
  }

  toFirestore() {
    return {
      promos: this.promos.map(promo => promo.toFirestore())
    };
  }
}

class PromoMain {
    constructor(promo) {
      
      this.discount_id  = promo?.discount_id ?? ""; 
      this.suspend = promo?.suspend ?? "";
      this.name = promo?.name ?? "";
      this.description = promo?.description ?? "";
      this.type = promo?.type ?? "";
      this.value = promo?.value ?? "";
      this.discount = new PromoDiscount (promo?.discount ?? "");//promo.scope.map(scopeItem => new PromoScope(scopeItem) );
      this.conditions = new PromoConditions(promo?.conditions ?? "");
      this.store_merchant_code = promo?.store_merchant_code ?? [];
    }


    toFirestore() {
      return {
        discount_id : this.discount_id,
        suspend : this.suspend,
        name: this.name,
        description : this.description,
        type : this.type,
        value : this.value,
        discount: this.discount.toFirestore(),
        conditions : this.conditions.toFirestore(),
        store_merchant_code : this.store_merchant_code,
      };
    }
  
  }

  class PromoDiscount
  {
     constructor (discount)
     {

      this.type = discount?.type ?? "";
      if (this.type === "bundle") {
          this.bundle = new PromoBundle(discount?.bundle ?? {});
      } else {
       this.scope = new PromoScope(discount?.scope ?? "");
       this.min_basket_amount = discount?.min_basket_amount ?? 0;
       this.min_quantity = discount?.min_quantity  ?? 0;
       this.value = discount?.value ?? 0;
      }
     }

    //  toFirestore(){

    //   return {
    //     scope : this.scope.toFirestore(),
    //     type : this.type,
    //     min_basket_amount : this.min_basket_amount,
    //     min_quantity : this.min_quantity,
    //     value : this.value
    //   }
    //  }

     toFirestore() {
      const result = { type: this.type };
      if (this.type === "bundle") {
          result.bundle = this.bundle.toFirestore();
      } else {
          result.scope = this.scope.toFirestore();
          result.value = this.value;
          result.min_basket_amount = this.min_basket_amount;
          result.min_quantity = this.min_quantity;

      }
      return result;
  }
  }

  class PromoScope
  {
    constructor(scope)
    {
      this.min_quantity = scope?.min_quantity ?? "",
       this.type = scope?.type ?? "",
        this.item_ids = scope?.item_ids ?? []
    }

    toFirestore()
    {
      return {
        min_quantity : this.min_quantity,
        type : this.type,
        item_ids : this.item_ids
      }
    }
  }

  class PromoBundle {
    constructor(bundle) {
        this.bundle_items = bundle?.bundle_items ?? [];
        this.bundle_quantity = bundle?.bundle_quantity ?? 0;
        this.discount_items = bundle?.discount_items ?? [];
        this.discount_quantity = bundle?.discount_quantity ?? 0;
        this.type = bundle?.type ?? "";
        this.value = bundle?.value ?? 0;
    }

    toFirestore() {
        return {
            bundle_items: this.bundle_items,
            bundle_quantity: this.bundle_quantity,
            discount_items: this.discount_items,
            discount_quantity: this.discount_quantity,
            type: this.type,
            value: this.value
        };
    }
}


  module.exports = { PromoScope, PromoMain, PromoList };
