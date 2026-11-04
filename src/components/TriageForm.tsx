"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic,
  MicOff,
  Send,
  Loader2,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

interface TriageFormProps {
  onResult: (result: {
    severity: "low" | "medium" | "high";
    remedy_suggestions: string;
    requires_doctor: boolean;
    isComplete?: boolean;
  }) => void;
}

export default function TriageForm({ onResult }: TriageFormProps) {
  const { currentLanguage, setIsVoiceInput, getLocale, t } = useLanguage();
  const [symptoms, setSymptoms] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = getLocale();

        recognition.onresult = (event: any) => {
          let transcript = "";
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          setSymptoms(transcript);
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          setIsListening(false);
          if (event.error === "not-allowed") {
            setError("Microphone access denied.");
          } else if (event.error === "no-speech") {
            setError("No speech detected.");
          }
        };

        recognition.onend = () => setIsListening(false);
        recognitionRef.current = recognition;
      }
    } catch (e) {
      setSpeechSupported(false);
    }
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* noop */
      }
    };
  }, [getLocale]);

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = getLocale();
    }
  }, [currentLanguage, getLocale]);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* noop */
      }
      setIsListening(false);
    } else {
      setError(null);
      setIsVoiceInput(true);
      try {
        recognitionRef.current.stop();
      } catch {
        /* noop */
      }
      setTimeout(() => {
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch {
          setError("Could not start voice input.");
        }
      }, 100);
    }
  }, [isListening, setIsVoiceInput]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ];
    if (!validTypes.includes(file.type)) {
      setError("Upload an image or PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB.");
      return;
    }
    setUploadedFile(file);
    setError(null);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => setFilePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const removeFile = () => {
    setUploadedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const [lastSubmittedSymptoms, setLastSubmittedSymptoms] = useState("");
  const prevLangRef = useRef(currentLanguage);

  const handleSubmit = async (overrideLang?: string | React.MouseEvent) => {
    const langToUse = typeof overrideLang === "string" ? overrideLang : currentLanguage;

    // Use lastSubmittedSymptoms if triggered by auto-translate, otherwise use textarea value
    const isAutoTranslate = typeof overrideLang === "string";
    const symptomsToSubmit =
      isAutoTranslate && lastSubmittedSymptoms
        ? lastSubmittedSymptoms
        : symptoms.trim();

    if (!symptomsToSubmit || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setLastSubmittedSymptoms(symptomsToSubmit);

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* noop */
      }
      setIsListening(false);
    }
    try {
      let response: Response;
      if (uploadedFile) {
        const formData = new FormData();
        formData.append("symptoms", symptomsToSubmit);
        formData.append("language", langToUse);
        formData.append("file", uploadedFile);
        response = await fetch("/api/triage", { method: "POST", body: formData });
      } else {
        response = await fetch("/api/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symptoms: symptomsToSubmit, language: langToUse }),
        });
      }

      if (!response.ok) {
        let msg = "Unexpected error.";
        try {
          const errData = await response.json();
          msg = errData.error || msg;
        } catch {
          /* noop */
        }
        setError(msg);
        return;
      }

      const contentType = response.headers.get("Content-Type") || "";

      // Handle fallback non-streaming JSON responses
      if (contentType.includes("application/json")) {
        const data = await response.json();
        if (data.remedy_suggestions) {
          onResult({
            severity: data.severity || "medium",
            remedy_suggestions: data.remedy_suggestions,
            requires_doctor: data.requires_doctor ?? true,
            isComplete: true,
          });
        } else if (data.error) {
          setError(data.error);
        } else {
          setError("Unexpected response.");
        }
        return;
      }

      // Handle streaming SSE response
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let streamedResponse = "";

      const isSevereHeader = response.headers.get("X-Is-Severe") === "true";
      let severity: "low" | "medium" | "high" = isSevereHeader ? "high" : "low";

      // Show initial empty result to transition UI
      onResult({
        severity,
        remedy_suggestions: `Translating to ${langToUse.toUpperCase()}...`,
        requires_doctor: true,
        isComplete: false,
      });

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep the incomplete line

        for (let line of lines) {
          line = line.trim();
          if (line.startsWith("data:") && line !== "data: [DONE]") {
            try {
              const dataStr = line.substring(5).trim();
              const data = JSON.parse(dataStr);
              const content = data.choices?.[0]?.delta?.content || "";
              if (content) {
                streamedResponse += content;

                // Update severity dynamically if not already high
                if (!isSevereHeader && severity === "low") {
                  const lower = streamedResponse.toLowerCase();
                  if (
                    lower.includes("see a doctor") ||
                    lower.includes("consult a physician") ||
                    lower.includes("medical attention") ||
                    lower.includes("consult a doctor") ||
                    lower.includes("healthcare provider")
                  ) {
                    severity = "medium";
                  }
                }

                onResult({
                  severity,
                  remedy_suggestions: streamedResponse,
                  requires_doctor: true,
                  isComplete: false,
                });
              }
            } catch (e) {
              console.warn("Failed to parse SSE line:", line, e);
            }
          }
        }
      }

      // Final update
      onResult({
        severity,
        remedy_suggestions: streamedResponse,
        requires_doctor: true,
        isComplete: true,
      });
    } catch (e) {
      console.error(e);
      setError("Could not connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitRef = useRef(handleSubmit);
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  });

  // Re-fetch the translation when language changes
  useEffect(() => {
    if (prevLangRef.current !== currentLanguage) {
      prevLangRef.current = currentLanguage;

      if (lastSubmittedSymptoms) {
        setIsVoiceInput(true); // Auto-play the TTS for the new translation
        setTimeout(() => {
          handleSubmitRef.current(currentLanguage);
        }, 50);
      }
    }
  }, [currentLanguage, lastSubmittedSymptoms, setIsVoiceInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
  };

  return (
    <section id="triage" className="w-full">
      <div className="relative">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
          {/* Uploaded File Preview */}
          {uploadedFile && (
            <div className="px-4 pt-4">
              <div className="flex items-center gap-3 p-3 bg-violet-500/10 border border-violet-500/30 rounded-xl">
                {filePreview ? (
                  <img
                    src={filePreview}
                    alt="Preview"
                    className="w-10 h-10 rounded-lg object-cover border border-violet-500/30"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-violet-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-violet-300 font-medium truncate">
                    {uploadedFile.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {uploadedFile.type.startsWith("image/") ? (
                      <span className="flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> Prescription
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" /> PDF
                      </span>
                    )}{" "}
                    · {(uploadedFile.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  onClick={removeFile}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Textarea — placeholder changes with language */}
          <div className="p-4">
            <textarea
              ref={textareaRef}
              value={symptoms}
              onChange={(e) => {
                setSymptoms(e.target.value);
                setError(null);
                setIsVoiceInput(false);
              }}
              onKeyDown={handleKeyDown}
              placeholder={t.placeholder}
              className="w-full h-28 sm:h-32 bg-transparent text-white placeholder-slate-500 resize-none focus:outline-none text-base leading-relaxed"
              disabled={isLoading}
            />
          </div>

          {/* Listening Indicator */}
          {isListening && (
            <div className="px-4 pb-2 flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-3 bg-red-400 rounded-full animate-sound-wave" />
                <span className="w-1.5 h-4 bg-red-400 rounded-full animate-sound-wave animation-delay-100" />
                <span className="w-1.5 h-2.5 bg-red-400 rounded-full animate-sound-wave animation-delay-200" />
                <span className="w-1.5 h-5 bg-red-400 rounded-full animate-sound-wave animation-delay-300" />
                <span className="w-1.5 h-3 bg-red-400 rounded-full animate-sound-wave animation-delay-100" />
              </div>
              <span className="text-xs text-red-400 font-medium">{t.listening}</span>
            </div>
          )}

          {/* Bottom Action Bar */}
          <div className="px-4 pb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="p-2.5 rounded-xl text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 transition-all"
                title={t.uploadPrescription}
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />

              {speechSupported && (
                <button
                  onClick={toggleListening}
                  disabled={isLoading}
                  className={`p-2.5 rounded-xl transition-all ${
                    isListening
                      ? "text-red-400 bg-red-500/15 animate-pulse"
                      : "text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                  }`}
                  title={isListening ? t.stopListening : t.voiceInput}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              )}
            </div>

            <button
              onClick={() => handleSubmit()}
              disabled={!symptoms.trim() || isLoading}
              className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 transition-all"
              title={t.send}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        <p className="text-center text-xs text-slate-600 mt-3">
          <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-500 text-[10px]">Ctrl</kbd>
          {" + "}
          <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-500 text-[10px]">Enter</kbd>
          {" to send"}
          {!speechSupported && <span className="text-amber-500/70 ml-2">{t.voiceRequiresChrome}</span>}
        </p>
      </div>
    </section>
  );
}
