// src/app/api/moderation/check-confession/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";

const BANNED_WORDS_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "moderation",
  "banned_words_db.json"
);

const EVIDENCE_DB_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "moderation",
  "restricted_evidence_db.json"
);

interface BannedWordsRegistry {
  description: string;
  updatedAt: string;
  bannedWords: string[];
}

export interface ForensicIncidentRecord {
  incidentId: string;
  timestamp: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  strikeNumber: number;
  actionTaken:
    | "STRIKE_1_FINAL_WARNING_ISSUED"
    | "STRIKE_2_PERMANENT_ACCOUNT_BAN";
  flaggedKeywords: string[];
  newlyBannedContextWords: string[];
  rawTitle: string;
  rawContent: string;
}

interface EvidenceDatabase {
  description: string;
  incidents: ForensicIncidentRecord[];
  userStrikes: Record<
    string,
    {
      strikes: number;
      isBanned: boolean;
      lastViolationAt: string;
    }
  >;
}

function readBannedWords(): BannedWordsRegistry {
  try {
    if (fs.existsSync(BANNED_WORDS_PATH)) {
      return JSON.parse(
        fs.readFileSync(BANNED_WORDS_PATH, "utf-8")
      ) as BannedWordsRegistry;
    }
  } catch (err) {
    console.warn("[Kalbu Moderation] Could not read banned_words_db.json:", err);
  }
  return {
    description: "Kalbu Permanent Banned 18+ Terms Registry",
    updatedAt: new Date().toISOString(),
    bannedWords: ["sex", "porn", "nude", "18+", "nsfw", "lucah", "seks", "bogel"],
  };
}

