import React, { Component } from 'react';

class StoreModel extends Component {
    
    constructor(props) {
        super(props);
        this.id = props.id;
        this.logo = props.logo;
        this.title = props.title;
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
    }

}

export default StoreModel;
