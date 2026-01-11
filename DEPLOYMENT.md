# Meditation App - Deployment Guide

## Setup Overview
Your meditation app is now ready to deploy with Firebase authentication and cloud sync! Follow these steps to get it live.

---

## Step 1: Create Firebase Project (5 minutes)

1. **Go to Firebase Console**
   - Visit: https://console.firebase.google.com/
   - Sign in with your Google account (or create one)

2. **Create New Project**
   - Click "Add project"
   - Enter project name (e.g., "meditation-app")
   - Disable Google Analytics (optional, but simplifies setup)
   - Click "Create project"

3. **Add Web App**
   - In your project dashboard, click the **</> Web** icon
   - Enter app nickname (e.g., "Meditation Web App")
   - Don't check "Also set up Firebase Hosting" yet
   - Click "Register app"

4. **Copy Your Firebase Config**
   - You'll see code that looks like this:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```
   - **Copy these values**

5. **Update Your Config File**
   - Open `firebase-config.js` in your project
   - Replace the placeholder values with your actual config:
   ```javascript
   const firebaseConfig = {
       apiKey: "YOUR_ACTUAL_API_KEY_HERE",
       authDomain: "your-project.firebaseapp.com",
       projectId: "your-project",
       storageBucket: "your-project.appspot.com",
       messagingSenderId: "123456789",
       appId: "1:123456789:web:abc123"
   };
   ```

6. **Enable Authentication**
   - In Firebase Console, go to **Build → Authentication**
   - Click "Get started"
   - Click on "Email/Password" under "Sign-in method"
   - Enable "Email/Password"
   - Click "Save"

7. **Enable Firestore Database**
   - Go to **Build → Firestore Database**
   - Click "Create database"
   - Select "Start in test mode" (we'll secure it later)
   - Choose a location (pick one close to your users)
   - Click "Enable"

8. **Set Firestore Security Rules**
   - In Firestore Database, click on the "Rules" tab
   - Replace the rules with:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```
   - Click "Publish"
   - This ensures users can only access their own data

---

## Step 2: Deploy to GitHub Pages (10 minutes)

### Option A: Using GitHub Website (Easiest)

1. **Create GitHub Account**
   - Go to https://github.com
   - Sign up for free account

2. **Create New Repository**
   - Click the "+" icon → "New repository"
   - Name: `meditation-app` (or any name you like)
   - Keep it Public (required for free GitHub Pages)
   - Don't initialize with README
   - Click "Create repository"

3. **Upload Your Files**
   - Click "uploading an existing file"
   - Drag and drop these 4 files:
     - index.html
     - app.js
     - styles.css
     - firebase-config.js (with your Firebase config filled in)
   - Click "Commit changes"

4. **Enable GitHub Pages**
   - Go to repository Settings
   - Scroll to "Pages" section (left sidebar)
   - Under "Source", select "Deploy from a branch"
   - Select branch: `main` and folder: `/ (root)`
   - Click "Save"
   - Wait 1-2 minutes
   - Your site will be live at: `https://YOUR-USERNAME.github.io/meditation-app/`

### Option B: Using Git Command Line

1. **Install Git**
   - Windows: Download from https://git-scm.com/
   - Check installation: Open PowerShell, type `git --version`

2. **Create GitHub Repository**
   - Follow steps 1-2 from Option A above

3. **Push Your Code**
   - Open PowerShell in your meditation app folder
   - Run these commands (replace YOUR-USERNAME and your-repo-name):
   ```powershell
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/your-repo-name.git
   git push -u origin main
   ```

4. **Enable GitHub Pages**
   - Follow step 4 from Option A above

---

## Step 3: Test Your App

1. **Visit Your Live Site**
   - Go to `https://YOUR-USERNAME.github.io/meditation-app/`

2. **Create Test Account**
   - Click "Sign up"
   - Enter an email and password
   - Sign in

3. **Test Features**
   - Log a meditation session
   - Check the calendar
   - Sign out and sign in on a different browser/device
   - Verify your data syncs across devices

---

## Troubleshooting

### Firebase Not Connecting
- Check browser console (F12) for errors
- Verify `firebase-config.js` has your actual Firebase credentials
- Ensure Firestore and Authentication are enabled in Firebase Console

### GitHub Pages Not Loading
- Wait 2-3 minutes after enabling Pages
- Check repository Settings → Pages for deployment status
- Ensure repository is Public

### Authentication Errors
- Email/Password sign-in must be enabled in Firebase Console
- Password must be at least 6 characters
- Check Firestore security rules are published

### Data Not Syncing
- Verify Firestore rules are set correctly
- Check browser console for permission errors
- Ensure you're signed in

---

## Optional Enhancements

### Add Custom Domain
1. Buy a domain (e.g., from Namecheap, Google Domains)
2. In GitHub repository Settings → Pages
3. Add your custom domain
4. Update DNS records (GitHub provides instructions)

### Upgrade Firebase Security
- Current rules allow test mode access
- For production, ensure rules only allow authenticated users to access their own data (already configured above)

### Add Google Sign-In
1. Firebase Console → Authentication → Sign-in method
2. Enable "Google" provider
3. Update app.js to add Google sign-in button

---

## Updating Your App

After making changes:

### GitHub Website Method:
1. Go to your repository
2. Click on the file you want to update
3. Click the pencil icon (Edit)
4. Make changes
5. Commit changes

### Git Command Line Method:
```powershell
git add .
git commit -m "Description of changes"
git push
```

Changes appear on your site within 1-2 minutes.

---

## Need Help?

- **Firebase Docs**: https://firebase.google.com/docs/web/setup
- **GitHub Pages Docs**: https://docs.github.com/en/pages
- **Firebase Console**: https://console.firebase.google.com/

Your app is now ready for the world! 🎉
