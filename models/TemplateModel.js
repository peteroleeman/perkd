import React, { Component } from 'react';

class TemplateModel extends Component {

    /*
    HeaderBack: "#ffffff00",
    HeaderText: "#000000",
    
    OrderCardBack: "#ffffff",
    PopupModifierSelectionIconColor : "#000000",
    PopupModifierSelectionDoneIconColor : "#81c448",
    
    MenuBackdrop: "#ffffff",
    MenuPriceZero: "#b20c21",
    */

    constructor(props) {
        super(props);

        //v1.7
        this.showSingleSelection = props.showSingleSelection ?? "false";
        this.isCatHighlight = props.isCatHighlight ?? "false";
        this.catHighlight = props.catHighlight ?? "";

        //v1.6
        this.showBanner = props.showBanner ?? "false";

        //v1.5
        this.SlideShowSpeed = parseInt("" + props.slideShowSpeed) ?? 1000;
        this.SlideShowDuration = parseInt("" + props.slideShowDuration) ?? 6000;

        //v1.4
        this.isCatRounded =  props.isCatRounded ?? "false";
        this.isMenuVertical = props.isMenuVertical ?? "false";
        this.consumeDineInImg = props.consumeDineInImg ?? "";
        this.consumeTakeAwayImg = props.consumeTakeAwayImg ?? "";

        //v1.3
        this.orderCardBorder = convertColor(props?.orderCardBorder ?? "FFFFFF");
        this.consumeBack =  convertColor(props?.consumeBack ?? "FFFFFF");
        this.consumeText =  convertColor(props?.consumeText ?? "FFFFFF");
        this.consumeBorder =  convertColor(props?.consumeBorder ?? "FFFFFF");
        this.consumeHeight = props?.consumeHeight ?? "500px";
        this.consumeDineInImg = props?.consumeDineInImg ?? "";
        this.consumeTakeAwayImg = props?.consumeTakeAwayImg ?? "";
        
        this.paymentBack = convertColor(props?.paymentBack ?? "FFFFFF");
        this.paymentText = convertColor(props?.paymentText ?? "FFFFFF" );
        this.paymentBorder = convertColor(props?.paymentBorder ?? "FFFFFF" );
        this.paymentHeight = props?.paymentHeight ?? "500px";

  

        //v1.2
        this.menuBack = convertColor(props?.menuBack ?? "FFFFFF");
        this.orderCardText = convertColor(props?.orderCardText ?? "000000");

        //v1.1
        this.img = props.img ?? "";
        this.headerBack = convertColor(props?.headerBack ?? "FFFFFF");
        this.headerText = convertColor(props?.headerText ?? "000000");
        this.orderCardBack = convertColor(props?.orderCardBack ?? "000000");
        this.popupModifierSelectionIconColor = convertColor(props?.popupModifierSelectionIconColor ?? "000000");
        this.popupModifierSelectionDoneIconColor = convertColor(props?.popupModifierSelectionDoneIconColor ?? "81c448");
        this.menuBackdrop = convertColor(props?.menuBackdrop ?? "FFFFFF");
        this.menuPriceZero = convertColor(props?.menuPriceZero ?? "000000");

        //system
            //Button
                //Text
        this.systemButtonTextActive = convertColor( props?.systemButtonTextActive ?? "000000");
        this.systemButtonTextInactive = convertColor(props?.systemButtonTextInactive ?? "000000");
                //Back
        this.systemButtonBackActive = convertColor( props?.systemButtonBackActive ?? "FFFFFF");
        this.systemButtonBackInactive = convertColor(props?.systemButtonBackInactive ?? "FFFFFF");
        //Button
            //Text
        this.buttonTextActive = convertColor(props?.buttonTextActive ?? "000000");
        this.buttonTextInactive = convertColor(props?.buttonTextInactive ?? "000000");
            //Back
        this.buttonBackActive = convertColor(props?.buttonBackActive ?? "D3D3D3");
        this.buttonBackInactive = convertColor(props?.buttonBackInactive ?? "D3D3D3");

        //Menu
            //Price
        this.menuPrice = convertColor(props?.menuPrice ?? "000000");
            //Title
        this.menuTitle = convertColor(props?.menuTitle ?? "000000");
            //Arrow
        this.menuArrowActive = convertColor(props?.menuArrowActive ?? "000000");
        this.menuArrowInactive = convertColor(props?.menuArrowInactive ?? "000000");

        //Cat
            //Text
        this.catTextActive = convertColor( props?.catTextActive ?? "000000");
        this.catTextInactive = convertColor(props?.catTextInactive ?? "000000");
            //Back
        this.catBackActive = convertColor(props?.catBackActive ?? "FFFFFF");
        this.catBackInactive = convertColor(props?.catBackInactive ?? "FFFFFF");
            //Arrow
        this.catArrowActive = convertColor( props?.catArrowActive ?? "000000");
        this.catArrowInactive = convertColor(props?.catArrowInactive ?? "000000");
            //Backdrop
        this.catBackdrop = convertColor(props?.catBackdrop ?? "FFFFFF");

        //Color
            //Primary
        this.primaryBack = convertColor(props?.primaryBack ?? "FFFFFF");
        this.primaryText = convertColor(props?.primaryText ?? "000000");
            //Secondary
        this.secondaryBack = convertColor( props?.secondaryBack ?? "FFFFFF");
        this.secondaryText = convertColor(props?.secondaryText ?? "000000");
            //Third
        this.thirdBack = convertColor(props?.thirdBack ?? "FFFFFF");
        this.thirdText = convertColor(props?.thirdText ?? "000000");
        //Four
        this.fourBack = convertColor(props?.fourBack ?? "FFFFFF");
        this.fourText = convertColor(props?.fourText ?? "000000");
            //Inactive
        this.inactive = convertColor(props?.inactive ?? "000000");
            //Back
        this.backdrop = convertColor( props?.backdrop ?? "FFFFFF");
      
       
    }


  
}

 function convertColor(inputValue)
    {
        let opacityValue = inputValue.substring(0, 2);
        let colorValue = inputValue.substring(2, 8);

        return "#" + colorValue; //colorValue + opacityValue;
    }

