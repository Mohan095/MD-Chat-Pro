import React from 'react';
import {
  MessageSquare,
  Users,
  UserCircle,
  Settings,
  Sun,
  Moon,
  LogOut,
  PlusCircle,
  MessageSquareCode,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { useTheme } from '../context/ThemeContext';
import Avatar from '../components/Avatar';

export default function MainLayout({
  activeNav,
  onSelectNav,
  onOpenNewGroup,
  children,
}) {
  const { currentUser, logout } = useAuth();
  const { totalUnreadCount, friendRequests } = useChat();
  const { theme, toggleTheme } = useTheme();

  const pendingRequestsCount = friendRequests.incoming?.length || 0;

  return (
    <div className="app-workspace">
      {/* Left Desktop Navigation Rail */}
      <nav className="nav-rail" aria-label="Primary Navigation">
        <div className="nav-rail-top">
          <button
            type="button"
            className="nav-brand-logo"
            onClick={() => onSelectNav('chats')}
            title="MD Chat Pro"
          >
            <MessageSquareCode size={22} />
          </button>

          <div className="nav-rail-items">
            <button
              type="button"
              className={`nav-rail-btn ${activeNav === 'chats' ? 'active' : ''}`}
              onClick={() => onSelectNav('chats')}
              title="Conversations"
            >
              <MessageSquare size={20} />
              {totalUnreadCount > 0 && (
                <span className="nav-rail-badge">
                  {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              className={`nav-rail-btn ${activeNav === 'friends' ? 'active' : ''}`}
              onClick={() => onSelectNav('friends')}
              title="Contacts & Friends"
            >
              <Users size={20} />
              {pendingRequestsCount > 0 && (
                <span className="nav-rail-badge">{pendingRequestsCount}</span>
              )}
            </button>

            <button
              type="button"
              className="nav-rail-btn"
              onClick={onOpenNewGroup}
              title="Create Group Chat"
            >
              <PlusCircle size={20} />
            </button>

            <button
              type="button"
              className={`nav-rail-btn ${activeNav === 'profile' ? 'active' : ''}`}
              onClick={() => onSelectNav('profile')}
              title="My Profile"
            >
              <UserCircle size={20} />
            </button>

            <button
              type="button"
              className={`nav-rail-btn ${activeNav === 'settings' ? 'active' : ''}`}
              onClick={() => onSelectNav('settings')}
              title="Settings & Privacy"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>

        <div className="nav-rail-bottom">
          <button
            type="button"
            className="nav-rail-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>

          <div
            className="nav-user-avatar"
            onClick={() => onSelectNav('profile')}
            title={currentUser?.displayName || 'Profile'}
          >
            <Avatar
              src={currentUser?.photoURL}
              name={currentUser?.displayName}
              size="sm"
              online={currentUser?.online !== false}
              showStatus
            />
          </div>

          <button
            type="button"
            className="nav-rail-btn nav-logout-btn"
            onClick={() => logout()}
            title="Sign Out"
          >
            <LogOut size={19} />
          </button>
        </div>
      </nav>

      {/* Main Content Stage */}
      <div className="workspace-stage">{children}</div>

      {/* Responsive Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
        <button
          type="button"
          className={`mobile-nav-item ${activeNav === 'chats' ? 'active' : ''}`}
          onClick={() => onSelectNav('chats')}
        >
          <div className="mobile-nav-icon-wrap">
            <MessageSquare size={20} />
            {totalUnreadCount > 0 && (
              <span className="mobile-nav-badge">{totalUnreadCount}</span>
            )}
          </div>
          <span>Chats</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeNav === 'friends' ? 'active' : ''}`}
          onClick={() => onSelectNav('friends')}
        >
          <div className="mobile-nav-icon-wrap">
            <Users size={20} />
            {pendingRequestsCount > 0 && (
              <span className="mobile-nav-badge">{pendingRequestsCount}</span>
            )}
          </div>
          <span>Friends</span>
        </button>

        <button
          type="button"
          className="mobile-nav-item"
          onClick={onOpenNewGroup}
        >
          <div className="mobile-nav-icon-wrap">
            <PlusCircle size={20} />
          </div>
          <span>New Group</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeNav === 'profile' ? 'active' : ''}`}
          onClick={() => onSelectNav('profile')}
        >
          <div className="mobile-nav-icon-wrap">
            <UserCircle size={20} />
          </div>
          <span>Profile</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeNav === 'settings' ? 'active' : ''}`}
          onClick={() => onSelectNav('settings')}
        >
          <div className="mobile-nav-icon-wrap">
            <Settings size={20} />
          </div>
          <span>Settings</span>
        </button>
      </nav>
    </div>
  );
}
