import React, { useState, useEffect } from 'react';
import { ChevronLeft, QrCode, Ticket, KeyRound, CheckCircle2, AlertCircle, Sparkles, Timer } from 'lucide-react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import { PackageConfig, PaymentMethod, OperatorConfig } from '../../types';
import { audioEffects } from '../../services/audioEffects';

interface PaymentScreenProps {
  config: OperatorConfig;
  selectedPackage: PackageConfig;
  extraPrints: number;
  totalPrice: number;
  onPaymentSuccess: (method: PaymentMethod, finalPaidAmount: number) => void;
  onBack: () => void;
}

export const PaymentScreen: React.FC<PaymentScreenProps> = ({
  config,
  selectedPackage,
  extraPrints,
  totalPrice,
  onPaymentSuccess,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<PaymentMethod>('qris');
  const [qrisQrDataUrl, setQrisQrDataUrl] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(120); // 2 minutes countdown for QRIS
  const [voucherInput, setVoucherInput] = useState<string>('');
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [voucherApplied, setVoucherApplied] = useState<{ code: string; discountPercent: number } | null>(null);
  const [bypassPin, setBypassPin] = useState<string>('');
  const [bypassError, setBypassError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Discount calculation
  const discountAmount = voucherApplied
    ? Math.round((totalPrice * voucherApplied.discountPercent) / 100)
    : 0;
  const finalPrice = Math.max(0, totalPrice - discountAmount);

  // Generate QRIS QR code
  useEffect(() => {
    const qrisPayload = `00020101021226670014ID.LINKAJA.WWW01189360091100202688849200215${config.qrisNmid}520458145303360540${finalPrice}5802ID5914${config.qrisMerchantName.replace(/ /g, '')}6007JAKARTA62070703A016304`;
    QRCode.toDataURL(qrisPayload, {
      width: 280,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    }).then(setQrisQrDataUrl).catch(() => {});
  }, [finalPrice, config.qrisNmid, config.qrisMerchantName]);

  // Countdown timer for QRIS
  useEffect(() => {
    if (activeTab !== 'qris' || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTab, timeLeft]);

  // Trigger success with celebration
  const triggerSuccess = (method: PaymentMethod, amount: number) => {
    setIsProcessing(true);
    audioEffects.playSuccessChime();

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (e) {}

    setTimeout(() => {
      onPaymentSuccess(method, amount);
    }, 1200);
  };

  // Handle Voucher Submission
  const handleApplyVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    audioEffects.playClick();
    setVoucherError(null);

    const match = config.voucherCodes.find(
      (v) => v.code.toUpperCase() === voucherInput.trim().toUpperCase()
    );

    if (match) {
      setVoucherApplied({ code: match.code, discountPercent: match.discountPercent });
      if (match.discountPercent === 100) {
        // 100% free voucher directly completes payment!
        triggerSuccess('voucher', 0);
      }
    } else {
      setVoucherError('Kode voucher tidak valid atau sudah kedaluwarsa.');
    }
  };

  // Handle Cash / Operator Bypass
  const handleBypassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    audioEffects.playClick();
    setBypassError(null);

    if (bypassPin === config.cashBypassPin || bypassPin === config.adminPin) {
      triggerSuccess('cash_bypass', finalPrice);
    } else {
      setBypassError('PIN Bypass salah. Silakan tanyakan ke operator booth.');
    }
  };

  return (
    <div className="relative w-full h-full min-h-screen flex flex-col justify-between p-6 sm:p-10 bg-slate-950 text-white select-none">
      {/* Top Header */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between z-10">
        <button
          onClick={() => {
            audioEffects.playClick();
            onBack();
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-95"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold text-sm">Ganti Paket</span>
        </button>

        <div className="text-center">
          <span className="text-xs font-bold tracking-wider text-pink-400 uppercase">
            Langkah 2 dari 4
          </span>
          <h2 className="text-xl sm:text-2xl font-black">Pembayaran Kiosk</h2>
        </div>

        <div className="w-24 text-right">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
            {config.brandName}
          </span>
        </div>
      </header>

      {/* Main Payment Container */}
      <main className="w-full max-w-4xl mx-auto my-auto py-6 z-10 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Left Side: Order Summary Card */}
        <div className="md:col-span-5 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-xl backdrop-blur-md">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/10 text-pink-400 text-xs font-bold mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ringkasan Pesanan</span>
            </div>

            <h3 className="text-2xl font-black text-white mb-1">{selectedPackage.name}</h3>
            <p className="text-xs text-slate-400 mb-6">
              {selectedPackage.photoCount} Pose Foto • {selectedPackage.defaultCopies + extraPrints} Lembar Cetak
            </p>

            <div className="space-y-3 text-sm border-t border-slate-800 pt-4">
              <div className="flex justify-between text-slate-300">
                <span>Paket {selectedPackage.name}</span>
                <span className="font-mono-numbers">{formatRupiah(selectedPackage.price)}</span>
              </div>

              {extraPrints > 0 && (
                <div className="flex justify-between text-slate-300">
                  <span>Cetak Tambahan ({extraPrints}x)</span>
                  <span className="font-mono-numbers">
                    {formatRupiah(extraPrints * config.extraPrintPrice)}
                  </span>
                </div>
              )}

              {voucherApplied && (
                <div className="flex justify-between text-emerald-400 font-semibold">
                  <span>Diskon Voucher ({voucherApplied.code})</span>
                  <span className="font-mono-numbers">-{formatRupiah(discountAmount)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-800 pt-5 mt-6">
            <span className="text-xs text-slate-400">Total Yang Harus Dibayar</span>
            <div className="text-3xl font-black text-pink-400 font-mono-numbers mt-1">
              {formatRupiah(finalPrice)}
            </div>
          </div>
        </div>

        {/* Right Side: Payment Methods Tabs */}
        <div className="md:col-span-7 bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 sm:p-7 flex flex-col shadow-xl">
          {/* Method Selector Tabs */}
          <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800/80 mb-6">
            <button
              onClick={() => {
                audioEffects.playClick();
                setActiveTab('qris');
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition ${
                activeTab === 'qris'
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>QRIS</span>
            </button>

            <button
              onClick={() => {
                audioEffects.playClick();
                setActiveTab('voucher');
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition ${
                activeTab === 'voucher'
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Ticket className="w-4 h-4" />
              <span>Voucher</span>
            </button>

            <button
              onClick={() => {
                audioEffects.playClick();
                setActiveTab('cash_bypass');
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition ${
                activeTab === 'cash_bypass'
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Tunai / PIN</span>
            </button>
          </div>

          {/* TAB 1: QRIS */}
          {activeTab === 'qris' && (
            <div className="flex flex-col items-center text-center">
              <div className="bg-white p-3 rounded-2xl shadow-xl border-4 border-slate-800 relative">
                {qrisQrDataUrl ? (
                  <img
                    src={qrisQrDataUrl}
                    alt="QRIS Pembayaran BoothPro"
                    className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                  />
                ) : (
                  <div className="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center bg-slate-100 text-slate-500 font-bold">
                    Membuat QR...
                  </div>
                )}
                {/* QRIS Logo overlay */}
                <div className="absolute top-2 left-3 text-[10px] font-black text-rose-600 tracking-wider">
                  QRIS INDONESIA
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                <Timer className="w-4 h-4 text-amber-400" />
                <span>
                  Batas waktu pembayaran:{' '}
                  <strong className="text-white font-mono-numbers">
                    {Math.floor(timeLeft / 60)}:
                    {(timeLeft % 60).toString().padStart(2, '0')}
                  </strong>
                </span>
              </div>

              <p className="text-xs text-slate-400 mt-2 max-w-sm">
                Scan menggunakan BCA, Mandiri, GoPay, OVO, ShopeePay, Dana, atau mobile banking apapun.
              </p>

              {/* Instant Simulation Button for Testing & Fast Operator verification */}
              <button
                onClick={() => triggerSuccess('qris', finalPrice)}
                disabled={isProcessing}
                className="mt-6 w-full max-w-sm py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isProcessing ? 'Verifikasi Berhasil...' : 'Simulasi Bayar / Konfirmasi Otomatis'}</span>
              </button>
            </div>
          )}

          {/* TAB 2: VOUCHER */}
          {activeTab === 'voucher' && (
            <form onSubmit={handleApplyVoucher} className="flex flex-col gap-4 my-auto">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Masukkan Kode Voucher / Promo
                </label>
                <input
                  type="text"
                  value={voucherInput}
                  onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
                  placeholder="Contoh: BOOTHVIP, GRATIS, DISKON50"
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono placeholder:text-slate-600 uppercase focus:outline-none focus:border-pink-500"
                />
              </div>

              {voucherError && (
                <div className="flex items-center gap-2 text-rose-400 text-xs">
                  <AlertCircle className="w-4 h-4" />
                  <span>{voucherError}</span>
                </div>
              )}

              {voucherApplied && (
                <div className="flex items-center gap-2 text-emerald-400 text-xs bg-emerald-950/40 border border-emerald-800 p-3 rounded-xl">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Voucher <strong>{voucherApplied.code}</strong> aktif! Diskon {voucherApplied.discountPercent}%.
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-3.5 px-6 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-sm transition active:scale-95 cursor-pointer"
                >
                  Terapkan Voucher
                </button>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Voucher Demo Tersedia:</span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {config.voucherCodes.map((v) => (
                    <button
                      key={v.code}
                      type="button"
                      onClick={() => setVoucherInput(v.code)}
                      className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[11px] font-mono text-pink-400 border border-slate-800"
                    >
                      {v.code} ({v.discountPercent}%)
                    </button>
                  ))}
                </div>
              </div>
            </form>
          )}

          {/* TAB 3: CASH / BYPASS PIN */}
          {activeTab === 'cash_bypass' && (
            <form onSubmit={handleBypassSubmit} className="flex flex-col gap-4 my-auto">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  PIN Otorisasi Kasir / Tunai
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={bypassPin}
                  onChange={(e) => setBypassPin(e.target.value)}
                  placeholder="Ketik PIN Kasir (Default: 1234)"
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-center text-xl tracking-widest font-mono focus:outline-none focus:border-pink-500"
                />
              </div>

              {bypassError && (
                <div className="flex items-center gap-2 text-rose-400 text-xs">
                  <AlertCircle className="w-4 h-4" />
                  <span>{bypassError}</span>
                </div>
              )}

              <p className="text-xs text-slate-400">
                Digunakan ketika pelanggan membayar tunai kepada operator toko atau untuk uji operasional.
              </p>

              <button
                type="submit"
                className="py-3.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition active:scale-95 cursor-pointer"
              >
                Konfirmasi Pembayaran Tunai
              </button>
            </form>
          )}
        </div>
      </main>

      {/* Footer Info */}
      <footer className="w-full max-w-5xl mx-auto text-center text-xs text-slate-500 border-t border-slate-900 pt-4 z-10">
        Pembayaran diproses secara instan dan aman melalui jaringan QRIS Bank Indonesia.
      </footer>
    </div>
  );
};
