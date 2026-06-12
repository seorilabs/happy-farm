import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';

const APPS_IN_TOSS_FIREBASE_APP_NAME = 'happy-farm-apps-in-toss';

export const APPS_IN_TOSS_FIREBASE_CONFIG: FirebaseOptions = {
  apiKey: 'AIzaSyA6qzbbudhf8sRB5ri1Lme6CV66xG_Pfvw',
  authDomain: 'happy-farm-tycoon.firebaseapp.com',
  projectId: 'happy-farm-tycoon',
  storageBucket: 'happy-farm-tycoon.firebasestorage.app',
  messagingSenderId: '1874344437',
  appId: '1:1874344437:web:a34abb444eae2baa6c48bc',
  measurementId: 'G-LQQQQZHG1V',
};

export function getAppsInTossFirebaseApp(): FirebaseApp {
  const existingApp = getApps().find((app) => app.name === APPS_IN_TOSS_FIREBASE_APP_NAME);
  if (existingApp != null) {
    return existingApp;
  }

  return initializeApp(APPS_IN_TOSS_FIREBASE_CONFIG, APPS_IN_TOSS_FIREBASE_APP_NAME);
}
