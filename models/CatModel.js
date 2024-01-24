import React, { Component } from 'react';
import { gIsOdoo } from '../global';

class CatModel extends Component{
    constructor(props){
        super(props);

        if(gIsOdoo == true)
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
            this.id = props.id;
            this.menuimg = props.menuimg;
            this.bgimg = props.bgimg;
            this.title = props.title;
            this.subtitle = props.subtitle;
            this.iconname = props.iconname;
            this.items = [];
        }
    }

    get_id()
    {
        return this.id ?? "";
    }

    get_bgimg()
    {
        return this.bgimg ?? "";
    }

    get_menuimg()
    {
        return this.menuimg ?? "";
    }

    get_title()
    {
        return this.title ?? "";
    }

    get_subtitle()
    {
        return this.subtitle ?? "";
    }

    get_iconname()
    {
        return this.iconname ?? "";
    }

    get_items()
    {
        return this.items ?? [];
    }
}

export default CatModel;