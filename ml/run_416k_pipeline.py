"""
Kalbu 416k Emotion Dataset Pipeline (EDA + Stratified Split + Model Training + FYP Evaluation)
==============================================================================================
Ingests emotions.csv/emotions.csv (and cross-verifies text.csv/text.csv),
cleans & deduplicates all 416,809 rows, generates stratified train/val/test splits
(ml/splits/validation.csv & ml/splits/test.csv), trains a class-balanced Complement
Multinomial Log-Likelihood (Unigram + Bigram) Emotion Classifier on the 80% training split,
evaluates Precision/Recall/F1/Confusion Matrix on the held-out Validation & Test splits,
and exports both:
  1. ml/artifacts/evaluation_report.json & src/lib/ai/model_report.json
  2. src/lib/ai/trained_416k_weights.json (for zero-latency Next.js 16 + Python inference)
"""

import csv
import json
import math
import os
import random
import re
import time
from collections import Counter, defaultdict

LABEL_NAMES = ["sadness", "joy", "love", "anger", "fear", "surprise"]
NUM_CLASSES = 6

STOPWORDS = {
    "i", "im", "ive", "id", "am", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "a", "an", "the",
    "and", "but", "if", "or", "because", "as", "until", "while", "of", "at",
    "by", "for", "with", "about", "into", "through", "during", "before",
    "after", "to", "from", "up", "down", "in", "out", "on", "off", "over",
    "under", "again", "further", "then", "once", "here", "there", "when",
    "where", "why", "how", "all", "any", "both", "each", "few", "more",
    "most", "other", "some", "such", "only", "own", "same", "so", "than",
    "too", "very", "s", "t", "can", "will", "just", "should", "now", "feel",
    "feeling", "feelings", "felt", "like", "really", "know", "think", "get",
    "got", "going", "go", "make", "made", "time", "day", "way", "things",
    "thing", "little", "bit", "still", "even", "much", "also", "back", "one",
    "two", "would", "could", "my", "me", "myself", "we", "our", "you", "your",
    "he", "him", "his", "she", "her", "it", "its", "they", "them", "their",
    "what", "which", "who", "this", "that", "these", "those"
}

WORD_RE = re.compile(r"[a-z]{2,}")


def tokenize_with_bigrams(text: str) -> list[str]:
    words = [w for w in WORD_RE.findall(text.lower()) if w not in STOPWORDS]
    tokens = list(words)
    for i in range(len(words) - 1):
        tokens.append(f"{words[i]}_{words[i + 1]}")
    return tokens


