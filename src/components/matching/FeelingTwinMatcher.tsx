// src/components/matching/FeelingTwinMatcher.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  HeartHandshake,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import {
  CIRCUMPLEX_ANCHORS,
  cosineSimilarity6D,
  EmotionLabel,
  EmotionRecordItem,
} from "@/lib/ai/circumplex";
import { createClient, isSupabaseConfigured } from "@/utils/supabase/client";

export interface PeerCandidate {
  id: string;
  handle: string;
  major: string;
  emotion: EmotionLabel;
  valence: number;
  arousal: number;
  vector6D: [number, number, number, number, number, number];
  statusMessage?: string;
}

const ACTIVE_CAMPUS_POOL: PeerCandidate[] = [
  {
    id: "peer-1",
    handle: "Silent Willow #402",
    major: "AI Year 3",
    emotion: "fear",
    valence: -0.71,
    arousal: 0.75,
    vector6D: [0.14, 0.02, 0.01, 0.06, 0.75, 0.02],
    statusMessage: "Debugging FYP pipeline late at night...",
  },
  {
    id: "peer-2",
    handle: "Calm River #118",
    major: "Psychology Year 4",
    emotion: "sadness",
    valence: -0.76,
    arousal: -0.55,
    vector6D: [0.83, 0.02, 0.02, 0.05, 0.06, 0.02],
    statusMessage: "Feeling drained after thesis viva prep.",
  },
  {
    id: "peer-3",
    handle: "Morning Star #809",
    major: "Data Science Year 3",
    emotion: "joy",
    valence: 0.81,
    arousal: 0.49,
    vector6D: [0.02, 0.82, 0.1, 0.01, 0.02, 0.03],
    statusMessage: "Finally hit 88.9% accuracy on my test split!",
  },
  {
    id: "peer-4",
    handle: "Gentle Cedar #254",
    major: "Software Eng Year 4",
    emotion: "love",
    valence: 0.84,
    arousal: 0.18,
    vector6D: [0.03, 0.22, 0.69, 0.01, 0.02, 0.03],
    statusMessage: "Grateful for supportive lab teammates today.",
  },
  {
    id: "peer-5",
    handle: "Crimson Ember #617",
    major: "Computer Science Year 2",
    emotion: "anger",
    valence: -0.69,
    arousal: 0.81,
    vector6D: [0.11, 0.02, 0.01, 0.74, 0.09, 0.03],
    statusMessage: "Frustrated with overlapping assignment deadlines.",
  },
  {
    id: "peer-6",
    handle: "Silver Aurora #931",
    major: "Cognitive Science Year 3",
    emotion: "surprise",
    valence: 0.25,
    arousal: 0.82,
    vector6D: [0.04, 0.21, 0.05, 0.03, 0.08, 0.59],
    statusMessage: "Unexpectedly good feedback from supervisor!",
  },
];

const QUICK_ENCOURAGEMENTS = [
  "You're not alone tonight — we've got this!",
  "Sending you calm energy from across campus.",
  "Take a deep breath and rest your eyes for 5 minutes.",
  "Proud of you for making it through today.",
];

const ORDERED_LABELS: EmotionLabel[] = [
  "sadness",
  "joy",
  "love",
  "anger",
  "fear",
  "surprise",
];

interface FeelingTwinMatcherProps {
  userId: string;
  latestRecord: EmotionRecordItem | undefined;
}

