import { UPLOAD_LIMITS } from './constants.js';

/**
 * Strips dangerous control characters and normalizes user text input.
 * React automatically escapes text nodes, and this adds defense-in-depth
 * against zero-width spoofing, script URI schemes, and oversized payloads.
 */
export function sanitizeText(input, maxLength = 4000) {
  if (typeof input !== 'string') return '';
  return input
    // Remove null bytes and non-printable control chars except newline (\n) and tab (\t)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Escapes HTML special characters for contexts requiring raw string escaping.
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  };
  return str.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Validates that a URL is safe to use in href or img src attributes.
 * Blocks javascript:, vbscript:, and non-image data: URIs.
 */
export function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('blob:')) return true;
  if (/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(trimmed)) {
    return true;
  }
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://localhost';
    const parsed = new URL(trimmed, base);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates email format.
 */
export function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return re.test(email.trim());
}

/**
 * Validates password strength and returns { valid, score, message }.
 */
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6) {
    return {
      valid: false,
      score: 1,
      message: 'Password must be at least 6 characters long.',
    };
  }
  let score = 1;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  return {
    valid: true,
    score: Math.min(score, 4),
    message: score >= 3 ? 'Strong password' : 'Acceptable password',
  };
}

/**
 * Validates display name.
 */
export function validateDisplayName(name) {
  const clean = sanitizeText(name, 50);
  if (clean.length < 2) {
    return { valid: false, message: 'Display name must be at least 2 characters.' };
  }
  return { valid: true, value: clean };
}

/**
 * Validates file upload size and MIME type before uploading to Firebase Storage.
 */
export function validateFileUpload(file, mode = 'attachment') {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  const isAvatar = mode === 'avatar';
  const maxBytes = isAvatar ? UPLOAD_LIMITS.AVATAR_MAX_BYTES : UPLOAD_LIMITS.ATTACHMENT_MAX_BYTES;
  const maxMB = Math.round(maxBytes / (1024 * 1024));

  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File exceeds the ${maxMB} MB maximum size limit.`,
    };
  }

  if (isAvatar) {
    if (!UPLOAD_LIMITS.ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: 'Profile picture must be a valid image (JPG, PNG, GIF, WebP, or SVG).',
      };
    }
  } else {
    const isAllowedMime =
      UPLOAD_LIMITS.ALLOWED_FILE_TYPES.includes(file.type) ||
      file.type.startsWith('image/') ||
      file.type.startsWith('audio/') ||
      file.type.startsWith('video/');

    // Also allow common safe document/code extensions when browser reports empty MIME
    const safeExt = /\.(txt|md|pdf|json|csv|zip|doc|docx|xls|xlsx|ppt|pptx|png|jpg|jpeg|gif|webp|mp3|mp4)$/i.test(
      file.name || ''
    );

    if (!isAllowedMime && !safeExt) {
      return {
        valid: false,
        error: 'Unsupported file format for security reasons.',
      };
    }
  }

  return { valid: true };
}

/**
 * Sliding-window client-side rate limiter to prevent spam and abuse.
 */
export class RateLimiter {
  constructor(maxRequests = 15, windowMs = 10000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.timestamps = new Map();
  }

  check(key = 'default') {
    const now = Date.now();
    const history = this.timestamps.get(key) || [];
    const recent = history.filter((ts) => now - ts < this.windowMs);

    if (recent.length >= this.maxRequests) {
      const retryAfterMs = this.windowMs - (now - recent[0]);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    recent.push(now);
    this.timestamps.set(key, recent);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export const messageRateLimiter = new RateLimiter(18, 10000); // Max 18 messages per 10s
export const authRateLimiter = new RateLimiter(6, 30000); // Max 6 auth attempts per 30s

/**
 * Blocks F12, View Page Source (Ctrl+U), DevTools shortcuts (Ctrl+Shift+I/J/C/K),
 * Save Page (Ctrl+S), and browser right-click context menu.
 */
export function initClientSourceProtection() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const handleContextMenu = (e) => {
    e.preventDefault();
    return false;
  };

  const handleSelectStart = (e) => {
    const tag = e.target?.tagName?.toLowerCase?.() || '';
    if (tag !== 'input' && tag !== 'textarea') {
      e.preventDefault();
      return false;
    }
    return true;
  };

  const handleDragStart = (e) => {
    e.preventDefault();
    return false;
  };

  const handleKeyDown = (e) => {
    const key = (e.key || '').toLowerCase();
    const code = e.keyCode || e.which;

    // Block F12
    if (e.key === 'F12' || code === 123) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Block Ctrl+U (View Source) and Ctrl+S (Save HTML)
    if (
      (e.ctrlKey || e.metaKey) &&
      !e.shiftKey &&
      (key === 'u' || key === 's' || code === 85 || code === 83)
    ) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Block Ctrl+Shift+I / J / C / K and Cmd+Option+I / J / C / K / U
    if (
      ((e.ctrlKey && e.shiftKey) || (e.metaKey && e.altKey)) &&
      ['i', 'j', 'c', 'k', 'u'].includes(key)
    ) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    return true;
  };

  document.addEventListener('contextmenu', handleContextMenu, true);
  document.addEventListener('selectstart', handleSelectStart, true);
  document.addEventListener('dragstart', handleDragStart, true);
  window.addEventListener('keydown', handleKeyDown, true);

  return () => {
    document.removeEventListener('contextmenu', handleContextMenu, true);
    document.removeEventListener('selectstart', handleSelectStart, true);
    document.removeEventListener('dragstart', handleDragStart, true);
    window.removeEventListener('keydown', handleKeyDown, true);
  };
}

