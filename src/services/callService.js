import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

/**
 * Acquires local microphone (and camera if video call) media stream.
 */
export async function getLocalMediaStream(type = 'voice') {
  if (!navigator?.mediaDevices?.getUserMedia) {
    throw new Error('Media devices are not supported in this browser or context.');
  }
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: type === 'video' ? { facingMode: 'user' } : false,
  });
}

/**
 * Creates a WebRTC outgoing call document in Firestore and streams offer + ICE candidates.
 */
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
  if (!db) throw new Error('Firestore is not initialized.');
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

  const callRef = doc(collection(db, 'calls'));
  const offerCandidatesCol = collection(callRef, 'offerCandidates');
  const answerCandidatesCol = collection(callRef, 'answerCandidates');

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(offerCandidatesCol, event.candidate.toJSON()).catch(() => {});
    }
  };

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  await setDoc(callRef, {
    id: callRef.id,
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
    createdAt: serverTimestamp(),
  });

  let remoteDescSet = false;
  const pendingCandidates = [];

  const unsubCall = onSnapshot(callRef, async (snapshot) => {
    const data = snapshot.data();
    if (!data) return;

    if (!pc.currentRemoteDescription && data.answer) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        remoteDescSet = true;
        while (pendingCandidates.length > 0) {
          const cand = pendingCandidates.shift();
          await pc.addIceCandidate(cand).catch(() => {});
        }
      } catch {
        // Ignore duplicate remote description errors
      }
    }

    if (data.status === 'ended' || data.status === 'declined') {
      if (onConnectionStateChange) onConnectionStateChange(data.status);
    }
  });

  const unsubAnswerCandidates = onSnapshot(answerCandidatesCol, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        if (remoteDescSet) {
          pc.addIceCandidate(candidate).catch(() => {});
        } else {
          pendingCandidates.push(candidate);
        }
      }
    });
  });

  const cleanup = () => {
    unsubCall();
    unsubAnswerCandidates();
    localStream.getTracks().forEach((t) => t.stop());
    pc.close();
  };

  return {
    callId: callRef.id,
    pc,
    localStream,
    remoteStream,
    cleanup,
  };
}

/**
 * Answers an incoming WebRTC call from Firestore signaling.
 */
export async function answerIncomingCall({
  callId,
  offer,
  type = 'voice',
  onRemoteStream,
  onConnectionStateChange,
}) {
  if (!db || !callId || !offer) {
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

  const callRef = doc(db, 'calls', callId);
  const offerCandidatesCol = collection(callRef, 'offerCandidates');
  const answerCandidatesCol = collection(callRef, 'answerCandidates');

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(answerCandidatesCol, event.candidate.toJSON()).catch(() => {});
    }
  };

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  await updateDoc(callRef, {
    status: 'connected',
    answer: {
      sdp: answerDescription.sdp,
      type: answerDescription.type,
    },
    answeredAtMs: Date.now(),
  });

  const unsubOfferCandidates = onSnapshot(offerCandidatesCol, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
      }
    });
  });

  const unsubCall = onSnapshot(callRef, (snapshot) => {
    const data = snapshot.data();
    if (data?.status === 'ended' || data?.status === 'declined') {
      if (onConnectionStateChange) onConnectionStateChange(data.status);
    }
  });

  const cleanup = () => {
    unsubCall();
    unsubOfferCandidates();
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

/**
 * Marks a call as ended or declined in Firestore.
 */
export async function updateCallStatus(callId, status = 'ended') {
  if (!db || !callId) return;
  try {
    await updateDoc(doc(db, 'calls', callId), {
      status,
      endedAtMs: Date.now(),
    });
  } catch {
    // Ignore if call doc was already removed
  }
}

/**
 * Subscribes to incoming ringing calls for the current user.
 */
export function subscribeToIncomingCalls(uid, callback) {
  if (!db || !uid) return () => {};

  const q = query(
    collection(db, 'calls'),
    where('calleeUid', '==', uid),
    where('status', '==', 'ringing')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const now = Date.now();
      const recentCalls = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        // Ignore stale calls older than 90 seconds
        .filter((c) => !c.createdAtMs || now - c.createdAtMs < 90000)
        .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

      callback(recentCalls[0] || null);
    },
    () => {
      callback(null);
    }
  );
}
