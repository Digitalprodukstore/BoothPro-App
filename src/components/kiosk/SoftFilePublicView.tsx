import React, { useState } from 'react';
import { Download, Sparkles, Image as ImageIcon, Film, Video, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { SessionData, OperatorConfig } from '../../types';
import { DeliveryService } from '../../services/deliveryService';

interface SoftFilePublicViewProps {
  session: SessionData;
  config: OperatorConfig;
  onGoBackToKiosk?: () => void;
}

export const SoftFilePublicView: React.FC<SoftFilePublicViewProps> = ({
  session,
  config,
  onGoBackToKiosk,
}) => {
  const [isZipping, setIsZipping] = useState(false);

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zipBlob = await DeliveryService.createMediaBundleZip(session);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BoothPro_Bundle_${session.sessionId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadSingle = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-4 sm:p-8">
      {/* Top Header */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between border-b border-slate-900 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-600 flex items-center justify-center font-black text-white shadow-md">
            BP
          </div>
          <div>
            <h1 className="font-black text-lg text-white">{config.brandName}</h1>
            <p className="text-xs text-slate-400">Soft-File Portal Pelanggan</p>
          </div>
        </div>

        {onGoBackToKiosk && (
          <button
            onClick={onGoBackToKiosk}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 font-semibold border border-slate-800"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Kiosk</span>
          </button>
        )}
      </header>

      {/* Main Bundle Card */}
      <main className="max-w-4xl mx-auto w-full my-6 flex flex-col gap-6">
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold mb-3 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Bundle Media Terverifikasi</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              Sesi {session.sessionId}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Paket {session.package.name} • {new Date(session.createdAt).toLocaleString('id-ID')}
            </p>
          </div>

          <button
            onClick={handleDownloadZip}
            disabled={isZipping}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-xl shadow-pink-600/30 active:scale-95 transition cursor-pointer"
          >
            <Download className="w-5 h-5" />
            <span>{isZipping ? 'Mengemas ZIP...' : 'Unduh Semua (ZIP Bundle)'}</span>
          </button>
        </div>

        {/* 3 Media Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 1. Foto Final */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4 flex flex-col justify-between shadow-lg">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-pink-400 mb-3">
                <ImageIcon className="w-4 h-4" />
                <span>Foto Final Resolusi Tinggi</span>
              </div>
              <div className="aspect-3/4 rounded-2xl overflow-hidden bg-black/60 p-2 flex items-center justify-center mb-4">
                {session.finalPhotoDataUrl ? (
                  <img
                    src={session.finalPhotoDataUrl}
                    alt="Foto Final"
                    className="max-h-full max-w-full object-contain rounded-lg"
                  />
                ) : (
                  <span className="text-xs text-slate-500">Tidak tersedia</span>
                )}
              </div>
            </div>

            <button
              onClick={() =>
                handleDownloadSingle(
                  session.finalPhotoDataUrl,
                  `BoothPro_Photo_${session.sessionId}.png`
                )
              }
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Foto (PNG)</span>
            </button>
          </div>

          {/* 2. Boomerang GIF */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4 flex flex-col justify-between shadow-lg">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 mb-3">
                <Film className="w-4 h-4" />
                <span>Boomerang GIF Bergerak</span>
              </div>
              <div className="aspect-3/4 rounded-2xl overflow-hidden bg-black/60 p-2 flex items-center justify-center mb-4">
                {session.gifBlobUrl ? (
                  <img
                    src={session.gifBlobUrl}
                    alt="Boomerang GIF"
                    className="max-h-full max-w-full object-contain rounded-lg"
                  />
                ) : (
                  <span className="text-xs text-slate-500">Tidak tersedia</span>
                )}
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
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh GIF Animasi</span>
            </button>
          </div>

          {/* 3. Live Session Video */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4 flex flex-col justify-between shadow-lg">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 mb-3">
                <Video className="w-4 h-4" />
                <span>Live Session Video</span>
              </div>
              <div className="aspect-3/4 rounded-2xl overflow-hidden bg-black/60 flex items-center justify-center mb-4">
                {session.videoBlobUrl ? (
                  <video
                    src={session.videoBlobUrl}
                    controls
                    loop
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <span className="text-xs text-slate-500">Tidak tersedia</span>
                )}
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
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Video Rekaman</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center text-xs text-slate-500 border-t border-slate-900 pt-4">
        Terima kasih telah berfoto bersama {config.brandName}. Hak Cipta dilindungi.
      </footer>
    </div>
  );
};