function createStandardTemplate()
{
    return new TemplateModel(
        {
            //v1.7
            showSingleSelection :  "false",
            //cat highlight
            isCatHighlight : "false",
            catHighlight: "",


            //v1.6
           showBanner : "false",

            //v1.5
            slideShowSpeed : 1000,
            slideShowDuration: 6000,

            //v1.4
            isCatRounded :   "false",
            isMenuVertical :  "false",

            //system
            //Button
                //Text
                systemButtonTextActive : "#FFFFFF",
                systemButtonTextInactive : "#000000",
                //Back
                systemButtonBackActive: "#DF5BA0",
                systemButtonBackInactive :"#FFFFFF",
        //Button
            //Text
            buttonTextActive : "#FFFFFF",
            buttonTextInactive : "#000000",
            //Back
            buttonBackActive : "#DF5BA0",
            buttonBackInactive : "#FFFFFF",

        //Menu
            //Price
            menuPrice: "#DF5BA0",
            //Title
            menuTitle: "#000000",
            //Arrow
            menuArrowActive : "#DF5BA0",
            menuArrowInactive :"#F7F7F7",

        //Cat
            //Text
            catTextActive: "#FFFFFF",
            catTextInactive:"#3277B4",
            //Back
            catBackActive : "#3277B4",
            catBackInactive :"#FFFFFF",
            //Arrow
            catArrowActive : "#3277B4",
            catArrowInactive : "#F7F7F7",
            //Backdrop
            catBackdrop: "#FFFFFF",

        //Color
            //Primary
            primaryBack : "#DF5BA0", //bp pink
            primaryText:  "#ffffff",
            //Secondary
            secondaryBack: "#3277B4", //blue
            secondaryText: "#ffffff", //blue
            //Third
            thirdBack :"#F7F7F7", //
            thirdText :"#000000", //grey
            //Four
            fourBack : "#F7F7F7",
            fourText :"#000000",
            //Inactive
            inactive: "#F7F7F7", //grey
            //Back
            backdrop : "#f4f4f4" //lite grey
        }
    );
}

export default TemplateModel;