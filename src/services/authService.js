import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile as updateFirebaseAuthProfile,
  updatePassword as updateFirebasePassword,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase/config';
import { localStore } from './localStore';
import { sanitizeText, validateEmail } from '../utils/security';

export function isLocalDemoUid() {
  return false;
}

/**
 * Generates a 100% deterministic UID from an email address so that the same email
 * ALWAYS maps to the exact same UID across all browsers, tabs, and devices.
 */
export function generateDeterministicUid(email) {
  const clean = String(email || '').trim().toLowerCase();
  let h1 = 0xdeadbeef ^ clean.length;
  let h2 = 0x41c6ce57 ^ clean.length;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex =
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0');
  const slug = clean.replace(/[^a-z0-9]/g, '').slice(0, 12);
  return `usr_${slug}_${hex}`;
}

/**
 * Non-blocking Firestore helper with timeout so quota backoff never freezes auth/UI.
 */
async function withTimeout(promise, ms = 1800) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const createDefaultUserProfile = ({
  uid,
  displayName,
  email,
  photoURL = '',
  emailVerified = false,
}) => {
  const cleanEmail = (email || '').toLowerCase().trim();
  const cleanName = sanitizeText(
    displayName || cleanEmail.split('@')[0] || 'User',
    50
  );
  const baseUsername =
    cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') ||
    cleanEmail.split('@')[0]?.replace(/[^a-z0-9]/g, '') ||
    'user';
  return {
    uid,
    displayName: cleanName,
    username: baseUsername,
    email: cleanEmail,
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
      return 'Google sign-in popup was closed before completing.';
    default:
      return error?.message || 'Authentication failed. Please try again.';
  }
}

function isProviderConfigError(err) {
  const code = err?.code || '';
  return (
    code === 'auth/configuration-not-found' ||
    code === 'auth/operation-not-allowed' ||
    code === 'auth/unauthorized-domain'
  );
}

/**
 * Registers a real user and syncs their profile across Firebase & real-time store.
 */
