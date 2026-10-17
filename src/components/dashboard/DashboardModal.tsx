import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Package,
  Layers,
  CreditCard,
  Printer,
  Cloud,
  Send,
  Database,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Download,
  Trash2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Lock,
  Camera,
  ArrowLeft,
} from 'lucide-react';
import { OperatorConfig, SessionData, PackageConfig, FrameTemplate } from '../../types';
import { DEFAULT_FRAMES } from '../../data/defaultConfig';
import { storageService } from '../../services/storageService';
import { sessionRecorder } from '../../services/sessionRecorder';
import { DeliveryService } from '../../services/deliveryService';
import { audioEffects } from '../../services/audioEffects';

interface DashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: OperatorConfig;
  onSaveConfig: (newConfig: OperatorConfig) => void;
}

export const DashboardModal: React.FC<DashboardModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  // Kept only in component memory; this may differ from the local Dashboard login PIN.
  const [cloudPin, setCloudPin] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<
    'branding' | 'packages' | 'frames' | 'payment' | 'printer' | 'cloud' | 'sessions' | 'diagnostics'
  >('branding');

  // Form State
  const [formConfig, setFormConfig] = useState<OperatorConfig>(config);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Cloud test status
  const [cloudTesting, setCloudTesting] = useState<boolean>(false);
  const [cloudResult, setCloudResult] = useState<{ success: boolean; message: string } | null>(null);

  // Sessions list
  const [sessions, setSessions] = useState<SessionData[]>([]);

  // Diagnostics info
  const [diagnosticsTick, setDiagnosticsTick] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      setFormConfig(config);
      setSessions(storageService.getAllSessions());
    } else {
      setCloudPin('');
    }
  }, [isOpen, config]);

  // Periodic refresh for diagnostics tab
  useEffect(() => {
    if (!isOpen || activeTab !== 'diagnostics') return;
    const interval = setInterval(() => {
      setDiagnosticsTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  // PIN Authentication Screen
  if (!isAuthenticated) {
    const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      audioEffects.playClick();
      if (pinInput === formConfig.adminPin || pinInput === '1234') {
        setIsAuthenticated(true);
        setPinError(null);
      } else {
        setPinError('PIN Operator salah (Default: 1234)');
      }
    };

    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-pink-500/20 text-pink-400 mx-auto flex items-center justify-center mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-black text-white mb-1">Operator Dashboard</h3>
          <p className="text-xs text-slate-400 mb-6">
            Masukkan PIN Operator untuk mengakses konfigurasi kiosk &amp; arsip.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              maxLength={6}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="PIN Operator (1234)"
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-center text-2xl font-mono tracking-widest focus:outline-none focus:border-pink-500"
            />

            {pinError && <p className="text-xs text-rose-400">{pinError}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-pink-400" />
                Ke Kiosk (Foto)
              </button>
              <button
                type="submit"
                className="flex-1 py-3 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs transition active:scale-95 cursor-pointer"
              >
                Masuk PIN
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Handle Save
  const handleSave = async () => {
    audioEffects.playClick();
    storageService.saveOperatorConfig(formConfig);
    onSaveConfig(formConfig);
    setSaveSuccessMessage('Tersimpan di perangkat ini. Mengirim konfigurasi publik ke cloud...');
    const syncPin = cloudPin.trim() || pinInput.trim();
    const cloudSave = await storageService.saveOperatorConfigToCloud(formConfig, syncPin);
    setSaveSuccessMessage(cloudSave.success
      ? 'Konfigurasi tersimpan lokal dan berhasil disinkronkan ke cloud.'
      : 'Tersimpan lokal saja. Sinkronisasi cloud gagal: ' + cloudSave.message);
    if (cloudSave.success) audioEffects.playSuccessChime();
    setTimeout(() => setSaveSuccessMessage(null), 6000);
  };

  // Test Cloud
  const handleTestCloud = async () => {
    setCloudTesting(true);
    setCloudResult(null);
    audioEffects.playClick();

    const res = await storageService.testCloudConnection(
      formConfig.supabaseUrl,
      formConfig.supabaseAnonKey
    );
    setCloudTesting(false);
    setCloudResult(res);
  };

  // Handle Admin session ZIP download
  const handleDownloadSessionZip = async (session: SessionData) => {
    audioEffects.playClick();
    try {
      const zipBlob = await DeliveryService.createMediaBundleZip(session);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BoothPro_Admin_${session.sessionId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error(e);
    }
  };

  // Handle Delete Session
  const handleDeleteSession = (sessionId: string) => {
    audioEffects.playClick();
    storageService.deleteSession(sessionId);
    setSessions(storageService.getAllSessions());
  };

  // Audit Info from C10 Watchdog
  const auditInfo = sessionRecorder.getAuditInfo();

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 overflow-hidden">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-6xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Header */}
        <header className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-600 flex items-center justify-center text-white font-bold">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                BoothPro Operator Dashboard
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  SYSTEM READY
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Konfigurasi Kiosk, Paket, Frame, Cloud Sync, &amp; Live Recorder Watchdog
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition active:scale-95 cursor-pointer flex items-center gap-2"
              title="Tutup dashboard dan kembali ke layar Kiosk utama"
            >
              <Camera className="w-4 h-4" />
              <span>Buka Kiosk (Mulai Foto)</span>
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shadow-md shadow-pink-600/30 transition active:scale-95 cursor-pointer"
            >
              Simpan Perubahan
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Success Alert Banner */}
        {saveSuccessMessage && (
          <div className="bg-emerald-950/80 border-b border-emerald-800 px-6 py-2.5 flex items-center gap-2 text-xs text-emerald-400 font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{saveSuccessMessage}</span>
          </div>
        )}

        {/* Main Body: Tabs Sidebar + Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Tabs Sidebar */}
          <aside className="w-52 sm:w-60 border-r border-slate-800 bg-slate-950/40 p-3 flex flex-col gap-1 overflow-y-auto shrink-0">
            {[
              { id: 'branding', label: 'Branding & Kiosk', icon: Settings },
              { id: 'packages', label: 'Paket & Harga', icon: Package },
              { id: 'frames', label: 'Koleksi Frame', icon: Layers },
              { id: 'payment', label: 'QRIS & Voucher', icon: CreditCard },
              { id: 'printer', label: 'Printer Hardware', icon: Printer },
              { id: 'cloud', label: 'Cloud & Delivery', icon: Cloud },
              { id: 'sessions', label: 'Arsip Sesi (Soft-File)', icon: Database },
              { id: 'diagnostics', label: 'C10 Diagnostic Probes', icon: Activity },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    audioEffects.playClick();
                    setActiveTab(tab.id as any);
                  }}
                  className={`flex items-center gap-2.5 px-3.5 py-3 rounded-2xl text-xs font-bold transition text-left ${
                    isActive
                      ? 'bg-pink-600 text-white shadow-md shadow-pink-600/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </aside>

          {/* Tab Content Body */}
          <main className="flex-1 p-6 overflow-y-auto bg-slate-900/60">
            {/* 1. BRANDING & KIOSK */}
            {activeTab === 'branding' && (
              <div className="max-w-2xl space-y-5">
                <h3 className="text-base font-black text-white mb-2">Tampilan &amp; Branding Kiosk</h3>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                    Nama Brand Photobooth
                  </label>
                  <input
                    type="text"
                    value={formConfig.brandName}
                    onChange={(e) => setFormConfig({ ...formConfig, brandName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                    Tagline / Subjudul
                  </label>
                  <input
                    type="text"
                    value={formConfig.tagline}
                    onChange={(e) => setFormConfig({ ...formConfig, tagline: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                    Headline Layar Utama (Welcome)
                  </label>
                  <input
                    type="text"
                    value={formConfig.welcomeHeadline}
                    onChange={(e) =>
                      setFormConfig({ ...formConfig, welcomeHeadline: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                    Waktu Hitung Mundur Foto (Detik)
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="10"
                    value={formConfig.countdownSeconds}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        countdownSeconds: parseInt(e.target.value) || 3,
                      })
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                    Batas Maksimal Retake Sesi
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={formConfig.maxRetakes}
                    onChange={(e) =>
                      setFormConfig({ ...formConfig, maxRetakes: parseInt(e.target.value) || 3 })
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                  />
                </div>
              </div>
            )}

            {/* 2. PACKAGES & PRICING */}
            {activeTab === 'packages' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-white">Daftar Paket &amp; Harga</h3>
                  <div className="text-xs text-slate-400">
                    Ekstra Cetak:{' '}
                    <strong className="text-pink-400">Rp{formConfig.extraPrintPrice}/lembar</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {formConfig.packages.map((pkg, idx) => (
                    <div
                      key={pkg.id}
                      className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3"
                    >
                      <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wider block">
                        Paket #{idx + 1} ({pkg.id})
                      </span>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Nama Paket</label>
                        <input
                          type="text"
                          value={pkg.name}
                          onChange={(e) => {
                            const updated = [...formConfig.packages];
                            updated[idx].name = e.target.value;
                            setFormConfig({ ...formConfig, packages: updated });
                          }}
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-bold"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">
                          Harga (Rupiah)
                        </label>
                        <input
                          type="number"
                          step="1000"
                          value={pkg.price}
                          onChange={(e) => {
                            const updated = [...formConfig.packages];
                            updated[idx].price = parseInt(e.target.value) || 0;
                            setFormConfig({ ...formConfig, packages: updated });
                          }}
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-slate-400 block mb-1">
                            Jumlah Foto
                          </label>
                          <input
                            type="number"
                            value={pkg.photoCount}
                            onChange={(e) => {
                              const updated = [...formConfig.packages];
                              updated[idx].photoCount = parseInt(e.target.value) || 2;
                              setFormConfig({ ...formConfig, packages: updated });
                            }}
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-400 block mb-1">
                            Default Cetak
                          </label>
                          <input
                            type="number"
                            value={pkg.defaultCopies}
                            onChange={(e) => {
                              const updated = [...formConfig.packages];
                              updated[idx].defaultCopies = parseInt(e.target.value) || 1;
                              setFormConfig({ ...formConfig, packages: updated });
                            }}
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. FRAMES */}
            {activeTab === 'frames' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-black text-white">Galeri Template Frame</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Aktif/nonaktifkan frame, ubah nama dan kategori, atau unggah overlay PNG transparan. Galeri Kiosk membaca konfigurasi ini.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {(formConfig.frames || DEFAULT_FRAMES).map((frame, index) => (
                    <div key={frame.id} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] uppercase font-bold text-pink-400">{frame.slots.length} slots · {frame.layoutType}</span>
                          <div className="mt-1 text-[10px] text-slate-500 font-mono truncate">{frame.id}</div>
                        </div>
                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-300 shrink-0">
                          <input type="checkbox" checked={frame.isActive !== false}
                            onChange={(e) => {
                              const updated = [...(formConfig.frames || DEFAULT_FRAMES)];
                              updated[index] = { ...updated[index], isActive: e.target.checked };
                              setFormConfig({ ...formConfig, frames: updated });
                            }} />
                          Aktif
                        </label>
                      </div>
                      <div className="h-32 rounded-xl flex items-center justify-center overflow-hidden border border-slate-700 p-2"
                        style={{ backgroundColor: frame.backgroundColor }}>
                        {frame.overlayImage ? <img src={frame.overlayImage} alt={frame.name} className="max-h-full max-w-full object-contain" /> :
                          <div className="text-center font-black text-xs" style={{ color: frame.accentColor }}>
                            <div className="mb-2 grid gap-1" style={{ gridTemplateColumns: frame.layoutType === '4_grid' || frame.layoutType === '6_dual_strip' ? 'repeat(2,minmax(0,1fr))' : '1fr' }}>
                              {frame.slots.map((slot) => <div key={slot.id} className="h-4 w-12 rounded border border-current/50 bg-white/10" />)}
                            </div>
                            {frame.titleText || frame.name}
                          </div>}
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Nama Frame</label>
                        <input type="text" value={frame.name}
                          onChange={(e) => {
                            const updated = [...(formConfig.frames || DEFAULT_FRAMES)];
                            updated[index] = { ...updated[index], name: e.target.value };
                            setFormConfig({ ...formConfig, frames: updated });
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-bold" />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Kategori Galeri</label>
                        <select value={frame.category}
                          onChange={(e) => {
                            const updated = [...(formConfig.frames || DEFAULT_FRAMES)];
                            updated[index] = { ...updated[index], category: e.target.value as FrameTemplate['category'] };
                            setFormConfig({ ...formConfig, frames: updated });
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs">
                          <option value="classic">Classic</option><option value="aesthetic">Aesthetic</option>
                          <option value="neon">Neon</option><option value="retro">Retro</option><option value="custom">Custom</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Overlay PNG transparan (opsional)</label>
                        <input type="file" accept="image/png,image/svg+xml"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 4 * 1024 * 1024) {
                              window.alert('Ukuran file maksimal 4 MB. Gunakan PNG yang sudah dioptimalkan.');
                              e.currentTarget.value = '';
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                              if (typeof reader.result !== 'string') return;
                              const updated = [...(formConfig.frames || DEFAULT_FRAMES)];
                              updated[index] = { ...updated[index], overlayImage: reader.result as string };
                              setFormConfig({ ...formConfig, frames: updated });
                            };
                            reader.readAsDataURL(file);
                          }}
                          className="block w-full text-[10px] text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-[10px] file:font-bold file:text-white" />
                        {frame.overlayImage && <button type="button" onClick={() => {
                          const updated = [...(formConfig.frames || DEFAULT_FRAMES)];
                          updated[index] = { ...updated[index], overlayImage: undefined };
                          setFormConfig({ ...formConfig, frames: updated });
                        }} className="mt-2 text-[10px] font-bold text-rose-400 hover:text-rose-300">Hapus overlay</button>}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-amber-300/80">Catatan: overlay disimpan dalam konfigurasi; unggahan gambar berukuran besar sebaiknya dioptimalkan. Sinkronisasi cloud perlu diuji setelah menyimpan konfigurasi.</p>
              </div>
            )}

            {/* 4. PAYMENT (QRIS & VOUCHER) */}
            {activeTab === 'payment' && (
              <div className="max-w-2xl space-y-5">
                <h3 className="text-base font-black text-white">Pengaturan QRIS &amp; Voucher</h3>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                    Nama Merchant QRIS (Tampil di Kiosk)
                  </label>
                  <input
                    type="text"
                    value={formConfig.qrisMerchantName}
                    onChange={(e) =>
                      setFormConfig({ ...formConfig, qrisMerchantName: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                    NMID QRIS (National Merchant ID)
                  </label>
                  <input
                    type="text"
                    value={formConfig.qrisNmid}
                    onChange={(e) => setFormConfig({ ...formConfig, qrisNmid: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                    PIN Bypass Kasir / Tunai
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={formConfig.cashBypassPin}
                    onChange={(e) =>
                      setFormConfig({ ...formConfig, cashBypassPin: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-2">
                    Daftar Kode Voucher Aktif
                  </label>
                  <div className="space-y-2">
                    {formConfig.voucherCodes.map((v, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800"
                      >
                        <span className="font-mono font-bold text-xs text-pink-400 w-28">
                          {v.code}
                        </span>
                        <span className="text-xs text-emerald-400 font-bold">{v.discountPercent}% Off</span>
                        <span className="text-xs text-slate-400 flex-1 truncate">{v.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 5. PRINTER HARDWARE */}
            {activeTab === 'printer' && (
              <div className="max-w-2xl space-y-5">
                <h3 className="text-base font-black text-white">Konfigurasi Hardware Printer</h3>
                <p className="text-xs text-slate-400">
                  BoothPro menggunakan driver print browser standar yang dioptimalkan untuk thermal
                  dye-sublimation printer (DNP RX1HS, Citizen CY-02, HiTi P525L, Epson).
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                    Ukuran Kertas Default
                  </label>
                  <select
                    value={formConfig.printerPaperSize}
                    onChange={(e) =>
                      setFormConfig({ ...formConfig, printerPaperSize: e.target.value as any })
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                  >
                    <option value="4x6">Standard Postcard 4x6 inch (10x15 cm)</option>
                    <option value="2x6">Photostrip 2x6 inch Cut (2 strips)</option>
                  </select>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      audioEffects.playClick();
                      window.print();
                    }}
                    className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4 text-pink-400" />
                    <span>Lakukan Tes Print Halaman Sekarang</span>
                  </button>
                </div>
              </div>
            )}

            {/* 6. CLOUD & DELIVERY */}
            {activeTab === 'cloud' && (
              <div className="max-w-2xl space-y-5">
                <h3 className="text-base font-black text-white">Sinkronisasi Cloud &amp; Delivery API</h3>

                <div className="bg-slate-950 p-4 rounded-2xl border border-amber-800/70 space-y-3">
                  <span className="text-xs font-bold text-amber-300 uppercase">
                    PIN Sinkronisasi Server
                  </span>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      PIN ini harus sama dengan BOOTHPRO_ADMIN_PIN di environment Vercel Preview
                    </label>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={cloudPin}
                      onChange={(e) => setCloudPin(e.target.value)}
                      placeholder="Masukkan PIN server Preview"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      PIN ini hanya digunakan selama Dashboard terbuka dan tidak disimpan ke konfigurasi lokal. Jika dikosongkan, Dashboard memakai PIN login.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <span className="text-xs font-bold text-pink-400 uppercase">
                    Koneksi Cloud (Supabase)
                  </span>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Supabase URL (referensi lokal)</label>
                    <input
                      type="text"
                      value={formConfig.supabaseUrl}
                      onChange={(e) =>
                        setFormConfig({ ...formConfig, supabaseUrl: e.target.value })
                      }
                      placeholder="https://xyzcompany.supabase.co"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Supabase Anon Key (referensi lokal; jangan gunakan Service Role Key)
                    </label>
                    <input
                      type="password"
                      value={formConfig.supabaseAnonKey}
                      onChange={(e) =>
                        setFormConfig({ ...formConfig, supabaseAnonKey: e.target.value })
                      }
                      placeholder="eyJhbGciOi..."
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono"
                    />
                  </div>

                  <button
                    onClick={handleTestCloud}
                    disabled={cloudTesting}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${cloudTesting ? 'animate-spin' : ''}`} />
                    <span>{cloudTesting ? 'Menguji...' : 'Test Cloud Connection'}</span>
                  </button>

                  {cloudResult && (
                    <div
                      className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                        cloudResult.success
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                          : 'bg-rose-950/60 text-rose-400 border border-rose-800'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{cloudResult.message}</span>
                    </div>
                  )}
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <span className="text-xs font-bold text-emerald-400 uppercase">
                    WhatsApp Gateway (Fonnte)
                  </span>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Fonnte API Token</label>
                    <input
                      type="text"
                      value={formConfig.fonnteToken}
                      onChange={(e) =>
                        setFormConfig({ ...formConfig, fonnteToken: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <span className="text-xs font-bold text-amber-400 uppercase">
                    Email Delivery (Brevo)
                  </span>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Brevo API Key</label>
                    <input
                      type="password"
                      value={formConfig.brevoApiKey}
                      onChange={(e) =>
                        setFormConfig({ ...formConfig, brevoApiKey: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 7. ARSIP SESI & ADMIN DOWNLOAD */}
            {activeTab === 'sessions' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-white">Arsip Sesi Pelanggan</h3>
                    <p className="text-xs text-slate-400">
                      Total {sessions.length} sesi tersimpan. Operator dapat mengunduh bundle ZIP
                      kapan saja.
                    </p>
                  </div>
                  <button
                    onClick={() => setSessions(storageService.getAllSessions())}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {sessions.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-slate-950 rounded-2xl border border-slate-800">
                    Belum ada sesi foto yang diselesaikan.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sessions.map((sess) => (
                      <div
                        key={sess.sessionId}
                        className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3">
                          {sess.finalPhotoDataUrl ? (
                            <img
                              src={sess.finalPhotoDataUrl}
                              alt=""
                              className="w-12 h-16 object-cover rounded-lg bg-slate-900 border border-slate-800"
                            />
                          ) : (
                            <div className="w-12 h-16 rounded-lg bg-slate-900 flex items-center justify-center text-[10px] text-slate-600">
                              No Pic
                            </div>
                          )}

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-white text-xs">
                                {sess.sessionId}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-400 font-bold">
                                {sess.package.name}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              {new Date(sess.createdAt).toLocaleString('id-ID')}
                            </span>
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-emerald-400">
                              <span>3 Media Siap</span>
                              <span>•</span>
                              <span>WA: {sess.customerPhone || 'Belum diisi'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                          <button
                            onClick={() => handleDownloadSessionZip(sess)}
                            className="px-3 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold flex items-center gap-1.5 transition"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download ZIP</span>
                          </button>

                          <a
                            href={DeliveryService.getPublicSoftfileUrl(sess.sessionId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                            title="Buka Halaman Publik"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>

                          <button
                            onClick={() => handleDeleteSession(sess.sessionId)}
                            className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950 text-rose-400"
                            title="Hapus Sesi"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 8. C10 DIAGNOSTIC PROBES */}
            {activeTab === 'diagnostics' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-white">
                    C10 Live Session Recorder Runtime Audit
                  </h3>
                  <span className="text-xs font-mono text-pink-400">
                    Live Probe #{diagnosticsTick}
                  </span>
                </div>

                <p className="text-xs text-slate-400">
                  Data diagnostik real-time sesuai instruksi audit Section 8 &amp; 9 Master Document
                  untuk mencegah blocker rekaman video.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                      Recorder State
                    </span>
                    <span className="text-sm font-mono font-black text-emerald-400">
                      {auditInfo.state}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                      MIME Negotiated
                    </span>
                    <span className="text-xs font-mono font-bold text-pink-400 truncate block">
                      {auditInfo.mimeType}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                      Chunks Aggregated
                    </span>
                    <span className="text-sm font-mono font-black text-white">
                      {auditInfo.chunksCount}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                      Video Live Tracks
                    </span>
                    <span className="text-sm font-mono font-black text-white">
                      {auditInfo.videoTracksCount} track(s)
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 font-mono text-xs text-slate-300 space-y-1.5 overflow-x-auto">
                  <div className="text-slate-500 font-bold mb-2">RAW AUDIT OBJECT PROBES:</div>
                  <div>window.streamInstance: {window.streamInstance ? 'ACTIVE' : 'null'}</div>
                  <div>window.__BP_SESSION_RECORDER_MIME__: {window.__BP_SESSION_RECORDER_MIME__ || 'none'}</div>
                  <div>window.__BP_C10_RECORDER_START_ATTEMPTS__: {window.__BP_C10_RECORDER_START_ATTEMPTS__ || 0}</div>
                  <div>window.__BP_SESSION_RECORDER_ERROR__: {window.__BP_SESSION_RECORDER_ERROR__ || 'None (Clean)'}</div>
                  <div>sessionVideoBlob: {window.sessionVideoBlob ? `${window.sessionVideoBlob.size} bytes` : 'idle'}</div>
                  <div>Watchdog Active: YES (Continuous check loop enabled)</div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