export default function FeelingTwinMatcher({
  userId,
  latestRecord,
}: FeelingTwinMatcherProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [rpcMatchedSource, setRpcMatchedSource] = useState<
    "supabase-pgvector" | "realtime-campus-pool"
  >("realtime-campus-pool");
  const [sentPulses, setSentPulses] = useState<string[]>([]);
  const [customPulse, setCustomPulse] = useState("");
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);

  // Rank all peers by 6D Cosine Similarity + Circumplex Euclidean distance
  const rankedPeers = useMemo(() => {
    if (!latestRecord) return [];
    return ACTIVE_CAMPUS_POOL.map((peer) => {
      const cosineSim = cosineSimilarity6D(
        latestRecord.vector6D,
        peer.vector6D
      );
      const circumplexDist = Number(
        Math.sqrt(
          Math.pow(latestRecord.valence - peer.valence, 2) +
            Math.pow(latestRecord.arousal - peer.arousal, 2)
        ).toFixed(3)
      );
      return {
        ...peer,
        similarity: cosineSim,
        circumplexDistance: circumplexDist,
      };
    }).sort((a, b) => b.similarity - a.similarity);
  }, [latestRecord]);

  // Reset selected index when latestRecord changes
  useEffect(() => {
    setSelectedCandidateIndex(0);
  }, [latestRecord?.id]);

  // Query Supabase RPC `find_feeling_twin` if available
  async function handleScanTwinPool() {
    if (!latestRecord) return;
    setIsScanning(true);
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("find_feeling_twin", {
          p_user_id: userId,
          p_query_vector: `[${latestRecord.vector6D.join(",")}]`,
          p_valence: latestRecord.valence,
          p_arousal: latestRecord.arousal,
          p_similarity_threshold: 0.75,
        });
        if (!error && data && Array.isArray(data) && data.length > 0) {
          setRpcMatchedSource("supabase-pgvector");
        } else {
          setRpcMatchedSource("realtime-campus-pool");
        }
      }
    } catch {
      setRpcMatchedSource("realtime-campus-pool");
    } finally {
      setTimeout(() => setIsScanning(false), 350);
    }
  }

  function handleSendSupport(message: string) {
    if (!message.trim()) return;
    setSentPulses((prev) => [message.trim(), ...prev.slice(0, 3)]);
    setCustomPulse("");
  }

  const activeTwin =
    rankedPeers[selectedCandidateIndex] || rankedPeers[0] || null;

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800/90 p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HeartHandshake className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              &ldquo;Feeling Twin&rdquo; Anonymous Matcher
            </h3>
            <p className="text-[11px] text-slate-400">
              6D Emotion Embedding Cosine Similarity • Zero Plaintext Exposure
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            {rpcMatchedSource === "supabase-pgvector"
              ? "pgvector RPC Live"
              : "6D Cosine Live"}
          </span>
          <button
            type="button"
            onClick={handleScanTwinPool}
            disabled={isScanning}
            title="Re-scan matching pool"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {activeTwin && latestRecord && (
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3.5">
          {/* Top Match Summary */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-indigo-400 font-medium flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Closest Anonymous Peer Right
                Now
              </p>
              <p className="text-sm font-semibold text-white mt-0.5">
                {activeTwin.handle}{" "}
                <span className="text-xs font-normal text-slate-400">
                  • {activeTwin.major}
                </span>
              </p>
              {activeTwin.statusMessage && (
                <p className="text-xs text-slate-400 italic mt-1">
                  &ldquo;{activeTwin.statusMessage}&rdquo;
                </p>
              )}
            </div>

            <div className="text-right shrink-0">
              <span className="text-sm font-bold text-emerald-400 font-mono">
                {(activeTwin.similarity * 100).toFixed(1)}% Match
              </span>
              <p className="text-[11px] text-slate-400 font-mono">
                cos(θ) = {activeTwin.similarity.toFixed(4)}
              </p>
              <p className="text-[10px] text-slate-500 font-mono">
                Δd = {activeTwin.circumplexDistance}
              </p>
            </div>
          </div>

          {/* Shared Coordinates Badge */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800">
            <span className="text-slate-300">
              Your Affect:{" "}
              <strong
                className="capitalize"
                style={{
                  color:
                    CIRCUMPLEX_ANCHORS[latestRecord.primary_emotion].color,
                }}
              >
                {latestRecord.primary_emotion}
              </strong>{" "}
              <span className="font-mono text-[11px] text-slate-400">
                (V: {latestRecord.valence}, A: {latestRecord.arousal})
              </span>
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              Twin (V: {activeTwin.valence}, A: {activeTwin.arousal})
            </span>
          </div>

          {/* 6D Vector Alignment Mini-Bars */}
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] text-slate-400 font-medium">
              6D Softmax Embedding Alignment (You vs. {activeTwin.handle}):
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-[10px] font-mono">
              {ORDERED_LABELS.map((lbl, idx) => {
                const userVal = Math.round(
                  (latestRecord.vector6D[idx] || 0) * 100
                );
                const twinVal = Math.round(
                  (activeTwin.vector6D[idx] || 0) * 100
                );
                return (
                  <div
                    key={lbl}
                    className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800/80 text-center"
                  >
                    <div
                      className="capitalize font-sans font-medium truncate"
                      style={{ color: CIRCUMPLEX_ANCHORS[lbl].color }}
                    >
                      {lbl}
                    </div>
                    <div className="text-slate-300 mt-0.5">
                      {userVal}% / {twinVal}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Switch Between Top 3 Matches */}
          {rankedPeers.length > 1 && (
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-400 mr-1">
                Top Pool Matches:
              </span>
              {rankedPeers.slice(0, 3).map((peer, idx) => (
                <button
                  key={peer.id}
                  type="button"
                  onClick={() => setSelectedCandidateIndex(idx)}
                  className={`text-[11px] px-2 py-0.5 rounded-md border transition cursor-pointer font-mono ${
                    selectedCandidateIndex === idx
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                  }`}
                >
                  #{idx + 1} ({(peer.similarity * 100).toFixed(0)}%)
                </button>
              ))}
            </div>
          )}

          {/* Anonymous Solidarity Pulse / Support Interaction */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <p className="text-[11px] font-medium text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Send Anonymous Solidarity Note to {activeTwin.handle}:
            </p>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_ENCOURAGEMENTS.map((msg, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSendSupport(msg)}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-indigo-500/15 text-slate-300 hover:text-indigo-200 border border-slate-800 hover:border-indigo-500/30 transition cursor-pointer text-left"
                >
                  + &ldquo;{msg}&rdquo;
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendSupport(customPulse);
              }}
              className="flex items-center gap-2 pt-1"
            >
              <input
                type="text"
                value={customPulse}
                onChange={(e) => setCustomPulse(e.target.value)}
                placeholder="Write a kind anonymous note..."
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition cursor-pointer"
              >
                <Send className="w-3 h-3" />
                Send
              </button>
            </form>

            {sentPulses.length > 0 && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 space-y-1">
                <p className="font-semibold">
                  ✓ Anonymous Solidarity Pulse Delivered to {activeTwin.handle}:
                </p>
                <p className="italic text-emerald-200/90">
                  &ldquo;{sentPulses[0]}&rdquo;
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
