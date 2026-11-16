import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  registerUser,
  loginUser,
  loginWithGoogle,
  loginAsDemoUser,
  logoutUser,
  resetUserPassword,
  triggerEmailVerification,
  changeUserPassword,
  subscribeToAuthChanges,
} from '../services/authService';
import { subscribeToUserProfile, updateUserProfile } from '../services/userService';
import { initPresenceTracking } from '../services/presenceService';
import { uploadProfileAvatar } from '../services/storageService';
import { isFirebaseConfigured } from '../firebase/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authUser, setAuthUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let profileUnsub = null;
    let presenceCleanup = null;

    const authUnsub = subscribeToAuthChanges((currentUser) => {
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }
      if (presenceCleanup) {
        presenceCleanup();
        presenceCleanup = null;
      }

      if (!currentUser) {
        setAuthUser(null);
        setUserProfile(null);
        setLoading(false);
        return;
      }

      setAuthUser(currentUser);
      presenceCleanup = initPresenceTracking(currentUser.uid);

      profileUnsub = subscribeToUserProfile(currentUser.uid, (profile) => {
        if (profile) {
          setUserProfile(profile);
        } else {
          setUserProfile({
            uid: currentUser.uid,
            displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
            email: currentUser.email || '',
            photoURL: currentUser.photoURL || '',
            online: true,
            emailVerified: Boolean(currentUser.emailVerified),
            friends: [],
            blockedUsers: [],
          });
        }
        setLoading(false);
      });
    });

    return () => {
      authUnsub();
      if (profileUnsub) profileUnsub();
      if (presenceCleanup) presenceCleanup();
    };
  }, []);

  const handleRegister = useCallback(async (payload) => {
    const res = await registerUser(payload);
    return res;
  }, []);

  const handleLogin = useCallback(async (payload) => {
    const res = await loginUser(payload);
    return res;
  }, []);

  const handleGoogleLogin = useCallback(async () => {
    const res = await loginWithGoogle();
    return res;
  }, []);

  const handleDemoLogin = useCallback(async (demoUid) => {
    const res = await loginAsDemoUser(demoUid);
    return res;
  }, []);

  const handleLogout = useCallback(async () => {
    await logoutUser(authUser?.uid);
  }, [authUser]);

  const handleUpdateProfile = useCallback(
    async (updates) => {
      if (!authUser?.uid) throw new Error('Not authenticated.');
      return updateUserProfile(authUser.uid, updates);
    },
    [authUser]
  );

  const handleUploadAvatar = useCallback(
    async (file, onProgress) => {
      if (!authUser?.uid) throw new Error('Not authenticated.');
      const url = await uploadProfileAvatar(authUser.uid, file, onProgress);
      await updateUserProfile(authUser.uid, { photoURL: url });
      return url;
    },
    [authUser]
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser: userProfile || authUser,
        authUser,
        userProfile,
        loading,
        isFirebaseConfigured,
        register: handleRegister,
        login: handleLogin,
        loginWithGoogle: handleGoogleLogin,
        loginAsDemoUser: handleDemoLogin,
        logout: handleLogout,
        resetPassword: resetUserPassword,
        sendVerificationEmail: triggerEmailVerification,
        changePassword: changeUserPassword,
        updateProfile: handleUpdateProfile,
        uploadAvatar: handleUploadAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return ctx;
}
