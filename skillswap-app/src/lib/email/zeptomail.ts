import "server-only";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendTransactionalEmail(message: EmailMessage) {
  const token = process.env.ZEPTOMAIL_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  const fromName = process.env.EMAIL_FROM_NAME ?? "SkillSwap";

  if (!token || !fromAddress) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[SkillSwap email preview] ${message.subject} → ${message.to}\n${message.text}`);
      return;
    }
    throw new Error("ZeptoMail is not configured. Set ZEPTOMAIL_API_KEY and EMAIL_FROM_ADDRESS.");
  }

  const response = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Zoho-enczapikey ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: { address: fromAddress, name: fromName },
      to: [{ email_address: { address: message.to } }],
      subject: message.subject,
      textbody: message.text,
      htmlbody: message.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    console.error("ZeptoMail delivery failed", { status: response.status });
    throw new Error("Email delivery failed. Please try again shortly.");
  }
}
