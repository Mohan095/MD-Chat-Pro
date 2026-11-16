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
import { auth, db, googleProvider } from '../firebase/config';
import { localStore } from './localStore';
import { sanitizeText, validateEmail } from '../utils/security';

export function isLocalDemoUid() {
  return false;
}

const createDefaultUserProfile = ({
  uid,
  displayName,
  email,
  photoURL = '',
  emailVerified = false,
}) => {
  const cleanName = sanitizeText(displayName || email?.split('@')[0] || 'User', 50);
  const baseUsername = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
  return {
    uid,
    displayName: cleanName,
    username: `${baseUsername}${Math.floor(100 + Math.random() * 899)}`,
    email: (email || '').toLowerCase().trim(),
    photoURL: photoURL || '',
    bio: 'Hey there! I am using MD Chat Pro.',
    statusText: '🟢 Available',
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
 * Formats friendly Firebase Auth error messages.
 */
function formatFirebaseAuthError(error) {
  const code = error?.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please sign in instead.';
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
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled in Firebase Console yet.';
    default:
      return error?.message || 'Authentication failed. Please try again.';
  }
}

/**
 * Registers a real user in Firebase Authentication and creates their Firestore profile.
 */
export async function registerUser({ displayName, email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanName = sanitizeText(displayName, 50);

  if (!validateEmail(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }

  if (!auth) {
    throw new Error('Firebase Authentication is not initialized.');
  }

  try {
    const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    await updateFirebaseAuthProfile(credential.user, { displayName: cleanName });

    try {
      await sendEmailVerification(credential.user);
    } catch {
      // Verification email is best-effort
    }

    const baseProfile = createDefaultUserProfile({
      uid: credential.user.uid,
      displayName: cleanName,
      email: cleanEmail,
      photoURL: credential.user.photoURL || '',
      emailVerified: credential.user.emailVerified,
    });

    // Mirror real user in localStore and save to Firestore
    localStore.upsertUser(baseProfile);

    if (db) {
      try {
        await setDoc(doc(db, 'users', credential.user.uid), {
          ...baseProfile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
        });
      } catch (firestoreErr) {
        console.warn('[authService] Firestore profile write warning:', firestoreErr);
      }
    }

    return { user: credential.user, profile: baseProfile };
  } catch (err) {
    throw new Error(formatFirebaseAuthError(err));
  }
}

/**
 * Signs in a real user with email and password via Firebase Authentication.
 */
export async function loginUser({ email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();

  if (!auth) {
    throw new Error('Firebase Authentication is not initialized.');
  }

  try {
    const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const fbUser = credential.user;

    const fallbackProfile = createDefaultUserProfile({
      uid: fbUser.uid,
      displayName: fbUser.displayName || cleanEmail.split('@')[0],
      email: cleanEmail,
      photoURL: fbUser.photoURL || '',
      emailVerified: fbUser.emailVerified,
    });

    localStore.upsertUser({
      ...fallbackProfile,
      online: true,
      lastSeen: new Date().toISOString(),
    });

    if (db) {
      try {
        const userRef = doc(db, 'users', fbUser.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          await updateDoc(userRef, {
            online: true,
            lastSeen: serverTimestamp(),
            emailVerified: fbUser.emailVerified,
          });
          localStore.upsertUser({ uid: fbUser.uid, ...snap.data(), online: true });
        } else {
          await setDoc(userRef, {
            ...fallbackProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (firestoreErr) {
        console.warn('[authService] Firestore login sync warning:', firestoreErr);
      }
    }

    return fbUser;
  } catch (err) {
    throw new Error(formatFirebaseAuthError(err));
  }
}

/**
 * Signs in with Google OAuth popup via Firebase Authentication.
 */
export async function loginWithGoogle() {
  if (!auth || !googleProvider) {
    throw new Error('Google Sign-In is not initialized.');
  }

  try {
    const credential = await signInWithPopup(auth, googleProvider);
    const fbUser = credential.user;

    const baseProfile = createDefaultUserProfile({
      uid: fbUser.uid,
      displayName: fbUser.displayName || 'User',
      email: fbUser.email || '',
      photoURL: fbUser.photoURL || '',
      emailVerified: true,
    });

    localStore.upsertUser(baseProfile);

    if (db) {
      try {
        const userRef = doc(db, 'users', fbUser.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          await setDoc(userRef, {
            ...baseProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(userRef, {
            online: true,
            lastSeen: serverTimestamp(),
          });
          localStore.upsertUser({ uid: fbUser.uid, ...snap.data(), online: true });
        }
      } catch (firestoreErr) {
        console.warn('[authService] Google profile Firestore sync warning:', firestoreErr);
      }
    }

    return fbUser;
  } catch (err) {
    throw new Error(formatFirebaseAuthError(err));
  }
}

/**
 * Signs out the current user immediately and marks them offline.
 */
export async function logoutUser(currentUid) {
  const uid = currentUid || auth?.currentUser?.uid;

  if (uid) {
    const users = localStore.getUsers();
    const idx = users.findIndex((u) => u.uid === uid);
    if (idx !== -1) {
      users[idx].online = false;
      users[idx].lastSeen = new Date().toISOString();
      localStore.saveUsers(users);
    }

    // Non-blocking Firestore offline status update so signOut is never delayed
    if (db) {
      updateDoc(doc(db, 'users', uid), {
        online: false,
        lastSeen: serverTimestamp(),
      }).catch(() => {});
    }
  }

  if (auth) {
    await signOut(auth);
  }
}

/**
 * Sends a password reset email via Firebase Auth.
 */
export async function resetUserPassword(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!validateEmail(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }

  if (!auth) {
    throw new Error('Firebase Authentication is not initialized.');
  }

  try {
    await sendPasswordResetEmail(auth, cleanEmail);
    return { sent: true, email: cleanEmail };
  } catch (err) {
    throw new Error(formatFirebaseAuthError(err));
  }
}

/**
 * Sends email verification link to the current Firebase user.
 */
export async function triggerEmailVerification() {
  if (!auth?.currentUser) {
    throw new Error('No active user session.');
  }
  await sendEmailVerification(auth.currentUser);
  return { verified: auth.currentUser.emailVerified, sent: true };
}

/**
 * Updates user password in Firebase Auth.
 */
export async function changeUserPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }

  if (!auth?.currentUser) {
    throw new Error('You must be signed in to change your password.');
  }

  try {
    await updateFirebasePassword(auth.currentUser, newPassword);
    return true;
  } catch (err) {
    if (err?.code === 'auth/requires-recent-login') {
      throw new Error('For security, please sign out and sign back in before changing your password.');
    }
    throw new Error(formatFirebaseAuthError(err));
  }
}

/**
 * Subscribes to real-time Firebase Authentication state changes.
 */
export function subscribeToAuthChanges(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, (firebaseUser) => {
    if (firebaseUser) {
      // Ensure the authenticated user exists in local mirror as well
      const existing = localStore.getUsers().find((u) => u.uid === firebaseUser.uid);
      if (!existing) {
        localStore.upsertUser(
          createDefaultUserProfile({
            uid: firebaseUser.uid,
            displayName:
              firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            email: firebaseUser.email || '',
            photoURL: firebaseUser.photoURL || '',
            emailVerified: firebaseUser.emailVerified,
          })
        );
      }
    }
    callback(firebaseUser || null);
  });
}
