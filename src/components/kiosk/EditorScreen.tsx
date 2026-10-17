import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ArrowRight, ZoomIn, ZoomOut, Move, Palette, Sparkles, Sliders, Check } from 'lucide-react';
import { FrameTemplate, SlotTransform, PhotoFilter, OperatorConfig, PackageConfig } from '../../types';
import { DEFAULT_FRAMES } from '../../data/defaultConfig';
import { CanvasRenderer } from '../../services/canvasRenderer';
import { audioEffects } from '../../services/audioEffects';

interface EditorScreenProps {
  config: OperatorConfig;
  selectedPackage: PackageConfig;
  capturedPhotos: string[];
  initialFrame?: FrameTemplate;
  onCompleteEdit: (selectedFrame: FrameTemplate, transforms: SlotTransform[], finalPhotoUrl: string) => void;
  onBack: () => void;
}

const FILTERS: { id: PhotoFilter; label: string; icon: string }[] = [
  { id: 'none', label: 'Original', icon: '✨' },
  { id: 'bw', label: 'Noir B&W', icon: '🖤' },
  { id: 'vintage', label: 'Vintage Warm', icon: '🎞️' },
  { id: 'tokyo', label: 'Tokyo Pastel', icon: '🌸' },
  { id: 'grain', label: 'Film Grain', icon: '📽️' },
  { id: 'glow', label: 'Soft Glow', icon: '💫' },
  { id: 'vibrant', label: 'Vibrant Pop', icon: '🌈' },
];

