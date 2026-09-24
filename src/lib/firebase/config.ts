import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

/**
 * ==============================================================================
 * CENTRALIZAÇÃO DA CONFIGURAÇÃO DO FIREBASE (FIRESTORE E AUTH)
 * ==============================================================================
 * Projeto: controle-custo-4696f
 * Utiliza o Firebase Web SDK / Firestore Client SDK.
 * Assegura que initializeApp() nunca seja invocado mais de uma vez (Singleton).
 */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'controle-custo-4696f.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'controle-custo-4696f',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'controle-custo-4696f.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Padrão Singleton para inicialização do Firebase App
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Instância oficial do Firestore
export const db: Firestore = getFirestore(app);

// Instância oficial do Firebase Auth Client
export const auth: Auth = getAuth(app);

