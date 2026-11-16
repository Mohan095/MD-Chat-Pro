import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { useAuthContext } from './AuthContext';
import { useToast } from './ToastContext';
import {
  subscribeToAllUsers,
  blockUser,
  unblockUser,
} from '../services/userService';
import {
  subscribeToFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
} from '../services/friendService';
import {
  subscribeToUserChats,
  subscribeToChatMessages,
  getOrCreateDirectChat,
  createGroupChat,
  updateGroupDetails,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleMessageReaction,
  toggleStarMessage,
  markChatAsRead,
  setTypingStatus,
  toggleChatFlag,
  clearChatMessages,
  deleteOrLeaveChat,
} from '../services/chatService';
import { uploadChatAttachment } from '../services/storageService';
import {
  playNotificationSound,
  showDesktopNotification,
} from '../services/notificationService';
import { isFirebaseConfigured } from '../firebase/config';

const ChatContext = createContext(null);

const SMART_REPLIES = [
  'Got it! Looking into that right now 🚀',
  'That sounds awesome — the dark UI transitions look super clean ✨',
  'Awesome update! Let me sync with the team and follow up shortly 👍',
  '100% agreed. Our Firestore rules and real-time listeners handle that smoothly 🔒',
  'Thanks for sharing! I will review and drop my notes here.',
];

