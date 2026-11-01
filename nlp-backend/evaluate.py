# nlp-backend/evaluate.py
"""
NLP Pipeline Evaluation Script for CureRoute
==============================================
Computes:
  • Precision, Recall, F1  — NER (ClinicalBERT)
  • BLEU                   — Translation (MarianMT)
  • ROUGE-1, ROUGE-2, ROUGE-L — Summarization (T5)

Required for NLP course syllabus compliance.
"""

from __future__ import annotations

import logging
import sys
from typing import Any, Dict, List, Tuple

import numpy as np
import torch
from rouge_score import rouge_scorer
from sklearn.metrics import classification_report, precision_recall_fscore_support
from transformers import (
    AutoModelForTokenClassification,
    AutoTokenizer,
    MarianMTModel,
    MarianTokenizer,
    T5ForConditionalGeneration,
    T5Tokenizer,
)

import nltk
from nltk.translate.bleu_score import SmoothingFunction, corpus_bleu, sentence_bleu

nltk.download("punkt", quiet=True)
nltk.download("punkt_tab", quiet=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
logger = logging.getLogger("cureroute.eval")

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ═══════════════════════════════════════════════════════════════════════════
# 1. NER Evaluation — ClinicalBERT
# ═══════════════════════════════════════════════════════════════════════════

# Gold-standard test examples: (sentence, IOB-tag list)
# Tags: O = non-entity, B-SYMPTOM = begin symptom, I-SYMPTOM = continuation
NER_TEST_DATA: List[Tuple[str, List[str]]] = [
    (
        "I have a headache and fever for 3 days",
        ["O", "O", "O", "B-SYMPTOM", "O", "B-SYMPTOM", "O", "O", "O"],
    ),
    (
        "my throat is sore and I feel dizzy",
        ["O", "B-SYMPTOM", "O", "B-SYMPTOM", "O", "O", "O", "B-SYMPTOM"],
    ),
    (
        "I am experiencing chest pain since yesterday",
        ["O", "O", "O", "B-SYMPTOM", "I-SYMPTOM", "O", "O"],
    ),
    (
        "nausea and vomiting started this morning",
        ["B-SYMPTOM", "O", "B-SYMPTOM", "O", "O", "O"],
    ),
    (
        "I have been coughing with body aches",
        ["O", "O", "O", "B-SYMPTOM", "O", "B-SYMPTOM", "I-SYMPTOM"],
    ),
    (
        "stomach pain and diarrhea for a week",
        ["B-SYMPTOM", "I-SYMPTOM", "O", "B-SYMPTOM", "O", "O", "O"],
    ),
    (
        "I feel fatigued and have muscle cramps",
        ["O", "O", "B-SYMPTOM", "O", "O", "B-SYMPTOM", "I-SYMPTOM"],
    ),
    (
        "back pain with numbness in my legs",
        ["B-SYMPTOM", "I-SYMPTOM", "O", "B-SYMPTOM", "O", "O", "O"],
    ),
    (
        "I have a runny nose and sneezing",
        ["O", "O", "O", "B-SYMPTOM", "I-SYMPTOM", "O", "B-SYMPTOM"],
    ),
    (
        "severe headache with blurred vision",
        ["O", "B-SYMPTOM", "O", "B-SYMPTOM", "I-SYMPTOM"],
    ),
]

# Mapping integers to IOB labels for the 10-label scheme:
# 0=O, 1=B-SYMPTOM, 2=I-SYMPTOM, 3=B-DURATION, 4=I-DURATION,
# 5=B-SEVERITY, 6=I-SEVERITY, 7=B-TREATMENT, 8=I-TREATMENT, 9=PAD
IOB_LABELS = [
    "O",
    "B-SYMPTOM",
    "I-SYMPTOM",
    "B-DURATION",
    "I-DURATION",
    "B-SEVERITY",
    "I-SEVERITY",
    "B-TREATMENT",
    "I-TREATMENT",
    "PAD",
]

LABEL_TO_ID = {label: idx for idx, label in enumerate(IOB_LABELS)}


def _align_gold_to_subwords(
    tokenizer: Any,
    sentence: str,
    gold_tags: List[str],
) -> Tuple[List[int], List[str]]:
    """Tokenize *sentence* with the sub-word tokenizer and expand *gold_tags*
    (which are aligned to whitespace-split words) to match the sub-word token
    count.  Returns ``(input_ids, expanded_gold_label_strings)``.
    """
    encoding = tokenizer(
        sentence,
        return_tensors="pt",
        padding=False,
        truncation=True,
        max_length=512,
        return_offsets_mapping=True,
    )
    input_ids: List[int] = encoding["input_ids"][0].tolist()
    offsets: List[Tuple[int, int]] = encoding["offset_mapping"][0].tolist()

    words = sentence.split()
    word_starts: List[int] = []
    pos = 0
    for w in words:
        idx = sentence.index(w, pos)
        word_starts.append(idx)
        pos = idx + len(w)

    expanded_tags: List[str] = []
    for start, end in offsets:
        if start == 0 and end == 0:
            # Special token ([CLS], [SEP])
            expanded_tags.append("O")
            continue
        # Find which word this sub-word belongs to
        matched = False
        for wi, ws in enumerate(word_starts):
            word_end = ws + len(words[wi])
            if ws <= start < word_end:
                if wi < len(gold_tags):
                    tag = gold_tags[wi]
                    # If this is a continuation sub-word inside a B- span, use I-
                    if tag.startswith("B-") and start > ws:
                        tag = "I-" + tag[2:]
                    expanded_tags.append(tag)
                else:
                    expanded_tags.append("O")
                matched = True
                break
        if not matched:
            expanded_tags.append("O")

    return input_ids, expanded_tags


def evaluate_ner(
    tokenizer: Any,
    model: Any,
) -> Dict[str, float]:
    """Evaluate ClinicalBERT NER on gold-standard data.

    Returns a dict with macro-averaged precision, recall, and F1.
    """
    all_gold: List[int] = []
    all_pred: List[int] = []

    model.eval()
    for sentence, gold_tags in NER_TEST_DATA:
        input_ids, expanded_gold = _align_gold_to_subwords(tokenizer, sentence, gold_tags)

        inputs = tokenizer(
            sentence,
            return_tensors="pt",
            padding=False,
            truncation=True,
            max_length=512,
        ).to(DEVICE)

        with torch.no_grad():
            logits = model(**inputs).logits  # (1, seq_len, num_labels)
        preds = torch.argmax(logits, dim=-1)[0].cpu().tolist()

        # Ensure lengths match
        min_len = min(len(preds), len(expanded_gold))
        for i in range(min_len):
            gold_id = LABEL_TO_ID.get(expanded_gold[i], 0)
            all_gold.append(gold_id)
            all_pred.append(preds[i] if preds[i] < len(IOB_LABELS) else 0)

    # Classification report
    target_names = [IOB_LABELS[i] for i in sorted(set(all_gold) | set(all_pred)) if i < len(IOB_LABELS)]
    target_labels = sorted(set(all_gold) | set(all_pred))

    print("\n" + "=" * 70)
    print("  NER EVALUATION — ClinicalBERT (token-level)")
    print("=" * 70)
    print(
        classification_report(
            all_gold,
            all_pred,
            labels=target_labels,
            target_names=target_names,
            zero_division=0,
        )
    )

    precision, recall, f1, _ = precision_recall_fscore_support(
        all_gold, all_pred, average="macro", zero_division=0
    )
    print(f"  Macro-avg  P={precision:.4f}  R={recall:.4f}  F1={f1:.4f}")
    return {"precision": precision, "recall": recall, "f1": f1}


# ═══════════════════════════════════════════════════════════════════════════
# 2. Translation Evaluation — MarianMT  (BLEU)
# ═══════════════════════════════════════════════════════════════════════════

# Kannada → English reference pairs
TRANSLATION_TEST_DATA: List[Tuple[str, str]] = [
    ("ನನಗೆ ತಲೆನೋವು ಇದೆ", "I have a headache"),
    ("ನನಗೆ ಜ್ವರ ಬಂದಿದೆ", "I have a fever"),
    ("ನನ್ನ ಹೊಟ್ಟೆ ನೋಯುತ್ತಿದೆ", "My stomach is hurting"),
    ("ನನಗೆ ಕೆಮ್ಮು ಬರುತ್ತಿದೆ", "I am coughing"),
    ("ನನಗೆ ತಲೆ ಸುತ್ತುತ್ತಿದೆ", "I am feeling dizzy"),
]


def evaluate_translation(
    tokenizer: Any,
    model: Any,
) -> Dict[str, float]:
    """Compute per-sentence and corpus BLEU scores for Kannada→English.

    Returns a dict with ``corpus_bleu`` and ``per_sentence_bleu`` (list).
    """
    model.eval()
    smoothie = SmoothingFunction().method1
    references_corpus: List[List[List[str]]] = []
    hypotheses_corpus: List[List[str]] = []
    per_sentence: List[float] = []

    print("\n" + "=" * 70)
    print("  TRANSLATION EVALUATION — MarianMT kn→en (BLEU)")
    print("=" * 70)

    for kn_text, en_reference in TRANSLATION_TEST_DATA:
        inputs = tokenizer(kn_text, return_tensors="pt", padding=True, truncation=True).to(DEVICE)
        with torch.no_grad():
            translated_ids = model.generate(**inputs, max_length=128)
        hypothesis = tokenizer.decode(translated_ids[0], skip_special_tokens=True)

        ref_tokens = en_reference.lower().split()
        hyp_tokens = hypothesis.lower().split()

        references_corpus.append([ref_tokens])
        hypotheses_corpus.append(hyp_tokens)

        bleu = sentence_bleu([ref_tokens], hyp_tokens, smoothing_function=smoothie)
        per_sentence.append(bleu)
        print(f"  SRC: {kn_text}")
        print(f"  REF: {en_reference}")
        print(f"  HYP: {hypothesis}")
        print(f"  BLEU: {bleu:.4f}")
        print()

    c_bleu = corpus_bleu(references_corpus, hypotheses_corpus, smoothing_function=smoothie)
    print(f"  Corpus BLEU: {c_bleu:.4f}")
    return {"corpus_bleu": c_bleu, "per_sentence_bleu": per_sentence}


# ═══════════════════════════════════════════════════════════════════════════
# 3. Summarization Evaluation — T5  (ROUGE)
# ═══════════════════════════════════════════════════════════════════════════

SUMMARIZATION_TEST_DATA: List[Tuple[str, str]] = [
    (
        "summarize: Patient reports severe headache for 3 days with severity 8/10",
        "Patient has severe headache lasting three days rated eight out of ten.",
    ),
    (
        "summarize: Patient reports chest pain for 1 week with severity 7/10",
        "Patient experiences chest pain for one week with severity seven.",
    ),
    (
        "summarize: Patient reports nausea and vomiting for 2 days with severity 5/10",
        "Patient has nausea and vomiting for two days, moderate severity.",
    ),
    (
        "summarize: Patient reports joint pain and fatigue for 2 weeks with severity 6/10",
        "Patient reports joint pain and fatigue persisting for two weeks.",
    ),
    (
        "summarize: Patient reports cough with fever for 5 days with severity 4/10",
        "Patient has cough and fever for five days, mild to moderate.",
    ),
]


def evaluate_summarization(
    tokenizer: Any,
    model: Any,
) -> Dict[str, Dict[str, float]]:
    """Compute ROUGE-1, ROUGE-2, and ROUGE-L for T5 summaries.

    Returns nested dict of metric → {precision, recall, fmeasure}.
    """
    model.eval()
    scorer = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)

    all_scores: Dict[str, List[Dict[str, float]]] = {
        "rouge1": [],
        "rouge2": [],
        "rougeL": [],
    }

    print("\n" + "=" * 70)
    print("  SUMMARIZATION EVALUATION — T5 (ROUGE)")
    print("=" * 70)

    for input_text, reference_summary in SUMMARIZATION_TEST_DATA:
        inputs = tokenizer(
            input_text,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=512,
        ).to(DEVICE)

        with torch.no_grad():
            summary_ids = model.generate(
                **inputs,
                max_length=150,
                min_length=10,
                length_penalty=2.0,
                num_beams=4,
                early_stopping=True,
            )
        hypothesis = tokenizer.decode(summary_ids[0], skip_special_tokens=True)

        scores = scorer.score(reference_summary, hypothesis)
        for metric in all_scores:
            all_scores[metric].append(
                {
                    "precision": scores[metric].precision,
                    "recall": scores[metric].recall,
                    "fmeasure": scores[metric].fmeasure,
                }
            )

        print(f"  INPUT : {input_text[:80]}…")
        print(f"  REF   : {reference_summary}")
        print(f"  HYP   : {hypothesis}")
        print(
            f"  ROUGE-1={scores['rouge1'].fmeasure:.4f}  "
            f"ROUGE-2={scores['rouge2'].fmeasure:.4f}  "
            f"ROUGE-L={scores['rougeL'].fmeasure:.4f}"
        )
        print()

    # Average scores
    avg: Dict[str, Dict[str, float]] = {}
    print(f"  {'Metric':<10} {'Precision':>10} {'Recall':>10} {'F-measure':>10}")
    print(f"  {'-'*10} {'-'*10} {'-'*10} {'-'*10}")
    for metric, score_list in all_scores.items():
        p = float(np.mean([s["precision"] for s in score_list]))
        r = float(np.mean([s["recall"] for s in score_list]))
        f = float(np.mean([s["fmeasure"] for s in score_list]))
        avg[metric] = {"precision": p, "recall": r, "fmeasure": f}
        print(f"  {metric:<10} {p:>10.4f} {r:>10.4f} {f:>10.4f}")

    return avg


