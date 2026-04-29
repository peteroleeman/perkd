/**
 * MachineModel - JavaScript model for machine/merchant_device documents
 * Based on the Dart MachineModel implementation
 */

// Field constants matching Dart implementation
const kMachineModelId = 'id';
const kMachineModelTitle = 'title';
const kMachineModelRemark = 'remark';
const kMachineModelMachineId = 'machineid';
const kMachineModelCompanyId = 'companyid';
const kMachineModelStoreIds = 'storeids';
const kMachineModelImgUrl = 'imgurl';
const kMachineModelLoyaltyCardIds = 'loyaltycardids';
const kMachineModelLogoUrl = 'logourl';
const kMachineModelBackgroundUrl = 'backgroundurl';
const kMachineModelVendingDeviceNumber = 'vendingdevicenumber';
const kMachineModelVendingMerchantId = 'vendingmerchantid';
const kMachineModelLocationName = 'locationName';
const kMachineModelLatitude = 'latitude';
const kMachineModelLongitude = 'longitude';
const kMachineModelVendingMaxSelection = 'vendingmaxselection';
const kMachineModelHideAllMenu = 'hideallmenu';
const kMachineModelIsCoinMachine = 'iscoinmachine';
const kMachineModelPricePerToken = 'pricepertoken';
const kMachineModelTokensNeededPerGame = 'tokensneededpergame';
const kMachineModelGamingMachineDisplayUrl = 'gamingmachinedisplayurl';
const kMachineModelGamingMachineColor = 'gamingmachinecolor';

class MachineModel {
  constructor({
    id = '',
    title = '',
    remark = '',
    machineId = '',
    companyId = '',
    storeIds = [],
    loyaltyCardIds = [],
    imgUrl = '',
    logoUrl = '',
    backgroundUrl = '',
    vendingDeviceNumber = '',
    vendingMerchantId = '',
    locationName = '',
    latitude = 0.0,
    longitude = 0.0,
    vendingMaxSelection = 4,
    hideAllMenu = false,
    isCoinMachine = false,
    pricePerToken = 1.0,
    tokensNeededPerGame = 0,
    gamingMachineDisplayUrl = '',
    gamingMachineColor = 0xFF2196F3 // Default blue color
  } = {}) {
    this.id = id;
    this.title = title;
    this.remark = remark;
    this.machineId = machineId;
    this.companyId = companyId;
    this.storeIds = Array.isArray(storeIds) ? storeIds : [];
    this.loyaltyCardIds = Array.isArray(loyaltyCardIds) ? loyaltyCardIds : [];
    this.imgUrl = imgUrl;
    this.logoUrl = logoUrl;
    this.backgroundUrl = backgroundUrl;
    this.vendingDeviceNumber = vendingDeviceNumber;
    this.vendingMerchantId = vendingMerchantId;
    this.locationName = locationName;
    this.latitude = parseFloat(latitude) || 0.0;
    this.longitude = parseFloat(longitude) || 0.0;
    this.vendingMaxSelection = parseInt(vendingMaxSelection) || 4;
    this.hideAllMenu = Boolean(hideAllMenu);
    this.isCoinMachine = Boolean(isCoinMachine);
    this.pricePerToken = parseFloat(pricePerToken) || 1.0;
    this.tokensNeededPerGame = parseInt(tokensNeededPerGame) || 0;
    this.gamingMachineDisplayUrl = gamingMachineDisplayUrl;
    this.gamingMachineColor = this._parseColorValue(gamingMachineColor);
  }

  /**
   * Helper function to parse color value (handles both int and String)
   */
  _parseColorValue(value) {
    if (typeof value === 'number') {
      return value;
    } else if (typeof value === 'string') {
      return parseInt(value) || 0xFF2196F3; // Default blue
    }
    return 0xFF2196F3; // Default blue
  }

  /**
   * Factory method to create MachineModel from Firestore document
   */
  static fromDocument(doc) {
    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    return MachineModel.fromMap(data);
  }

