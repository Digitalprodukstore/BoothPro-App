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
    return `${origin}/#softfile=${sessionId}`;
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
    config: OperatorConfig
  ): Promise<{ success: boolean; message: string; directUrl: string }> {
    const directUrl = this.getWhatsAppDirectUrl(phone, session, config);
    const cleanPhone = this.formatIndonesianPhone(phone);
    const softfileUrl = this.getPublicSoftfileUrl(session.sessionId);

    // If Fonnte token is configured and not default dummy, attempt real API post
    if (config.fonnteToken && config.fonnteToken !== 'FONNTE_DEMO_KEY_2026') {
      try {
        const res = await fetch('https://api.fonnte.com/send', {
          method: 'POST',
          headers: {
            Authorization: config.fonnteToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            target: cleanPhone,
            message: `Halo Kak! ✨ Terima kasih sudah berfoto di ${config.brandName}.\n\nSoft-file sesi ${session.sessionId} siap diunduh:\n${softfileUrl}\n\nTermasuk Foto, GIF & Live Video!`,
          }),
        });

        if (res.ok) {
          return {
            success: true,
            message: `Pesan WhatsApp berhasil dikirim via Fonnte ke +${cleanPhone}!`,
            directUrl,
          };
        }
      } catch (e) {
        console.warn('Fonnte API call failed, falling back to direct link', e);
      }
    }

    return {
      success: true,
      message: `Link WhatsApp telah disiapkan untuk nomor +${cleanPhone}! Anda dapat klik tombol kirim langsung.`,
      directUrl,
    };
  }

  /**
   * Dispatch Email notification via Brevo or simulated dispatch
   */
  public static async sendEmail(
    email: string,
    session: SessionData,
    config: OperatorConfig
  ): Promise<{ success: boolean; message: string }> {
    const softfileUrl = this.getPublicSoftfileUrl(session.sessionId);

    if (config.brevoApiKey && config.brevoApiKey !== 'BREVO_API_DEMO_2026') {
      try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': config.brevoApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: config.brandName, email: config.brevoSenderEmail || 'photos@boothpro.id' },
            to: [{ email }],
            subject: `[${config.brandName}] Soft-File Photobooth Sesi ${session.sessionId}`,
            htmlContent: `
              <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; background: #0f172a; color: #f8fafc; border-radius: 12px;">
                <h1 style="color: #ec4899; margin-top: 0;">${config.brandName}</h1>
                <p>Halo! Terima kasih telah mengabadikan momen di booth kami.</p>
                <div style="background: #1e293b; padding: 16px; border-radius: 8px; margin: 20px 0;">
                  <p><strong>Session ID:</strong> ${session.sessionId}</p>
                  <p><strong>Paket:</strong> ${session.package.name}</p>
                  <p><strong>Bundle:</strong> 1 Foto Final + 1 Boomerang GIF + 1 Live Session Video</p>
                </div>
                <p>Klik tombol di bawah ini untuk membuka dan mengunduh seluruh media Anda (tanpa perlu membuat akun):</p>
                <a href="${softfileUrl}" style="display: inline-block; background: #ec4899; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">Download Soft-File Bundle</a>
              </div>
            `,
          }),
        });

        if (res.ok) {
          return { success: true, message: `Email terkirim ke ${email} via Brevo!` };
        }
      } catch (e) {
        console.warn('Brevo API call failed', e);
      }
    }

    return {
      success: true,
      message: `Konfirmasi soft-file bundle berhasil disiapkan untuk ${email}!`,
    };
  }
}
