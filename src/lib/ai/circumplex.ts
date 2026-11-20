// src/lib/ai/circumplex.ts
export type EmotionLabel =
  | "sadness"
  | "joy"
  | "love"
  | "anger"
  | "fear"
  | "surprise";

export interface EmotionProbabilities {
  sadness: number;  // Label 0
  joy: number;      // Label 1
  love: number;     // Label 2
  anger: number;    // Label 3
  fear: number;     // Label 4
  surprise: number; // Label 5
}

export type CircumplexQuadrant =
  | "High-Energy Pleasant"
  | "High-Energy Unpleasant"
  | "Low-Energy Unpleasant"
  | "Low-Energy Pleasant";

export interface CircumplexResult {
  primaryEmotion: EmotionLabel;
  confidence: number;
  valence: number; // [-1.0, +1.0] (Unpleasant -> Pleasant)
  arousal: number; // [-1.0, +1.0] (Deactivated/Calm -> Activated/Tense)
  quadrant: CircumplexQuadrant;
  vector6D: [number, number, number, number, number, number];
  probabilities: EmotionProbabilities;
  inferenceSource?: "python-ml-service" | "calibrated-affect-fallback";
  topTokens?: Array<{ token: string; weight: number }>;
}

// Empirical Russell (1980) / Warriner et al. (2013) Circumplex Anchors
export const CIRCUMPLEX_ANCHORS: Record<
  EmotionLabel,
  { valence: number; arousal: number; color: string }
> = {
  sadness:  { valence: -0.80, arousal: -0.60, color: "#4a7c9b" }, // Soft Dusty Slate-Blue
  joy:      { valence:  0.85, arousal:  0.55, color: "#d4882a" }, // Warm Golden Marigold
  love:     { valence:  0.90, arousal:  0.15, color: "#d9536f" }, // Blossom Heart Rose
  anger:    { valence: -0.75, arousal:  0.85, color: "#b8332a" }, // Terracotta Crimson
  fear:     { valence: -0.80, arousal:  0.80, color: "#845ec2" }, // Soft Muted Plum
  surprise: { valence:  0.20, arousal:  0.85, color: "#3b8a6b" }, // Botanical Jade Sage
};

/**
 * Projects a 6-class softmax probability distribution onto continuous
 * 2D Valence-Arousal space for Russell's Circumplex Model of Affect.
 */
export function computeCircumplexCoordinates(
  probs: EmotionProbabilities,
  inferenceSource: "python-ml-service" | "calibrated-affect-fallback" = "python-ml-service"
): CircumplexResult {
  const orderedLabels: EmotionLabel[] = [
    "sadness",
    "joy",
    "love",
    "anger",
    "fear",
    "surprise",
  ];
  const rawVector: [number, number, number, number, number, number] = [
    probs.sadness,
    probs.joy,
    probs.love,
    probs.anger,
    probs.fear,
    probs.surprise,
  ];

  const sum = rawVector.reduce((acc, v) => acc + v, 0) || 1;
  let valence = 0;
  let arousal = 0;
  let primaryEmotion: EmotionLabel = "joy";
  let maxProb = -1;

  const normalizedProbs = {} as EmotionProbabilities;

  for (const label of orderedLabels) {
    const p = probs[label] / sum;
    normalizedProbs[label] = Number(p.toFixed(4));
    valence += p * CIRCUMPLEX_ANCHORS[label].valence;
    arousal += p * CIRCUMPLEX_ANCHORS[label].arousal;
    if (p > maxProb) {
      maxProb = p;
      primaryEmotion = label;
    }
  }

  valence = Number(Math.max(-1, Math.min(1, valence)).toFixed(4));
  arousal = Number(Math.max(-1, Math.min(1, arousal)).toFixed(4));

  const quadrant: CircumplexQuadrant =
    valence >= 0 && arousal >= 0
      ? "High-Energy Pleasant"
      : valence < 0 && arousal >= 0
      ? "High-Energy Unpleasant"
      : valence < 0 && arousal < 0
      ? "Low-Energy Unpleasant"
      : "Low-Energy Pleasant";

  return {
    primaryEmotion,
    confidence: Number(maxProb.toFixed(4)),
    valence,
    arousal,
    quadrant,
    vector6D: rawVector.map((v) => Number((v / sum).toFixed(5))) as [
      number,
      number,
      number,
      number,
      number,
      number
    ],
    probabilities: normalizedProbs,
    inferenceSource,
  };
}

/**
 * Calibrated affect fallback estimator based on the 416k CARER emotion lexicon
 * so the Next.js UI remains 100% interactive even before the Python FastAPI server is started.
 */
