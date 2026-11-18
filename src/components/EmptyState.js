import React from 'react';
import { MessageSquare, Users, Sparkles, ShieldCheck } from 'lucide-react';

export default function EmptyState({
  icon: CustomIcon,
  title = 'Select a conversation',
  description = 'Choose an existing chat from the sidebar, start a new group workspace, or connect with friends to begin messaging in real time.',
  onNewChat,
  onNewGroup,
  showFeaturePills = false,
}) {
  const IconComponent = CustomIcon || MessageSquare;

  return (
    <div className="empty-state-container">
      <div className="empty-state-card">
        <div className="empty-state-icon-glow">
          <IconComponent size={36} />
        </div>
        <h2 className="empty-state-title">{title}</h2>
        <p className="empty-state-description">{description}</p>

        {(onNewChat || onNewGroup) && (
          <div className="empty-state-actions">
            {onNewChat && (
              <button type="button" className="btn btn-primary" onClick={onNewChat}>
                <MessageSquare size={17} />
                <span>Find People &amp; Chat</span>
              </button>
            )}
            {onNewGroup && (
              <button type="button" className="btn btn-secondary" onClick={onNewGroup}>
                <Users size={17} />
                <span>Create Group</span>
              </button>
            )}
          </div>
        )}

        {showFeaturePills && (
          <div className="empty-state-features">
            <div className="feature-chip">
              <Sparkles size={14} />
              <span>Markdown &amp; Code Blocks</span>
            </div>
            <div className="feature-chip">
              <ShieldCheck size={14} />
              <span>Firebase Protected</span>
            </div>
            <div className="feature-chip">
              <Users size={14} />
              <span>Real-Time Presence</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
