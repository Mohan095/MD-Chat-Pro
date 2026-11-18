import React, { createContext, useContext, useState, useEffect } from 'react';
import { ACCENT_COLORS, CHAT_BACKGROUNDS } from '../utils/constants';

const ThemeContext = createContext(null);

const STORAGE_KEYS = {
  APPEARANCE_MODE: 'mdchat_wa_appearance_mode', // 'normal' | 'bw' | 'custom'
  THEME: 'mdchat_wa_theme_mode', // 'dark' | 'light'
  ACCENT: 'mdchat_wa_accent_color',
  WALLPAPER: 'mdchat_wa_chat_wallpaper',
  CUSTOM_COLORS: 'mdchat_wa_custom_colors',
};

const DEFAULT_CUSTOM_COLORS = {
  accent: '#00a884',
  ownBubble: '#005c4b',
  incomingBubble: '#202c33',
  chatBg: '#0b141a',
  showDoodle: true,
};

export function ThemeProvider({ children }) {
  const [appearanceMode, setAppearanceMode] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.APPEARANCE_MODE) || 'normal';
  });

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  });

  const [accentId, setAccentId] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.ACCENT) || 'whatsapp';
  });

  const [wallpaperId, setWallpaperId] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.WALLPAPER) || 'whatsapp-doodle';
  });

  const [customColors, setCustomColors] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CUSTOM_COLORS);
      return saved ? { ...DEFAULT_CUSTOM_COLORS, ...JSON.parse(saved) } : DEFAULT_CUSTOM_COLORS;
    } catch {
      return DEFAULT_CUSTOM_COLORS;
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-appearance', appearanceMode);
    localStorage.setItem(STORAGE_KEYS.APPEARANCE_MODE, appearanceMode);
  }, [appearanceMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_COLORS, JSON.stringify(customColors));
  }, [customColors]);

  useEffect(() => {
    const root = document.documentElement;

    if (appearanceMode === 'bw') {
      // Remove inline overrides so [data-appearance="bw"] CSS rules take full effect
      root.style.removeProperty('--accent-primary');
      root.style.removeProperty('--accent-secondary');
      root.style.removeProperty('--accent-glow');
      root.style.removeProperty('--bubble-own-bg');
      root.style.removeProperty('--bubble-own-solid');
      root.style.removeProperty('--bubble-incoming-bg');
      root.style.removeProperty('--bg-chat-canvas');
      return;
    }

    if (appearanceMode === 'custom') {
      root.style.setProperty('--accent-primary', customColors.accent);
      root.style.setProperty('--accent-secondary', customColors.accent);
      root.style.setProperty('--bubble-own-bg', customColors.ownBubble);
      root.style.setProperty('--bubble-own-solid', customColors.ownBubble);
      root.style.setProperty('--bubble-incoming-bg', customColors.incomingBubble);
      root.style.setProperty('--bg-chat-canvas', customColors.chatBg);
      return;
    }

    // Normal WhatsApp Mode
    const chosen = ACCENT_COLORS.find((a) => a.id === accentId) || ACCENT_COLORS[0];
    root.style.setProperty('--accent-primary', chosen.primary);
    root.style.setProperty('--accent-secondary', chosen.secondary);
    root.style.setProperty('--accent-glow', chosen.glow);
    root.style.removeProperty('--bubble-own-bg');
    root.style.removeProperty('--bubble-own-solid');
    root.style.removeProperty('--bubble-incoming-bg');
    root.style.removeProperty('--bg-chat-canvas');
    localStorage.setItem(STORAGE_KEYS.ACCENT, accentId);
  }, [appearanceMode, accentId, customColors, theme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WALLPAPER, wallpaperId);
  }, [wallpaperId]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const baseWallpaper =
    CHAT_BACKGROUNDS.find((bg) => bg.id === wallpaperId) || CHAT_BACKGROUNDS[0];

  const currentWallpaper =
    appearanceMode === 'bw'
      ? {
          ...baseWallpaper,
          style: {
            backgroundColor: 'var(--bg-chat-canvas)',
            backgroundImage: 'var(--whatsapp-doodle-svg)',
            backgroundRepeat: 'repeat',
            backgroundSize: '240px 240px',
            filter: 'grayscale(100%)',
          },
        }
      : appearanceMode === 'custom'
      ? {
          ...baseWallpaper,
          style: {
            backgroundColor: customColors.chatBg,
            backgroundImage: customColors.showDoodle
              ? 'var(--whatsapp-doodle-svg)'
              : 'none',
            backgroundRepeat: 'repeat',
            backgroundSize: '240px 240px',
          },
        }
      : baseWallpaper;

  const currentAccent =
    ACCENT_COLORS.find((a) => a.id === accentId) || ACCENT_COLORS[0];

  return (
    <ThemeContext.Provider
      value={{
        appearanceMode,
        setAppearanceMode,
        theme,
        setTheme,
        toggleTheme,
        accentId,
        setAccentId,
        currentAccent,
        wallpaperId,
        setWallpaperId,
        currentWallpaper,
        customColors,
        setCustomColors,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
