const firebase = require("../db");
const fireStore = firebase.firestore();

// Constants - matching Dart implementation
const kUserModelId = 'id';
const kUserModelUsername = "username";
const kUserModelDisplayName = "displayname";
const kUserModelEmail = "email";
const kUserModelPhotoURL = "photourl";
const kUserModelPhoneNumber = "phonenumber";
const kUserModelPoint = "point";
const kUserModelIsLock = "islock";
const kUserModelStoreId = "storeid";
const kUserModelStoreMode = "storemode";
const kUserModelPassword = "password";
const kUserModelAddress = "address";
const kUserModelDOB = "dob";
const kUserModelCreatedAt = "created_at";
const kUserModelStoreCards = "storecards";
const kUserModelLoyaltyPoints = "loyaltypoints";
const kUserModelCredits = "credits";

// Store Mode Constants
const kStoreModeNormal = "0";
const kStoreModePrintServer = "1";

class UserModel {
  constructor({
    id = "",
    username = "",
    displayName = "",
    email = "",
    photoURL = "",
    phoneNumber = "",
    point = 0.0,
    isLock = "false",
    storeId = "",
    storeMode = kStoreModeNormal,
    password = "",
    address = "",
    dob = null,
    createdAt = null,
    storeCards = [],
    loyaltyPoints = {},
    credits = {},
    vouchers = []
  } = {}) {
    this.id = id;
    this.username = username;
    this.displayName = displayName;
    this.email = email;
    this.photoURL = photoURL;
    this.phoneNumber = phoneNumber;
    this.point = point;
    this.isLock = isLock;
    this.storeId = storeId;
    this.storeMode = storeMode;
    this.password = password;
    this.address = address;
    this.dob = dob;
    this.createdAt = createdAt || new Date();
    this.storeCards = storeCards;
    this.loyaltyPoints = loyaltyPoints;
    this.credits = credits;
    this.vouchers = vouchers;
  }

  // Factory method to create UserModel from Firestore document
  static fromDocument(doc) {
    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    const checkDouble = (value) => {
      const num = parseFloat(value);
      return isNaN(num) ? 0.0 : num;
    };

    const hasField = (fieldName) => {
      return data.hasOwnProperty(fieldName) && data[fieldName] !== undefined;
    };

    return new UserModel({
      id: hasField(kUserModelId) ? data[kUserModelId] : "",
      username: hasField(kUserModelUsername) ? data[kUserModelUsername] : "",
      displayName: hasField(kUserModelDisplayName) ? data[kUserModelDisplayName] : "",
      email: hasField(kUserModelEmail) ? data[kUserModelEmail] : "",
      photoURL: hasField(kUserModelPhotoURL) ? data[kUserModelPhotoURL] : "",
      phoneNumber: hasField(kUserModelPhoneNumber) ? data[kUserModelPhoneNumber] : "",
      point: hasField(kUserModelPoint) ? checkDouble(data[kUserModelPoint]) : 0.0,
      isLock: hasField(kUserModelIsLock) ? data[kUserModelIsLock] : "false",
      storeId: hasField(kUserModelStoreId) ? data[kUserModelStoreId] : "",
      storeMode: hasField(kUserModelStoreMode) ? data[kUserModelStoreMode] : kStoreModeNormal,
      password: hasField(kUserModelPassword) ? data[kUserModelPassword] : "",
      address: hasField(kUserModelAddress) ? data[kUserModelAddress] : "",
      dob: hasField(kUserModelDOB) ? data[kUserModelDOB] : null,
      createdAt: hasField(kUserModelCreatedAt) ? data[kUserModelCreatedAt].toDate() : new Date(),
      storeCards: hasField(kUserModelStoreCards) ? Array.from(data[kUserModelStoreCards] || []) : [],
      loyaltyPoints: hasField(kUserModelLoyaltyPoints) ? Object.assign({}, data[kUserModelLoyaltyPoints] || {}) : {},
      credits: hasField(kUserModelCredits) ? Object.assign({}, data[kUserModelCredits] || {}) : {},
      vouchers: []
    });
  }

  // Factory method to create new user
  static newUser(phoneNumber, password, { email = "", address = "", dob = null } = {}) {
    const lastChars = (str, count) => {
      return str.length >= count ? str.slice(-count) : str;
    };

    return new UserModel({
      id: `FU_${phoneNumber}`,
      username: phoneNumber,
      phoneNumber: phoneNumber,
      password: password,
      address: address,
      displayName: lastChars(phoneNumber, 4),
      email: email,
      photoURL: '',
      point: 0.0,
      isLock: '',
      storeId: '',
      storeMode: '',
      createdAt: new Date(),
      dob: dob,
      storeCards: [],
      loyaltyPoints: {},
      credits: {}
    });
  }

