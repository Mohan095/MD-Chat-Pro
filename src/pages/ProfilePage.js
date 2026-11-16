import React, { useState, useRef } from 'react';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  Save,
  Mail,
  AtSign,
  User,
  FileText,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import { USER_STATUS_PRESETS } from '../utils/constants';

export default function ProfilePage() {
  const { currentUser, updateProfile, uploadAvatar, sendVerificationEmail } = useAuth();
  const { chats, friendsList } = useChat();
  const toast = useToast();

  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [statusText, setStatusText] = useState(
    currentUser?.statusText || '🟢 Available to chat'
  );
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [online, setOnline] = useState(currentUser?.online !== false);
  const [saving, setSaving] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState(0);

  const fileInputRef = useRef(null);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatarProgress(10);
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
      setSaving(true);
      await updateProfile({
        displayName: displayName.trim(),
        username: username.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''),
        statusText: statusText.trim(),
        bio: bio.trim(),
        online,
      });
      toast.success('Profile saved successfully!');
    } catch (err) {
      toast.error(err.message || 'Could not update profile.');
    } finally {
      setSaving(false);
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

  return (
    <div className="page-scroll-container">
      <div className="profile-page-layout">
        {/* Left Profile Identity Card */}
        <div className="profile-overview-card">
          <div className="profile-banner-gradient" />

          <div className="profile-avatar-upload-box">
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
              title="Upload profile picture"
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

          {avatarProgress > 0 && (
            <div className="upload-progress-pill">
              Uploading photo... {avatarProgress}%
            </div>
          )}

          <h2 className="profile-overview-name">{currentUser?.displayName}</h2>
          <p className="profile-overview-handle">@{currentUser?.username || 'user'}</p>
          <span className="profile-status-badge">{statusText}</span>

          <p className="profile-overview-bio">
            {bio || 'No bio added yet.'}
          </p>

          <div className="profile-stats-row">
            <div className="profile-stat-box">
              <span className="stat-num">{chats.length}</span>
              <span className="stat-label">Chats</span>
            </div>
            <div className="profile-stat-box">
              <span className="stat-num">{friendsList.length}</span>
              <span className="stat-label">Friends</span>
            </div>
            <div className="profile-stat-box">
              <span className="stat-num">
                {chats.filter((c) => c.type === 'group').length}
              </span>
              <span className="stat-label">Groups</span>
            </div>
          </div>

          {/* Email Verification Card */}
          <div className="verification-box">
            {currentUser?.emailVerified ? (
              <div className="verified-pill">
                <CheckCircle2 size={16} />
                <span>Verified Account ({currentUser.email})</span>
              </div>
            ) : (
              <div className="unverified-box">
                <div className="unverified-text">
                  <AlertCircle size={16} />
                  <span>Email not verified yet</span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleVerifyEmail}
                >
                  Verify Email
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Profile Edit Form */}
        <form onSubmit={handleSaveProfile} className="profile-edit-card">
          <div className="card-section-header">
            <div>
              <h3>Edit Profile &amp; Presence</h3>
              <p>Customize how others see you across MD Chat Pro</p>
            </div>
            <div className="online-toggle-pill">
              <span>Active Status:</span>
              <button
                type="button"
                className={`status-switch-btn ${online ? 'is-online' : 'is-offline'}`}
                onClick={() => setOnline((v) => !v)}
              >
                <span className="switch-dot" />
                <span>{online ? 'Online' : 'Offline'}</span>
              </button>
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
              placeholder="Tell your friends and teammates a bit about yourself..."
            />
          </div>

          <div className="profile-form-footer">
            <div className="security-hint">
              <ShieldCheck size={15} />
              <span>Changes sync in real time across all active sessions.</span>
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={16} />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
