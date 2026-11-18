import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume2 } from 'lucide-react';
import Avatar from './Avatar';
import {
  startOutgoingCall,
  answerIncomingCall,
  updateCallStatus,
} from '../services/callService';

export default function CallModal({ callState, onEndCall }) {
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(callState?.type === 'video');
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [statusText, setStatusText] = useState('Calling...');
  const [connected, setConnected] = useState(false);
  const [isIncomingRinging, setIsIncomingRinging] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const sessionRef = useRef(null);
  const callIdRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const attachLocalStream = (stream) => {
    if (localVideoRef.current && stream) {
      localVideoRef.current.srcObject = stream;
    }
  };

  const attachRemoteStream = (stream) => {
    if (remoteVideoRef.current && stream) {
      remoteVideoRef.current.srcObject = stream;
    }
    if (remoteAudioRef.current && stream) {
      remoteAudioRef.current.srcObject = stream;
    }
  };

  const cleanupCall = useCallback(() => {
    if (sessionRef.current?.cleanup) {
      sessionRef.current.cleanup();
      sessionRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!callState) {
      cleanupCall();
      return () => {};
    }

    let cancelled = false;
    setSeconds(0);
    setConnected(false);
    setMuted(false);
    setSpeakerMuted(false);
    setErrorMsg('');
    setVideoEnabled(callState.type === 'video');

    if (callState.direction === 'incoming') {
      callIdRef.current = callState.callId;
      setIsIncomingRinging(true);
      setStatusText(
        callState.type === 'video' ? 'Incoming video call...' : 'Incoming voice call...'
      );
      return () => {
        cancelled = true;
        cleanupCall();
      };
    }

    setIsIncomingRinging(false);
    setStatusText('Calling...');

    if (callState.calleeUid && callState.caller?.uid) {
      (async () => {
        try {
          const session = await startOutgoingCall({
            chatId: callState.chatId,
            caller: callState.caller,
            calleeUid: callState.calleeUid,
            calleeName: callState.title,
            calleeAvatar: callState.avatar,
            type: callState.type,
            isGroup: callState.isGroup,
            onRemoteStream: (stream) => {
              if (!cancelled) {
                attachRemoteStream(stream);
                setConnected(true);
                setStatusText('Connected');
              }
            },
            onConnectionStateChange: (state) => {
              if (cancelled) return;
              if (state === 'connected') {
                setConnected(true);
                setStatusText('Connected');
              } else if (state === 'declined') {
                setStatusText('Call declined');
                setTimeout(() => onEndCall?.(), 900);
              } else if (state === 'ended' || state === 'closed' || state === 'disconnected') {
                onEndCall?.();
              }
            },
          });

          if (cancelled) {
            session.cleanup();
            return;
          }

          sessionRef.current = session;
          callIdRef.current = session.callId;
          attachLocalStream(session.localStream);
          attachRemoteStream(session.remoteStream);
        } catch (err) {
          if (!cancelled) {
            setErrorMsg(err?.message || 'Unable to access microphone/camera.');
            setStatusText('Media unavailable');
          }
        }
      })();
    }

    return () => {
      cancelled = true;
      cleanupCall();
    };
  }, [callState, cleanupCall, onEndCall]);

  useEffect(() => {
    if (!connected) return () => {};
    const interval = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [connected]);

  if (!callState) return null;

  const formatDuration = (sec) => {
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const handleToggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    const stream = sessionRef.current?.localStream;
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
  };

  const handleToggleVideo = () => {
    const nextEnabled = !videoEnabled;
    setVideoEnabled(nextEnabled);
    const stream = sessionRef.current?.localStream;
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = nextEnabled;
      });
    }
  };

  const handleToggleSpeaker = () => {
    const next = !speakerMuted;
    setSpeakerMuted(next);
    if (remoteAudioRef.current) remoteAudioRef.current.muted = next;
    if (remoteVideoRef.current) remoteVideoRef.current.muted = next;
  };

  const handleAcceptIncoming = async () => {
    if (!callState?.callId || !callState?.offer) return;
    setIsIncomingRinging(false);
    setStatusText('Connecting...');
    try {
      const session = await answerIncomingCall({
        callId: callState.callId,
        offer: callState.offer,
        type: callState.type,
        onRemoteStream: (stream) => {
          attachRemoteStream(stream);
          setConnected(true);
          setStatusText('Connected');
        },
        onConnectionStateChange: (state) => {
          if (state === 'connected') {
            setConnected(true);
            setStatusText('Connected');
          } else if (state === 'ended' || state === 'declined' || state === 'closed') {
            onEndCall?.();
          }
        },
      });
      sessionRef.current = session;
      callIdRef.current = session.callId;
      attachLocalStream(session.localStream);
      attachRemoteStream(session.remoteStream);
    } catch (err) {
      setErrorMsg(err?.message || 'Unable to answer call.');
      setStatusText('Connection failed');
    }
  };

  const handleHangup = async () => {
    const targetCallId = callIdRef.current || callState?.callId;
    const nextStatus = isIncomingRinging ? 'declined' : 'ended';
    cleanupCall();
    if (targetCallId) {
      await updateCallStatus(targetCallId, nextStatus);
    }
    onEndCall?.();
  };

  return (
    <div className="modal-backdrop">
      <div className="call-modal-card">
        <div className="call-badge">
          {callState.type === 'video' ? 'WebRTC HD Video Call' : 'WebRTC Voice Call'}
        </div>

        <audio ref={remoteAudioRef} autoPlay playsInline />

        {callState.type === 'video' && !isIncomingRinging ? (
          <div className="call-video-stage">
            <video
              ref={remoteVideoRef}
              className="call-remote-video"
              autoPlay
              playsInline
            />
            <video
              ref={localVideoRef}
              className="call-local-video"
              autoPlay
              playsInline
              muted
            />
          </div>
        ) : (
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
        )}

        <h3 className="call-title">{callState.title}</h3>
        <p className="call-status">
          {connected ? `Connected • ${formatDuration(seconds)}` : statusText}
        </p>
        {errorMsg && <p className="call-error-text">{errorMsg}</p>}

        <div className="call-controls">
          {isIncomingRinging ? (
            <>
              <button
                type="button"
                className="call-control-btn call-accept-btn"
                onClick={handleAcceptIncoming}
                title="Accept call"
              >
                <Phone size={20} />
              </button>
              <button
                type="button"
                className="call-control-btn call-hangup-btn"
                onClick={handleHangup}
                title="Decline call"
              >
                <PhoneOff size={20} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`call-control-btn ${muted ? 'active-warn' : ''}`}
                onClick={handleToggleMute}
                title={muted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {muted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>

              <button
                type="button"
                className={`call-control-btn ${!videoEnabled ? 'active-warn' : ''}`}
                onClick={handleToggleVideo}
                title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </button>

              <button
                type="button"
                className={`call-control-btn ${speakerMuted ? 'active-warn' : ''}`}
                onClick={handleToggleSpeaker}
                title={speakerMuted ? 'Unmute speaker' : 'Mute speaker'}
              >
                <Volume2 size={20} />
              </button>

              <button
                type="button"
                className="call-control-btn call-hangup-btn"
                onClick={handleHangup}
                title="End call"
              >
                <PhoneOff size={20} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
