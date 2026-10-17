import React, { useState } from 'react';
import { ChevronLeft, ArrowRight, Printer, Sparkles, Plus, Minus, Check } from 'lucide-react';
import { PackageConfig, OperatorConfig } from '../../types';
import { audioEffects } from '../../services/audioEffects';

interface PackageScreenProps {
  config: OperatorConfig;
  onSelectPackage: (pkg: PackageConfig, extraPrints: number, totalPrice: number) => void;
  onBack: () => void;
}

export const PackageScreen: React.FC<PackageScreenProps> = ({
  config,
  onSelectPackage,
  onBack,
}) => {
  const [selectedPkg, setSelectedPkg] = useState<PackageConfig>(
    config.packages[1] || config.packages[0] // Default to Classic Strip
  );
  const [extraPrints, setExtraPrints] = useState<number>(0);

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const totalPrice = selectedPkg.price + extraPrints * config.extraPrintPrice;
  const totalPrints = selectedPkg.defaultCopies + extraPrints;

  const handleNext = () => {
    audioEffects.playClick();
    onSelectPackage(selectedPkg, extraPrints, totalPrice);
  };

  return (
    <div className="relative w-full h-full min-h-screen flex flex-col justify-between p-6 sm:p-10 bg-slate-950 text-white select-none">
      {/* Top Navigation */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between z-10">
        <button
          onClick={() => {
            audioEffects.playClick();
            onBack();
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-95"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold text-sm">Kembali</span>
        </button>

        <div className="text-center">
          <span className="text-xs font-bold tracking-wider text-pink-400 uppercase">
            Langkah 1 dari 4
          </span>
          <h2 className="text-xl sm:text-2xl font-black">Pilih Paket Foto</h2>
        </div>

        <div className="w-24 text-right">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
            {config.brandName}
          </span>
        </div>
      </header>

      {/* Main Package Selection Grid */}
      <main className="w-full max-w-5xl mx-auto my-auto py-6 z-10 flex flex-col gap-6">
        <div className="text-center max-w-xl mx-auto mb-2">
          <p className="text-slate-400 text-sm sm:text-base">
            Semua paket sudah termasuk 1 Foto Final + 1 Boomerang GIF + 1 Live Session Video!
          </p>
        </div>

        {/* 3 Package Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {config.packages.map((pkg) => {
            const isSelected = selectedPkg.id === pkg.id;

            return (
              <div
                key={pkg.id}
                onClick={() => {
                  audioEffects.playClick();
                  setSelectedPkg(pkg);
                }}
                className={`relative group rounded-3xl p-6 sm:p-7 flex flex-col justify-between cursor-pointer transition-all duration-300 ${
                  isSelected
                    ? 'bg-gradient-to-b from-slate-900 via-slate-900 to-pink-950/40 border-2 border-pink-500 shadow-2xl shadow-pink-500/20 scale-[1.02]'
                    : 'bg-slate-900/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/90'
                }`}
              >
                {/* Badge if available */}
                {pkg.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-extrabold text-xs shadow-md">
                    {pkg.badge}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-extrabold tracking-widest text-pink-400 uppercase">
                      {pkg.photoCount} POSE FOTO
                    </span>
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center border transition ${
                        isSelected
                          ? 'bg-pink-500 border-pink-500 text-white'
                          : 'border-slate-700 bg-slate-800'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>

                  <h3 className="text-2xl font-black text-white mb-2">{pkg.name}</h3>
                  <p className="text-slate-400 text-xs sm:text-sm leading-relaxed mb-6">
                    {pkg.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800/80">
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-xs text-slate-400">Harga Paket</span>
                    <span className="text-2xl font-black text-white font-mono-numbers">
                      {formatRupiah(pkg.price)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-pink-400/90 font-medium">
                    <Printer className="w-3.5 h-3.5" />
                    <span>Dapat {pkg.defaultCopies} Lembar Cetak</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Extra Print Add-on Section */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-white text-base">Cetak Tambahan (Extra Print)</h4>
              <p className="text-xs text-slate-400">
                Tambah lembar cetakan fisik untuk teman atau keluarga (+{formatRupiah(config.extraPrintPrice)}/lembar)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-950 px-4 py-2 rounded-xl border border-slate-800">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (extraPrints > 0) {
                  audioEffects.playClick();
                  setExtraPrints(extraPrints - 1);
                }
              }}
              disabled={extraPrints === 0}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 flex items-center justify-center text-white transition active:scale-90"
            >
              <Minus className="w-4 h-4" />
            </button>

            <span className="w-8 text-center font-bold text-base font-mono-numbers">
              {extraPrints}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                audioEffects.playClick();
                setExtraPrints(extraPrints + 1);
              }}
              className="w-8 h-8 rounded-lg bg-pink-600 hover:bg-pink-500 flex items-center justify-center text-white transition active:scale-90"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>

      {/* Bottom Summary & Proceed Bar */}
      <footer className="w-full max-w-5xl mx-auto bg-slate-900/90 border border-slate-800 p-4 sm:p-6 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 z-10 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between sm:justify-start gap-6 w-full sm:w-auto">
          <div>
            <span className="text-xs text-slate-400">Total Pembayaran</span>
            <div className="text-2xl sm:text-3xl font-black text-pink-400 font-mono-numbers">
              {formatRupiah(totalPrice)}
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800 hidden sm:block" />

          <div className="text-xs text-slate-400 flex flex-col gap-0.5">
            <span className="font-semibold text-slate-200">
              {selectedPkg.name} ({selectedPkg.photoCount} Pose)
            </span>
            <span>Total Cetak: {totalPrints} Lembar Fisik</span>
          </div>
        </div>

        <button
          onClick={handleNext}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 sm:px-10 py-4 sm:py-5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white font-extrabold text-lg shadow-lg shadow-pink-500/30 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
        >
          <span>Lanjut ke Pembayaran</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </footer>
    </div>
  );
};
