import React, { useState, useEffect } from 'react';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Volume2 } from 'lucide-react';
import Avatar from './Avatar';

export default function CallModal({ callState, onEndCall }) {
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(callState?.type === 'video');
  const [seconds, setSeconds] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!callState) return () => {};
    setSeconds(0);
    setConnected(false);
    setVideoEnabled(callState.type === 'video');

    const connectTimer = setTimeout(() => {
      setConnected(true);
    }, 1800);

    const interval = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);

    return () => {
      clearTimeout(connectTimer);
      clearInterval(interval);
    };
  }, [callState]);

  if (!callState) return null;

  const formatDuration = (sec) => {
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  return (
    <div className="modal-backdrop">
      <div className="call-modal-card">
        <div className="call-badge">
          {callState.type === 'video' ? 'Encrypted HD Video Call' : 'Encrypted Voice Call'}
        </div>

        <div className="call-avatar-stage">
          <div className="call-pulse-ring ring-1" />
          <div className="call-pulse-ring ring-2" />
          <Avatar
            src={callState.avatar}
            name={callState.title}
            size="xl"
            isGroup={callState.isGroup}
          />
        </div>

        <h3 className="call-title">{callState.title}</h3>
        <p className="call-status">
          {connected ? `Connected • ${formatDuration(seconds)}` : 'Calling...'}
        </p>

        <div className="call-controls">
          <button
            type="button"
            className={`call-control-btn ${muted ? 'active-warn' : ''}`}
            onClick={() => setMuted(!muted)}
            title={muted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {muted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <button
            type="button"
            className={`call-control-btn ${!videoEnabled ? 'active-warn' : ''}`}
            onClick={() => setVideoEnabled(!videoEnabled)}
            title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
          </button>

          <button
            type="button"
            className="call-control-btn"
            title="Speaker output active"
          >
            <Volume2 size={20} />
          </button>

          <button
            type="button"
            className="call-control-btn call-hangup-btn"
            onClick={onEndCall}
            title="End call"
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
