const firebase = require("./db");
const fireStore = firebase.firestore();

const getStore = async (storeId, req,res) => {
  try {
    const id = storeId;
    console.log("Getting employee= %s", id);
    const store = await fireStore.collection("store").doc(id);
    const data = await store.get();
    if (!data.exists) {
      res.status(404).json({ message: "Record not found" });
      console.log("record not found");
    } else {
      res.status(200).json(data.data());
      console.log(data.data());
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
    console.log(error);
  }
};

const writeTransaction = async (storeId, dateValue, refId, transStatus, res) =>{

    try{
         const id = storeId;
         console.log("Write transaction= %s", id);
         const trans = await fireStore.collection("transaction").doc(storeId).collection(dateValue).doc(refId);
         await trans.set({
          id: refId,
          status: transStatus
         });

         res.status(200).json({message: "done"});
     }
     catch(error){
         res.status(400).json({ message: error.message });
         console.log(error);
     }

};

module.exports = {
  getStore,
  writeTransaction
};