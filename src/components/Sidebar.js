import React, { useState, useMemo } from 'react';
import {
  Search,
  UserPlus,
  Users,
  Pin,
  VolumeX,
  Archive,
  Check,
  CheckCheck,
  X,
  MessageSquarePlus,
  Trash2,
} from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { useAuth } from '../hooks/useAuth';
import Avatar from './Avatar';
import { formatRelativeTime } from '../utils/formatters';

export default function Sidebar({
  onOpenNewGroup,
  onOpenFriends,
  onSelectChatMobile,
}) {
  const { currentUser } = useAuth();
  const {
    chats,
    activeChatId,
    setActiveChatId,
    onlineFriends,
    openDirectChat,
    sidebarFilter,
    setSidebarFilter,
    toggleChatFlag,
    deleteChat,
  } = useChat();

  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenuChatId, setContextMenuChatId] = useState(null);

  const filteredChats = useMemo(() => {
    return chats
      .filter((chat) => {
        if (sidebarFilter === 'archived') {
          return chat.isArchived;
        }
        if (chat.isArchived) return false;
        if (sidebarFilter === 'unread') return chat.unreadForMe > 0;
        if (sidebarFilter === 'groups') return chat.type === 'group';
        return true;
      })
      .filter((chat) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const titleMatch = chat.displayTitle?.toLowerCase().includes(q);
        const lastMsgMatch = chat.lastMessage?.text?.toLowerCase().includes(q);
        return titleMatch || lastMsgMatch;
      });
  }, [chats, sidebarFilter, searchQuery]);

  const unreadChatsCount = useMemo(() => {
    return chats.filter((c) => !c.isArchived && c.unreadForMe > 0).length;
  }, [chats]);

  const handleSelectChat = (chatId) => {
    setActiveChatId(chatId);
    setContextMenuChatId(null);
    if (onSelectChatMobile) onSelectChatMobile(chatId);
  };

  const handleQuickOnlineFriendClick = async (friend) => {
    const chat = await openDirectChat(friend);
    if (chat && onSelectChatMobile) {
      onSelectChatMobile(chat.id);
    }
  };

  const getActiveTypingInChat = (chat) => {
    if (!chat.typing || !currentUser?.uid) return false;
    const now = Date.now();
    return Object.entries(chat.typing).some(
      ([uid, ts]) => uid !== currentUser.uid && ts && now - ts < 8000
    );
  };

  return (
    <aside className="chat-sidebar" onClick={() => setContextMenuChatId(null)}>
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <div className="sidebar-header-title-row">
          <div>
            <h1 className="sidebar-heading">Messages</h1>
            <p className="sidebar-subheading">
              {chats.length} conversations • {onlineFriends.length} online
            </p>
          </div>
          <div className="sidebar-header-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={onOpenFriends}
              title="Add Friends & Directory"
            >
              <UserPlus size={19} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onOpenNewGroup}
              title="Create Group Chat"
            >
              <Users size={19} />
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="search-input-wrap">
          <Search size={16} className="search-input-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations or messages..."
            className="search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Online Friends Carousel */}
      {onlineFriends.length > 0 && (
        <div className="online-strip-section">
          <div className="online-strip-label">ONLINE NOW</div>
          <div className="online-strip-scroll">
            {onlineFriends.map((friend) => (
              <button
                key={friend.uid}
                type="button"
                className="online-friend-pill"
                onClick={() => handleQuickOnlineFriendClick(friend)}
                title={`Chat with ${friend.displayName}`}
              >
                <Avatar
                  src={friend.photoURL}
                  name={friend.displayName}
                  size="sm"
                  online
                  showStatus
                />
                <span className="online-friend-name">
                  {friend.displayName.split(' ')[0]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="sidebar-filter-tabs">
        <button
          type="button"
          className={`filter-tab ${sidebarFilter === 'all' ? 'active' : ''}`}
          onClick={() => setSidebarFilter('all')}
        >
          All
        </button>
        <button
          type="button"
          className={`filter-tab ${sidebarFilter === 'unread' ? 'active' : ''}`}
          onClick={() => setSidebarFilter('unread')}
        >
          <span>Unread</span>
          {unreadChatsCount > 0 && (
            <span className="filter-tab-badge">{unreadChatsCount}</span>
          )}
        </button>
        <button
          type="button"
          className={`filter-tab ${sidebarFilter === 'groups' ? 'active' : ''}`}
          onClick={() => setSidebarFilter('groups')}
        >
          Groups
        </button>
        <button
          type="button"
          className={`filter-tab ${sidebarFilter === 'archived' ? 'active' : ''}`}
          onClick={() => setSidebarFilter('archived')}
        >
          Archived
        </button>
      </div>

      {/* Conversation List */}
      <div className="conversation-list">
        {filteredChats.map((chat) => {
          const isActive = chat.id === activeChatId;
          const isTyping = getActiveTypingInChat(chat);
          const lastMsg = chat.lastMessage;
          const isLastFromMe = lastMsg?.senderId === currentUser?.uid;
          const isLastRead =
            isLastFromMe &&
            (lastMsg?.readBy || []).some((id) => id !== currentUser?.uid);

          return (
            <div
              key={chat.id}
              className={`conversation-item ${isActive ? 'active' : ''} ${
                chat.unreadForMe > 0 ? 'unread' : ''
              }`}
              onClick={() => handleSelectChat(chat.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenuChatId(chat.id);
              }}
            >
              <Avatar
                src={chat.displayAvatar}
                name={chat.displayTitle}
                size="md"
                online={chat.isOnline}
                showStatus={chat.type === 'direct'}
                isGroup={chat.type === 'group'}
              />

              <div className="conversation-info">
                <div className="conversation-top-row">
                  <span className="conversation-name">{chat.displayTitle}</span>
                  <div className="conversation-meta-icons">
                    {chat.isPinned && <Pin size={12} className="meta-pin-icon" />}
                    {chat.isMuted && <VolumeX size={12} className="meta-mute-icon" />}
                    <span className="conversation-time">
                      {formatRelativeTime(lastMsg?.createdAt || chat.updatedAt)}
                    </span>
                  </div>
                </div>

                <div className="conversation-bottom-row">
                  <div className="conversation-preview">
                    {isTyping ? (
                      <span className="typing-text-indicator">typing...</span>
                    ) : lastMsg ? (
                      <>
                        {isLastFromMe && (
                          <span
                            className={`preview-receipt ${
                              isLastRead ? 'read' : ''
                            }`}
                          >
                            {isLastRead ? (
                              <CheckCheck size={14} />
                            ) : (
                              <Check size={14} />
                            )}
                          </span>
                        )}
                        {chat.type === 'group' && !isLastFromMe && lastMsg.senderName && (
                          <span className="preview-sender">
                            {lastMsg.senderName.split(' ')[0]}:{' '}
                          </span>
                        )}
                        <span className="preview-text">{lastMsg.text}</span>
                      </>
                    ) : (
                      <span className="preview-empty">Start a conversation</span>
                    )}
                  </div>

                  <div className="conversation-badges">
                    {chat.unreadForMe > 0 && (
                      <span className="unread-counter-badge">
                        {chat.unreadForMe > 99 ? '99+' : chat.unreadForMe}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Hover / Context Actions */}
              <div
                className="conversation-quick-actions"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="conv-quick-btn"
                  onClick={() => toggleChatFlag(chat.id, 'pinnedBy')}
                  title={chat.isPinned ? 'Unpin chat' : 'Pin chat'}
                >
                  <Pin size={13} />
                </button>
                <button
                  type="button"
                  className="conv-quick-btn"
                  onClick={() => toggleChatFlag(chat.id, 'archivedBy')}
                  title={chat.isArchived ? 'Unarchive chat' : 'Archive chat'}
                >
                  <Archive size={13} />
                </button>
                <button
                  type="button"
                  className="conv-quick-btn conv-quick-danger"
                  onClick={() => deleteChat(chat.id)}
                  title="Delete chat"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}

        {filteredChats.length === 0 && (
          <div className="sidebar-empty-state">
            <MessageSquarePlus size={28} className="sidebar-empty-icon" />
            <p className="sidebar-empty-title">No conversations found</p>
            <p className="sidebar-empty-sub">
              {searchQuery
                ? 'Try a different search keyword'
                : 'Start chatting with friends or create a new group'}
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onOpenFriends}
            >
              Find Friends
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