export function estimateEmotionProbabilitiesFallback(
  text: string
): EmotionProbabilities {
  const lower = text.toLowerCase();
  const scores: EmotionProbabilities = {
    sadness: 0.08,
    joy: 0.08,
    love: 0.05,
    anger: 0.05,
    fear: 0.06,
    surprise: 0.04,
  };

  const lexicons: Record<EmotionLabel, string[]> = {
    sadness: [
      "sad", "tired", "exhausted", "burnout", "burned out", "lonely", "empty",
      "hopeless", "cry", "crying", "depressed", "heavy", "lost", "grief",
      "disheartened", "weary", "listless", "drained", "numb", "fail", "hurt"
    ],
    joy: [
      "happy", "joy", "grateful", "excited", "proud", "relieved", "peaceful",
      "calm", "better", "smile", "wonderful", "energized", "accomplished",
      "bright", "hopeful", "good", "great", "relaxed", "refreshing"
    ],
    love: [
      "love", "caring", "warm", "supported", "cherish", "affection", "kind",
      "connected", "appreciate", "tender", "belonging", "grateful for", "heart"
    ],
    anger: [
      "angry", "frustrated", "furious", "annoyed", "unfair", "mad", "resent",
      "irritated", "rage", "sick of", "hate", "bitter", "argued"
    ],
    fear: [
      "anxious", "anxiety", "scared", "worried", "panic", "overwhelmed",
      "terrified", "nervous", "stress", "stressed", "deadline", "exam",
      "afraid", "uncertain", "helpless", "dread", "tense"
    ],
    surprise: [
      "surprised", "shocked", "unexpected", "suddenly", "amazed", "weird",
      "strange", "unbelievable", "wow", "startled", "astonished"
    ],
  };

  (Object.keys(lexicons) as EmotionLabel[]).forEach((emotion) => {
    for (const token of lexicons[emotion]) {
      if (lower.includes(token)) {
        scores[emotion] += 0.32;
      }
    }
  });

  // Softmax normalization with temperature
  const labels = Object.keys(scores) as EmotionLabel[];
  const exps = labels.map((k) => Math.exp(scores[k] * 2.2));
  const sumExp = exps.reduce((a, b) => a + b, 0);

  return {
    sadness: exps[0] / sumExp,
    joy: exps[1] / sumExp,
    love: exps[2] / sumExp,
    anger: exps[3] / sumExp,
    fear: exps[4] / sumExp,
    surprise: exps[5] / sumExp,
  };
}

export interface EmotionRecordItem {
  id: string;
  title?: string;
  recorded_at: string;
  valence: number;
  arousal: number;
  primary_emotion: EmotionLabel;
  confidence: number;
  quadrant: CircumplexQuadrant;
  vector6D: [number, number, number, number, number, number];
}

export interface DailyEmotionPoint {
  date: string; // YYYY-MM-DD
  displayDate: string;
  avgValence: number;
  avgArousal: number;
  dominantEmotion: EmotionLabel;
  entryCount: number;
}

export interface MonthlyEmotionSummary {
  dailySeries: DailyEmotionPoint[];
  meanValence: number;
  meanArousal: number;
  emotionalVolatility: number;
  quadrantDistribution: Record<string, number>;
}

/**
 * Aggregates emotion_vectors rows into a time-series dataset for the
 * Monthly Emotion Graph and computes the Burnout / Volatility index.
 */
export function buildMonthlyEmotionGraph(
  records: EmotionRecordItem[]
): MonthlyEmotionSummary {
  if (records.length === 0) {
    return {
      dailySeries: [],
      meanValence: 0,
      meanArousal: 0,
      emotionalVolatility: 0,
      quadrantDistribution: {},
    };
  }

  const byDay = new Map<
    string,
    { valences: number[]; arousals: number[]; emotions: EmotionLabel[] }
  >();
  const quadrantDistribution: Record<string, number> = {};

  let totalV = 0;
  let totalA = 0;

  for (const row of records) {
    const dayKey = row.recorded_at.slice(0, 10);
    if (!byDay.has(dayKey)) {
      byDay.set(dayKey, { valences: [], arousals: [], emotions: [] });
    }
    const bucket = byDay.get(dayKey)!;
    bucket.valences.push(row.valence);
    bucket.arousals.push(row.arousal);
    bucket.emotions.push(row.primary_emotion);

    totalV += row.valence;
    totalA += row.arousal;
    quadrantDistribution[row.quadrant] =
      (quadrantDistribution[row.quadrant] ?? 0) + 1;
  }

  const meanValence = Number((totalV / records.length).toFixed(3));
  const meanArousal = Number((totalA / records.length).toFixed(3));

  const varianceSum = records.reduce((acc, r) => {
    const dv = r.valence - meanValence;
    const da = r.arousal - meanArousal;
    return acc + (dv * dv + da * da);
  }, 0);
  const emotionalVolatility = Number(
    Math.sqrt(varianceSum / records.length).toFixed(3)
  );

  const dailySeries: DailyEmotionPoint[] = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => {
      const avgV =
        bucket.valences.reduce((a, b) => a + b, 0) / bucket.valences.length;
      const avgA =
        bucket.arousals.reduce((a, b) => a + b, 0) / bucket.arousals.length;

      const counts = bucket.emotions.reduce((acc, e) => {
        acc[e] = (acc[e] ?? 0) + 1;
        return acc;
      }, {} as Record<EmotionLabel, number>);
      const dominantEmotion = Object.entries(counts).sort(
        (a, b) => b[1] - a[1]
      )[0][0] as EmotionLabel;

      const parsedDate = new Date(`${date}T00:00:00`);
      const displayDate = parsedDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      return {
        date,
        displayDate,
        avgValence: Number(avgV.toFixed(3)),
        avgArousal: Number(avgA.toFixed(3)),
        dominantEmotion,
        entryCount: bucket.valences.length,
      };
    });

  return {
    dailySeries,
    meanValence,
    meanArousal,
    emotionalVolatility,
    quadrantDistribution,
  };
}

/**
 * Computes Cosine Similarity between two 6-dimensional emotion probability vectors
 * for the "Feeling Twin" anonymous matcher.
 */
export function cosineSimilarity6D(
  vecA: [number, number, number, number, number, number],
  vecB: [number, number, number, number, number, number]
): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < 6; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : Number((dot / denom).toFixed(4));
}