export const EditorScreen: React.FC<EditorScreenProps> = ({
  config,
  selectedPackage,
  capturedPhotos,
  initialFrame,
  onCompleteEdit,
  onBack,
}) => {
  // Filter frames matching layout of package
  const matchingFrames = (config.frames || DEFAULT_FRAMES).filter(
    (f) => f.isActive !== false && (f.slots.length === selectedPackage.photoCount || f.layoutType === selectedPackage.recommendedLayout)
  );
  const resolvedInitialFrame = (initialFrame && matchingFrames.some((frame) => frame.id === initialFrame.id))
    ? initialFrame
    : matchingFrames[0] || DEFAULT_FRAMES[0];

  const [selectedFrame, setSelectedFrame] = useState<FrameTemplate>(resolvedInitialFrame);
  const [activeSlotId, setActiveSlotId] = useState<number>(1);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'frame' | 'adjust' | 'filter'>('frame');
  const gestureRef = useRef<{ distance: number; zoom: number; x: number; y: number; panX: number; panY: number } | null>(null);

  // Initialize transforms for each slot
  const [slotTransforms, setSlotTransforms] = useState<SlotTransform[]>(() => {
    return resolvedInitialFrame.slots.map((slot, idx) => ({
      slotId: slot.id,
      photoIndex: idx % capturedPhotos.length,
      zoom: 1.0,
      panX: 0,
      panY: 0,
      filter: 'none' as PhotoFilter,
    }));
  });

  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [isRendering, setIsRendering] = useState<boolean>(false);

  // When frame changes, update transforms array to match frame slots
  useEffect(() => {
    setSlotTransforms((prev) => {
      return selectedFrame.slots.map((slot, idx) => {
        const existing = prev.find((t) => t.slotId === slot.id);
        if (existing) return existing;
        return {
          slotId: slot.id,
          photoIndex: idx % capturedPhotos.length,
          zoom: 1.0,
          panX: 0,
          panY: 0,
          filter: 'none' as PhotoFilter,
        };
      });
    });
    setActiveSlotId(1);
  }, [selectedFrame, capturedPhotos.length]);

  // Re-render preview canvas whenever frame or transforms change
  useEffect(() => {
    let cancel = false;
    async function updatePreview() {
      setIsRendering(true);
      try {
        const url = await CanvasRenderer.renderFramedPhoto(
          selectedFrame,
          capturedPhotos,
          slotTransforms,
          config.brandName
        );
        if (!cancel) {
          setPreviewDataUrl(url);
        }
      } catch (err) {
        console.error('Failed to render canvas preview', err);
      } finally {
        if (!cancel) setIsRendering(false);
      }
    }

    updatePreview();
    return () => {
      cancel = true;
    };
  }, [selectedFrame, slotTransforms, capturedPhotos, config.brandName]);

  const activeTransform = slotTransforms.find((t) => t.slotId === activeSlotId) || slotTransforms[0];

  // Helper to update specific property of active transform
  const updateActiveTransform = (partial: Partial<SlotTransform>) => {
    setSlotTransforms((prev) =>
      prev.map((t) => (t.slotId === activeSlotId ? { ...t, ...partial } : t))
    );
  };

  // Pinch-to-zoom and one-finger pan on the preview; buttons/sliders remain as accessible fallbacks.
  const handlePreviewTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!activeTransform || event.touches.length === 0) return;
    const first = event.touches[0];
    const second = event.touches[1];
    const distance = second ? Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY) : 0;
    gestureRef.current = { distance, zoom: activeTransform.zoom, x: first.clientX, y: first.clientY, panX: activeTransform.panX, panY: activeTransform.panY };
  };
  const handlePreviewTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = gestureRef.current;
    if (!start || !activeTransform) return;
    if (event.cancelable) event.preventDefault();
    if (event.touches.length >= 2 && start.distance > 0) {
      const a = event.touches[0]; const b = event.touches[1];
      const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      updateActiveTransform({ zoom: Math.max(1, Math.min(2.5, start.zoom * distance / start.distance)) });
    } else if (event.touches.length === 1) {
      const touch = event.touches[0];
      updateActiveTransform({
        panX: Math.max(-100, Math.min(100, start.panX + (touch.clientX - start.x) / 2)),
        panY: Math.max(-100, Math.min(100, start.panY + (touch.clientY - start.y) / 2)),
      });
    }
  };
  const handlePreviewTouchEnd = () => { gestureRef.current = null; };

  // Pan adjust helpers
  const handlePan = (dx: number, dy: number) => {
    if (!activeTransform) return;
    const newPanX = Math.max(-80, Math.min(80, activeTransform.panX + dx));
    const newPanY = Math.max(-80, Math.min(80, activeTransform.panY + dy));
    updateActiveTransform({ panX: newPanX, panY: newPanY });
  };

  const handleNext = async () => {
    audioEffects.playClick();
    const finalUrl =
      previewDataUrl ||
      (await CanvasRenderer.renderFramedPhoto(
        selectedFrame,
        capturedPhotos,
        slotTransforms,
        config.brandName
      ));
    onCompleteEdit(selectedFrame, slotTransforms, finalUrl);
  };

  return (
    <div className="relative w-full h-full min-h-screen flex flex-col justify-between p-4 sm:p-8 bg-slate-950 text-white select-none">
      {/* Header */}
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between z-10">
        <button
          onClick={() => {
            audioEffects.playClick();
            onBack();
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Foto Ulang</span>
        </button>

        <div className="text-center">
          <span className="text-xs font-bold tracking-wider text-pink-400 uppercase">
            Langkah 3 dari 4
          </span>
          <h2 className="text-lg sm:text-xl font-black">Editor &amp; Desain Frame</h2>
        </div>

        <button
          onClick={handleNext}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-pink-500/20 active:scale-95 transition cursor-pointer"
        >
          <span>Lanjut ke Final</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </header>

      {/* Main Workspace: Left WYSIWYG Frame Preview / Right Controls */}
      <main className="w-full max-w-6xl mx-auto my-auto py-4 z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left Side: Frame Interactive Preview Canvas */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center">
          <div onTouchStart={handlePreviewTouchStart} onTouchMove={handlePreviewTouchMove} onTouchEnd={handlePreviewTouchEnd} onTouchCancel={handlePreviewTouchEnd} className="relative max-h-[540px] max-w-[380px] w-full flex items-center justify-center p-3 bg-slate-900/60 rounded-3xl border border-slate-800/80 shadow-2xl backdrop-blur-md touch-none">
            {previewDataUrl ? (
              <img
                src={previewDataUrl}
                alt="Frame Photobooth Preview"
                className="max-h-[500px] w-auto object-contain rounded-xl shadow-2xl transition"
              />
            ) : (
              <div className="w-64 h-96 flex items-center justify-center text-slate-500 text-xs">
                Rendering Frame...
              </div>
            )}

            {isRendering && (
              <div className="absolute top-4 right-4 px-2 py-1 rounded bg-black/60 text-[10px] text-pink-400 font-mono">
                Updating...
              </div>
            )}
          </div>

          {/* Quick Slot Selector Buttons */}
          <div className="flex items-center gap-2 mt-4 bg-slate-900 px-4 py-2 rounded-2xl border border-slate-800">
            <span className="text-xs font-bold text-slate-400 mr-2">Pilih Slot:</span>
            {selectedFrame.slots.map((slot) => {
              const isSelected = activeSlotId === slot.id;
              return (
                <button
                  key={slot.id}
                  onClick={() => {
                    audioEffects.playClick();
                    setActiveSlotId(slot.id);
                    if (selectedPhotoIndex !== null) {
                      setSlotTransforms((prev) => prev.map((t) => t.slotId === slot.id ? { ...t, photoIndex: selectedPhotoIndex } : t));
                      setSelectedPhotoIndex(null);
                    }
                  }}
                  className={`w-8 h-8 rounded-xl font-bold text-xs transition ${
                    isSelected
                      ? 'bg-pink-600 text-white shadow-md shadow-pink-600/40 scale-105'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  #{slot.id}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: Tabbed Controls (Frame / Adjust / Filter) */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 flex flex-col shadow-xl">
          {/* Editor Tabs */}
          <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 mb-5">
            <button
              onClick={() => {
                audioEffects.playClick();
                setActiveTab('frame');
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition ${
                activeTab === 'frame'
                  ? 'bg-pink-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Frame</span>
            </button>

            <button
              onClick={() => {
                audioEffects.playClick();
                setActiveTab('adjust');
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition ${
                activeTab === 'adjust'
                  ? 'bg-pink-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Zoom/Posisi</span>
            </button>

            <button
              onClick={() => {
                audioEffects.playClick();
                setActiveTab('filter');
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition ${
                activeTab === 'filter'
                  ? 'bg-pink-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Filter Warna</span>
            </button>
          </div>

          {/* TAB 1: FRAME TEMPLATES */}
          {activeTab === 'frame' && (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Pilih Desain Frame
              </span>
              <div className="grid grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
                {DEFAULT_FRAMES.map((frame) => {
                  const isSelected = selectedFrame.id === frame.id;
                  return (
                    <div
                      key={frame.id}
                      onClick={() => {
                        audioEffects.playClick();
                        setSelectedFrame(frame);
                      }}
                      className={`p-3 rounded-2xl border cursor-pointer transition flex flex-col justify-between ${
                        isSelected
                          ? 'border-pink-500 bg-pink-950/20 shadow-md'
                          : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-white truncate">{frame.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-pink-400 shrink-0" />}
                      </div>

                      <div
                        className="h-16 rounded-xl flex items-center justify-center text-[10px] font-bold text-slate-300 border border-slate-700"
                        style={{ backgroundColor: frame.backgroundColor }}
                      >
                        <span style={{ color: frame.accentColor }}>{frame.titleText || 'FRAME'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: ZOOM & PAN ADJUSTMENTS FOR ACTIVE SLOT */}
          {activeTab === 'adjust' && (
            <div className="space-y-5">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Pilih foto, lalu ketuk nomor slot untuk menempatkannya
                </span>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {capturedPhotos.map((photo, idx) => {
                    const isAssigned = activeTransform?.photoIndex === idx;
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          audioEffects.playClick();
                          setSelectedPhotoIndex(idx);
                        }}
                        className={`relative w-16 h-14 rounded-xl overflow-hidden shrink-0 border-2 cursor-pointer transition ${
                          selectedPhotoIndex === idx ? 'border-amber-400 ring-2 ring-amber-400/40 scale-105' : isAssigned ? 'border-pink-500' : 'border-slate-800 opacity-60'
                        }`}
                      >
                        <img src={photo} alt="" className="w-full h-full object-cover" />
                        <span className="absolute bottom-0.5 right-1 text-[9px] font-bold text-white bg-black/60 px-1 rounded">
                          {selectedPhotoIndex === idx ? 'Dipilih' : `Foto #${idx + 1}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Zoom Slider */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <ZoomIn className="w-3.5 h-3.5 text-pink-400" />
                    <span>Perbesar Foto (Zoom)</span>
                  </span>
                  <span className="text-xs font-mono text-pink-400 font-bold">
                    {Math.round((activeTransform?.zoom || 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="2.5"
                  step="0.05"
                  value={activeTransform?.zoom || 1}
                  onChange={(e) => updateActiveTransform({ zoom: parseFloat(e.target.value) })}
                  className="w-full accent-pink-500 cursor-pointer"
                />
              </div>

              {/* Pan / Move Controls */}
              <div>
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-2">
                  <Move className="w-3.5 h-3.5 text-pink-400" />
                  <span>Geser Posisi Foto di Slot #{activeSlotId}</span>
                </span>

                <div className="grid grid-cols-3 gap-2 max-w-[180px] mx-auto">
                  <div />
                  <button
                    onClick={() => handlePan(0, -10)}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs active:scale-90 transition"
                  >
                    ▲
                  </button>
                  <div />
                  <button
                    onClick={() => handlePan(-10, 0)}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs active:scale-90 transition"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => updateActiveTransform({ panX: 0, panY: 0, zoom: 1 })}
                    className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white text-[10px] font-bold"
                    title="Reset Posisi"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => handlePan(10, 0)}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs active:scale-90 transition"
                  >
                    ▶
                  </button>
                  <div />
                  <button
                    onClick={() => handlePan(0, 10)}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs active:scale-90 transition"
                  >
                    ▼
                  </button>
                  <div />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: COLOR FILTERS */}
          {activeTab === 'filter' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Pilih Filter Warna
                </span>
                <button
                  onClick={() => {
                    // Apply active filter to all slots
                    if (activeTransform) {
                      const currentF = activeTransform.filter;
                      setSlotTransforms((prev) => prev.map((t) => ({ ...t, filter: currentF })));
                    }
                  }}
                  className="text-[11px] text-pink-400 hover:underline font-bold"
                >
                  Terapkan ke Semua Slot
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                {FILTERS.map((f) => {
                  const isSelected = activeTransform?.filter === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => {
                        audioEffects.playClick();
                        updateActiveTransform({ filter: f.id });
                      }}
                      className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition ${
                        isSelected
                          ? 'border-pink-500 bg-pink-950/20 text-white shadow-md'
                          : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xl">{f.icon}</span>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold">{f.label}</span>
                        <span className="text-[10px] text-slate-500">
                          {isSelected ? 'Aktif' : 'Pilih'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer Info */}
      <footer className="w-full max-w-6xl mx-auto flex items-center justify-between text-xs text-slate-500 border-t border-slate-900 pt-3 z-10">
        <span>Tekan tombol di slot foto atau gunakan panel di kanan untuk mengatur zoom &amp; filter.</span>
        <span>Kualitas cetak final: 300 DPI Studio Grade</span>
      </footer>
    </div>
  );
};
