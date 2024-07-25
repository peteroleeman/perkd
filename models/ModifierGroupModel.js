import React, { Component } from 'react';
import { gIsOdoo } from '../global';
import OutlineBall from "../images/ball_outline.png"

class ModifierGroupModel extends Component {
  constructor(props) {
    super(props);
    
     if(gIsOdoo == true)
     {
      this.id = props.id; //this going to be overwrite in modifier box full popup,
      this.modifiers = props.modifiers;
      this.groupimg = "";
      this.title = props.name;
      this.modifier = props.modifier;
      this.modifiercount = props.selectionRangeMax;//there is also a props.selectionRangeMin
      this.modifiermincount = props.selectionRangeMin;
      this.modifieremptyimg = "";
      this.price = 0.0;
     }
     else
     {
      this.id = props.id; //this going to be overwrite in modifier box full popup,
      this.modifiers = props.modifiers;
      this.groupimg = props.groupimg;
      this.title = props.title;
      this.modifier = props.modifier;
      this.modifiercount = props.modifiercount;//props.modifiers.length; //previously hardcoded to 3
      this.modifiermincount = 0;
      this.modifieremptyimg = props.modifieremptyimg;
      this.price = props.price;
     }
  }


  

  get_id()
  {
    return this.id ?? "";
  }

  get_modifiers()
  {
    return this.modifiers ?? [];
  }

  get_groupimg()
  {
    if((this.groupimg ?? "") != "" )
    {
    return this.groupimg ?? "";
    }
    return OutlineBall;
  }

  get_title()
  {
    return this.title  ?? "";
  }

  get_modifier()
  {
    return this.modifier ?? "";
  }

  get_modifiercount()
  {
    return this.modifiercount ?? 3;
  }

  get_modifiermincount()
  {
    return this.modifiermincount ?? 0;
  }

  get_modifieremptyimg()
  {
    //return this.modifieremptyimg ?? "";

    if((this.modifieremptyimg ?? "") != "" )
    {
    return this.modifieremptyimg ?? "";
    }
    return OutlineBall;
  }

  get_price()
  {
    return this.price ?? 0.0;
  }

}


function createNewModifierGroupFromOdoo( modifierGroupModel)
{
    const v4Id = uuidv4();
    return ({
      id : "MG_" + v4Id, //this going to be overwrite in modifier box full popup,
      modifiers : [],
      groupimg : "",
      title : modifierGroupModel?.name ?? "",
      modifier : modifierGroupModel?.modifier ?? "",
      modifiercount : modifierGroupModel?.modifiercount ?? 1,//there is also a props.selectionRangeMin
      modifiermincount : modifierGroupModel?.modifiermincount ?? 0,
      modifieremptyimg : "",
      price : modifierGroupModel?.price ?? 0.0,
    }
    )

    
}

export default ModifierGroupModel;
module.exports.createNewModifierGroupFromOdoo = createNewModifierGroupFromOdoo; 