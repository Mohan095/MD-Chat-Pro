import React, { useState } from 'react';
import { X, Users, Search, Check, Sparkles } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { useAuth } from '../hooks/useAuth';
import Avatar from './Avatar';

export default function CreateGroupModal({ isOpen, onClose }) {
  const { currentUser } = useAuth();
  const { allUsers, createGroup } = useChat();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUids, setSelectedUids] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const availableUsers = allUsers
    .filter((u) => u.uid !== currentUser?.uid)
    .filter((u) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        u.displayName?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      );
    });

  const toggleMember = (uid) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter a group name.');
      return;
    }
    if (selectedUids.length === 0) {
      setError('Please select at least 1 member to add to the group.');
      return;
    }

    try {
      setSubmitting(true);
      await createGroup({
        name: name.trim(),
        description: description.trim(),
        memberUids: selectedUids,
      });
      setName('');
      setDescription('');
      setSelectedUids([]);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create group.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-title-icon">
              <Users size={20} />
            </div>
            <div>
              <h3 className="modal-title">Create Group Workspace</h3>
              <p className="modal-subtitle">Collaborate with friends and team members in real time</p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {error && <div className="form-alert form-alert-error">{error}</div>}

          <div className="form-group">
            <label className="form-label">Group Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., Design Systems Guild, Project Launch 🚀"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description (Optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="What is this group conversation about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={180}
            />
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label">Select Members ({selectedUids.length} selected)</label>
            </div>
            <div className="search-input-wrap">
              <Search size={15} className="search-input-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search contacts by name or username..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="member-picker-list">
              {availableUsers.map((user) => {
                const isSelected = selectedUids.includes(user.uid);
                return (
                  <div
                    key={user.uid}
                    className={`member-picker-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleMember(user.uid)}
                  >
                    <Avatar
                      src={user.photoURL}
                      name={user.displayName}
                      size="sm"
                      online={user.online}
                      showStatus
                    />
                    <div className="member-picker-info">
                      <div className="member-picker-name">{user.displayName}</div>
                      <div className="member-picker-sub">@{user.username || 'user'}</div>
                    </div>
                    <div className={`member-checkbox ${isSelected ? 'checked' : ''}`}>
                      {isSelected && <Check size={14} />}
                    </div>
                  </div>
                );
              })}
              {availableUsers.length === 0 && (
                <div className="member-picker-empty">No matching users found.</div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              <Sparkles size={16} />
              <span>{submitting ? 'Creating...' : 'Create Group'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
