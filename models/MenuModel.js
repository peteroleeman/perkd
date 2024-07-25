// import React, { Component } from 'react';
// import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
// import { gIsOdoo } from '../global';

const { v4: uuidv4, v5: uuidv5 } = require('uuid');
const { gIsOdoo } = require('../global');

class MenuModel {
    constructor(props) {
        //super(props);
        if(gIsOdoo == true)
        {
            //availableStatus
            //description
            //id
            //modifierGroups
            //name
            //photos
            //price
            //sequence
             
        this.modifiergroups = props?.modifierGroups ?? [];
        this.cats = [];
        this.id = props.id;
        this.idesl = "";
        if(props.photos?.length > 0)
        {
             this.img = props.photos[0] ;
        }
        else
        {
            this.img = "";
        }
        if(props.photos?.length > 1)
        {
             this.img1 = props.photos[1] ;
        }
        else
        {
            this.img1 = "";
        }

        if(props.photos?.length > 2)
        {
             this.img2 = props.photos[2] ;
        }
        else
        {
            this.img2 = "";
        }
        if(props.photos?.length > 3)
        {
             this.img3 = props.photos[3] ;
        }
        else
        {
            this.img3 = "";
        }
        if(props.photos?.length > 4)
        {
             this.img4 = props.photos[4] ;
        }
        else
        {
            this.img4 = "";
        }
        if(props.photos?.length > 5)
        {
             this.img5 = props.photos[5] ;
        }
        else
        {
            this.img5 = "";
        }

        this.title = props.name;
        this.smalltitle = props.name?.toLowerCase();
        this.subtitle = props.description;
        this.smallsubtitle = props.description?.toLowerCase();
        this.remark = "";
        this.store = "";
        this.storeid = "";
        this.menuprice = props.price;
        this.category = "";
        this.modifierGroup = props.modifierGroups?.toString();
        if(props.availableStatus == "UNAVAILABLE")
        {
            this.isSoldOut = true;
        }
        else
        {
        this.isSoldOut = false;
        }
        this.isWeight = false;
        this.discount = 0.0;
        this.discountDetail = "";
        this.subMenu1Title = "";
        this.subMenu2Title = "";
        this.subMenu3Title = "";
        this.subMenu4Title = "";
        this.subMenu5Title = "";
        this.subMenus1 = "";
        this.subMenus2 = "";
        this.subMenus3 = "";
        this.subMenus4 = "";
        this.subMenus5 = "";
        this.priceLogin = props.price;
        this.priceMember = props.price;
        this.sku = "";
        this.rackLocation = "";
        this.qty = 0;

        //public img link
        this.publicImgLink = "";

        //selectable modifiergroup
        this.selectablemg = (this.modifiergroups.length  > 0) ? true : false; //false as none selectable modifier group

        //reco menu
        this.recomenus = "";

        }
        else
        {

        this.modifiergroups = props.modifierGroups;
        this.cats = props.categories;
        this.id = props.id;
        this.idesl = props.idesl;
        this.img = props.img;
        this.img1 = props.img1;
        this.img2 = props.img2;
        this.img3 = props.img3;
        this.img4 = props.img4;
        this.img5 = props.img5;
        this.title = props.title;
        this.smalltitle = props.smalltitle;
        this.subtitle = props.subtitle;
        this.smallsubtitle = props.smallsubtitle;
        this.remark = props.remark;
        this.store = props.store;
        this.storeid = props.storeid;
        this.menuprice = props.price;
        this.category = props.category;
        this.modifiergroup = props.modifiergroup;
        this.modifiergroups = props.modifiergroups;
        this.isSoldOut = props.issoldout;
        this.isWeight = props.isweight;
        this.discount = props.discount;
        this.discountDetail = props.discountdetail;
        this.subMenu1Title = props.submenu1title;
        this.subMenu2Title = props.submenu2title;
        this.subMenu3Title = props.submenu3title;
        this.subMenu4Title = props.submenu4title;
        this.subMenu5Title = props.submenu5title;
        this.subMenus1 = props.submenu1;
        this.subMenus2 = props.submenu2;
        this.subMenus3 = props.submenu3;
        this.subMenus4 = props.submenu4;
        this.subMenus5 = props.submenu5;
        this.priceLogin = props.pricelogin;
        this.priceMember = props.pricemember;
        this.sku = props.menusku;
        this.rackLocation = props.racklocation;
        this.qty = props.qty;

        //public img link
        this.publicImgLink = props.publicimglink;

        //selectable modifiergroup
        this.selectablemg = props.selectablemg; //false as none selectable modifier group

        //reco menu
        this.recomenus = props.recomenus;
        }
    }


    get_modifiergroups()
    {
        return this.modifiergroups ?? [];
    }

    get_cats()
    {
        return this.cats ?? [];
    }

    get_id()
    {
        return this.id ?? "";
    }

    get_idesl()
    {
        return this.idesl ?? "";
    }

    get_img()
    {
        return this.img ?? "";
    }

    get_img1()
    {
        return this.img1 ?? "";
    }

    get_img2()
    {
        return this.img2 ?? "";
    }

    get_img3()
    {
        return this.img3 ?? "";
    }

    get_img4()
    {
        return this.img4 ?? "";
    }

    get_img5()
    {
        return this.img5 ?? "";
    }

    get_title()
    {
        return this.title ?? "";
    }

    get_smalltitle()
    {
        return this.smalltitle ?? "";
    }

    get_subtitle()
    {
        return this.subtitle ?? "";
    }

