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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sending, setSending] = useState(false);

  const textareaRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const toast = useToast();

  // Populate text when entering edit mode
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text || '');
      textareaRef.current?.focus();
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

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFileUpload(file, 'attachment');
    if (!validation.valid) {
      toast.error(validation.error);
      e.target.value = '';
      return;
    }

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      setFilePreviewUrl(URL.createObjectURL(file));
    } else {
      setFilePreviewUrl(null);
    }
    e.target.value = '';
    textareaRef.current?.focus();
  };

  const clearSelectedFile = () => {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setUploadProgress(0);
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
    setText((prev) => `${prev}${emoji}`);
    textareaRef.current?.focus();
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (sending || disabled) return;

    if (editingMessage) {
      if (!text.trim()) {
        toast.warning('Edited message cannot be empty.');
        return;
      }
      try {
        setSending(true);
        await onEditSubmit(editingMessage.id, text);
        setText('');
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
        await onSendMessage({ text: text.trim(), type: 'text' });
        setText('');
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
        setText('');
      } else if (replyingTo) {
        onCancelReply();
      }
    }
  };

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
              {replyingTo.text || 'Attachment'}
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

      {/* Edit Mode Banner */}
      {editingMessage && (
        <div className="composer-context-banner banner-edit">
          <div className="composer-banner-icon">
            <Pencil size={16} />
          </div>
          <div className="composer-banner-text">
            <span className="composer-banner-title">Editing Message</span>
            <span className="composer-banner-preview">{editingMessage.text}</span>
          </div>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            onClick={() => {
              onCancelEdit();
              setText('');
            }}
            aria-label="Cancel edit"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Selected Attachment Preview Bar */}
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
            title="Emoji picker"
            disabled={disabled}
          >
            <Smile size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => imageInputRef.current?.click()}
            title="Share image"
            disabled={disabled || Boolean(editingMessage)}
          >
            <ImageIcon size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach file or document"
            disabled={disabled || Boolean(editingMessage)}
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
            placeholder={
              disabled
                ? 'Messaging is disabled for this conversation'
                : editingMessage
                ? 'Update your message...'
                : 'Type a message... (supports **bold**, *italic*, `code`)'
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
          className={`composer-send-btn ${
            text.trim() || selectedFile ? 'send-ready' : ''
          }`}
          disabled={disabled || sending || (!text.trim() && !selectedFile)}
          title={editingMessage ? 'Save changes' : 'Send message'}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
