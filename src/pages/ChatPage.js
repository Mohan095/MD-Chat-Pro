import React, { useState, useEffect, lazy, Suspense, startTransition } from 'react';
import MainLayout from '../layouts/MainLayout';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import { useChat } from '../hooks/useChat';
import { useAuth } from '../hooks/useAuth';
import { useResponsive } from '../hooks/useResponsive';
import { subscribeToIncomingCalls } from '../services/callService';

const UserInfoPanel = lazy(() => import('../components/UserInfoPanel'));
const FriendsDirectory = lazy(() => import('../components/FriendsDirectory'));
const ProfilePage = lazy(() => import('./ProfilePage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const CreateGroupModal = lazy(() => import('../components/CreateGroupModal'));
const CallModal = lazy(() => import('../components/CallModal'));

export default function ChatPage() {
  const { currentUser } = useAuth();
  const {
    activeChatId,
    setActiveChatId,
    showInfoPanel,
    setShowInfoPanel,
  } = useChat();
  const { isMobile } = useResponsive();

  const [activeNav, setActiveNav] = useState('chats'); // chats | friends | profile | settings
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);

  useEffect(() => {
    if (!currentUser?.uid) {
      setIncomingCall(null);
      return () => {};
    }
    return subscribeToIncomingCalls(currentUser.uid, (callDoc) => {
      if (!callDoc) {
        setIncomingCall(null);
        return;
      }
      setIncomingCall({
        direction: 'incoming',
        callId: callDoc.id,
        chatId: callDoc.chatId,
        type: callDoc.type || 'voice',
        offer: callDoc.offer,
        title: callDoc.callerName || 'Incoming Call',
        avatar: callDoc.callerAvatar || '',
        isGroup: Boolean(callDoc.isGroup),
      });
    });
  }, [currentUser?.uid]);

  const handleSelectNav = (tab) => {
    startTransition(() => {
      setActiveNav(tab);
    });
  };

  const handleSelectChatFromDirectory = (chatId) => {
    startTransition(() => {
      setActiveChatId(chatId);
      setActiveNav('chats');
    });
  };

  return (
    <MainLayout
      activeNav={activeNav}
      onSelectNav={handleSelectNav}
      onOpenNewGroup={() => setGroupModalOpen(true)}
    >
      <div
        className="chat-workspace-grid"
        style={{ display: activeNav === 'chats' ? undefined : 'none' }}
      >
        {/* Show Sidebar on Desktop/Tablet always, or on Mobile when no active chat is open */}
        {(!isMobile || !activeChatId) && (
          <Sidebar
            onOpenNewGroup={() => setGroupModalOpen(true)}
            onOpenFriends={() => handleSelectNav('friends')}
            onSelectChatMobile={(id) => setActiveChatId(id)}
          />
        )}

        {/* Show ChatWindow on Desktop/Tablet always, or on Mobile when an active chat is selected */}
        {(!isMobile || activeChatId) && (
          <ChatWindow
            onBackMobile={isMobile ? () => setActiveChatId(null) : null}
            onOpenNewGroup={() => setGroupModalOpen(true)}
            onOpenFriends={() => handleSelectNav('friends')}
          />
        )}

        {/* Collapsible Right User / Group Info Panel */}
        {showInfoPanel && activeChatId && (
          <Suspense fallback={null}>
            <UserInfoPanel onClose={() => setShowInfoPanel(false)} />
          </Suspense>
        )}
      </div>

      <Suspense fallback={null}>
        {activeNav === 'friends' && (
          <FriendsDirectory onSelectChat={handleSelectChatFromDirectory} />
        )}

        {activeNav === 'profile' && <ProfilePage />}

        {activeNav === 'settings' && <SettingsPage />}

        {groupModalOpen && (
          <CreateGroupModal
            isOpen={groupModalOpen}
            onClose={() => setGroupModalOpen(false)}
          />
        )}

        {incomingCall && (
          <CallModal
            callState={incomingCall}
            onEndCall={() => setIncomingCall(null)}
          />
        )}
      </Suspense>
    </MainLayout>
  );
}
