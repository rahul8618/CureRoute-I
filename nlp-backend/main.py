"""
CureRoute NLP Backend — FastAPI Application
============================================
Provides endpoints for:
  - Audio transcription (Whisper) with Kannada↔English translation (MarianMT)
  - Symptom triage pipeline (ClinicalBERT NER → Slot-filling → T5 Summary → BioGPT Remedy)
  - Text translation (Kannada ↔ English)
  - Health check
"""

from __future__ import annotations

import io
import logging
import os
import re
import tempfile
from typing import Any, Dict, List, Optional

import librosa
import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import (
    AutoModelForTokenClassification,
    AutoTokenizer,
    BioGptForCausalLM,
    MarianMTModel,
    MarianTokenizer,
    T5ForConditionalGeneration,
    T5Tokenizer,
    WhisperForConditionalGeneration,
    WhisperProcessor,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger("cureroute.nlp")

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="CureRoute NLP Backend",
    version="1.0.0",
    description="NLP micro-service for audio transcription, symptom triage, and translation.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Global model registry
# ---------------------------------------------------------------------------
models: Dict[str, Any] = {}
device: torch.device = torch.device("cpu")

# ---------------------------------------------------------------------------
# Severe-symptom keyword list (mirrors the existing route.ts)
# ---------------------------------------------------------------------------
SEVERE_KEYWORDS: List[str] = [
    "chest pain", "difficulty breathing", "shortness of breath",
    "severe headache", "loss of consciousness", "fainting",
    "seizure", "stroke", "heart attack", "paralysis",
    "severe bleeding", "coughing blood", "vomiting blood",
    "suicidal", "overdose", "poisoning",
    "severe allergic reaction", "anaphylaxis",
    "high fever", "confusion", "blurred vision",
    "numbness", "slurred speech",
]

COMMON_SYMPTOM_WORDS: List[str] = [
    "headache", "fever", "cough", "cold", "nausea", "vomiting",
    "diarrhea", "fatigue", "dizziness", "pain", "sore", "rash",
    "cramp", "ache", "swelling", "itching", "burning", "bleeding",
    "weakness", "chills", "congestion", "sneezing", "throat",
    "stomach", "chest", "back", "joint", "muscle",
]

# ---------------------------------------------------------------------------
# Pydantic request / response schemas
# ---------------------------------------------------------------------------

class TriageTextRequest(BaseModel):
    text: str
    session: Dict[str, Optional[str]] = Field(default_factory=dict)


class TranslateRequest(BaseModel):
    text: str
    direction: str = Field(..., pattern=r"^(kn-en|en-kn)$")


# ---------------------------------------------------------------------------
# Startup — lazy-load models
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def load_models() -> None:  # noqa: C901
    """Load all NLP models at startup. Each model is wrapped in its own
    try/except so that a single failure does not prevent the rest from loading.
    """
    global device
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("Compute device: %s", device)

    # 1. Whisper ---------------------------------------------------------------
    try:
        logger.info("Loading openai/whisper-base …")
        models["whisper_processor"] = WhisperProcessor.from_pretrained("openai/whisper-base")
        models["whisper_model"] = WhisperForConditionalGeneration.from_pretrained(
            "openai/whisper-base"
        ).to(device)
        logger.info("✓ Whisper loaded")
    except Exception:
        logger.exception("✗ Failed to load Whisper")
        models["whisper_processor"] = None
        models["whisper_model"] = None

    # 2. MarianMT kn→en --------------------------------------------------------
    try:
        logger.info("Loading Helsinki-NLP/opus-mt-kn-en …")
        models["marian_kn_en_tokenizer"] = MarianTokenizer.from_pretrained(
            "Helsinki-NLP/opus-mt-kn-en"
        )
        models["marian_kn_en_model"] = MarianMTModel.from_pretrained(
            "Helsinki-NLP/opus-mt-kn-en"
        ).to(device)
        logger.info("✓ MarianMT kn→en loaded")
    except Exception:
        logger.exception("✗ Failed to load MarianMT kn→en")
        models["marian_kn_en_tokenizer"] = None
        models["marian_kn_en_model"] = None

    # 3. MarianMT en→kn --------------------------------------------------------
    try:
        logger.info("Loading Helsinki-NLP/opus-mt-en-kn …")
        models["marian_en_kn_tokenizer"] = MarianTokenizer.from_pretrained(
            "Helsinki-NLP/opus-mt-en-kn"
        )
        models["marian_en_kn_model"] = MarianMTModel.from_pretrained(
            "Helsinki-NLP/opus-mt-en-kn"
        ).to(device)
        logger.info("✓ MarianMT en→kn loaded")
    except Exception:
        logger.exception("✗ Failed to load MarianMT en→kn")
        models["marian_en_kn_tokenizer"] = None
        models["marian_en_kn_model"] = None

    # 4. ClinicalBERT (NER) ----------------------------------------------------
    try:
        logger.info("Loading emilyalsentzer/Bio_ClinicalBERT …")
        models["clinicalbert_tokenizer"] = AutoTokenizer.from_pretrained(
            "emilyalsentzer/Bio_ClinicalBERT"
        )
        models["clinicalbert_model"] = AutoModelForTokenClassification.from_pretrained(
            "emilyalsentzer/Bio_ClinicalBERT",
            num_labels=10,
            ignore_mismatched_sizes=True,
        ).to(device)
        logger.info("✓ ClinicalBERT loaded")
    except Exception:
        logger.exception("✗ Failed to load ClinicalBERT")
        models["clinicalbert_tokenizer"] = None
        models["clinicalbert_model"] = None

    # 5. T5-base (summarization) -----------------------------------------------
    try:
        logger.info("Loading t5-base …")
        models["t5_tokenizer"] = T5Tokenizer.from_pretrained("t5-base")
        models["t5_model"] = T5ForConditionalGeneration.from_pretrained("t5-base").to(device)
        logger.info("✓ T5 loaded")
    except Exception:
        logger.exception("✗ Failed to load T5")
        models["t5_tokenizer"] = None
        models["t5_model"] = None

    # 6. BioGPT (remedy generation) --------------------------------------------
    try:
        logger.info("Loading microsoft/BioGPT …")
        models["biogpt_tokenizer"] = AutoTokenizer.from_pretrained("microsoft/BioGPT")
        models["biogpt_model"] = BioGptForCausalLM.from_pretrained("microsoft/BioGPT").to(device)
        logger.info("✓ BioGPT loaded")
    except Exception:
        logger.exception("✗ Failed to load BioGPT")
        models["biogpt_tokenizer"] = None
        models["biogpt_model"] = None

    loaded = [k for k, v in models.items() if v is not None and not k.endswith("_tokenizer") and not k.endswith("_processor")]
    logger.info("Models ready on %s: %s", device, ", ".join(loaded) if loaded else "(none)")


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _contains_kannada(text: str) -> bool:
    """Return True if *text* contains Kannada script characters."""
    return bool(re.search(r"[\u0C80-\u0CFF]", text))


def _translate(text: str, direction: str) -> str:
    """Translate *text* using the appropriate MarianMT model.

    Parameters
    ----------
    direction : ``"kn-en"`` or ``"en-kn"``
    """
    if direction == "kn-en":
        tokenizer = models.get("marian_kn_en_tokenizer")
        model = models.get("marian_kn_en_model")
    else:
        tokenizer = models.get("marian_en_kn_tokenizer")
        model = models.get("marian_en_kn_model")

    if tokenizer is None or model is None:
        raise RuntimeError(f"MarianMT model for {direction} is not loaded")

    inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True).to(device)
    with torch.no_grad():
        translated_ids = model.generate(**inputs, max_length=512)
    return tokenizer.batch_decode(translated_ids, skip_special_tokens=True)[0]


