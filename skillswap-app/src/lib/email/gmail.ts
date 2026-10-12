import "server-only";
import nodemailer from "nodemailer";

type AuthEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendAuthEmail(message: AuthEmail) {
  const user = process.env.GMAIL_USER?.trim();
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");

  if (!user || !appPassword) {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[SkillSwap auth email preview] ${message.subject} → ${message.to}\n${message.text}`,
      );
      return;
    }
    throw new Error("Gmail auth email is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: appPassword },
    connectionTimeout: 7_000,
    greetingTimeout: 5_000,
    socketTimeout: 9_000,
  });

  try {
    await transporter.sendMail({
      from: { name: "SkillSwap", address: user },
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    console.error("SkillSwap Gmail auth email delivery failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    throw new Error(
      "Gmail could not send the authentication email. Check the Gmail settings and try again.",
    );
  } finally {
    transporter.close();
  }
}
