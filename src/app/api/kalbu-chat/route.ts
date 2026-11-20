// src/app/api/kalbu-chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  computeCircumplexCoordinates,
  EmotionLabel,
  EmotionProbabilities,
  estimateEmotionProbabilitiesFallback,
} from "@/lib/ai/circumplex";
import { recordQuestionToFaqStore } from "@/app/api/faq/route";

interface ChatTurnHistory {
  role: "assistant" | "user";
  text: string;
}

interface ChatMessageInput {
  message: string;
  history?: ChatTurnHistory[];
  currentMood?: {
    emotion: EmotionLabel;
    valence: number;
    arousal: number;
    quadrant: string;
  };
}

interface KnowledgeTopic {
  id: string;
  category: string;
  keywords: string[];
  buildAnswer: (
    isMalay: boolean,
    mood?: ChatMessageInput["currentMood"]
  ) => string;
  followUps: (isMalay: boolean) => string[];
}

function buildKalbuSystemPrompt(
  currentMood?: ChatMessageInput["currentMood"]
): string {
  return `You are "Kalbu AI Companion", the warm, empathetic assistant for the Kalbu web application ("Digital Diary & Emotional Safe Haven").
CRITICAL STYLE RULES:
1. NEVER explain things using complicated mathematical formulas, equations, vectors, or heavy cryptographic jargon. Users just want to understand the main concept in simple, everyday, comforting language.
2. Reply in the same language the user uses (Bahasa Melayu, English, or casual Manglish).
3. Keep answers clear, friendly, and concise (around 3-6 short bullet points or 2 short paragraphs).

KEY FACTS ABOUT KALBU WEBSITE:
- Main Purpose: A private digital diary and emotional safe-haven for students and young adults dealing with stress, burnout, and emotional fatigue.
- 6 Top Navigation Tabs:
  1. Confession Diary (Main Menu): Users write private reflections locked in their browser with their personal Vault Passphrase so nobody else (not even admins) can read them.
  2. Feeling Twin: Connects users 100% anonymously with another student experiencing the same mood right now so they can send kind encouragement notes without sharing diary text.
  3. Music Therapy: Plays calming Piano Melodies, Spotify tracks, or YouTube streams in 3 gentle steps tailored to the user's mood. The music keeps playing continuously even when switching tabs!
  4. Emotion Graphs: Maps feelings using Pleasantness (positive vs heavy) and Energy Level (calm vs tense) across the month.
  5. 416k AI Model: Trained on 416,000+ real emotional reflections across 6 emotions (Sadness, Joy, Love, Anger, Fear, Surprise) with ~89% accuracy.
  6. FAQ: Every question asked in this chatbot is automatically saved and restored onto the FAQ page, ranked by how often it is asked.
- 18+ Policy & 2-Strike Ban: 18+ or sexually explicit confessions are strictly prohibited. 1st attempt is blocked with a serious red warning and the words are banned. 2nd attempt results in a permanent account ban.
- User's Current Detected Mood on Dashboard: ${currentMood?.emotion ?? "joy"} (${currentMood?.quadrant ?? "High-Energy Pleasant"}).`;
}

function categorizeQuestion(query: string): string {
  const q = query.toLowerCase();
  if (/(18\+|ban|sexual|sex|porn|lucah|haram|rule|strike|attempt)/.test(q)) {
    return "18+ Policy & Safety";
  }
  if (/(encrypt|e2ee|privacy|private|safe|passphrase|selamat|rahsia|kunci)/.test(q)) {
    return "Privacy & Secret Diary";
  }
  if (/(graph|chart|circumplex|valence|arousal|graf|peta)/.test(q)) {
    return "Emotion Graphs & Mood Map";
  }
  if (/(416k|ai|accuracy|model|train|detect|ketepatan)/.test(q)) {
    return "How the AI Understands You";
  }
  if (/(twin|match|peer|anonymous|kawan|padanan)/.test(q)) {
    return "Feeling Twin";
  }
  if (/(music|piano|spotify|youtube|song|lagu|muzik)/.test(q)) {
    return "Music Therapy";
  }
  if (/(faq|restore|history|soalan)/.test(q)) {
    return "FAQ & Chatbot";
  }
  if (/(breath|calm|stress|burnout|sad|anxious|tenang|penat|sedih)/.test(q)) {
    return "Wellbeing & Calming Tips";
  }
  return "General Guide";
}

