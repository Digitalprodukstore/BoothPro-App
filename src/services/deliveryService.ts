import JSZip from 'jszip';
import QRCode from 'qrcode';
import { SessionData, OperatorConfig } from '../types';

async function uploadMediaBlob(sessionId: string, media: 'photo' | 'gif' | 'video', blob: Blob, mimeType: string): Promise<void> {
  if (!blob || blob.size < 16) throw new Error(media === 'photo' ? 'Foto Final belum tersedia.' : media === 'gif' ? 'GIF belum tersedia. Tunggu pembuatan GIF selesai lalu coba lagi.' : 'Video sesi belum tersedia.');
  const signed = await fetch('/api/session?route=softfile-upload', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ action: 'sign', sessionId, media, mimeType }),
  });
  const signedData = await signed.json().catch(() => null);
  if (!signed.ok || signedData?.ok !== true || !signedData?.uploadUrl) {
    throw new Error(signedData?.error || `Gagal menyiapkan upload ${media} (HTTP ${signed.status}).`);
  }
  const uploaded = await fetch(signedData.uploadUrl, {
    method: 'PUT', headers: { 'Content-Type': mimeType || blob.type || 'application/octet-stream', 'x-upsert': 'true' },
    body: blob, cache: 'no-store',
  });
  if (!uploaded.ok) {
    const detail = await uploaded.text().catch(() => '');
    throw new Error(`Upload ${media} gagal (HTTP ${uploaded.status}). ${detail.slice(0, 180)}`);
  }
}

async function ensureCloudMediaUploaded(session: SessionData): Promise<void> {
  const sid = session.sessionId;
  let photoBlob: Blob;
  try { photoBlob = await (await fetch(session.finalPhotoDataUrl)).blob(); }
  catch { throw new Error('Foto Final tidak dapat dibaca untuk diunggah.'); }
  let gifBlob: Blob;
  try {
    if (!session.gifBlobUrl) throw new Error('missing');
    gifBlob = await (await fetch(session.gifBlobUrl)).blob();
  } catch { throw new Error('GIF belum siap. Kembali tunggu GIF selesai dibuat, lalu coba lagi.'); }
  let videoBlob: Blob;
  try {
    if (!session.videoBlobUrl) throw new Error('missing');
    videoBlob = await (await fetch(session.videoBlobUrl)).blob();
  } catch { throw new Error('Video sesi tidak tersedia pada perangkat ini.'); }
  if (!photoBlob.type.startsWith('image/')) throw new Error('Format Foto Final tidak valid.');
  if (gifBlob.size < 100) throw new Error('GIF belum selesai dibuat atau filenya tidak valid.');
  const mime = session.videoMimeType || videoBlob.type || 'video/webm';
  await uploadMediaBlob(sid, 'photo', photoBlob, 'image/png');
  await uploadMediaBlob(sid, 'gif', gifBlob, 'image/gif');
  await uploadMediaBlob(sid, 'video', videoBlob, mime);
  const finalized = await fetch('/api/session?route=softfile-upload', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ action: 'complete', sessionId: sid, media: 'video', mimeType: mime }),
  });
  const result = await finalized.json().catch(() => null);
  if (!finalized.ok || result?.ok !== true) throw new Error(result?.error || `Media terunggah, tetapi manifest gagal disimpan (HTTP ${finalized.status}).`);
}

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
      await ensureCloudMediaUploaded(session);
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
      await ensureCloudMediaUploaded(session);
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
