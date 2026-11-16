import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, isFirebaseConfigured } from '../firebase/config';
import { isLocalDemoUid } from './authService';
import { validateFileUpload } from '../utils/security';

/**
 * Converts an image or file into a compact Data URL (compressing images via canvas
 * so they store cleanly in Firestore / localStore and can be copied to clipboard without CORS issues).
 */
export function fileToDataUrl(file, maxDimension = 960) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.onload = (event) => {
      const result = event.target.result;
      if (
        !file.type.startsWith('image/') ||
        file.type === 'image/svg+xml' ||
        file.type === 'image/gif'
      ) {
        resolve(result);
        return;
      }

      const img = new Image();
      img.onerror = () => resolve(result);
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Helper that races a Firebase Storage upload against a short timeout so CORS or
 * unconfigured Storage rules on localhost never hang the upload UI.
 */
async function tryFirebaseUploadWithTimeout(storagePath, file, onProgress, timeoutMs = 1800) {
  if (!isFirebaseConfigured || !storage) return null;

  const uploadTask = uploadBytesResumable(ref(storage, storagePath), file);

  const uploadPromise = new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (onProgress && pct > 0) onProgress(pct);
      },
      (error) => reject(error),
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      }
    );
  });

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      try {
        uploadTask.cancel();
      } catch {
        // Ignore cancel error
      }
      resolve(null);
    }, timeoutMs);
  });

  try {
    return await Promise.race([uploadPromise, timeoutPromise]);
  } catch {
    return null;
  }
}

/**
 * Uploads a user profile picture (`avatars/{uid}/{filename}`) with instant optimized fallback.
 */
export async function uploadProfileAvatar(uid, file, onProgress) {
  const validation = validateFileUpload(file, 'avatar');
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (onProgress) onProgress(30);
  const dataUrl = await fileToDataUrl(file, 420);

  if (isFirebaseConfigured && storage && !isLocalDemoUid(uid)) {
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const remoteUrl = await tryFirebaseUploadWithTimeout(
      `avatars/${uid}/${safeName}`,
      file,
      onProgress,
      1500
    );
    if (onProgress) onProgress(100);
    return remoteUrl || dataUrl;
  }

  if (onProgress) onProgress(100);
  return dataUrl;
}

/**
 * Uploads a chat attachment (image, document, audio, archive) with instant client optimization.
 */
export async function uploadChatAttachment({ chatId, senderId, file, onProgress }) {
  const validation = validateFileUpload(file, 'attachment');
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (onProgress) onProgress(35);

  const localUrl = file.type.startsWith('image/')
    ? await fileToDataUrl(file, 960)
    : URL.createObjectURL(file);

  if (
    isFirebaseConfigured &&
    storage &&
    !isLocalDemoUid(senderId) &&
    chatId &&
    !chatId.startsWith('chat_') &&
    !chatId.startsWith('group_')
  ) {
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const remoteUrl = await tryFirebaseUploadWithTimeout(
      `chats/${chatId}/${senderId}/${safeName}`,
      file,
      onProgress,
      1500
    );
    if (onProgress) onProgress(100);
    return {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      url: remoteUrl || localUrl,
    };
  }

  if (onProgress) onProgress(100);
  return {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    url: localUrl,
  };
}
