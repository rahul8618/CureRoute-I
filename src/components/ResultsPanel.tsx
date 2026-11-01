"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  MapPin,
  ChevronDown,
  Volume2,
  VolumeX,
} from "lucide-react";
import { TriageResult } from "@/types";
import { useLanguage } from "@/context/LanguageContext";

interface ResultsPanelProps {
  result: TriageResult;
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-white mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-white mt-6 mb-3">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-slate-300">$1</em>')
    .replace(/^- (.+)$/gm, '<li class="flex items-start gap-2 mb-2"><span class="text-emerald-400 mt-1">•</span><span>$1</span></li>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-slate-600 pl-4 py-1 text-slate-400 italic my-2">$1</blockquote>')
    .replace(/\n\n/g, '<div class="mb-4"></div>')
    .replace(/\n/g, "<br />");
  html = html.replace(
    /(<li[^>]*>.*?<\/li>\s*(?:<br \/>)?)+/g,
    (match) => `<ul class="space-y-1 my-3">${match.replace(/<br \/>/g, "")}</ul>`
  );
  return html;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,3}\s/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^- /gm, "")
    .replace(/^> /gm, "")
    .replace(/⚠️/g, "")
    .replace(/[💊🌡️🍯🧊😴📞🏥🩺🚨⏰]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

export default function ResultsPanel({ result }: ResultsPanelProps) {
  const { isVoiceInput, getLocale, t } = useLanguage();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasSpeechSynthesis, setHasSpeechSynthesis] = useState(false);
  const hasSpokenRef = useRef(false);

  const severityConfig = {
    low: {
      icon: CheckCircle2,
      label: t.lowSeverity,
      bgClass: "bg-emerald-500/10",
      borderClass: "border-emerald-500/30",
      textClass: "text-emerald-400",
      badgeClass: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    },
    medium: {
      icon: AlertCircle,
      label: t.medSeverity,
      bgClass: "bg-amber-500/10",
      borderClass: "border-amber-500/30",
      textClass: "text-amber-400",
      badgeClass: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    },
    high: {
      icon: ShieldAlert,
      label: t.highSeverity,
      bgClass: "bg-red-500/10",
      borderClass: "border-red-500/30",
      textClass: "text-red-400",
      badgeClass: "bg-red-500/20 text-red-400 border-red-500/40",
    },
  };

  const config = severityConfig[result.severity];
  const Icon = config.icon;

  useEffect(() => {
    setHasSpeechSynthesis(typeof window !== "undefined" && !!window.speechSynthesis);
  }, []);

  const speakText = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();

      const plainText = stripMarkdown(text);
      const utterance = new SpeechSynthesisUtterance(plainText);
      const targetLocale = getLocale();

      const voices = window.speechSynthesis.getVoices();
      // Priority 1: Google or India-tagged voice matching the locale exactly
      let localVoice = voices.find(
        (v) => (v.lang === targetLocale || v.lang.startsWith(targetLocale)) &&
               (v.name.includes("Google") || v.name.includes("India"))
      );
      // Priority 2: Any voice matching the target locale
      if (!localVoice) {
        localVoice = voices.find((v) => v.lang === targetLocale || v.lang.startsWith(targetLocale));
      }
      // Priority 3: Language prefix match
      if (!localVoice) {
        const langPrefix = targetLocale.split("-")[0];
        localVoice = voices.find((v) => v.lang.startsWith(langPrefix));
      }

      if (localVoice) utterance.voice = localVoice;
      utterance.lang = targetLocale;
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [getLocale]
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // Auto-speak only when isVoiceInput is true and stream is complete
  useEffect(() => {
    if (isVoiceInput && !hasSpokenRef.current && result.isComplete && result.remedy_suggestions) {
      hasSpokenRef.current = true;
      const timeout = setTimeout(() => speakText(result.remedy_suggestions), 600);
      return () => clearTimeout(timeout);
    }
  }, [isVoiceInput, result.remedy_suggestions, result.isComplete, speakText]);

  useEffect(() => { hasSpokenRef.current = false; }, [result]);
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  const scrollToMap = () => {
    document.getElementById("map")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="animate-fade-in">
      <div className="relative">
        <div className={`absolute -inset-1 rounded-3xl blur-xl opacity-30 ${
          result.severity === "high" ? "bg-red-500/30" : result.severity === "medium" ? "bg-amber-500/30" : "bg-emerald-500/30"
        }`} />

        <div className={`relative bg-slate-900/80 backdrop-blur-xl border rounded-2xl overflow-hidden shadow-2xl ${config.borderClass}`}>
          {/* Severity Header */}
          <div className={`px-6 sm:px-8 py-4 ${config.bgClass} border-b ${config.borderClass} flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${config.bgClass} border ${config.borderClass} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${config.textClass}`} />
              </div>
              <div>
                <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${config.badgeClass}`}>
                  {config.label}
                </span>
                <p className="text-xs text-slate-500 mt-1">{t.aiAssessment}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasSpeechSynthesis && (
                <button
                  onClick={() => isSpeaking ? stopSpeaking() : speakText(result.remedy_suggestions)}
                  className={`p-2 rounded-lg transition-all duration-300 ${
                    isSpeaking
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse"
                      : "bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:text-emerald-400 hover:border-emerald-500/30"
                  }`}
                  title={isSpeaking ? "Stop" : "Read aloud"}
                >
                  {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              )}

              {result.requires_doctor && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-amber-400 font-medium">{t.doctorRecommended}</span>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="px-6 sm:px-8 py-6">
            <div id="remedy-content" className="prose-custom text-slate-300 text-sm sm:text-base leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(result.remedy_suggestions) }}
            />
          </div>

          {/* Find Pharmacy CTA */}
          <div className="px-6 sm:px-8 pb-6">
            <button onClick={scrollToMap}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 hover:from-cyan-500/30 hover:to-emerald-500/30 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-400 font-medium rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group">
              <MapPin className="w-5 h-5 group-hover:animate-bounce" />
              {t.findPharmacies}
              <ChevronDown className="w-4 h-4 animate-bounce" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