    get_smallsubtitle()
    {
        
        return this.smallsubtitle ?? "";
    }

    get_remark()
    {
        return this.remark ?? "";
    }

    get_store()
    {
        return this.store ?? "";
    }

    get_storeid()
    {
        return this.storeid ?? "";
    }

    get_price()
    {
        return this.menuprice ?? 0.0;
    }

    get_category()
    {
        return this.category ?? "";
    }

    get_modifiergroup()
    {
        return this.modifiergroup ?? "";
    }

    get_modifiergroups()
    {
        return this.modifiergroups ?? [];
    }

    get_selectablemg()
    {
        return this.selectablemg ?? false;
    }

    get_issoldout()
    {
        return this.isSoldOut ??  false;
    }

    get_isweight()
    {
        return this.isweight ?? false;
    }

    get_discount()
    {
        return this.discount ?? 0.0;
    }

    get_discountdetail()
    {
        return this.discountdetail ?? "";
    }

    get_submenu1title()
    {
        return this.submenu1title ?? "";
    }

    get_submenu2title()
    {
        return this.submenu2title ?? "";
    }

    get_submenu3title()
    {
        return this.submenu3title ?? "";
    }

    get_submenu4title()
    {
        return this.submenu4title ?? "";
    }

    get_submenu5title()
    {
        return this.submenu5title ?? "";
    }

    get_submenus1()
    {
        return this.submenus1 ?? [];
    }

    get_submenus2()
    {
        return this.submenus2 ?? [];
    }

    get_submenus3()
    {
        return this.submenus3 ?? [];
    }

    get_submenus4()
    {
        return this.submenus4 ?? [];
    }

    get_submenus5()
    {
        return this.submenus5 ?? [];
    }

    get_pricelogin()
    {
        return this.pricelogin ?? 0.0;
    }

    get_pricemember()
    {
        return this.pricemember ?? 0.0;
    }

    get_menusku()
    {
        return this.menusku ?? "";
    }

    get_racklocation()
    {
        return this.racklocation ?? "";
    }

    get_qty()
    {
        return this.qty ?? 0;
    }

    get_publicimglink()
    {
        return this.publicimglink ?? "";
    }

    get_selectablemg()
    {
        return this.selectablemg ?? false;
    }

    get_recomenus()
    {
        return this.recomenus ?? "";
    }
   
}

function createNewMenu(storeModel)
{
    const v4Id = uuidv4();
    return ({
        modifiergroups :[],
        cats :[],
        id : "M_" +   v4Id,
        idesl : "M_"   +  v4Id,
        img:"",
        img1 :"",
        img2:"",
        img3 :"",
        img4 :"",
        img5 :"",
        title :"",
        smalltitle :"",
        subtitle :"",
        smallsubtitle :"",
        remark :"",
        store : storeModel.title,
        storeid : storeModel.id,
        price: 0.0,
        category :"",
        modifiergroup :"",
        issoldout : true,
        isweight : false,
        discount : 0.0,
        discountdetail :"",
        submenu1title:"",
        submenu2title:"",
        submenu3title :"",
        submenu4title :"",
        submenu5title :"",
        submenus1 :[],
        submenus2 :[],
        submenus3 :[],
        submenus4 :[],
        submenus5 :[],
        pricelogin :0.0,
        pricemember :0.0,
        menusku :"",
        racklocation :"",
        qty: 0,

        //public img link
        publicimglink:"",

        //selectable modifiergroup
        selectablemg : false, //false as none selectable modifier group
        //reco menus
        recomenus: "",
    }
    )

    
}


function createNewMenuFromOdoo(storeId, storeTitle, menuModel)
{
    const v4Id = uuidv4();
    return ({
        modifiergroups :[],
        cats :[],
        id : "M_" +   v4Id,
        idesl : "M_"   +  v4Id,
        img:"",
        img1 :"",
        img2:"",
        img3 :"",
        img4 :"",
        img5 :"",
        title : menuModel?.title ??"",
        smalltitle :"",
        subtitle : menuModel?.subtitle ??"",
        smallsubtitle :"",
        remark :"",
        store : storeTitle,
        storeid : storeId,
        price:  menuModel?.price ?? 0.0,
        category : menuModel?.category ??"",
        modifiergroup : menuModel?.modifiergroup ??"",
        issoldout : menuModel?.issoldout ?? true,
        isweight : false,
        discount : menuModel?.discount ?? 0.0,
        discountdetail : menuModel?.discountdetail ??  "",
        submenu1title: menuModel?.submenu1title ?? "",
        submenu2title: menuModel?.submenu2title ?? "",
        submenu3title : menuModel?.submenu3title ??"",
        submenu4title : menuModel?.submenu4title ?? "",
        submenu5title : menuModel?.submenu5title ?? "",
        submenus1 :[],
        submenus2 :[],
        submenus3 :[],
        submenus4 :[],
        submenus5 :[],
        pricelogin :  0.0,
        pricemember : menuModel?.pricemember ?? 0.0,
        menusku : menuModel?.menusku ?? "",
        racklocation :"",
        qty: menuModel?.qty ?? 0,

        //public img link
        publicimglink:"",

        //selectable modifiergroup
        selectablemg : false, //false as none selectable modifier group
        //reco menus
        recomenus: "",
    }
    )

    
}

module.exports = MenuModel; // Export the default value
module.exports.createNewMenu = createNewMenu; // Export the named function
module.exports.createNewMenuFromOdoo = createNewMenuFromOdoo;
// export default MenuModel;
// export {createNewMenu};
