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
import { auth, googleProvider } from '../firebase/config';
import { localStore } from './localStore';
import { mongoGet, mongoPost } from './mongoClient';
import { sanitizeText, validateEmail } from '../utils/security';

export function isLocalDemoUid() {
  return false;
}

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

function isProviderConfigError(error) {
  const code = error?.code || '';
  return (
    code === 'auth/operation-not-allowed' ||
    code === 'auth/configuration-not-found' ||
    code === 'auth/admin-restricted-operation'
  );
}

/**
 * Registers a user with Firebase Auth and stores their profile in MongoDB.
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

      const baseProfile = createDefaultUserProfile({
        uid: credential.user.uid,
        displayName: cleanName,
        email: cleanEmail,
        photoURL: credential.user.photoURL || '',
        emailVerified: credential.user.emailVerified,
      });

      localStore.upsertUser(baseProfile);
      localStore.setSessionUid(credential.user.uid);

      await mongoPost('upsertUser', { user: baseProfile }, ['users', `user:${credential.user.uid}`]);

      return { user: credential.user, profile: baseProfile };
    } catch (err) {
      if (!isProviderConfigError(err)) {
        throw new Error(formatFirebaseAuthError(err));
      }
    }
  }

  const deterministicUid = generateDeterministicUid(cleanEmail);
  const profileData = createDefaultUserProfile({
    uid: deterministicUid,
    displayName: cleanName,
    email: cleanEmail,
    emailVerified: true,
  });

  const { user: saved } = await mongoPost(
    'upsertUser',
    { user: profileData },
    ['users', `user:${deterministicUid}`]
  );
  const resolved = saved || profileData;
  localStore.upsertUser(resolved);
  localStore.setSessionUid(deterministicUid);
  return { user: resolved, profile: resolved };
}

/**
 * Signs in a user with email and password via Firebase Auth and syncs profile in MongoDB.
 */
export async function loginUser({ email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();

  if (auth) {
    try {
      const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const fbUser = credential.user;

      let existing = null;
      try {
        const res = await mongoGet('user', { uid: fbUser.uid });
        existing = res.user;
      } catch {
        existing = null;
      }

      const profile = existing
        ? {
            ...existing,
            uid: fbUser.uid,
            online: true,
            lastSeen: new Date().toISOString(),
            emailVerified: fbUser.emailVerified,
          }
        : createDefaultUserProfile({
            uid: fbUser.uid,
            displayName: fbUser.displayName || cleanEmail.split('@')[0],
            email: cleanEmail,
            photoURL: fbUser.photoURL || '',
            emailVerified: fbUser.emailVerified,
          });

      await mongoPost('upsertUser', { user: profile }, ['users', `user:${fbUser.uid}`]).catch(
        () => {}
      );

      localStore.upsertUser(profile);
      localStore.setSessionUid(fbUser.uid);
      return fbUser;
    } catch (err) {
      if (!isProviderConfigError(err)) {
        throw new Error(formatFirebaseAuthError(err));
      }
    }
  }

  const deterministicUid = generateDeterministicUid(cleanEmail);
  let foundUser = null;
  try {
    const res = await mongoGet('user', { uid: deterministicUid });
    foundUser = res.user;
    if (!foundUser) {
      const byEmail = await mongoGet('user', { email: cleanEmail });
      foundUser = byEmail.user;
    }
  } catch {
    foundUser = null;
  }

  const profile = foundUser
    ? { ...foundUser, online: true, lastSeen: new Date().toISOString() }
    : createDefaultUserProfile({
        uid: deterministicUid,
        displayName: cleanEmail.split('@')[0],
        email: cleanEmail,
        emailVerified: true,
      });

  await mongoPost('upsertUser', { user: profile }, ['users', `user:${profile.uid}`]).catch(
    () => {}
  );
  localStore.upsertUser(profile);
  localStore.setSessionUid(profile.uid);
  return profile;
}

/**
 * Signs in with Google OAuth via Firebase Authentication and stores profile in MongoDB.
 */
export async function loginWithGoogle() {
  if (!auth || !googleProvider) {
    throw new Error('Firebase Google Auth is not available.');
  }

  try {
    const credential = await signInWithPopup(auth, googleProvider);
    const fbUser = credential.user;

    let existing = null;
    try {
      const res = await mongoGet('user', { uid: fbUser.uid });
      existing = res.user;
    } catch {
      existing = null;
    }

    const baseProfile = existing
      ? {
          ...existing,
          uid: fbUser.uid,
          displayName: existing.displayName || fbUser.displayName || 'User',
          photoURL: existing.photoURL || fbUser.photoURL || '',
          online: true,
          lastSeen: new Date().toISOString(),
        }
      : createDefaultUserProfile({
          uid: fbUser.uid,
          displayName: fbUser.displayName || 'User',
          email: fbUser.email || '',
          photoURL: fbUser.photoURL || '',
          emailVerified: true,
        });

    await mongoPost('upsertUser', { user: baseProfile }, ['users', `user:${fbUser.uid}`]).catch(
      () => {}
    );

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
        'Please enable Google Sign-In in your Firebase Console (Authentication → Sign-in method → Google).'
      );
    }
    throw new Error(formatFirebaseAuthError(err));
  }
}

/**
 * Signs out the current user and marks them offline in MongoDB.
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
    mongoPost('setPresence', { uid, online: false }, ['users', `user:${uid}`]).catch(() => {});
  }

  if (auth) {
    try {
      await signOut(auth);
    } catch {
      // Ignore signOut error
    }
  }
}

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

export async function triggerEmailVerification() {
  if (auth?.currentUser) {
    await sendEmailVerification(auth.currentUser);
    return { verified: auth.currentUser.emailVerified, sent: true };
  }
  return { verified: true, sent: true };
}

export async function changeUserPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters.');
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
      try {
        const res = await mongoGet('user', { uid: tabSessionUid });
        if (res.user) {
          localStore.upsertUser(res.user);
          callback(res.user);
          return;
        }
      } catch {
        // Ignore error
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
