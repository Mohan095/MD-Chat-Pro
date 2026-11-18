export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];

export const EMOJI_CATEGORIES = [
  {
    id: 'recent',
    label: 'Popular',
    icon: '✨',
    emojis: [
      '😀', '😂', '🤣', '😊', '😍', '🥰', '😎', '🤩',
      '🥳', '🤔', '🙌', '👏', '👍', '👎', '❤️', '🔥',
      '✨', '🎉', '💯', '🚀', '⚡', '💎', '🙏', '🤝',
    ],
  },
  {
    id: 'smileys',
    label: 'Smileys',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
      '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
      '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪',
      '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨',
      '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨',
      '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒',
      '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵',
      '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟',
      '🙁', '😮', '😯', '😲', '😳', '🥺', '😦', '😧',
      '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣',
      '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠',
    ],
  },
  {
    id: 'gestures',
    label: 'Gestures',
    icon: '👋',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏',
      '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆',
      '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛',
      '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️',
      '💪', '🦾', '🫶', '🫡', '👀', '🧠', '👑', '🎯',
    ],
  },
  {
    id: 'hearts',
    label: 'Hearts & Symbols',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
      '💘', '💝', '💟', '✨', '🌟', '💫', '⭐', '🔥',
      '💥', '💯', '💢', '💨', '💦', '💤', '✅', '☑️',
      '❌', '⚠️', '🔔', '🔕', '💬', '💭', '🗯️', '♠️',
    ],
  },
  {
    id: 'objects',
    label: 'Tech & Objects',
    icon: '💻',
    emojis: [
      '💻', '🖥️', '⌨️', '🖱️', '📱', '📲', '☎️', '📞',
      '📟', '📠', '🔋', '🔌', '💾', '💿', '📷', '📸',
      '📹', '🎥', '🎧', '🎤', '🎬', '🎮', '🕹️', '🎲',
      '📚', '📖', '📝', '✏️', '📌', '📍', '📎', '🔒',
      '🔓', '🔑', '🛠️', '⚙️', '🧲', '💡', '🔦', '🏆',
      '🥇', '🎖️', '🚀', '🛸', '✈️', '☕', '🍕', '🍔',
    ],
  },
];

export const CHAT_BACKGROUNDS = [
  {
    id: 'whatsapp-doodle',
    name: 'WhatsApp Official Doodle',
    description: 'Authentic WhatsApp Web background color & doodle pattern',
    preview: 'linear-gradient(135deg, #0b141a 0%, #111b21 55%, #005c4b 100%)',
    style: {
      backgroundColor: 'var(--bg-chat-canvas)',
      backgroundImage: 'var(--whatsapp-doodle-svg)',
      backgroundRepeat: 'repeat',
      backgroundSize: '240px 240px',
    },
  },
  {
    id: 'whatsapp-beige',
    name: 'WhatsApp Classic Beige Doodle',
    description: 'Signature warm #efeae2 WhatsApp light doodle canvas',
    preview: 'linear-gradient(135deg, #efeae2 0%, #d9fdd3 100%)',
    style: {
      backgroundColor: '#efeae2',
      backgroundImage: 'var(--whatsapp-doodle-svg)',
      backgroundRepeat: 'repeat',
      backgroundSize: '240px 240px',
    },
  },
  {
    id: 'whatsapp-teal',
    name: 'Deep Emerald Doodle',
    description: 'Dark WhatsApp teal canvas with classic doodle pattern',
    preview: 'linear-gradient(135deg, #06211c 0%, #0b141a 100%)',
    style: {
      backgroundColor: '#071c18',
      backgroundImage: 'var(--whatsapp-doodle-svg)',
      backgroundRepeat: 'repeat',
      backgroundSize: '240px 240px',
    },
  },
  {
    id: 'whatsapp-midnight',
    name: 'Midnight Slate Doodle',
    description: 'Deep slate blue-charcoal with subtle WhatsApp doodles',
    preview: 'linear-gradient(135deg, #0b141a 0%, #182229 100%)',
    style: {
      backgroundColor: '#0f1922',
      backgroundImage: 'var(--whatsapp-doodle-svg)',
      backgroundRepeat: 'repeat',
      backgroundSize: '240px 240px',
    },
  },
  {
    id: 'whatsapp-burgundy',
    name: 'Warm Espresso Doodle',
    description: 'Rich dark cocoa-plum with WhatsApp doodle overlay',
    preview: 'linear-gradient(135deg, #1f1218 0%, #0b141a 100%)',
    style: {
      backgroundColor: '#171116',
      backgroundImage: 'var(--whatsapp-doodle-svg)',
      backgroundRepeat: 'repeat',
      backgroundSize: '240px 240px',
    },
  },
  {
    id: 'whatsapp-solid',
    name: 'Solid WhatsApp Dark',
    description: 'Minimal solid #0b141a background without doodle icons',
    preview: '#0b141a',
    style: {
      backgroundColor: 'var(--bg-chat-canvas)',
      backgroundImage: 'none',
    },
  },
];

export const ACCENT_COLORS = [
  {
    id: 'whatsapp',
    name: 'WhatsApp Emerald',
    primary: '#00a884',
    secondary: '#008069',
    glow: 'rgba(0, 168, 132, 0.28)',
  },
  {
    id: 'teal',
    name: 'WhatsApp Classic Teal',
    primary: '#128c7e',
    secondary: '#075e54',
    glow: 'rgba(18, 140, 126, 0.28)',
  },
  {
    id: 'neon-green',
    name: 'WhatsApp Bright Green',
    primary: '#25d366',
    secondary: '#00a884',
    glow: 'rgba(37, 211, 102, 0.28)',
  },
  {
    id: 'cyan',
    name: 'Sky Blue',
    primary: '#0284c7',
    secondary: '#0369a1',
    glow: 'rgba(2, 132, 199, 0.28)',
  },
  {
    id: 'indigo',
    name: 'Electric Indigo',
    primary: '#6366f1',
    secondary: '#4f46e5',
    glow: 'rgba(99, 102, 241, 0.28)',
  },
];

export const USER_STATUS_PRESETS = [
  { emoji: '🟢', text: 'Available' },
  { emoji: '💼', text: 'At work' },
  { emoji: '📅', text: 'In a meeting' },
  { emoji: '💻', text: 'Coding right now' },
  { emoji: '🔋', text: 'Battery about to die' },
  { emoji: '🌙', text: 'Sleeping' },
  { emoji: '🔕', text: 'Urgent calls only' },
];

export const UPLOAD_LIMITS = {
  AVATAR_MAX_BYTES: 5 * 1024 * 1024, // 5 MB
  ATTACHMENT_MAX_BYTES: 15 * 1024 * 1024, // 15 MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  ALLOWED_FILE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/zip',
    'application/x-zip-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'audio/mpeg',
    'audio/wav',
    'audio/webm',
    'video/mp4',
    'video/webm',
  ],
};
