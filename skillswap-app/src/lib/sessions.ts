import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const SESSION_MINUTES = 60;
export const SESSION_BUFFER_MINUTES = 5;
export const RESCHEDULE_CUTOFF_MS = 24 * 60 * 60 * 1000;
export const PROPOSAL_RESPONSE_MS = 72 * 60 * 60 * 1000;

export function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function localDateTimeToUtc(value: string, timezone: string) {
  if (!isTimeZone(timezone) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const initial = new Date(target);
  const parts = localParts(initial, timezone);
  const represented = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  const candidate = new Date(target - (represented - target));
  const resultParts = localParts(candidate, timezone);
  if (
    Number(resultParts.year) !== year ||
    Number(resultParts.month) !== month ||
    Number(resultParts.day) !== day ||
    Number(resultParts.hour) !== hour ||
    Number(resultParts.minute) !== minute
  )
    return null; // Reject nonexistent local times during a daylight-saving jump.

  const matches = [-60, 0, 60].filter((offset) => {
    const probe = new Date(candidate.getTime() + offset * 60_000);
    const p = localParts(probe, timezone);
    return (
      Number(p.year) === year &&
      Number(p.month) === month &&
      Number(p.day) === day &&
      Number(p.hour) === hour &&
      Number(p.minute) === minute
    );
  });
  return matches.length > 1 ? null : candidate; // Ask the user to choose another time in a DST overlap.
}

export function formatSessionTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: isTimeZone(timezone) ? timezone : "UTC",
    timeZoneName: "short",
  }).format(date);
}

function meetingLinkKey() {
  const secret = process.env.SESSION_LINK_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Set SESSION_LINK_ENCRYPTION_KEY to at least 32 characters before saving meeting links.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptMeetingLink(link: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", meetingLinkKey(), iv);
  const encrypted = Buffer.concat([cipher.update(link, "utf8"), cipher.final()]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptMeetingLink(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Meeting link data is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", meetingLinkKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function validateMeetingLink(provider: string, input: string) {
  if (!input) return { provider: null, link: null };
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a complete meeting URL.");
  }
  if (url.protocol !== "https:") throw new Error("Meeting links must use HTTPS.");
  const host = url.hostname.toLowerCase();
  const accepted =
    provider === "ZOOM"
      ? host === "zoom.us" || host.endsWith(".zoom.us")
      : provider === "GOOGLE_MEET"
        ? host === "meet.google.com"
        : false;
  if (!accepted) throw new Error("Choose Zoom or Google Meet and enter a matching link.");
  return { provider, link: url.toString() };
}
