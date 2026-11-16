import React from 'react';
import { MessageSquareCode } from 'lucide-react';

export default function LoadingScreen({ message = 'Initializing MD Chat Pro workspace...' }) {
  return (
    <div className="loading-screen">
      <div className="loading-card">
        <div className="loading-logo-ring">
          <div className="loading-logo-inner">
            <MessageSquareCode size={34} />
          </div>
        </div>
        <h2 className="loading-title">MD Chat Pro</h2>
        <p className="loading-subtitle">{message}</p>
        <div className="loading-bar-track">
          <div className="loading-bar-fill" />
        </div>
      </div>
    </div>
  );
}
