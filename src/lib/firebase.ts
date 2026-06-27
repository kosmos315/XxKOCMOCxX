import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "rich-stacker-579b0",
  appId: "1:206239870671:web:62d7546edd169103a0d1ba",
  apiKey: "AIzaSyC2f3IOZFdujuIU1wcRTclRHeXZmvpU_JY",
  authDomain: "rich-stacker-579b0.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-xxkocmocxxhacker-700b424c-6600-4c2b-bfba-26ae2ed44ea7",
  storageBucket: "rich-stacker-579b0.firebasestorage.app",
  messagingSenderId: "206239870671"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
