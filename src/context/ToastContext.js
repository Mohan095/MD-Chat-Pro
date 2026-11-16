import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X, MessageSquare } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ title, message, type = 'info', duration = 4000 }) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-4), { id, title, message, type }]);
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
      return id;
    },
    [removeToast]
  );

  const toast = {
    success: (message, title = 'Success') =>
      showToast({ title, message, type: 'success' }),
    error: (message, title = 'Error') =>
      showToast({ title, message, type: 'error', duration: 5000 }),
    info: (message, title = 'Notice') =>
      showToast({ title, message, type: 'info' }),
    warning: (message, title = 'Warning') =>
      showToast({ title, message, type: 'warning' }),
    message: (message, title = 'New Message') =>
      showToast({ title, message, type: 'message', duration: 4500 }),
  };

  const renderIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={18} className="toast-icon toast-icon-success" />;
      case 'error':
        return <AlertCircle size={18} className="toast-icon toast-icon-error" />;
      case 'warning':
        return <AlertTriangle size={18} className="toast-icon toast-icon-warning" />;
      case 'message':
        return <MessageSquare size={18} className="toast-icon toast-icon-message" />;
      default:
        return <Info size={18} className="toast-icon toast-icon-info" />;
    }
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-viewport" role="region" aria-label="Notifications">
        {toasts.map((item) => (
          <div key={item.id} className={`toast-card toast-${item.type}`}>
            <div className="toast-icon-wrap">{renderIcon(item.type)}</div>
            <div className="toast-body">
              {item.title && <div className="toast-title">{item.title}</div>}
              <div className="toast-message">{item.message}</div>
            </div>
            <button
              type="button"
              className="toast-close-btn"
              onClick={() => removeToast(item.id)}
              aria-label="Close notification"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
