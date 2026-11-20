// src/components/auth/KalbuAuthGate.tsx
"use client";

import React, { useState } from "react";
import {
  ArrowLeft,
  BookLock,
  CheckCircle2,
  FileText,
  Globe,
  KeyRound,
  LogIn,
  Mail,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
  X,
} from "lucide-react";

export interface AuthenticatedKalbuUser {
  id: string; // Email is the unique primary ID in the database
  uniqueEmailId: string;
  email: string;
  anonymousHandle: string;
  passphrase: string;
  agreedToTermsAt: string;
}

interface KalbuAuthGateProps {
  onAuthenticated: (user: AuthenticatedKalbuUser) => void;
}

export default function KalbuAuthGate({ onAuthenticated }: KalbuAuthGateProps) {
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [lang, setLang] = useState<"en" | "bm">("en");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [anonymousHandle, setAnonymousHandle] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showFullTermsModal, setShowFullTermsModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email Confirmation Step State (Business Email stays 100% hidden in backend .env.local)
  const [pendingVerification, setPendingVerification] = useState<{
    email: string;
    sentViaLiveSmtp: boolean;
    smtpStatus: string;
    previewCode?: string;
  } | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [resendSuccessMsg, setResendSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResendSuccessMsg(null);

    if (authMode === "register" && !agreedToTerms) {
      setError(
        lang === "en"
          ? "Mandatory: You must check the box to agree to Kalbu's Terms & Conditions and Privacy Policy before registering."
          : "Wajib: Anda mesti menanda kotak persetujuan Terma & Syarat serta Dasar Privasi Kalbu sebelum mendaftar."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: authMode,
          email,
          password,
          anonymousHandle,
          agreedToTerms,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      // If email verification is required (after registration or unverified login)
      if (data.requiresEmailVerification) {
        setPendingVerification({
          email: data.email,
          sentViaLiveSmtp: Boolean(data.sentViaLiveSmtp),
          smtpStatus: data.smtpStatus || "",
          previewCode: data.previewCodeForLocalDev,
        });
        setOtpCode("");
        return;
      }

      onAuthenticated({
        id: data.user.email, // Email is the unique primary ID
        uniqueEmailId: data.user.email,
        email: data.user.email,
        anonymousHandle: data.user.anonymousHandle,
        passphrase: password,
        agreedToTermsAt: data.user.agreedToTermsAt,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Could not complete request.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyEmailCode(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingVerification) return;
    setError(null);
    setResendSuccessMsg(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify-email",
          email: pendingVerification.email,
          verificationCode: otpCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Verification code did not match.");
      }

      onAuthenticated({
        id: data.user.email,
        uniqueEmailId: data.user.email,
        email: data.user.email,
        anonymousHandle: data.user.anonymousHandle,
        passphrase: password,
        agreedToTermsAt: data.user.agreedToTermsAt,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Invalid confirmation code.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendCode() {
    if (!pendingVerification) return;
    setError(null);
    setResendSuccessMsg(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resend-code",
          email: pendingVerification.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not resend confirmation email.");
      }
      setPendingVerification({
        email: data.email,
        sentViaLiveSmtp: Boolean(data.sentViaLiveSmtp),
        smtpStatus: data.smtpStatus || "",
        previewCode: data.previewCodeForLocalDev,
      });
      setResendSuccessMsg(
        lang === "en"
          ? "A fresh 6-digit confirmation code has been sent to your email!"
          : "Kod pengesahan 6-digit baharu telah dihantar ke e-mel anda!"
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to resend code.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-10">
      {/* Main Auth Container */}
      <div className="max-w-2xl w-full rounded-3xl bg-slate-900 border-2 border-slate-800 shadow-2xl overflow-hidden">
        {/* Top Brand Banner */}
        <div className="bg-slate-950 border-b border-slate-800 p-6 sm:p-7 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-indigo-500/60 shadow-md bg-slate-900 shrink-0">
              <img
                src="/kalbu-logo.jpg"
                alt="Kalbu Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-serif font-bold tracking-wide text-slate-100">
                  KALBU
                </h1>
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  Emotional Safe Haven
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Digital Diary • AI Emotion Mapping • Anonymous Feeling Twin
              </p>
            </div>
          </div>

          {/* Language Toggle (English / Bahasa Melayu) */}
          <div className="inline-flex items-center gap-1 rounded-xl bg-slate-900 p-1 border border-slate-800 text-xs">
            <Globe className="w-3.5 h-3.5 text-indigo-400 ml-1.5 mr-0.5" />
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                lang === "en"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang("bm")}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                lang === "bm"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              BM
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* STEP 2: EMAIL CONFIRMATION SCREEN (AFTER REGISTERING)               */}
        {/* =================================================================== */}
        {pendingVerification ? (
          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <MailCheck className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  {lang === "en"
                    ? "Step 2 of 2 • Security Email Confirmation Required"
                    : "Langkah 2 daripada 2 • Pengesahan E-mel Keselamatan Diperlukan"}
                </span>
                <h2 className="text-lg font-serif font-bold text-slate-100">
                  {lang === "en"
                    ? "Confirm Your Email Address"
                    : "Sahkan Alamat E-mel Anda"}
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {lang === "en" ? (
                    <>
                      To ensure you are the rightful owner registering this
                      account, we sent a 6-digit confirmation code to your
                      email address{" "}
                      <strong className="text-slate-100 font-mono">
                        {pendingVerification.email}
                      </strong>
                      .
                    </>
                  ) : (
                    <>
                      Bagi memastikan anda adalah pemilik sebenar yang mendaftar
                      akaun ini, kami telah menghantar kod pengesahan 6-digit ke
                      alamat e-mel anda{" "}
                      <strong className="text-slate-100 font-mono">
                        {pendingVerification.email}
                      </strong>
                      .
                    </>
                  )}
                </p>
              </div>
            </div>

            <form onSubmit={handleVerifyEmailCode} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-200">
                  {lang === "en"
                    ? "Enter 6-Digit Email Confirmation Code"
                    : "Masukkan Kod Pengesahan E-mel 6-Digit"}
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="123456"
                  className="w-full bg-slate-950 border-2 border-slate-800 focus:border-indigo-500 rounded-2xl px-4 py-3 text-center text-2xl font-mono font-bold tracking-[0.4em] text-slate-100 focus:outline-none"
                />
              </div>

              {error && (
                <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs font-semibold text-rose-300">
                  {error}
                </div>
              )}

              {resendSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-300">
                  {resendSuccessMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || otpCode.trim().length !== 6}
                className="w-full py-3.5 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-45 text-white font-bold text-sm transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {lang === "en"
                  ? "Confirm Email & Enter Kalbu Sanctuary"
                  : "Sahkan E-mel & Masuk ke Ruang Kalbu"}
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setPendingVerification(null);
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {lang === "en"
                  ? "Back to Registration"
                  : "Kembali ke Pendaftaran"}
              </button>

              <button
                type="button"
                onClick={handleResendCode}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {lang === "en"
                  ? "Resend Confirmation Email"
                  : "Hantar Semula E-mel Pengesahan"}
              </button>
            </div>
          </div>
        ) : (
          /* ================================================================= */
          /* STEP 1: REGISTER OR LOGIN SCREEN                                  */
          /* ================================================================= */
          <div className="p-6 sm:p-7 space-y-6">
            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-950 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("register");
                  setError(null);
                }}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                  authMode === "register"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <UserPlus className="w-4 h-4" />
                {lang === "en"
                  ? "First-Time User (Register)"
                  : "Pengguna Baharu (Daftar)"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setError(null);
                }}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                  authMode === "login"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <LogIn className="w-4 h-4" />
                {lang === "en"
                  ? "Already Registered (Login)"
                  : "Sudah Berdaftar (Log Masuk)"}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-200">
                  {lang === "en" ? "Email Address" : "Alamat E-mel"}
                </label>
                <div className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 focus-within:border-indigo-500">
                  <Mail className="w-4 h-4 text-indigo-400 shrink-0" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="youremail@gmail.com"
                    className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Anonymous Alias (Register only) */}
              {authMode === "register" && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-200">
                    {lang === "en"
                      ? "Anonymous Display Alias (For Feeling Twin Matching)"
                      : "Nama Samaran Tanpa Nama (Untuk Padanan Feeling Twin)"}
                  </label>
                  <div className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 focus-within:border-indigo-500">
                    <User className="w-4 h-4 text-indigo-400 shrink-0" />
                    <input
                      type="text"
                      value={anonymousHandle}
                      onChange={(e) => setAnonymousHandle(e.target.value)}
                      placeholder={
                        lang === "en"
                          ? "e.g., Gentle Blossom #408 (optional)"
                          : "cth., Gentle Blossom #408 (pilihan)"
                      }
                      className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Password / Vault Passphrase */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-200">
                  {lang === "en"
                    ? "Password & Private Diary Encryption Key"
                    : "Kata Laluan & Kunci Penyulitan Diari Peribadi"}
                </label>
                <div className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 focus-within:border-indigo-500">
                  <KeyRound className="w-4 h-4 text-emerald-400 shrink-0" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      lang === "en"
                        ? "At least 6 characters..."
                        : "Sekurang-kurangnya 6 aksara..."
                    }
                    className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* =============================================================== */}
              {/* MANDATORY PRE-REGISTRATION CONSENT NOTICE & CHECKBOX (REGISTER) */}
              {/* =============================================================== */}
              {authMode === "register" && (
                <div className="pt-2 space-y-3">
                  <div className="p-4 rounded-2xl bg-slate-950 border-2 border-slate-800 space-y-2.5 text-xs leading-relaxed">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-slate-100 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                        {lang === "en"
                          ? "Before registering or logging into Kalbu, please acknowledge and agree to the following:"
                          : "Sebelum mendaftar atau log masuk ke Kalbu, sila sahkan dan setuju dengan perkara berikut:"}
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowFullTermsModal(true)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        {lang === "en"
                          ? "Read Full Terms & Privacy Policy"
                          : "Baca Teks Penuh Terma & Dasar Privasi"}
                      </button>
                    </div>

                    {lang === "en" ? (
                      <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
                        <li>
                          <strong>
                            Strict Zero-Tolerance for 18+ Sexual Content &amp;
                            Abuse:
                          </strong>{" "}
                          Uploading, sending, or sharing sexually explicit
                          (18+), pornographic, harassing, or abusive content is
                          strictly prohibited. A <strong>2-strike policy</strong>{" "}
                          applies — upon the second violation (or immediately
                          for severe breaches), your account will be permanently
                          banned.
                        </li>
                        <li>
                          <strong>
                            AI Emotion Processing &amp; Safety Data Retention:
                          </strong>{" "}
                          Your journal entries and interactions are processed by
                          Kalbu&apos;s AI models for emotion analysis, graphing,
                          peer matching, and music recommendations. While
                          private entries are protected,{" "}
                          <strong>
                            data and records related to policy violations may be
                            retained securely
                          </strong>{" "}
                          for platform safety, audit purposes, and legal or law
                          enforcement inquiries when required.
                        </li>
                        <li>
                          <strong>Not a Clinical or Emergency Service:</strong>{" "}
                          Kalbu is an emotional wellness and peer-support
                          platform, not a substitute for professional
                          medical/psychiatric diagnosis or emergency crisis
                          intervention.
                        </li>
                      </ul>
                    ) : (
                      <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
                        <li>
                          <strong>
                            Larangan Keras Konten Seksual 18+ &amp;
                            Penyalahgunaan:
                          </strong>{" "}
                          Dilarang sama sekali memuat naik, menghantar, atau
                          berkongsi kandungan berunsur seksual/lucah (18+),
                          gangguan, atau penyalahgunaan sistem.{" "}
                          <strong>Polisi 2-Amaran (2-Strike Policy)</strong>{" "}
                          diguna pakai — pada pelanggaran kali kedua (atau
                          serta-merta bagi kesalahan berat), akaun anda akan
                          disekat (<em>banned</em>) secara kekal.
                        </li>
                        <li>
                          <strong>
                            Pemprosesan Emosi AI &amp; Penyimpanan Data
                            Keselamatan:
                          </strong>{" "}
                          Entri diari dan interaksi anda diproses oleh model AI
                          Kalbu untuk analisis emosi, graf perasaan, padanan
                          rakan (<em>Feeling Twin</em>), dan cadangan muzik.
                          Walaupun diari peribadi dilindungi,{" "}
                          <strong>
                            data dan rekod berkaitan pelanggaran polisi akan
                            disimpan dengan selamat
                          </strong>{" "}
                          bagi tujuan keselamatan platform, audit, serta rujukan
                          undang-undang atau pihak berkuasa sekiranya diperlukan
                          pada masa hadapan.
                        </li>
                        <li>
                          <strong>
                            Bukan Perkhidmatan Klinikal atau Kecemasan:
                          </strong>{" "}
                          Kalbu ialah ruang sokongan emosi dan kesejahteraan
                          kendiri, bukan pengganti rawatan perubatan/psikiatri
                          profesional atau talian bantuan kecemasan.
                        </li>
                      </ul>
                    )}
                  </div>

                  {/* Mandatory Consent Checkbox */}
                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 transition cursor-pointer select-none ${
                      agreedToTerms
                        ? "bg-emerald-500/10 border-emerald-500/40 text-slate-100"
                        : "bg-slate-950 border-indigo-500/40 text-slate-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="mt-1 w-5 h-5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer"
                    />
                    <span className="text-xs sm:text-sm font-semibold leading-snug">
                      {lang === "en" ? (
                        <>
                          I have read, understood, and agree to Kalbu&apos;s{" "}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setShowFullTermsModal(true);
                            }}
                            className="text-indigo-400 underline hover:text-indigo-300 cursor-pointer"
                          >
                            Terms &amp; Conditions and Privacy Policy
                          </button>
                          .{" "}
                          <span className="text-indigo-400 font-bold">
                            (Required to proceed)
                          </span>
                        </>
                      ) : (
                        <>
                          Saya telah membaca, memahami, dan bersetuju dengan{" "}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setShowFullTermsModal(true);
                            }}
                            className="text-indigo-400 underline hover:text-indigo-300 cursor-pointer"
                          >
                            Terma &amp; Syarat serta Dasar Privasi Kalbu
                          </button>
                          .{" "}
                          <span className="text-indigo-400 font-bold">
                            (Wajib ditanda untuk meneruskan)
                          </span>
                        </>
                      )}
                    </span>
                  </label>
                </div>
              )}

              {error && (
                <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs font-semibold text-rose-300">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={
                  isSubmitting || (authMode === "register" && !agreedToTerms)
                }
                className="w-full py-3.5 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-45 disabled:cursor-not-allowed text-white font-bold text-sm transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin" />
                    {lang === "en"
                      ? "Sending Confirmation Email..."
                      : "Menghantar E-mel Pengesahan..."}
                  </>
                ) : authMode === "register" ? (
                  <>
                    <MailCheck className="w-4 h-4" />
                    {lang === "en"
                      ? "Agree & Register Account"
                      : "Setuju & Daftar Akaun"}
                  </>
                ) : (
                  <>
                    <BookLock className="w-4 h-4" />
                    {lang === "en"
                      ? "Login to Kalbu Sanctuary"
                      : "Log Masuk ke Ruang Kalbu"}
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* FULL TERMS & CONDITIONS AND PRIVACY POLICY MODAL (EN & BM)            */}
      {/* ===================================================================== */}
      {showFullTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="max-w-3xl w-full max-h-[88vh] rounded-3xl bg-slate-900 border-2 border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-serif font-bold text-slate-100">
                  KALBU — TERMS &amp; CONDITIONS AND PRIVACY POLICY
                </h2>
                <p className="text-xs text-slate-400">
                  Last Updated: November 2026 • Bilingual Official Document (EN
                  / BM)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLang(lang === "en" ? "bm" : "en")}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-indigo-400 hover:bg-slate-800 cursor-pointer"
                >
                  {lang === "en"
                    ? "Tukar ke Bahasa Melayu"
                    : "Switch to English"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFullTermsModal(false)}
                  className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs sm:text-sm text-slate-200 leading-relaxed">
              {lang === "en" ? (
                <>
                  <div className="space-y-3">
                    <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-1">
                      PART 1: ENGLISH VERSION — 2. Terms &amp; Conditions
                    </h3>
                    <p>
                      <strong>2.1 Acceptance of Terms:</strong> By registering
                      for, logging into, or using the <strong>Kalbu</strong> web
                      application (&ldquo;the Platform&rdquo;), you agree to be
                      bound by these Terms &amp; Conditions. If you do not agree
                      with any part of these terms, you must not access or use
                      the Platform.
                    </p>
                    <p>
                      <strong>2.2 Purpose of the Platform:</strong> Kalbu is a
                      private digital diary and emotional safe-haven platform
                      powered by Artificial Intelligence (AI). It provides
                      private journaling, automated emotion mapping, anonymous
                      emotional peer-matching (&ldquo;Feeling Twin&rdquo;), and
                      mood-adaptive audio recommendations.
                    </p>
                    <div>
                      <strong>
                        2.3 Strict Content Policy &amp; 2-Strike Ban Rule:
                      </strong>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        <li>
                          <strong>No 18+ / Sexually Explicit Content:</strong>{" "}
                          Users are strictly prohibited from writing,
                          transmitting, or soliciting sexually explicit (18+),
                          pornographic, or lewd content anywhere on the
                          Platform, including within anonymous peer-matching
                          sessions.
                        </li>
                        <li>
                          <strong>
                            No Harassment, Hate Speech, or Doxxing:
                          </strong>{" "}
                          Bullying, threats, hate speech, non-consensual sharing
                          of personal information, and spam are strictly
                          forbidden.
                        </li>
                        <li>
                          <strong>2-Strike Enforcement Policy:</strong> First
                          Violation: A formal warning will be issued and
                          offending content/access will be restricted. Second
                          Violation: Your account will be{" "}
                          <strong>permanently banned</strong> from accessing
                          Kalbu.
                        </li>
                      </ul>
                    </div>
                    <p>
                      <strong>
                        2.4 Data Retention for Policy Violations &amp; Legal
                        Compliance:
                      </strong>{" "}
                      While Kalbu prioritizes user privacy and encrypts personal
                      diary entries,{" "}
                      <strong>
                        any data, logs, or content flagged or proven to violate
                        our Terms &amp; Conditions (including 18+ sexual
                        misconduct or harassment) will be archived and retained
                        by Kalbu
                      </strong>
                      .
                    </p>
                    <p>
                      <strong>
                        2.5 Mental Health &amp; Medical Disclaimer:
                      </strong>{" "}
                      Kalbu is designed for emotional self-reflection and
                      general well-being. It is <strong>not</strong> a clinical
                      therapy tool, medical device, or crisis hotline.
                    </p>
                    <p>
                      <strong>2.6 Intellectual Property:</strong> All software
                      architecture, AI emotion-mapping logic, visual branding,
                      and original assets of Kalbu remain the intellectual
                      property of the developer.
                    </p>
                  </div>

                  <div className="space-y-3 pt-2">
                    <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-1">
                      3. Privacy Policy
                    </h3>
                    <p>
                      <strong>3.1 Information We Collect:</strong> Account
                      Information (unique email ID, encrypted password,
                      anonymous display alias), Journal &amp; Interaction Data,
                      and Technical &amp; Security Logs.
                    </p>
                    <p>
                      <strong>3.2 How AI Processes Your Data:</strong> Kalbu
                      uses Natural Language Processing (NLP) and vector
                      similarity algorithms to classify emotional tone, map
                      Valence/Arousal scores, match you anonymously with peers,
                      and recommend mood-appropriate music.
                    </p>
                    <p>
                      <strong>
                        3.3 Data Security &amp; Exception for Violations:
                      </strong>{" "}
                      Personal diary entries are stored using encryption
                      protocols to safeguard your privacy. However, in
                      accordance with Section 2.4, confidentiality does not
                      apply to content that breaches our safety rules.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-1">
                      BAHAGIAN 2: VERSI BAHASA MELAYU — 2. Terma &amp; Syarat
                    </h3>
                    <p>
                      <strong>2.1 Penerimaan Terma:</strong> Dengan mendaftar,
                      log masuk, atau menggunakan aplikasi web{" "}
                      <strong>Kalbu</strong>, anda bersetuju untuk terikat
                      dengan Terma &amp; Syarat ini.
                    </p>
                    <p>
                      <strong>2.2 Tujuan Platform:</strong> Kalbu ialah aplikasi
                      diari digital peribadi dan ruang selamat emosi yang
                      dikuasakan oleh Kecerdasan Buatan (AI).
                    </p>
                    <div>
                      <strong>
                        2.3 Polisi Kandungan Ketat &amp; Peraturan Sekatan
                        2-Kali (2-Strike Ban):
                      </strong>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        <li>
                          <strong>Tiada Konten Seksual 18+ / Lucah:</strong>{" "}
                          Pengguna dilarang keras menulis atau menghantar
                          kandungan berunsur seksual (18+) atau lucah.
                        </li>
                        <li>
                          <strong>
                            Penguatkuasaan Polisi 2-Kali (2-Strike Policy):
                          </strong>{" "}
                          Pelanggaran Pertama: Amaran rasmi dikeluarkan.
                          Pelanggaran Kedua: Akaun disekat secara kekal.
                        </li>
                      </ul>
                    </div>
                    <p>
                      <strong>
                        2.4 Penyimpanan Data Pelanggaran Polisi &amp; Pematuhan
                        Undang-Undang:
                      </strong>{" "}
                      Sebarang data atau kandungan yang melanggar Terma &amp;
                      Syarat akan diarkibkan dan disimpan oleh Kalbu untuk
                      keselamatan platform.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="bg-slate-950 border-t border-slate-800 px-6 py-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowFullTermsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                {lang === "en" ? "Close" : "Tutup"}
              </button>
              {authMode === "register" && (
                <button
                  type="button"
                  onClick={() => {
                    setAgreedToTerms(true);
                    setShowFullTermsModal(false);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  {lang === "en"
                    ? "I Agree to Terms & Privacy Policy"
                    : "Saya Bersetuju dengan Terma & Dasar Privasi"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
