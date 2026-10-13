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

async function normalizePhotoPng(blob: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const isPng = blob.type === 'image/png' && bytes.length === 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (isPng) return blob;
  if (typeof createImageBitmap !== 'function') {
    throw new Error('Foto Final bukan PNG yang valid dan browser ini tidak mendukung konversi PNG.');
  }
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Tidak dapat menyiapkan konversi Foto Final ke PNG.');
    context.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Konversi Foto Final ke PNG gagal.')), 'image/png');
    });
    if (png.size < 16) throw new Error('Hasil konversi Foto Final kosong.');
    return png;
  } finally {
    bitmap.close();
  }
}

async function ensureCloudMediaUploaded(session: SessionData): Promise<void> {
  const sid = session.sessionId;
  let photoBlob: Blob;
  try {
    const rawPhoto = await (await fetch(session.finalPhotoDataUrl)).blob();
    photoBlob = await normalizePhotoPng(rawPhoto);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Foto Final tidak dapat dibaca untuk diunggah.');
  }
  let gifBlob: Blob;
  try {
    if (!session.gifBlobUrl) throw new Error('missing');
    gifBlob = await (await fetch(session.gifBlobUrl)).blob();
  } catch (error) { throw new Error(error instanceof Error ? error.message : 'GIF belum siap. Kembali tunggu GIF selesai dibuat, lalu coba lagi.'); }
  let videoBlob: Blob;
  try {
    if (!session.videoBlobUrl) throw new Error('missing');
    videoBlob = await (await fetch(session.videoBlobUrl)).blob();
  } catch (error) { throw new Error(error instanceof Error ? error.message : 'Video sesi tidak tersedia pada perangkat ini.'); }
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
    const required = ['foto final', 'GIF', 'video sesi'];
    if (!session.finalPhotoDataUrl?.startsWith('data:image/')) {
      throw new Error('ZIP dibatalkan: Foto Final belum tersedia atau bukan data gambar yang valid.');
    }
    if (!session.gifBlobUrl) throw new Error('ZIP dibatalkan: GIF belum siap. Tunggu sampai proses GIF selesai.');
    if (!session.videoBlobUrl) throw new Error('ZIP dibatalkan: Video sesi belum tersedia.');

    const zip = new JSZip();
    const folderName = `BoothPro_${session.sessionId}`;
    const folder = zip.folder(folderName) || zip;
    const expectedFiles: string[] = [];

    // Use binary bytes for every media item; this avoids accidental text/base64 encoding.
    const photoBase64 = session.finalPhotoDataUrl.slice(session.finalPhotoDataUrl.indexOf(',') + 1);
    const photoBytes = Uint8Array.from(atob(photoBase64), (char) => char.charCodeAt(0));
    if (photoBytes.length < 16 || photoBytes[0] !== 0x89 || photoBytes[1] !== 0x50 || photoBytes[2] !== 0x4e || photoBytes[3] !== 0x47) {
      throw new Error('ZIP dibatalkan: data Foto Final PNG tidak valid.');
    }
    const photoName = `01_Final_Photo_${session.sessionId}.png`;
    folder.file(photoName, photoBytes, { binary: true });
    expectedFiles.push(photoName);

    const gifResponse = await fetch(session.gifBlobUrl);
    if (!gifResponse.ok) throw new Error(`ZIP dibatalkan: GIF gagal dibaca (HTTP ${gifResponse.status}).`);
    const gifBytes = new Uint8Array(await gifResponse.arrayBuffer());
    if (gifBytes.length < 100 || String.fromCharCode(...gifBytes.slice(0, 6)) !== 'GIF89a' && String.fromCharCode(...gifBytes.slice(0, 6)) !== 'GIF87a' || gifBytes[gifBytes.length - 1] !== 0x3b) {
      throw new Error('ZIP dibatalkan: GIF tidak lengkap atau formatnya rusak. Buat ulang GIF lalu coba lagi.');
    }
    const gifName = `02_Boomerang_GIF_${session.sessionId}.gif`;
    folder.file(gifName, gifBytes, { binary: true });
    expectedFiles.push(gifName);

    const videoResponse = await fetch(session.videoBlobUrl);
    if (!videoResponse.ok) throw new Error(`ZIP dibatalkan: video gagal dibaca (HTTP ${videoResponse.status}).`);
    const videoBytes = new Uint8Array(await videoResponse.arrayBuffer());
    if (videoBytes.length < 128) throw new Error('ZIP dibatalkan: video sesi kosong atau belum selesai difinalisasi.');
    const extension = session.videoMimeType?.includes('mp4') ? 'mp4' : 'webm';
    const videoName = `03_Live_Session_Video_${session.sessionId}.${extension}`;
    folder.file(videoName, videoBytes, { binary: true });
    expectedFiles.push(videoName);

    const receiptText = `BOOTHPRO MEMORIES BUNDLE
=========================================
Session ID: ${session.sessionId}
Paket     : ${session.package.name}
Tanggal   : ${new Date(session.createdAt).toLocaleString('id-ID')}
Status    : 3 media sudah dimasukkan ke arsip ZIP

Isi Bundle:
1. ${photoName}
2. ${gifName}
3. ${videoName}

Terima kasih telah berfoto bersama BoothPro!
`;
    folder.file('README_INFO.txt', receiptText);

    // STORE avoids recompressing already-compressed PNG/GIF/video streams.
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: false });
    if (zipBlob.size < 256) throw new Error('ZIP gagal dibuat: ukuran arsip terlalu kecil.');
    // Read the archive back before offering it to the customer; this catches broken ZIP output.
    const checked = await JSZip.loadAsync(zipBlob, { checkCRC32: true });
    for (const name of expectedFiles) {
      const entry = checked.file(`${folderName}/${name}`);
      if (!entry) throw new Error(`ZIP tidak valid: file ${name} tidak ditemukan setelah validasi.`);
      const bytes = await entry.async('uint8array');
      if (!bytes.length) throw new Error(`ZIP tidak valid: file ${name} kosong.`);
    }
    return zipBlob;
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
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Pengiriman WhatsApp gagal karena kesalahan yang tidak diketahui.', directUrl };
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
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Pengiriman email gagal karena kesalahan yang tidak diketahui.' };
    }
  }
}
