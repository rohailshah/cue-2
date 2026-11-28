/**
 * Compresses and resizes a user-selected image file in the browser so custom
 * avatars and cover banners fit cleanly inside localStorage without quality loss.
 */
export async function processUploadedProfileImage(
  file: File,
  kind: 'avatar' | 'banner'
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (PNG, JPG, WebP, etc.).');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode this image file.'));
      el.src = objectUrl;
    });

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) {
      throw new Error('Selected image has empty dimensions.');
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Image processing is unavailable in this browser.');
    }

    if (kind === 'avatar') {
      const size = Math.min(320, Math.max(128, Math.min(srcW, srcH)));
      canvas.width = size;
      canvas.height = size;
      const side = Math.min(srcW, srcH);
      const sx = Math.round((srcW - side) / 2);
      const sy = Math.round((srcH - side) / 2);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    } else {
      const maxW = 1280;
      const maxH = 560;
      const scale = Math.min(1, maxW / srcW, maxH / srcH);
      const outW = Math.max(1, Math.round(srcW * scale));
      const outH = Math.max(1, Math.round(srcH * scale));
      canvas.width = outW;
      canvas.height = outH;
      ctx.drawImage(img, 0, 0, outW, outH);
    }

    const quality = kind === 'avatar' ? 0.85 : 0.82;
    const webpUrl = canvas.toDataURL('image/webp', quality);
    if (webpUrl.startsWith('data:image/webp')) {
      return webpUrl;
    }
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