  // Convert to map for Firestore storage
  toMap() {
    return {
      [kUserModelId]: this.id,
      [kUserModelUsername]: this.username || "",
      [kUserModelDisplayName]: this.displayName || "",
      [kUserModelEmail]: this.email || "",
      [kUserModelPhotoURL]: this.photoURL || "",
      [kUserModelPhoneNumber]: this.phoneNumber || "",
      [kUserModelPoint]: this.point || 0.0,
      [kUserModelIsLock]: this.isLock || "false",
      [kUserModelStoreId]: this.storeId || "",
      [kUserModelStoreMode]: this.storeMode || kStoreModeNormal,
      [kUserModelPassword]: this.password || "",
      [kUserModelAddress]: this.address || "",
      [kUserModelDOB]: this.dob || "",
      [kUserModelCreatedAt]: this.createdAt,
      [kUserModelStoreCards]: this.storeCards,
      [kUserModelLoyaltyPoints]: this.loyaltyPoints,
      [kUserModelCredits]: this.credits,
    };
  }

  // Helper methods
  isInfoCompleted() {
    return (this.displayName || "") !== "" && (this.phoneNumber || "") !== "";
  }

  getCurrentUserPoint() {
    const point = this.point ? this.point.toFixed(2) : "0.00";
    return point === "" ? "0.0" : point;
  }

  // Store card methods
  addStoreCard(storeId) {
    if (!this.storeCards.includes(storeId)) {
      this.storeCards.push(storeId);
    }
  }

  removeStoreCard(storeId) {
    this.storeCards = this.storeCards.filter(id => id !== storeId);
  }

  hasStoreCard(storeId) {
    return this.storeCards.includes(storeId);
  }

  // Loyalty points methods
  getLoyaltyPoints(storeId) {
    return this.loyaltyPoints[storeId] || 0.0;
  }

  addLoyaltyPoints(storeId, points) {
    this.loyaltyPoints[storeId] = (this.loyaltyPoints[storeId] || 0.0) + points;
  }

  subtractLoyaltyPoints(storeId, points) {
    const currentPoints = this.loyaltyPoints[storeId] || 0.0;
    this.loyaltyPoints[storeId] = currentPoints - points;
    if (this.loyaltyPoints[storeId] <= 0) {
      delete this.loyaltyPoints[storeId];
    }
  }

  // Credit methods
  getCredits(storeId) {
    return this.credits[storeId] || 0.0;
  }

  addCredits(storeId, creditsToAdd) {
    this.credits[storeId] = (this.credits[storeId] || 0.0) + creditsToAdd;
  }

  subtractCredits(storeId, creditsToSubtract) {
    const currentCredits = this.credits[storeId] || 0.0;
    this.credits[storeId] = currentCredits - creditsToSubtract;
    if (this.credits[storeId] <= 0) {
      delete this.credits[storeId];
    }
  }

  hasEnoughCredits(storeId, requiredCredits) {
    return this.getCredits(storeId) >= requiredCredits;
  }

  // Point-related operations
  async exTopupForFurdroid(docRef, amount) {
    const result = await docRef.get();
    if (result.exists) {
      this.point = this.point + amount;
      await docRef.update(this.toMap());
    }
  }

  async exReduceAmount(docRef, amount) {
    const result = await docRef.get();
    if (result.exists) {
      this.point = this.point - (amount / 100);
      await docRef.update(this.toMap());
    }
  }

  async exLockForPurchase(docRef) {
    const result = await docRef.get();
    if (result.exists) {
      this.isLock = "true";
      await docRef.update(this.toMap());
    }
  }

  async exUnLockForPurchase(docRef) {
    const result = await docRef.get();
    if (result.exists) {
      this.isLock = "false";
      await docRef.update(this.toMap());
    }
  }

  // Order with loyalty points
  async addOrderWithLoyaltyPoints(userCollectionRef, orderModel) {
    const userDocRef = userCollectionRef.doc(`FU_${this.phoneNumber}`);
    const result = await userDocRef.get();
    
    if (result.exists) {
      try {
        // Calculate loyalty points (1 dollar = 10 points)
        const orderAmount = orderModel.getTotal();
        const pointsEarned = orderAmount * 10;
        
        // Add loyalty points for the store
        this.addLoyaltyPoints(orderModel.storeId, pointsEarned);
        
        // Save order
        await userDocRef
          .collection("order")
          .doc(orderModel.id)
          .set(orderModel.toMap());
        
        // Update user document with new loyalty points
        await userDocRef.update(this.toMap());
        
      } catch (error) {
        console.error("Error adding order with loyalty points:", error);
        throw error;
      }
    }
  }

