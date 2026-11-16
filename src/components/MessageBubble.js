import React, { useState } from 'react';
import {
  Check,
  CheckCheck,
  Reply,
  Pencil,
  Trash2,
  Star,
  Copy,
  FileText,
  Download,
  SmilePlus,
  Ban,
} from 'lucide-react';
import Avatar from './Avatar';
import {
  formatMessageTime,
  formatFileSize,
  parseMessageTokens,
} from '../utils/formatters';
import { isSafeUrl } from '../utils/security';
import { QUICK_REACTIONS } from '../utils/constants';
import { useToast } from '../context/ToastContext';

export default function MessageBubble({
  message,
  isOwn,
  isGroup,
  currentUid,
  participantsCount = 2,
  searchHighlight = '',
  onReply,
  onEdit,
  onDelete,
  onReact,
  onToggleStar,
  onPreviewImage,
}) {
  const [showReactionTray, setShowReactionTray] = useState(false);
  const toast = useToast();

  if (message.type === 'system') {
    return (
      <div className="msg-system-row">
        <span className="msg-system-pill">{message.text}</span>
      </div>
    );
  }

  const isStarred = (message.starredBy || []).includes(currentUid);
  const readByOthers = (message.readBy || []).filter((id) => id !== message.senderId);
  const isRead = readByOthers.length > 0;
  const reactionsEntries = Object.entries(message.reactions || {}).filter(
    ([, users]) => Array.isArray(users) && users.length > 0
  );

  const handleCopyText = () => {
    if (!message.text) return;
    navigator.clipboard?.writeText(message.text);
    toast.info('Message copied to clipboard');
  };

  const renderHighlightedText = (str) => {
    if (!searchHighlight.trim()) return str;
    const escaped = searchHighlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = str.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, idx) =>
      part.toLowerCase() === searchHighlight.toLowerCase() ? (
        <mark key={idx} className="msg-search-highlight">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const renderFormattedContent = (text) => {
    const tokens = parseMessageTokens(text);
    return tokens.map((token) => {
      switch (token.type) {
        case 'codeblock':
          return (
            <div key={token.key} className="msg-codeblock-wrap">
              {token.language && (
                <div className="msg-codeblock-lang">{token.language}</div>
              )}
              <pre className="msg-codeblock">
                <code>{token.content}</code>
              </pre>
            </div>
          );
        case 'code':
          return (
            <code key={token.key} className="msg-inline-code">
              {token.content}
            </code>
          );
        case 'bold':
          return <strong key={token.key}>{renderHighlightedText(token.content)}</strong>;
        case 'italic':
          return <em key={token.key}>{renderHighlightedText(token.content)}</em>;
        case 'strike':
          return <del key={token.key}>{renderHighlightedText(token.content)}</del>;
        case 'link':
          if (isSafeUrl(token.href)) {
            return (
              <a
                key={token.key}
                href={token.href}
                target="_blank"
                rel="noopener noreferrer"
                className="msg-link"
              >
                {token.content}
              </a>
            );
          }
          return <span key={token.key}>{token.content}</span>;
        default:
          return <span key={token.key}>{renderHighlightedText(token.content)}</span>;
      }
    });
  };

  return (
    <div
      className={`msg-row ${isOwn ? 'msg-row-own' : 'msg-row-incoming'} ${
        message.deleted ? 'msg-row-deleted' : ''
      }`}
      onMouseLeave={() => setShowReactionTray(false)}
    >
      {!isOwn && (
        <div className="msg-sender-avatar">
          <Avatar
            src={message.senderAvatar}
            name={message.senderName || 'User'}
            size="xs"
          />
        </div>
      )}

      <div className="msg-content-column">
        {!isOwn && isGroup && (
          <div className="msg-sender-name">{message.senderName}</div>
        )}

        <div className="msg-bubble-wrapper">
          {/* Quick Floating Actions Toolbar */}
          {!message.deleted && (
            <div className={`msg-hover-toolbar ${isOwn ? 'toolbar-left' : 'toolbar-right'}`}>
              <div className="msg-hover-actions">
                <button
                  type="button"
                  className="msg-action-btn"
                  onClick={() => setShowReactionTray((v) => !v)}
                  title="React with emoji"
                >
                  <SmilePlus size={14} />
                </button>
                <button
                  type="button"
                  className="msg-action-btn"
                  onClick={() => onReply(message)}
                  title="Reply"
                >
                  <Reply size={14} />
                </button>
                <button
                  type="button"
                  className={`msg-action-btn ${isStarred ? 'starred' : ''}`}
                  onClick={() => onToggleStar(message.id)}
                  title={isStarred ? 'Unstar message' : 'Star message'}
                >
                  <Star size={14} fill={isStarred ? 'currentColor' : 'none'} />
                </button>
                {message.text && (
                  <button
                    type="button"
                    className="msg-action-btn"
                    onClick={handleCopyText}
                    title="Copy message"
                  >
                    <Copy size={14} />
                  </button>
                )}
                {isOwn && (
                  <>
                    <button
                      type="button"
                      className="msg-action-btn"
                      onClick={() => onEdit(message)}
                      title="Edit message"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="msg-action-btn msg-action-danger"
                      onClick={() => onDelete(message.id)}
                      title="Delete message"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>

              {showReactionTray && (
                <div className="msg-reaction-tray">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="reaction-tray-emoji"
                      onClick={() => {
                        onReact(message.id, emoji);
                        setShowReactionTray(false);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Message Bubble Card */}
          <div className={`msg-bubble ${isOwn ? 'bubble-own' : 'bubble-incoming'}`}>
            {/* Quoted Reply Block */}
            {message.replyTo && !message.deleted && (
              <div className="msg-reply-quote">
                <div className="msg-reply-sender">{message.replyTo.senderName}</div>
                <div className="msg-reply-text">{message.replyTo.text}</div>
              </div>
            )}

            {/* Deleted Message State */}
            {message.deleted ? (
              <div className="msg-deleted-text">
                <Ban size={14} />
                <span>This message was deleted</span>
              </div>
            ) : (
              <>
                {/* Attachments */}
                {Array.isArray(message.attachments) &&
                  message.attachments.map((att, idx) => {
                    const isImg =
                      (att.type || '').startsWith('image/') || message.type === 'image';
                    if (isImg && isSafeUrl(att.url)) {
                      return (
                        <div
                          key={att.id || idx}
                          className="msg-image-attachment"
                          onClick={() => onPreviewImage(att)}
                        >
                          <img
                            src={att.url}
                            alt={att.name || 'Attachment'}
                            loading="lazy"
                          />
                        </div>
                      );
                    }

                    return (
                      <div key={att.id || idx} className="msg-file-card">
                        <div className="msg-file-icon">
                          <FileText size={20} />
                        </div>
                        <div className="msg-file-meta">
                          <div className="msg-file-name">{att.name || 'Attached File'}</div>
                          <div className="msg-file-size">{formatFileSize(att.size)}</div>
                        </div>
                        {isSafeUrl(att.url) && (
                          <a
                            href={att.url}
                            download={att.name || 'download'}
                            className="msg-file-download"
                            title="Download file"
                          >
                            <Download size={16} />
                          </a>
                        )}
                      </div>
                    );
                  })}

                {/* Text Body */}
                {message.text && (
                  <div className="msg-text">{renderFormattedContent(message.text)}</div>
                )}
              </>
            )}

            {/* Footer Meta: Starred, Edited, Time, Read Receipt */}
            <div className="msg-meta">
              {isStarred && (
                <Star size={11} className="msg-star-indicator" fill="currentColor" />
              )}
              {message.edited && !message.deleted && (
                <span className="msg-edited-tag">edited</span>
              )}
              <span className="msg-time">{formatMessageTime(message.createdAt)}</span>
              {isOwn && !message.deleted && (
                <span
                  className={`msg-receipt ${isRead ? 'receipt-read' : 'receipt-sent'}`}
                  title={isRead ? 'Read' : 'Delivered'}
                >
                  {isRead ? <CheckCheck size={14} /> : <Check size={14} />}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Emoji Reactions Pill Row */}
        {reactionsEntries.length > 0 && !message.deleted && (
          <div className={`msg-reactions-row ${isOwn ? 'reactions-own' : 'reactions-incoming'}`}>
            {reactionsEntries.map(([emoji, uids]) => {
              const hasReacted = uids.includes(currentUid);
              return (
                <button
                  key={emoji}
                  type="button"
                  className={`msg-reaction-pill ${hasReacted ? 'reacted' : ''}`}
                  onClick={() => onReact(message.id, emoji)}
                  title={`${uids.length} reaction${uids.length > 1 ? 's' : ''}`}
                >
                  <span>{emoji}</span>
                  <span className="reaction-count">{uids.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