/**
 * Calls Google Gemini API (using GEMINI_API_KEY or GOOGLE_API_KEY) if configured.
 */
async function tryAskGemini(
  userMessage: string,
  history: ChatTurnHistory[],
  currentMood?: ChatMessageInput["currentMood"]
): Promise<string | null> {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ""
  ).trim();
  if (!apiKey) return null;

  const systemPrompt = buildKalbuSystemPrompt(currentMood);
  const conversationContext = history
    .slice(-6)
    .map((h) => `${h.role === "user" ? "User" : "Kalbu AI"}: ${h.text}`)
    .join("\n");

  const fullInput = conversationContext
    ? `${conversationContext}\nUser: ${userMessage}`
    : userMessage;

  // Try modern Interactions API (gemini-4-hydrogen) first, then fallback to generateContent
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-4-hydrogen",
          system_instruction: systemPrompt,
          input: fullInput,
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (data.output_text) return String(data.output_text).trim();
    }
  } catch {
    // Fall through to standard REST endpoint
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            ...history.slice(-6).map((h) => ({
              role: h.role === "user" ? "user" : "model",
              parts: [{ text: h.text }],
            })),
            {
              role: "user",
              parts: [{ text: userMessage }],
            },
          ],
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return String(text).trim();
    }
  } catch (err) {
    console.warn("[Kalbu Chat] Gemini API call warning:", err);
  }

  return null;
}

/**
 * Calls OpenAI ChatGPT API (using OPENAI_API_KEY) if configured.
 */
async function tryAskOpenAiChatGpt(
  userMessage: string,
  history: ChatTurnHistory[],
  currentMood?: ChatMessageInput["currentMood"]
): Promise<string | null> {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: buildKalbuSystemPrompt(currentMood),
          },
          ...history.slice(-6).map((h) => ({
            role: h.role,
            content: h.text,
          })),
          {
            role: "user",
            content: userMessage,
          },
        ],
        temperature: 0.7,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (text) return String(text).trim();
    }
  } catch (err) {
    console.warn("[Kalbu Chat] OpenAI API call warning:", err);
  }

  return null;
}

let cachedWeights: Record<string, number[]> | null = null;
function load416kWeights(): Record<string, number[]> | null {
  if (cachedWeights) return cachedWeights;
  try {
    const p = path.join(
      process.cwd(),
      "src",
      "lib",
      "ai",
      "trained_416k_weights.json"
    );
    if (fs.existsSync(p)) {
      cachedWeights = JSON.parse(fs.readFileSync(p, "utf-8"));
      return cachedWeights;
    }
  } catch {
    // ignore
  }
  return null;
}

function analyzeQuestionAffect(text: string) {
  const weights = load416kWeights();
  if (weights) {
    const words = text.toLowerCase().match(/[a-z]{2,}/g) || [];
    const scores = [0, 0, 0, 0, 0, 0];
    let matched = 0;
    for (const w of words) {
      const vec = weights[w];
      if (vec && vec.length === 6) {
        matched++;
        for (let c = 0; c < 6; c++) scores[c] += vec[c];
      }
    }
    if (matched > 0) {
      const scale = (1.0 / Math.sqrt(matched)) * 1.6;
      const scaled = scores.map((s) => s * scale);
      const maxS = Math.max(...scaled);
      const exps = scaled.map((s) => Math.exp(s - maxS));
      const sumExp = exps.reduce((a, b) => a + b, 0) || 1;
      const probs: EmotionProbabilities = {
        sadness: exps[0] / sumExp,
        joy: exps[1] / sumExp,
        love: exps[2] / sumExp,
        anger: exps[3] / sumExp,
        fear: exps[4] / sumExp,
        surprise: exps[5] / sumExp,
      };
      return computeCircumplexCoordinates(probs);
    }
  }
  return computeCircumplexCoordinates(
    estimateEmotionProbabilitiesFallback(text)
  );
}

