// Initialisation Firebase. La configuration est fournie automatiquement par
// Firebase Hosting (/__/firebase/init.json), en ligne comme en local avec l'émulateur.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const res = await fetch('/__/firebase/init.json');
if (!res.ok) throw new Error('Configuration Firebase introuvable : lance l\'app avec Firebase Hosting (voir README).');

export const app = initializeApp(await res.json());
export const auth = getAuth(app);
export const db = getFirestore(app);