# ═══════════════════════════════════════════════════════════════════════════
# Main — run all evaluations
# ═══════════════════════════════════════════════════════════════════════════

def main() -> None:
    """Load models and execute every evaluation, then print a combined report."""
    print("\n╔══════════════════════════════════════════════════════════════════╗")
    print("║          CureRoute NLP Pipeline — Evaluation Report            ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    print(f"\n  Device: {DEVICE}\n")

    results: Dict[str, Any] = {}

    # ------ ClinicalBERT NER -------------------------------------------------
    try:
        logger.info("Loading ClinicalBERT for NER evaluation …")
        cb_tokenizer = AutoTokenizer.from_pretrained("emilyalsentzer/Bio_ClinicalBERT")
        cb_model = AutoModelForTokenClassification.from_pretrained(
            "emilyalsentzer/Bio_ClinicalBERT",
            num_labels=10,
            ignore_mismatched_sizes=True,
        ).to(DEVICE)
        results["ner"] = evaluate_ner(cb_tokenizer, cb_model)
    except Exception:
        logger.exception("ClinicalBERT evaluation failed")
        results["ner"] = {"error": "Model could not be loaded"}

    # ------ MarianMT Translation ----------------------------------------------
    try:
        logger.info("Loading MarianMT kn→en for translation evaluation …")
        mt_tokenizer = MarianTokenizer.from_pretrained("Helsinki-NLP/opus-mt-kn-en")
        mt_model = MarianMTModel.from_pretrained("Helsinki-NLP/opus-mt-kn-en").to(DEVICE)
        results["translation"] = evaluate_translation(mt_tokenizer, mt_model)
    except Exception:
        logger.exception("MarianMT evaluation failed")
        results["translation"] = {"error": "Model could not be loaded"}

    # ------ T5 Summarization ---------------------------------------------------
    try:
        logger.info("Loading T5-base for summarization evaluation …")
        t5_tokenizer = T5Tokenizer.from_pretrained("t5-base")
        t5_model = T5ForConditionalGeneration.from_pretrained("t5-base").to(DEVICE)
        results["summarization"] = evaluate_summarization(t5_tokenizer, t5_model)
    except Exception:
        logger.exception("T5 evaluation failed")
        results["summarization"] = {"error": "Model could not be loaded"}

    # ------ Combined report card -----------------------------------------------
    print("\n" + "=" * 70)
    print("  COMBINED REPORT CARD")
    print("=" * 70)

    if isinstance(results.get("ner"), dict) and "f1" in results["ner"]:
        ner = results["ner"]
        print(f"  NER (ClinicalBERT)    — P: {ner['precision']:.4f}  R: {ner['recall']:.4f}  F1: {ner['f1']:.4f}")
    else:
        print("  NER (ClinicalBERT)    — SKIPPED (model load error)")

    if isinstance(results.get("translation"), dict) and "corpus_bleu" in results["translation"]:
        print(f"  Translation (MarianMT)— Corpus BLEU: {results['translation']['corpus_bleu']:.4f}")
    else:
        print("  Translation (MarianMT)— SKIPPED (model load error)")

    if isinstance(results.get("summarization"), dict) and "rouge1" in results["summarization"]:
        s = results["summarization"]
        print(
            f"  Summarization (T5)    — ROUGE-1: {s['rouge1']['fmeasure']:.4f}  "
            f"ROUGE-2: {s['rouge2']['fmeasure']:.4f}  "
            f"ROUGE-L: {s['rougeL']['fmeasure']:.4f}"
        )
    else:
        print("  Summarization (T5)    — SKIPPED (model load error)")

    print("=" * 70)
    print("  Evaluation complete.\n")


if __name__ == "__main__":
    main()
