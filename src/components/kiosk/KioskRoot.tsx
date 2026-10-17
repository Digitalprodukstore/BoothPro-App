import React, { useState, useEffect } from 'react';
import {
  OperatorConfig,
  PackageConfig,
  PaymentMethod,
  FrameTemplate,
  SlotTransform,
  SessionData,
} from '../../types';
import { DEFAULT_FRAMES } from '../../data/defaultConfig';
import { storageService } from '../../services/storageService';
import { audioEffects } from '../../services/audioEffects';
import { StartScreen } from './StartScreen';
import { PackageScreen } from './PackageScreen';
import { PaymentScreen } from './PaymentScreen';
import { CaptureScreen } from './CaptureScreen';
import { EditorScreen } from './EditorScreen';
import { FinalPreviewScreen } from './FinalPreviewScreen';
import { SoftFileScreen } from './SoftFileScreen';
import { SoftFilePublicView } from './SoftFilePublicView';
import { DashboardModal } from '../dashboard/DashboardModal';

type KioskStep =
  | 'start'
  | 'package'
  | 'payment'
  | 'capture'
  | 'editor'
  | 'final'
  | 'softfile';

export const KioskRoot: React.FC = () => {
  // Config State
  const [config, setConfig] = useState<OperatorConfig>(() =>
    storageService.getOperatorConfig()
  );

  // Refresh safe public settings from cloud on each device; localStorage remains an offline cache.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await storageService.loadOperatorConfigFromCloud();
      if (cancelled || !result.success || !result.config) return;
      const merged = { ...storageService.getOperatorConfig(), ...result.config };
      storageService.saveOperatorConfig(merged);
      setConfig(merged);
      setSelectedPackage((current) => merged.packages.find((p) => p.id === current.id) || merged.packages[1] || current);
    })();
    return () => { cancelled = true; };
  }, []);

  // Flow State
  const [currentStep, setCurrentStep] = useState<KioskStep>('start');
  const [selectedPackage, setSelectedPackage] = useState<PackageConfig>(config.packages[1]);
  const [extraPrints, setExtraPrints] = useState<number>(0);
  const [totalPrice, setTotalPrice] = useState<number>(selectedPackage.price);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('qris');

  // Media Capture State
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string>('');
  const [videoMimeType, setVideoMimeType] = useState<string>('video/webm');
  const [finalPhotoUrl, setFinalPhotoUrl] = useState<string>('');
  const [gifUrl, setGifUrl] = useState<string>('');

  // Final composition state must survive into the saved session/soft-file manifest.
  const [selectedFrameId, setSelectedFrameId] = useState<string>('');
  const [slotTransforms, setSlotTransforms] = useState<SlotTransform[]>([]);

  // Active Session Object
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);

  // Admin Modal & Audio
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // URL hash check for public softfile view
  const [publicSessionId, setPublicSessionId] = useState<string | null>(null);

  useEffect(() => {
    const handleUrlRoutes = () => {
      const hash = window.location.hash;
      const search = new URLSearchParams(window.location.search);
      const pathname = window.location.pathname;

      if (hash.startsWith('#softfile=')) {
        const sid = hash.replace('#softfile=', '');
        setPublicSessionId(sid);
        setIsAdminOpen(false);
      } else if (search.get('sessionId')) {
        setPublicSessionId(search.get('sessionId'));
        setIsAdminOpen(false);
      } else if (
        search.get('view') === 'dashboard' ||
        search.get('bp-dashboard') === '1' ||
        hash === '#dashboard' ||
        pathname.endsWith('/dashboard') ||
        pathname.endsWith('/admin')
      ) {
        setIsAdminOpen(true);
        setPublicSessionId(null);
      } else {
        // Default: ALWAYS KIOSK AT START SCREEN
        setPublicSessionId(null);
        setIsAdminOpen(false);
      }
    };

    handleUrlRoutes();
    window.addEventListener('hashchange', handleUrlRoutes);
    window.addEventListener('popstate', handleUrlRoutes);
    return () => {
      window.removeEventListener('hashchange', handleUrlRoutes);
      window.removeEventListener('popstate', handleUrlRoutes);
    };
  }, []);

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    audioEffects.setMuted(next);
  };

  // Generate unique session ID
  const generateNewSessionId = () => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `BP-${dateStr}-${rand}`;
  };

  // RESET KIOSK TO START
  const handleResetKiosk = () => {
    setCapturedPhotos([]);
    setVideoBlobUrl('');
    setFinalPhotoUrl('');
    setGifUrl('');
    setSelectedFrameId('');
    setSlotTransforms([]);
    setActiveSession(null);
    setExtraPrints(0);
    setCurrentStep('start');
  };

  // STEP 1 -> 2: refresh the shared config immediately before every new session.
  // This avoids starting with stale device cache while the initial cloud request is still pending.
  const handleStart = async () => {
    audioEffects.playClick();
    const result = await storageService.loadOperatorConfigFromCloud();
    if (result.success && result.config) {
      const merged = { ...storageService.getOperatorConfig(), ...result.config };
      storageService.saveOperatorConfig(merged);
      setConfig(merged);
      setSelectedPackage((current) => merged.packages.find((p) => p.id === current.id) || merged.packages[1] || merged.packages[0] || current);
    }
    // If the cloud is temporarily unavailable, retain the last local cache and allow offline use.
    setCurrentStep('package');
  };

  // STEP 2 -> 3
  const handleSelectPackage = (pkg: PackageConfig, frame: FrameTemplate, extra: number, total: number) => {
    setSelectedPackage(pkg);
    setSelectedFrameId(frame.id);
    setExtraPrints(extra);
    setTotalPrice(total);
    setCurrentStep('payment');
  };

  // STEP 3 -> 4
  const handlePaymentSuccess = (method: PaymentMethod, paidAmount: number) => {
    setPaymentMethod(method);
    setTotalPrice(paidAmount);
    setCurrentStep('capture');
  };

  // STEP 4 -> 5
  const handleCompleteCapture = (photos: string[], videoUrl: string, videoMime: string) => {
    setCapturedPhotos(photos);
    setVideoBlobUrl(videoUrl);
    setVideoMimeType(videoMime);
    setCurrentStep('editor');
  };

  // STEP 5 -> 6
  const handleCompleteEdit = (
    frame: FrameTemplate,
    transforms: SlotTransform[],
    finalUrl: string
  ) => {
    setSelectedFrameId(frame.id);
    setSlotTransforms(transforms);
    setFinalPhotoUrl(finalUrl);
    setCurrentStep('final');
  };

  // STEP 6 -> 7
  const handleProceedToSoftfile = (generatedGifUrl: string) => {
    setGifUrl(generatedGifUrl);

    const newSession: SessionData = {
      sessionId: generateNewSessionId(),
      createdAt: new Date().toISOString(),
      package: selectedPackage,
      extraPrints,
      totalPrice,
      paymentMethod,
      capturedPhotos,
      selectedFrameId,
      slotTransforms,
      finalPhotoDataUrl: finalPhotoUrl,
      gifBlobUrl: generatedGifUrl,
      videoBlobUrl,
      videoMimeType,
      customerPhone: '',
      customerEmail: '',
      deliveryStatus: {
        whatsapp: 'idle',
        email: 'idle',
      },
      manifestValid: true,
    };

    setActiveSession(newSession);
    storageService.saveSession(newSession);
    setCurrentStep('softfile');
  };

  // If customer is accessing public softfile link directly
  if (publicSessionId) {
    const loadedSession = storageService.getSessionById(publicSessionId);
    if (loadedSession) {
      return (
        <SoftFilePublicView
          session={loadedSession}
          config={config}
          onGoBackToKiosk={() => {
            window.location.hash = '';
            setPublicSessionId(null);
          }}
        />
      );
    }
  }

  return (
    <div className="w-full min-h-screen bg-slate-950 text-white font-sans overflow-x-hidden">
      {/* KIOSK SCREENS */}
      {currentStep === 'start' && (
        <StartScreen
          config={config}
          onStart={handleStart}
          onOpenAdmin={() => setIsAdminOpen(true)}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
        />
      )}

      {currentStep === 'package' && (
        <PackageScreen
          config={config}
          onSelectPackage={handleSelectPackage}
          onBack={handleResetKiosk}
        />
      )}

      {currentStep === 'payment' && (
        <PaymentScreen
          config={config}
          selectedPackage={selectedPackage}
          extraPrints={extraPrints}
          totalPrice={totalPrice}
          onPaymentSuccess={handlePaymentSuccess}
          onBack={() => setCurrentStep('package')}
        />
      )}

      {currentStep === 'capture' && (
        <CaptureScreen
          config={config}
          selectedPackage={selectedPackage}
          onCompleteCapture={handleCompleteCapture}
          onCancel={handleResetKiosk}
        />
      )}

      {currentStep === 'editor' && (
        <EditorScreen
          config={config}
          selectedPackage={selectedPackage}
          capturedPhotos={capturedPhotos}
          initialFrame={(config.frames || DEFAULT_FRAMES).find((frame) => frame.id === selectedFrameId)}
          onCompleteEdit={handleCompleteEdit}
          onBack={() => setCurrentStep('capture')}
        />
      )}

      {currentStep === 'final' && (
        <FinalPreviewScreen
          config={config}
          selectedPackage={selectedPackage}
          extraPrints={extraPrints}
          finalPhotoUrl={finalPhotoUrl}
          capturedPhotos={capturedPhotos}
          onProceedToSoftfile={handleProceedToSoftfile}
        />
      )}

      {currentStep === 'softfile' && activeSession && (
        <SoftFileScreen
          session={activeSession}
          config={config}
          onFinishSession={handleResetKiosk}
        />
      )}

      {/* OPERATOR DASHBOARD MODAL */}
      <DashboardModal
        isOpen={isAdminOpen}
        onClose={() => {
          setIsAdminOpen(false);
          if (window.location.hash === '#dashboard') {
            window.location.hash = '';
          }
        }}
        config={config}
        onSaveConfig={(updated) => {
          setConfig(updated);
        }}
      />
    </div>
  );
};
