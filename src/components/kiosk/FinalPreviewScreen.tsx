import React, { useState, useEffect, useCallback } from 'react';
import { Printer, ArrowRight, CheckCircle2, Sparkles, Check, Loader2 } from 'lucide-react';
import { PackageConfig, OperatorConfig } from '../../types';
import { generateAnimatedGif } from '../../services/gifGenerator';
import { audioEffects } from '../../services/audioEffects';

interface FinalPreviewScreenProps {
  config: OperatorConfig;
  selectedPackage: PackageConfig;
  extraPrints: number;
  finalPhotoUrl: string;
  capturedPhotos: string[];
  onProceedToSoftfile: (gifUrl: string) => void;
}

export const FinalPreviewScreen: React.FC<FinalPreviewScreenProps> = ({
  config,
  selectedPackage,
  extraPrints,
  finalPhotoUrl,
  capturedPhotos,
  onProceedToSoftfile,
}) => {
  const totalPrints = selectedPackage.defaultCopies + extraPrints;
  const [hasPrinted, setHasPrinted] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [gifUrl, setGifUrl] = useState('');
  const [isGifReady, setIsGifReady] = useState(false);
  const [isGifGenerating, setIsGifGenerating] = useState(false);
  const [gifError, setGifError] = useState('');

  const buildGif = useCallback(async () => {
    if (!capturedPhotos.length) return;
    setIsGifGenerating(true);
    setIsGifReady(false);
    setGifError('');
    try {
      console.log('[FinalPreview] Generating optimized GIF...');
      const result = await generateAnimatedGif(capturedPhotos, {
        width: 240,
        height: 180,
        delayMs: 650,
        watermarkText: '',
      });
      setGifUrl(result.url);
      setIsGifReady(true);
      console.log('[FinalPreview] GIF ready:', result.blob.size, 'bytes');
    } catch (err: any) {
      console.warn('[FinalPreview] GIF generation failed', err);
      setGifError(err?.message || 'GIF gagal dibuat.');
    } finally {
      setIsGifGenerating(false);
    }
  }, [capturedPhotos]);

  useEffect(() => {
    void buildGif();
  }, [buildGif]);

  const handlePrint = () => {
    if (isPrinting) return;
    setIsPrinting(true);
    audioEffects.playClick();
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
      setHasPrinted(true);
      audioEffects.playSuccessChime();
    }, 400);
  };

  const handleProceed = async () => {
    audioEffects.playClick();
    if (!isGifReady || !gifUrl) {
      await buildGif();
      return;
    }
    onProceedToSoftfile(gifUrl);
  };

  return (
    <div className="relative w-full h-full min-h-screen flex flex-col justify-between p-4 sm:p-8 bg-slate-950 text-white select-none">
      <div id="boothpro-printable-area" className="hidden">
        {Array.from({ length: totalPrints }).map((_, i) => (
          <div key={i} className="w-full h-full flex items-center justify-center page-break-after-always" style={{ pageBreakAfter: i < totalPrints - 1 ? 'always' : 'auto' }}>
            <img src={finalPhotoUrl} alt="BoothPro Print Output" style={{ maxHeight: '100vh', maxWidth: '100vw', objectFit: 'contain' }} />
          </div>
        ))}
      </div>

      <header className="w-full max-w-5xl mx-auto flex items-center justify-between z-10 no-print">
        <div className="w-24"><span className="text-xs font-bold text-slate-400">{config.brandName}</span></div>
        <div className="text-center"><span className="text-xs font-bold tracking-wider text-pink-400 uppercase">Langkah 4 dari 4</span><h2 className="text-xl sm:text-2xl font-black">Hasil Foto Final</h2></div>
        <div className="w-24 text-right"><span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">{totalPrints} Cetakan</span></div>
      </header>

      <main className="w-full max-w-4xl mx-auto my-auto py-4 z-10 flex flex-col md:flex-row items-center justify-center gap-8 no-print">
        <div className="relative max-h-[520px] max-w-[340px] w-full flex items-center justify-center p-3 bg-slate-900/90 rounded-3xl border border-slate-800 shadow-2xl backdrop-blur-md">
          {finalPhotoUrl ? <img src={finalPhotoUrl} alt="Hasil Cetak Final" className="max-h-[480px] w-auto object-contain rounded-xl shadow-2xl" /> : <div className="w-64 h-96 flex items-center justify-center text-slate-500 text-xs">Membuat foto...</div>}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300 text-xs font-bold shadow-lg flex items-center gap-1.5 whitespace-nowrap"><Sparkles className="w-3.5 h-3.5 text-pink-400" /><span>Siap Cetak • {selectedPackage.name}</span></div>
        </div>

        <div className="flex flex-col gap-4 max-w-sm w-full">
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 flex flex-col gap-4 shadow-xl">
            <h3 className="text-lg font-black text-white">Cetak Foto Fisik</h3>
            <p className="text-xs text-slate-400 leading-relaxed">Foto Anda akan dicetak sebanyak <strong>{totalPrints} lembar</strong> sesuai paket &amp; ekstra print.</p>
            <button onClick={handlePrint} disabled={isPrinting} className={`w-full py-4 px-6 rounded-2xl font-black text-base flex items-center justify-center gap-3 transition shadow-xl cursor-pointer ${hasPrinted ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30' : 'bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white shadow-pink-600/30'}`}>
              <Printer className="w-5 h-5" /><span>{isPrinting ? 'Mengirim ke Printer...' : hasPrinted ? 'Cetak Ulang' : 'Cetak Foto Sekarang'}</span>{hasPrinted && <Check className="w-5 h-5 stroke-[3]" />}
            </button>
            {hasPrinted && <div className="flex items-center gap-2 text-emerald-400 text-xs bg-emerald-950/40 border border-emerald-800/80 p-2.5 rounded-xl"><CheckCircle2 className="w-4 h-4 shrink-0" /><span>Foto telah dikirim ke printer kiosk. Silakan ambil di slot keluar!</span></div>}
          </div>

          <div className="text-center text-xs min-h-5">
            {isGifGenerating && <span className="text-slate-400 inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Menyiapkan GIF ringan...</span>}
            {!isGifGenerating && isGifReady && <span className="text-emerald-400">✓ GIF siap untuk soft-file</span>}
            {!isGifGenerating && gifError && <span className="text-amber-400">{gifError}</span>}
          </div>

          <button onClick={handleProceed} disabled={isGifGenerating} className="w-full py-4 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-white font-extrabold text-base flex items-center justify-center gap-3 transition shadow-lg active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-wait">
            {isGifGenerating ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Menyiapkan Soft-File...</span></> : isGifReady ? <><span>Lanjut Ambil Soft-File</span><ArrowRight className="w-5 h-5 text-pink-400" /></> : <><span>Coba Siapkan GIF Lagi</span><ArrowRight className="w-5 h-5 text-pink-400" /></>}
          </button>
        </div>
      </main>

      <footer className="w-full max-w-5xl mx-auto text-center text-xs text-slate-500 border-t border-slate-900 pt-3 z-10 no-print">Setelah mencetak, lanjutkan untuk mengambil soft-file (Foto HD, Boomerang GIF, dan Live Session Video).</footer>
    </div>
  );
};
