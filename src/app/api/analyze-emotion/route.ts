// src/app/api/analyze-emotion/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  computeCircumplexCoordinates,
  EmotionLabel,
  EmotionProbabilities,
  estimateEmotionProbabilitiesFallback,
} from "@/lib/ai/circumplex";

const ML_SERVICE_URL =
  process.env.KALBU_ML_SERVICE_URL || "http://127.0.0.1:8000/predict";

const STOPWORDS = new Set([
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
  "what", "which", "who", "this", "that", "these", "those",
]);

let cached416kWeights: Record<string, number[]> | null = null;

function getTrained416kWeights(): Record<string, number[]> | null {
  if (cached416kWeights) return cached416kWeights;
  try {
    const weightsPath = path.join(
      process.cwd(),
      "src",
      "lib",
      "ai",
      "trained_416k_weights.json"
    );
    if (fs.existsSync(weightsPath)) {
      const raw = fs.readFileSync(weightsPath, "utf-8");
      cached416kWeights = JSON.parse(raw) as Record<string, number[]>;
      return cached416kWeights;
    }
  } catch (err) {
    console.warn("[Kalbu AI] Could not load trained_416k_weights.json:", err);
  }
  return null;
}

function predictWithTrained416kWeights(
  text: string,
  weights: Record<string, number[]>
): {
  probs: EmotionProbabilities;
  topTokens: Array<{ token: string; weight: number }>;
} | null {
  const words = (text.toLowerCase().match(/[a-z]{2,}/g) || []).filter(
    (w) => !STOPWORDS.has(w)
  );
  const tokens = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]}_${words[i + 1]}`);
  }

  const scores = [0, 0, 0, 0, 0, 0];
  let matched = 0;
  const matchedTokenVectors: Array<{ token: string; vec: number[] }> = [];

  for (const tok of tokens) {
    const w = weights[tok];
    if (w && w.length === 6) {
      matched++;
      matchedTokenVectors.push({ token: tok, vec: w });
      for (let c = 0; c < 6; c++) {
        scores[c] += w[c];
      }
    }
  }

  if (matched === 0) return null;

  const scale = (1.0 / Math.sqrt(matched)) * 1.6;
  const scaled = scores.map((s) => s * scale);
  const maxS = Math.max(...scaled);
  const winningClassIdx = scaled.indexOf(maxS);
  const exps = scaled.map((s) => Math.exp(s - maxS));
  const sumExp = exps.reduce((a, b) => a + b, 0) || 1;

  const labels: EmotionLabel[] = [
    "sadness",
    "joy",
    "love",
    "anger",
    "fear",
    "surprise",
  ];
  const probs = {} as EmotionProbabilities;
  labels.forEach((lbl, idx) => {
    probs[lbl] = exps[idx] / sumExp;
  });

  // Explainable AI (XAI): Rank unique matched unigrams/bigrams for winning emotion class
  const uniqueMap = new Map<string, number>();
  for (const item of matchedTokenVectors) {
    const wVal = item.vec[winningClassIdx];
    if (wVal > 0) {
      uniqueMap.set(item.token, Math.max(uniqueMap.get(item.token) ?? 0, wVal));
    }
  }

  const topTokens = Array.from(uniqueMap.entries())
    .map(([token, weight]) => ({
      token: token.replace("_", " "),
      weight: Number(weight.toFixed(3)),
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  return { probs, topTokens };
}

export async function POST(req: NextRequest) {
  try {
    const { plaintext } = (await req.json()) as { plaintext?: string };

    if (!plaintext || plaintext.trim().length < 5) {
      return NextResponse.json(
        {
          error:
            "Journal entry must contain at least 5 characters for emotion analysis.",
        },
        { status: 400 }
      );
    }

    // Priority 1: External Python FastAPI / Transformer service if running
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);

      const mlResponse = await fetch(ML_SERVICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: plaintext }),
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (mlResponse.ok) {
        const { probabilities } = (await mlResponse.json()) as {
          probabilities: EmotionProbabilities;
        };
        const circumplex = computeCircumplexCoordinates(
          probabilities,
          "python-ml-service"
        );
        return NextResponse.json({ circumplex }, { status: 200 });
      }
    } catch {
      // Fall through to local 416k trained model artifact
    }

    // Priority 2: Direct inference using the trained 416k unigram/bigram weights (88.95% Test Acc)
    const weights = getTrained416kWeights();
    if (weights) {
      const pred416k = predictWithTrained416kWeights(plaintext, weights);
      if (pred416k) {
        const circumplex = computeCircumplexCoordinates(
          pred416k.probs,
          "python-ml-service"
        );
        circumplex.topTokens = pred416k.topTokens;
        return NextResponse.json({ circumplex }, { status: 200 });
      }
    }

    // Priority 3: Lexicon fallback
    const fallbackProbs = estimateEmotionProbabilitiesFallback(plaintext);
    const circumplex = computeCircumplexCoordinates(
      fallbackProbs,
      "calibrated-affect-fallback"
    );

    return NextResponse.json({ circumplex }, { status: 200 });
  } catch (error) {
    console.error("[Kalbu Emotion Inference Error]:", error);
    return NextResponse.json(
      { error: "Failed to analyze emotion vector." },
      { status: 500 }
    );
  }
}
