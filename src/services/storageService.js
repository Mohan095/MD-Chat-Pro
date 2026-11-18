import { validateFileUpload } from '../utils/security';

/**
 * Converts an image or file into a compact Data URL (compressing images via canvas
 * so they store cleanly in MongoDB without Firebase Storage).
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
 * Optimizes a user profile avatar into a compact Data URL for MongoDB storage.
 */
export async function uploadProfileAvatar(uid, file, onProgress) {
  const validation = validateFileUpload(file, 'avatar');
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (onProgress) onProgress(30);
  const dataUrl = await fileToDataUrl(file, 420);
  if (onProgress) onProgress(100);
  return dataUrl;
}

/**
 * Converts a chat attachment (image or file) into a Data URL for MongoDB storage.
 */
export async function uploadChatAttachment({ file, onProgress }) {
  const validation = validateFileUpload(file, 'attachment');
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (onProgress) onProgress(35);
  const dataUrl = await fileToDataUrl(file, 960);
  if (onProgress) onProgress(100);

  return {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    url: dataUrl,
  };
}
