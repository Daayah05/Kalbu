"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookHeart,
  Cpu,
  Eye,
  EyeOff,
  Headphones,
  HeartHandshake,
  HelpCircle,
  KeyRound,
  Lock,
  LogOut,
  Shield,
  Sparkles,
  Trash2,
  Unlock,
  UserCheck,
  ArrowRight,
} from "lucide-react";
import KalbuAuthGate, {
  AuthenticatedKalbuUser,
} from "@/components/auth/KalbuAuthGate";
import SecureJournalEditor, {
  SavedEncryptedEntry,
} from "@/components/diary/SecureJournalEditor";
import CircumplexScatterChart from "@/components/charts/CircumplexScatterChart";
import MonthlyEmotionTrendChart from "@/components/charts/MonthlyEmotionTrendChart";
import ModelEvaluationCard from "@/components/charts/ModelEvaluationCard";
import FeelingTwinMatcher from "@/components/matching/FeelingTwinMatcher";
import IsoMusicTherapyPlayer from "@/components/music/IsoMusicTherapyPlayer";
import KalbuAiChatbot from "@/components/chat/KalbuAiChatbot";
import DynamicFaqSection from "@/components/faq/DynamicFaqSection";
import {
  deriveDiaryKey,
  decryptDiaryEntry,
  generateEncryptionSalt,
} from "@/lib/crypto/e2ee";
import {
  buildMonthlyEmotionGraph,
  CIRCUMPLEX_ANCHORS,
  EmotionRecordItem,
} from "@/lib/ai/circumplex";

type ActivityTab =
  | "confession"
  | "twin"
  | "music"
  | "graphs"
  | "evaluation"
  | "faq";

const STORAGE_AUTH_SESSION_KEY = "kalbu_auth_session_v1";
const STORAGE_SALT_KEY = "kalbu_vault_salt_v1";
const STORAGE_VAULT_KEY = "kalbu_encrypted_vault_v1";
const STORAGE_RECORDS_KEY = "kalbu_emotion_records_v1";

// Initial realistic student emotional trajectory across the current month
const INITIAL_DEMO_RECORDS: EmotionRecordItem[] = [
  {
    id: "demo-1",
    title: "Overwhelmed by FYP literature review deadlines",
    recorded_at: "2026-11-03T21:15:00Z",
    valence: -0.68,
    arousal: 0.72,
    primary_emotion: "fear",
    confidence: 0.84,
    quadrant: "High-Energy Unpleasant",
    vector6D: [0.12, 0.02, 0.01, 0.08, 0.74, 0.03],
  },
  {
    id: "demo-2",
    title: "Exhausted after back-to-back lab submissions",
    recorded_at: "2026-11-06T23:40:00Z",
    valence: -0.74,
    arousal: -0.52,
    primary_emotion: "sadness",
    confidence: 0.88,
    quadrant: "Low-Energy Unpleasant",
    vector6D: [0.81, 0.03, 0.02, 0.06, 0.06, 0.02],
  },
  {
    id: "demo-3",
    title: "Coffee & late-night talk with study group helped",
    recorded_at: "2026-11-09T19:30:00Z",
    valence: 0.72,
    arousal: 0.22,
    primary_emotion: "love",
    confidence: 0.79,
    quadrant: "High-Energy Pleasant",
    vector6D: [0.04, 0.24, 0.65, 0.01, 0.03, 0.03],
  },
  {
    id: "demo-4",
    title: "Midterm results came back better than expected!",
    recorded_at: "2026-11-12T14:20:00Z",
    valence: 0.64,
    arousal: 0.76,
    primary_emotion: "surprise",
    confidence: 0.81,
    quadrant: "High-Energy Pleasant",
    vector6D: [0.02, 0.35, 0.05, 0.01, 0.04, 0.53],
  },
  {
    id: "demo-5",
    title: "Quiet morning coding session on Kalbu pipeline",
    recorded_at: "2026-11-15T10:10:00Z",
    valence: 0.78,
    arousal: 0.44,
    primary_emotion: "joy",
    confidence: 0.91,
    quadrant: "High-Energy Pleasant",
    vector6D: [0.02, 0.84, 0.08, 0.01, 0.02, 0.03],
  },
];