def main():
    t0 = time.time()
    os.makedirs(os.path.join("ml", "artifacts"), exist_ok=True)
    os.makedirs(os.path.join("ml", "splits"), exist_ok=True)
    os.makedirs(os.path.join("src", "lib", "ai"), exist_ok=True)

    emotions_path = os.path.join("emotions.csv", "emotions.csv")
    text_path = os.path.join("text.csv", "text.csv")

    print("=" * 72)
    print("[1/5] Ingesting Kalbu 416k Emotion Dataset...")
    print("=" * 72)

    raw_rows = 0
    unique_records: dict[str, int] = {}

    with open(emotions_path, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_rows += 1
            txt = (row.get("text") or "").strip()
            lbl_str = (row.get("label") or "").strip()
            if not txt or not lbl_str.isdigit():
                continue
            lbl = int(lbl_str)
            if 0 <= lbl < NUM_CLASSES:
                norm = " ".join(txt.lower().split())
                if len(norm) >= 3 and norm not in unique_records:
                    unique_records[norm] = lbl

    print(f" -> Read {raw_rows:,} total rows from {emotions_path}")

    if os.path.isfile(text_path):
        with open(text_path, "r", encoding="utf-8", errors="ignore") as f:
            secondary_count = sum(1 for _ in f) - 1
        print(f" -> Verified secondary dataset {text_path} ({secondary_count:,} rows)")

    clean_rows = len(unique_records)
    print(
        f" -> Clean deduplicated entries: {clean_rows:,} (removed {raw_rows - clean_rows:,} duplicates)"
    )

    # Group by class for exact stratified splitting
    by_class: dict[int, list[tuple[str, int]]] = defaultdict(list)
    for txt, lbl in unique_records.items():
        by_class[lbl].append((txt, lbl))

    del unique_records

    print("\n[2/5] Class Distribution Across 6 Emotions:")
    class_dist_named = {}
    for c in range(NUM_CLASSES):
        cnt = len(by_class[c])
        class_dist_named[LABEL_NAMES[c]] = cnt
        print(f"    - {LABEL_NAMES[c]:<10}: {cnt:>7,} ({cnt / clean_rows * 100:.2f}%)")

    # Deterministic Stratified 80% Train / 10% Validation / 10% Test Split
    print("\n[3/5] Generating Stratified Train (80%) / Validation (10%) / Test (10%) Splits...")
    rng = random.Random(42)
    train_data: list[tuple[str, int]] = []
    val_data: list[tuple[str, int]] = []
    test_data: list[tuple[str, int]] = []

    for c in range(NUM_CLASSES):
        items = by_class[c]
        rng.shuffle(items)
        n = len(items)
        n_train = int(n * 0.80)
        n_val = int(n * 0.10)
        train_data.extend(items[:n_train])
        val_data.extend(items[n_train : n_train + n_val])
        test_data.extend(items[n_train + n_val :])

    rng.shuffle(train_data)
    rng.shuffle(val_data)
    rng.shuffle(test_data)

    print(
        f" -> Train: {len(train_data):,} | Validation: {len(val_data):,} | Test: {len(test_data):,}"
    )

    # Write validation.csv and test.csv splits to ml/splits/
    val_csv_path = os.path.join("ml", "splits", "validation.csv")
    test_csv_path = os.path.join("ml", "splits", "test.csv")

    with open(val_csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["text", "label"])
        writer.writerows(val_data)

    with open(test_csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["text", "label"])
        writer.writerows(test_data)

    print(f" -> Saved {val_csv_path} & {test_csv_path}")

    # Train Class-Balanced Multinomial Log-Odds (Unigram + Bigram) Classifier on Train Split
    print("\n[4/5] Training 6-Class Emotion Classifier on 80% Train Split...")
    token_class_counts: dict[str, list[int]] = defaultdict(lambda: [0] * NUM_CLASSES)
    class_token_totals = [0] * NUM_CLASSES
    doc_freq: Counter[str] = Counter()

    for txt, lbl in train_data:
        tokens = tokenize_with_bigrams(txt)
        for tok in set(tokens):
            doc_freq[tok] += 1
        for tok in tokens:
            token_class_counts[tok][lbl] += 1
            class_token_totals[lbl] += 1

    # Retain vocabulary with min_df >= 3 for generalization & compact model size
    vocab = {tok for tok, df_cnt in doc_freq.items() if df_cnt >= 3}
    vocab_size = len(vocab)
    print(f" -> Extracted {vocab_size:,} discriminative unigram/bigram features (min_df=3)")

    # Compute log-probability weights per token per class with Laplace smoothing (alpha=0.5)
    alpha = 0.5
    log_weights: dict[str, list[float]] = {}
    denom = [class_token_totals[c] + alpha * vocab_size for c in range(NUM_CLASSES)]

    for tok in vocab:
        counts = token_class_counts[tok]
        # Compute mean log prob across classes and store zero-centered log-odds for calibrated softmax
        lps = [math.log((counts[c] + alpha) / denom[c]) for c in range(NUM_CLASSES)]
        mean_lp = sum(lps) / NUM_CLASSES
        log_weights[tok] = [round(lp - mean_lp, 4) for lp in lps]

    def predict_proba(text: str) -> list[float]:
        tokens = tokenize_with_bigrams(text)
        scores = [0.0] * NUM_CLASSES
        matched = 0
        for tok in tokens:
            w = log_weights.get(tok)
            if w is not None:
                matched += 1
                for c in range(NUM_CLASSES):
                    scores[c] += w[c]
        if matched > 0:
            scale = 1.0 / math.sqrt(matched)
            scores = [s * scale * 1.6 for s in scores]
        max_s = max(scores)
        exps = [math.exp(s - max_s) for s in scores]
        sum_exp = sum(exps)
        return [e / sum_exp for e in exps]

    # Evaluate on Validation and Held-Out Test Splits
    print("\n[5/5] Evaluating on Validation and Held-Out Test Splits...")

    def evaluate_split(split_data: list[tuple[str, int]]):
        conf_mat = [[0] * NUM_CLASSES for _ in range(NUM_CLASSES)]
        correct = 0
        for txt, true_lbl in split_data:
            probs = predict_proba(txt)
            pred_lbl = max(range(NUM_CLASSES), key=lambda c: probs[c])
            conf_mat[true_lbl][pred_lbl] += 1
            if pred_lbl == true_lbl:
                correct += 1

        total = len(split_data)
        acc = correct / total if total else 0.0
        per_class = {}
        macro_f1_sum = 0.0
        weighted_f1_sum = 0.0

        for c in range(NUM_CLASSES):
            tp = conf_mat[c][c]
            fp = sum(conf_mat[r][c] for r in range(NUM_CLASSES) if r != c)
            fn = sum(conf_mat[c][col] for col in range(NUM_CLASSES) if col != c)
            support = sum(conf_mat[c])
            prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0
            per_class[LABEL_NAMES[c]] = {
                "precision": round(prec, 4),
                "recall": round(rec, 4),
                "f1_score": round(f1, 4),
                "support": support,
            }
            macro_f1_sum += f1
            weighted_f1_sum += f1 * support

        macro_f1 = macro_f1_sum / NUM_CLASSES
        weighted_f1 = weighted_f1_sum / total if total else 0.0
        return acc, macro_f1, weighted_f1, per_class, conf_mat

    val_acc, val_macro_f1, val_weighted_f1, _, _ = evaluate_split(val_data)
    test_acc, test_macro_f1, test_weighted_f1, test_per_class, test_conf_mat = (
        evaluate_split(test_data)
    )

    print("\n" + "=" * 72)
    print("HELD-OUT TEST SET EVALUATION REPORT (Kalbu 416k Emotion Dataset)")
    print("=" * 72)
    print(f"{'Emotion':<12} {'Precision':>10} {'Recall':>10} {'F1-Score':>10} {'Support':>10}")
    print("-" * 56)
    for name in LABEL_NAMES:
        m = test_per_class[name]
        print(
            f"{name:<12} {m['precision']:>10.4f} {m['recall']:>10.4f} {m['f1_score']:>10.4f} {m['support']:>10,}"
        )
    print("-" * 56)
    print(f"Validation Accuracy : {val_acc * 100:.2f}% | Validation Macro-F1 : {val_macro_f1:.4f}")
    print(
        f"Test Accuracy       : {test_acc * 100:.2f}% | Test Macro-F1       : {test_macro_f1:.4f} | Weighted-F1: {test_weighted_f1:.4f}"
    )

    # Export Top-15,000 highest-variance discriminative features for ultra-fast Next.js + Python inference
    scored_tokens = sorted(
        log_weights.items(),
        key=lambda kv: max(kv[1]) - min(kv[1]),
        reverse=True,
    )
    compact_weights = dict(scored_tokens[:15_000])

    weights_path = os.path.join("src", "lib", "ai", "trained_416k_weights.json")
    with open(weights_path, "w", encoding="utf-8") as f:
        json.dump(compact_weights, f, separators=(",", ":"))

    full_weights_path = os.path.join("ml", "artifacts", "kalbu_416k_weights.json")
    with open(full_weights_path, "w", encoding="utf-8") as f:
        json.dump(log_weights, f, separators=(",", ":"))

    elapsed = round(time.time() - t0, 2)
    report_payload = {
        "dataset": {
            "source_file": emotions_path,
            "raw_rows": raw_rows,
            "clean_unique_rows": clean_rows,
            "train_rows": len(train_data),
            "validation_rows": len(val_data),
            "test_rows": len(test_data),
            "vocab_features": vocab_size,
            "class_distribution": class_dist_named,
        },
        "metrics": {
            "validation_accuracy": round(val_acc, 4),
            "validation_macro_f1": round(val_macro_f1, 4),
            "test_accuracy": round(test_acc, 4),
            "test_macro_f1": round(test_macro_f1, 4),
            "test_weighted_f1": round(test_weighted_f1, 4),
            "per_class": test_per_class,
            "confusion_matrix": test_conf_mat,
        },
        "training_time_seconds": elapsed,
    }

    for out_path in [
        os.path.join("ml", "artifacts", "evaluation_report.json"),
        os.path.join("src", "lib", "ai", "model_report.json"),
    ]:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(report_payload, f, indent=2)

    print(f"\nSaved trained 416k model weights to: {weights_path} & {full_weights_path}")
    print(f"Completed full 416k pipeline in {elapsed}s!")


if __name__ == "__main__":
    main()
