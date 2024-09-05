
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
      this.description = promo?.desc ?? "";
      this.type = promo?.type ?? "";
      this.value = promo?.value ?? "";
      this.discount = new PromoDiscount (promo?.discount ?? "");//promo.scope.map(scopeItem => new PromoScope(scopeItem) );
      this.conditions = new PromoConditions(promo?.conditions ?? "");
    
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
      };
    }
  
  }

  class PromoDiscount
  {
     constructor (discount)
     {
       this.scope = new PromoScope(discount?.scope ?? "");
       this.type = discount?.type ?? "";
       this.min_basket_amount = discount?.min_basket_amount ?? 0;
       this.min_quantity = discount?.min_quantity  ?? 0;
       this.value = discount?.value ?? 0;
     }

     toFirestore(){

      return {
        scope : this.scope.toFirestore(),
        type : this.type,
        min_basket_amount : this.min_basket_amount,
        min_quantity : this.min_quantity,
        value : this.value
      }
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

  module.exports = { PromoScope, PromoMain, PromoList };
