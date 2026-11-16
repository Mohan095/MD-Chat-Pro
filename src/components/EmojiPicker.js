import React, { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { EMOJI_CATEGORIES, QUICK_REACTIONS } from '../utils/constants';

export default function EmojiPicker({ onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].id);
  const [search, setSearch] = useState('');

  const currentCategory = useMemo(() => {
    return (
      EMOJI_CATEGORIES.find((c) => c.id === activeCategory) || EMOJI_CATEGORIES[0]
    );
  }, [activeCategory]);

  const displayedEmojis = useMemo(() => {
    if (!search.trim()) return currentCategory.emojis;
    // Flatten all unique emojis when searching
    const all = Array.from(
      new Set(EMOJI_CATEGORIES.flatMap((c) => c.emojis))
    );
    return all;
  }, [search, currentCategory]);

  return (
    <div className="emoji-picker-popover" onClick={(e) => e.stopPropagation()}>
      <div className="emoji-picker-header">
        <div className="emoji-quick-row">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="emoji-quick-btn"
              onClick={() => onSelect(emoji)}
              title={`Insert ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        {onClose && (
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            onClick={onClose}
            aria-label="Close emoji picker"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="emoji-search-box">
        <Search size={14} className="emoji-search-icon" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Browse emojis..."
          className="emoji-search-input"
        />
      </div>

      <div className="emoji-category-tabs">
        {EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`emoji-cat-tab ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
            title={cat.label}
          >
            <span>{cat.icon}</span>
            <span className="emoji-cat-label">{cat.label}</span>
          </button>
        ))}
      </div>

      <div className="emoji-grid">
        {displayedEmojis.map((emoji, idx) => (
          <button
            key={`${emoji}-${idx}`}
            type="button"
            className="emoji-cell-btn"
            onClick={() => onSelect(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
