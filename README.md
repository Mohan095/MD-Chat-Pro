# MD Chat Pro — Real-Time Messaging Web Application

**MD Chat Pro** is a complete, production-ready real-time messaging and collaboration web application built with **React 18**, **Firebase (Authentication, Cloud Firestore, Cloud Storage, Realtime Database, Cloud Messaging, Analytics)**, and a custom glassmorphic dark/light design system.

---

## 1. Key Features

### Authentication & Identity
- **Email & Password Registration / Sign In** with strength validation and rate limiting
- **Google OAuth Sign-In** via Firebase Authentication
- **Password Recovery** (`sendPasswordResetEmail`)
- **Email Verification** workflow (`sendEmailVerification`)
- **Profile Management**: Upload profile avatars, edit display name, `@username`, bio, custom status presets, and live online/offline indicator
- **Instant Demo Switcher**: Pre-seeded accounts (*Alex Rivera*, *Sarah Chen*, *Marcus Vance*) for immediate multi-user testing

### Real-Time Messaging
- **One-to-One & Group Conversations** with real-time Firestore `onSnapshot` listeners
- **Rich Markdown & Code Formatting**: Supports `**bold**`, `*italic*`, `~~strikethrough~~`, `` `inline code` ``, and fenced ` ```code blocks``` `
- **Image & File Sharing**: Upload images (with client-side optimization and fullscreen zoomable lightbox) and documents/files with download support
- **Interactive Message Actions**:
  - **Emoji Reactions** (quick reaction bar + full categorized emoji picker)
  - **Reply to Messages** with quoted context preview
  - **Edit & Delete Messages** with `(edited)` indicator and real-time sync
  - **Star / Bookmark Messages** and filter starred messages per conversation
  - **Read Receipts** (single check for delivered, glowing double checkmarks for read)
  - **Live Typing Indicators** (`typing...` in sidebar and animated dots in chat stream)
  - **In-Chat & Sidebar Search** with real-time keyword highlighting

### Contacts, Friends & Presence
- **User Discovery & Search** by display name, `@username`, email, or bio
- **Friend Request System**: Send, accept, decline, or cancel friend requests in real time
- **Online Friends Carousel** in the sidebar and dedicated **Contacts & Friends Directory**
- **Block & Unblock Users** with immediate enforcement in chat composer and security rules

### Customization, Privacy & Notifications
- **Appearance Settings**: Toggle between **Premium Dark** and **Daylight Crisp** themes, 6 **Brand Accent Colors**, and 6 **Chat Background Wallpapers**
- **Privacy Controls**: Configure online status visibility, last-seen timestamp visibility, read receipts, and blocked accounts
- **Notification Controls**: Web Push / Desktop Notifications, synthesized Web Audio API message chimes, and message preview toggles

---

## 2. Project Structure

```text
MD-Chat-Pro/
├── public/
│   ├── favicon.svg
│   ├── firebase-messaging-sw.js
│   ├── manifest.json
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── Avatar.js
│   │   ├── CallModal.js
│   │   ├── ChatWindow.js
│   │   ├── CreateGroupModal.js
│   │   ├── EmojiPicker.js
│   │   ├── EmptyState.js
│   │   ├── FriendsDirectory.js
│   │   ├── ImageLightbox.js
│   │   ├── LoadingScreen.js
│   │   ├── MessageBubble.js
│   │   ├── MessageInput.js
│   │   ├── Sidebar.js
│   │   └── UserInfoPanel.js
│   ├── context/
│   │   ├── AuthContext.js
│   │   ├── ChatContext.js
│   │   ├── ThemeContext.js
│   │   └── ToastContext.js
│   ├── firebase/
│   │   └── config.js
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useChat.js
│   │   ├── useDebounce.js
│   │   └── useResponsive.js
│   ├── layouts/
│   │   ├── AuthLayout.js
│   │   └── MainLayout.js
│   ├── pages/
│   │   ├── AuthPage.js
│   │   ├── ChatPage.js
│   │   ├── ProfilePage.js
│   │   └── SettingsPage.js
│   ├── services/
│   │   ├── authService.js
│   │   ├── chatService.js
│   │   ├── friendService.js
│   │   ├── localStore.js
│   │   ├── notificationService.js
│   │   ├── presenceService.js
│   │   ├── storageService.js
│   │   └── userService.js
│   ├── styles/
│   │   ├── auth.css
│   │   ├── chat.css
│   │   ├── global.css
│   │   └── variables.css
│   ├── utils/
│   │   ├── constants.js
│   │   ├── formatters.js
│   │   └── security.js
│   ├── App.js
│   └── index.js
├── .env.example
├── firebase.json
├── firestore.indexes.json
├── firestore.rules
├── storage.rules
├── vercel.json
├── vite.config.js
├── package.json
└── README.md
```

---

## 3. Documented Assumptions & Resilient Architecture

1. **Authenticated Views & Live Reference**:
   - Because authenticated interior screens (active chat rooms, user info drawers, settings tabs, and friend request queues) sit behind user login on the live deployment, sensible, full-featured equivalents were engineered to match the **MD Chat Pro** identity—including inline Markdown & code block rendering (`parseMessageTokens`), split-panel glassmorphic authentication, a 3-column desktop messaging workspace, and a 5-tab mobile bottom navigation bar.
2. **Hybrid Firebase + Real-Time Local Persistence**:
   - The service layer (`src/services/*`) connects directly to the configured Firebase project (`md-chat-87f45`) via environment variables.
   - To guarantee zero downtime if Firestore/Storage rules or specific auth providers have not yet been published in the Firebase Console, the service layer also includes an automatic real-time fallback store (`localStore.js` with `BroadcastChannel` multi-tab synchronization) and pre-seeded demo contacts.

---

## 4. Getting Started

### Prerequisites
- **Node.js** v18+ and **npm**

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and provide your Firebase web app configuration:
```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### 3. Run Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### 4. Build for Production
```bash
npm run build
```
The optimized production bundle is generated in the `dist/` directory.

---

## 5. Deploying Firebase Rules & Vercel Hosting

### Deploy Firestore & Storage Security Rules
```bash
npm install -g firebase-tools
firebase login
firebase use your-project-id
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

### Deploy to Vercel
1. Push this repository to GitHub / GitLab / Bitbucket or run `npx vercel`.
2. In the **Vercel Dashboard → Project Settings → Environment Variables**, add the `VITE_FIREBASE_*` keys from `.env`.
3. Vercel automatically detects `vercel.json`, runs `npm run build`, and serves `dist/` with SPA routing and security headers.