def _extract_entities_clinicalbert(text: str) -> List[str]:
    """Run ClinicalBERT NER and return tokens predicted with a non-O label."""
    tokenizer = models.get("clinicalbert_tokenizer")
    model = models.get("clinicalbert_model")

    if tokenizer is None or model is None:
        # Fallback: simple keyword extraction
        return _extract_entities_keyword(text)

    inputs = tokenizer(
        text,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=512,
    ).to(device)

    with torch.no_grad():
        outputs = model(**inputs)

    predictions = torch.argmax(outputs.logits, dim=-1)[0]
    tokens = tokenizer.convert_ids_to_tokens(inputs["input_ids"][0])

    # IOB label indices: 0 → O, odd → B-*, even → I-*
    entities: List[str] = []
    current_entity: List[str] = []
    for token, pred in zip(tokens, predictions):
        label_id = pred.item()
        if label_id != 0:  # non-O
            clean = token.replace("##", "")
            if token.startswith("##") and current_entity:
                current_entity[-1] += clean
            else:
                current_entity.append(clean)
        else:
            if current_entity:
                entities.append(" ".join(current_entity))
                current_entity = []
    if current_entity:
        entities.append(" ".join(current_entity))

    # If ClinicalBERT returns nothing, fall back to keyword extraction
    if not entities:
        entities = _extract_entities_keyword(text)

    return entities


