import React, { useState, useEffect } from 'react';
import { Download, Send, CheckCircle2, QrCode, Phone, Mail, Sparkles, Video, Image as ImageIcon, Film, RefreshCw, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { SessionData, OperatorConfig } from '../../types';
import { DeliveryService } from '../../services/deliveryService';
import { storageService } from '../../services/storageService';
import { audioEffects } from '../../services/audioEffects';

interface SoftFileScreenProps {
  session: SessionData;
  config: OperatorConfig;
  onFinishSession: () => void;
}

export const SoftFileScreen: React.FC<SoftFileScreenProps> = ({
  session,
  config,
  onFinishSession,
}) => {
  const [phone, setPhone] = useState<string>(session.customerPhone || '');
  const [email, setEmail] = useState<string>(session.customerEmail || '');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isZipping, setIsZipping] = useState<boolean>(false);\n  const [zipError, setZipError] = useState<string>('');

  const [waSending, setWaSending] = useState<boolean>(false);
  const [waResult, setWaResult] = useState<{ message: string; directUrl?: string; success?: boolean } | null>(null);

  const [emailSending, setEmailSending] = useState<boolean>(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [emailResultSuccess, setEmailResultSuccess] = useState<boolean>(false);

  const [resetCountdown, setResetCountdown] = useState<number>(config.kioskTimeoutSeconds || 90);

  const publicUrl = DeliveryService.getPublicSoftfileUrl(session.sessionId);

  // Generate QR code for phone scan & celebratory confetti
  useEffect(() => {
    DeliveryService.generateSoftfileQrCode(publicUrl).then(setQrCodeDataUrl);

    try {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.5 },
      });
    } catch (e) {}
  }, [publicUrl]);

  // Auto-reset countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setResetCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onFinishSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onFinishSession]);

  // Download All as ZIP
  const handleDownloadAllZip = async () => {
    if (isZipping) return;
    setIsZipping(true);
    setZipError('');
    audioEffects.playClick();
    // iOS browsers can block a delayed anchor click after ZIP generation; reserve a tab during the user gesture.
    const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const reservedWindow = isIOS ? window.open('about:blank', '_blank') : null;
    try {
      const zipBlob = await DeliveryService.createMediaBundleZip(session);
      const url = URL.createObjectURL(zipBlob);
      if (reservedWindow && !reservedWindow.closed) {
        reservedWindow.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `BoothPro_Bundle_${session.sessionId}.zip`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      // Keep the Blob URL alive while Safari / the browser begins opening or downloading it.
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      audioEffects.playSuccessChime();
    } catch (err) {
      if (reservedWindow && !reservedWindow.closed) reservedWindow.close();
      const message = err instanceof Error ? err.message : 'ZIP gagal dibuat. Silakan coba lagi.';
      setZipError(message);
      console.error('Failed to create ZIP bundle', err);
      window.alert(message);
    } finally {
      setIsZipping(false);
    }
  };

  // Download individual media
  const handleDownloadSingle = async (url: string, filename: string) => {
    audioEffects.playClick();
    try {
      if (!url) throw new Error('File belum tersedia. Tunggu sampai media selesai dibuat.');
      const response = await fetch(url);
      if (!response.ok) throw new Error(`File gagal dibaca (HTTP ${response.status}).`);
      const blob = await response.blob();
      if (blob.size < 16) throw new Error('File kosong atau belum selesai difinalisasi.');
      const mime = (blob.type || '').toLowerCase();
      const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
      const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
      const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const isGif = bytes.length >= 6 && (String.fromCharCode(...bytes.slice(0, 6)) === 'GIF87a' || String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a');
      const isWebM = bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
      const isMp4 = bytes.length >= 8 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
      const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
      let safeName = filename;
      const dot = filename.lastIndexOf('.');
      const stem = dot > -1 ? filename.slice(0, dot) : filename;
      // Prefer the actual file signature when available; MIME headers can be incorrect or generic.
      if (isPng || mime.includes('image/png')) safeName = stem + '.png';
      else if (isJpeg || mime.includes('image/jpeg')) safeName = stem + '.jpg';
      else if (isGif || mime.includes('image/gif')) safeName = stem + '.gif';
      else if (isMp4 || mime.includes('video/mp4')) safeName = stem + '.mp4';
      else if (isWebM || mime.includes('video/webm')) safeName = stem + '.webm';
      else if (isZip || mime.includes('application/zip')) safeName = stem + '.zip';
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = safeName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Safari/iOS may need time to start consuming the Blob URL.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download gagal.';
      console.error('[BoothPro Soft File] Download gagal:', error);
      window.alert(message);
    }
  };

  // Send to WhatsApp
  const handleSendWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    setWaSending(true);
    audioEffects.playClick();

    try {
      const result = await DeliveryService.sendWhatsApp(phone, session, config);
      setWaResult(result);

      session.customerPhone = phone;
      if (result.success) {
        session.deliveryStatus.whatsapp = 'sent';
        audioEffects.playSuccessChime();
      }
      storageService.saveSession(session);
    } catch (error) {
      setWaResult({
        success: false,
        message: error instanceof Error ? error.message : 'Pengiriman WhatsApp gagal. Silakan coba lagi.',
      });
    } finally {
      setWaSending(false);
    }
  };

  // Send to Email
  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setEmailSending(true);
    audioEffects.playClick();

    try {
      const result = await DeliveryService.sendEmail(email, session, config);
      setEmailResult(result.message);
      setEmailResultSuccess(result.success);

      session.customerEmail = email;
      if (result.success) {
        session.deliveryStatus.email = 'sent';
        audioEffects.playSuccessChime();
      }
      storageService.saveSession(session);
    } catch (error) {
      setEmailResult(error instanceof Error ? error.message : 'Pengiriman email gagal. Silakan coba lagi.');
      setEmailResultSuccess(false);
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <div className="relative w-full h-full min-h-screen flex flex-col justify-between p-4 sm:p-8 bg-slate-950 text-white select-none">
      {/* Header */}
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between z-10">
        <div>
          <span className="text-xs font-bold text-pink-400">SESI SELESAI ✨</span>
          <h2 className="text-lg sm:text-2xl font-black">Soft-File Bundle Siap Diunduh!</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400 hidden sm:block">
            Auto Reset:{' '}
            <strong className="text-white font-mono-numbers">{resetCountdown}s</strong>
          </div>

          <button
            onClick={() => {
              audioEffects.playClick();
              onFinishSession();
            }}
            className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs sm:text-sm font-bold shadow-md shadow-pink-600/30 transition active:scale-95 cursor-pointer"
          >
            Selesai &amp; Sesi Baru
          </button>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="w-full max-w-6xl mx-auto my-auto py-4 z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: 3-Media Showcase */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-pink-400" />
              <h3 className="font-black text-base text-white">3-Media Softfile Bundle</h3>
            </div>
            <span className="text-xs font-mono text-slate-400">ID: {session.sessionId}</span>
          </div>

          {/* 3 Media Cards Grid */}
          <div className="grid grid-cols-3 gap-3">
            {/* 1. Final Photo */}
            <div className="bg-slate-950 rounded-2xl p-2.5 border border-slate-800 flex flex-col justify-between">
              <div className="relative aspect-3/4 rounded-xl overflow-hidden bg-slate-900 mb-2">
                {session.finalPhotoDataUrl ? (
                  <img
                    src={session.finalPhotoDataUrl}
                    alt="Final Framed Photo"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px]">
                    Memproses...
                  </div>
                )}
                <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-black/60 text-[10px] font-bold text-pink-400 flex items-center gap-1">
                  <ImageIcon className="w-2.5 h-2.5" />
                  <span>Foto Final</span>
                </div>
              </div>

              <button
                onClick={() =>
                  handleDownloadSingle(
                    session.finalPhotoDataUrl,
                    `BoothPro_Photo_${session.sessionId}.png`
                  )
                }
                className="w-full py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold flex items-center justify-center gap-1 transition"
              >
                <Download className="w-3 h-3" />
                <span>Unduh</span>
              </button>
            </div>

            {/* 2. Boomerang GIF */}
            <div className="bg-slate-950 rounded-2xl p-2.5 border border-slate-800 flex flex-col justify-between">
              <div className="relative aspect-3/4 rounded-xl overflow-hidden bg-slate-900 mb-2">
                {session.gifBlobUrl ? (
                  <img
                    src={session.gifBlobUrl}
                    alt="Animated Boomerang GIF"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px]">
                    Membuat GIF...
                  </div>
                )}
                <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-black/60 text-[10px] font-bold text-amber-400 flex items-center gap-1">
                  <Film className="w-2.5 h-2.5" />
                  <span>GIF Bergerak</span>
                </div>
              </div>

              <button
                onClick={() =>
                  handleDownloadSingle(
                    session.gifBlobUrl,
                    `BoothPro_Boomerang_${session.sessionId}.gif`
                  )
                }
                disabled={!session.gifBlobUrl}
                className="w-full py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-[11px] font-bold flex items-center justify-center gap-1 transition"
              >
                <Download className="w-3 h-3" />
                <span>Unduh</span>
              </button>
            </div>

            {/* 3. Live Session Video */}
            <div className="bg-slate-950 rounded-2xl p-2.5 border border-slate-800 flex flex-col justify-between">
              <div className="relative aspect-3/4 rounded-xl overflow-hidden bg-slate-900 mb-2">
                {session.videoBlobUrl ? (
                  <video
                    src={session.videoBlobUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px]">
                    Memfinalisasi video...
                  </div>
                )}
                <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-black/60 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                  <Video className="w-2.5 h-2.5" />
                  <span>Live Video</span>
                </div>
              </div>

              <button
                onClick={() => {
                  const ext = session.videoMimeType.includes('mp4') ? 'mp4' : 'webm';
                  handleDownloadSingle(
                    session.videoBlobUrl,
                    `BoothPro_LiveVideo_${session.sessionId}.${ext}`
                  );
                }}
                disabled={!session.videoBlobUrl}
                className="w-full py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-[11px] font-bold flex items-center justify-center gap-1 transition"
              >
                <Download className="w-3 h-3" />
                <span>Unduh</span>
              </button>
            </div>
          </div>

          {/* Download All as ZIP Button */}
          <button
            onClick={handleDownloadAllZip}
            disabled={isZipping}
            className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-pink-600/30 active:scale-98 transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{isZipping ? 'Mengemas File ZIP...' : 'Unduh Sekaligus (1 ZIP Bundle)'}</span>
          </button>
          {zipError && <p role="alert" className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800 rounded-xl p-3">{zipError}</p>}
        </div>

        {/* Right Side: QR Code & WhatsApp / Email Delivery */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          {/* Scan QR on Phone Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl flex items-center gap-4">
            <div className="bg-white p-2 rounded-2xl shrink-0 shadow-md">
              {qrCodeDataUrl ? (
                <img src={qrCodeDataUrl} alt="Scan QR" className="w-24 h-24 object-contain" />
              ) : (
                <div className="w-24 h-24 flex items-center justify-center text-slate-400 text-[10px]">
                  Membuat QR...
                </div>
              )}
            </div>

            <div>
              <span className="text-[11px] font-extrabold text-pink-400 uppercase tracking-wider block mb-1">
                Scan dengan HP
              </span>
              <h4 className="font-black text-white text-base">Buka Langsung di Ponsel</h4>
              <p className="text-xs text-slate-400 mt-1">
                Arahkan kamera HP ke QR Code ini untuk membuka bundle tanpa perlu login.
              </p>
            </div>
          </div>

          {/* Delivery Forms: WhatsApp & Email */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col gap-4">
            <h4 className="font-bold text-white text-sm">Kirim Otomatis ke WhatsApp / Email</h4>

            {/* WhatsApp Form */}
            <form onSubmit={handleSendWhatsApp} className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="w-3 h-3 text-emerald-400" />
                <span>Nomor WhatsApp Pelanggan</span>
              </label>

              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08123456789 atau 628..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={waSending || !phone}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{waSending ? 'Kirim...' : 'Kirim WA'}</span>
                </button>
              </div>

              {waResult && (
                <div className={`text-[11px] p-2 rounded-xl flex items-center justify-between gap-2 ${waResult.success ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-800' : 'text-rose-300 bg-rose-950/40 border border-rose-800'}`}>
                  <span>{waResult.message}</span>
                  {waResult.success && waResult.directUrl && (
                    <a
                      href={waResult.directUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-bold text-emerald-300"
                    >
                      Buka WA
                    </a>
                  )}
                </div>
              )}
            </form>

            <div className="h-px bg-slate-800/80 my-1" />

            {/* Email Form */}
            <form onSubmit={handleSendEmail} className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Mail className="w-3 h-3 text-pink-400" />
                <span>Alamat Email</span>
              </label>

              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@gmail.com"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-pink-500"
                />
                <button
                  type="submit"
                  disabled={emailSending || !email}
                  className="px-4 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{emailSending ? 'Kirim...' : 'Kirim Email'}</span>
                </button>
              </div>

              {emailResult && (
                <div className={`text-[11px] p-2 rounded-xl ${emailResultSuccess ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-800' : 'text-rose-300 bg-rose-950/40 border border-rose-800'}`}>
                  {emailResult}
                </div>
              )}
            </form>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto flex items-center justify-between text-xs text-slate-500 border-t border-slate-900 pt-3 z-10">
        <span>Soft-file tersimpan aman. Pelanggan dapat mengaksesnya kapan saja menggunakan link atau QR Code.</span>
        <span>{config.brandName} Platform</span>
      </footer>
    </div>
  );
};
