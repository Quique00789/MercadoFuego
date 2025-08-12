// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDu3tVRVjsyktQpINF8vBN00Z9bOdZkBLs",
  authDomain: "login-db708.firebaseapp.com",
  databaseURL: "https://login-db708-default-rtdb.firebaseio.com",
  projectId: "login-db708",
  storageBucket: "login-db708.firebasestorage.app",
  messagingSenderId: "721716250793",
  appId: "1:721716250793:web:d83a929b29428bb2d281b8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app); 