export function ChatProvider({ children }) {
  const { currentUser } = useAuthContext();
  const toast = useToast();

  const [allUsers, setAllUsers] = useState([]);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [friendRequests, setFriendRequests] = useState({
    incoming: [],
    outgoing: [],
    all: [],
  });

  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [messageSearchTerm, setMessageSearchTerm] = useState('');
  const [sidebarFilter, setSidebarFilter] = useState('all'); // all | unread | groups | archived
  const [showInfoPanel, setShowInfoPanel] = useState(false);

  const prevChatsRef = useRef([]);

  // Subscribe to all users
  useEffect(() => {
    if (!currentUser?.uid) {
      setAllUsers([]);
      return () => {};
    }
    return subscribeToAllUsers((users) => {
      setAllUsers(users);
    });
  }, [currentUser?.uid]);

  // Subscribe to friend requests
  useEffect(() => {
    if (!currentUser?.uid) {
      setFriendRequests({ incoming: [], outgoing: [], all: [] });
      return () => {};
    }
    return subscribeToFriendRequests(currentUser.uid, (reqs) => {
      setFriendRequests(reqs);
    });
  }, [currentUser?.uid]);

  // Subscribe to user conversations
  useEffect(() => {
    if (!currentUser?.uid) {
      setChats([]);
      setActiveChatId(null);
      return () => {};
    }

    return subscribeToUserChats(currentUser.uid, (updatedChats) => {
      // Detect new incoming messages in background chats to play chime / toast
      const prevChats = prevChatsRef.current;
      if (prevChats.length > 0) {
        updatedChats.forEach((chat) => {
          const prev = prevChats.find((p) => p.id === chat.id);
          const isMuted = (chat.mutedBy || []).includes(currentUser.uid);
          if (
            prev &&
            chat.lastMessage?.id &&
            chat.lastMessage.id !== prev.lastMessage?.id &&
            chat.lastMessage.senderId !== currentUser.uid &&
            !isMuted
          ) {
            if (currentUser.notificationSettings?.soundEffects !== false) {
              playNotificationSound('receive');
            }
            if (chat.id !== activeChatId) {
              const preview =
                currentUser.notificationSettings?.messagePreview !== false
                  ? chat.lastMessage.text
                  : 'New message received';
              toast.message(preview, chat.lastMessage.senderName || 'New Message');
              if (currentUser.notificationSettings?.desktopNotifications) {
                showDesktopNotification({
                  title: chat.lastMessage.senderName || 'MD Chat Pro',
                  body: preview,
                  onClick: () => setActiveChatId(chat.id),
                });
              }
            }
          }
        });
      }

      prevChatsRef.current = updatedChats;
      setChats(updatedChats);
    });
  }, [currentUser?.uid, currentUser?.notificationSettings, activeChatId]);

  // Subscribe to active chat messages
  useEffect(() => {
    if (!activeChatId || !currentUser?.uid) {
      setMessages([]);
      return () => {};
    }

    setReplyingTo(null);
    setEditingMessage(null);
    setMessageSearchTerm('');

    const sendReceipts = currentUser.privacySettings?.showReadReceipts !== false;
    markChatAsRead(activeChatId, currentUser.uid, sendReceipts);

    return subscribeToChatMessages(activeChatId, (chatMsgs) => {
      setMessages(chatMsgs);
      const hasUnreadFromOthers = chatMsgs.some(
        (m) => m.senderId !== currentUser.uid && !(m.readBy || []).includes(currentUser.uid)
      );
      if (hasUnreadFromOthers) {
        markChatAsRead(activeChatId, currentUser.uid, sendReceipts);
      }
    });
  }, [activeChatId, currentUser?.uid, currentUser?.privacySettings?.showReadReceipts]);

  // Map users by UID for instant O(1) lookup
  const usersMap = useMemo(() => {
    const map = {};
    allUsers.forEach((u) => {
      map[u.uid] = u;
    });
    if (currentUser?.uid) {
      map[currentUser.uid] = currentUser;
    }
    return map;
  }, [allUsers, currentUser]);

  // Enrich chats with display name, avatar, otherUser (for direct chats), and online status
  const enrichedChats = useMemo(() => {
    if (!currentUser?.uid) return [];
    return chats.map((chat) => {
      if (chat.type === 'group') {
        const memberProfiles = (chat.participants || [])
          .map((uid) => usersMap[uid])
          .filter(Boolean);
        const onlineCount = memberProfiles.filter((m) => m.online).length;
        return {
          ...chat,
          displayTitle: chat.name || 'Group Chat',
          displayAvatar: chat.avatar || '',
          displaySubtitle: `${chat.participants?.length || 0} members • ${onlineCount} online`,
          isOnline: onlineCount > 1,
          otherUser: null,
          memberProfiles,
          unreadForMe: chat.unreadCount?.[currentUser.uid] || 0,
          isPinned: (chat.pinnedBy || []).includes(currentUser.uid),
          isMuted: (chat.mutedBy || []).includes(currentUser.uid),
          isArchived: (chat.archivedBy || []).includes(currentUser.uid),
        };
      }

      const otherUid =
        (chat.participants || []).find((id) => id !== currentUser.uid) || currentUser.uid;
      const otherUser = usersMap[otherUid] || {
        uid: otherUid,
        displayName: 'MD Chat User',
        username: 'user',
        online: false,
      };

      const isBlockedByMe = (currentUser.blockedUsers || []).includes(otherUid);
      const hasBlockedMe = (otherUser.blockedUsers || []).includes(currentUser.uid);

      return {
        ...chat,
        displayTitle: otherUser.displayName || 'User',
        displayAvatar: otherUser.photoURL || '',
        displaySubtitle: otherUser.statusText || otherUser.bio || '',
        isOnline:
          otherUser.online && otherUser.privacySettings?.showOnlineStatus !== false,
        otherUser,
        isBlockedByMe,
        hasBlockedMe,
        memberProfiles: [currentUser, otherUser],
        unreadForMe: chat.unreadCount?.[currentUser.uid] || 0,
        isPinned: (chat.pinnedBy || []).includes(currentUser.uid),
        isMuted: (chat.mutedBy || []).includes(currentUser.uid),
        isArchived: (chat.archivedBy || []).includes(currentUser.uid),
      };
    });
  }, [chats, usersMap, currentUser]);

  const activeChat = useMemo(() => {
    return enrichedChats.find((c) => c.id === activeChatId) || null;
  }, [enrichedChats, activeChatId]);

  // Compute active typing users in the current chat (excluding self, expiring after 6s)
  const activeTypingUsers = useMemo(() => {
    if (!activeChat?.typing || !currentUser?.uid) return [];
    const now = Date.now();
    return Object.entries(activeChat.typing)
      .filter(([uid, ts]) => uid !== currentUser.uid && ts && now - ts < 8000)
      .map(([uid]) => usersMap[uid]?.displayName || 'Someone');
  }, [activeChat, currentUser?.uid, usersMap]);

  // Real contacts & online friends (excludes self and blocked users)
  const friendsList = useMemo(() => {
    const blockedSet = new Set(currentUser?.blockedUsers || []);
    return allUsers.filter(
      (u) => u?.uid && u.uid !== currentUser?.uid && !blockedSet.has(u.uid)
    );
  }, [allUsers, currentUser?.uid, currentUser?.blockedUsers]);

  const onlineFriends = useMemo(() => {
    return friendsList.filter(
      (f) => f.online && f.privacySettings?.showOnlineStatus !== false
    );
  }, [friendsList]);

  const blockedUsersList = useMemo(() => {
    const blockedIds = currentUser?.blockedUsers || [];
    return blockedIds.map((uid) => usersMap[uid]).filter(Boolean);
  }, [currentUser?.blockedUsers, usersMap]);

  const totalUnreadCount = useMemo(() => {
    return enrichedChats.reduce((acc, c) => acc + (c.unreadForMe || 0), 0);
  }, [enrichedChats]);

  // Start or open a direct chat with a user
  const openDirectChat = useCallback(
    async (targetUser) => {
      if (!currentUser?.uid || !targetUser?.uid) return null;
      const chat = await getOrCreateDirectChat(currentUser, targetUser);
      setActiveChatId(chat.id);
      return chat;
    },
    [currentUser]
  );

  // Create a new group chat
  const handleCreateGroup = useCallback(
    async ({ name, description, avatar, memberUids }) => {
      if (!currentUser?.uid) return null;
      const group = await createGroupChat({
        name,
        description,
        avatar,
        creator: currentUser,
        memberUids,
      });
      setActiveChatId(group.id);
      toast.success(`Group "${name}" created!`);
      return group;
    },
    [currentUser, toast]
  );

  // Send a message (with simulated real-time contact reply in local demo mode)
  const handleSendMessage = useCallback(
    async ({ text = '', type = 'text', attachments = [] }) => {
      if (!activeChat || !currentUser?.uid) return;

      if (activeChat.isBlockedByMe) {
        toast.error('You have blocked this user. Unblock them to send messages.');
        return;
      }
      if (activeChat.hasBlockedMe) {
        toast.error('You cannot send messages to this conversation.');
        return;
      }

      const sent = await sendMessage({
        chatId: activeChat.id,
        sender: currentUser,
        text,
        type,
        attachments,
        replyTo: replyingTo,
      });

      if (currentUser.notificationSettings?.soundEffects !== false) {
        playNotificationSound('send');
      }
      setReplyingTo(null);

      return sent;
    },
    [activeChat, currentUser, replyingTo, toast]
  );

  const handleUploadAndSendAttachment = useCallback(
    async (file, caption = '', onProgress) => {
      if (!activeChat || !currentUser?.uid) return;
      const uploaded = await uploadChatAttachment({
        chatId: activeChat.id,
        senderId: currentUser.uid,
        file,
        onProgress,
      });
      const isImg = (file.type || '').startsWith('image/');
      return handleSendMessage({
        text: caption,
        type: isImg ? 'image' : 'file',
        attachments: [uploaded],
      });
    },
    [activeChat, currentUser, handleSendMessage]
  );

  const handleEditMessage = useCallback(
    async (messageId, newText, newAttachments, newImageFile) => {
      if (!activeChatId || !currentUser?.uid) return;

      let resolvedAttachments = newAttachments;
      if (newImageFile) {
        const uploaded = await uploadChatAttachment({
          chatId: activeChatId,
          senderId: currentUser.uid,
          file: newImageFile,
        });
        resolvedAttachments = [uploaded];
      }

      await editMessage({
        chatId: activeChatId,
        messageId,
        senderId: currentUser.uid,
        newText,
        newAttachments: resolvedAttachments,
      });
      setEditingMessage(null);
      toast.success('Message updated');
    },
    [activeChatId, currentUser?.uid, toast]
  );

  const handleDeleteMessage = useCallback(
    async (messageId) => {
      if (!activeChatId || !currentUser?.uid) return;
      await deleteMessage({
        chatId: activeChatId,
        messageId,
        senderId: currentUser.uid,
      });
      toast.info('Message deleted');
    },
    [activeChatId, currentUser?.uid, toast]
  );

  const handleReaction = useCallback(
    async (messageId, emoji) => {
      if (!activeChatId || !currentUser?.uid) return;
      await toggleMessageReaction({
        chatId: activeChatId,
        messageId,
        uid: currentUser.uid,
        emoji,
      });
    },
    [activeChatId, currentUser?.uid]
  );

  const handleToggleStar = useCallback(
    async (messageId) => {
      if (!activeChatId || !currentUser?.uid) return;
      await toggleStarMessage({
        chatId: activeChatId,
        messageId,
        uid: currentUser.uid,
      });
    },
    [activeChatId, currentUser?.uid]
  );

  const handleTyping = useCallback(
    (isTyping) => {
      if (!activeChatId || !currentUser?.uid) return;
      setTypingStatus(activeChatId, currentUser.uid, isTyping);
    },
    [activeChatId, currentUser?.uid]
  );

  const handleSendFriendRequest = useCallback(
    async (targetUser) => {
      if (!currentUser) return;
      await sendFriendRequest(currentUser, targetUser);
      toast.success(`Friend request sent to ${targetUser.displayName}`);
    },
    [currentUser, toast]
  );

  const handleAcceptFriendRequest = useCallback(
    async (request) => {
      await acceptFriendRequest(request);
      toast.success(`You and ${request.fromUser?.displayName || 'user'} are now friends!`);
    },
    [toast]
  );

  const handleRejectFriendRequest = useCallback(
    async (requestId) => {
      await rejectFriendRequest(requestId);
      toast.info('Friend request removed');
    },
    [toast]
  );

  const handleRemoveFriend = useCallback(
    async (friendUid) => {
      if (!currentUser?.uid) return;
      await removeFriend(currentUser.uid, friendUid);
      toast.info('Removed from friends list');
    },
    [currentUser?.uid, toast]
  );

  const handleBlockUser = useCallback(
    async (targetUid) => {
      if (!currentUser?.uid) return;
      await blockUser(currentUser.uid, targetUid);
      toast.warning('User has been blocked');
    },
    [currentUser?.uid, toast]
  );

  const handleUnblockUser = useCallback(
    async (targetUid) => {
      if (!currentUser?.uid) return;
      await unblockUser(currentUser.uid, targetUid);
      toast.success('User unblocked');
    },
    [currentUser?.uid, toast]
  );

  const handleToggleChatFlag = useCallback(
    async (chatId, field) => {
      if (!currentUser?.uid) return;
      const added = await toggleChatFlag(chatId, currentUser.uid, field);
      const labels = {
        pinnedBy: added ? 'Conversation pinned' : 'Conversation unpinned',
        mutedBy: added ? 'Notifications muted' : 'Notifications unmuted',
        archivedBy: added ? 'Conversation archived' : 'Conversation unarchived',
      };
      if (labels[field]) toast.info(labels[field]);
    },
    [currentUser?.uid, toast]
  );

  const handleClearChat = useCallback(
    async (chatId) => {
      await clearChatMessages(chatId);
      toast.info('Chat history cleared');
    },
    [toast]
  );

  const handleDeleteChat = useCallback(
    async (chatId) => {
      if (!currentUser?.uid) return;
      await deleteOrLeaveChat(chatId, currentUser.uid);
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }
      toast.info('Conversation removed');
    },
    [currentUser?.uid, activeChatId, toast]
  );

  return (
    <ChatContext.Provider
      value={{
        allUsers,
        usersMap,
        chats: enrichedChats,
        activeChatId,
        setActiveChatId,
        activeChat,
        messages,
        activeTypingUsers,
        friendsList,
        onlineFriends,
        blockedUsersList,
        friendRequests,
        totalUnreadCount,
        replyingTo,
        setReplyingTo,
        editingMessage,
        setEditingMessage,
        messageSearchTerm,
        setMessageSearchTerm,
        sidebarFilter,
        setSidebarFilter,
        showInfoPanel,
        setShowInfoPanel,
        openDirectChat,
        createGroup: handleCreateGroup,
        updateGroup: updateGroupDetails,
        sendMessage: handleSendMessage,
        uploadAndSendAttachment: handleUploadAndSendAttachment,
        editMessage: handleEditMessage,
        deleteMessage: handleDeleteMessage,
        reactToMessage: handleReaction,
        toggleStarMessage: handleToggleStar,
        setTyping: handleTyping,
        sendFriendRequest: handleSendFriendRequest,
        acceptFriendRequest: handleAcceptFriendRequest,
        rejectFriendRequest: handleRejectFriendRequest,
        removeFriend: handleRemoveFriend,
        blockUser: handleBlockUser,
        unblockUser: handleUnblockUser,
        toggleChatFlag: handleToggleChatFlag,
        clearChat: handleClearChat,
        deleteChat: handleDeleteChat,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return ctx;
}
