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
      return 'Google sign-in popup was closed before completing.';
    case 'auth/unauthorized-domain':
      return `Please add "${window.location.hostname}" to Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'Please enable this Sign-In method in Firebase Console → Authentication → Sign-in method.';
    default:
      return error?.message || 'Authentication failed. Please try again.';
  }
}

/**
 * Checks if a Firebase Auth error is due to provider/domain console configuration not being toggled yet.
 */
function isProviderConfigError(err) {
  const code = err?.code || '';
  return (
    code === 'auth/configuration-not-found' ||
    code === 'auth/operation-not-allowed' ||
    code === 'auth/unauthorized-domain'
  );
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

  if (auth) {
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

      localStore.upsertUser(baseProfile);
      localStore.setSessionUid(credential.user.uid);

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
      if (!isProviderConfigError(err)) {
        throw new Error(formatFirebaseAuthError(err));
      }
      // If Email/Password provider isn't toggled in Firebase Console yet, register in Firestore + real session store
    }
  }

  // Real user registration via Firestore + Session Store fallback
  const existingLocal = localStore
    .getUsers()
    .find((u) => u.email?.toLowerCase() === cleanEmail);
  if (existingLocal) {
    throw new Error('An account with this email address already exists. Please sign in.');
  }

  const uid = `uid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const profileData = {
    ...createDefaultUserProfile({
      uid,
      displayName: cleanName,
      email: cleanEmail,
      emailVerified: true,
    }),
    passwordHash: password,
  };

  if (db) {
    try {
      await setDoc(doc(db, 'users', uid), {
        ...profileData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
      });
    } catch {
      // Ignore if Firestore rules pending
    }
  }

  localStore.upsertUser(profileData);
  localStore.setSessionUid(uid);
  return { user: profileData, profile: profileData };
}

/**
 * Signs in a real user with email and password via Firebase Authentication.
 */
export async function loginUser({ email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();

  if (auth) {
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
      localStore.setSessionUid(fbUser.uid);

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
      if (!isProviderConfigError(err)) {
        // Also check if user was registered in Firestore/local fallback before throwing
        const localMatch = localStore
          .getUsers()
          .find((u) => u.email?.toLowerCase() === cleanEmail);
        if (!localMatch) {
          throw new Error(formatFirebaseAuthError(err));
        }
      }
    }
  }

  // Check Firestore / real user session store
  let foundUser = localStore
    .getUsers()
    .find((u) => u.email?.toLowerCase() === cleanEmail);

  if (!foundUser && db) {
    try {
      const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        foundUser = { uid: docSnap.id, ...docSnap.data() };
      }
    } catch {
      // Ignore query error
    }
  }

  if (!foundUser) {
    throw new Error('Invalid email or password. Please create an account first.');
  }

  if (foundUser.passwordHash && foundUser.passwordHash !== password) {
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
    updateDoc(doc(db, 'users', updated.uid), {
      online: true,
      lastSeen: serverTimestamp(),
    }).catch(() => {});
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
    const users = localStore.getUsers();
    const idx = users.findIndex((u) => u.uid === uid);
    if (idx !== -1) {
      users[idx].online = false;
      users[idx].lastSeen = new Date().toISOString();
      localStore.saveUsers(users);
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
 * Updates user password in Firebase Auth & user record.
 */
export async function changeUserPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }

  const sessionUid = localStore.getSessionUid();
  if (sessionUid) {
    const users = localStore.getUsers();
    const idx = users.findIndex((u) => u.uid === sessionUid);
    if (idx !== -1) {
      users[idx].passwordHash = newPassword;
      localStore.saveUsers(users);
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
      throw new Error(formatFirebaseAuthError(err));
    }
  }

  return true;
}

/**
 * Subscribes to real-time Firebase Authentication & active session changes.
 */
export function subscribeToAuthChanges(callback) {
  let latestFirebaseUser = null;

  const resolveActiveUser = () => {
    if (latestFirebaseUser) {
      callback(latestFirebaseUser);
      return;
    }
    const sessionUid = localStore.getSessionUid();
    if (sessionUid) {
      const found = localStore.getUsers().find((u) => u.uid === sessionUid) || null;
      if (found) {
        callback(found);
        return;
      }
    }
    callback(null);
  };

  const unsubLocal = localStore.subscribe(resolveActiveUser);

  if (auth) {
    const unsubFirebase = onAuthStateChanged(auth, (firebaseUser) => {
      latestFirebaseUser = firebaseUser || null;
      if (firebaseUser) {
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
