import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile as updateFirebaseAuthProfile,
  updatePassword as updateFirebasePassword,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, isFirebaseConfigured } from '../firebase/config';
import { localStore } from './localStore';
import { sanitizeText, validateEmail } from '../utils/security';

const createDefaultUserProfile = ({ uid, displayName, email, photoURL = '', emailVerified = false }) => {
  const cleanName = sanitizeText(displayName || email?.split('@')[0] || 'User', 50);
  const baseUsername = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
  return {
    uid,
    displayName: cleanName,
    username: `${baseUsername}${Math.floor(100 + Math.random() * 899)}`,
    email: (email || '').toLowerCase().trim(),
    photoURL: photoURL || '',
    bio: 'Hey there! I am using MD Chat Pro.',
    statusText: '🟢 Available to chat',
    online: true,
    lastSeen: new Date().toISOString(),
    emailVerified: Boolean(emailVerified),
    friends: [],
    blockedUsers: [],
    privacySettings: {
      showOnlineStatus: true,
      showLastSeen: true,
      showReadReceipts: true,
      allowFriendRequests: true,
    },
    notificationSettings: {
      desktopNotifications: true,
      soundEffects: true,
      messagePreview: true,
      groupNotifications: true,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

/**
 * Checks whether the current active session is a local demo session.
 */
export function isLocalDemoUid(uid) {
  const sessionUid = localStore.getSessionUid();
  return Boolean(sessionUid && (!uid || uid === sessionUid) && sessionUid.startsWith('user_'));
}

/**
 * Formats friendly Firebase Auth error messages.
 */
function formatFirebaseAuthError(error) {
  const code = error?.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Invalid email or password. Please check your credentials.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment and try again.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed before completing authentication.';
    default:
      return error?.message || 'Authentication failed. Please try again.';
  }
}

/**
 * Registers a new user with email, password, and display name.
 */
export async function registerUser({ displayName, email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanName = sanitizeText(displayName, 50);

  if (!validateEmail(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }

  if (isFirebaseConfigured && auth && db) {
    try {
      localStore.setSessionUid(null);
      const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateFirebaseAuthProfile(credential.user, { displayName: cleanName });

      try {
        await sendEmailVerification(credential.user);
      } catch {
        // Verification email is best-effort
      }

      const profileData = {
        ...createDefaultUserProfile({
          uid: credential.user.uid,
          displayName: cleanName,
          email: cleanEmail,
          photoURL: credential.user.photoURL || '',
          emailVerified: credential.user.emailVerified,
        }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
      };

      try {
        await setDoc(doc(db, 'users', credential.user.uid), profileData);
      } catch (firestoreErr) {
        console.warn('[authService] Firestore profile write fallback:', firestoreErr);
        const users = localStore.getUsers();
        users.push({
          ...profileData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        });
        localStore.saveUsers(users);
      }

      return { user: credential.user, profile: profileData };
    } catch (err) {
      throw new Error(formatFirebaseAuthError(err));
    }
  }

  // Local Real-Time Persistence Engine
  const users = localStore.getUsers();
  const existing = users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    throw new Error('An account with this email address already exists.');
  }

  const uid = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newUser = {
    ...createDefaultUserProfile({
      uid,
      displayName: cleanName,
      email: cleanEmail,
      emailVerified: false,
    }),
    passwordHash: password,
    friends: ['user_sarah_chen', 'user_alex_rivera'],
  };

  users.push(newUser);
  localStore.saveUsers(users);
  localStore.setSessionUid(uid);

  return { user: newUser, profile: newUser };
}

/**
 * Signs in an existing user with email and password.
 */
export async function loginUser({ email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();

  // Check if logging in with one of the built-in demo accounts (@mdchat.pro)
  const localUsers = localStore.getUsers();
  const localDemoMatch = localUsers.find(
    (u) => u.email.toLowerCase() === cleanEmail && u.uid.startsWith('user_')
  );
  if (localDemoMatch && (!localDemoMatch.passwordHash || localDemoMatch.passwordHash === password)) {
    return loginAsDemoUser(localDemoMatch.uid);
  }

  if (isFirebaseConfigured && auth && db) {
    try {
      localStore.setSessionUid(null);
      const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      try {
        const userRef = doc(db, 'users', credential.user.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          await updateDoc(userRef, {
            online: true,
            lastSeen: serverTimestamp(),
            emailVerified: credential.user.emailVerified,
          });
        } else {
          const profile = createDefaultUserProfile({
            uid: credential.user.uid,
            displayName: credential.user.displayName || cleanEmail.split('@')[0],
            email: cleanEmail,
            photoURL: credential.user.photoURL || '',
            emailVerified: credential.user.emailVerified,
          });
          await setDoc(userRef, {
            ...profile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (firestoreErr) {
        console.warn('[authService] Firestore login sync warning:', firestoreErr);
      }

      return credential.user;
    } catch (err) {
      throw new Error(formatFirebaseAuthError(err));
    }
  }

  const userIdx = localUsers.findIndex((u) => u.email.toLowerCase() === cleanEmail);
  if (userIdx === -1) {
    throw new Error('No account found with this email address.');
  }

  const target = localUsers[userIdx];
  if (target.passwordHash && target.passwordHash !== password) {
    throw new Error('Invalid email or password. Please try again.');
  }

  localUsers[userIdx] = {
    ...target,
    online: true,
    lastSeen: new Date().toISOString(),
  };
  localStore.saveUsers(localUsers);
  localStore.setSessionUid(target.uid);
  return localUsers[userIdx];
}

/**
 * Signs in with Google OAuth popup.
 */
export async function loginWithGoogle() {
  if (isFirebaseConfigured && auth && googleProvider && db) {
    try {
      localStore.setSessionUid(null);
      const credential = await signInWithPopup(auth, googleProvider);
      try {
        const userRef = doc(db, 'users', credential.user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          const profile = createDefaultUserProfile({
            uid: credential.user.uid,
            displayName: credential.user.displayName || 'Google User',
            email: credential.user.email || '',
            photoURL: credential.user.photoURL || '',
            emailVerified: true,
          });
          await setDoc(userRef, {
            ...profile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(userRef, {
            online: true,
            lastSeen: serverTimestamp(),
          });
        }
      } catch (firestoreErr) {
        console.warn('[authService] Google profile Firestore sync warning:', firestoreErr);
      }

      return credential.user;
    } catch (err) {
      throw new Error(formatFirebaseAuthError(err));
    }
  }

  return loginAsDemoUser('user_alex_rivera');
}

/**
 * Instant sign-in helper for switching between pre-seeded accounts.
 */
export async function loginAsDemoUser(uid = 'user_alex_rivera') {
  const users = localStore.getUsers();
  const idx = users.findIndex((u) => u.uid === uid);
  const chosen = idx !== -1 ? users[idx] : users[0];
  if (!chosen) throw new Error('Demo account not found.');

  chosen.online = true;
  chosen.lastSeen = new Date().toISOString();
  localStore.saveUsers(users);
  localStore.setSessionUid(chosen.uid);
  return chosen;
}

/**
 * Signs out the current user and updates their online status to offline.
 */
export async function logoutUser(currentUid) {
  const localUid = localStore.getSessionUid();
  if (localUid) {
    const users = localStore.getUsers();
    const idx = users.findIndex((u) => u.uid === localUid);
    if (idx !== -1) {
      users[idx].online = false;
      users[idx].lastSeen = new Date().toISOString();
      localStore.saveUsers(users);
    }
    localStore.setSessionUid(null);
  }

  if (isFirebaseConfigured && auth) {
    if (currentUid && db && !currentUid.startsWith('user_')) {
      try {
        await updateDoc(doc(db, 'users', currentUid), {
          online: false,
          lastSeen: serverTimestamp(),
        });
      } catch {
        // Ignore offline update error on sign out
      }
    }
    try {
      await signOut(auth);
    } catch {
      // Ignore signOut error
    }
  }
}

/**
 * Sends a password reset email.
 */
export async function resetUserPassword(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!validateEmail(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }

  if (isFirebaseConfigured && auth && !cleanEmail.endsWith('@mdchat.pro')) {
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      return { sent: true, email: cleanEmail };
    } catch (err) {
      throw new Error(formatFirebaseAuthError(err));
    }
  }

  return { sent: true, email: cleanEmail };
}

/**
 * Sends or re-sends email verification link.
 */
export async function triggerEmailVerification() {
  if (isFirebaseConfigured && auth?.currentUser) {
    await sendEmailVerification(auth.currentUser);
    return { verified: false, sent: true };
  }

  const uid = localStore.getSessionUid();
  if (uid) {
    const users = localStore.getUsers();
    const idx = users.findIndex((u) => u.uid === uid);
    if (idx !== -1) {
      users[idx].emailVerified = true;
      localStore.saveUsers(users);
      return { verified: true, sent: true };
    }
  }
  return { verified: true, sent: true };
}

/**
 * Updates user password.
 */
export async function changeUserPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }

  if (isFirebaseConfigured && auth?.currentUser) {
    await updateFirebasePassword(auth.currentUser, newPassword);
    return true;
  }

  const uid = localStore.getSessionUid();
  if (uid) {
    const users = localStore.getUsers();
    const idx = users.findIndex((u) => u.uid === uid);
    if (idx !== -1) {
      users[idx].passwordHash = newPassword;
      localStore.saveUsers(users);
    }
  }
  return true;
}

/**
 * Subscribes to authentication state changes (supports both Firebase Auth and local demo accounts).
 */
export function subscribeToAuthChanges(callback) {
  let latestFirebaseUser = null;

  const resolveActiveUser = () => {
    const localUid = localStore.getSessionUid();
    if (localUid) {
      const users = localStore.getUsers();
      const found = users.find((u) => u.uid === localUid) || null;
      if (found) {
        callback(found);
        return;
      }
    }
    callback(latestFirebaseUser);
  };

  const unsubLocal = localStore.subscribe(resolveActiveUser);

  if (isFirebaseConfigured && auth) {
    const unsubFirebase = onAuthStateChanged(auth, (firebaseUser) => {
      latestFirebaseUser = firebaseUser;
      resolveActiveUser();
    });
    return () => {
      unsubFirebase();
      unsubLocal();
    };
  }

  resolveActiveUser();
  return unsubLocal;
}
