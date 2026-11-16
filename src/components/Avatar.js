import React, { useState } from 'react';
import { Users } from 'lucide-react';
import { getInitials, getAvatarGradient } from '../utils/formatters';
import { isSafeUrl } from '../utils/security';

export default function Avatar({
  src,
  name = 'User',
  size = 'md', // xs | sm | md | lg | xl
  online = false,
  showStatus = false,
  isGroup = false,
  className = '',
  onClick,
}) {
  const [imgError, setImgError] = useState(false);
  const validSrc = !imgError && src && isSafeUrl(src) ? src : null;
  const gradient = getAvatarGradient(name);

  return (
    <div
      className={`avatar-wrapper avatar-${size} ${onClick ? 'avatar-clickable' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {validSrc ? (
        <img
          src={validSrc}
          alt={name}
          className="avatar-img"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="avatar-fallback" style={{ background: gradient }}>
          {isGroup ? <Users size={size === 'xl' ? 28 : size === 'lg' ? 22 : 16} /> : getInitials(name)}
        </div>
      )}
      {showStatus && (
        <span
          className={`avatar-status-dot ${online ? 'status-online' : 'status-offline'}`}
          title={online ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
}
