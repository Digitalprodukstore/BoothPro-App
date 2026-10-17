import React, { useState, useEffect, useRef } from 'react';
import { Camera, RefreshCw, Sparkles, Check, AlertCircle, Video, Lightbulb } from 'lucide-react';
import { PackageConfig, OperatorConfig } from '../../types';
import { sessionRecorder } from '../../services/sessionRecorder';
import { audioEffects } from '../../services/audioEffects';

interface CaptureScreenProps {
  config: OperatorConfig;
  selectedPackage: PackageConfig;
  onCompleteCapture: (capturedPhotos: string[], videoUrl: string, videoMime: string) => void;
  onCancel: () => void;
}

const POSE_IDEAS = [
  '✌️ Pose Peace klasik & senyum lebar!',
  '🫶 Bikin bentuk Love pake tangan!',
  '😎 Ekspresi Cool / Candid tanpa liat kamera!',
  '🤪 Pose Konyol / Lidah melet bareng bestie!',
  '🤫 Pose Rahasia / Jari telunjuk di bibir!',
  '✨ Pose Tertawa lepas seolah ada yang lucu!',
];

export const CaptureScreen: React.FC<CaptureScreenProps> = ({
  config,
  selectedPackage,
  onCompleteCapture,
  onCancel,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [currentPoseIndex, setCurrentPoseIndex] = useState<number>(0);
  const [retakesLeft, setRetakesLeft] = useState<number>(config.maxRetakes);

  const [isCountingDown, setIsCountingDown] = useState<boolean>(false);
  const [countdownNum, setCountdownNum] = useState<number>(config.countdownSeconds);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [isFinalizingVideo, setIsFinalizingVideo] = useState<boolean>(false);

  const [recElapsedSeconds, setRecElapsedSeconds] = useState<number>(0);
  const [poseSuggestion, setPoseSuggestion] = useState<string>(POSE_IDEAS[0]);

  const targetPhotoCount = selectedPackage.photoCount;

  // Initialize Camera & C10 Live Session Recorder
  useEffect(() => {
    let localStream: MediaStream | null = null;

    async function initCamera() {
      try {
        // Try with audio first for full Live Session video experience
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              facingMode: 'user',
            },
            audio: true,
          });
        } catch (micErr) {
          // If microphone denied or unavailable, fallback gracefully to video only
          console.warn('[Capture] Audio access denied or unavailable, proceeding with video only');
          localStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              facingMode: 'user',
            },
            audio: false,
          });
        }

        setStream(localStream);
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
        }

        // CRITICAL C10 RECORDER ACTIVATION
        sessionRecorder.startSessionRecorder(localStream);
      } catch (err: any) {
        console.error('[Capture] Camera initialization error:', err);
        setCameraError(
          'Tidak dapat mengakses kamera. Pastikan izin kamera aktif dan perangkat terhubung.'
        );
      }
    }

    initCamera();

    // Elapsed recording timer & C10 watchdog check
    const watchdogInterval = setInterval(() => {
      setRecElapsedSeconds((prev) => prev + 1);
      if (localStream) {
        sessionRecorder.ensureRecordingActive(localStream);
      }
    }, 1000);

    return () => {
      clearInterval(watchdogInterval);
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Update pose idea on pose index change
  useEffect(() => {
    setPoseSuggestion(POSE_IDEAS[currentPoseIndex % POSE_IDEAS.length]);
  }, [currentPoseIndex]);

  // Handle Countdown & Photo Capture
  const handleStartCapture = () => {
    if (isCountingDown || isFinalizingVideo || capturedPhotos.length >= targetPhotoCount) return;

    setIsCountingDown(true);
    setCountdownNum(config.countdownSeconds);

    let count = config.countdownSeconds;
    audioEffects.playCountdownTick();

    const timer = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdownNum(count);
        if (count === 1) {
          audioEffects.playCountdownFinalTick();
        } else {
          audioEffects.playCountdownTick();
        }
      } else {
        clearInterval(timer);
        setIsCountingDown(false);
        triggerSnapPhoto();
      }
    }, 1000);
  };

  // Snaps photo from video element
  const triggerSnapPhoto = () => {
    if (!videoRef.current) return;

    // Trigger visual flash & shutter sound
    setIsFlashing(true);
    audioEffects.playShutterSound();
    setTimeout(() => setIsFlashing(false), 400);

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 960;
    const ctx = canvas.getContext('2d')!;

    // Mirror image for natural selfie feel
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const photoDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const updated = [...capturedPhotos, photoDataUrl];
    setCapturedPhotos(updated);
    setCurrentPoseIndex(updated.length);

    // If reached target photo count, finalize session video!
    if (updated.length >= targetPhotoCount) {
      finalizeSessionMedia(updated);
    }
  };

  // Retake latest photo
  const handleRetakeLatest = () => {
    if (retakesLeft <= 0 || capturedPhotos.length === 0) return;
    audioEffects.playClick();
    setRetakesLeft((prev) => prev - 1);
    const updated = [...capturedPhotos];
    updated.pop();
    setCapturedPhotos(updated);
    setCurrentPoseIndex(updated.length);
  };

  // Finalizes Live Session Video via C10 Stop Promise and proceeds to Editor
  const finalizeSessionMedia = async (finalPhotos: string[]) => {
    setIsFinalizingVideo(true);

    try {
      console.log('[Capture] Finalizing C10 Live Session video...');
      // Guaranteed stop promise that awaits onstop
      const result = await sessionRecorder.stopSessionRecorder();
      console.log('[Capture] Live Session finalized with URL:', result.url);

      audioEffects.playSuccessChime();

      // Proceed to next step with complete photos and verified video!
      onCompleteCapture(finalPhotos, result.url, result.mimeType);
    } catch (err) {
      console.error('[Capture] Error during video finalization:', err);
      // Fallback url
      onCompleteCapture(finalPhotos, '', 'video/webm');
    }
  };

  return (
    <div className="relative w-full h-full min-h-screen flex flex-col justify-between p-4 sm:p-8 bg-slate-950 text-white select-none overflow-hidden">
      {/* Visual Camera Flash Overlay */}
      {isFlashing && (
        <div className="fixed inset-0 bg-white z-50 animate-camera-flash pointer-events-none" />
      )}

      {/* Header Bar */}
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              audioEffects.playClick();
              onCancel();
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold"
          >
            Batal
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-950/60 border border-red-800/80 text-red-400 text-xs font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping inline-block" />
            <Video className="w-3.5 h-3.5" />
            <span>
              LIVE REC{' '}
              <span className="font-mono-numbers">
                {Math.floor(recElapsedSeconds / 60)}:
                {(recElapsedSeconds % 60).toString().padStart(2, '0')}
              </span>
            </span>
          </div>
        </div>

        <div className="text-center">
          <span className="text-xs font-bold tracking-wider text-pink-400 uppercase">
            Pose {Math.min(currentPoseIndex + 1, targetPhotoCount)} dari {targetPhotoCount}
          </span>
          <h2 className="text-lg sm:text-xl font-black">{selectedPackage.name}</h2>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Kesempatan Retake:</span>
          <span
            className={`font-black px-2 py-0.5 rounded-full ${
              retakesLeft > 0 ? 'bg-pink-500/20 text-pink-400' : 'bg-slate-800 text-slate-500'
            }`}
          >
            {retakesLeft}x
          </span>
        </div>
      </header>

      {/* Center Viewport: Camera Feed & Side Strip */}
      <main className="w-full max-w-6xl mx-auto my-auto py-4 z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Main Camera Viewfinder */}
        <div className="lg:col-span-9 relative aspect-4/3 sm:aspect-16/10 bg-slate-900 rounded-3xl overflow-hidden border-2 border-slate-800 shadow-2xl flex items-center justify-center">
          {cameraError ? (
            <div className="p-8 text-center max-w-md">
              <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">Kamera Tidak Tersedia</h3>
              <p className="text-xs text-slate-400 mb-6">{cameraError}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 rounded-xl bg-pink-600 text-white font-bold text-xs"
              >
                Muat Ulang Kiosk
              </button>
            </div>
          ) : (
            <>
              {/* Mirrored live video stream */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />

              {/* Grid Lines Overlay */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-20">
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-white" />
                <div className="border-r border-white" />
                <div />
              </div>

              {/* Big Animated Countdown Number */}
              {isCountingDown && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs z-30">
                  <div className="text-8xl sm:text-9xl font-black text-pink-400 drop-shadow-[0_0_35px_rgba(236,72,153,0.9)] animate-scale-up font-mono-numbers">
                    {countdownNum}
                  </div>
                </div>
              )}

              {/* Video Finalizing Spinner */}
              {isFinalizingVideo && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-40">
                  <div className="w-16 h-16 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mb-4" />
                  <h3 className="text-xl font-bold text-white mb-1">Memproses Sesi Foto...</h3>
                  <p className="text-xs text-slate-400">
                    C10 Watchdog memfinalisasi Live Session video & GIF bundle ✨
                  </p>
                </div>
              )}

              {/* Fun Pose Suggestion Pill */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-slate-900/80 border border-slate-700/80 backdrop-blur-md text-xs font-semibold text-pink-300 flex items-center gap-2 shadow-lg">
                <Lightbulb className="w-3.5 h-3.5 text-amber-300" />
                <span>{poseSuggestion}</span>
              </div>
            </>
          )}
        </div>

        {/* Right Side: Captured Photos Thumbnail Strip */}
        <div className="lg:col-span-3 bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col justify-between h-full min-h-[360px] shadow-xl">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Foto Tersimpan
              </span>
              <span className="text-xs font-bold text-pink-400">
                {capturedPhotos.length}/{targetPhotoCount}
              </span>
            </div>

            {/* Thumbnail Slots */}
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
              {Array.from({ length: targetPhotoCount }).map((_, idx) => {
                const photo = capturedPhotos[idx];

                return (
                  <div
                    key={idx}
                    className={`relative aspect-4/3 rounded-xl overflow-hidden border-2 flex items-center justify-center transition ${
                      photo
                        ? 'border-pink-500 bg-black shadow-md'
                        : idx === currentPoseIndex
                        ? 'border-dashed border-pink-400/80 bg-pink-950/20 animate-pulse'
                        : 'border-slate-800 bg-slate-950/60'
                    }`}
                  >
                    {photo ? (
                      <>
                        <img
                          src={photo}
                          alt={`Pose ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-pink-500 text-white flex items-center justify-center text-[10px] font-bold">
                          {idx + 1}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs font-bold text-slate-600">
                        {idx + 1}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Retake Button */}
          {capturedPhotos.length > 0 && capturedPhotos.length < targetPhotoCount && (
            <button
              onClick={handleRetakeLatest}
              disabled={retakesLeft <= 0}
              className="mt-4 w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-300 text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Ulang Foto Terakhir</span>
            </button>
          )}
        </div>
      </main>

      {/* Bottom Shutter Action Bar */}
      <footer className="w-full max-w-4xl mx-auto flex items-center justify-center gap-6 z-10 pt-2">
        <button
          onClick={handleStartCapture}
          disabled={isCountingDown || isFinalizingVideo || capturedPhotos.length >= targetPhotoCount}
          className="group relative flex items-center justify-center gap-3 px-10 sm:px-14 py-5 sm:py-6 rounded-3xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 disabled:opacity-50 text-white font-black text-xl sm:text-2xl shadow-2xl shadow-pink-500/50 hover:scale-105 active:scale-95 transition cursor-pointer"
        >
          <Camera className="w-7 h-7 sm:w-8 sm:h-8 group-hover:rotate-12 transition-transform" />
          <span>{isCountingDown ? `Siap-siap (${countdownNum})...` : 'AMBIL FOTO 📸'}</span>
        </button>
      </footer>
    </div>
  );
};
