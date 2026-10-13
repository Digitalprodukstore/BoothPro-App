import React from 'react';
import { Camera, Sparkles, Volume2, VolumeX, Shield, Heart, Zap } from 'lucide-react';
import { OperatorConfig } from '../../types';
import { audioEffects } from '../../services/audioEffects';

interface StartScreenProps {
  config: OperatorConfig;
  onStart: () => void;
  onOpenAdmin: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({
  config,
  onStart,
  onOpenAdmin,
  isMuted,
  onToggleMute,
}) => {
  const handleStartClick = () => {
    // Navigation must never depend on Web Audio being available/resumed on iOS/iPadOS.
    // Move to the next kiosk step first; sound is only secondary feedback.
    onStart();
    try {
      audioEffects.playClick();
    } catch {
      // Audio feedback must never block the kiosk flow.
    }
  };

  return (
    <div className="relative w-full h-full min-h-screen flex flex-col items-center justify-between p-6 sm:p-10 bg-radial from-slate-900 via-slate-950 to-black overflow-hidden select-none">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-pink-500/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

      <header className="w-full max-w-5xl flex items-center justify-between z-10 pt-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-400 flex items-center justify-center shadow-lg shadow-pink-500/30">
            <Camera className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              {config.brandName}
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-400 border border-pink-500/30">KIOSK</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 font-medium">{config.tagline}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              try { audioEffects.playClick(); } catch {}
              onToggleMute();
            }}
            className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition backdrop-blur-md active:scale-95"
            title={isMuted ? 'Nyalakan Suara' : 'Bisukan Suara'}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 text-pink-400" />}
          </button>

          <button
            type="button"
            onClick={() => {
              try { audioEffects.playClick(); } catch {}
              onOpenAdmin();
            }}
            className="p-3 rounded-xl bg-slate-900/40 hover:bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-800/60 transition backdrop-blur-md active:scale-95"
            title="Operator Dashboard (PIN)"
          >
            <Shield className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center z-10 max-w-3xl my-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/80 border border-slate-700/80 text-pink-400 text-sm font-semibold mb-6 shadow-inner animate-pulse">
          <Sparkles className="w-4 h-4" />
          <span>Self-Service Photobooth Kiosk</span>
        </div>

        <h2 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-tight sm:leading-none mb-6">
          {config.welcomeHeadline.split(' ')[0]}{' '}
          <span className="bg-gradient-to-r from-pink-500 via-rose-400 to-amber-300 bg-clip-text text-transparent">
            {config.welcomeHeadline.split(' ').slice(1).join(' ')}
          </span>
        </h2>

        <p className="text-base sm:text-xl text-slate-300 max-w-2xl font-normal mb-10 leading-relaxed">{config.welcomeSubheadline}</p>

        <button
          type="button"
          onClick={handleStartClick}
          className="group relative z-20 inline-flex items-center gap-4 px-10 sm:px-14 py-6 sm:py-7 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-pink-600 via-rose-500 to-pink-500 text-white font-extrabold text-xl sm:text-3xl shadow-2xl shadow-pink-500/50 hover:shadow-pink-500/80 hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 cursor-pointer touch-manipulation select-none"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Camera className="w-8 h-8 sm:w-10 sm:h-10 group-hover:rotate-12 transition-transform duration-300" />
          <span>Mulai Sesi Foto</span>
          <Zap className="w-6 h-6 sm:w-8 sm:h-8 fill-current text-amber-300 animate-bounce" />
        </button>

        <div className="grid grid-cols-3 gap-3 sm:gap-6 mt-12 w-full max-w-xl text-slate-300 text-xs sm:text-sm">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 sm:p-4 flex flex-col items-center gap-1 backdrop-blur-md"><span className="text-xl sm:text-2xl">📸</span><span className="font-bold text-white">Cetak Instan</span><span className="text-slate-400 text-[11px]">Kualitas Studio</span></div>
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 sm:p-4 flex flex-col items-center gap-1 backdrop-blur-md"><span className="text-xl sm:text-2xl">🎞️</span><span className="font-bold text-white">Boomerang GIF</span><span className="text-slate-400 text-[11px]">Animasi Bergerak</span></div>
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 sm:p-4 flex flex-col items-center gap-1 backdrop-blur-md"><span className="text-xl sm:text-2xl">🎥</span><span className="font-bold text-white">Live Session</span><span className="text-slate-400 text-[11px]">Video Rekaman</span></div>
        </div>
      </main>

      <footer className="w-full max-w-5xl flex items-center justify-between text-xs text-slate-500 z-10 border-t border-slate-900 pt-4">
        <div className="flex items-center gap-2"><span>QRIS Payment Ready</span><span>•</span><span>Automatic Soft-File WhatsApp & Email</span></div>
        <div className="flex items-center gap-1 text-slate-400"><span>Sentuh layar untuk memulai</span><Heart className="w-3.5 h-3.5 text-pink-500 fill-pink-500" /></div>
      </footer>
    </div>
  );
};
