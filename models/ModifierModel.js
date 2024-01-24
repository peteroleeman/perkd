import React, { Component } from 'react';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { gIsOdoo } from '../global';
import OutlineBall from "../images/ball_outline.png"

class ModifierModel extends Component {
  constructor(props) {
    super(props);

     if(gIsOdoo == true)
     {
      this.id = props.id;
      this.modifierImg = "";
      this.title = props.title;
      this.price = parseFloat("" + props.price);
      this.index = -1;
      this.isavailable = (props.availableStatus == "AVAILABLE") ? true : false;
     }
     else
     {
      this.id = props.id;
      this.modifierImg = props.modifierimg;
      this.title = props.title;
      this.price = props.price;
      this.index = -1;
      this.isavailable = true;
     }
  }

  get_id()
  {
    return this.id ?? "";
  }

  get_isavailable()
  {
    return this.isavailable ?? true;
  }

  get_modifierimg()
  {
    if((this.modifierImg ?? "") != "" )
    {
    return this.modifierImg ?? "";
    }
    return OutlineBall;
  }

  get_title()
  {
    return this.title ?? "";
  }

  get_price()
  {
    return this.price ?? 0.0;
  }

  get_index()
  {
    return this.index ?? 0;
  }

}

function createNewModifier(modifierModel)
{
  const v4Id = uuidv4();
  return ModifierModel = {
    id: "O_" + v4Id,
    modifierImg : modifierModel.modifierImg,
    title: modifierModel.title,
    price: modifierModel.price,
    index: modifierModel.index
  }
}



export default ModifierModel;
export {createNewModifier};
