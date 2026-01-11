// Firebase Configuration
// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCCD8c4Zbd87R5YuE4aYJzz2mwZBFIntsM",
    authDomain: "meditationtrack-d4f26.firebaseapp.com",
    projectId: "meditationtrack-d4f26",
    storageBucket: "meditationtrack-d4f26.firebasestorage.app",
    messagingSenderId: "278571030172",
    appId: "1:278571030172:web:f25fcb90d45e29d862ff59"
};

// Initialize Firebase
let db = null;
let auth = null;

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Firebase initialization error:', error);
}