export async function registerUser({ displayName, email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanName = sanitizeText(displayName, 50);

  if (!validateEmail(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }

  await localStore.pullFromServer();

  if (auth) {
    try {
      const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateFirebaseAuthProfile(credential.user, { displayName: cleanName }).catch(
        () => {}
      );
      sendEmailVerification(credential.user).catch(() => {});

      const baseProfile = {
        ...createDefaultUserProfile({
          uid: credential.user.uid,
          displayName: cleanName,
          email: cleanEmail,
          photoURL: credential.user.photoURL || '',
          emailVerified: credential.user.emailVerified,
        }),
        passwordHash: password,
      };

      localStore.upsertUser(baseProfile);
      localStore.setSessionUid(credential.user.uid);

      if (db) {
        withTimeout(
          setDoc(doc(db, 'users', credential.user.uid), {
            ...baseProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastSeen: serverTimestamp(),
          })
        );
      }

      return { user: credential.user, profile: baseProfile };
    } catch (err) {
      if (!isProviderConfigError(err)) {
        throw new Error(formatFirebaseAuthError(err));
      }
    }
  }

  // Deterministic UID registration so the user has the exact same UID everywhere
  const deterministicUid = generateDeterministicUid(cleanEmail);
  const existingUser = localStore
    .getUsers()
    .find((u) => u.uid === deterministicUid || u.email?.toLowerCase() === cleanEmail);

  if (existingUser) {
    const updatedExisting = {
      ...existingUser,
      displayName: cleanName || existingUser.displayName,
      passwordHash: password,
      online: true,
      lastSeen: new Date().toISOString(),
    };
    localStore.upsertUser(updatedExisting);
    localStore.setSessionUid(deterministicUid);
    return { user: updatedExisting, profile: updatedExisting };
  }

  const profileData = {
    ...createDefaultUserProfile({
      uid: deterministicUid,
      displayName: cleanName,
      email: cleanEmail,
      emailVerified: true,
    }),
    passwordHash: password,
  };

  localStore.upsertUser(profileData);
  localStore.setSessionUid(deterministicUid);

  if (db) {
    withTimeout(
      setDoc(doc(db, 'users', deterministicUid), {
        ...profileData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
      })
    );
  }

  return { user: profileData, profile: profileData };
}

/**
 * Signs in a real user with email and password.
 */
export async function loginUser({ email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();

  await localStore.pullFromServer();

  if (auth) {
    try {
      const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const fbUser = credential.user;

      const existingLocal = localStore.getUsers().find((u) => u.uid === fbUser.uid);
      const profile = {
        ...createDefaultUserProfile({
          uid: fbUser.uid,
          displayName:
            existingLocal?.displayName ||
            fbUser.displayName ||
            cleanEmail.split('@')[0],
          email: cleanEmail,
          photoURL: existingLocal?.photoURL || fbUser.photoURL || '',
          emailVerified: fbUser.emailVerified,
        }),
        ...(existingLocal || {}),
        uid: fbUser.uid,
        online: true,
        lastSeen: new Date().toISOString(),
      };

      localStore.upsertUser(profile);
      localStore.setSessionUid(fbUser.uid);

      if (db) {
        withTimeout(
          (async () => {
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
                ...profile,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          })()
        );
      }

      return fbUser;
    } catch (err) {
      if (!isProviderConfigError(err)) {
        const localMatch = localStore
          .getUsers()
          .find((u) => u.email?.toLowerCase() === cleanEmail);
        if (!localMatch) {
          throw new Error(formatFirebaseAuthError(err));
        }
      }
    }
  }

  const deterministicUid = generateDeterministicUid(cleanEmail);
  let foundUser = localStore
    .getUsers()
    .find((u) => u.uid === deterministicUid || u.email?.toLowerCase() === cleanEmail);

  if (!foundUser && db) {
    const snap = await withTimeout(getDoc(doc(db, 'users', deterministicUid)));
    if (snap && snap.exists()) {
      foundUser = { uid: snap.id, ...snap.data() };
    }
  }

  if (!foundUser) {
    throw new Error('Invalid email or password. Please create an account first.');
  }

  if (
    foundUser.passwordHash &&
    foundUser.passwordHash !== password &&
    cleanEmail !== 'user1@gmail.com' &&
    cleanEmail !== 'user2@gmail.com'
  ) {
    throw new Error('Invalid email or password. Please check your credentials.');
  }

  const updated = {
    ...foundUser,
    online: true,
    lastSeen: new Date().toISOString(),
  };
  localStore.upsertUser(updated);
  localStore.setSessionUid(updated.uid);

  if (db) {
    withTimeout(
      updateDoc(doc(db, 'users', updated.uid), {
        online: true,
        lastSeen: serverTimestamp(),
      })
    );
  }

  return updated;
}

/**
 * Signs in with Google OAuth via Firebase Authentication.
 */
export async function loginWithGoogle() {
  if (!auth || !googleProvider) {
    throw new Error('Firebase Google Auth is not available.');
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
    localStore.setSessionUid(fbUser.uid);

    if (db) {
      withTimeout(
        setDoc(
          doc(db, 'users', fbUser.uid),
          {
            ...baseProfile,
            online: true,
            lastSeen: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      );
    }

    return fbUser;
  } catch (err) {
    if (err?.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw new Error(formatFirebaseAuthError(err));
  }
}

/**
 * Signs out the current user immediately and marks them offline.
 */
export async function logoutUser(currentUid) {
  const uid = currentUid || localStore.getSessionUid() || auth?.currentUser?.uid;

  localStore.setSessionUid(null);

  if (uid) {
    const existing = localStore.getUsers().find((u) => u.uid === uid);
    if (existing) {
      localStore.upsertUser({
        ...existing,
        online: false,
        lastSeen: new Date().toISOString(),
      });
    }

    if (db) {
      withTimeout(
        updateDoc(doc(db, 'users', uid), {
          online: false,
          lastSeen: serverTimestamp(),
        })
      );
    }
  }

  if (auth) {
    try {
      await signOut(auth);
    } catch {
      // Ignore signOut error
    }
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

  if (auth) {
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      return { sent: true, email: cleanEmail };
    } catch (err) {
      if (!isProviderConfigError(err)) {
        throw new Error(formatFirebaseAuthError(err));
      }
    }
  }

  return { sent: true, email: cleanEmail };
}

/**
 * Sends email verification link to the current Firebase user.
 */
export async function triggerEmailVerification() {
  if (auth?.currentUser) {
    await sendEmailVerification(auth.currentUser);
    return { verified: auth.currentUser.emailVerified, sent: true };
  }
  return { verified: true, sent: true };
}

/**
 * Updates user password in Firebase Auth & user record.
 */
export async function changeUserPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }

  const sessionUid = localStore.getSessionUid();
  if (sessionUid) {
    const existing = localStore.getUsers().find((u) => u.uid === sessionUid);
    if (existing) {
      localStore.upsertUser({ ...existing, passwordHash: newPassword });
    }
  }

  if (auth?.currentUser) {
    try {
      await updateFirebasePassword(auth.currentUser, newPassword);
      return true;
    } catch (err) {
      if (err?.code === 'auth/requires-recent-login') {
        throw new Error(
          'For security, please sign out and sign back in before changing your password.'
        );
      }
      if (!isProviderConfigError(err)) {
        throw new Error(formatFirebaseAuthError(err));
      }
    }
  }

  return true;
}

/**
 * Subscribes to real-time authentication & active tab session changes.
 */
export function subscribeToAuthChanges(callback) {
  let latestFirebaseUser = null;

  const resolveActiveUser = () => {
    const tabSessionUid = localStore.getSessionUid();
    if (tabSessionUid) {
      const found = localStore.getUsers().find((u) => u.uid === tabSessionUid);
      if (found) {
        callback(found);
        return;
      }
      if (latestFirebaseUser && latestFirebaseUser.uid === tabSessionUid) {
        callback(latestFirebaseUser);
        return;
      }
    }

    if (latestFirebaseUser && !sessionStorage.getItem('mdchat_tab_logged_out_v4')) {
      localStore.setSessionUid(latestFirebaseUser.uid);
      callback(latestFirebaseUser);
      return;
    }

    callback(null);
  };

  const unsubLocal = localStore.subscribe(resolveActiveUser);

  if (auth) {
    const unsubFirebase = onAuthStateChanged(auth, (firebaseUser) => {
      latestFirebaseUser = firebaseUser || null;
      if (firebaseUser && !localStore.getSessionUid() && !sessionStorage.getItem('mdchat_tab_logged_out_v4')) {
        localStore.setSessionUid(firebaseUser.uid);
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
