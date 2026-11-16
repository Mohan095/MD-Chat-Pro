import { getToken, onMessage } from 'firebase/messaging';
import { getMessagingInstance, vapidKey } from '../firebase/config';

/**
 * Plays a pleasant, subtle synthesized chime using the Web Audio API (no external MP3 needed).
 */
export function playNotificationSound(type = 'receive') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'send') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.09);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.09); // A5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.24);
    }
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

/**
 * Requests browser Notification permission and registers FCM token if supported.
 */
export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { granted: false, token: null };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { granted: false, token: null };
    }

    const messaging = await getMessagingInstance();
    if (messaging && vapidKey) {
      const token = await getToken(messaging, { vapidKey });
      return { granted: true, token };
    }

    return { granted: true, token: null };
  } catch {
    return { granted: false, token: null };
  }
}

/**
 * Listens for foreground Firebase Cloud Messaging push events.
 */
export async function subscribeToForegroundPush(callback) {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    callback(payload);
  });
}

/**
 * Triggers a desktop browser notification if permitted and tab is in background.
 */
export function showDesktopNotification({ title, body, onClick }) {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  ) {
    return;
  }

  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
    });
    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }
  } catch {
    // Ignore notification constructor failure
  }
}
