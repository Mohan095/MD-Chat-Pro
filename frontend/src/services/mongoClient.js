const API_BASE = '/api/mongo';

const listeners = new Map();

export function notifyMongoSubscribers(topicPrefix) {
  listeners.forEach((callbacks, key) => {
    if (!topicPrefix || key.startsWith(topicPrefix)) {
      callbacks.forEach((fn) => {
        try {
          fn();
        } catch {
          // Ignore subscriber errors
        }
      });
    }
  });
}

export async function mongoGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${API_BASE}?${qs}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `MongoDB GET ${action} failed (${res.status})`);
  }
  return data;
}

export async function mongoPost(action, payload = {}, notifyTopics = []) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `MongoDB POST ${action} failed (${res.status})`);
  }
  if (Array.isArray(notifyTopics)) {
    notifyTopics.forEach((topic) => notifyMongoSubscribers(topic));
  }
  return data;
}

export function createMongoSubscription({
  topic,
  fetcher,
  intervalMs = 2000,
  onData,
  onError,
}) {
  let active = true;
  let inFlight = false;
  let lastJson = '';

  const runFetch = async (force = false) => {
    if (!active || inFlight) return;
    if (!force && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    inFlight = true;
    try {
      const result = await fetcher();
      if (!active) return;
      const serialized = JSON.stringify(result);
      if (force || serialized !== lastJson) {
        lastJson = serialized;
        onData(result);
      }
    } catch (err) {
      if (active && onError) onError(err);
    } finally {
      inFlight = false;
    }
  };

  if (!listeners.has(topic)) {
    listeners.set(topic, new Set());
  }
  const triggerNow = () => runFetch(true);
  listeners.get(topic).add(triggerNow);

  runFetch(true);
  const timer = setInterval(() => runFetch(false), intervalMs);

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      runFetch(true);
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  return () => {
    active = false;
    clearInterval(timer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
    const set = listeners.get(topic);
    if (set) {
      set.delete(triggerNow);
      if (set.size === 0) listeners.delete(topic);
    }
  };
}
