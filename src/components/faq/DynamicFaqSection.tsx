// src/components/faq/DynamicFaqSection.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Flame,
  HelpCircle,
  MessageSquarePlus,
  Search,
  Sparkles,
} from "lucide-react";
import type { FaqEntry } from "@/app/api/faq/route";

interface DynamicFaqSectionProps {
  showFullPageLink?: boolean;
}

export default function DynamicFaqSection({
  showFullPageLink = true,
}: DynamicFaqSectionProps) {
  const [faqs, setFaqs] = useState<FaqEntry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>("faq-e2ee");

  async function fetchFaqs() {
    try {
      const res = await fetch("/api/faq", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.faqs)) {
          setFaqs(data.faqs);
        }
      }
    } catch {
      // Ignore fetch errors
    }
  }

  useEffect(() => {
    fetchFaqs();

    const handleFaqUpdated = () => {
      fetchFaqs();
    };

    window.addEventListener("kalbu-faq-updated", handleFaqUpdated);
    return () => {
      window.removeEventListener("kalbu-faq-updated", handleFaqUpdated);
    };
  }, []);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(faqs.map((f) => f.category)));
    return ["All", ...unique];
  }, [faqs]);

  const filteredFaqs = useMemo(() => {
    return faqs.filter((item) => {
      const matchesCat =
        selectedCategory === "All" || item.category === selectedCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.answer.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [faqs, selectedCategory, searchQuery]);

  const userAskedTotal = useMemo(
    () => faqs.filter((f) => f.isUserSubmitted).length,
    [faqs]
  );

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800/90 p-5 sm:p-6 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <HelpCircle className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base sm:text-lg font-semibold text-slate-100">
              Frequently Asked Questions (Live Chatbot FAQ Knowledge Base)
            </h3>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <Sparkles className="w-3 h-3" />
              Auto-Restored from Chatbot ({faqs.length} topics)
            </span>
            {userAskedTotal > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                <MessageSquarePlus className="w-3 h-3" />+{userAskedTotal} New
                from Your Chat
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Every question asked inside the <strong>Kalbu AI Companion</strong>{" "}
            is persisted, ranked by frequency, and restored here automatically.
          </p>
        </div>

        {showFullPageLink && (
          <Link
            href="/faq"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm"
          >
            Open Dedicated FAQ Page
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {/* Search & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`text-xs px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                selectedCategory === cat
                  ? "bg-indigo-600 text-white border-indigo-600 font-medium"
                  : "bg-slate-950 text-slate-300 border-slate-800 hover:border-indigo-500/40"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search restored questions..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Accordion List */}
      <div className="space-y-2.5">
        {filteredFaqs.map((faq) => {
          const isOpen = openId === faq.id;
          return (
            <div
              key={faq.id}
              className="rounded-xl bg-slate-950 border border-slate-800/90 overflow-hidden transition"
            >
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : faq.id)}
                className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-3 hover:bg-slate-900/50 transition cursor-pointer"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-indigo-400">
                      {faq.category}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-400/10 text-amber-300 border border-amber-400/20">
                      <Flame className="w-3 h-3" />
                      Asked {faq.askedCount}{" "}
                      {faq.askedCount === 1 ? "time" : "times"}
                    </span>
                    {faq.isUserSubmitted && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        Restored from Chatbot
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-slate-100">
                    {faq.question}
                  </p>
                </div>

                <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 shrink-0">
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-slate-800/60 text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}

        {filteredFaqs.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">
            No matching FAQ found. Ask this question in the{" "}
            <strong>Kalbu AI Companion</strong> at the bottom right and it will
            appear here automatically!
          </p>
        )}
      </div>
    </div>
  );
}
