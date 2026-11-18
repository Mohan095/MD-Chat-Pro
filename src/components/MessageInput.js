import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Smile,
  Paperclip,
  Image as ImageIcon,
  X,
  Reply,
  Pencil,
  Bold,
  Italic,
  Code,
  FileText,
  RefreshCw,
} from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import { formatFileSize } from '../utils/formatters';
import { validateFileUpload } from '../utils/security';
import { useToast } from '../context/ToastContext';

export default function MessageInput({
  onSendMessage,
  onUploadAttachment,
  onEditSubmit,
  onTypingChange,
  replyingTo,
  onCancelReply,
  editingMessage,
  onCancelEdit,
  disabled = false,
}) {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sending, setSending] = useState(false);

  const textareaRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const toast = useToast();

  // Populate text and existing image/file attachments when entering edit mode
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text || '');
      setExistingAttachments(editingMessage.attachments || []);
      setSelectedFile(null);
      setFilePreviewUrl(null);
      textareaRef.current?.focus();
    } else {
      setExistingAttachments([]);
    }
  }, [editingMessage]);

  // Focus textarea when replying
  useEffect(() => {
    if (replyingTo) {
      textareaRef.current?.focus();
    }
  }, [replyingTo]);

  // Auto-resize textarea height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
  }, [text]);

  const triggerTypingIndicator = (nextText) => {
    if (!onTypingChange) return;
    if (nextText.trim().length > 0) {
      onTypingChange(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onTypingChange(false);
      }, 2800);
    } else {
      onTypingChange(false);
    }
  };

  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);
    triggerTypingIndicator(val);
  };

  const attachFileObject = (file) => {
    const validation = validateFileUpload(file, 'attachment');
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      setFilePreviewUrl(URL.createObjectURL(file));
    } else {
      setFilePreviewUrl(null);
    }
    textareaRef.current?.focus();
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    attachFileObject(file);
    e.target.value = '';
  };

  // Support pasting copied images directly into the chat input (Ctrl+V)
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i += 1) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            e.preventDefault();
            const namedFile = new File(
              [blob],
              `pasted-image-${Date.now()}.png`,
              { type: blob.type || 'image/png' }
            );
            attachFileObject(namedFile);
            toast.info('Image pasted from clipboard');
            return;
          }
        }
      }
    }

    // Also support pasting an image copied via the in-app Copy Image button
    if (window.__mdchatCopiedAttachment && !e.clipboardData?.getData('text/plain')) {
      e.preventDefault();
      const copied = window.__mdchatCopiedAttachment;
      await onSendMessage({
        text: text.trim(),
        type: 'image',
        attachments: [{ ...copied, id: `att_${Date.now()}` }],
      });
      setText('');
      toast.success('Copied image sent!');
    }
  };

  const clearSelectedFile = () => {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setUploadProgress(0);
  };

  const removeExistingAttachment = (attId) => {
    setExistingAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  const insertFormatSyntax = (prefix, suffix = prefix) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const selected = text.slice(start, end) || 'text';
    const next = `${text.slice(0, start)}${prefix}${selected}${suffix}${text.slice(end)}`;
    setText(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 10);
  };

  const handleEmojiSelect = (emoji) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;
      const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
      setText(next);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 10);
    } else {
      setText((prev) => `${prev}${emoji}`);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (sending || disabled) return;

    if (editingMessage) {
      if (!text.trim() && existingAttachments.length === 0 && !selectedFile) {
        toast.warning('Edited message must contain text or an image.');
        return;
      }
      try {
        setSending(true);
        await onEditSubmit(
          editingMessage.id,
          text.trim(),
          existingAttachments,
          selectedFile
        );
        clearSelectedFile();
        setExistingAttachments([]);
        setText('');
        setShowEmojiPicker(false);
      } catch (err) {
        toast.error(err.message || 'Failed to edit message.');
      } finally {
        setSending(false);
      }
      return;
    }

    if (!text.trim() && !selectedFile) return;

    try {
      setSending(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (onTypingChange) onTypingChange(false);

      if (selectedFile) {
        await onUploadAttachment(selectedFile, text.trim(), (pct) => {
          setUploadProgress(pct);
        });
        clearSelectedFile();
        setText('');
      } else {
        const messageText = text.trim();
        setText('');
        setShowEmojiPicker(false);
        await onSendMessage({ text: messageText, type: 'text' });
      }
      setShowEmojiPicker(false);
    } catch (err) {
      toast.error(err.message || 'Failed to send message.');
    } finally {
      setSending(false);
      setUploadProgress(0);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      if (showEmojiPicker) setShowEmojiPicker(false);
      else if (editingMessage) {
        onCancelEdit();
        clearSelectedFile();
        setExistingAttachments([]);
        setText('');
      } else if (replyingTo) {
        onCancelReply();
      }
    }
  };

  const hasContentToSend =
    Boolean(text.trim()) ||
    Boolean(selectedFile) ||
    (Boolean(editingMessage) && existingAttachments.length > 0);

  return (
    <div className="message-input-wrapper">
      {/* Reply Context Banner */}
      {replyingTo && (
        <div className="composer-context-banner">
          <div className="composer-banner-icon">
            <Reply size={16} />
          </div>
          <div className="composer-banner-text">
            <span className="composer-banner-title">
              Replying to {replyingTo.senderName}
            </span>
            <span className="composer-banner-preview">
              {replyingTo.text || '📷 Image / Attachment'}
            </span>
          </div>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            onClick={onCancelReply}
            aria-label="Cancel reply"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Edit Mode Banner (Supports both Text & Image Editing) */}
      {editingMessage && (
        <div className="composer-context-banner banner-edit">
          <div className="composer-banner-icon">
            <Pencil size={16} />
          </div>
          <div className="composer-banner-text">
            <span className="composer-banner-title">
              Editing Message {existingAttachments.length > 0 || selectedFile ? '& Image' : ''}
            </span>
            <span className="composer-banner-preview">
              {editingMessage.text || '📷 Attached Image'}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => imageInputRef.current?.click()}
            title="Replace or add image"
          >
            <RefreshCw size={13} />
            <span>Change Image</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            onClick={() => {
              onCancelEdit();
              clearSelectedFile();
              setExistingAttachments([]);
              setText('');
            }}
            aria-label="Cancel edit"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Existing Attachments Preview when Editing an Image Message */}
      {editingMessage && !selectedFile && existingAttachments.length > 0 && (
        <div className="composer-attachment-preview">
          {existingAttachments.map((att, idx) => (
            <React.Fragment key={att.id || idx}>
              {(att.type || '').startsWith('image/') || editingMessage.type === 'image' ? (
                <img
                  src={att.url}
                  alt={att.name || 'Current attachment'}
                  className="composer-preview-thumb"
                />
              ) : (
                <div className="composer-preview-file-icon">
                  <FileText size={22} />
                </div>
              )}
              <div className="composer-preview-meta">
                <div className="composer-preview-name">
                  {att.name || 'Attached Image'}
                </div>
                <div className="composer-preview-size">
                  Current attachment • Click &quot;Change Image&quot; to replace
                </div>
              </div>
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                onClick={() => removeExistingAttachment(att.id)}
                title="Remove attachment"
              >
                <X size={16} />
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Newly Selected Attachment Preview Bar */}
      {selectedFile && (
        <div className="composer-attachment-preview">
          {filePreviewUrl ? (
            <img
              src={filePreviewUrl}
              alt={selectedFile.name}
              className="composer-preview-thumb"
            />
          ) : (
            <div className="composer-preview-file-icon">
              <FileText size={22} />
            </div>
          )}
          <div className="composer-preview-meta">
            <div className="composer-preview-name">{selectedFile.name}</div>
            <div className="composer-preview-size">
              {formatFileSize(selectedFile.size)}
              {uploadProgress > 0 && ` • Uploading ${uploadProgress}%`}
            </div>
          </div>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            onClick={clearSelectedFile}
            aria-label="Remove attachment"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="composer-emoji-anchor">
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => setShowEmojiPicker(false)}
          />
        </div>
      )}

      {/* Main Composer Form */}
      <form onSubmit={handleSubmit} className="composer-bar">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
          onChange={handleFileSelect}
          hidden
        />
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          hidden
        />

        <div className="composer-left-tools">
          <button
            type="button"
            className={`icon-btn ${showEmojiPicker ? 'active' : ''}`}
            onClick={() => setShowEmojiPicker((v) => !v)}
            title="Insert Emoji"
            disabled={disabled}
          >
            <Smile size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => imageInputRef.current?.click()}
            title={editingMessage ? 'Replace or add image' : 'Upload image'}
            disabled={disabled}
          >
            <ImageIcon size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach file or document"
            disabled={disabled}
          >
            <Paperclip size={20} />
          </button>
        </div>

        <div className="composer-input-container">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              disabled
                ? 'Messaging is disabled for this conversation'
                : editingMessage
                ? 'Edit message text or replace image...'
                : 'Type a message'
            }
            className="composer-textarea"
            disabled={disabled}
          />

          <div className="composer-format-pills">
            <button
              type="button"
              className="format-pill-btn"
              onClick={() => insertFormatSyntax('**')}
              title="Bold (**text**)"
              tabIndex={-1}
            >
              <Bold size={13} />
            </button>
            <button
              type="button"
              className="format-pill-btn"
              onClick={() => insertFormatSyntax('*')}
              title="Italic (*text*)"
              tabIndex={-1}
            >
              <Italic size={13} />
            </button>
            <button
              type="button"
              className="format-pill-btn"
              onClick={() => insertFormatSyntax('`')}
              title="Inline code (`code`)"
              tabIndex={-1}
            >
              <Code size={13} />
            </button>
          </div>
        </div>

        <button
          type="submit"
          className={`composer-send-btn ${hasContentToSend ? 'send-ready' : ''}`}
          disabled={disabled || sending || !hasContentToSend}
          title={editingMessage ? 'Save changes' : 'Send message'}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
