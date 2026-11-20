// src/app/api/faq/route.ts
import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  category: string;
  askedCount: number;
  lastAskedAt: string;
  isUserSubmitted?: boolean;
}

const FAQ_STORE_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "faq",
  "faq_store.json"
);
const TMP_FAQ_STORE_PATH = path.join(os.tmpdir(), "kalbu_faq_store.json");

export function readFaqStore(): FaqEntry[] {
  try {
    const targetPath = fs.existsSync(TMP_FAQ_STORE_PATH)
      ? TMP_FAQ_STORE_PATH
      : FAQ_STORE_PATH;
    if (fs.existsSync(targetPath)) {
      const raw = fs.readFileSync(targetPath, "utf-8");
      const parsed = JSON.parse(raw) as FaqEntry[];
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => b.askedCount - a.askedCount);
      }
    }
  } catch (err) {
    console.warn("[Kalbu FAQ] Failed to read faq_store.json:", err);
  }
  return [];
}

export async function syncFaqEntryToSupabase(entry: FaqEntry) {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.from("faq_questions").upsert(
      {
        id: entry.id,
        question: entry.question,
        answer: entry.answer,
        category: entry.category,
        asked_count: entry.askedCount,
        is_user_submitted: Boolean(entry.isUserSubmitted),
        last_asked_at: entry.lastAskedAt,
      },
      { onConflict: "id" }
    );
  } catch {
    // Ignore if table not migrated yet
  }
}

export function recordQuestionToFaqStore(
  question: string,
  answer: string,
  category: string
): FaqEntry[] {
  const cleanQ = question.trim();
  if (!cleanQ) return readFaqStore();

  const entries = readFaqStore();
  const normQ = cleanQ.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

  const existing = entries.find((item) => {
    const normExisting = item.question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
    return (
      normExisting === normQ ||
      (normQ.length > 14 && normExisting.includes(normQ)) ||
      (normExisting.length > 14 && normQ.includes(normExisting))
    );
  });

  const nowIso = new Date().toISOString();
  let targetEntry: FaqEntry;

  if (existing) {
    existing.askedCount += 1;
    existing.lastAskedAt = nowIso;
    targetEntry = existing;
  } else {
    targetEntry = {
      id: `faq-user-${Date.now()}`,
      question: cleanQ,
      answer: answer.replace(/\*\*/g, ""),
      category,
      askedCount: 1,
      lastAskedAt: nowIso,
      isUserSubmitted: true,
    };
    entries.push(targetEntry);
  }

  // Fire-and-forget sync to Supabase faq_questions table
  syncFaqEntryToSupabase(targetEntry).catch(() => {});

  const sorted = entries.sort((a, b) => b.askedCount - a.askedCount);

  const payload = JSON.stringify(sorted, null, 2);
  try {
    fs.mkdirSync(path.dirname(FAQ_STORE_PATH), { recursive: true });
    fs.writeFileSync(FAQ_STORE_PATH, payload, "utf-8");
  } catch {
    try {
      fs.writeFileSync(TMP_FAQ_STORE_PATH, payload, "utf-8");
    } catch (err) {
      console.warn("[Kalbu FAQ] Failed to persist faq_store.json:", err);
    }
  }

  return sorted;
}

export async function GET() {
  const localFaqs = readFaqStore();
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("faq_questions")
      .select("*")
      .order("asked_count", { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      const mergedMap = new Map<string, FaqEntry>();
      for (const item of localFaqs) {
        mergedMap.set(item.question.toLowerCase(), item);
      }
      for (const row of data) {
        mergedMap.set(String(row.question).toLowerCase(), {
          id: row.id,
          question: row.question,
          answer: row.answer,
          category: row.category,
          askedCount: Number(row.asked_count || 1),
          lastAskedAt: row.last_asked_at,
          isUserSubmitted: Boolean(row.is_user_submitted),
        });
      }
      const merged = Array.from(mergedMap.values()).sort(
        (a, b) => b.askedCount - a.askedCount
      );
      return NextResponse.json({ faqs: merged }, { status: 200 });
    }
  } catch {
    // Fallback to localFaqs
  }
  return NextResponse.json({ faqs: localFaqs }, { status: 200 });
}
