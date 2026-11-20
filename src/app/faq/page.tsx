// src/app/faq/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, HelpCircle } from "lucide-react";
import DynamicFaqSection from "@/components/faq/DynamicFaqSection";
import KalbuAiChatbot from "@/components/chat/KalbuAiChatbot";

export default function KalbuFaqPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-indigo-500/60 shadow-md bg-slate-950 shrink-0">
              <img
                src="/kalbu-logo.jpg"
                alt="Kalbu Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-serif font-bold tracking-wide text-slate-100">
                  KALBU — Frequently Asked Questions
                </h1>
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  Live Chatbot Knowledge Base
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Every question asked in the Kalbu AI Chatbot is automatically
                restored and ranked here
              </p>
            </div>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Kalbu Sanctuary
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        <div className="rounded-3xl bg-slate-900/95 border border-slate-800 p-6 shadow-md flex flex-col sm:flex-row items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <HelpCircle className="w-8 h-8" />
          </div>
          <div className="space-y-1 text-center sm:text-left">
            <h2 className="text-xl font-serif font-bold text-slate-100">
              Kalbu Architecture &amp; Emotional Sanctuary FAQ
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Try asking any new question in the{" "}
              <strong>Ask Kalbu AI Companion</strong> button at the bottom-right
              corner — it will automatically save, increment its ask frequency,
              and appear in the list below in real time!
            </p>
          </div>
        </div>

        <DynamicFaqSection showFullPageLink={false} />
      </main>

      <KalbuAiChatbot />
    </div>
  );
}