  /**
   * Factory method to create MachineModel from a data map
   */
  static fromMap(data) {
    if (!data) {
      return null;
    }

    const hasField = (fieldName) => {
      return data.hasOwnProperty(fieldName) && data[fieldName] !== undefined;
    };

    return new MachineModel({
      id: hasField(kMachineModelId) ? data[kMachineModelId] : '',
      title: hasField(kMachineModelTitle) ? data[kMachineModelTitle] : '',
      remark: hasField(kMachineModelRemark) ? data[kMachineModelRemark] : '',
      machineId: hasField(kMachineModelMachineId) ? data[kMachineModelMachineId] : '',
      companyId: hasField(kMachineModelCompanyId) ? data[kMachineModelCompanyId] : '',
      storeIds: hasField(kMachineModelStoreIds) ? Array.from(data[kMachineModelStoreIds] || []) : [],
      loyaltyCardIds: hasField(kMachineModelLoyaltyCardIds) ? Array.from(data[kMachineModelLoyaltyCardIds] || []) : [],
      imgUrl: hasField(kMachineModelImgUrl) ? data[kMachineModelImgUrl] : '',
      logoUrl: hasField(kMachineModelLogoUrl) ? data[kMachineModelLogoUrl] : '',
      backgroundUrl: hasField(kMachineModelBackgroundUrl) ? data[kMachineModelBackgroundUrl] : '',
      vendingDeviceNumber: hasField(kMachineModelVendingDeviceNumber) ? data[kMachineModelVendingDeviceNumber] : '',
      vendingMerchantId: hasField(kMachineModelVendingMerchantId) ? data[kMachineModelVendingMerchantId] : '',
      locationName: hasField(kMachineModelLocationName) ? data[kMachineModelLocationName] : '',
      latitude: hasField(kMachineModelLatitude) ? data[kMachineModelLatitude] : 0.0,
      longitude: hasField(kMachineModelLongitude) ? data[kMachineModelLongitude] : 0.0,
      vendingMaxSelection: hasField(kMachineModelVendingMaxSelection) ? data[kMachineModelVendingMaxSelection] : 4,
      hideAllMenu: hasField(kMachineModelHideAllMenu) ? data[kMachineModelHideAllMenu] : false,
      isCoinMachine: hasField(kMachineModelIsCoinMachine) ? data[kMachineModelIsCoinMachine] : false,
      pricePerToken: hasField(kMachineModelPricePerToken) ? data[kMachineModelPricePerToken] : 1.0,
      tokensNeededPerGame: hasField(kMachineModelTokensNeededPerGame) ? data[kMachineModelTokensNeededPerGame] : 0,
      gamingMachineDisplayUrl: hasField(kMachineModelGamingMachineDisplayUrl) ? data[kMachineModelGamingMachineDisplayUrl] : '',
      gamingMachineColor: hasField(kMachineModelGamingMachineColor) ? data[kMachineModelGamingMachineColor] : 0xFF2196F3
    });
  }

  /**
   * Convert MachineModel to a map for Firestore
   */
  toMap() {
    return {
      [kMachineModelId]: this.id,
      [kMachineModelTitle]: this.title,
      [kMachineModelRemark]: this.remark,
      [kMachineModelMachineId]: this.machineId,
      [kMachineModelCompanyId]: this.companyId,
      [kMachineModelStoreIds]: this.storeIds,
      [kMachineModelLoyaltyCardIds]: this.loyaltyCardIds,
      [kMachineModelImgUrl]: this.imgUrl,
      [kMachineModelLogoUrl]: this.logoUrl,
      [kMachineModelBackgroundUrl]: this.backgroundUrl,
      [kMachineModelVendingDeviceNumber]: this.vendingDeviceNumber,
      [kMachineModelVendingMerchantId]: this.vendingMerchantId,
      [kMachineModelLocationName]: this.locationName,
      [kMachineModelLatitude]: this.latitude,
      [kMachineModelLongitude]: this.longitude,
      [kMachineModelVendingMaxSelection]: this.vendingMaxSelection,
      [kMachineModelHideAllMenu]: this.hideAllMenu,
      [kMachineModelIsCoinMachine]: this.isCoinMachine,
      [kMachineModelPricePerToken]: this.pricePerToken,
      [kMachineModelTokensNeededPerGame]: this.tokensNeededPerGame,
      [kMachineModelGamingMachineDisplayUrl]: this.gamingMachineDisplayUrl,
      [kMachineModelGamingMachineColor]: this.gamingMachineColor
    };
  }

  // Helper method to add a store ID to the machine
  addStore(storeId) {
    if (!this.storeIds.includes(storeId)) {
      this.storeIds.push(storeId);
    }
  }

  // Helper method to remove a store ID from the machine
  removeStore(storeId) {
    const index = this.storeIds.indexOf(storeId);
    if (index > -1) {
      this.storeIds.splice(index, 1);
    }
  }

  // Helper method to check if a store is linked to this machine
  hasStore(storeId) {
    return this.storeIds.includes(storeId);
  }

  // Add helper methods for loyalty cards
  addLoyaltyCard(cardId) {
    if (!this.loyaltyCardIds.includes(cardId)) {
      this.loyaltyCardIds.push(cardId);
    }
  }

  removeLoyaltyCard(cardId) {
    const index = this.loyaltyCardIds.indexOf(cardId);
    if (index > -1) {
      this.loyaltyCardIds.splice(index, 1);
    }
  }

  hasLoyaltyCard(cardId) {
    return this.loyaltyCardIds.includes(cardId);
  }
}

// Export the class and constants
module.exports = {
  MachineModel,
  kMachineModelId,
  kMachineModelTitle,
  kMachineModelRemark,
  kMachineModelMachineId,
  kMachineModelCompanyId,
  kMachineModelStoreIds,
  kMachineModelImgUrl,
  kMachineModelLoyaltyCardIds,
  kMachineModelLogoUrl,
  kMachineModelBackgroundUrl,
  kMachineModelVendingDeviceNumber,
  kMachineModelVendingMerchantId,
  kMachineModelLocationName,
  kMachineModelLatitude,
  kMachineModelLongitude,
  kMachineModelVendingMaxSelection,
  kMachineModelHideAllMenu,
  kMachineModelIsCoinMachine,
  kMachineModelPricePerToken,
  kMachineModelTokensNeededPerGame,
  kMachineModelGamingMachineDisplayUrl,
  kMachineModelGamingMachineColor
};