function readEvidenceDb(): EvidenceDatabase {
  try {
    if (fs.existsSync(EVIDENCE_DB_PATH)) {
      return JSON.parse(
        fs.readFileSync(EVIDENCE_DB_PATH, "utf-8")
      ) as EvidenceDatabase;
    }
  } catch (err) {
    console.warn(
      "[Kalbu Moderation] Could not read restricted_evidence_db.json:",
      err
    );
  }
  return {
    description:
      "Kalbu Restricted Forensic Audit & Law Enforcement Backup Database",
    incidents: [],
    userStrikes: {},
  };
}

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      userId?: string;
      title?: string;
      content?: string;
      resetForDemo?: boolean;
    };

    const userId = body.userId || "00000000-0000-0000-0000-000000000001";
    const evidenceDb = readEvidenceDb();

    // Optional reset trigger for FYP supervisor demo
    if (body.resetForDemo) {
      delete evidenceDb.userStrikes[userId];
      fs.writeFileSync(
        EVIDENCE_DB_PATH,
        JSON.stringify(evidenceDb, null, 2),
        "utf-8"
      );
      return NextResponse.json({
        allowed: true,
        strikes: 0,
        isBanned: false,
      });
    }

    // Check if user is already permanently banned (2nd strike reached previously)
    const existingRecord = evidenceDb.userStrikes[userId];
    if (existingRecord?.isBanned) {
      return NextResponse.json(
        {
          allowed: false,
          isBanned: true,
          strikes: existingRecord.strikes,
          flaggedKeywords: ["ACCOUNT_PERMANENTLY_BANNED"],
          incidentId: "BANNED-LOCKOUT",
          message:
            "Your account has been permanently banned due to repeated 18+ / sexually explicit content violations. Your violation records are retained in the Restricted Forensic Audit Database.",
        },
        { status: 403 }
      );
    }

    const rawTitle = (body.title || "").trim();
    const rawContent = (body.content || "").trim();
    const combinedText = `${rawTitle} ${rawContent}`.toLowerCase();

    const registry = readBannedWords();
    const matchedKeywords: string[] = [];

    for (const term of registry.bannedWords) {
      const cleanTerm = term.toLowerCase().trim();
      if (!cleanTerm) continue;

      const pattern =
        cleanTerm === "18+"
          ? /(?:^|\s)18\+(?:\s|$)/i
          : new RegExp(`\\b${escapeRegex(cleanTerm)}\\b`, "i");

      if (pattern.test(combinedText)) {
        matchedKeywords.push(cleanTerm);
      }
    }

    // If clean, allow immediately without any warning
    if (matchedKeywords.length === 0) {
      return NextResponse.json(
        {
          allowed: true,
          isBanned: false,
          strikes: existingRecord?.strikes ?? 0,
        },
        { status: 200 }
      );
    }

    // =========================================================================
    // 18+ VIOLATION DETECTED:
    // 1. Block confession from being posted.
    // 2. Store compound/related explicit tokens into banned_words_db.json.
    // 3. Log full forensic backup into restricted_evidence_db.json for police/legal use.
    // 4. Increment user strikes (Strike 1 = Final Warning, Strike 2 = Permanent Ban).
    // =========================================================================
    const currentStrikes = (existingRecord?.strikes ?? 0) + 1;
    const isNowBanned = currentStrikes >= 2;
    const nowIso = new Date().toISOString();
    const incidentId = `INC-${Date.now()}`;

    // Extract any adjacent compound phrase around the matched keyword to add to banned_words_db.json
    const newlyBannedContextWords: string[] = [];
    const tokens = combinedText.match(/[a-z0-9+]{3,}/g) || [];
    for (let i = 0; i < tokens.length; i++) {
      if (matchedKeywords.includes(tokens[i])) {
        if (i + 1 < tokens.length && tokens[i + 1].length >= 4) {
          const phrase = `${tokens[i]} ${tokens[i + 1]}`;
          if (!registry.bannedWords.includes(phrase)) {
            registry.bannedWords.push(phrase);
            newlyBannedContextWords.push(phrase);
          }
        }
      }
    }

    if (newlyBannedContextWords.length > 0) {
      registry.updatedAt = nowIso;
      try {
        fs.mkdirSync(path.dirname(BANNED_WORDS_PATH), { recursive: true });
        fs.writeFileSync(
          BANNED_WORDS_PATH,
          JSON.stringify(registry, null, 2),
          "utf-8"
        );
      } catch (e) {
        console.warn("[Kalbu Moderation] Failed to update banned words DB:", e);
      }
    }

    const ipAddress =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1 (Localhost Trace)";
    const userAgent =
      req.headers.get("user-agent") || "Browser Client Fingerprint";

    const forensicEntry: ForensicIncidentRecord = {
      incidentId,
      timestamp: nowIso,
      userId,
      ipAddress,
      userAgent,
      strikeNumber: currentStrikes,
      actionTaken: isNowBanned
        ? "STRIKE_2_PERMANENT_ACCOUNT_BAN"
        : "STRIKE_1_FINAL_WARNING_ISSUED",
      flaggedKeywords: Array.from(new Set(matchedKeywords)),
      newlyBannedContextWords,
      rawTitle,
      rawContent,
    };

    evidenceDb.incidents.unshift(forensicEntry);
    evidenceDb.userStrikes[userId] = {
      strikes: currentStrikes,
      isBanned: isNowBanned,
      lastViolationAt: nowIso,
    };

    try {
      fs.mkdirSync(path.dirname(EVIDENCE_DB_PATH), { recursive: true });
      fs.writeFileSync(
        EVIDENCE_DB_PATH,
        JSON.stringify(evidenceDb, null, 2),
        "utf-8"
      );
    } catch {
      try {
        fs.writeFileSync(
          path.join(os.tmpdir(), "kalbu_restricted_evidence_db.json"),
          JSON.stringify(evidenceDb, null, 2),
          "utf-8"
        );
      } catch (e) {
        console.warn("[Kalbu Moderation] Failed to write evidence DB:", e);
      }
    }

    // Sync 18+ violation incident and newly banned words directly to Supabase
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.from("restricted_incident_logs").insert({
        incident_id: incidentId,
        user_id: userId,
        ip_address: ipAddress,
        user_agent: userAgent,
        strike_number: currentStrikes,
        action_taken: forensicEntry.actionTaken,
        flagged_keywords: forensicEntry.flaggedKeywords,
        raw_title: rawTitle,
        raw_content: rawContent,
        created_at: nowIso,
      });

      if (newlyBannedContextWords.length > 0) {
        await supabase.from("banned_words_registry").upsert(
          newlyBannedContextWords.map((term) => ({
            banned_term: term,
            category: "18+_sexual_explicit",
            auto_added_from_violation: true,
          })),
          { onConflict: "banned_term" }
        );
      }
    } catch {
      // Ignore if Supabase table not migrated yet
    }

    return NextResponse.json(
      {
        allowed: false,
        isBanned: isNowBanned,
        strikes: currentStrikes,
        incidentId,
        timestamp: nowIso,
        ipAddress,
        flaggedKeywords: Array.from(new Set(matchedKeywords)),
        newlyBannedContextWords,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[Kalbu Moderation Error]:", err);
    return NextResponse.json(
      { error: "Failed to run content safety check." },
      { status: 500 }
    );
  }
}
