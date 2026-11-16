import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  Phone,
  Video,
  Info,
  Pin,
  Volume2,
  VolumeX,
  Star,
  ChevronDown,
  ShieldAlert,
  Unlock,
  X,
} from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import EmptyState from './EmptyState';
import ImageLightbox from './ImageLightbox';
import CallModal from './CallModal';
import {
  formatDateSeparator,
  isSameCalendarDay,
  formatPresenceStatus,
} from '../utils/formatters';

export default function ChatWindow({
  onBackMobile,
  onOpenNewGroup,
  onOpenFriends,
}) {
  const { currentUser } = useAuth();
  const { currentWallpaper } = useTheme();
  const {
    activeChat,
    messages,
    activeTypingUsers,
    replyingTo,
    setReplyingTo,
    editingMessage,
    setEditingMessage,
    messageSearchTerm,
    setMessageSearchTerm,
    showInfoPanel,
    setShowInfoPanel,
    sendMessage,
    uploadAndSendAttachment,
    editMessage,
    deleteMessage,
    reactToMessage,
    toggleStarMessage,
    setTyping,
    toggleChatFlag,
    unblockUser,
  } = useChat();

  const [showSearchBar, setShowSearchBar] = useState(false);
  const [filterStarredOnly, setFilterStarredOnly] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [activeCall, setActiveCall] = useState(null);

  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Scroll to bottom when activeChat changes or new messages arrive
  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('auto');
    setShowSearchBar(false);
    setFilterStarredOnly(false);
  }, [activeChat?.id]);

  useEffect(() => {
    if (!showScrollBottom) {
      scrollToBottom('smooth');
    }
  }, [messages.length, activeTypingUsers.length]);

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(distanceFromBottom > 240);
  };

  const displayedMessages = useMemo(() => {
    return messages.filter((msg) => {
      if (filterStarredOnly && !(msg.starredBy || []).includes(currentUser?.uid)) {
        return false;
      }
      if (messageSearchTerm.trim()) {
        const q = messageSearchTerm.toLowerCase();
        const textMatch = msg.text?.toLowerCase().includes(q);
        const senderMatch = msg.senderName?.toLowerCase().includes(q);
        const fileMatch = (msg.attachments || []).some((a) =>
          a.name?.toLowerCase().includes(q)
        );
        return textMatch || senderMatch || fileMatch;
      }
      return true;
    });
  }, [messages, filterStarredOnly, messageSearchTerm, currentUser?.uid]);

  if (!activeChat) {
    return (
      <main className="chat-window-empty">
        <EmptyState
          title="Welcome to MD Chat Pro"
          description="Select a conversation from the sidebar, connect with friends, or launch a group workspace to start messaging in real time."
          onNewChat={onOpenFriends}
          onNewGroup={onOpenNewGroup}
          showFeaturePills
        />
      </main>
    );
  }

  const headerSubtitle =
    activeTypingUsers.length > 0
      ? `${activeTypingUsers.join(', ')} ${
          activeTypingUsers.length === 1 ? 'is' : 'are'
        } typing...`
      : activeChat.type === 'group'
      ? activeChat.displaySubtitle
      : formatPresenceStatus(activeChat.otherUser);

  return (
    <main className="chat-window">
      {/* Top Chat Header */}
      <header className="chat-header">
        <div className="chat-header-left">
          {onBackMobile && (
            <button
              type="button"
              className="icon-btn mobile-back-btn"
              onClick={onBackMobile}
              aria-label="Back to conversations"
            >
              <ArrowLeft size={20} />
            </button>
          )}

          <div
            className="chat-header-identity"
            onClick={() => setShowInfoPanel((v) => !v)}
            role="button"
            tabIndex={0}
          >
            <Avatar
              src={activeChat.displayAvatar}
              name={activeChat.displayTitle}
              size="md"
              online={activeChat.isOnline}
              showStatus={activeChat.type === 'direct'}
              isGroup={activeChat.type === 'group'}
            />
            <div className="chat-header-titles">
              <div className="chat-header-name-row">
                <h2 className="chat-header-name">{activeChat.displayTitle}</h2>
                {activeChat.isPinned && <Pin size={13} className="header-pin-badge" />}
              </div>
              <p
                className={`chat-header-status ${
                  activeTypingUsers.length > 0
                    ? 'status-typing'
                    : activeChat.isOnline
                    ? 'status-online'
                    : ''
                }`}
              >
                {headerSubtitle}
              </p>
            </div>
          </div>
        </div>

        <div className="chat-header-actions">
          <button
            type="button"
            className={`icon-btn ${showSearchBar ? 'active' : ''}`}
            onClick={() => {
              setShowSearchBar((v) => !v);
              if (showSearchBar) setMessageSearchTerm('');
            }}
            title="Search in conversation"
          >
            <Search size={18} />
          </button>

          <button
            type="button"
            className={`icon-btn ${filterStarredOnly ? 'active' : ''}`}
            onClick={() => setFilterStarredOnly((v) => !v)}
            title={filterStarredOnly ? 'Show all messages' : 'Show starred messages'}
          >
            <Star size={18} fill={filterStarredOnly ? 'currentColor' : 'none'} />
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={() =>
              setActiveCall({
                type: 'voice',
                title: activeChat.displayTitle,
                avatar: activeChat.displayAvatar,
                isGroup: activeChat.type === 'group',
              })
            }
            title="Start voice call"
          >
            <Phone size={18} />
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={() =>
              setActiveCall({
                type: 'video',
                title: activeChat.displayTitle,
                avatar: activeChat.displayAvatar,
                isGroup: activeChat.type === 'group',
              })
            }
            title="Start HD video call"
          >
            <Video size={18} />
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={() => toggleChatFlag(activeChat.id, 'mutedBy')}
            title={activeChat.isMuted ? 'Unmute notifications' : 'Mute notifications'}
          >
            {activeChat.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>

          <button
            type="button"
            className={`icon-btn ${showInfoPanel ? 'active' : ''}`}
            onClick={() => setShowInfoPanel((v) => !v)}
            title="Conversation details & media"
          >
            <Info size={18} />
          </button>
        </div>
      </header>

      {/* In-Chat Search Bar */}
      {showSearchBar && (
        <div className="chat-in-search-bar">
          <Search size={15} className="chat-in-search-icon" />
          <input
            type="text"
            value={messageSearchTerm}
            onChange={(e) => setMessageSearchTerm(e.target.value)}
            placeholder="Find messages or files in this chat..."
            className="chat-in-search-input"
            autoFocus
          />
          {messageSearchTerm && (
            <span className="chat-in-search-count">
              {displayedMessages.length} match{displayedMessages.length === 1 ? '' : 'es'}
            </span>
          )}
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            onClick={() => {
              setShowSearchBar(false);
              setMessageSearchTerm('');
            }}
            aria-label="Close message search"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Starred Filter Active Banner */}
      {filterStarredOnly && (
        <div className="chat-filter-banner">
          <Star size={14} fill="currentColor" />
          <span>Showing starred messages in this conversation ({displayedMessages.length})</span>
          <button
            type="button"
            className="btn-inline-link"
            onClick={() => setFilterStarredOnly(false)}
          >
            Show all
          </button>
        </div>
      )}

      {/* Messages Stream */}
      <div
        ref={messagesContainerRef}
        className="chat-messages-stream"
        style={currentWallpaper.style}
        onScroll={handleScroll}
      >
        <div className="chat-security-notice">
          <span>🔒 Messages and calls are end-to-end protected. No one outside of this chat can read or listen to them.</span>
        </div>

        {displayedMessages.map((msg, index) => {
          const prevMsg = index > 0 ? displayedMessages[index - 1] : null;
          const showDateHeader =
            !prevMsg || !isSameCalendarDay(prevMsg.createdAt, msg.createdAt);

          return (
            <React.Fragment key={msg.id}>
              {showDateHeader && (
                <div className="msg-date-divider">
                  <span>{formatDateSeparator(msg.createdAt)}</span>
                </div>
              )}
              <MessageBubble
                message={msg}
                isOwn={msg.senderId === currentUser?.uid}
                isGroup={activeChat.type === 'group'}
                currentUid={currentUser?.uid}
                participantsCount={activeChat.participants?.length || 2}
                searchHighlight={messageSearchTerm}
                onReply={(m) => {
                  setEditingMessage(null);
                  setReplyingTo(m);
                }}
                onEdit={(m) => {
                  setReplyingTo(null);
                  setEditingMessage(m);
                }}
                onDelete={(msgId) => deleteMessage(msgId)}
                onReact={(msgId, emoji) => reactToMessage(msgId, emoji)}
                onToggleStar={(msgId) => toggleStarMessage(msgId)}
                onPreviewImage={(att) => setLightboxImage(att)}
              />
            </React.Fragment>
          );
        })}

        {displayedMessages.length === 0 && (
          <div className="chat-no-messages">
            <p>
              {messageSearchTerm || filterStarredOnly
                ? 'No messages match your current filter.'
                : `Say hello to ${activeChat.displayTitle}! 👋`}
            </p>
          </div>
        )}

        {/* Animated Typing Indicator Bubble */}
        {activeTypingUsers.length > 0 && (
          <div className="typing-bubble-row">
            <div className="typing-bubble">
              <div className="typing-dots">
                <span />
                <span />
                <span />
              </div>
              <span className="typing-label">
                {activeTypingUsers.join(', ')} is typing
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to Bottom Floating Button */}
      {showScrollBottom && (
        <button
          type="button"
          className="scroll-bottom-fab"
          onClick={() => scrollToBottom('smooth')}
          aria-label="Scroll to latest messages"
        >
          <ChevronDown size={20} />
        </button>
      )}

      {/* Blocked User Banner or Message Input */}
      {activeChat.isBlockedByMe ? (
        <div className="blocked-chat-banner">
          <div className="blocked-banner-info">
            <ShieldAlert size={18} />
            <span>You have blocked {activeChat.displayTitle}.</span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => unblockUser(activeChat.otherUser?.uid)}
          >
            <Unlock size={14} />
            <span>Unblock User</span>
          </button>
        </div>
      ) : (
        <MessageInput
          onSendMessage={sendMessage}
          onUploadAttachment={uploadAndSendAttachment}
          onEditSubmit={editMessage}
          onTypingChange={setTyping}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          editingMessage={editingMessage}
          onCancelEdit={() => setEditingMessage(null)}
          disabled={Boolean(activeChat.hasBlockedMe)}
        />
      )}

      {/* Fullscreen Image Lightbox */}
      <ImageLightbox
        image={lightboxImage}
        onClose={() => setLightboxImage(null)}
      />

      {/* Voice / Video Call Modal */}
      <CallModal
        callState={activeCall}
        onEndCall={() => setActiveCall(null)}
      />
    </main>
  );
}
