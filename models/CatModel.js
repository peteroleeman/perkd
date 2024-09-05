

class CatModel {
    constructor(props, isOdoo = false){
        

        if(isOdoo == true)
            {
                this.id = props.categoryId;
                this.menuimg = "";
                this.bgimg = "";
                this.title = props.categoryName;
                this.subtitle = "";
                this.iconname = "";
                this.items = props.items
            }
            else
            {
                this.id = props?.id ?? "";
                this.menuimg = props?.menuimg ?? "";
                this.bgimg = props?.bgimg ?? "";
                this.title = props?.title ?? "";
                this.subtitle = props?.subtitle ?? "";
                this.iconname = props?.iconname ?? "";
                this.items = [];
            }
    }

    
}

module.exports = CatModel;