import React, { useState } from 'react';
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import AuthLayout from '../layouts/AuthLayout';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../context/ToastContext';
import {
  validateEmail,
  validatePassword,
  validateDisplayName,
  authRateLimiter,
} from '../utils/security';

export default function AuthPage() {
  const { login, register, loginWithGoogle, resetPassword } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState('login'); // login | register | forgot
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSuccessEmail, setResetSuccessEmail] = useState('');

  const passwordStrength = validatePassword(password);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setResetSuccessEmail('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const rate = authRateLimiter.check(email || 'anon');
    if (!rate.allowed) {
      setError(`Too many attempts. Please wait ${rate.retryAfterSeconds} seconds.`);
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (mode === 'forgot') {
      try {
        setLoading(true);
        const res = await resetPassword(email);
        setResetSuccessEmail(res.email);
        toast.success(`Password reset link sent to ${res.email}`);
      } catch (err) {
        setError(err.message || 'Could not send password reset email.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!passwordStrength.valid) {
      setError(passwordStrength.message);
      return;
    }

    if (mode === 'register') {
      const nameCheck = validateDisplayName(displayName);
      if (!nameCheck.valid) {
        setError(nameCheck.message);
        return;
      }

      try {
        setLoading(true);
        await register({
          displayName: nameCheck.value,
          email,
          password,
        });
        toast.success('Account created! Welcome to MD Chat Pro 🎉');
      } catch (err) {
        setError(err.message || 'Registration failed.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Login mode
    try {
      setLoading(true);
      await login({ email, password });
      toast.success('Signed in to MD Chat Pro!');
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    try {
      setLoading(true);
      await loginWithGoogle();
      toast.success('Signed in with Google!');
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-card">
        {/* Mode Tabs */}
        {mode !== 'forgot' && (
          <div className="auth-mode-tabs">
            <button
              type="button"
              className={`auth-mode-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => switchMode('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-mode-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => switchMode('register')}
            >
              Create Account
            </button>
          </div>
        )}

        <div className="auth-card-header">
          <h2 className="auth-card-title">
            {mode === 'login' && 'Welcome back'}
            {mode === 'register' && 'Create your account'}
            {mode === 'forgot' && 'Reset your password'}
          </h2>
          <p className="auth-card-subtitle">
            {mode === 'login' &&
              'Sign in with your email and password to access your conversations.'}
            {mode === 'register' &&
              'Register your account to start messaging friends in real time.'}
            {mode === 'forgot' &&
              'Enter your registered email and we will send you a password recovery link.'}
          </p>
        </div>

        {error && <div className="form-alert form-alert-error">{error}</div>}

        {resetSuccessEmail && (
          <div className="form-alert form-alert-success">
            <CheckCircle2 size={16} />
            <span>
              Password recovery instructions have been sent to{' '}
              <strong>{resetSuccessEmail}</strong>.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div className="input-with-icon">
                <User size={17} className="input-icon" />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="input-with-icon">
              <Mail size={17} className="input-icon" />
              <input
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div className="form-group">
              <div className="form-label-row">
                <label className="form-label">Password</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    className="btn-inline-link"
                    onClick={() => switchMode('forgot')}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="input-with-icon">
                <Lock size={17} className="input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="input-eye-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {mode === 'register' && password.length > 0 && (
                <div className="password-strength-meter">
                  <div className="strength-bars">
                    {[1, 2, 3, 4].map((level) => (
                      <span
                        key={level}
                        className={`strength-bar ${
                          passwordStrength.score >= level
                            ? `active score-${passwordStrength.score}`
                            : ''
                        }`}
                      />
                    ))}
                  </div>
                  <span className="strength-label">{passwordStrength.message}</span>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block auth-submit-btn"
            disabled={loading}
          >
            <span>
              {loading
                ? 'Please wait...'
                : mode === 'login'
                ? 'Sign In'
                : mode === 'register'
                ? 'Create Account'
                : 'Send Recovery Link'}
            </span>
            <ArrowRight size={17} />
          </button>
        </form>

        {mode === 'forgot' ? (
          <div className="auth-footer-switch">
            <button
              type="button"
              className="btn-inline-link"
              onClick={() => switchMode('login')}
            >
              ← Back to Sign In
            </button>
          </div>
        ) : (
          <>
            <div className="auth-divider">
              <span>or continue with</span>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-block google-auth-btn"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.9C3.5 21.4 7.4 24 12 24z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
