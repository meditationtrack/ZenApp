# GitHub Setup & Deployment Guide

## Your App is Ready! 🎉

Firebase is properly configured and working. Now let's get it on GitHub and deploy it.

---

## Part 1: Install Git (5 minutes)

### Option A: Git for Windows (Recommended)
1. Download from: https://git-scm.com/download/win
2. Run the installer
3. Use all default settings (just keep clicking "Next")
4. After installation, **restart VS Code** or your terminal

### Option B: GitHub Desktop (Easier for beginners)
1. Download from: https://desktop.github.com/
2. Install and sign in with your GitHub account
3. Skip to Part 3 below (GitHub Desktop handles git commands for you)

---

## Part 2: Create GitHub Repository

1. **Go to GitHub**
   - Visit: https://github.com
   - Sign in (or create a free account)

2. **Create New Repository**
   - Click the "+" icon in top right → "New repository"
   - Repository name: `meditation-app` (or your preferred name)
   - Description: "A zen meditation tracking app with timer and calendar"
   - Choose: **Public** (so you can use GitHub Pages for free)
   - ✅ Do NOT check "Add a README file"
   - Click "Create repository"

3. **Copy Your Repository URL**
   - You'll see something like: `https://github.com/yourusername/meditation-app.git`
   - Keep this page open

---

## Part 3: Push Your Code to GitHub

### Using Command Line (after installing Git):

Open PowerShell in your project folder and run these commands:

```powershell
# Navigate to your project
cd "c:\Users\adamp\OneDrive\Desktop\ZenApp"

# Initialize git repository
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial commit - Zen meditation app"

# Add your GitHub repository (replace with YOUR url)
git remote add origin https://github.com/yourusername/meditation-app.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Using GitHub Desktop (easier):

1. Open GitHub Desktop
2. File → Add Local Repository
3. Choose: `C:\Users\adamp\OneDrive\Desktop\ZenApp`
4. Click "create a repository" if prompted
5. Fill in:
   - Name: meditation-app
   - Description: A zen meditation tracking app
6. Click "Publish repository" in the top bar
7. Choose your GitHub account
8. Uncheck "Keep this code private" (so you can use free hosting)
9. Click "Publish Repository"

---

## Part 4: Deploy to GitHub Pages (Free Hosting!)

### Option A: Via GitHub Website (Easiest)

1. **Go to Your Repository**
   - Visit: `https://github.com/yourusername/meditation-app`

2. **Enable GitHub Pages**
   - Click "Settings" tab
   - Scroll down and click "Pages" in left sidebar
   - Under "Source", select: **main** branch
   - Folder: **/ (root)**
   - Click "Save"

3. **Wait 1-2 Minutes**
   - GitHub will build your site
   - You'll see: "Your site is live at https://yourusername.github.io/meditation-app/"
   - Click the link to view your live app!

### Option B: Using Firebase Hosting

If you prefer Firebase Hosting (also free):

1. **Install Firebase CLI**
```powershell
npm install -g firebase-tools
```

2. **Login to Firebase**
```powershell
firebase login
```

3. **Initialize Firebase Hosting**
```powershell
cd "c:\Users\adamp\OneDrive\Desktop\ZenApp"
firebase init hosting
```
   - Select your Firebase project
   - Public directory: **. (current directory)**
   - Configure as single-page app: **No**
   - Don't overwrite files: **No**

4. **Deploy**
```powershell
firebase deploy --only hosting
```

5. **Your App is Live!**
   - You'll see: `Hosting URL: https://your-project.web.app`

---

## Part 5: Set Up Firebase Authentication & Database

Your Firebase config is already in place, but you need to enable services:

### Enable Authentication:
1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project: **meditationtrack-d4f26**
3. Click "Authentication" in left menu
4. Click "Get Started"
5. Click "Email/Password" under Sign-in method
6. Toggle **Enable** → Save

### Enable Firestore Database:
1. Click "Firestore Database" in left menu
2. Click "Create database"
3. Choose: **Start in production mode**
4. Location: Choose closest to you
5. Click "Enable"

### Set Up Firestore Rules (Important for Security):
1. In Firestore, click "Rules" tab
2. Replace with this:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Click "Publish"

---

## Part 6: Update Your Live Site

When you make changes to your app:

### Using GitHub + GitHub Pages:
```powershell
# Make your changes, then:
git add .
git commit -m "Description of your changes"
git push
```
Wait 1-2 minutes and your site auto-updates!

### Using Firebase Hosting:
```powershell
firebase deploy --only hosting
```

---

## Your App URLs

After setup, you'll have:
- **GitHub Repository**: `https://github.com/yourusername/meditation-app`
- **Live Site (GitHub Pages)**: `https://yourusername.github.io/meditation-app/`
- **OR Live Site (Firebase)**: `https://meditationtrack-d4f26.web.app`

---

## Troubleshooting

### Git not recognized
- After installing Git, restart your terminal/VS Code
- Or use GitHub Desktop instead

### Firebase errors
- Make sure you enabled Authentication and Firestore in Firebase Console
- Check that firestore rules are published

### Site not loading
- GitHub Pages: Wait 2-3 minutes after first deploy
- Check that repository is Public
- Clear browser cache (Ctrl+Shift+R)

### Authentication not working
- Verify Email/Password is enabled in Firebase Console
- Check browser console for errors (F12)

---

## Next Steps

✅ Your app is fully functional with:
- User authentication
- Cloud sync across devices
- Beautiful zen design
- Timer with animations
- Calendar tracking
- Session history

**Share your app!** Send the live URL to friends and family.

**Need changes?** Just edit the files, commit, and push to GitHub!

---

## Questions?

Common customizations:
- Change colors: Edit `styles.css` (CSS variables at top)
- Change app name: Edit `index.html` (title and h1)
- Add features: Edit `app.js`

Remember: Always test locally by opening `index.html` in a browser before deploying!
