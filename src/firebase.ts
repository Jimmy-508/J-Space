import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCxL16XeSS40ZXmJWtny5TM3IaJUCEO_0A",
  authDomain: "j-space-a1ed0.firebaseapp.com",
  projectId: "j-space-a1ed0",
  storageBucket: "j-space-a1ed0.firebasestorage.app",
  messagingSenderId: "1088447597251",
  appId: "1:1088447597251:web:d370902028231dbe5c7076",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);