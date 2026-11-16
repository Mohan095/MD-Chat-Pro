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
    openDirectChat,
    blockUser,
    unblockUser,
  } = useChat();

  // 2 Main Tabs: 'all-friends' and 'online' (Website Login All Users View - View Only)
  const [activeTab, setActiveTab] = useState('all-friends'); // 'all-friends' | 'online'
  const [friendFilter, setFriendFilter] = useState('all'); // 'all' | 'online' | 'offline' | 'blocked'
  const [searchTerm, setSearchTerm] = useState('');

  const blockedUids = useMemo(() => {
    return new Set(currentUser?.blockedUsers || []);
  }, [currentUser?.blockedUsers]);

  // Real users (excluding current user) categorized into Online, Offline, and Blocked
  const realContacts = useMemo(() => {
    return allUsers
      .filter((u) => u.uid && u.uid !== currentUser?.uid)
      .map((u) => {
        const isBlocked = blockedUids.has(u.uid);
        const isOnline =
          !isBlocked &&
          Boolean(u.online) &&
          u.privacySettings?.showOnlineStatus !== false;
        return {
          ...u,
          friendState: isBlocked ? 'blocked' : isOnline ? 'online' : 'offline',
        };
      });
  }, [allUsers, currentUser?.uid, blockedUids]);

  const filteredFriends = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return realContacts.filter((u) => {
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
  }, [realContacts, friendFilter, searchTerm]);

  const counts = useMemo(() => {
    let onlineCount = 0;
    let offlineCount = 0;
    let blockedCount = 0;
    realContacts.forEach((u) => {
      if (u.friendState === 'blocked') blockedCount += 1;
      else if (u.friendState === 'online') onlineCount += 1;
      else offlineCount += 1;
    });
    return {
      total: realContacts.length,
      online: onlineCount,
      offline: offlineCount,
      blocked: blockedCount,
    };
  }, [realContacts]);

  // Online Tab: Website Login All Users View (Real users only, Online & Offline, View Only)
  const websiteAllUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return [...allUsers]
      .filter((u) => Boolean(u?.uid))
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
    if (!user?.uid || user.uid === currentUser?.uid) return;
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
            All Friends (Online, Offline &amp; Blocked) and Website Login Users
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
          <span>Online</span>
          <span className="dir-tab-count">{websiteAllUsers.length}</span>
        </button>
      </div>

      <div className="directory-body">
        {/* TAB 1: ALL FRIENDS (Online, Offline & Blocked) */}
        {activeTab === 'all-friends' && (
          <>
            <div
              className="sidebar-filter-tabs"
              style={{ paddingLeft: 0, marginBottom: '18px' }}
            >
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
              {filteredFriends.map((friend) => {
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
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <h4 className="contact-card-name">
                            {friend.displayName}
                          </h4>
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
                          @{friend.username || 'user'} • {friend.email}
                        </span>
                        <span className="contact-card-status">
                          {isBlocked
                            ? 'Blocked user'
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
                          title="Block user"
                        >
                          <Ban size={15} />
                          <span>Block</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredFriends.length === 0 && (
                <div className="directory-empty">
                  <Users size={34} />
                  <h3>No friends found</h3>
                  <p>
                    Real users who register on the website will appear here automatically.
                  </p>
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
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
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
                <h3>No registered users found</h3>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
