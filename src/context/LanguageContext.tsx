"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";

/**
 * Supported language mappings with Indian locale codes for TTS.
 */
export const LANGUAGE_MAP = {
  en: { label: "English", nativeLabel: "English", locale: "en-IN" },
  hi: { label: "Hindi", nativeLabel: "हिन्दी", locale: "hi-IN" },
  kn: { label: "Kannada", nativeLabel: "ಕನ್ನಡ", locale: "kn-IN" },
  ta: { label: "Tamil", nativeLabel: "தமிழ்", locale: "ta-IN" },
  te: { label: "Telugu", nativeLabel: "తెలుగు", locale: "te-IN" },
} as const;

export type LanguageCode = keyof typeof LANGUAGE_MAP;

/**
 * All translatable UI strings, keyed by language code.
 */
export const UI_STRINGS: Record<LanguageCode, {
  heroTitle: string;
  heroSubtitle: string;
  placeholder: string;
  listening: string;
  uploadPrescription: string;
  voiceInput: string;
  stopListening: string;
  send: string;
  voiceRequiresChrome: string;
  disclaimer: string;
  emergencyCall: string;
  educationalOnly: string;
  findPharmacies: string;
  doctorRecommended: string;
  aiAssessment: string;
  lowSeverity: string;
  medSeverity: string;
  highSeverity: string;
  nearbyPharmacies: string;
  pharmaciesWithin: string;
  symptomCheck: string;
  findPharmacy: string;
  selectLanguage: string;
  footer: string;
}> = {
  en: {
    heroTitle: "How are you feeling?",
    heroSubtitle: "Describe your symptoms and get AI-powered remedy suggestions",
    placeholder: "Describe your symptoms...",
    listening: "Listening...",
    uploadPrescription: "Upload prescription",
    voiceInput: "Voice input",
    stopListening: "Stop listening",
    send: "Send",
    voiceRequiresChrome: "• Voice requires Chrome",
    disclaimer: "Disclaimer:",
    emergencyCall: "112",
    educationalOnly: "educational purposes only",
    findPharmacies: "Find Nearby Pharmacies",
    doctorRecommended: "Doctor Visit Recommended",
    aiAssessment: "AI Triage Assessment",
    lowSeverity: "Low Severity",
    medSeverity: "Medium Severity",
    highSeverity: "High Severity",
    nearbyPharmacies: "Nearby Pharmacies",
    pharmaciesWithin: "Pharmacies within 1-2 km of your location",
    symptomCheck: "Symptom Check",
    findPharmacy: "Find Pharmacy",
    selectLanguage: "Language",
    footer: "Built with Next.js, OpenRouter AI, and OpenStreetMap",
  },
  hi: {
    heroTitle: "आप कैसा महसूस कर रहे हैं?",
    heroSubtitle: "अपने लक्षण बताएं और AI-संचालित उपचार सुझाव पाएं",
    placeholder: "अपने लक्षण बताएं...",
    listening: "सुन रहा हूँ...",
    uploadPrescription: "प्रिस्क्रिप्शन अपलोड करें",
    voiceInput: "आवाज़ इनपुट",
    stopListening: "सुनना बंद करें",
    send: "भेजें",
    voiceRequiresChrome: "• आवाज़ के लिए Chrome चाहिए",
    disclaimer: "अस्वीकरण:",
    emergencyCall: "112",
    educationalOnly: "केवल शैक्षिक उद्देश्यों के लिए",
    findPharmacies: "नज़दीकी फार्मेसी खोजें",
    doctorRecommended: "डॉक्टर की सलाह अनुशंसित",
    aiAssessment: "AI ट्राइएज मूल्यांकन",
    lowSeverity: "कम गंभीरता",
    medSeverity: "मध्यम गंभीरता",
    highSeverity: "उच्च गंभीरता",
    nearbyPharmacies: "नज़दीकी फार्मेसी",
    pharmaciesWithin: "आपके स्थान से 1-2 किमी के भीतर फार्मेसी",
    symptomCheck: "लक्षण जाँच",
    findPharmacy: "फार्मेसी खोजें",
    selectLanguage: "भाषा",
    footer: "Next.js, OpenRouter AI, और OpenStreetMap के साथ बनाया गया",
  },
  kn: {
    heroTitle: "ನಿಮಗೆ ಹೇಗೆ ಅನಿಸುತ್ತಿದೆ?",
    heroSubtitle: "ನಿಮ್ಮ ರೋಗಲಕ್ಷಣಗಳನ್ನು ವಿವರಿಸಿ ಮತ್ತು AI-ಆಧಾರಿತ ಚಿಕಿತ್ಸಾ ಸಲಹೆಗಳನ್ನು ಪಡೆಯಿರಿ",
    placeholder: "ನಿಮ್ಮ ರೋಗಲಕ್ಷಣಗಳನ್ನು ವಿವರಿಸಿ...",
    listening: "ಆಲಿಸುತ್ತಿದೆ...",
    uploadPrescription: "ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
    voiceInput: "ಧ್ವನಿ ಇನ್‌ಪುಟ್",
    stopListening: "ಆಲಿಸುವುದನ್ನು ನಿಲ್ಲಿಸಿ",
    send: "ಕಳುಹಿಸಿ",
    voiceRequiresChrome: "• ಧ್ವನಿಗೆ Chrome ಅಗತ್ಯ",
    disclaimer: "ಹಕ್ಕು ನಿರಾಕರಣೆ:",
    emergencyCall: "112",
    educationalOnly: "ಶೈಕ್ಷಣಿಕ ಉದ್ದೇಶಗಳಿಗಾಗಿ ಮಾತ್ರ",
    findPharmacies: "ಹತ್ತಿರದ ಫಾರ್ಮಸಿಗಳನ್ನು ಹುಡುಕಿ",
    doctorRecommended: "ವೈದ್ಯರ ಭೇಟಿ ಶಿಫಾರಸು",
    aiAssessment: "AI ಟ್ರಯಾಜ್ ಮೌಲ್ಯಮಾಪನ",
    lowSeverity: "ಕಡಿಮೆ ತೀವ್ರತೆ",
    medSeverity: "ಮಧ್ಯಮ ತೀವ್ರತೆ",
    highSeverity: "ಹೆಚ್ಚಿನ ತೀವ್ರತೆ",
    nearbyPharmacies: "ಹತ್ತಿರದ ಫಾರ್ಮಸಿಗಳು",
    pharmaciesWithin: "ನಿಮ್ಮ ಸ್ಥಳದಿಂದ 1-2 ಕಿಮೀ ಒಳಗೆ ಫಾರ್ಮಸಿಗಳು",
    symptomCheck: "ರೋಗಲಕ್ಷಣ ಪರೀಕ್ಷೆ",
    findPharmacy: "ಫಾರ್ಮಸಿ ಹುಡುಕಿ",
    selectLanguage: "ಭಾಷೆ",
    footer: "Next.js, OpenRouter AI, ಮತ್ತು OpenStreetMap ನೊಂದಿಗೆ ನಿರ್ಮಿಸಲಾಗಿದೆ",
  },
  ta: {
    heroTitle: "உங்களுக்கு எப்படி உணர்கிறீர்கள்?",
    heroSubtitle: "உங்கள் அறிகுறிகளை விவரிக்கவும் மற்றும் AI-இயக்கப்படும் சிகிச்சை பரிந்துரைகளைப் பெறவும்",
    placeholder: "உங்கள் அறிகுறிகளை விவரிக்கவும்...",
    listening: "கேட்கிறது...",
    uploadPrescription: "மருந்து சீட்டை பதிவேற்றவும்",
    voiceInput: "குரல் உள்ளீடு",
    stopListening: "கேட்பதை நிறுத்துங்கள்",
    send: "அனுப்பு",
    voiceRequiresChrome: "• குரலுக்கு Chrome தேவை",
    disclaimer: "மறுப்பு:",
    emergencyCall: "112",
    educationalOnly: "கல்வி நோக்கங்களுக்காக மட்டுமே",
    findPharmacies: "அருகிலுள்ள மருந்தகங்களைக் கண்டறியுங்கள்",
    doctorRecommended: "மருத்துவர் வருகை பரிந்துரைக்கப்படுகிறது",
    aiAssessment: "AI முன்னுரிமை மதிப்பீடு",
    lowSeverity: "குறைந்த தீவிரம்",
    medSeverity: "நடுத்தர தீவிரம்",
    highSeverity: "அதிக தீவிரம்",
    nearbyPharmacies: "அருகிலுள்ள மருந்தகங்கள்",
    pharmaciesWithin: "உங்கள் இருப்பிடத்திலிருந்து 1-2 கிமீ உள்ள மருந்தகங்கள்",
    symptomCheck: "அறிகுறி சோதனை",
    findPharmacy: "மருந்தகம் கண்டுபிடி",
    selectLanguage: "மொழி",
    footer: "Next.js, OpenRouter AI, மற்றும் OpenStreetMap உடன் உருவாக்கப்பட்டது",
  },
  te: {
    heroTitle: "మీకు ఎలా అనిపిస్తోంది?",
    heroSubtitle: "మీ లక్షణాలను వివరించండి మరియు AI-ఆధారిత చికిత్స సూచనలు పొందండి",
    placeholder: "మీ లక్షణాలను వివరించండి...",
    listening: "వింటోంది...",
    uploadPrescription: "ప్రిస్క్రిప్షన్ అప్‌లోడ్ చేయండి",
    voiceInput: "వాయిస్ ఇన్‌పుట్",
    stopListening: "వినడం ఆపండి",
    send: "పంపండి",
    voiceRequiresChrome: "• వాయిస్ కోసం Chrome అవసరం",
    disclaimer: "నిరాకరణ:",
    emergencyCall: "112",
    educationalOnly: "విద్యా ప్రయోజనాల కోసం మాత్రమే",
    findPharmacies: "సమీపంలోని ఫార్మసీలను కనుగొనండి",
    doctorRecommended: "వైద్యుడి సందర్శన సిఫార్సు",
    aiAssessment: "AI ట్రయేజ్ అంచనా",
    lowSeverity: "తక్కువ తీవ్రత",
    medSeverity: "మధ్యస్థ తీవ్రత",
    highSeverity: "అధిక తీవ్రత",
    nearbyPharmacies: "సమీపంలోని ఫార్మసీలు",
    pharmaciesWithin: "మీ స్థానం నుండి 1-2 కిమీ లోపల ఫార్మసీలు",
    symptomCheck: "లక్షణ తనిఖీ",
    findPharmacy: "ఫార్మసీ కనుగొనండి",
    selectLanguage: "భాష",
    footer: "Next.js, OpenRouter AI, మరియు OpenStreetMap తో నిర్మించబడింది",
  },
};

interface LanguageContextType {
  currentLanguage: LanguageCode;
  setCurrentLanguage: (lang: LanguageCode) => void;
  isVoiceInput: boolean;
  setIsVoiceInput: (val: boolean) => void;
  getLocale: () => string;
  getLabel: () => string;
  t: typeof UI_STRINGS["en"]; // current translations
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [currentLanguage, setCurrentLanguage] = useState<LanguageCode>("en");
  const [isVoiceInput, setIsVoiceInput] = useState(false);

  const getLocale = useCallback(
    () => LANGUAGE_MAP[currentLanguage].locale,
    [currentLanguage]
  );

  const getLabel = useCallback(
    () => LANGUAGE_MAP[currentLanguage].label,
    [currentLanguage]
  );

  const t = UI_STRINGS[currentLanguage];

  return (
    <LanguageContext.Provider
      value={{
        currentLanguage,
        setCurrentLanguage,
        isVoiceInput,
        setIsVoiceInput,
        getLocale,
        getLabel,
        t,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