const NAV_ITEMS: Array<{
  id: ActivityTab;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "confession",
    label: "Confession Diary",
    subtitle: "Main Menu (E2EE)",
    icon: BookHeart,
  },
  {
    id: "twin",
    label: "Feeling Twin",
    subtitle: "Anonymous Match",
    icon: HeartHandshake,
  },
  {
    id: "music",
    label: "Music Therapy",
    subtitle: "Piano & Spotify",
    icon: Headphones,
  },
  {
    id: "graphs",
    label: "Emotion Graphs",
    subtitle: "Circumplex & Trend",
    icon: BarChart3,
  },
  {
    id: "evaluation",
    label: "416k AI Model",
    subtitle: "88.95% Accuracy",
    icon: Cpu,
  },
  {
    id: "faq",
    label: "FAQ",
    subtitle: "Chatbot Guide",
    icon: HelpCircle,
  },
];

export default function KalbuDashboardPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [authUser, setAuthUser] = useState<AuthenticatedKalbuUser | null>(null);
  const [activeTab, setActiveTab] = useState<ActivityTab>("confession");
  const [playingTrackTitle, setPlayingTrackTitle] = useState<string | null>(
    null
  );
  const [userId, setUserId] = useState("00000000-0000-0000-0000-000000000001");
  const [passphrase, setPassphrase] = useState("kalbu-safe-haven-2026");
  const [vaultSalt, setVaultSalt] = useState<string>("");
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [records, setRecords] =
    useState<EmotionRecordItem[]>(INITIAL_DEMO_RECORDS);
  const [vaultEntries, setVaultEntries] = useState<
    Array<{
      entry: SavedEncryptedEntry;
      decrypted?: { title: string; content: string };
      decryptError?: boolean;
    }>
  >([]);
  const [showRawCipher, setShowRawCipher] = useState(false);

  async function decryptVaultList(
    rawEntries: SavedEncryptedEntry[],
    key: CryptoKey
  ) {
    const results = await Promise.all(
      rawEntries.map(async (entry) => {
        try {
          const decrypted = await decryptDiaryEntry(entry.encrypted, key);
          return { entry, decrypted, decryptError: false };
        } catch {
          return { entry, decrypted: undefined, decryptError: true };
        }
      })
    );
    setVaultEntries(results);
  }

  useEffect(() => {
    async function initVault() {
      let salt = localStorage.getItem(STORAGE_SALT_KEY);
      if (!salt) {
        salt = generateEncryptionSalt();
        localStorage.setItem(STORAGE_SALT_KEY, salt);
      }
      setVaultSalt(salt);

      const key = await deriveDiaryKey(passphrase, salt);
      setCryptoKey(key);

      try {
        const savedSessionJson = localStorage.getItem(STORAGE_AUTH_SESSION_KEY);
        if (savedSessionJson) {
          const parsedUser = JSON.parse(
            savedSessionJson
          ) as AuthenticatedKalbuUser;
          if (parsedUser && parsedUser.email) {
            setAuthUser(parsedUser);
            setUserId(parsedUser.id);
          }
        }

        const savedRecordsJson = localStorage.getItem(STORAGE_RECORDS_KEY);
        if (savedRecordsJson) {
          const parsedRecords = JSON.parse(
            savedRecordsJson
          ) as EmotionRecordItem[];
          if (Array.isArray(parsedRecords) && parsedRecords.length > 0) {
            setRecords(parsedRecords);
          }
        }

        const savedVaultJson = localStorage.getItem(STORAGE_VAULT_KEY);
        if (savedVaultJson) {
          const parsedVault = JSON.parse(
            savedVaultJson
          ) as SavedEncryptedEntry[];
          if (Array.isArray(parsedVault) && parsedVault.length > 0) {
            await decryptVaultList(parsedVault, key);
          }
        }
      } catch (e) {
        console.warn("[Kalbu Vault] Could not restore local vault:", e);
      } finally {
        setIsHydrated(true);
      }
    }
    initVault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUnlockKey(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase.trim()) return;
    const salt =
      vaultSalt ||
      localStorage.getItem(STORAGE_SALT_KEY) ||
      generateEncryptionSalt();
    const key = await deriveDiaryKey(passphrase, salt);
    setCryptoKey(key);

    const rawEntries = vaultEntries.map((v) => v.entry);
    if (rawEntries.length > 0) {
      await decryptVaultList(rawEntries, key);
    }
  }

  async function handleEntrySaved(saved: SavedEncryptedEntry) {
    let decrypted: { title: string; content: string } | undefined;
    let decryptError = false;
    if (cryptoKey) {
      try {
        decrypted = await decryptDiaryEntry(saved.encrypted, cryptoKey);
      } catch {
        decryptError = true;
      }
    }

    setVaultEntries((prev) => {
      const next = [{ entry: saved, decrypted, decryptError }, ...prev];
      try {
        localStorage.setItem(
          STORAGE_VAULT_KEY,
          JSON.stringify(next.map((item) => item.entry))
        );
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });

    setRecords((prev) => {
      const next: EmotionRecordItem[] = [
        ...prev,
        {
          id: saved.id,
          title: decrypted?.title || "Encrypted Reflection",
          recorded_at: saved.recordedAt,
          valence: saved.circumplex.valence,
          arousal: saved.circumplex.arousal,
          primary_emotion: saved.circumplex.primaryEmotion,
          confidence: saved.circumplex.confidence,
          quadrant: saved.circumplex.quadrant,
          vector6D: saved.circumplex.vector6D,
        },
      ];
      try {
        localStorage.setItem(STORAGE_RECORDS_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }

  function handleClearVaultHistory() {
    localStorage.removeItem(STORAGE_VAULT_KEY);
    localStorage.removeItem(STORAGE_RECORDS_KEY);
    setVaultEntries([]);
    setRecords(INITIAL_DEMO_RECORDS);
  }

  async function handleUserAuthenticated(user: AuthenticatedKalbuUser) {
    setAuthUser(user);
    setUserId(user.id);
    setPassphrase(user.passphrase);
    try {
      localStorage.setItem(STORAGE_AUTH_SESSION_KEY, JSON.stringify(user));
    } catch {
      // Ignore storage error
    }
    const salt =
      vaultSalt ||
      localStorage.getItem(STORAGE_SALT_KEY) ||
      generateEncryptionSalt();
    const key = await deriveDiaryKey(user.passphrase, salt);
    setCryptoKey(key);
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_AUTH_SESSION_KEY);
    setAuthUser(null);
  }

  const monthlySummary = useMemo(
    () => buildMonthlyEmotionGraph(records),
    [records]
  );

  const latestRecord = records[records.length - 1];
  const hasLockedEntries = vaultEntries.some((v) => v.decryptError);

  if (!isHydrated) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  if (!authUser) {
    return <KalbuAuthGate onAuthenticated={handleUserAuthenticated} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      {/* Top Header & Activity Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-3 space-y-4">
          {/* Top Brand Row + Vault Passphrase Lock */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setActiveTab("confession")}
              className="flex items-center gap-3.5 text-left cursor-pointer"
            >
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-indigo-500/60 shadow-md bg-slate-950 shrink-0">
                <img
                  src="/kalbu-logo.jpg"
                  alt="Kalbu Logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-serif font-bold tracking-wide text-slate-100">
                    KALBU
                  </h1>
                  <span className="text-xs font-medium px-3 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    Digital Diary &amp; Emotional Safe Haven
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Current Detected Mood:{" "}
                  <strong
                    className="capitalize"
                    style={{
                      color: latestRecord
                        ? CIRCUMPLEX_ANCHORS[latestRecord.primary_emotion].color
                        : "#c24646",
                    }}
                  >
                    {latestRecord?.primary_emotion ?? "joy"}
                  </strong>{" "}
                  ({latestRecord?.quadrant})
                </p>
              </div>
            </button>

            {/* Client-Side Vault Key Bar & Authenticated User Profile */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-2xl bg-slate-950 border border-slate-800 text-slate-200">
                <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold">
                  {authUser.anonymousHandle}
                </span>
              </div>

              <form
                onSubmit={handleUnlockKey}
                className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2 shadow-inner"
              >
                <KeyRound
                  className={`w-4 h-4 shrink-0 ${
                    hasLockedEntries ? "text-rose-400" : "text-emerald-400"
                  }`}
                />
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Vault Passphrase..."
                  className="bg-transparent text-xs text-slate-200 focus:outline-none w-36 font-mono"
                />
                <button
                  type="submit"
                  className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border font-medium transition cursor-pointer ${
                    hasLockedEntries
                      ? "bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25"
                      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                  }`}
                >
                  {hasLockedEntries ? (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      Unlock
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3.5 h-3.5" />
                      Key Active
                    </>
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={handleLogout}
                title="Log out to Login / Register screen"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-2xl bg-slate-950 hover:bg-rose-500/15 text-slate-300 hover:text-rose-300 border border-slate-800 hover:border-rose-500/30 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>

          {/* Top Activity Navigation Bar */}
          <nav
            aria-label="Kalbu Activities"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border text-left transition cursor-pointer ${
                    isActive
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
                      : "bg-slate-950 hover:bg-slate-800/60 text-slate-200 border-slate-800"
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-tight truncate">
                      {item.label}
                    </p>
                    <p
                      className={`text-[10px] leading-tight truncate mt-0.5 ${
                        isActive ? "opacity-90" : "text-slate-400"
                      }`}
                    >
                      {item.id === "music" && playingTrackTitle
                        ? `🎵 Playing: ${playingTrackTitle}`
                        : item.subtitle}
                    </p>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Single-Activity Content Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* ============================================================ */}
        {/* ACTIVITY 1 (MAIN MENU): SECRET CONFESSION & ENCRYPTED DIARY  */}
        {/* ============================================================ */}
        {activeTab === "confession" && (
          <div className="space-y-7">
            {/* Soft Welcome Sanctuary Hero Banner */}
            <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-7 shadow-md flex flex-col sm:flex-row items-center gap-6">
              <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-3xl overflow-hidden border-2 border-indigo-500/40 shadow-sm shrink-0 bg-slate-950">
                <img
                  src="/kalbu-logo.jpg"
                  alt="Kalbu Digital Diary & Emotional Safe Haven"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="space-y-2.5 text-center sm:text-left">
                <div className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Sparkles className="w-4 h-4" />
                  Main Menu • Private Confession &amp; Emotional Sanctuary
                </div>
                <h2 className="text-2xl font-serif font-bold text-slate-100">
                  Unload your heart safely. Nobody else can read your diary.
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Write your confession or daily thoughts below. Your words are
                  encrypted in your browser with{" "}
                  <strong>AES-GCM-256 Zero-Knowledge Encryption</strong>, while
                  our AI maps your mood so you can explore your{" "}
                  <strong>Feeling Twin</strong>,{" "}
                  <strong>Piano Music Therapy</strong>, and{" "}
                  <strong>Emotion Graphs</strong> from the top menu bar.
                </p>
              </div>
            </div>

            {/* Main Confession / Journal Editor */}
            <SecureJournalEditor
              userId={userId}
              cryptoKey={cryptoKey}
              onEntrySaved={handleEntrySaved}
            />

            {/* Next Activity Quick-Jump Cards after writing a confession */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => setActiveTab("twin")}
                className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800/40 border border-slate-800 text-left transition cursor-pointer flex items-center justify-between group shadow-sm"
              >
                <div className="space-y-1">
                  <p className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                    <HeartHandshake className="w-4 h-4" />
                    Feeling Twin Match
                  </p>
                  <p className="text-xs text-slate-300">
                    See the peer matching your{" "}
                    <strong className="capitalize">
                      {latestRecord?.primary_emotion}
                    </strong>{" "}
                    state
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("music")}
                className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800/40 border border-slate-800 text-left transition cursor-pointer flex items-center justify-between group shadow-sm"
              >
                <div className="space-y-1">
                  <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Headphones className="w-4 h-4" />
                    Mood Music Therapy
                  </p>
                  <p className="text-xs text-slate-300">
                    Listen to Piano, Spotify or YouTube for your mood
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("graphs")}
                className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800/40 border border-slate-800 text-left transition cursor-pointer flex items-center justify-between group shadow-sm"
              >
                <div className="space-y-1">
                  <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4" />
                    Emotion Graphs
                  </p>
                  <p className="text-xs text-slate-300">
                    View Russell&apos;s Circumplex &amp; Monthly Trend
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition" />
              </button>
            </div>

            {/* Client-Side Persistent Encrypted Vault Inspector */}
            {vaultEntries.length > 0 && (
              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-md space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-emerald-400" />
                    Your Sealed Confessions Vault ({vaultEntries.length})
                  </h3>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowRawCipher((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 cursor-pointer"
                    >
                      {showRawCipher ? (
                        <>
                          <Eye className="w-4 h-4" />
                          View Decrypted Plaintext
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-4 h-4" />
                          Inspect AES-GCM Ciphertext
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleClearVaultHistory}
                      title="Reset saved demo entries"
                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      Reset
                    </button>
                  </div>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {vaultEntries.map(({ entry, decrypted, decryptError }) => (
                    <div
                      key={entry.id}
                      className={`p-4 rounded-xl bg-slate-950 border text-sm space-y-2 ${
                        decryptError
                          ? "border-rose-500/40"
                          : "border-slate-800"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-100">
                          {showRawCipher
                            ? "[AES-GCM-256 ENCRYPTED BLOB]"
                            : decryptError
                            ? "🔒 [LOCKED — Wrong Passphrase / AES-GCM Auth Tag Mismatch]"
                            : decrypted?.title}
                        </span>
                        <span className="capitalize text-xs px-3 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
                          {entry.circumplex.primaryEmotion} (V:{" "}
                          {entry.circumplex.valence}, A:{" "}
                          {entry.circumplex.arousal})
                        </span>
                      </div>
                      <p className="text-slate-300 font-mono text-xs break-all leading-relaxed">
                        {showRawCipher || decryptError
                          ? `IV: ${entry.encrypted.iv} | Cipher: ${entry.encrypted.ciphertext}`
                          : decrypted?.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* ACTIVITY 2: FEELING TWIN ANONYMOUS MATCHER PAGE              */}
        {/* ============================================================ */}
        {activeTab === "twin" && (
          <div className="space-y-6">
            <FeelingTwinMatcher userId={userId} latestRecord={latestRecord} />
          </div>
        )}

        {/* ============================================================ */}
        {/* ACTIVITY 3: MOOD-BASED MUSIC THERAPY PAGE (ALWAYS MOUNTED    */}
        {/* SO AUDIO / SPOTIFY / YOUTUBE KEEPS PLAYING ACROSS ALL TABS!) */}
        {/* ============================================================ */}
        <div className={activeTab === "music" ? "space-y-6 block" : "hidden"}>
          <IsoMusicTherapyPlayer
            latestRecord={latestRecord}
            onPlayingStateChange={setPlayingTrackTitle}
          />
        </div>

        {/* ============================================================ */}
        {/* ACTIVITY 4: RUSSELL'S CIRCUMPLEX & MONTHLY EMOTION GRAPHS    */}
        {/* ============================================================ */}
        {activeTab === "graphs" && (
          <div className="space-y-7">
            <CircumplexScatterChart records={records} />
            <MonthlyEmotionTrendChart summary={monthlySummary} />
          </div>
        )}

        {/* ============================================================ */}
        {/* ACTIVITY 5: 416K AI MODEL EVALUATION & CONFUSION MATRIX      */}
        {/* ============================================================ */}
        {activeTab === "evaluation" && (
          <div className="space-y-6">
            <ModelEvaluationCard />
          </div>
        )}

        {/* ============================================================ */}
        {/* ACTIVITY 6: LIVE RESTORED CHATBOT FAQ KNOWLEDGE BASE         */}
        {/* ============================================================ */}
        {activeTab === "faq" && (
          <div className="space-y-6">
            <DynamicFaqSection showFullPageLink={false} />
          </div>
        )}
      </main>

      {/* Floating Kalbu AI Companion & Website Guide Chatbot */}
      <KalbuAiChatbot latestRecord={latestRecord} />
    </div>
  );
}
