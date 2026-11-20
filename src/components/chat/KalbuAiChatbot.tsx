// src/components/chat/KalbuAiChatbot.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  HelpCircle,
  MessageCircleHeart,
  Minimize2,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { CIRCUMPLEX_ANCHORS, EmotionRecordItem } from "@/lib/ai/circumplex";

interface ChatTurn {
  id: string;
  role: "assistant" | "user";
  text: string;
  askedAt?: string;
}

interface KalbuAiChatbotProps {
  latestRecord?: EmotionRecordItem;
}

const CHAT_HISTORY_STORAGE_KEY = "kalbu_chat_history_v1";

const DEFAULT_WELCOME_MESSAGE: ChatTurn = {
  id: "welcome-1",
  role: "assistant",
  text: "Hi! I'm **Kalbu AI Companion** 🌸. Every question you ask me is automatically saved to your chat history and synced to the **Frequently Asked Questions (FAQ)** database!",
};

const INITIAL_SUGGESTIONS = [
  "Is my diary completely private?",
  "How do the Emotion Graphs work?",
  "How does the AI understand my feelings?",
  "What is a Feeling Twin?",
  "How does Music Therapy help my mood?",
  "What are the rules on 18+ confessions?",
];

export default function KalbuAiChatbot({ latestRecord }: KalbuAiChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(INITIAL_SUGGESTIONS);
  const [messages, setMessages] = useState<ChatTurn[]>([
    DEFAULT_WELCOME_MESSAGE,
  ]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Restore saved chat history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatTurn[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      // Ignore storage read error
    }
  }, []);

  // Persist chat history whenever messages change
  useEffect(() => {
    try {
      if (messages.length > 1) {
        localStorage.setItem(
          CHAT_HISTORY_STORAGE_KEY,
          JSON.stringify(messages)
        );
      }
    } catch {
      // Ignore storage write error
    }
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  function handleResetHistory() {
    localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
    setMessages([DEFAULT_WELCOME_MESSAGE]);
  }

  async function sendQuestion(questionText: string) {
    const trimmed = questionText.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatTurn = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
      askedAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/kalbu-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: messages.slice(-6).map((m) => ({
            role: m.role,
            text: m.text,
          })),
          currentMood: latestRecord
            ? {
                emotion: latestRecord.primary_emotion,
                valence: latestRecord.valence,
                arousal: latestRecord.arousal,
                quadrant: latestRecord.quadrant,
              }
            : undefined,
        }),
      });

      const data = await res.json();
      const replyText =
        data.reply ||
        "I'm here with you in Kalbu. Feel free to ask about our E2EE diary, 416k emotion model, or music therapy!";

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          role: "assistant",
          text: replyText,
          askedAt: new Date().toISOString(),
        },
      ]);

      if (
        Array.isArray(data.suggestedPrompts) &&
        data.suggestedPrompts.length > 0
      ) {
        setSuggestions(data.suggestedPrompts);
      }

      // Notify the FAQ component / page to refresh immediately
      window.dispatchEvent(new CustomEvent("kalbu-faq-updated"));
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          role: "assistant",
          text: "I couldn't reach the guide service right now, but your local encrypted vault and piano therapy are working smoothly!",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  const userQuestionsCount = messages.filter((m) => m.role === "user").length;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-3 w-[350px] sm:w-[410px] rounded-3xl bg-slate-900 border-2 border-slate-800 shadow-2xl overflow-hidden flex flex-col">
          {/* Top Bar */}
          <div className="bg-slate-950 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full overflow-hidden border border-indigo-500/50 shrink-0 bg-slate-900">
                <img
                  src="/kalbu-logo.jpg"
                  alt="Kalbu AI"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-slate-100">
                    Kalbu AI Companion
                  </h4>
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    ● FAQ Sync Active
                  </span>
                </div>
                {latestRecord ? (
                  <p className="text-[10px] text-slate-400">
                    Mood:{" "}
                    <strong
                      className="capitalize"
                      style={{
                        color:
                          CIRCUMPLEX_ANCHORS[latestRecord.primary_emotion]
                            .color,
                      }}
                    >
                      {latestRecord.primary_emotion}
                    </strong>{" "}
                    • {userQuestionsCount} question(s) restored
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400">
                    {userQuestionsCount} question(s) restored in history
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Link
                href="/faq"
                className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 transition"
                title="Open Dedicated FAQ Page"
              >
                <HelpCircle className="w-3 h-3" />
                FAQ
              </Link>
              <button
                type="button"
                onClick={handleResetHistory}
                className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                title="Clear Chat Thread"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                title="Minimize Chat"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div
            ref={scrollRef}
            className="p-4 space-y-3 max-h-80 overflow-y-auto bg-slate-900"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line ${
                    m.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-sm shadow-sm"
                      : "bg-slate-950 text-slate-200 border border-slate-800 rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3.5 py-2 text-xs bg-slate-950 text-slate-400 border border-slate-800 inline-flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                  Saving to FAQ &amp; answering...
                </div>
              </div>
            )}
          </div>

          {/* Quick Suggestion Chips */}
          <div className="px-3.5 py-2 bg-slate-950/70 border-t border-slate-800/80 flex flex-wrap gap-1.5">
            {suggestions.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => sendQuestion(prompt)}
                className="text-[10px] px-2.5 py-1 rounded-full bg-slate-900 hover:bg-indigo-500/15 text-slate-300 hover:text-indigo-300 border border-slate-800 hover:border-indigo-500/30 transition cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendQuestion(input);
            }}
            className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question (auto-saved to FAQ)..."
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition cursor-pointer"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="group flex items-center gap-2.5 pl-2.5 pr-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl border-2 border-slate-900 transition cursor-pointer"
      >
        <div className="w-8 h-8 rounded-full overflow-hidden border border-white/40 bg-slate-950 shrink-0">
          <img
            src="/kalbu-logo.jpg"
            alt="Kalbu Assistant"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="text-left">
          <p className="text-xs font-semibold leading-tight flex items-center gap-1">
            {isOpen ? (
              <>
                Close Guide <X className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Ask Kalbu AI <MessageCircleHeart className="w-3.5 h-3.5" />
              </>
            )}
          </p>
          <p className="text-[10px] opacity-90 leading-tight">
            Auto-Synced with FAQ Page
          </p>
        </div>
      </button>
    </div>
  );
}
