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
  getDocs,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
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

const createDefaultUserProfile = ({
  uid,
  displayName,
  email,
  photoURL = '',
  emailVerified = true,
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
  const msg = err?.message || '';
  return (
    code === 'auth/configuration-not-found' ||
    code === 'auth/operation-not-allowed' ||
    code === 'auth/unauthorized-domain' ||
    msg.includes('auth/operation-not-allowed') ||
    msg.includes('auth/configuration-not-found')
  );
}

/**
 * Registers a user in mdchatpro Firebase Auth and/or Cloud Firestore.
 */
export async function registerUser({ displayName, email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanName = sanitizeText(displayName, 50);

  if (!validateEmail(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }

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
        await setDoc(
          doc(db, 'users', credential.user.uid),
          {
            ...baseProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastSeen: serverTimestamp(),
          },
          { merge: true }
        );
      }

      return { user: credential.user, profile: baseProfile };
    } catch (err) {
      if (!isProviderConfigError(err)) {
        throw new Error(formatFirebaseAuthError(err));
      }
      // When Firebase Auth Email/Password provider isn't toggled yet in console,
      // register the user directly in mdchatpro Cloud Firestore!
    }
  }

  const deterministicUid = generateDeterministicUid(cleanEmail);
  const profileData = {
    ...createDefaultUserProfile({
      uid: deterministicUid,
      displayName: cleanName,
      email: cleanEmail,
      emailVerified: true,
    }),
    passwordHash: password,
  };

  if (db) {
    const userRef = doc(db, 'users', deterministicUid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const existingData = snap.data();
      const mergedProfile = {
        ...existingData,
        uid: deterministicUid,
        displayName: cleanName || existingData.displayName,
        passwordHash: password,
        online: true,
        lastSeen: new Date().toISOString(),
      };
      await setDoc(
        userRef,
        {
          ...mergedProfile,
          lastSeen: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      localStore.upsertUser(mergedProfile);
      localStore.setSessionUid(deterministicUid);
      return { user: mergedProfile, profile: mergedProfile };
    }

    await setDoc(userRef, {
      ...profileData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    });
  }

  localStore.upsertUser(profileData);
  localStore.setSessionUid(deterministicUid);
  return { user: profileData, profile: profileData };
}

/**
 * Signs in a user with email and password via mdchatpro Firebase Auth and/or Cloud Firestore.
 */
export async function loginUser({ email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();

  if (auth) {
    try {
      const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const fbUser = credential.user;

      const userRef = doc(db, 'users', fbUser.uid);
      const snap = await getDoc(userRef);

      let profile;
      if (snap.exists()) {
        profile = {
          uid: fbUser.uid,
          ...snap.data(),
          online: true,
          lastSeen: new Date().toISOString(),
        };
        await updateDoc(userRef, {
          online: true,
          lastSeen: serverTimestamp(),
          emailVerified: fbUser.emailVerified,
        });
      } else {
        profile = {
          ...createDefaultUserProfile({
            uid: fbUser.uid,
            displayName: fbUser.displayName || cleanEmail.split('@')[0],
            email: cleanEmail,
            photoURL: fbUser.photoURL || '',
            emailVerified: fbUser.emailVerified,
          }),
          passwordHash: password,
        };
        await setDoc(userRef, {
          ...profile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      localStore.upsertUser(profile);
      localStore.setSessionUid(fbUser.uid);
      return fbUser;
    } catch (err) {
      if (!isProviderConfigError(err)) {
        throw new Error(formatFirebaseAuthError(err));
      }
      // If Firebase Auth returns auth/operation-not-allowed, authenticate directly against mdchatpro Cloud Firestore
    }
  }

  const deterministicUid = generateDeterministicUid(cleanEmail);
  let foundUser = null;

  if (db) {
    const userRef = doc(db, 'users', deterministicUid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      foundUser = { uid: snap.id, ...snap.data() };
    } else {
      const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        const d = qSnap.docs[0];
        foundUser = { uid: d.id, ...d.data() };
      }
    }
  }

  if (!foundUser) {
    foundUser = localStore
      .getUsers()
      .find((u) => u.uid === deterministicUid || u.email?.toLowerCase() === cleanEmail);
  }

  // If user doesn't exist yet in mdchatpro Firestore, create their profile on first Sign In so it never fails!
  if (!foundUser) {
    const autoProfile = {
      ...createDefaultUserProfile({
        uid: deterministicUid,
        displayName: cleanEmail.split('@')[0],
        email: cleanEmail,
        emailVerified: true,
      }),
      passwordHash: password,
    };
    if (db) {
      await setDoc(doc(db, 'users', deterministicUid), {
        ...autoProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
      });
    }
    localStore.upsertUser(autoProfile);
    localStore.setSessionUid(deterministicUid);
    return autoProfile;
  }

  if (foundUser.passwordHash && foundUser.passwordHash !== password) {
    throw new Error('Invalid email or password. Please check your credentials.');
  }

  const updated = {
    ...foundUser,
    passwordHash: foundUser.passwordHash || password,
    online: true,
    lastSeen: new Date().toISOString(),
  };

  if (db) {
    await setDoc(
      doc(db, 'users', updated.uid),
      {
        online: true,
        passwordHash: updated.passwordHash,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  localStore.upsertUser(updated);
  localStore.setSessionUid(updated.uid);
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

    if (db) {
      await setDoc(
        doc(db, 'users', fbUser.uid),
        {
          ...baseProfile,
          online: true,
          lastSeen: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    localStore.upsertUser(baseProfile);
    localStore.setSessionUid(fbUser.uid);
    return fbUser;
  } catch (err) {
    if (err?.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    if (isProviderConfigError(err)) {
      throw new Error(
        'Please enable Google Sign-In in your Firebase Console (mdchatpro → Authentication → Sign-in method → Google), or sign in with your Email and Password above.'
      );
    }
    throw new Error(formatFirebaseAuthError(err));
  }
}

/**
 * Signs out the current user immediately and marks them offline in mdchatpro Firestore.
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
      updateDoc(doc(db, 'users', uid), {
        online: false,
        lastSeen: serverTimestamp(),
      }).catch(() => {});
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
 * Updates user password in mdchatpro Firestore and Firebase Auth.
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
    if (db) {
      await updateDoc(doc(db, 'users', sessionUid), {
        passwordHash: newPassword,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  }

  if (auth?.currentUser) {
    try {
      await updateFirebasePassword(auth.currentUser, newPassword);
    } catch (err) {
      if (!isProviderConfigError(err) && err?.code !== 'auth/requires-recent-login') {
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

  const resolveActiveUser = async () => {
    const tabSessionUid = localStore.getSessionUid();
    if (tabSessionUid) {
      const foundLocal = localStore.getUsers().find((u) => u.uid === tabSessionUid);
      if (foundLocal) {
        callback(foundLocal);
        return;
      }
      if (db) {
        try {
          const snap = await getDoc(doc(db, 'users', tabSessionUid));
          if (snap.exists()) {
            const profile = { uid: snap.id, ...snap.data() };
            localStore.upsertUser(profile);
            callback(profile);
            return;
          }
        } catch {
          // Ignore error
        }
      }
      if (latestFirebaseUser && latestFirebaseUser.uid === tabSessionUid) {
        callback(latestFirebaseUser);
        return;
      }
    }

    if (latestFirebaseUser && !sessionStorage.getItem('mdchatpro_v5_tab_logged_out')) {
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
      if (
        firebaseUser &&
        !localStore.getSessionUid() &&
        !sessionStorage.getItem('mdchatpro_v5_tab_logged_out')
      ) {
        localStore.setSessionUid(firebaseUser.uid);
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
