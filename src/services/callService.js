import { mongoGet, mongoPost, createMongoSubscription } from './mongoClient';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export async function getLocalMediaStream(type = 'voice') {
  if (!navigator?.mediaDevices?.getUserMedia) {
    throw new Error('Media devices are not supported in this browser or context.');
  }
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: type === 'video' ? { facingMode: 'user' } : false,
  });
}

export async function startOutgoingCall({
  chatId,
  caller,
  calleeUid,
  calleeName,
  calleeAvatar = '',
  type = 'voice',
  isGroup = false,
  onRemoteStream,
  onConnectionStateChange,
}) {
  if (!caller?.uid || !calleeUid) {
    throw new Error('Caller and recipient are required for calling.');
  }

  const localStream = await getLocalMediaStream(type);
  const pc = new RTCPeerConnection(ICE_SERVERS);

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  const remoteStream = new MediaStream();
  pc.ontrack = (event) => {
    event.streams[0]?.getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    if (onRemoteStream) onRemoteStream(remoteStream);
  };

  pc.onconnectionstatechange = () => {
    if (onConnectionStateChange) onConnectionStateChange(pc.connectionState);
  };

  const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      mongoPost('addIceCandidate', {
        callId,
        role: 'caller',
        candidate: event.candidate.toJSON(),
      }).catch(() => {});
    }
  };

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  await mongoPost(
    'createCall',
    {
      call: {
        id: callId,
        chatId: chatId || '',
        callerUid: caller.uid,
        callerName: caller.displayName || 'User',
        callerAvatar: caller.photoURL || '',
        calleeUid,
        calleeName: calleeName || 'User',
        calleeAvatar: calleeAvatar || '',
        type,
        isGroup: Boolean(isGroup),
        status: 'ringing',
        offer: {
          sdp: offerDescription.sdp,
          type: offerDescription.type,
        },
        createdAtMs: Date.now(),
      },
    },
    [`incomingCall:${calleeUid}`]
  );

  let remoteDescSet = false;
  let addedAnswerCount = 0;

  const unsubCall = createMongoSubscription({
    topic: `call:${callId}`,
    intervalMs: 1200,
    fetcher: async () => {
      const res = await mongoGet('call', { callId });
      return res.call || null;
    },
    onData: async (data) => {
      if (!data) return;

      if (!pc.currentRemoteDescription && data.answer) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          remoteDescSet = true;
        } catch {
          // Ignore duplicate remote description errors
        }
      }

      if (remoteDescSet && Array.isArray(data.answerCandidates)) {
        const nextCandidates = data.answerCandidates.slice(addedAnswerCount);
        for (const cand of nextCandidates) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          addedAnswerCount += 1;
        }
      }

      if (data.status === 'ended' || data.status === 'declined') {
        if (onConnectionStateChange) onConnectionStateChange(data.status);
      }
    },
  });

  const cleanup = () => {
    unsubCall();
    localStream.getTracks().forEach((t) => t.stop());
    pc.close();
  };

  return {
    callId,
    pc,
    localStream,
    remoteStream,
    cleanup,
  };
}

export async function answerIncomingCall({
  callId,
  offer,
  type = 'voice',
  onRemoteStream,
  onConnectionStateChange,
}) {
  if (!callId || !offer) {
    throw new Error('Invalid call offer.');
  }

  const localStream = await getLocalMediaStream(type);
  const pc = new RTCPeerConnection(ICE_SERVERS);

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  const remoteStream = new MediaStream();
  pc.ontrack = (event) => {
    event.streams[0]?.getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    if (onRemoteStream) onRemoteStream(remoteStream);
  };

  pc.onconnectionstatechange = () => {
    if (onConnectionStateChange) onConnectionStateChange(pc.connectionState);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      mongoPost('addIceCandidate', {
        callId,
        role: 'callee',
        candidate: event.candidate.toJSON(),
      }).catch(() => {});
    }
  };

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  await mongoPost(
    'answerCall',
    {
      callId,
      answer: {
        sdp: answerDescription.sdp,
        type: answerDescription.type,
      },
    },
    [`call:${callId}`]
  );

  let addedOfferCount = 0;

  const unsubCall = createMongoSubscription({
    topic: `call:${callId}`,
    intervalMs: 1200,
    fetcher: async () => {
      const res = await mongoGet('call', { callId });
      return res.call || null;
    },
    onData: async (data) => {
      if (!data) return;

      if (Array.isArray(data.offerCandidates)) {
        const nextCandidates = data.offerCandidates.slice(addedOfferCount);
        for (const cand of nextCandidates) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          addedOfferCount += 1;
        }
      }

      if (data.status === 'ended' || data.status === 'declined') {
        if (onConnectionStateChange) onConnectionStateChange(data.status);
      }
    },
  });

  const cleanup = () => {
    unsubCall();
    localStream.getTracks().forEach((t) => t.stop());
    pc.close();
  };

  return {
    callId,
    pc,
    localStream,
    remoteStream,
    cleanup,
  };
}

export async function updateCallStatus(callId, status = 'ended') {
  if (!callId) return;
  try {
    await mongoPost('updateCallStatus', { callId, status }, [`call:${callId}`]);
  } catch {
    // Ignore errors
  }
}

export function subscribeToIncomingCalls(uid, callback) {
  if (!uid) return () => {};

  return createMongoSubscription({
    topic: `incomingCall:${uid}`,
    intervalMs: 2000,
    fetcher: async () => {
      const res = await mongoGet('incomingCall', { uid });
      return res.call || null;
    },
    onData: (call) => {
      callback(call);
    },
    onError: () => {
      callback(null);
    },
  });
}
