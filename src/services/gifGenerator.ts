/**
 * Fast Client-Side GIF Generator for BoothPro
 * Converts captured photobooth photos into a high-quality animated GIF89a.
 * Solves timeout issues by using an efficient canvas rasterizer and optimized LZW quantizer.
 */

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

  // Encode frames using compact GIF89a encoder
  const gifBytes = encodeGif(frameDataList, width, height, Math.round(delayMs / 10));
  const gifBlob = new Blob([gifBytes as BlobPart], { type: 'image/gif' });
  const gifUrl = URL.createObjectURL(gifBlob);

  return { blob: gifBlob, url: gifUrl };
}

/**
 * Compact GIF89a encoder implementing Netscape looping, Graphic Control, and LZW compression
 */
function encodeGif(frames: ImageData[], width: number, height: number, delay100thSec: number): Uint8Array {
  const stream: number[] = [];

  const writeString = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      stream.push(str.charCodeAt(i));
    }
  };

  const writeWord = (val: number) => {
    stream.push(val & 0xff);
    stream.push((val >> 8) & 0xff);
  };

  // 1. Header
  writeString('GIF89a');

  // 2. Logical Screen Descriptor
  writeWord(width);
  writeWord(height);
  // GCT Flag = 1, Color Resolution = 7 (8 bits), Sort Flag = 0, GCT Size = 7 (256 colors)
  stream.push(0xf7); // 11110111
  stream.push(0);    // Background Color Index
  stream.push(0);    // Pixel Aspect Ratio

  // 3. Standard Global Color Table (Optimized 6-level Web-safe color palette + 16 grayscale)
  const gct: [number, number, number][] = [];
  // Standard RGB cube (6x6x6 = 216 colors)
  const levels = [0, 51, 102, 153, 204, 255];
  for (const r of levels) {
    for (const g of levels) {
      for (const b of levels) {
        gct.push([r, g, b]);
      }
    }
  }
  // Fill remaining 40 slots with distinct shades
  for (let i = 0; i < 40; i++) {
    const v = Math.min(255, Math.round((i / 39) * 255));
    gct.push([v, v, v]);
  }

  for (let i = 0; i < 256; i++) {
    const [r, g, b] = gct[i] || [0, 0, 0];
    stream.push(r, g, b);
  }

  // 4. Netscape 2.0 Loop Extension (Infinite Repeat)
  stream.push(0x21, 0xff, 0x0b);
  writeString('NETSCAPE2.0');
  stream.push(0x03, 0x01);
  writeWord(0); // loop forever
  stream.push(0x00);

  // 5. Frames
  for (const frame of frames) {
    // Graphic Control Extension
    stream.push(0x21, 0xf9, 0x04);
    stream.push(0x04); // Disposal method 1 (do not dispose), user input = 0, transparent color = 0
    writeWord(delay100thSec);
    stream.push(0x00); // Transparent color index
    stream.push(0x00); // Block terminator

    // Image Descriptor
    stream.push(0x2c);
    writeWord(0); // Left
    writeWord(0); // Top
    writeWord(width);
    writeWord(height);
    stream.push(0x00); // No Local Color Table, non-interlaced

    // Quantize Frame pixels to GCT indices
    const pixels = frame.data;
    const indexedPixels = new Uint8Array(width * height);
    for (let p = 0, idx = 0; p < pixels.length; p += 4, idx++) {
      const r = pixels[p];
      const g = pixels[p + 1];
      const b = pixels[p + 2];
      indexedPixels[idx] = getNearestGctIndex(r, g, b);
    }

    // LZW Compression
    const minCodeSize = 8;
    stream.push(minCodeSize);
    lzwEncode(minCodeSize, indexedPixels, stream);
    stream.push(0x00); // Block terminator
  }

  // 6. GIF Trailer
  stream.push(0x3b);

  return new Uint8Array(stream);
}

/**
 * Fast Euclidean color matching into 256-color GCT
 */
function getNearestGctIndex(r: number, g: number, b: number): number {
  // Quantize RGB to 6-level cube: 0, 51, 102, 153, 204, 255
  const ri = Math.min(5, Math.floor((r + 25) / 51));
  const gi = Math.min(5, Math.floor((g + 25) / 51));
  const bi = Math.min(5, Math.floor((b + 25) / 51));
  return ri * 36 + gi * 6 + bi;
}

/**
 * LZW encoder for GIF sub-blocks
 */
function lzwEncode(minCodeSize: number, data: Uint8Array, stream: number[]): void {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;

  // Dictionary map: string (prevCode + ',' + pixel) -> code
  const codeTable = new Map<number, number>();

  const subBlock: number[] = [];
  let bitAccumulator = 0;
  let bitCount = 0;

  const emitCode = (code: number) => {
    bitAccumulator |= code << bitCount;
    bitCount += codeSize;

    while (bitCount >= 8) {
      subBlock.push(bitAccumulator & 0xff);
      bitAccumulator >>= 8;
      bitCount -= 8;

      if (subBlock.length === 254) {
        stream.push(subBlock.length);
        for (const b of subBlock) stream.push(b);
        subBlock.length = 0;
      }
    }
  };

  emitCode(clearCode);

  if (data.length > 0) {
    let cur = data[0];

    for (let i = 1; i < data.length; i++) {
      const nextPixel = data[i];
      const key = (cur << 8) | nextPixel;

      if (codeTable.has(key)) {
        cur = codeTable.get(key)!;
      } else {
        emitCode(cur);

        if (nextCode < 4096) {
          codeTable.set(key, nextCode++);
          // The decoder builds its dictionary one emitted code behind the encoder.
          // Grow the code width only after crossing the boundary, otherwise
          // some GIF decoders read subsequent codes at the wrong bit width.
          if (nextCode > (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
        } else {
          emitCode(clearCode);
          codeTable.clear();
          codeSize = minCodeSize + 1;
          nextCode = eoiCode + 1;
        }

        cur = nextPixel;
      }
    }

    emitCode(cur);
  }

  emitCode(eoiCode);

  // Flush remaining bits
  if (bitCount > 0) {
    subBlock.push(bitAccumulator & 0xff);
  }

  if (subBlock.length > 0) {
    stream.push(subBlock.length);
    for (const b of subBlock) stream.push(b);
  }
}