def _extract_entities_keyword(text: str) -> List[str]:
    """Fallback entity extraction using keyword matching."""
    text_lower = text.lower()
    found: List[str] = []
    for word in COMMON_SYMPTOM_WORDS:
        if word in text_lower:
            found.append(word)
    return found


def _summarize_t5(input_text: str) -> str:
    """Generate a clinical summary with T5."""
    tokenizer = models.get("t5_tokenizer")
    model = models.get("t5_model")

    if tokenizer is None or model is None:
        return input_text  # passthrough if model unavailable

    inputs = tokenizer(
        input_text,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=512,
    ).to(device)

    with torch.no_grad():
        summary_ids = model.generate(
            **inputs,
            max_length=150,
            min_length=30,
            length_penalty=2.0,
            num_beams=4,
            early_stopping=True,
        )
    return tokenizer.decode(summary_ids[0], skip_special_tokens=True)


def _generate_remedy_biogpt(prompt: str) -> str:
    """Generate a remedy suggestion with BioGPT."""
    tokenizer = models.get("biogpt_tokenizer")
    model = models.get("biogpt_model")

    if tokenizer is None or model is None:
        return "Please consult a healthcare professional for proper treatment advice."

    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=512).to(device)

    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=256,
            num_beams=4,
            early_stopping=True,
            no_repeat_ngram_size=3,
        )

    full_text: str = tokenizer.decode(output_ids[0], skip_special_tokens=True)
    # Strip the original prompt from the output
    if full_text.startswith(prompt):
        full_text = full_text[len(prompt):].strip()
    return full_text if full_text else "Please consult a healthcare professional for proper treatment advice."


def _classify_severity(text: str, severity_score: Optional[str]) -> str:
    """Classify severity as high / medium / low based on keywords + numeric score."""
    text_lower = text.lower()

    # Check for severe keywords
    for kw in SEVERE_KEYWORDS:
        if kw in text_lower:
            return "high"

    # Use the numeric severity score if provided
    if severity_score is not None:
        try:
            score = int(severity_score)
            if score >= 8:
                return "high"
            elif score >= 4:
                return "medium"
            else:
                return "low"
        except ValueError:
            pass

    return "medium"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/triage/audio")