  // Voucher methods
  async loadVouchers() {
    try {
      const vouchersSnapshot = await fireStore.collection("user")
        .doc(`FU_${this.phoneNumber}`)
        .collection("vouchers")
        .get();

      this.vouchers = vouchersSnapshot.docs
        .map((doc) => {
          // Assuming VoucherModel.fromDocument exists
          return doc.data(); // Simplified for now
        });

      // Sort vouchers by creation date (newest first)
      this.vouchers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return this.vouchers;
    } catch (error) {
      console.error('Error loading vouchers:', error);
      return [];
    }
  }

  async addVoucher(voucher) {
    try {
      await fireStore.collection("user")
        .doc(`FU_${this.phoneNumber}`)
        .collection("vouchers")
        .doc(voucher.id)
        .set(voucher.toMap ? voucher.toMap() : voucher);
    } catch (error) {
      console.error('Error saving voucher:', error);
    }
  }

  // Voucher helper getters
  get activeVouchers() {
    return this.vouchers.filter(v => v.canBeRedeemed);
  }

  get expiredVouchers() {
    return this.vouchers.filter(v => v.isExpired);
  }

  get redeemedVouchers() {
    return this.vouchers.filter(v => v.isRedeemed);
  }

  getVouchersForStore(storeId) {
    return this.vouchers
      .filter(v => v.storeId === storeId && v.canBeRedeemed);
  }

  async updateVoucherAfterRedemption(voucher, qty = 1) {
    try {
      if (!voucher.canRedeemQuantity(qty)) return false;

      const success = voucher.redeem(qty);
      if (!success) return false;

      // Update voucher in Firestore
      await fireStore.collection("user")
        .doc(`FU_${this.phoneNumber}`)
        .collection("vouchers")
        .doc(voucher.id)
        .update(voucher.toMap ? voucher.toMap() : voucher);

      // Update local vouchers list
      const index = this.vouchers.findIndex(v => v.id === voucher.id);
      if (index !== -1) {
        this.vouchers[index] = voucher;
      }

      return true;
    } catch (error) {
      console.error('Error updating voucher:', error);
      return false;
    }
  }

  // Static methods
  static async processOrderWithLoyaltyPoints(userCollectionRef, phoneNumber, orderModel) {
    const userDocRef = userCollectionRef.doc(`FU_${phoneNumber}`);
    const result = await userDocRef.get();
    
    if (result.exists) {
      try {
        // Create UserModel from document
        const userModel = UserModel.fromDocument(result);
        
        // Calculate loyalty points (1 dollar = 10 points)
        const orderAmount = orderModel.getTotal();
        const pointsEarned = orderAmount * 10;
        
        // Add loyalty points for the store
        userModel.addLoyaltyPoints(orderModel.storeId, pointsEarned);
        
        // Save order
        await userDocRef
          .collection("order")
          .doc(orderModel.id)
          .set(orderModel.toMap());
        
        // Update user document with new loyalty points
        await userDocRef.update(userModel.toMap());
        
      } catch (error) {
        console.error("Error processing order with loyalty points:", error);
        throw error;
      }
    } else {
      throw new Error("User not found");
    }
  }

  static async addCreditsAndPoints(userCollectionRef, phoneNumber, storeId, creditsToAdd, pointsToAdd) {
    const userDocRef = userCollectionRef.doc(`FU_${phoneNumber}`);
    const result = await userDocRef.get();

    if (result.exists) {
      try {
        // Create UserModel from document
        const userModel = UserModel.fromDocument(result);

        // Add credits and points
        if (creditsToAdd > 0) {
          userModel.addCredits(storeId, creditsToAdd);
          console.log(`Added ${creditsToAdd} credits to user ${phoneNumber} for store ${storeId}`);
        }

        if (pointsToAdd > 0) {
          userModel.addLoyaltyPoints(storeId, pointsToAdd);
          console.log(`Added ${pointsToAdd} loyalty points to user ${phoneNumber} for store ${storeId}`);
        }

        // Update user document with new credits and points
        await userDocRef.update(userModel.toMap());

        console.log("Successfully updated user credits and points");
      } catch (error) {
        console.error("Error adding credits and points:", error);
        throw error;
      }
    } else {
      console.log(`User not found: FU_${phoneNumber}`);
      throw new Error("User not found");
    }
  }
}

module.exports = {
  UserModel,
  kUserModelId,
  kUserModelUsername,
  kUserModelDisplayName,
  kUserModelEmail,
  kUserModelPhotoURL,
  kUserModelPhoneNumber,
  kUserModelPoint,
  kUserModelIsLock,
  kUserModelStoreId,
  kUserModelStoreMode,
  kUserModelPassword,
  kUserModelAddress,
  kUserModelDOB,
  kUserModelCreatedAt,
  kUserModelStoreCards,
  kUserModelLoyaltyPoints,
  kUserModelCredits,
  kStoreModeNormal,
  kStoreModePrintServer
}; 