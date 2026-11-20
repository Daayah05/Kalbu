// src/components/diary/SecureJournalEditor.tsx
"use client";

import React, { useState } from "react";
import {
  AlertOctagon,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { encryptDiaryEntry, EncryptedPayload } from "@/lib/crypto/e2ee";
import { CircumplexResult, CIRCUMPLEX_ANCHORS } from "@/lib/ai/circumplex";
import { createClient, isSupabaseConfigured } from "@/utils/supabase/client";

export interface SavedEncryptedEntry {
  id: string;
  encrypted: EncryptedPayload;
  wordCount: number;
  recordedAt: string;
  circumplex: CircumplexResult;
  optedIntoTwin: boolean;
}

interface ViolationAlertData {
  strikes: number;
  isBanned: boolean;
  incidentId: string;
  timestamp: string;
  ipAddress: string;
  flaggedKeywords: string[];
  newlyBannedContextWords?: string[];
}

interface SecureJournalEditorProps {
  userId: string;
  cryptoKey: CryptoKey | null;
  onEntrySaved: (entry: SavedEncryptedEntry) => void;
}

export default function SecureJournalEditor({
  userId,
  cryptoKey,
  onEntrySaved,
}: SecureJournalEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [findTwin, setFindTwin] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastResult, setLastResult] = useState<CircumplexResult | null>(null);
  const [lastCipherPreview, setLastCipherPreview] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  // 18+ Moderation Warning Popup & Account Ban State (only pops out upon violation)
  const [violationModal, setViolationModal] =
    useState<ViolationAlertData | null>(null);
  const [isAccountBanned, setIsAccountBanned] = useState(false);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  async function handleResetDemoBan() {
    try {
      await fetch("/api/moderation/check-confession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, resetForDemo: true }),
      });
      setIsAccountBanned(false);
      setViolationModal(null);
      setError(null);
    } catch {
      // Ignore error
    }
  }

  async function handleSaveEntry(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isAccountBanned) {
      return;
    }

    if (!cryptoKey) {
      setError("Please unlock your private encryption key first.");
      return;
    }

    if (content.trim().length < 10) {
      setError("Write at least a sentence so Kalbu can map your affect state.");
      return;
    }

    setIsSaving(true);
    try {
      // Step 0: 18+ / Explicit Content Guardrail Check
      const modRes = await fetch("/api/moderation/check-confession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          title: title.trim(),
          content: content.trim(),
        }),
      });

      const modData = await modRes.json();

      if (!modData.allowed) {
        // Confession is BLOCKED and logged in the Restricted Forensic Database
        const alertPayload: ViolationAlertData = {
          strikes: modData.strikes ?? 1,
          isBanned: Boolean(modData.isBanned),
          incidentId: modData.incidentId || `INC-${Date.now()}`,
          timestamp: modData.timestamp || new Date().toISOString(),
          ipAddress: modData.ipAddress || "Logged Client IP",
          flaggedKeywords: modData.flaggedKeywords || ["18+ Restricted Content"],
          newlyBannedContextWords: modData.newlyBannedContextWords || [],
        };

        setViolationModal(alertPayload);
        if (alertPayload.isBanned) {
          setIsAccountBanned(true);
        }

        // Clear the offending draft so it is never posted
        setTitle("");
        setContent("");
        setIsSaving(false);
        return;
      }

      // Step 1: Stateless in-memory emotion & Circumplex analysis
      const analysisRes = await fetch("/api/analyze-emotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plaintext: `${title}. ${content}` }),
      });

      if (!analysisRes.ok) {
        throw new Error("Could not compute emotion vector.");
      }

      const { circumplex }: { circumplex: CircumplexResult } =
        await analysisRes.json();

      // Step 2: Client-side AES-GCM-256 encryption (Zero-Knowledge storage)
      const encrypted = await encryptDiaryEntry(
        { title: title.trim() || "Untitled Reflection", content },
        cryptoKey
      );
      setLastCipherPreview(encrypted.ciphertext.slice(0, 44) + "...");

      let entryId = crypto.randomUUID();
      const recordedAt = new Date().toISOString();

      // Step 3: Persist to Supabase if configured
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const { data: entryRow, error: entryErr } = await supabase
          .from("encrypted_diary_entries")
          .insert({
            user_id: userId,
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            word_count: wordCount,
          })
          .select("id, recorded_at")
          .single();

        if (!entryErr && entryRow) {
          entryId = entryRow.id;
          const { data: vectorRow } = await supabase
            .from("emotion_vectors")
            .insert({
              entry_id: entryRow.id,
              user_id: userId,
              primary_emotion: circumplex.primaryEmotion,
              confidence: circumplex.confidence,
              valence: circumplex.valence,
              arousal: circumplex.arousal,
              emotion_probs: `[${circumplex.vector6D.join(",")}]`,
            })
            .select("id")
            .single();

          if (findTwin && vectorRow) {
            await supabase.from("matching_pool").upsert({
              user_id: userId,
              emotion_vector_id: vectorRow.id,
              emotion_probs: `[${circumplex.vector6D.join(",")}]`,
              valence: circumplex.valence,
              arousal: circumplex.arousal,
              primary_emotion: circumplex.primaryEmotion,
              status: "searching",
            });
          }
        }
      }

      setLastResult(circumplex);
      onEntrySaved({
        id: entryId,
        encrypted,
        wordCount,
        recordedAt,
        circumplex,
        optedIntoTwin: findTwin,
      });

      setTitle("");
      setContent("");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to save encrypted entry.";
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="relative rounded-2xl bg-slate-900/90 border border-slate-800/90 p-6 shadow-xl text-slate-100">
      {/* ===================================================================== */}
      {/* SERIOUS 18+ VIOLATION POP-OUT WARNING MODAL (ONLY SHOWS ON VIOLATION) */}
      {/* ===================================================================== */}
      {violationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div
            className="max-w-xl w-full rounded-3xl border-4 p-6 sm:p-7 shadow-2xl space-y-5"
            style={{
              backgroundColor: "#450a0a",
              borderColor: "#ef4444",
              color: "#fef2f2",
            }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border-2"
                style={{
                  backgroundColor: "#7f1d1d",
                  borderColor: "#f87171",
                  color: "#fecaca",
                }}
              >
                <AlertOctagon className="w-8 h-8 animate-pulse" />
              </div>
              <div className="space-y-1">
                <span
                  className="inline-block text-xs font-mono font-bold uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{
                    backgroundColor: "#dc2626",
                    color: "#ffffff",
                  }}
                >
                  {violationModal.isBanned
                    ? "STRIKE 2 OF 2 • PERMANENT ACCOUNT BAN"
                    : "STRIKE 1 OF 2 • SERIOUS SECURITY VIOLATION"}
                </span>
                <h3
                  className="text-xl font-bold leading-snug pt-1"
                  style={{ color: "#ffffff" }}
                >
                  {violationModal.isBanned
                    ? "ACCOUNT BANNED: 2nd Attempt 18+ / Sexual Confession Violation"
                    : "WARNING: 18+ / Sexually Explicit Content is Strictly Prohibited"}
                </h3>
              </div>
            </div>

            <div
              className="p-4 rounded-2xl border space-y-3 text-sm leading-relaxed"
              style={{
                backgroundColor: "#7f1d1d",
                borderColor: "#b91c1c",
                color: "#fee2e2",
              }}
            >
              <p className="font-bold" style={{ color: "#ffffff" }}>
                Your confession has been BLOCKED and was NOT posted to Kalbu.
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
                <li>
                  <strong>Zero-Tolerance 18+ Policy:</strong> Kalbu is a safe
                  emotional sanctuary. Any 18+, sexual, or explicit confessions
                  are strictly forbidden.
                </li>
                <li>
                  <strong>Banned Words Updated:</strong> The flagged words (
                  <span className="font-mono font-bold underline">
                    {violationModal.flaggedKeywords.join(", ")}
                  </span>
                  ) and related phrases are strictly prohibited on this website.
                </li>
                <li>
                  <strong>2nd Attempt Policy:</strong> Continuing to submit
                  restricted 18+ content will result in an immediate permanent
                  account ban on your 2nd attempt.
                </li>
              </ul>
            </div>

            <div
              className="p-4 rounded-2xl border-2 text-center font-bold text-sm sm:text-base"
              style={{
                backgroundColor: "#991b1b",
                borderColor: "#fca5a5",
                color: "#ffffff",
              }}
            >
              {violationModal.isBanned
                ? "🚫 YOUR ACCOUNT HAS NOW BEEN PERMANENTLY BANNED FROM USING THIS WEBSITE (2ND ATTEMPT)."
                : "⚠️ FINAL WARNING: Your account will be permanently BANNED from using this website on your 2nd attempt."}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={handleResetDemoBan}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition cursor-pointer opacity-80 hover:opacity-100"
                style={{
                  backgroundColor: "#450a0a",
                  borderColor: "#b91c1c",
                  color: "#fca5a5",
                }}
                title="For FYP Presentation: Reset strike counter to 0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                FYP Demo: Reset Strikes
              </button>

              <button
                type="button"
                onClick={() => setViolationModal(null)}
                className="px-6 py-2.5 rounded-xl font-bold text-sm transition cursor-pointer shadow-lg"
                style={{
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                }}
              >
                {violationModal.isBanned
                  ? "Close Alert (Account Locked)"
                  : "I Understand — I Will Not Repeat This (1st Strike)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PERMANENT BAN LOCKOUT SCREEN (ON 2ND ATTEMPT)                         */}
      {/* ===================================================================== */}
      {isAccountBanned ? (
        <div
          className="p-7 rounded-2xl border-2 text-center space-y-4"
          style={{
            backgroundColor: "#450a0a",
            borderColor: "#dc2626",
            color: "#fef2f2",
          }}
        >
          <ShieldAlert
            className="w-14 h-14 mx-auto"
            style={{ color: "#f87171" }}
          />
          <h3 className="text-xl font-bold" style={{ color: "#ffffff" }}>
            Account Permanently Banned (2nd 18+ Violation Attempt)
          </h3>
          <p className="text-sm max-w-xl mx-auto" style={{ color: "#fecaca" }}>
            Your access to posting confessions on Kalbu has been permanently
            revoked after a 2nd attempt to post prohibited 18+ / sexually
            explicit content.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={handleResetDemoBan}
              className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl border transition cursor-pointer"
              style={{
                backgroundColor: "#7f1d1d",
                borderColor: "#f87171",
                color: "#ffffff",
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              FYP Demo: Reset Account Ban &amp; Strikes
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                AES-GCM-256 Zero-Knowledge E2EE
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400">
                PBKDF2 (310k iterations)
              </span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {wordCount} words
            </span>
          </div>

          <form onSubmit={handleSaveEntry} className="space-y-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give this confession or reflection a quiet title..."
              className="w-full bg-transparent text-lg font-semibold text-slate-100 placeholder-slate-500 focus:outline-none border-b border-slate-800 pb-2.5"
            />

            <textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Unload your thoughts safely here. Your plaintext is encrypted in your browser before storage..."
              className="w-full bg-slate-950/70 rounded-xl p-4 text-sm leading-relaxed text-slate-200 placeholder-slate-500 border border-slate-800/80 focus:outline-none focus:border-indigo-500/70 resize-none"
            />

            <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
              <label className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={findTwin}
                  onChange={(e) => setFindTwin(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500"
                />
                <Users className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>
                  Pair me with an anonymous <strong>Feeling Twin</strong> (Cosine
                  Similarity)
                </span>
              </label>

              <button
                type="submit"
                disabled={isSaving || !cryptoKey}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium text-sm text-white transition shadow-lg shadow-indigo-600/20 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin" />
                    Encrypting &amp; Mapping Affect...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Seal &amp; Analyze Entry
                  </>
                )}
              </button>
            </div>

            {error && (
              <p className="text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </form>

          {lastResult && (
            <div className="mt-5 p-4 rounded-xl bg-slate-950/90 border border-slate-800/90 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">
                    Russell&apos;s Circumplex Projection
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          CIRCUMPLEX_ANCHORS[lastResult.primaryEmotion].color,
                      }}
                    />
                    <p className="text-base font-semibold capitalize text-white">
                      {lastResult.primaryEmotion}{" "}
                      <span className="text-xs font-normal text-slate-400">
                        ({(lastResult.confidence * 100).toFixed(1)}% confidence)
                      </span>
                    </p>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                      {lastResult.quadrant}
                    </span>
                  </div>
                </div>

                <div className="text-right text-xs text-slate-300 font-mono bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                  <div>
                    Valence:{" "}
                    <span className="text-indigo-400">
                      {lastResult.valence >= 0
                        ? `+${lastResult.valence}`
                        : lastResult.valence}
                    </span>
                  </div>
                  <div>
                    Arousal:{" "}
                    <span className="text-emerald-400">
                      {lastResult.arousal >= 0
                        ? `+${lastResult.arousal}`
                        : lastResult.arousal}
                    </span>
                  </div>
                </div>
              </div>

              {lastResult.topTokens && lastResult.topTokens.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-400 mr-1">
                    XAI Top 416k N-Grams:
                  </span>
                  {lastResult.topTokens.map((item) => (
                    <span
                      key={item.token}
                      className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                    >
                      &ldquo;{item.token}&rdquo; (+{item.weight})
                    </span>
                  ))}
                </div>
              )}

              {lastCipherPreview && (
                <div className="text-[11px] text-slate-400 font-mono truncate bg-slate-900/60 px-3 py-1.5 rounded border border-slate-800/60">
                  Stored AES-GCM Ciphertext: {lastCipherPreview}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
