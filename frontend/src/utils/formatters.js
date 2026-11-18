/**
 * Converts a Firestore Timestamp, Date, ISO string, or epoch number into a Date object.
 */
export function toDate(value) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Formats message timestamp as "6:05 PM".
 */
export function formatMessageTime(timestamp) {
  if (!timestamp) return '';
  const date = toDate(timestamp);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Formats relative conversation timestamp for the sidebar ("Just now", "12m", "Yesterday", "Nov 14").
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const date = toDate(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 45) return 'Just now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Formats date headers between message groups ("Today", "Yesterday", "Monday, Nov 16").
 */
export function formatDateSeparator(timestamp) {
  if (!timestamp) return 'Today';
  const date = toDate(timestamp);
  const now = new Date();

  const isSameDay = (a, b) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();

  if (isSameDay(date, now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Checks whether two timestamps fall on the same calendar day.
 */
export function isSameCalendarDay(tsA, tsB) {
  if (!tsA || !tsB) return false;
  const a = toDate(tsA);
  const b = toDate(tsB);
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

/**
 * Formats user presence status ("Online" or "Last seen today at 5:45 PM").
 */
export function formatPresenceStatus(user) {
  if (!user) return 'Offline';
  if (user.online) return 'Online';
  if (user.privacySettings?.showLastSeen === false) return 'Offline';
  if (!user.lastSeen) return 'Offline';

  const date = toDate(user.lastSeen);
  const now = new Date();
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isSameCalendarDay(date, now)) {
    return `Last seen today at ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameCalendarDay(date, yesterday)) {
    return `Last seen yesterday at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `Last seen ${dateStr} at ${timeStr}`;
}

/**
 * Formats file byte size into human-readable string.
 */
export function formatFileSize(bytes) {
  if (!bytes || Number.isNaN(Number(bytes))) return '0 B';
  const num = Number(bytes);
  if (num < 1024) return `${num} B`;
  const kb = num / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

/**
 * Generates 1-2 character uppercase initials from a name or email.
 */
export function getInitials(name = '') {
  const cleaned = String(name || 'User').trim();
  if (!cleaned) return 'U';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Returns a deterministic gradient background for avatars based on user ID or name.
 */
export function getAvatarGradient(seed = '') {
  const gradients = [
    'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
    'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    'linear-gradient(135deg, #f43f5e 0%, #ec4899 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
    'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
    'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
    'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
  ];
  let hash = 0;
  const str = String(seed || 'mdchat');
  for (let i = 0; i < str.length; i += 1) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

/**
 * Parses inline markdown & URLs into safe structured tokens for MessageBubble rendering
 * without using dangerouslySetInnerHTML.
 * Supports: ```codeblocks```, `inline code`, **bold**, *italic*, ~~strikethrough~~, and https:// links.
 */
export function parseMessageTokens(text) {
  if (!text || typeof text !== 'string') return [];

  // Split by fenced code blocks first: ```lang\ncode```
  const blockSegments = text.split(/(```[\s\S]*?```)/g);
  const tokens = [];

  blockSegments.forEach((segment, blockIdx) => {
    if (segment.startsWith('```') && segment.endsWith('```') && segment.length > 6) {
      const inner = segment.slice(3, -3);
      const firstNewline = inner.indexOf('\n');
      let language = '';
      let code = inner;
      if (firstNewline !== -1) {
        const firstLine = inner.slice(0, firstNewline).trim();
        if (/^[a-zA-Z0-9_-]{1,15}$/.test(firstLine)) {
          language = firstLine;
          code = inner.slice(firstNewline + 1);
        }
      }
      tokens.push({
        type: 'codeblock',
        key: `cb-${blockIdx}`,
        language,
        content: code.trim(),
      });
      return;
    }

    // Parse inline patterns: `code`, **bold**, ~~strike~~, *italic*, https://...
    const inlineRegex = /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*|https?:\/\/[^\s<]+)/g;
    let lastIndex = 0;
    let match;

    while ((match = inlineRegex.exec(segment)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({
          type: 'text',
          key: `txt-${blockIdx}-${lastIndex}`,
          content: segment.slice(lastIndex, match.index),
        });
      }

      const token = match[0];
      const key = `inl-${blockIdx}-${match.index}`;

      if (token.startsWith('`') && token.endsWith('`')) {
        tokens.push({ type: 'code', key, content: token.slice(1, -1) });
      } else if (token.startsWith('**') && token.endsWith('**')) {
        tokens.push({ type: 'bold', key, content: token.slice(2, -2) });
      } else if (token.startsWith('~~') && token.endsWith('~~')) {
        tokens.push({ type: 'strike', key, content: token.slice(2, -2) });
      } else if (token.startsWith('*') && token.endsWith('*')) {
        tokens.push({ type: 'italic', key, content: token.slice(1, -1) });
      } else if (/^https?:\/\//i.test(token)) {
        tokens.push({ type: 'link', key, content: token, href: token });
      } else {
        tokens.push({ type: 'text', key, content: token });
      }

      lastIndex = inlineRegex.lastIndex;
    }

    if (lastIndex < segment.length) {
      tokens.push({
        type: 'text',
        key: `txt-${blockIdx}-end`,
        content: segment.slice(lastIndex),
      });
    }
  });

  return tokens;
}