const KNOWLEDGE_GRAPH: KnowledgeTopic[] = [
  {
    id: "moderation-18plus",
    category: "18+ Policy & Safety",
    keywords: [
      "18+",
      "ban",
      "banned",
      "restriction",
      "restrictions",
      "sexual",
      "sex",
      "porn",
      "strike",
      "attempt",
      "warning",
      "rule",
      "rules",
      "lucah",
      "sekat",
      "amaran",
      "haram",
    ],
    buildAnswer: (isMalay) =>
      isMalay
        ? `**Peraturan Larangan 18+ di Kalbu:**\nKalbu ialah ruang selamat untuk kesihatan emosi, jadi sebarang luahan berunsur **18+ atau seksual adalah dilarang sama sekali**:\n- **Cubaan Pertama (Amaran Terakhir):** Luahan tersebut akan disekat daripada diposkan, perkataan berkaitan akan diharamkan di laman web, dan amaran merah serius akan dipaparkan.\n- **Cubaan Kedua (Ban Kekal):** Akaun anda akan **diban secara kekal** daripada menggunakan laman web ini.`
        : `**Kalbu's 18+ Content Rule & 2-Attempt Ban:**\nKalbu is a safe emotional sanctuary, so **18+ or sexually explicit confessions are strictly not allowed**:\n- **1st Attempt (Final Warning):** Your post is immediately blocked, the inappropriate words are permanently banned on the website, and a serious red warning pops up.\n- **2nd Attempt (Permanent Ban):** Your account will be **permanently banned** from using Kalbu.`,
    followUps: (isMalay) =>
      isMalay
        ? [
            "Adakah diari biasa saya selamat dan rahsia?",
            "Kenapa muzik terus bermain bila saya tukar halaman?",
            "Macam mana fungsi Feeling Twin berfungsi?",
          ]
        : [
            "Is my normal diary completely private?",
            "Why does music keep playing when I switch pages?",
            "How does Feeling Twin connect me with other users?",
          ],
  },
  {
    id: "e2ee-privacy",
    category: "Privacy & Secret Diary",
    keywords: [
      "encrypt",
      "encrypted",
      "encryption",
      "e2ee",
      "privacy",
      "private",
      "safe",
      "security",
      "passphrase",
      "key",
      "vault",
      "lock",
      "unlock",
      "selamat",
      "rahsia",
      "kunci",
      "kata laluan",
    ],
    buildAnswer: (isMalay) =>
      isMalay
        ? `**Bagaimana Kalbu Merahsiakan Diari Anda:**\nSetiap luahan hati yang anda tulis dikunci dengan **kata laluan peribadi (Vault Passphrase)** anda sendiri sebelum ia disimpan:\n- **Hanya Anda Boleh Membacanya:** Diari anda ditukar menjadi kod rahsia yang tidak boleh dibaca oleh sesiapa pun (termasuk pemilik laman web).\n- **Cuba Uji Sendiri:** Jika anda menukar kata laluan di penjuru kanan atas kepada kata laluan yang salah, semua diari anda yang tersimpan akan terus terkunci sehingga anda memasukkan kata laluan asal anda semula!`
        : `**How Kalbu Keeps Your Diary 100% Secret:**\nEverything you write is locked using your personal **Vault Passphrase** right inside your browser before it is saved:\n- **For Your Eyes Only:** Your words are scrambled into secret code so nobody else — not even the website admins or database — can read your confessions.\n- **Try Testing It:** If you type a different passphrase in the top-right box and click **Unlock**, your saved entries immediately lock up until you enter your real passphrase again!`,
    followUps: () => [
      "How do the Emotion Graphs work?",
      "How does Kalbu choose music for my mood?",
      "What is a Feeling Twin?",
    ],
  },
  {
    id: "circumplex-affect",
    category: "Emotion Graphs & Mood Map",
    keywords: [
      "circumplex",
      "russell",
      "valence",
      "arousal",
      "quadrant",
      "graph",
      "graphs",
      "chart",
      "graf",
      "peta",
    ],
    buildAnswer: (isMalay, mood) =>
      isMalay
        ? `**Bagaimana Graf Emosi Kalbu Berfungsi:**\nKalbu memetakan perasaan anda berdasarkan dua perkara mudah:\n1. **Tahap Kesenangan (Positif atau Berat):** Sama ada perasaan itu menyenangkan atau menyedihkan.\n2. **Tahap Tenaga (Tenang atau Tegang):** Sama ada anda berasa letih/tenang ataupun berdebar/bertenaga.\n\nSekarang mood anda dikesan sebagai **${mood?.emotion ?? "joy"}**. Anda boleh klik tab **Emotion Graphs** di bar atas untuk melihat perubahan emosi harian anda sepanjang bulan ini!`
        : `**How Kalbu's Emotion Graphs Work:**\nHuman feelings aren't just simple labels. Kalbu maps your mood using two simple ideas:\n1. **Pleasantness:** How positive or heavy your mood feels.\n2. **Energy Level:** Whether your mind feels calm/low-energy or tense/high-energy.\n\nRight now your mood is **${mood?.emotion ?? "joy"}**. Click the **Emotion Graphs** tab at the top bar to see your mood dots and how your feelings have changed over the month!`,
    followUps: () => [
      "How does the AI detect my emotion from my writing?",
      "What is a Feeling Twin?",
      "How does the Music Therapy help my mood?",
    ],
  },
  {
    id: "ml-416k-pipeline",
    category: "How the AI Understands You",
    keywords: [
      "416k",
      "dataset",
      "accuracy",
      "model",
      "train",
      "trained",
      "ai",
      "ketepatan",
      "latihan",
    ],
    buildAnswer: (isMalay) =>
      isMalay
        ? `**Bagaimana AI Kalbu Memahami Perasaan Anda:**\n- **Belajar Daripada 416,000 Contoh Luahan Sebenar:** AI kami telah dilatih menggunakan lebih 416,000 ayat emosi untuk mengenali 6 perasaan utama: **Sedih (Sadness), Gembira (Joy), Kasih Sayang (Love), Marah (Anger), Cemas/Takut (Fear), dan Terkejut (Surprise)**.\n- **Ketepatan Tinggi (~89%):** Apabila anda menulis luahan, AI mengenal pasti perkataan-perkataan penting yang menggambarkan perasaan anda supaya ia boleh mencadangkan muzik dan rakan *Feeling Twin* yang paling tepat.`
        : `**How Kalbu's AI Understands Your Feelings:**\n- **Trained on 416,000+ Real Emotional Reflections:** Our AI learned from over 416,000 examples of how people express **Sadness, Joy, Love, Anger, Fear/Anxiety, and Surprise**.\n- **High Accuracy (~89%):** When you write a confession, the AI spots the key emotional words in your story so it can automatically match you with the right therapeutic music and an anonymous **Feeling Twin** who understands what you're going through.`,
    followUps: () => [
      "What is a Feeling Twin?",
      "How does Kalbu choose music for my mood?",
      "Is my diary kept private?",
    ],
  },
  {
    id: "feeling-twin",
    category: "Feeling Twin",
    keywords: [
      "twin",
      "feeling twin",
      "match",
      "matcher",
      "matching",
      "peer",
      "anonymous",
      "solidarity",
      "kawan",
      "padanan",
    ],
    buildAnswer: (isMalay, mood) =>
      isMalay
        ? `**Apa Itu "Feeling Twin"?**\nBila kita stres atau sedih, kita sering rasa keseorangan. Fungsi **Feeling Twin** membantu anda berhubung secara **100% tanpa nama (anonymous)** dengan pelajar lain yang sedang merasai emosi yang sama (**${mood?.emotion ?? "joy"}**) pada waktu ini:\n- **Tiada Diari Dikongsi:** Rakan *Feeling Twin* anda **tidak boleh** membaca diari anda, dan anda juga tidak melihat diari mereka.\n- **Hantar Kata Semangat:** Anda boleh klik tab **Feeling Twin** di bar atas untuk menghantar mesej sokongan ringkas supaya mereka tahu mereka tidak keseorangan!`
        : `**What is a "Feeling Twin"?**\nWhen you're stressed or burned out, it's easy to feel like you're the only one struggling. **Feeling Twin** anonymously pairs you with another student who is feeling the exact same mood (**${mood?.emotion ?? "joy"}**) right now:\n- **100% Anonymous & Private:** Neither of you ever sees the other person's real name or diary text.\n- **Send Kind Encouragement:** Open the **Feeling Twin** tab in the top bar to send a quick anonymous note of encouragement so you both know you aren't alone!`,
    followUps: () => [
      "How does the Music Therapy work?",
      "Is my identity and diary completely private?",
      "Guide me through a quick calming exercise",
    ],
  },
  {
    id: "music-therapy",
    category: "Music Therapy",
    keywords: [
      "music",
      "iso",
      "compensatory",
      "piano",
      "spotify",
      "youtube",
      "song",
      "songs",
      "playlist",
      "audio",
      "sound",
      "play",
      "playing",
      "lagu",
      "muzik",
      "bunyi",
    ],
    buildAnswer: (isMalay, mood) =>
      isMalay
        ? `**Bagaimana Terapi Muzik Kalbu Membantu Emosi Anda:**\nApabila anda sedang sedih atau cemas, mendengar lagu yang terlalu rancak secara tiba-tiba selalunya tidak membantu. Oleh itu, Kalbu menyusun **3 Peringkat Lagu** khas untuk mood anda (**${mood?.emotion ?? "joy"}**):\n1. **Lagu 1 (Selami Perasaan):** Rentak lagu yang memahami dan menyamai perasaan anda sekarang.\n2. **Lagu 2 (Jambatan Ketenangan):** Melodi piano hangat yang mula memperlahankan rasa tegang.\n3. **Lagu 3 (Pulih & Tenang):** Membawa hati dan fikiran anda kembali tenang.\n\nAnda boleh mendengar **Melodi Piano**, **Spotify**, atau **YouTube** — dan muzik tersebut **akan terus bermain** walaupun anda bertukar ke halaman lain!`
        : `**How Kalbu's Music Therapy Helps Your Mood:**\nWhen you feel anxious or sad, jumping straight into loud happy music often feels uncomfortable. Instead, Kalbu guides your mood gently in **3 steps** tailored to your current feeling (**${mood?.emotion ?? "joy"}**):\n1. **Step 1 (Match Your Mood):** Music that meets you where you are right now so you feel understood.\n2. **Step 2 (Gentle Bridge):** Warm piano melodies that slowly ease tension.\n3. **Step 3 (Calm & Uplift):** Guides your mind into a peaceful, rested state.\n\nYou can play **Piano Melodies**, **Spotify**, or **YouTube** — and the music **keeps playing continuously** even when you switch tabs!`,
    followUps: () => [
      "How do the Emotion Graphs work?",
      "What is a Feeling Twin?",
      "Guide me through a calming breathing exercise",
    ],
  },
  {
    id: "faq-restoration",
    category: "FAQ & Chatbot",
    keywords: ["faq", "frequently", "restore", "restored", "history", "chatbot", "soalan"],
    buildAnswer: (isMalay) =>
      isMalay
        ? `**Bagaimana Halaman FAQ Berfungsi Dengan Chatbot Ini:**\nSetiap soalan yang anda tanya kepada saya di dalam chatbot ini akan **disimpan secara automatik** dan dipaparkan terus di halaman **FAQ** (boleh dibuka melalui butang **FAQ** pada bar di bahagian atas). Soalan yang paling kerap ditanya oleh pengguna akan disusun di bahagian paling atas supaya mudah dirujuk semula!`
        : `**How the Live FAQ Page Works:**\nEvery question you ask me in this chatbot is **automatically saved and restored** onto the website's **FAQ** tab (at the top menu bar). Questions that users ask most often automatically move to the top of the list so anyone can find quick answers easily!`,
    followUps: () => [
      "What can I do on each tab at the top bar?",
      "How does Kalbu keep my diary secret?",
      "What are the rules on 18+ content?",
    ],
  },
  {
    id: "website-navigation",
    category: "Using the Website",
    keywords: [
      "kalbu",
      "meaning",
      "navigation",
      "menu",
      "tabs",
      "use",
      "start",
      "what is",
      "purpose",
      "guna",
      "maksud",
    ],
    buildAnswer: (isMalay) =>
      isMalay
        ? `**Apa Itu Kalbu & Cara Menggunakannya:**\n*"Kalbu"* bermaksud hati sanubari. Laman web ini dibina khas untuk pelajar melepaskan tekanan dan menjaga kesihatan emosi melalui **6 menu utama di bar atas**:\n1. 📖 **Confession Diary (Menu Utama):** Tulis luahan hati anda dengan selamat dan rahsia.\n2. 🤝 **Feeling Twin:** Lihat rakan tanpa nama yang berkongsi perasaan yang sama dengan anda dan hantar kata semangat.\n3. 🎹 **Music Therapy:** Dengar muzik piano, Spotify atau YouTube mengikut mood anda (muzik kekal bermain walaupun anda tukar halaman!).\n4. 📊 **Emotion Graphs:** Lihat peta emosi dan perkembangan perasaan anda sepanjang bulan.\n5. 🧠 **416k AI Model:** Lihat bagaimana AI Kalbu dilatih dan ketepatannya.\n6. ❓ **FAQ:** Senarai soalan lazim yang dikumpul secara langsung daripada chatbot ini.`
        : `**What is Kalbu & How to Use It:**\n*"Kalbu"* means your deepest heart. This website is a private emotional safe-haven for students dealing with stress or burnout, organized into **6 easy tabs at the top bar**:\n1. 📖 **Confession Diary (Main Menu):** Write your private thoughts safely — locked with your personal passphrase.\n2. 🤝 **Feeling Twin:** See an anonymous peer who shares your current mood and send a kind note.\n3. 🎹 **Music Therapy:** Listen to calming Piano, Spotify, or YouTube tracks chosen for your mood (music keeps playing even when you change pages!).\n4. 📊 **Emotion Graphs:** Track how your mood and energy change over the month.\n5. 🧠 **416k AI Model:** See the accuracy summary of the AI behind Kalbu.\n6. ❓ **FAQ:** Browse all frequently asked questions saved automatically from this chatbot.`,
    followUps: () => [
      "How does Kalbu keep my diary secret?",
      "How does the Music Therapy choose songs?",
      "What are the rules on 18+ confessions?",
    ],
  },
  {
    id: "wellbeing-grounding",
    category: "Wellbeing & Calming Tips",
    keywords: [
      "breath",
      "breathing",
      "calm",
      "relax",
      "grounding",
      "exercise",
      "sleep",
      "burnout",
      "overwhelmed",
      "panic",
      "deadline",
      "exam",
      "study",
      "lonely",
      "tenang",
      "nafas",
      "penat",
      "stres",
      "sunyi",
      "takut",
      "sedih",
    ],
    buildAnswer: (isMalay, mood) =>
      isMalay
        ? `**Cara Cepat Tenangkan Fikiran (Untuk Mood ${mood?.emotion ?? "Anda"} Sekarang):**\n1. **Pasang Lagu Piano:** Klik tab **Music Therapy** di atas dan tekan **Play** pada Lagu 1 — biarkan alunan piano itu bermain di latar belakang.\n2. **Tarik Nafas Perlahan (4-7-8):**\n   - Tarik nafas melalui hidung selama **4 saat**.\n   - Tahan nafas selama **7 saat**.\n   - Hembus perlahan-lahan melalui mulut selama **8 saat**.\n3. **Luahkan Dalam Diari:** Kembali ke tab **Confession Diary** dan tulis apa sahaja yang membebankan fikiran anda. Tiada siapa boleh membacanya, dan meluahkannya membantu hati berasa lebih ringan.`
        : `**Quick 60-Second Calming Reset (For Your ${mood?.emotion ?? "Current"} Mood):**\n1. **Put On Gentle Piano:** Click the **Music Therapy** tab at the top and press **Play** on Track 1 — let it keep playing in the background.\n2. **Slow 4-7-8 Breathing:**\n   - Breathe in quietly through your nose for **4 seconds**.\n   - Hold gently for **7 seconds**.\n   - Exhale slowly through your mouth for **8 seconds**.\n3. **Let It Out in Your Diary:** Go to the **Confession Diary** tab and write down whatever is bothering you without holding back — getting it out of your head and onto the page helps relieve mental pressure.`,
    followUps: () => [
      "How does Music Therapy help my mood?",
      "What is a Feeling Twin?",
      "Is my diary completely private?",
    ],
  },
];

