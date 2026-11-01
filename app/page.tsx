"use client";

import { useState } from "react";
import Header from "@/components/Header";
import TriageForm from "@/components/TriageForm";
import ResultsPanel from "@/components/ResultsPanel";
import PharmacyMap from "@/components/PharmacyMap";
import { TriageResult } from "@/types";
import { Shield, Heart } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function Home() {
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [showMap, setShowMap] = useState(false);
  const { t } = useLanguage();

  const handleTriageResult = (result: {
    severity: "low" | "medium" | "high";
    remedy_suggestions: string;
    requires_doctor: boolean;
    isComplete?: boolean;
  }) => {
    setTriageResult(result);
    setShowMap(true);
    setTimeout(() => {
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 flex flex-col">
        {/* Centered Triage Input */}
        <section className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 pt-20 pb-10">
          <div className="w-full max-w-2xl">
            <div 
              style={{ display: triageResult ? "none" : "block" }} 
              className="text-center mb-8 animate-fade-in"
            >
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
                {t.heroTitle}
              </h1>
              <p className="text-slate-400 text-base sm:text-lg">
                {t.heroSubtitle}
              </p>
            </div>
            <TriageForm key="triage-form" onResult={handleTriageResult} />
          </div>
        </section>

        {/* Results + Map */}
        {triageResult && (
          <section id="results" className="px-4 sm:px-6 pb-10">
            <div className="max-w-3xl mx-auto space-y-8">
              <ResultsPanel result={triageResult} />
              {showMap && <PharmacyMap />}
            </div>
          </section>
        )}

        {/* Disclaimer */}
        <section className="px-4 sm:px-6 pb-10">
          <div className="max-w-3xl mx-auto">
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  <strong className="text-amber-400">{t.disclaimer}</strong>{" "}
                  CureRoute is for{" "}
                  <strong className="text-slate-300">{t.educationalOnly}</strong>.
                  Not a substitute for professional medical advice. In emergencies, call{" "}
                  <strong className="text-amber-400">{t.emergencyCall}</strong>.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/50 py-5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-slate-500">CureRoute — AI Health Triage</span>
          </div>
          <p className="text-xs text-slate-600">{t.footer}</p>
        </div>
      </footer>
    </div>
  );
}
