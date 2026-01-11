import React, { Component } from 'react';

//myinvois api environment
const kStoreModelMyInvoisApiEnv = "myinvoisapienv";

//sql account integration
const kStoreModelIntegrateSqlAccount = "integratesqlaccount";

class StoreModel extends Component {
    
    constructor(props) {
        super(props);
        this.id = props.id;
        this.logo = props.logo;
        this.title = props.title;
        this.storeCounter = data.storecounter || 0;
        this.currency = props.currency;
        this.img = props.img;
        this.initial = props.initial;
        this.feies = props.feies;

        this.taxtype = props.taxtype;
        this.servicecharge = props.servicecharge;
        this.tax = props.tax;
        this.istaxenabled = props.istaxenabled;
        this.isservicechargeenabled = props.isservicechargeenabled;
        this.shopifydomain = props.shopifydomain;
        this.shopifytoken = props.shopifytoken;
        this.soldoutimg = props.soldoutimg;

        //myinvois api environment ('production' or 'preprod')
        this.myInvoisApiEnv = props.myinvoisapienv || "preprod";
        
        //sql account integration (true = enabled, false = disabled)
        this.integrateSqlAccount = props.integratesqlaccount || false;
    }

    

}

export default StoreModel;