function adaptResponseToEveryQuestion(
  query: string,
  history: ChatTurnHistory[] = [],
  currentMood?: ChatMessageInput["currentMood"]
): { reply: string; category: string; suggestedPrompts: string[] } {
  const cleanQ = query.trim();
  const qLower = cleanQ.toLowerCase();
  const isMalay =
    /\b(apa|macam mana|bagaimana|kenapa|boleh|tolong|saya|aku|emosi|lagu|selamat|rahsia|penat|sedih|marah|takut|gembira|kawan|haram|guna|maksud)\b/.test(
      qLower
    );

  const scoredTopics = KNOWLEDGE_GRAPH.map((topic) => {
    let score = 0;
    for (const kw of topic.keywords) {
      if (qLower.includes(kw)) {
        score += kw.length >= 6 ? 3 : 2;
      }
    }
    return { topic, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredTopics.length > 0) {
    const primary = scoredTopics[0].topic;
    const secondary =
      scoredTopics.length > 1 && scoredTopics[1].score >= 3
        ? scoredTopics[1].topic
        : null;

    const combinedBody = secondary
      ? `${primary.buildAnswer(isMalay, currentMood)}\n\n---\n\n${secondary.buildAnswer(isMalay, currentMood)}`
      : primary.buildAnswer(isMalay, currentMood);

    return {
      category: primary.category,
      reply: combinedBody,
      suggestedPrompts: primary.followUps(isMalay),
    };
  }

  const lastAssistantTurn = [...history]
    .reverse()
    .find((h) => h.role === "assistant");
  if (
    lastAssistantTurn &&
    /\b(more|why|example|detail|explain|how|lagi|contoh|kenapa|terangkan)\b/.test(
      qLower
    )
  ) {
    const prevScored = KNOWLEDGE_GRAPH.map((topic) => {
      let score = 0;
      for (const kw of topic.keywords) {
        if (lastAssistantTurn.text.toLowerCase().includes(kw)) score += 1;
      }
      return { topic, score };
    }).sort((a, b) => b.score - a.score);

    if (prevScored[0] && prevScored[0].score > 0) {
      const top = prevScored[0].topic;
      return {
        category: top.category,
        reply: top.buildAnswer(isMalay, currentMood),
        suggestedPrompts: top.followUps(isMalay),
      };
    }
  }

  const questionAffect = analyzeQuestionAffect(cleanQ);
  const detectedEmotion = questionAffect.primaryEmotion;

  const emotionGuidance: Record<
    EmotionLabel,
    { en: string; ms: string; tabTipEn: string; tabTipMs: string }
  > = {
    sadness: {
      en: "It sounds like you're carrying something heavy or tiring right now. Please remember it's completely okay to feel this way, and you don't have to go through it alone.",
      ms: "Kedengaran seperti anda sedang memikul sesuatu yang berat atau memenatkan. Perasaan itu sangat wajar, dan anda tidak perlu menghadapinya seorang diri.",
      tabTipEn:
        "You can write your thoughts freely in the **Confession Diary** while playing gentle rain piano in the **Music Therapy** tab.",
      tabTipMs:
        "Anda boleh meluahkan segalanya di dalam **Confession Diary** sambil mendengar alunan piano lembut di tab **Music Therapy**.",
    },
    fear: {
      en: "It sounds like there's quite a bit of worry or pressure on your mind. Taking one slow breath and breaking things down one small step at a time really helps.",
      ms: "Nampaknya ada perkara yang sedang merisaukan atau memberi tekanan kepada fikiran anda. Tarik nafas perlahan-lahan dan ambil masa untuk bertenang seketika.",
      tabTipEn:
        "Try turning on the grounding piano melody in **Music Therapy**, or check **Feeling Twin** to see another student going through a similar moment.",
      tabTipMs:
        "Cuba pasang melodi piano penenang di **Music Therapy**, atau buka tab **Feeling Twin** untuk melihat rakan yang turut merasai perkara yang sama.",
    },
    anger: {
      en: "I can hear how frustrating that is. Kalbu is a safe, judgment-free place where you can let all of that frustration out privately.",
      ms: "Saya faham betapa mengecewakannya situasi itu. Kalbu ialah ruang selamat tanpa prejudis untuk anda melepaskan rasa marah atau tertekan secara rahsia.",
      tabTipEn:
        "Write it all out in the **Confession Diary** — it's locked with your personal passphrase so nobody else will ever see it.",
      tabTipMs:
        "Tuliskan semuanya di dalam **Confession Diary** — ia dikunci dengan kata laluan anda sendiri supaya tiada siapa boleh membacanya.",
    },
    joy: {
      en: "I love the positive energy in your message! Kalbu is here both to comfort you on hard days and to celebrate your good moments.",
      ms: "Seronok membaca mesej positif anda! Kalbu sentiasa ada untuk menemani anda pada hari yang sukar mahupun meraikan detik gembira anda.",
      tabTipEn:
        "Save this happy moment in your **Confession Diary** so you can see your mood chart rise in the **Emotion Graphs** tab!",
      tabTipMs:
        "Simpan detik gembira ini dalam **Confession Diary** supaya anda boleh melihat graf emosi anda meningkat di tab **Emotion Graphs**!",
    },
    love: {
      en: "That's a really warm and thoughtful message. Connection and kindness are what Kalbu is all about.",
      ms: "Mesej yang sangat baik dan penuh empati. Semangat saling menyokong inilah tujuan utama Kalbu dibina.",
      tabTipEn:
        "You can spread that warmth by visiting the **Feeling Twin** tab and sending an anonymous encouraging note to a peer!",
      tabTipMs:
        "Anda boleh berkongsi semangat itu dengan membuka tab **Feeling Twin** dan menghantar nota sokongan tanpa nama kepada rakan sebaya!",
    },
    surprise: {
      en: "That's a great question! In short, Kalbu is designed to be your private emotional safe-haven where your diary stays locked, your mood is gently tracked, and calming music accompanies you across every page.",
      ms: "Soalan yang menarik! Secara ringkasnya, Kalbu ialah ruang selamat emosi peribadi anda di mana diari anda dikunci rapat, mood anda dipantau dengan lembut, dan muzik terapi menemani anda di setiap halaman.",
      tabTipEn:
        "Feel free to explore the 6 activity tabs at the top bar, or check the **FAQ** tab to see all saved questions!",
      tabTipMs:
        "Anda boleh mencuba 6 tab aktiviti pada bar di bahagian atas, atau buka tab **FAQ** untuk melihat semua soalan yang telah disimpan!",
    },
  };

  const g = emotionGuidance[detectedEmotion];

  return {
    category: "General Guide",
    reply: isMalay
      ? `Mengenai **"${cleanQ}"**:\n\n${g.ms}\n\n💡 **Apa yang anda boleh buat sekarang:** ${g.tabTipMs}`
      : `About **"${cleanQ}"**:\n\n${g.en}\n\n💡 **What you can try right now:** ${g.tabTipEn}`,
    suggestedPrompts: [
      "What can I do on each tab at the top bar?",
      "Is my diary completely private?",
      "How does Kalbu choose music for my mood?",
      "What are the rules on 18+ confessions?",
    ],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatMessageInput;
    const userMessage = (body.message || "").trim();

    if (!userMessage) {
      return NextResponse.json(
        { error: "Please enter a question." },
        { status: 400 }
      );
    }

    const history = body.history || [];

    // Priority 1: Live Google Gemini API (GEMINI_API_KEY)
    const geminiReply = await tryAskGemini(
      userMessage,
      history,
      body.currentMood
    );

    // Priority 2: Live OpenAI ChatGPT API (OPENAI_API_KEY)
    const openAiReply =
      !geminiReply
        ? await tryAskOpenAiChatGpt(userMessage, history, body.currentMood)
        : null;

    let finalReply: string;
    let finalCategory: string;
    let suggestedPrompts: string[];

    if (geminiReply || openAiReply) {
      finalReply = (geminiReply || openAiReply)!;
      finalCategory = categorizeQuestion(userMessage);
      suggestedPrompts = [
        "Is my diary completely private?",
        "How does Music Therapy help my mood?",
        "What is a Feeling Twin?",
        "What are the rules on 18+ confessions?",
      ];
    } else {
      // Priority 3: Built-in Kalbu Knowledge & Affective Engine fallback
      const fallback = adaptResponseToEveryQuestion(
        userMessage,
        history,
        body.currentMood
      );
      finalReply = fallback.reply;
      finalCategory = fallback.category;
      suggestedPrompts = fallback.suggestedPrompts;
    }

    // Automatically persist/restore every asked question into the FAQ database
    const updatedFaqs = recordQuestionToFaqStore(
      userMessage,
      finalReply,
      finalCategory
    );

    return NextResponse.json(
      {
        reply: finalReply,
        category: finalCategory,
        suggestedPrompts,
        provider: geminiReply
          ? "gemini"
          : openAiReply
          ? "chatgpt"
          : "kalbu-knowledge-engine",
        faqs: updatedFaqs,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[Kalbu Chat API Error]:", err);
    return NextResponse.json(
      { error: "Failed to generate assistant response." },
      { status: 500 }
    );
  }
}
