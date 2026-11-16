import React, { useState } from 'react';
import MainLayout from '../layouts/MainLayout';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import UserInfoPanel from '../components/UserInfoPanel';
import FriendsDirectory from '../components/FriendsDirectory';
import ProfilePage from './ProfilePage';
import SettingsPage from './SettingsPage';
import CreateGroupModal from '../components/CreateGroupModal';
import { useChat } from '../hooks/useChat';
import { useResponsive } from '../hooks/useResponsive';

export default function ChatPage() {
  const {
    activeChatId,
    setActiveChatId,
    showInfoPanel,
    setShowInfoPanel,
  } = useChat();
  const { isMobile } = useResponsive();

  const [activeNav, setActiveNav] = useState('chats'); // chats | friends | profile | settings
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  const handleSelectNav = (tab) => {
    setActiveNav(tab);
  };

  const handleSelectChatFromDirectory = (chatId) => {
    setActiveChatId(chatId);
    setActiveNav('chats');
  };

  return (
    <MainLayout
      activeNav={activeNav}
      onSelectNav={handleSelectNav}
      onOpenNewGroup={() => setGroupModalOpen(true)}
    >
      {activeNav === 'chats' && (
        <div className="chat-workspace-grid">
          {/* Show Sidebar on Desktop/Tablet always, or on Mobile when no active chat is open */}
          {(!isMobile || !activeChatId) && (
            <Sidebar
              onOpenNewGroup={() => setGroupModalOpen(true)}
              onOpenFriends={() => setActiveNav('friends')}
              onSelectChatMobile={(id) => setActiveChatId(id)}
            />
          )}

          {/* Show ChatWindow on Desktop/Tablet always, or on Mobile when an active chat is selected */}
          {(!isMobile || activeChatId) && (
            <ChatWindow
              onBackMobile={isMobile ? () => setActiveChatId(null) : null}
              onOpenNewGroup={() => setGroupModalOpen(true)}
              onOpenFriends={() => setActiveNav('friends')}
            />
          )}

          {/* Collapsible Right User / Group Info Panel */}
          {showInfoPanel && activeChatId && (
            <UserInfoPanel onClose={() => setShowInfoPanel(false)} />
          )}
        </div>
      )}

      {activeNav === 'friends' && (
        <FriendsDirectory onSelectChat={handleSelectChatFromDirectory} />
      )}

      {activeNav === 'profile' && <ProfilePage />}

      {activeNav === 'settings' && <SettingsPage />}

      <CreateGroupModal
        isOpen={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
      />
    </MainLayout>
  );
}