async def triage_audio(audio: UploadFile = File(...)) -> Dict[str, Any]:
    """Transcribe an uploaded audio file and optionally translate from Kannada.

    Returns
    -------
    dict
        ``transcription``, ``language_detected`` (``"kn"`` or ``"en"``), and
        ``translated_text``.
    """
    # --- Validate upload -----------------------------------------------------
    if audio.size is not None and audio.size == 0:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

    # --- Check model availability --------------------------------------------
    processor = models.get("whisper_processor")
    whisper_model = models.get("whisper_model")
    if processor is None or whisper_model is None:
        raise HTTPException(status_code=503, detail="Whisper model is not loaded.")

    try:
        # --- Read and decode audio -------------------------------------------
        audio_bytes: bytes = await audio.read()
        if len(audio_bytes) == 0:
            raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

        # Write to a temp file so librosa can read any format
        suffix = os.path.splitext(audio.filename or "audio.wav")[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            waveform, _ = librosa.load(tmp_path, sr=16000)
        finally:
            os.unlink(tmp_path)

        # --- Whisper transcription -------------------------------------------
        input_features = processor(
            waveform, sampling_rate=16000, return_tensors="pt"
        ).input_features.to(device)

        with torch.no_grad():
            predicted_ids = whisper_model.generate(input_features)

        transcription: str = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0].strip()

        # --- Language detection & optional translation -----------------------
        language_detected: str = "kn" if _contains_kannada(transcription) else "en"
        translated_text: str = transcription

        if language_detected == "kn":
            try:
                translated_text = _translate(transcription, "kn-en")
            except RuntimeError as exc:
                logger.warning("Kannada→English translation unavailable: %s", exc)
                translated_text = transcription

        return {
            "transcription": transcription,
            "language_detected": language_detected,
            "translated_text": translated_text,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Audio processing failed")
        raise HTTPException(status_code=500, detail=f"Audio processing error: {exc}") from exc


@app.post("/api/triage/text")
async def triage_text(request: TriageTextRequest) -> Dict[str, Any]:
    """Run the full symptom-triage pipeline (NER → slot-fill → summarize → remedy).

    The caller maintains ``session`` state across turns.
    """
    text: str = request.text.strip()
    session: Dict[str, Optional[str]] = {
        "base_symptom": request.session.get("base_symptom"),
        "duration": request.session.get("duration"),
        "severity": request.session.get("severity"),
    }

    if not text:
        raise HTTPException(status_code=400, detail="Text field is required.")

    # ----- Step A: NER with ClinicalBERT ------------------------------------
    entities: List[str] = _extract_entities_clinicalbert(text)

    # Populate base_symptom from NER if not already set
    if session["base_symptom"] is None and entities:
        session["base_symptom"] = ", ".join(entities)

    # If still no symptom, use the raw text
    if session["base_symptom"] is None:
        session["base_symptom"] = text

    # ----- Step B: Slot filling ---------------------------------------------
    # Try to extract duration from current text if missing
    if session["duration"] is None:
        duration_match = re.search(
            r"(\d+\s*(?:day|days|week|weeks|month|months|hour|hours|year|years|morning|evening))",
            text,
            re.IGNORECASE,
        )
        if duration_match:
            session["duration"] = duration_match.group(1)

    if session["duration"] is None:
        return {
            "action": "ask",
            "question": "How long have you been experiencing these symptoms?",
            "session": session,
        }

    # Try to extract severity from current text if missing
    if session["severity"] is None:
        severity_match = re.search(r"\b(\d{1,2})\b", text)
        if severity_match:
            val = int(severity_match.group(1))
            if 1 <= val <= 10:
                session["severity"] = str(val)

    if session["severity"] is None:
        return {
            "action": "ask",
            "question": "On a scale of 1-10, how severe is the pain/discomfort?",
            "session": session,
        }

    # ----- Step C: Summarize with T5 ----------------------------------------
    t5_input = (
        f"summarize: Patient reports {session['base_symptom']} "
        f"for {session['duration']} with severity {session['severity']}/10"
    )
    summary: str = _summarize_t5(t5_input)

    # ----- Step D: Generate remedy with BioGPT ------------------------------
    biogpt_prompt = (
        f"Patient presents with {summary}. "
        "Recommended over-the-counter treatment:"
    )
    remedy: str = _generate_remedy_biogpt(biogpt_prompt)

    # ----- Step E: Severity classification ----------------------------------
    severity_level: str = _classify_severity(
        f"{session['base_symptom']} {summary}", session["severity"]
    )
    requires_doctor: bool = severity_level == "high"

    return {
        "action": "result",
        "severity": severity_level,
        "summary": summary,
        "remedy": remedy,
        "entities": entities,
        "requires_doctor": requires_doctor,
        "session": session,
    }


@app.post("/api/triage/translate")
async def triage_translate(request: TranslateRequest) -> Dict[str, str]:
    """Translate text between Kannada and English."""
    try:
        translated: str = _translate(request.text, request.direction)
        return {"translated": translated}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Translation failed")
        raise HTTPException(status_code=500, detail=f"Translation error: {exc}") from exc


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Return the load-status of every model."""
    return {
        "status": "ok",
        "device": str(device),
        "models": {
            "whisper": models.get("whisper_model") is not None,
            "marian_kn_en": models.get("marian_kn_en_model") is not None,
            "marian_en_kn": models.get("marian_en_kn_model") is not None,
            "clinicalbert": models.get("clinicalbert_model") is not None,
            "t5": models.get("t5_model") is not None,
            "biogpt": models.get("biogpt_model") is not None,
        },
    }


# ---------------------------------------------------------------------------
# Dev entry-point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
