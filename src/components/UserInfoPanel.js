import React, { useState, useMemo } from 'react';
import {
  X,
  Pin,
  Volume2,
  VolumeX,
  Archive,
  Ban,
  Unlock,
  Trash2,
  Eraser,
  Image as ImageIcon,
  FileText,
  Star,
  Users,
  Shield,
  Pencil,
  Check,
  Download,
  Palette,
} from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import Avatar from './Avatar';
import ImageLightbox from './ImageLightbox';
import { formatPresenceStatus, formatFileSize } from '../utils/formatters';
import { CHAT_BACKGROUNDS } from '../utils/constants';
import { useToast } from '../context/ToastContext';

export default function UserInfoPanel({ onClose }) {
  const { currentUser } = useAuth();
  const { wallpaperId, setWallpaperId } = useTheme();
  const {
    activeChat,
    messages,
    updateGroup,
    toggleChatFlag,
    blockUser,
    unblockUser,
    clearChat,
    deleteChat,
    openDirectChat,
  } = useChat();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('media'); // media | files | starred
  const [editingGroup, setEditingGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [previewImg, setPreviewImg] = useState(null);

  const sharedImages = useMemo(() => {
    return messages
      .filter((m) => !m.deleted && Array.isArray(m.attachments))
      .flatMap((m) =>
        m.attachments.filter(
          (a) => (a.type || '').startsWith('image/') || m.type === 'image'
        )
      );
  }, [messages]);

  const sharedFiles = useMemo(() => {
    return messages
      .filter((m) => !m.deleted && Array.isArray(m.attachments))
      .flatMap((m) =>
        m.attachments.filter(
          (a) => !(a.type || '').startsWith('image/') && m.type !== 'image'
        )
      );
  }, [messages]);

  const starredMessages = useMemo(() => {
    return messages.filter(
      (m) => !m.deleted && (m.starredBy || []).includes(currentUser?.uid)
    );
  }, [messages, currentUser?.uid]);

  if (!activeChat) return null;

  const isGroup = activeChat.type === 'group';
  const otherUser = activeChat.otherUser;

  const startEditingGroup = () => {
    setGroupName(activeChat.displayTitle || '');
    setGroupDesc(activeChat.description || '');
    setEditingGroup(true);
  };

  const saveGroupInfo = async () => {
    if (!groupName.trim()) {
      toast.warning('Group name cannot be empty.');
      return;
    }
    await updateGroup(activeChat.id, {
      name: groupName.trim(),
      description: groupDesc.trim(),
    });
    setEditingGroup(false);
    toast.success('Group details updated');
  };

  return (
    <aside className="user-info-panel">
      <div className="info-panel-header">
        <h3 className="info-panel-title">
          {isGroup ? 'Group Info' : 'Contact Info'}
        </h3>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="Close info panel"
        >
          <X size={18} />
        </button>
      </div>

      <div className="info-panel-scroll">
        {/* Profile Hero Card */}
        <div className="info-hero-card">
          <Avatar
            src={activeChat.displayAvatar}
            name={activeChat.displayTitle}
            size="xl"
            online={activeChat.isOnline}
            showStatus={!isGroup}
            isGroup={isGroup}
          />

          {editingGroup ? (
            <div className="info-group-edit-form">
              <input
                type="text"
                className="form-input form-input-sm"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
              />
              <textarea
                rows={2}
                className="form-input form-input-sm"
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
                placeholder="Group description"
              />
              <div className="info-group-edit-btns">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditingGroup(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={saveGroupInfo}
                >
                  <Check size={14} />
                  <span>Save</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="info-hero-name-row">
                <h4 className="info-hero-name">{activeChat.displayTitle}</h4>
                {isGroup && (
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm"
                    onClick={startEditingGroup}
                    title="Edit group details"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              <p className="info-hero-handle">
                {isGroup
                  ? `${activeChat.participants?.length || 0} members`
                  : `@${otherUser?.username || 'user'} • ${otherUser?.email || ''}`}
              </p>
              <span
                className={`info-presence-badge ${
                  activeChat.isOnline ? 'online' : 'offline'
                }`}
              >
                {isGroup
                  ? activeChat.displaySubtitle
                  : formatPresenceStatus(otherUser)}
              </span>
            </>
          )}

          {/* Quick Toggle Grid */}
          <div className="info-quick-grid">
            <button
              type="button"
              className={`info-quick-tile ${activeChat.isPinned ? 'active' : ''}`}
              onClick={() => toggleChatFlag(activeChat.id, 'pinnedBy')}
            >
              <Pin size={17} />
              <span>{activeChat.isPinned ? 'Pinned' : 'Pin'}</span>
            </button>

            <button
              type="button"
              className={`info-quick-tile ${activeChat.isMuted ? 'active' : ''}`}
              onClick={() => toggleChatFlag(activeChat.id, 'mutedBy')}
            >
              {activeChat.isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              <span>{activeChat.isMuted ? 'Muted' : 'Mute'}</span>
            </button>

            <button
              type="button"
              className={`info-quick-tile ${activeChat.isArchived ? 'active' : ''}`}
              onClick={() => toggleChatFlag(activeChat.id, 'archivedBy')}
            >
              <Archive size={17} />
              <span>{activeChat.isArchived ? 'Archived' : 'Archive'}</span>
            </button>
          </div>
        </div>

        {/* Bio / Description Section */}
        <div className="info-section">
          <div className="info-section-label">
            {isGroup ? 'DESCRIPTION' : 'STATUS & BIO'}
          </div>
          {!isGroup && otherUser?.statusText && (
            <div className="info-status-chip">{otherUser.statusText}</div>
          )}
          <p className="info-bio-text">
            {isGroup
              ? activeChat.description || 'No group description provided.'
              : otherUser?.bio || 'Hey there! I am using MD Chat Pro.'}
          </p>
        </div>

        {/* Group Members List */}
        {isGroup && (
          <div className="info-section">
            <div className="info-section-label">
              <Users size={13} />
              <span>MEMBERS ({activeChat.memberProfiles?.length || 0})</span>
            </div>
            <div className="info-members-list">
              {(activeChat.memberProfiles || []).map((member) => {
                const isAdmin = (activeChat.adminIds || []).includes(member.uid);
                const isMe = member.uid === currentUser?.uid;
                return (
                  <div
                    key={member.uid}
                    className="info-member-row"
                    onClick={() => {
                      if (!isMe) openDirectChat(member);
                    }}
                  >
                    <Avatar
                      src={member.photoURL}
                      name={member.displayName}
                      size="sm"
                      online={member.online}
                      showStatus
                    />
                    <div className="info-member-meta">
                      <div className="info-member-name">
                        {member.displayName} {isMe && '(You)'}
                      </div>
                      <div className="info-member-sub">
                        {member.statusText || `@${member.username || 'user'}`}
                      </div>
                    </div>
                    {isAdmin && (
                      <span className="admin-badge">
                        <Shield size={11} />
                        Admin
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Chat Wallpaper Quick Customizer */}
        <div className="info-section">
          <div className="info-section-label">
            <Palette size={13} />
            <span>CHAT BACKGROUND</span>
          </div>
          <div className="wallpaper-mini-grid">
            {CHAT_BACKGROUNDS.map((bg) => (
              <button
                key={bg.id}
                type="button"
                className={`wallpaper-swatch ${
                  wallpaperId === bg.id ? 'selected' : ''
                }`}
                style={{ background: bg.preview }}
                onClick={() => setWallpaperId(bg.id)}
                title={bg.name}
              />
            ))}
          </div>
        </div>

        {/* Shared Media, Files & Starred Tabs */}
        <div className="info-section">
          <div className="info-media-tabs">
            <button
              type="button"
              className={`info-media-tab ${activeTab === 'media' ? 'active' : ''}`}
              onClick={() => setActiveTab('media')}
            >
              <ImageIcon size={14} />
              <span>Media ({sharedImages.length})</span>
            </button>
            <button
              type="button"
              className={`info-media-tab ${activeTab === 'files' ? 'active' : ''}`}
              onClick={() => setActiveTab('files')}
            >
              <FileText size={14} />
              <span>Files ({sharedFiles.length})</span>
            </button>
            <button
              type="button"
              className={`info-media-tab ${activeTab === 'starred' ? 'active' : ''}`}
              onClick={() => setActiveTab('starred')}
            >
              <Star size={14} />
              <span>Starred ({starredMessages.length})</span>
            </button>
          </div>

          <div className="info-media-content">
            {activeTab === 'media' && (
              <>
                {sharedImages.length > 0 ? (
                  <div className="shared-media-grid">
                    {sharedImages.map((img, i) => (
                      <div
                        key={img.id || i}
                        className="shared-media-thumb"
                        onClick={() => setPreviewImg(img)}
                      >
                        <img src={img.url} alt={img.name || 'Media'} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="info-empty-hint">No photos shared yet.</p>
                )}
              </>
            )}

            {activeTab === 'files' && (
              <>
                {sharedFiles.length > 0 ? (
                  <div className="shared-files-list">
                    {sharedFiles.map((file, i) => (
                      <div key={file.id || i} className="shared-file-row">
                        <FileText size={16} />
                        <div className="shared-file-info">
                          <div className="shared-file-name">{file.name}</div>
                          <div className="shared-file-size">
                            {formatFileSize(file.size)}
                          </div>
                        </div>
                        <a
                          href={file.url}
                          download={file.name}
                          className="icon-btn icon-btn-sm"
                        >
                          <Download size={14} />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="info-empty-hint">No files shared yet.</p>
                )}
              </>
            )}

            {activeTab === 'starred' && (
              <>
                {starredMessages.length > 0 ? (
                  <div className="starred-mini-list">
                    {starredMessages.map((m) => (
                      <div key={m.id} className="starred-mini-item">
                        <div className="starred-mini-sender">{m.senderName}</div>
                        <div className="starred-mini-text">
                          {m.text || 'Attachment'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="info-empty-hint">No starred messages yet.</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Privacy & Danger Zone Actions */}
        <div className="info-section info-danger-zone">
          {!isGroup && otherUser && (
            <button
              type="button"
              className="info-danger-btn"
              onClick={() =>
                activeChat.isBlockedByMe
                  ? unblockUser(otherUser.uid)
                  : blockUser(otherUser.uid)
              }
            >
              {activeChat.isBlockedByMe ? (
                <>
                  <Unlock size={16} />
                  <span>Unblock {otherUser.displayName}</span>
                </>
              ) : (
                <>
                  <Ban size={16} />
                  <span>Block {otherUser.displayName}</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            className="info-danger-btn"
            onClick={() => clearChat(activeChat.id)}
          >
            <Eraser size={16} />
            <span>Clear Chat History</span>
          </button>

          <button
            type="button"
            className="info-danger-btn danger-red"
            onClick={() => deleteChat(activeChat.id)}
          >
            <Trash2 size={16} />
            <span>{isGroup ? 'Leave Group' : 'Delete Conversation'}</span>
          </button>
        </div>
      </div>

      <ImageLightbox
        image={previewImg}
        onClose={() => setPreviewImg(null)}
      />
    </aside>
  );
}
