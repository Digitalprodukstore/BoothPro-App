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
    // Load the overlay before sizing the output canvas. Uploaded PNGs often use a
    // different pixel size than the template; use the asset's native dimensions so
    // it is not stretched and scale the configured slot coordinates to match.
    let overlayImage: HTMLImageElement | null = null;
    if (frame.overlayImage) {
      try {
        overlayImage = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('Frame overlay image could not be loaded'));
          image.src = frame.overlayImage!;
        });
      } catch (error) {
        console.error('Failed to load frame overlay; using generated frame instead.', error);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = overlayImage?.naturalWidth || frame.width;
    canvas.height = overlayImage?.naturalHeight || frame.height;
    const scaleX = canvas.width / frame.width;
    const scaleY = canvas.height / frame.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Keep transparent pixels behind uploaded overlays so captured photos show through.
    if (!overlayImage) {
      ctx.fillStyle = frame.backgroundColor || '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Preserve the built-in frame styling when no custom overlay is configured.
      ctx.strokeStyle = frame.accentColor || '#ec4899';
      ctx.lineWidth = frame.borderWidth || 8;
      ctx.strokeRect(
        ctx.lineWidth / 2,
        ctx.lineWidth / 2,
        canvas.width - ctx.lineWidth,
        canvas.height - ctx.lineWidth
      );
    }

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
      const slotX = slot.x * scaleX;
      const slotY = slot.y * scaleY;
      const slotWidth = slot.width * scaleX;
      const slotHeight = slot.height * scaleY;

      ctx.save();

      // Slot coordinates are authored in the template's reference dimensions.
      // Scale them with the overlay asset so the photos line up with its cut-outs.
      ctx.beginPath();
      const radius = (slot.borderRadius || 8) * Math.min(scaleX, scaleY);
      ctx.roundRect(slotX, slotY, slotWidth, slotHeight, radius);
      ctx.clip();

      // Slot backgrounds are only needed for generated frames; overlay PNGs provide their own transparent windows.
      if (!overlayImage) {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(slotX, slotY, slotWidth, slotHeight);
      }

      if (photoImg) {
        this.applyFilterToContext(ctx, transform.filter);

        // Calculate aspect ratios
        const imgAspect = photoImg.width / photoImg.height;
        const slotAspect = slotWidth / slotHeight;

        let baseWidth = slotWidth;
        let baseHeight = slotHeight;

        if (imgAspect > slotAspect) {
          baseHeight = slotHeight;
          baseWidth = slotHeight * imgAspect;
        } else {
          baseWidth = slotWidth;
          baseHeight = slotWidth / imgAspect;
        }

        const zoomedWidth = baseWidth * transform.zoom;
        const zoomedHeight = baseHeight * transform.zoom;

        const centerX = slotX + slotWidth / 2;
        const centerY = slotY + slotHeight / 2;

        const panOffsetX = (transform.panX / 100) * (slotWidth / 2);
        const panOffsetY = (transform.panY / 100) * (slotHeight / 2);

        const drawX = centerX - zoomedWidth / 2 + panOffsetX;
        const drawY = centerY - zoomedHeight / 2 + panOffsetY;

        ctx.drawImage(photoImg, drawX, drawY, zoomedWidth, zoomedHeight);
      }

      ctx.restore();

      // Inner slot borders are only used for generated frames.
      if (!overlayImage) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(slotX, slotY, slotWidth, slotHeight, radius);
        ctx.stroke();
      }
    }

    // 3. Generated frame branding, or the uploaded transparent PNG overlay.
    if (!overlayImage) {
      ctx.save();
      const title = customTitle || frame.titleText || 'BOOTHPRO MEMORIES';
      const subtitle = frame.subtitleText || new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
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
    } else if (overlayImage) {
      // Draw the original overlay at native dimensions over the positioned photos.
      ctx.drawImage(overlayImage, 0, 0, canvas.width, canvas.height);
    }

    return canvas.toDataURL('image/png', 0.95);
  }
}
