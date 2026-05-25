// Firebase Client SDK Configuration
// สำหรับใช้ใน browser (client-side)

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Singleton pattern — ป้องกัน initialize ซ้ำ
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

function getApp() {
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  }
  return app;
}

export function getFirebaseAuth() {
  if (!auth) {
    auth = getAuth(getApp());
  }
  return auth;
}

export function getFirebaseDb() {
  if (!db) {
    db = getFirestore(getApp());
  }
  return db;
}

export function getFirebaseStorage() {
  if (!storage) {
    storage = getStorage(getApp());
  }
  return storage;
}

// Emulator helpers (สำหรับ local dev)
export function connectEmulators() {
  if (process.env.NODE_ENV === 'development' && process.env.FIREBASE_EMULATOR === 'true') {
    const firebaseAuth = getFirebaseAuth();
    const firebaseDb = getFirebaseDb();
    const firebaseStorage = getFirebaseStorage();
    connectAuthEmulator(firebaseAuth, 'http://localhost:9099');
    connectFirestoreEmulator(firebaseDb, 'localhost', 8080);
    connectStorageEmulator(firebaseStorage, 'localhost', 9199);
    console.log('🔥 Firebase emulators connected');
  }
}
