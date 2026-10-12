import { FrameTemplate, SlotTransform, PhotoFilter } from '../types';

export class CanvasRenderer {
  /**
   * Applies CSS / Canvas color filters to the context
   */
  public static applyFilterToContext(ctx: CanvasRenderingContext2D, filter: PhotoFilter): void {
    switch (filter) {
      case 'bw':
        ctx.filter = 'grayscale(100%) contrast(120%) brightness(105%)';
        break;
      case 'vintage':
        ctx.filter = 'sepia(45%) contrast(110%) brightness(95%) saturate(120%)';
        break;
      case 'tokyo':
        ctx.filter = 'brightness(110%) saturate(135%) hue-rotate(-10deg) contrast(105%)';
        break;
      case 'grain':
        ctx.filter = 'contrast(125%) brightness(100%) grayscale(25%)';
        break;
      case 'glow':
        ctx.filter = 'brightness(115%) contrast(95%) saturate(125%)';
        break;
      case 'vibrant':
        ctx.filter = 'saturate(160%) contrast(115%) brightness(105%)';
        break;
      case 'none':
      default:
        ctx.filter = 'none';
        break;
    }
  }

  /**
   * Renders the complete framed photo onto a canvas and returns the Data URL
   */
  public static async renderFramedPhoto(
    frame: FrameTemplate,
    photos: string[],
    transforms: SlotTransform[],
    customTitle?: string
  ): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // 1. Draw Frame Background
    ctx.fillStyle = frame.backgroundColor || '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Optional decorative gradient border or pattern
    ctx.strokeStyle = frame.accentColor || '#ec4899';
    ctx.lineWidth = frame.borderWidth || 8;
    ctx.strokeRect(
      ctx.lineWidth / 2,
      ctx.lineWidth / 2,
      canvas.width - ctx.lineWidth,
      canvas.height - ctx.lineWidth
    );

    // Pre-load all photo images
    const imageElements: (HTMLImageElement | null)[] = await Promise.all(
      photos.map(
        (url) =>
          new Promise<HTMLImageElement | null>((resolve) => {
            if (!url) {
              resolve(null);
              return;
            }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
          })
      )
    );

    // 2. Render each slot with its photo & transforms
    for (const slot of frame.slots) {
      const transform = transforms.find((t) => t.slotId === slot.id) || {
        slotId: slot.id,
        photoIndex: (slot.id - 1) % photos.length,
        zoom: 1,
        panX: 0,
        panY: 0,
        filter: 'none' as PhotoFilter,
      };

      const photoImg = imageElements[transform.photoIndex];

      ctx.save();

      // Create rounded rectangle clipping path for slot
      ctx.beginPath();
      const radius = slot.borderRadius || 8;
      ctx.roundRect(slot.x, slot.y, slot.width, slot.height, radius);
      ctx.clip();

      // Slot background
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(slot.x, slot.y, slot.width, slot.height);

      if (photoImg) {
        this.applyFilterToContext(ctx, transform.filter);

        // Calculate aspect ratios
        const imgAspect = photoImg.width / photoImg.height;
        const slotAspect = slot.width / slot.height;

        let baseWidth = slot.width;
        let baseHeight = slot.height;

        if (imgAspect > slotAspect) {
          baseHeight = slot.height;
          baseWidth = slot.height * imgAspect;
        } else {
          baseWidth = slot.width;
          baseHeight = slot.width / imgAspect;
        }

        const zoomedWidth = baseWidth * transform.zoom;
        const zoomedHeight = baseHeight * transform.zoom;

        const centerX = slot.x + slot.width / 2;
        const centerY = slot.y + slot.height / 2;

        const panOffsetX = (transform.panX / 100) * (slot.width / 2);
        const panOffsetY = (transform.panY / 100) * (slot.height / 2);

        const drawX = centerX - zoomedWidth / 2 + panOffsetX;
        const drawY = centerY - zoomedHeight / 2 + panOffsetY;

        ctx.drawImage(photoImg, drawX, drawY, zoomedWidth, zoomedHeight);
      }

      ctx.restore();

      // Inner subtle border on slot
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(slot.x, slot.y, slot.width, slot.height, radius);
      ctx.stroke();
    }

    // 3. Render Bottom Branding & Date
    ctx.save();
    const title = customTitle || frame.titleText || 'BOOTHPRO MEMORIES';
    const subtitle = frame.subtitleText || new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });

    // Footer position
    const footerY = canvas.height - 50;

    ctx.textAlign = 'center';
    ctx.fillStyle = frame.accentColor || '#ec4899';
    ctx.font = `bold ${Math.round(canvas.width * 0.038)}px "Plus Jakarta Sans", sans-serif`;
    ctx.letterSpacing = '2px';
    ctx.fillText(title, canvas.width / 2, footerY - 14);

    ctx.fillStyle = 'rgba(248, 250, 252, 0.7)';
    ctx.font = `500 ${Math.round(canvas.width * 0.024)}px "Plus Jakarta Sans", sans-serif`;
    ctx.letterSpacing = '1px';
    ctx.fillText(subtitle, canvas.width / 2, footerY + 12);
    ctx.restore();

    return canvas.toDataURL('image/png', 0.95);
  }
}
