import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, isFirebaseConfigured } from '../firebase/config';
import { isLocalDemoUid } from './authService';
import { validateFileUpload } from '../utils/security';

function fileToDataUrl(file, maxDimension = 1200) {
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
        if (width <= maxDimension && height <= maxDimension && file.size < 400 * 1024) {
          resolve(result);
          return;
        }
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
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a user profile picture to Firebase Storage (`avatars/{uid}/{filename}`)
 * with graceful fallback to optimized client image data URL if Storage bucket rules are pending.
 */
export async function uploadProfileAvatar(uid, file, onProgress) {
  const validation = validateFileUpload(file, 'avatar');
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (isFirebaseConfigured && storage && !isLocalDemoUid(uid)) {
    try {
      const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const storageRef = ref(storage, `avatars/${uid}/${safeName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      return await new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const pct = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );
            if (onProgress) onProgress(pct);
          },
          (error) => reject(error),
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          }
        );
      });
    } catch {
      // Fallback to optimized DataURL
    }
  }

  if (onProgress) onProgress(35);
  const dataUrl = await fileToDataUrl(file, 480);
  if (onProgress) onProgress(100);
  return dataUrl;
}

/**
 * Uploads a chat attachment (image, document, audio, archive) to Firebase Storage.
 */
export async function uploadChatAttachment({ chatId, senderId, file, onProgress }) {
  const validation = validateFileUpload(file, 'attachment');
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (
    isFirebaseConfigured &&
    storage &&
    !isLocalDemoUid(senderId) &&
    !chatId.startsWith('chat_') &&
    !chatId.startsWith('group_')
  ) {
    try {
      const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const storageRef = ref(storage, `chats/${chatId}/${senderId}/${safeName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      return await new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const pct = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );
            if (onProgress) onProgress(pct);
          },
          (error) => reject(error),
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({
              id: `att_${Date.now()}`,
              name: file.name,
              size: file.size,
              type: file.type || 'application/octet-stream',
              url,
            });
          }
        );
      });
    } catch {
      // Fallback to client URL
    }
  }

  if (onProgress) onProgress(40);
  const url = file.type.startsWith('image/')
    ? await fileToDataUrl(file, 1280)
    : URL.createObjectURL(file);
  if (onProgress) onProgress(100);

  return {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    url,
  };
}
