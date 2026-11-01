"use client";

import { Activity, Menu, X, Globe } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useLanguage, LANGUAGE_MAP, LanguageCode } from "@/context/LanguageContext";

const LANGUAGES = Object.entries(LANGUAGE_MAP).map(([code, info]) => ({
  code: code as LanguageCode,
  ...info,
}));

export default function Header() {
  const { currentLanguage, setCurrentLanguage, t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = LANGUAGE_MAP[currentLanguage];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        langDropdownRef.current &&
        !langDropdownRef.current.contains(event.target as Node)
      ) {
        setLangDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const LanguageDropdown = () => (
    <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50 animate-fade-in">
      <div className="px-3 py-2 border-b border-slate-700/50">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
          {t.selectLanguage}
        </p>
      </div>
      <div className="py-1">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => {
              setCurrentLanguage(lang.code);
              setLangDropdownOpen(false);
            }}
            className={`w-full text-left px-4 py-2.5 text-sm transition-all flex items-center justify-between gap-2 ${
              currentLanguage === lang.code
                ? "bg-emerald-500/10 text-emerald-400"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <span className="font-medium">{lang.nativeLabel}</span>
            <span className="text-xs text-slate-600">{lang.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <Activity className="w-4.5 h-4.5 text-slate-950" strokeWidth={2.5} />
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping opacity-75" />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                CureRoute
              </h1>
              <p className="text-[9px] text-slate-500 font-medium tracking-wider uppercase -mt-0.5">
                AI Health Triage
              </p>
            </div>
          </div>

          {/* Desktop — language dropdown top-right */}
          <div className="hidden md:flex items-center">
            <div className="relative" ref={langDropdownRef}>
              <button
                id="language-selector"
                onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-emerald-400 transition-all rounded-lg hover:bg-slate-800/50 border border-slate-700/50 hover:border-emerald-500/30"
                aria-label={t.selectLanguage}
              >
                <Globe className="w-4 h-4" />
                <span className="text-xs font-medium">{currentLang.nativeLabel}</span>
              </button>
              {langDropdownOpen && <LanguageDropdown />}
            </div>
          </div>

          {/* Mobile */}
          <div className="flex items-center gap-2 md:hidden">
            <div className="relative" ref={langDropdownRef}>
              <button
                onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                className="p-2 text-slate-400 hover:text-emerald-400 transition-colors"
                aria-label={t.selectLanguage}
              >
                <Globe className="w-5 h-5" />
              </button>
              {langDropdownOpen && <LanguageDropdown />}
            </div>
            <button
              className="p-2 text-slate-400 hover:text-emerald-400 transition-colors"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="md:hidden pb-4 border-t border-slate-800/50 mt-2 pt-4">
            <div className="flex flex-col gap-1">
              <a href="#triage" onClick={() => setMenuOpen(false)}
                className="px-4 py-3 text-sm text-slate-400 hover:text-emerald-400 transition-colors rounded-lg hover:bg-slate-800/50">
                {t.symptomCheck}
              </a>
              <a href="#map" onClick={() => setMenuOpen(false)}
                className="px-4 py-3 text-sm text-slate-400 hover:text-emerald-400 transition-colors rounded-lg hover:bg-slate-800/50">
                {t.findPharmacy}
              </a>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
