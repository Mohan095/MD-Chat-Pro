import { localStore } from './localStore';
import { mongoPost } from './mongoClient';

/**
 * Manages real-time online/offline user presence in MongoDB.
 */
export function initPresenceTracking(uid) {
  if (!uid) return () => {};

  const setOnlineState = async (isOnline) => {
    const users = localStore.getUsers();
    const idx = users.findIndex((u) => u.uid === uid);
    if (idx !== -1 && users[idx].online !== isOnline) {
      users[idx].online = isOnline;
      users[idx].lastSeen = new Date().toISOString();
      localStore.saveUsers(users);
    }
    mongoPost('setPresence', { uid, online: isOnline }, ['users', `user:${uid}`]).catch(
      () => {}
    );
  };

  setOnlineState(true);

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      setOnlineState(true);
    }
  };

  const handleBeforeUnload = () => {
    setOnlineState(false);
  };

  window.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    window.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    setOnlineState(false);
  };
}
