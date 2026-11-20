// src/lib/auth/smtp_mailer.ts
import tls from "tls";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const OUTBOUND_LOG_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "auth",
  "outbound_emails_log.json"
);

export interface SentEmailLog {
  id: string;
  fromBusinessEmail: string;
  toUserEmail: string;
  subject: string;
  verificationCode: string;
  sentViaLiveSmtp: boolean;
  smtpStatus: string;
  sentAt: string;
}

/**
 * Native Node.js TLS SMTP client (port 465 SSL/TLS) with full RFC 5322
 * anti-spam headers (Message-ID, Date, Reply-To, and multipart/alternative Text+HTML)
 * to maximize Inbox deliverability and avoid Spam folders.
 */
async function sendRawSmtpTls(options: {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ ok: boolean; status: string }> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: options.host,
        port: options.port,
        servername: options.host,
        rejectUnauthorized: false,
      },
      () => {
        // Connected
      }
    );

    socket.setTimeout(8000);

    let step = 0;
    let buffer = "";

    const domainPart = options.user.split("@")[1] || "gmail.com";
    const messageId = `<${crypto.randomUUID()}@${domainPart}>`;
    const rfcDate = new Date().toUTCString();
    const boundary = `kalbu_mime_${crypto.randomBytes(8).toString("hex")}`;

    const commands = [
      `EHLO ${domainPart}\r\n`,
      `AUTH LOGIN\r\n`,
      `${Buffer.from(options.user).toString("base64")}\r\n`,
      `${Buffer.from(options.pass.replace(/\s+/g, "")).toString("base64")}\r\n`,
      `MAIL FROM:<${options.user}>\r\n`,
      `RCPT TO:<${options.to}>\r\n`,
      `DATA\r\n`,
      [
        `Date: ${rfcDate}`,
        `Message-ID: ${messageId}`,
        `From: "${options.fromName}" <${options.user}>`,
        `Reply-To: "${options.fromName}" <${options.user}>`,
        `To: <${options.to}>`,
        `Subject: ${options.subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        options.text,
        ``,
        `--${boundary}`,
        `Content-Type: text/html; charset=UTF-8`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        options.html,
        ``,
        `--${boundary}--`,
        `.`,
        ``,
      ].join("\r\n"),
      `QUIT\r\n`,
    ];

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split("\r\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line) continue;
        if (line.length >= 4 && line[3] === "-") continue;

        const code = parseInt(line.slice(0, 3), 10);
        if (code >= 400) {
          socket.destroy();
          resolve({ ok: false, status: `SMTP Error: ${line}` });
          return;
        }

        if (step < commands.length) {
          const cmd = commands[step];
          step += 1;
          socket.write(cmd);
        } else {
          socket.end();
          resolve({ ok: true, status: "Delivered via Live Business SMTP" });
          return;
        }
      }
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, status: "SMTP Connection Timeout" });
    });

    socket.on("error", (err) => {
      socket.destroy();
      resolve({ ok: false, status: `SMTP Error: ${err.message}` });
    });
  });
}

export async function sendKalbuConfirmationEmail(params: {
  toUserEmail: string;
  anonymousHandle: string;
  verificationCode: string;
  customBusinessEmail?: string;
}): Promise<{
  fromBusinessEmail: string;
  sentViaLiveSmtp: boolean;
  smtpStatus: string;
}> {
  const fromBusinessEmail =
    (params.customBusinessEmail || "").trim() ||
    process.env.KALBU_BUSINESS_EMAIL ||
    "official.kalbu.sanctuary@gmail.com";
  const appPassword = (
    process.env.KALBU_BUSINESS_EMAIL_APP_PASSWORD || ""
  ).trim();
  const smtpHost = process.env.KALBU_SMTP_HOST || "smtp.gmail.com";
  const smtpPort = Number(process.env.KALBU_SMTP_PORT || 465);

  // Clean ASCII subject line avoids spam filter penalties from special symbols
  const subject = `Kalbu Account Verification Code: ${params.verificationCode}`;

  const text = [
    `Hello ${params.anonymousHandle},`,
    ``,
    `Thank you for registering with Kalbu (Digital Diary & Emotional Safe Haven).`,
    `Your 6-digit email confirmation code is: ${params.verificationCode}`,
    ``,
    `Please enter this code on the verification screen to complete your registration.`,
    `If you did not create a Kalbu account, you may safely ignore this message.`,
    ``,
    `Warm regards,`,
    `Kalbu Sanctuary Team`,
  ].join("\r\n");

  const html = `
    <div style="font-family: Georgia, serif; max-width: 540px; margin: 0 auto; padding: 28px; background-color: #fdf8f2; border: 1px solid #ead9c8; border-radius: 16px; color: #3d1c1c;">
      <h2 style="margin-top: 0; color: #c24646;">Kalbu Emotional Safe Haven</h2>
      <p style="font-size: 15px; line-height: 1.6;">Hello <strong>${params.anonymousHandle}</strong>,</p>
      <p style="font-size: 15px; line-height: 1.6;">
        Thank you for registering with <strong>Kalbu</strong>. Please enter the 6-digit confirmation code below to verify your email address:
      </p>
      <div style="margin: 24px 0; padding: 18px; background-color: #fffdf9; border: 2px solid #c24646; border-radius: 12px; text-align: center;">
        <span style="font-family: monospace; font-size: 30px; font-weight: bold; letter-spacing: 6px; color: #c24646;">
          ${params.verificationCode}
        </span>
      </div>
      <p style="font-size: 13px; color: #7d584e; line-height: 1.5;">
        If you did not request this registration, you may safely ignore this email.<br/>
        Warm regards,<br/>
        <strong>Kalbu Sanctuary Team</strong>
      </p>
    </div>
  `;

  let sentViaLiveSmtp = false;
  let smtpStatus = "Queued in Local Verification Outbox";

  if (appPassword.length >= 8) {
    const res = await sendRawSmtpTls({
      host: smtpHost,
      port: smtpPort,
      user: fromBusinessEmail,
      pass: appPassword,
      fromName: "Kalbu Sanctuary",
      to: params.toUserEmail,
      subject,
      text,
      html,
    });
    sentViaLiveSmtp = res.ok;
    smtpStatus = res.status;
  }

  try {
    let logs: SentEmailLog[] = [];
    if (fs.existsSync(OUTBOUND_LOG_PATH)) {
      logs = JSON.parse(fs.readFileSync(OUTBOUND_LOG_PATH, "utf-8"));
    }
    logs.unshift({
      id: `EMAIL-${Date.now()}`,
      fromBusinessEmail,
      toUserEmail: params.toUserEmail,
      subject,
      verificationCode: params.verificationCode,
      sentViaLiveSmtp,
      smtpStatus,
      sentAt: new Date().toISOString(),
    });
    fs.mkdirSync(path.dirname(OUTBOUND_LOG_PATH), { recursive: true });
    fs.writeFileSync(
      OUTBOUND_LOG_PATH,
      JSON.stringify(logs.slice(0, 50), null, 2),
      "utf-8"
    );
  } catch (err) {
    console.warn("[Kalbu Mailer] Failed to write outbound email log:", err);
  }

  return {
    fromBusinessEmail,
    sentViaLiveSmtp,
    smtpStatus,
  };
}
