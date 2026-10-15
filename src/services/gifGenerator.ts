/**
 * Fast Client-Side GIF Generator for BoothPro
 * Converts captured photobooth photos into a high-quality animated GIF89a.
 * Uses a tested GIF89a encoder with a shared color palette for reliable playback.
 */

import { GIFEncoder, quantize, applyPalette } from 'gifenc';

interface GifFrameOptions {
  delayMs?: number;
  width?: number;
  height?: number;
  watermarkText?: string;
  repeat?: number; // 0 for infinite loop
}

export async function generateAnimatedGif(
  photoDataUrls: string[],
  options: GifFrameOptions = {}
): Promise<{ blob: Blob; url: string }> {
  if (!photoDataUrls.length) {
    throw new Error('No photos provided for GIF generation');
  }

  const width = options.width || 480;
  const height = options.height || 640;
  const delayMs = options.delayMs || 600;
  const watermark = options.watermarkText || 'BOOTHPRO ✨';

  // Load all images as HTMLImageElements
  const loadedImages: HTMLImageElement[] = await Promise.all(
    photoDataUrls.map(
      (url) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to load frame image'));
          img.src = url;
        })
    )
  );

  // Render each frame onto canvas with watermark
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const frameDataList: ImageData[] = [];

  for (let i = 0; i < loadedImages.length; i++) {
    const img = loadedImages[i];

    // Clear background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Draw scaled photo centered
    const imgAspect = img.width / img.height;
    const canvasAspect = width / height;
    let dw = width;
    let dh = height;
    let dx = 0;
    let dy = 0;

    if (imgAspect > canvasAspect) {
      dw = height * imgAspect;
      dx = (width - dw) / 2;
    } else {
      dh = width / imgAspect;
      dy = (height - dh) / 2;
    }

    ctx.drawImage(img, dx, dy, dw, dh);

    // Frame counter & watermark badge
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.beginPath();
    ctx.roundRect(16, height - 44, width - 32, 28, 14);
    ctx.fill();

    ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.fillText(`${watermark}`, 28, height - 26);

    ctx.fillStyle = '#ec4899';
    ctx.textAlign = 'right';
    ctx.fillText(`${i + 1}/${loadedImages.length}`, width - 28, height - 26);

    const frameData = ctx.getImageData(0, 0, width, height);
    frameDataList.push(frameData);
  }

  // Use a standards-tested GIF encoder rather than the previous hand-written LZW
  // implementation, which can produce files some browser decoders fail to animate.
  const combinedPixels = new Uint8Array(frameDataList.reduce((sum, frame) => sum + frame.data.length, 0));
  let pixelOffset = 0;
  for (const frame of frameDataList) {
    combinedPixels.set(frame.data, pixelOffset);
    pixelOffset += frame.data.length;
  }

  const palette = quantize(combinedPixels, 256);
  const gif = GIFEncoder();
  for (const frame of frameDataList) {
    const indexedPixels = applyPalette(frame.data, palette);
    gif.writeFrame(indexedPixels, width, height, {
      palette,
      delay: delayMs,
      repeat: options.repeat ?? 0,
    });
  }
  gif.finish();

  const gifBytes = gif.bytes();
  const gifBlob = new Blob([gifBytes], { type: 'image/gif' });
  const gifUrl = URL.createObjectURL(gifBlob);

  return { blob: gifBlob, url: gifUrl };

}
