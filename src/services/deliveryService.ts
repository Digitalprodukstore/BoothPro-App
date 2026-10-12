import JSZip from 'jszip';
import QRCode from 'qrcode';
import { SessionData, OperatorConfig } from '../types';

export class DeliveryService {
  /**
   * Generates a public QR Code data URL for the customer to scan on their phone
   */
  public static async generateSoftfileQrCode(softfileUrl: string): Promise<string> {
    try {
      return await QRCode.toDataURL(softfileUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
    } catch (e) {
      console.error('Failed to generate QR code', e);
      return '';
    }
  }

  /**
   * Generates public shareable softfile URL
   */
  public static getPublicSoftfileUrl(sessionId: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://boothpro.id';
    return `${origin}/api/softfile?sessionId=${encodeURIComponent(sessionId)}`;
  }

  /**
   * Packages all 3 media files (Photo + GIF + Video) into a single downloadable ZIP
   */
  public static async createMediaBundleZip(session: SessionData): Promise<Blob> {
    const zip = new JSZip();
    const folderName = `BoothPro_${session.sessionId}`;
    const folder = zip.folder(folderName) || zip;

    // 1. Add Final Framed Photo
    if (session.finalPhotoDataUrl) {
      const base64Data = session.finalPhotoDataUrl.replace(/^data:image\/\w+;base64,/, '');
      folder.file(`01_Final_Photo_${session.sessionId}.png`, base64Data, { base64: true });
    }

    // 2. Add Animated GIF
    if (session.gifBlobUrl) {
      try {
        const gifResponse = await fetch(session.gifBlobUrl);
        const gifBlob = await gifResponse.blob();
        folder.file(`02_Boomerang_GIF_${session.sessionId}.gif`, gifBlob);
      } catch (e) {
        console.warn('Could not fetch gifBlobUrl for zip', e);
      }
    }

    // 3. Add Live Session Video
    if (session.videoBlobUrl) {
      try {
        const videoResponse = await fetch(session.videoBlobUrl);
        const videoBlob = await videoResponse.blob();
        const extension = session.videoMimeType.includes('mp4') ? 'mp4' : 'webm';
        folder.file(`03_Live_Session_Video_${session.sessionId}.${extension}`, videoBlob);
      } catch (e) {
        console.warn('Could not fetch videoBlobUrl for zip', e);
      }
    }

    // 4. Add Readme Receipt
    const receiptText = `BOOTHPRO MEMORIES BUNDLE
=========================================
Session ID: ${session.sessionId}
Paket     : ${session.package.name}
Tanggal   : ${new Date(session.createdAt).toLocaleString('id-ID')}
Status    : Soft-File Terverifikasi (3 Media Lengkap)

Isi Bundle:
1. 01_Final_Photo_${session.sessionId}.png (Foto cetak berbingkai resolusi tinggi)
2. 02_Boomerang_GIF_${session.sessionId}.gif (Animasi foto bergerak)
3. 03_Live_Session_Video_${session.sessionId}.webm (Video rekaman sesi live kamera)

Terima kasih telah berfoto bersama BoothPro! ✨
`;
    folder.file('README_INFO.txt', receiptText);

    return await zip.generateAsync({ type: 'blob' });
  }

  /**
   * Clean Indonesian phone number into international format (628...)
   */
  public static formatIndonesianPhone(phone: string): string {
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.slice(1);
    } else if (clean.startsWith('8')) {
      clean = '62' + clean;
    }
    return clean;
  }

  /**
   * Generates WhatsApp direct Click-to-Chat URL
   */
  public static getWhatsAppDirectUrl(
    phone: string,
    session: SessionData,
    config: OperatorConfig
  ): string {
    const cleanPhone = this.formatIndonesianPhone(phone);
    const softfileUrl = this.getPublicSoftfileUrl(session.sessionId);

    const message = `Halo Kak! ✨
Terima kasih sudah foto di *${config.brandName}*.

Berikut soft-file photobooth lengkap untuk sesi *${session.sessionId}*:
📸 Foto Final + 🎞️ Boomerang GIF + 🎥 Live Session Video

Buka & download bundle kamu di sini (tanpa login):
👉 ${softfileUrl}

Simpan link ini baik-baik ya! Sampai jumpa di sesi berikutnya! ✨`;

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }

  /**
   * Dispatch WhatsApp notification via Fonnte API or fallback direct URL
   */
  public static async sendWhatsApp(
    phone: string,
    session: SessionData,
    _config: OperatorConfig
  ): Promise<{ success: boolean; message: string; directUrl: string }> {
    const directUrl = this.getWhatsAppDirectUrl(phone, session, _config);
    try {
      const response = await fetch('/api/send-direct-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          sessionId: session.sessionId,
          deliveryMethod: 'whatsapp',
          target: phone,
          customerName: 'Pelanggan',
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok !== true) {
        return { success: false, message: data?.error || `Pengiriman WhatsApp gagal (HTTP ${response.status}).`, directUrl };
      }
      return { success: true, message: data.message || 'Permintaan pengiriman WhatsApp diterima oleh penyedia.', directUrl };
    } catch {
      return { success: false, message: 'Tidak dapat menghubungi layanan pengiriman WhatsApp. Periksa koneksi lalu coba lagi.', directUrl };
    }
  }

  public static async sendEmail(
    email: string,
    session: SessionData,
    _config: OperatorConfig
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch('/api/send-direct-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          sessionId: session.sessionId,
          deliveryMethod: 'email',
          target: email,
          customerName: 'Pelanggan',
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok !== true) {
        return { success: false, message: data?.error || `Pengiriman email gagal (HTTP ${response.status}).` };
      }
      return { success: true, message: data.message || 'Permintaan pengiriman email diterima oleh penyedia.' };
    } catch {
      return { success: false, message: 'Tidak dapat menghubungi layanan email. Periksa koneksi lalu coba lagi.' };
    }
  }
}
