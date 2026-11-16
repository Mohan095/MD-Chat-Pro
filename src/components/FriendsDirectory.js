import React, { useState, useMemo } from 'react';
import {
  Search,
  MessageSquare,
  Users,
  Ban,
  Unlock,
  Globe,
} from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { useAuth } from '../hooks/useAuth';
import Avatar from './Avatar';
import { formatPresenceStatus } from '../utils/formatters';

export default function FriendsDirectory({ onSelectChat }) {
  const { currentUser } = useAuth();
  const {
    allUsers,
    friendsList,
    blockedUsersList,
    openDirectChat,
    blockUser,
    unblockUser,
  } = useChat();

  // Only 2 main views as requested: 'all-friends' and 'online' (all website users: online & offline)
  const [activeTab, setActiveTab] = useState('all-friends'); // 'all-friends' | 'online'
  const [friendFilter, setFriendFilter] = useState('all'); // 'all' | 'online' | 'offline' | 'blocked'
  const [searchTerm, setSearchTerm] = useState('');

  const blockedUids = useMemo(() => {
    return new Set(currentUser?.blockedUsers || []);
  }, [currentUser?.blockedUsers]);

  // All Friends combined list: Online friends, Offline friends, and Blocked friends
  const allFriendsCombined = useMemo(() => {
    const map = new Map();

    friendsList.forEach((f) => {
      const isBlocked = blockedUids.has(f.uid);
      const isOnline =
        !isBlocked &&
        Boolean(f.online) &&
        f.privacySettings?.showOnlineStatus !== false;
      map.set(f.uid, {
        ...f,
        friendState: isBlocked ? 'blocked' : isOnline ? 'online' : 'offline',
      });
    });

    blockedUsersList.forEach((b) => {
      map.set(b.uid, {
        ...b,
        friendState: 'blocked',
      });
    });

    const q = searchTerm.trim().toLowerCase();
    return Array.from(map.values()).filter((u) => {
      if (friendFilter !== 'all' && u.friendState !== friendFilter) {
        return false;
      }
      if (!q) return true;
      return (
        u.displayName?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      );
    });
  }, [friendsList, blockedUsersList, blockedUids, friendFilter, searchTerm]);

  const counts = useMemo(() => {
    let onlineCount = 0;
    let offlineCount = 0;
    friendsList.forEach((f) => {
      if (blockedUids.has(f.uid)) return;
      const isOnline =
        Boolean(f.online) && f.privacySettings?.showOnlineStatus !== false;
      if (isOnline) onlineCount += 1;
      else offlineCount += 1;
    });
    const blockedCount = blockedUsersList.length;
    return {
      total: onlineCount + offlineCount + blockedCount,
      online: onlineCount,
      offline: offlineCount,
      blocked: blockedCount,
    };
  }, [friendsList, blockedUsersList, blockedUids]);

  // Online Tab: Website Login All Users View (both Online and Offline users, view-only)
  const websiteAllUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return [...allUsers]
      .filter((u) => {
        if (!q) return true;
        return (
          u.displayName?.toLowerCase().includes(q) ||
          u.username?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.bio?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aOnline = Boolean(a.online) ? 1 : 0;
        const bOnline = Boolean(b.online) ? 1 : 0;
        return bOnline - aOnline;
      });
  }, [allUsers, searchTerm]);

  const handleMessageUser = async (user) => {
    if (user.uid === currentUser?.uid) return;
    const chat = await openDirectChat(user);
    if (chat && onSelectChat) {
      onSelectChat(chat.id);
    }
  };

  return (
    <div className="directory-page">
      <div className="directory-header">
        <div>
          <h2 className="directory-title">Contacts &amp; Friends</h2>
          <p className="directory-subtitle">
            View all friends (online, offline &amp; blocked) and all registered website users
          </p>
        </div>

        <div className="directory-search-wrap">
          <Search size={16} className="search-input-icon" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, @username, or email..."
            className="search-input"
          />
        </div>
      </div>

      {/* 2 Main Tabs: All Friends & Online (Website Login All Users View) */}
      <div className="directory-tabs">
        <button
          type="button"
          className={`directory-tab ${activeTab === 'all-friends' ? 'active' : ''}`}
          onClick={() => setActiveTab('all-friends')}
        >
          <Users size={16} />
          <span>All Friends</span>
          <span className="dir-tab-count">{counts.total}</span>
        </button>

        <button
          type="button"
          className={`directory-tab ${activeTab === 'online' ? 'active' : ''}`}
          onClick={() => setActiveTab('online')}
        >
          <Globe size={16} />
          <span>Online (All Website Users)</span>
          <span className="dir-tab-count">{websiteAllUsers.length}</span>
        </button>
      </div>

      {/* Directory Content Area */}
      <div className="directory-body">
        {/* TAB 1: ALL FRIENDS (Online, Offline & Blocked Friends) */}
        {activeTab === 'all-friends' && (
          <>
            <div className="sidebar-filter-tabs" style={{ paddingLeft: 0, marginBottom: '18px' }}>
              <button
                type="button"
                className={`filter-tab ${friendFilter === 'all' ? 'active' : ''}`}
                onClick={() => setFriendFilter('all')}
              >
                All ({counts.total})
              </button>
              <button
                type="button"
                className={`filter-tab ${friendFilter === 'online' ? 'active' : ''}`}
                onClick={() => setFriendFilter('online')}
              >
                🟢 Online ({counts.online})
              </button>
              <button
                type="button"
                className={`filter-tab ${friendFilter === 'offline' ? 'active' : ''}`}
                onClick={() => setFriendFilter('offline')}
              >
                ⚪ Offline ({counts.offline})
              </button>
              <button
                type="button"
                className={`filter-tab ${friendFilter === 'blocked' ? 'active' : ''}`}
                onClick={() => setFriendFilter('blocked')}
              >
                🚫 Blocked ({counts.blocked})
              </button>
            </div>

            <div className="directory-grid">
              {allFriendsCombined.map((friend) => {
                const isBlocked = friend.friendState === 'blocked';
                const isOnline = friend.friendState === 'online';

                return (
                  <div key={friend.uid} className="contact-card">
                    <div className="contact-card-top">
                      <Avatar
                        src={friend.photoURL}
                        name={friend.displayName}
                        size="lg"
                        online={isOnline}
                        showStatus={!isBlocked}
                      />
                      <div className="contact-card-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h4 className="contact-card-name">{friend.displayName}</h4>
                          <span
                            className={`info-presence-badge ${
                              isOnline ? 'online' : 'offline'
                            }`}
                            style={
                              isBlocked
                                ? {
                                    color: 'var(--color-danger)',
                                    background: 'rgba(241, 92, 109, 0.14)',
                                  }
                                : undefined
                            }
                          >
                            {isBlocked
                              ? 'Blocked'
                              : isOnline
                              ? 'Online'
                              : 'Offline'}
                          </span>
                        </div>
                        <span className="contact-card-handle">
                          @{friend.username || 'user'}
                        </span>
                        <span className="contact-card-status">
                          {isBlocked
                            ? 'Blocked friend'
                            : friend.statusText || formatPresenceStatus(friend)}
                        </span>
                      </div>
                    </div>

                    <p className="contact-card-bio">
                      {friend.bio || 'Hey there! I am using MD Chat Pro.'}
                    </p>

                    <div className="contact-card-actions">
                      {!isBlocked && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleMessageUser(friend)}
                        >
                          <MessageSquare size={15} />
                          <span>Message</span>
                        </button>
                      )}

                      {isBlocked ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => unblockUser(friend.uid)}
                        >
                          <Unlock size={15} />
                          <span>Unblock</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => blockUser(friend.uid)}
                          title="Block friend"
                        >
                          <Ban size={15} />
                          <span>Block</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {allFriendsCombined.length === 0 && (
                <div className="directory-empty">
                  <Users size={34} />
                  <h3>No friends found in this filter</h3>
                  <p>Try switching between All, Online, Offline, or Blocked filters.</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: ONLINE (Website Login All Users View — Online & Offline, View Only) */}
        {activeTab === 'online' && (
          <div className="directory-grid">
            {websiteAllUsers.map((user) => {
              const isMe = user.uid === currentUser?.uid;
              const isOnline =
                Boolean(user.online) &&
                user.privacySettings?.showOnlineStatus !== false;

              return (
                <div key={user.uid} className="contact-card">
                  <div className="contact-card-top">
                    <Avatar
                      src={user.photoURL}
                      name={user.displayName}
                      size="lg"
                      online={isOnline}
                      showStatus
                    />
                    <div className="contact-card-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h4 className="contact-card-name">
                          {user.displayName} {isMe ? '(You)' : ''}
                        </h4>
                        <span
                          className={`info-presence-badge ${
                            isOnline ? 'online' : 'offline'
                          }`}
                        >
                          {isOnline ? '🟢 Online' : '⚪ Offline'}
                        </span>
                      </div>
                      <span className="contact-card-handle">
                        @{user.username || 'user'} • {user.email}
                      </span>
                      <span className="contact-card-status">
                        {user.statusText || formatPresenceStatus(user)}
                      </span>
                    </div>
                  </div>

                  <p className="contact-card-bio">
                    {user.bio || 'Hey there! I am using MD Chat Pro.'}
                  </p>
                </div>
              );
            })}

            {websiteAllUsers.length === 0 && (
              <div className="directory-empty">
                <Globe size={34} />
                <h3>No users match your search</h3>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
