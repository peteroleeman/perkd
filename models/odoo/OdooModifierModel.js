import React, { Component } from 'react';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { DateTime } from "react-datetime";
import moment from "moment";
import ModifierModel from '../ModifierModel';

class OdooModifierModel
{
    constructor(props){
       
        console.log("odoo modifier");
        console.log(props);
       
        var modifierModel = props;
        if(modifierModel instanceof ModifierModel)
        {
            modifierModel = new ModifierModel(props);
        }
         
        this.id = modifierModel.id;
        this.quantity = "1";
        this.price = modifierModel.price;
    }
}

export default OdooModifierModel;