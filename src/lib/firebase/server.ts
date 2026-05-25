// Firebase Admin SDK Configuration
// สำหรับใช้ใน server-side (API routes, server actions)
// ⚠️ Lazy init — ไม่ connect ตอน build time

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth as getAdminAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage, type Storage } from 'firebase-admin/storage';

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;
let adminStorage: Storage | null = null;

function connectServerEmulators() {
  if (process.env.FIREBASE_EMULATOR !== 'true') return;

  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';
}

function initAdmin() {
  if (adminApp) return adminApp;
  connectServerEmulators();
  
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
  if (!projectId || !clientEmail || !privateKey || privateKey.includes('YOUR_PRIVATE_KEY')) {
    return null;
  }

  try {
    adminApp = getApps().length === 0
      ? initializeApp({
          credential: cert({ projectId, clientEmail, privateKey } as any),
          databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
        })
      : getApps()[0];
    return adminApp;
  } catch (error) {
    console.error('Firebase Admin init error:', (error as any).message);
    return null;
  }
}

export function getServerAuth() {
  if (!adminAuth) {
    const app = initAdmin();
    if (app) adminAuth = getAdminAuth(app);
  }
  return adminAuth;
}

export function getServerDb() {
  if (!adminDb) {
    const app = initAdmin();
    if (app) adminDb = getAdminFirestore(app);
  }
  return adminDb;
}

export function getServerStorage() {
  if (!adminStorage) {
    const app = initAdmin();
    if (app) adminStorage = getAdminStorage(app);
  }
  return adminStorage;
}
