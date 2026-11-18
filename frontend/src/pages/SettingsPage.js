import React, { useState, useRef } from 'react';
import {
  User,
  Shield,
  Palette,
  Lock,
  Camera,
  Save,
  Mail,
  AtSign,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Sun,
  Moon,
  Check,
  Unlock,
  KeyRound,
  LogOut,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import { CHAT_BACKGROUNDS, USER_STATUS_PRESETS } from '../utils/constants';

export default function SettingsPage({ initialTab = 'profile' }) {
  const {
    currentUser,
    updateProfile,
    uploadAvatar,
    sendVerificationEmail,
    changePassword,
    logout,
  } = useAuth();
  const { blockedUsersList, unblockUser } = useChat();
  const {
    appearanceMode,
    setAppearanceMode,
    theme,
    setTheme,
    wallpaperId,
    setWallpaperId,
    customColors,
    setCustomColors,
  } = useTheme();
  const toast = useToast();

  // 4 Exact Sections: 'profile' | 'privacy' | 'appearance' | 'password'
  const [activeTab, setActiveTab] = useState(initialTab);

  // 1. Edit Profile & Presence state
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [statusText, setStatusText] = useState(
    currentUser?.statusText || '🟢 Available'
  );
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [online, setOnline] = useState(currentUser?.online !== false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState(0);
  const fileInputRef = useRef(null);

  // 2. Privacy & Visibility state
  const [privacy, setPrivacy] = useState(() => ({
    showOnlineStatus: currentUser?.privacySettings?.showOnlineStatus !== false,
    showLastSeen: currentUser?.privacySettings?.showLastSeen !== false,
    showReadReceipts: currentUser?.privacySettings?.showReadReceipts !== false,
    allowFriendRequests:
      currentUser?.privacySettings?.allowFriendRequests !== false,
  }));

  // 4. Change Password state
  const [newPassword, setNewPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatarProgress(15);
      await uploadAvatar(file, (pct) => setAvatarProgress(pct));
      toast.success('Profile picture updated!');
    } catch (err) {
      toast.error(err.message || 'Failed to upload profile picture.');
    } finally {
      setAvatarProgress(0);
      e.target.value = '';
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!displayName.trim() || displayName.trim().length < 2) {
      toast.warning('Display name must be at least 2 characters.');
      return;
    }
    try {
      setSavingProfile(true);
      await updateProfile({
        displayName: displayName.trim(),
        username: username.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''),
        statusText: statusText.trim(),
        bio: bio.trim(),
        online,
      });
      toast.success('Profile & presence saved!');
    } catch (err) {
      toast.error(err.message || 'Could not update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleVerifyEmail = async () => {
    try {
      const res = await sendVerificationEmail();
      if (res.verified) {
        toast.success('Your email address is now verified!');
      } else {
        toast.info('Verification email sent! Please check your inbox.');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to send verification email.');
    }
  };

  const handleTogglePrivacy = async (key) => {
    const updated = { ...privacy, [key]: !privacy[key] };
    setPrivacy(updated);
    try {
      await updateProfile({ privacySettings: updated });
      toast.success('Privacy & visibility preference updated');
    } catch (err) {
      toast.error(err.message || 'Failed to save privacy setting.');
    }
  };

  const handleCustomColorChange = (key, value) => {
    setCustomColors((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleResetCustomColors = () => {
    setCustomColors({
      accent: '#00a884',
      ownBubble: '#005c4b',
      incomingBubble: '#202c33',
      chatBg: '#0b141a',
      showDoodle: true,
    });
    toast.info('Custom colors reset to WhatsApp defaults');
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.warning('Password must be at least 6 characters long.');
      return;
    }
    try {
      setChangingPass(true);
      await changePassword(newPassword);
      setNewPassword('');
      toast.success('Password updated successfully!');
    } catch (err) {
      toast.error(err.message || 'Could not update password.');
    } finally {
      setChangingPass(false);
    }
  };

  return (
    <div className="page-scroll-container">
      <div className="settings-layout">
        {/* Left Settings Sidebar */}
        <div className="settings-nav-card">
          <h2 className="settings-main-title">Settings</h2>
          <p className="settings-main-sub">
            Manage your profile, privacy, appearance, and password
          </p>

          <div className="settings-nav-list">
            <button
              type="button"
              className={`settings-nav-btn ${
                activeTab === 'profile' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('profile')}
            >
              <User size={18} />
              <span>Edit Profile &amp; Presence</span>
            </button>

            <button
              type="button"
              className={`settings-nav-btn ${
                activeTab === 'privacy' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('privacy')}
            >
              <Shield size={18} />
              <span>Privacy &amp; Visibility</span>
            </button>

            <button
              type="button"
              className={`settings-nav-btn ${
                activeTab === 'appearance' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('appearance')}
            >
              <Palette size={18} />
              <span>Appearance &amp; Chat Customization</span>
            </button>

            <button
              type="button"
              className={`settings-nav-btn ${
                activeTab === 'password' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('password')}
            >
              <Lock size={18} />
              <span>Change Password</span>
            </button>

            <button
              type="button"
              className="settings-nav-btn"
              style={{ color: 'var(--color-danger)', marginTop: '8px' }}
              onClick={() => logout()}
            >
              <LogOut size={18} />
              <span>Log Out</span>
            </button>
          </div>
        </div>

        {/* Right Settings Detail Panel */}
        <div className="settings-content-card">
          {/* 1. EDIT PROFILE & PRESENCE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="settings-section">
              <div className="settings-section-head">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div>
                    <h3>Edit Profile &amp; Presence</h3>
                    <p>Update your photo, display name, bio, and online status</p>
                  </div>
                  <div className="online-toggle-pill" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      Presence:
                    </span>
                    <button
                      type="button"
                      className={`btn btn-sm ${online ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setOnline((v) => !v)}
                    >
                      <span>{online ? '🟢 Online' : '⚪ Offline'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Avatar Upload Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                  marginBottom: '22px',
                  padding: '16px',
                  borderRadius: '12px',
                  background: 'var(--bg-elevated)',
                }}
              >
                <div style={{ position: 'relative' }}>
                  <Avatar
                    src={currentUser?.photoURL}
                    name={currentUser?.displayName}
                    size="xl"
                    online={online}
                    showStatus
                  />
                  <button
                    type="button"
                    className="avatar-camera-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Change profile photo"
                  >
                    <Camera size={16} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                    onChange={handleAvatarChange}
                    hidden
                  />
                </div>

                <div>
                  <h4 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>
                    {currentUser?.displayName}
                  </h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    @{currentUser?.username || 'user'} • {currentUser?.email}
                  </p>
                  {avatarProgress > 0 && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--accent-primary)' }}>
                      Uploading... {avatarProgress}%
                    </span>
                  )}
                  <div style={{ marginTop: '4px' }}>
                    {currentUser?.emailVerified ? (
                      <span className="verified-pill">
                        <CheckCircle2 size={15} />
                        <span>Email Verified</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleVerifyEmail}
                      >
                        <AlertCircle size={14} />
                        <span>Verify Email</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">
                    <User size={14} />
                    <span>Display Name</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={50}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <AtSign size={14} />
                    <span>Username</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    maxLength={35}
                    placeholder="username"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  <Mail size={14} />
                  <span>Email Address</span>
                </label>
                <input
                  type="email"
                  className="form-input"
                  value={currentUser?.email || ''}
                  disabled
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  <Sparkles size={14} />
                  <span>Custom Status</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value)}
                  maxLength={60}
                  placeholder="What are you up to?"
                />
                <div className="status-presets-wrap">
                  {USER_STATUS_PRESETS.map((preset) => {
                    const full = `${preset.emoji} ${preset.text}`;
                    return (
                      <button
                        key={full}
                        type="button"
                        className={`status-preset-chip ${
                          statusText === full ? 'active' : ''
                        }`}
                        onClick={() => setStatusText(full)}
                      >
                        {full}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  <FileText size={14} />
                  <span>Bio / About Me ({bio.length}/220)</span>
                </label>
                <textarea
                  rows={3}
                  className="form-input"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={220}
                  placeholder="Tell your friends a bit about yourself..."
                />
              </div>

              <div className="profile-form-footer">
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Your profile updates are visible to your contacts immediately.
                </span>
                <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                  <Save size={16} />
                  <span>{savingProfile ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          )}

          {/* 2. PRIVACY & VISIBILITY */}
          {activeTab === 'privacy' && (
            <div className="settings-section">
              <div className="settings-section-head">
                <h3>Privacy &amp; Visibility</h3>
                <p>Control who can see your online status, last seen time, and read receipts</p>
              </div>

              <div className="toggle-list">
                <div className="toggle-row">
                  <div>
                    <strong>Show Online Status</strong>
                    <p>Allow contacts to see when you are online</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={privacy.showOnlineStatus}
                    onChange={() => handleTogglePrivacy('showOnlineStatus')}
                  />
                </div>

                <div className="toggle-row">
                  <div>
                    <strong>Show Last Seen Timestamp</strong>
                    <p>Display when you were last active in conversations</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={privacy.showLastSeen}
                    onChange={() => handleTogglePrivacy('showLastSeen')}
                  />
                </div>

                <div className="toggle-row">
                  <div>
                    <strong>Read Receipts (Blue Double Checkmarks)</strong>
                    <p>Let senders see when you have read their messages</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={privacy.showReadReceipts}
                    onChange={() => handleTogglePrivacy('showReadReceipts')}
                  />
                </div>

                <div className="toggle-row">
                  <div>
                    <strong>Allow Friend Requests</strong>
                    <p>Allow other users to connect with you</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={privacy.allowFriendRequests}
                    onChange={() => handleTogglePrivacy('allowFriendRequests')}
                  />
                </div>
              </div>

              <div className="settings-block">
                <h4>Blocked Friends ({blockedUsersList.length})</h4>
                {blockedUsersList.length > 0 ? (
                  <div className="toggle-list">
                    {blockedUsersList.map((u) => (
                      <div key={u.uid} className="toggle-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Avatar src={u.photoURL} name={u.displayName} size="sm" />
                          <div>
                            <strong>{u.displayName}</strong>
                            <p>@{u.username || 'user'}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => unblockUser(u.uid)}
                        >
                          <Unlock size={14} />
                          <span>Unblock</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                    You have no blocked friends.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 3. APPEARANCE & CHAT CUSTOMIZATION (Normal, Black & White, Custom) */}
          {activeTab === 'appearance' && (
            <div className="settings-section">
              <div className="settings-section-head">
                <h3>Appearance &amp; Chat Customization</h3>
                <p>Choose between Normal WhatsApp, Black &amp; White monochrome, or Custom theme</p>
              </div>

              {/* 3 Theme Modes: Normal, Black & White, Custom */}
              <div className="settings-block">
                <h4>Appearance Style</h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
                    gap: '12px',
                  }}
                >
                  <button
                    type="button"
                    className={`theme-mode-card ${
                      appearanceMode === 'normal' ? 'active' : ''
                    }`}
                    onClick={() => setAppearanceMode('normal')}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #25d366, #005c4b)',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <strong>Normal</strong>
                      <span>Official WhatsApp Colors &amp; Doodle</span>
                    </div>
                    {appearanceMode === 'normal' && <Check size={16} />}
                  </button>

                  <button
                    type="button"
                    className={`theme-mode-card ${
                      appearanceMode === 'bw' ? 'active' : ''
                    }`}
                    onClick={() => setAppearanceMode('bw')}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #ffffff 50%, #09090b 50%)',
                        border: '1px solid var(--border-strong)',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <strong>Black &amp; White</strong>
                      <span>High-contrast monochrome theme</span>
                    </div>
                    {appearanceMode === 'bw' && <Check size={16} />}
                  </button>

                  <button
                    type="button"
                    className={`theme-mode-card ${
                      appearanceMode === 'custom' ? 'active' : ''
                    }`}
                    onClick={() => setAppearanceMode('custom')}
                  >
                    <Palette size={22} />
                    <div style={{ flex: 1 }}>
                      <strong>Custom</strong>
                      <span>Personalize colors &amp; chat bubbles</span>
                    </div>
                    {appearanceMode === 'custom' && <Check size={16} />}
                  </button>
                </div>
              </div>

              {/* Dark / Light Mode Toggle */}
              <div className="settings-block">
                <h4>Base Brightness Mode</h4>
                <div className="theme-mode-cards">
                  <button
                    type="button"
                    className={`theme-mode-card ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => setTheme('dark')}
                  >
                    <Moon size={20} />
                    <div style={{ flex: 1 }}>
                      <strong>Dark Mode</strong>
                      <span>Deep comfortable night interface</span>
                    </div>
                    {theme === 'dark' && <Check size={16} />}
                  </button>

                  <button
                    type="button"
                    className={`theme-mode-card ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => setTheme('light')}
                  >
                    <Sun size={20} />
                    <div style={{ flex: 1 }}>
                      <strong>Light Mode</strong>
                      <span>Classic daylight interface</span>
                    </div>
                    {theme === 'light' && <Check size={16} />}
                  </button>
                </div>
              </div>

              {/* Custom Mode Color Pickers */}
              {appearanceMode === 'custom' && (
                <div
                  className="settings-block"
                  style={{
                    padding: '18px',
                    borderRadius: '12px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-strong)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '14px',
                    }}
                  >
                    <h4 style={{ marginBottom: 0 }}>Custom Color Palette</h4>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleResetCustomColors}
                    >
                      <RotateCcw size={14} />
                      <span>Reset Default</span>
                    </button>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Accent Color</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="color"
                          value={customColors.accent}
                          onChange={(e) =>
                            handleCustomColorChange('accent', e.target.value)
                          }
                          style={{
                            width: 44,
                            height: 38,
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: 'transparent',
                          }}
                        />
                        <input
                          type="text"
                          className="form-input form-input-sm"
                          value={customColors.accent}
                          onChange={(e) =>
                            handleCustomColorChange('accent', e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Chat Background Color</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="color"
                          value={customColors.chatBg}
                          onChange={(e) =>
                            handleCustomColorChange('chatBg', e.target.value)
                          }
                          style={{
                            width: 44,
                            height: 38,
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: 'transparent',
                          }}
                        />
                        <input
                          type="text"
                          className="form-input form-input-sm"
                          value={customColors.chatBg}
                          onChange={(e) =>
                            handleCustomColorChange('chatBg', e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Outgoing Message Bubble</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="color"
                          value={customColors.ownBubble}
                          onChange={(e) =>
                            handleCustomColorChange('ownBubble', e.target.value)
                          }
                          style={{
                            width: 44,
                            height: 38,
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: 'transparent',
                          }}
                        />
                        <input
                          type="text"
                          className="form-input form-input-sm"
                          value={customColors.ownBubble}
                          onChange={(e) =>
                            handleCustomColorChange('ownBubble', e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Incoming Message Bubble</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="color"
                          value={customColors.incomingBubble}
                          onChange={(e) =>
                            handleCustomColorChange('incomingBubble', e.target.value)
                          }
                          style={{
                            width: 44,
                            height: 38,
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: 'transparent',
                          }}
                        />
                        <input
                          type="text"
                          className="form-input form-input-sm"
                          value={customColors.incomingBubble}
                          onChange={(e) =>
                            handleCustomColorChange('incomingBubble', e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="toggle-row" style={{ marginTop: '8px' }}>
                    <div>
                      <strong>WhatsApp Doodle Pattern Overlay</strong>
                      <p>Show repeating doodle pattern over custom background color</p>
                    </div>
                    <input
                      type="checkbox"
                      className="toggle-switch"
                      checked={customColors.showDoodle !== false}
                      onChange={() =>
                        handleCustomColorChange(
                          'showDoodle',
                          customColors.showDoodle === false
                        )
                      }
                    />
                  </div>
                </div>
              )}

              {/* Chat Wallpaper Presets (for Normal Mode) */}
              {appearanceMode === 'normal' && (
                <div className="settings-block">
                  <h4>Chat Background Wallpaper</h4>
                  <div className="wallpaper-cards-grid">
                    {CHAT_BACKGROUNDS.map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        className={`wallpaper-card ${
                          wallpaperId === bg.id ? 'active' : ''
                        }`}
                        onClick={() => setWallpaperId(bg.id)}
                      >
                        <div
                          className="wallpaper-card-preview"
                          style={{ background: bg.preview }}
                        />
                        <div className="wallpaper-card-meta">
                          <strong>{bg.name}</strong>
                          <span>{bg.description}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. CHANGE PASSWORD (No Confirm Password & No Firebase details shown) */}
          {activeTab === 'password' && (
            <div className="settings-section">
              <div className="settings-section-head">
                <h3>Change Password</h3>
                <p>Update your account password to keep your conversations secure</p>
              </div>

              <form onSubmit={handlePasswordChange} className="settings-password-form">
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter new password (min. 6 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '20px',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--border-subtle)',
                  }}
                >
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={changingPass}
                  >
                    <KeyRound size={16} />
                    <span>{changingPass ? 'Updating...' : 'Update Password'}</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => logout()}
                  >
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
