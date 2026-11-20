// src/app/api/faq/route.ts
import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

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

export function recordQuestionToFaqStore(
  question: string,
  answer: string,
  category: string
): FaqEntry[] {
  const cleanQ = question.trim();
  if (!cleanQ) return readFaqStore();

  const entries = readFaqStore();
  const normQ = cleanQ.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

  // Check if a matching question already exists
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

  if (existing) {
    existing.askedCount += 1;
    existing.lastAskedAt = nowIso;
  } else {
    entries.push({
      id: `faq-user-${Date.now()}`,
      question: cleanQ,
      answer: answer.replace(/\*\*/g, ""),
      category,
      askedCount: 1,
      lastAskedAt: nowIso,
      isUserSubmitted: true,
    });
  }

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
  const faqs = readFaqStore();
  return NextResponse.json({ faqs }, { status: 200 });
}
