
const { v4: uuidv4, v5: uuidv5 } = require('uuid');
const { gIsOdoo } = require('../global');

class ModifierModel {
  constructor(props) {
    if (gIsOdoo == true) {
      this.id = props.id;
      this.modifierImg = "";
      this.title = props.title;
      this.price = parseFloat("" + props.price);
      this.index = -1;
      this.isavailable = (props.availableStatus == "AVAILABLE") ? true : false;
    } else {
      this.id = props.id;
      this.modifierImg = props.modifierimg;
      this.title = props.title;
      this.price = props.price;
      this.index = -1;
      this.isavailable = true;
    }
  }

  get_id() {
    return this.id ?? "";
  }

  get_isavailable() {
    return this.isavailable ?? true;
  }

  get_modifierimg() {
    if ((this.modifierImg ?? "") != "") {
      return this.modifierImg ?? "";
    }
    return OutlineBall;
  }

  get_title() {
    return this.title ?? "";
  }

  get_price() {
    return this.price ?? 0.0;
  }

  get_index() {
    return this.index ?? 0;
  }
}

function createNewModifier(modifierModel) {
  const v4Id = uuidv4();
  return {
    id: "O_" + v4Id,
    modifierImg: modifierModel.modifierImg,
    title: modifierModel.title,
    price: modifierModel.price,
    index: modifierModel.index
  };
}

module.exports = ModifierModel;
module.exports.createNewModifier = createNewModifier;
