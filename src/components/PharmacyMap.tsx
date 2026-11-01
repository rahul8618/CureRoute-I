"use client";

import dynamic from "next/dynamic";
import { Map, Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

const PharmacyMapInner = dynamic(
  () => import("@/components/PharmacyMapInner"),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center h-[400px] bg-slate-900/60 rounded-xl border border-slate-700/50">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
        <p className="text-slate-400 text-sm">Loading map...</p>
      </div>
    ),
  }
);

export default function PharmacyMap() {
  const { t } = useLanguage();

  return (
    <section id="map" className="scroll-mt-20 animate-fade-in">
      <div className="relative">
        <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-emerald-500/20 to-cyan-500/20 rounded-3xl blur-xl opacity-30" />

        <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-800/50 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 flex items-center justify-center border border-cyan-500/30">
              <Map className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {t.nearbyPharmacies}
              </h2>
              <p className="text-sm text-slate-400">
                {t.pharmaciesWithin}
              </p>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-3 h-3 rounded-sm bg-gradient-to-br from-cyan-500 to-emerald-500" />
              {t.findPharmacy}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
              📍
            </div>
          </div>

          <PharmacyMapInner />
        </div>
      </div>
    </section>
  );
}
