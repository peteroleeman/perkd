//const { initializeApp } = require( "firebase/app");
//const { getFirestore } = require( "firebase/firestore");

// const firebaseConfig = {
//     apiKey: "AIzaSyBVamyeHfJg26b_6miBV5SVZ3cAiu5en8U",
//     authDomain: "todo-77d73.firebaseapp.com",
//     projectId: "todo-77d73",
//     storageBucket: "todo-77d73.appspot.com",
//     messagingSenderId: "821972870775",
//     appId: "1:821972870775:web:70160e4bfc48370bd28872",
//     measurementId: "G-EJYTHKZV2J"
// };


const firebaseConfig = {
    apiKey: "AIzaSyDX7JUj31rsoQUmurdI8eQM_lZ7C12wi-Q",
    authDomain: "foodio-ab3b2.firebaseapp.com",
    databaseURL: "https://foodio-ab3b2.firebaseio.com",
    projectId: "foodio-ab3b2",
    storageBucket: "foodio-ab3b2.appspot.com",
    messagingSenderId: "261774603679",
    appId: "1:261774603679:web:690d46e53cd0590e8779aa",
    measurementId: "G-M921CC1V4Y"
  };

const app = initializeApp(firebaseConfig)

const db = getFirestore(app)

module.exports = db;