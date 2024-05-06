const ModifierModel = require('../ModifierModel');

class OdooModifierModel {
    constructor(props) {
        console.log("odoo modifier");
        console.log(props);

        let modifierModel = props;
        if (modifierModel instanceof ModifierModel) {
            modifierModel = new ModifierModel(props);
        }

        this.id = modifierModel.id;
        this.quantity = "1";
        this.price = modifierModel.price;
    }
}

module.exports = OdooModifierModel;
