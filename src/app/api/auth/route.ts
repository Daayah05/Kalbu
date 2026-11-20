// src/app/api/auth/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { sendKalbuConfirmationEmail } from "@/lib/auth/smtp_mailer";

export interface KalbuUserRecord {
  uniqueEmailId: string; // Email is the unique primary ID in the database
  id: string;
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
    description:
      "Kalbu Registered Users Database (Email is the Unique Primary ID)",
    businessSenderEmail:
      process.env.KALBU_BUSINESS_EMAIL || "official.kalbu.sanctuary@gmail.com",
    users: [],
  };
}

function writeUsersDb(db: UsersDb) {
  const payload = JSON.stringify(db, null, 2);
  try {
    fs.mkdirSync(path.dirname(USERS_DB_PATH), { recursive: true });
    fs.writeFileSync(USERS_DB_PATH, payload, "utf-8");
  } catch {
    // Fallback to os.tmpdir() on serverless production hosts (e.g., Vercel)
    try {
      fs.writeFileSync(TMP_USERS_DB_PATH, payload, "utf-8");
    } catch (err) {
      console.warn("[Kalbu Auth] Could not write users_db.json:", err);
    }
  }
}

function generateSixDigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function GET() {
  const db = readUsersDb();
  const businessEmail =
    process.env.KALBU_BUSINESS_EMAIL ||
    db.businessSenderEmail ||
    "official.kalbu.sanctuary@gmail.com";
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
        | "update-business-email";
      email?: string;
      password?: string;
      anonymousHandle?: string;
      agreedToTerms?: boolean;
      verificationCode?: string;
      businessEmail?: string;
    };

    const db = readUsersDb();

    const activeBusinessEmail =
      process.env.KALBU_BUSINESS_EMAIL || "official.kalbu.sanctuary@gmail.com";

    const email = (body.email || "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    // =========================================================================
    // ACTION 1: VERIFY 6-DIGIT EMAIL CONFIRMATION CODE
    // =========================================================================
    if (body.action === "verify-email") {
      const code = (body.verificationCode || "").trim();
      const user = db.users.find((u) => u.email.toLowerCase() === email);

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
      writeUsersDb(db);

      return NextResponse.json(
        {
          verified: true,
          user: {
            id: user.email, // Email is the unique primary ID
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
      const user = db.users.find((u) => u.email.toLowerCase() === email);
      if (!user) {
        return NextResponse.json(
          { error: "No account found for this email address." },
          { status: 404 }
        );
      }

      const freshCode = generateSixDigitCode();
      user.verificationCode = freshCode;
      user.sentFromBusinessEmail = activeBusinessEmail;
      writeUsersDb(db);

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
    // ACTION 3: REGISTER NEW USER -> SEND CONFIRMATION EMAIL FROM BUSINESS EMAIL
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

      const existing = db.users.find((u) => u.email.toLowerCase() === email);
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

      const newUser: KalbuUserRecord = {
        uniqueEmailId: email, // Email is the unique ID in the database
        id: email,
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
    // ACTION 4: LOGIN EXISTING REGISTERED USER
    // =========================================================================
    const found = db.users.find((u) => u.email.toLowerCase() === email);
    if (!found || found.password !== password) {
      return NextResponse.json(
        {
          error:
            "Invalid email or password. If you are a first-time user, please register first.",
        },
        { status: 401 }
      );
    }

    // If user registered previously but hasn't confirmed their email yet, require email confirmation!
    if (found.emailVerified === false) {
      const freshCode = found.verificationCode || generateSixDigitCode();
      found.verificationCode = freshCode;
      writeUsersDb(db);

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
          id: found.email, // Email is the unique primary ID
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
