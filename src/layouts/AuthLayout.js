import React from 'react';
import {
  MessageSquareCode,
  ShieldCheck,
  Zap,
  Users,
  Sun,
  Moon,
  Sparkles,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { isFirebaseConfigured, firebaseConfig } from '../firebase/config';

export default function AuthLayout({ children }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="auth-layout">
      {/* Ambient Background Glows */}
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />

      <div className="auth-shell">
        {/* Left Brand Showcase Panel */}
        <div className="auth-showcase-panel">
          <div className="auth-brand-header">
            <div className="auth-logo-mark">
              <MessageSquareCode size={26} />
            </div>
            <div>
              <span className="auth-brand-name">MD Chat Pro</span>
              <span className="auth-brand-badge">v2.0 PRO</span>
            </div>
          </div>

          <div className="auth-hero-copy">
            <div className="auth-pill-tag">
              <Sparkles size={13} />
              <span>Real-Time Cloud Messaging Platform</span>
            </div>
            <h1 className="auth-hero-heading">
              Connect, collaborate, and ship faster in{' '}
              <span className="text-gradient">real time.</span>
            </h1>
            <p className="auth-hero-description">
              Experience ultra-low-latency one-to-one and group messaging with
              live typing indicators, read receipts, markdown code blocks, media
              sharing, and enterprise-grade Firebase security.
            </p>
          </div>

          <div className="auth-feature-list">
            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <Zap size={18} />
              </div>
              <div>
                <h4>Instant Message Synchronization</h4>
                <p>
                  Sub-second delivery with live typing indicators, emoji
                  reactions, replies, and double-check read receipts.
                </p>
              </div>
            </div>

            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <Users size={18} />
              </div>
              <div>
                <h4>Rich Group Workspaces &amp; Media</h4>
                <p>
                  Create dedicated team channels, share high-res images and
                  files, and manage friends and presence effortlessly.
                </p>
              </div>
            </div>

            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h4>Firebase Security Architecture</h4>
                <p>
                  Protected by strict Firestore &amp; Storage rules, XSS
                  sanitization, and participant-only access controls.
                </p>
              </div>
            </div>
          </div>

          <div className="auth-showcase-footer">
            <span className="firebase-status-pill">
              <span className="status-dot-live" />
              End-to-End Protected Real-Time Messaging
            </span>
          </div>
        </div>

        {/* Right Interactive Auth Form Panel */}
        <div className="auth-form-panel">
          <div className="auth-panel-topbar">
            <div className="auth-mobile-brand">
              <div className="auth-logo-mark">
                <MessageSquareCode size={20} />
              </div>
              <span className="auth-brand-name">MD Chat Pro</span>
            </div>

            <button
              type="button"
              className="theme-switch-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
          </div>

          <div className="auth-form-stage">{children}</div>
        </div>
      </div>
    </div>
  );
}
