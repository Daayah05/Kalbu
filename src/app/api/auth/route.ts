// src/app/api/auth/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { sendKalbuConfirmationEmail } from "@/lib/auth/smtp_mailer";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";

export interface KalbuUserRecord {
  uniqueEmailId: string;
  id: string; // Deterministic UUID derived from email for Supabase UUID columns
  email: string;
  password: string;
  anonymousHandle: string;
  agreedToTerms: boolean;
  agreedToTermsAt: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  verificationCode: string | null;
  sentFromBusinessEmail: string;
  createdAt: string;
}

interface UsersDb {
  description: string;
  businessSenderEmail?: string;
  users: KalbuUserRecord[];
}

const USERS_DB_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "auth",
  "users_db.json"
);
const TMP_USERS_DB_PATH = path.join(os.tmpdir(), "kalbu_users_db.json");

/**
 * Generates a deterministic UUID v4-formatted string from an email address
 * so every user email maps to a consistent UUID in Supabase tables.
 */
export function emailToDeterministicUuid(email: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`kalbu-user:${email.trim().toLowerCase()}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(
    13,
    16
  )}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function readUsersDb(): UsersDb {
  try {
    if (fs.existsSync(TMP_USERS_DB_PATH)) {
      return JSON.parse(fs.readFileSync(TMP_USERS_DB_PATH, "utf-8")) as UsersDb;
    }
    if (fs.existsSync(USERS_DB_PATH)) {
      return JSON.parse(fs.readFileSync(USERS_DB_PATH, "utf-8")) as UsersDb;
    }
  } catch (err) {
    console.warn("[Kalbu Auth] Could not read users_db.json:", err);
  }
  return {
    description: "Kalbu Registered Users Database",
    businessSenderEmail:
      process.env.KALBU_BUSINESS_EMAIL || "kalbu4u@gmail.com",
    users: [],
  };
}

function writeUsersDb(db: UsersDb) {
  const payload = JSON.stringify(db, null, 2);
  try {
    fs.mkdirSync(path.dirname(USERS_DB_PATH), { recursive: true });
    fs.writeFileSync(USERS_DB_PATH, payload, "utf-8");
  } catch {
    try {
      fs.writeFileSync(TMP_USERS_DB_PATH, payload, "utf-8");
    } catch (err) {
      console.warn("[Kalbu Auth] Could not write users_db.json:", err);
    }
  }
}

/**
 * Syncs a user record directly to Supabase (`public.kalbu_users`) so every
 * registration and email verification appears live in Supabase Table Editor!
 */
async function syncUserToSupabase(user: KalbuUserRecord) {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.from("kalbu_users").upsert(
      {
        id: emailToDeterministicUuid(user.email),
        email: user.email,
        password_hash: user.password,
        anonymous_handle: user.anonymousHandle,
        agreed_to_terms: user.agreedToTerms,
        agreed_to_terms_at: user.agreedToTermsAt,
        email_verified: user.emailVerified,
        email_verified_at: user.emailVerifiedAt,
        verification_code: user.verificationCode,
        created_at: user.createdAt,
      },
      { onConflict: "email" }
    );
  } catch (err) {
    console.warn("[Kalbu Auth] Supabase sync note:", err);
  }
}

/**
 * Fetches a user by email from Supabase (`public.kalbu_users`) first,
 * falling back to local `users_db.json` if the table hasn't been created yet.
 */
async function findUserByEmail(
  email: string,
  localDb: UsersDb
): Promise<KalbuUserRecord | undefined> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("kalbu_users")
      .select("*")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (!error && data) {
      return {
        uniqueEmailId: data.email,
        id: data.id || emailToDeterministicUuid(data.email),
        email: data.email,
        password: data.password_hash,
        anonymousHandle: data.anonymous_handle,
        agreedToTerms: Boolean(data.agreed_to_terms),
        agreedToTermsAt: data.agreed_to_terms_at,
        emailVerified: Boolean(data.email_verified),
        emailVerifiedAt: data.email_verified_at,
        verificationCode: data.verification_code,
        sentFromBusinessEmail:
          process.env.KALBU_BUSINESS_EMAIL || "kalbu4u@gmail.com",
        createdAt: data.created_at,
      };
    }
  } catch {
    // Fallback to localDb
  }
  return localDb.users.find((u) => u.email.toLowerCase() === email);
}

function generateSixDigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function GET() {
  const db = readUsersDb();
  const businessEmail =
    process.env.KALBU_BUSINESS_EMAIL ||
    db.businessSenderEmail ||
    "kalbu4u@gmail.com";
  return NextResponse.json({ businessEmail }, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action:
        | "login"
        | "register"
        | "verify-email"
        | "resend-code"
        | "sync-session";
      email?: string;
      password?: string;
      anonymousHandle?: string;
      agreedToTerms?: boolean;
      agreedToTermsAt?: string;
      verificationCode?: string;
    };

    const db = readUsersDb();
    const activeBusinessEmail =
      process.env.KALBU_BUSINESS_EMAIL || "kalbu4u@gmail.com";
    const email = (body.email || "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    // =========================================================================
    // ACTION 0: AUTO-SYNC EXISTING BROWSER SESSION TO SUPABASE (FOR EARLIER USERS)
    // =========================================================================
    if (body.action === "sync-session") {
      const existing = await findUserByEmail(email, db);
      const nowIso = new Date().toISOString();
      const syncedUser: KalbuUserRecord = existing || {
        uniqueEmailId: email,
        id: emailToDeterministicUuid(email),
        email,
        password: (body.password || "synced-session").trim(),
        anonymousHandle: (body.anonymousHandle || "Kalbu Member").trim(),
        agreedToTerms: true,
        agreedToTermsAt: body.agreedToTermsAt || nowIso,
        emailVerified: true,
        emailVerifiedAt: nowIso,
        verificationCode: null,
        sentFromBusinessEmail: activeBusinessEmail,
        createdAt: body.agreedToTermsAt || nowIso,
      };
      await syncUserToSupabase(syncedUser);
      return NextResponse.json({ synced: true }, { status: 200 });
    }

    // =========================================================================
    // ACTION 1: VERIFY 6-DIGIT EMAIL CONFIRMATION CODE
    // =========================================================================
    if (body.action === "verify-email") {
      const code = (body.verificationCode || "").trim();
      const user = await findUserByEmail(email, db);

      if (!user) {
        return NextResponse.json(
          { error: "No account found for this email address." },
          { status: 404 }
        );
      }

      if (!code || user.verificationCode !== code) {
        return NextResponse.json(
          {
            error:
              "Invalid 6-digit confirmation code. Please check the confirmation email sent to your inbox.",
          },
          { status: 400 }
        );
      }

      user.emailVerified = true;
      user.emailVerifiedAt = new Date().toISOString();
      user.verificationCode = null;

      // Update local DB & Supabase
      const localIdx = db.users.findIndex(
        (u) => u.email.toLowerCase() === email
      );
      if (localIdx >= 0) {
        db.users[localIdx] = user;
      } else {
        db.users.push(user);
      }
      writeUsersDb(db);
      await syncUserToSupabase(user);

      return NextResponse.json(
        {
          verified: true,
          user: {
            id: emailToDeterministicUuid(user.email),
            uniqueEmailId: user.email,
            email: user.email,
            anonymousHandle: user.anonymousHandle,
            agreedToTermsAt: user.agreedToTermsAt,
            emailVerifiedAt: user.emailVerifiedAt,
          },
        },
        { status: 200 }
      );
    }

    // =========================================================================
    // ACTION 2: RESEND CONFIRMATION EMAIL FROM BUSINESS EMAIL
    // =========================================================================
    if (body.action === "resend-code") {
      const user = await findUserByEmail(email, db);
      if (!user) {
        return NextResponse.json(
          { error: "No account found for this email address." },
          { status: 404 }
        );
      }

      const freshCode = generateSixDigitCode();
      user.verificationCode = freshCode;
      user.sentFromBusinessEmail = activeBusinessEmail;

      const localIdx = db.users.findIndex(
        (u) => u.email.toLowerCase() === email
      );
      if (localIdx >= 0) {
        db.users[localIdx] = user;
      } else {
        db.users.push(user);
      }
      writeUsersDb(db);
      await syncUserToSupabase(user);

      const mailRes = await sendKalbuConfirmationEmail({
        toUserEmail: user.email,
        anonymousHandle: user.anonymousHandle,
        verificationCode: freshCode,
        customBusinessEmail: activeBusinessEmail,
      });

      return NextResponse.json(
        {
          requiresEmailVerification: true,
          email: user.email,
          fromBusinessEmail: mailRes.fromBusinessEmail,
          sentViaLiveSmtp: mailRes.sentViaLiveSmtp,
          smtpStatus: mailRes.smtpStatus,
        },
        { status: 200 }
      );
    }

    const password = (body.password || "").trim();
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    // =========================================================================
    // ACTION 3: REGISTER NEW USER -> SAVE TO SUPABASE & SEND CONFIRMATION EMAIL
    // =========================================================================
    if (body.action === "register") {
      if (!body.agreedToTerms) {
        return NextResponse.json(
          {
            error:
              "You must check the box and agree to Kalbu's Terms & Conditions and Privacy Policy to register.",
          },
          { status: 400 }
        );
      }

      const existing = await findUserByEmail(email, db);
      if (existing) {
        return NextResponse.json(
          {
            error:
              "This email is already registered. Please switch to the Login tab.",
          },
          { status: 409 }
        );
      }

      const randomNum = Math.floor(100 + Math.random() * 900);
      const handle =
        (body.anonymousHandle || "").trim() || `Serene Blossom #${randomNum}`;
      const nowIso = new Date().toISOString();
      const verificationCode = generateSixDigitCode();
      const userUuid = emailToDeterministicUuid(email);

      const newUser: KalbuUserRecord = {
        uniqueEmailId: email,
        id: userUuid,
        email,
        password,
        anonymousHandle: handle,
        agreedToTerms: true,
        agreedToTermsAt: nowIso,
        emailVerified: false,
        emailVerifiedAt: null,
        verificationCode,
        sentFromBusinessEmail: activeBusinessEmail,
        createdAt: nowIso,
      };

      db.users.push(newUser);
      writeUsersDb(db);
      await syncUserToSupabase(newUser);

      const mailRes = await sendKalbuConfirmationEmail({
        toUserEmail: email,
        anonymousHandle: handle,
        verificationCode,
        customBusinessEmail: activeBusinessEmail,
      });

      return NextResponse.json(
        {
          requiresEmailVerification: true,
          email: newUser.email,
          fromBusinessEmail: mailRes.fromBusinessEmail,
          sentViaLiveSmtp: mailRes.sentViaLiveSmtp,
          smtpStatus: mailRes.smtpStatus,
        },
        { status: 201 }
      );
    }

    // =========================================================================
    // ACTION 4: LOGIN EXISTING REGISTERED USER (FROM SUPABASE OR LOCAL DB)
    // =========================================================================
    const found = await findUserByEmail(email, db);
    if (!found || found.password !== password) {
      return NextResponse.json(
        {
          error:
            "Invalid email or password. If you are a first-time user, please register first.",
        },
        { status: 401 }
      );
    }

    if (found.emailVerified === false) {
      const freshCode = found.verificationCode || generateSixDigitCode();
      found.verificationCode = freshCode;
      writeUsersDb(db);
      await syncUserToSupabase(found);

      const mailRes = await sendKalbuConfirmationEmail({
        toUserEmail: found.email,
        anonymousHandle: found.anonymousHandle,
        verificationCode: freshCode,
        customBusinessEmail: activeBusinessEmail,
      });

      return NextResponse.json(
        {
          requiresEmailVerification: true,
          email: found.email,
          fromBusinessEmail: mailRes.fromBusinessEmail,
          sentViaLiveSmtp: mailRes.sentViaLiveSmtp,
          smtpStatus: mailRes.smtpStatus,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        user: {
          id: emailToDeterministicUuid(found.email),
          uniqueEmailId: found.email,
          email: found.email,
          anonymousHandle: found.anonymousHandle,
          agreedToTermsAt: found.agreedToTermsAt,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[Kalbu Auth Error]:", err);
    return NextResponse.json(
      { error: "Authentication service error." },
      { status: 500 }
    );
  }
}
