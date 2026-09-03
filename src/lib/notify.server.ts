/** Server-only notification helpers. Never logs secrets or message credentials. */

export type SendResult = {
  ok: boolean;
  status: "sent" | "skipped" | "failed";
  detail: string;
};

export function emailConfigured(): boolean {
  return Boolean(process.env["RESEND_API_KEY"]);
}

export function whatsappConfigured(): boolean {
  return Boolean(process.env["WHATSAPP_TOKEN"] && process.env["WHATSAPP_PHONE_NUMBER_ID"]);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  const key = process.env["RESEND_API_KEY"];
  if (!key) return { ok: false, status: "skipped", detail: "Email not configured" };
  const from = process.env["EMAIL_FROM"] ?? "E4CC Recruitment <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    const text = (await res.text()).slice(0, 500);
    if (!res.ok) return { ok: false, status: "failed", detail: `email ${res.status}: ${text}` };
    return { ok: true, status: "sent", detail: "email accepted" };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      detail: err instanceof Error ? err.message.slice(0, 300) : "email error",
    };
  }
}

export async function sendWhatsApp(opts: { to: string; body: string }): Promise<SendResult> {
  const token = process.env["WHATSAPP_TOKEN"];
  const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
  if (!token || !phoneId) {
    return { ok: false, status: "skipped", detail: "WhatsApp not configured" };
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: opts.to.replace(/[^0-9]/g, ""),
        type: "text",
        text: { body: opts.body },
      }),
    });
    const text = (await res.text()).slice(0, 500);
    if (!res.ok) return { ok: false, status: "failed", detail: `whatsapp ${res.status}: ${text}` };
    return { ok: true, status: "sent", detail: "whatsapp accepted" };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      detail: err instanceof Error ? err.message.slice(0, 300) : "whatsapp error",
    };
  }
}

export function baseUrl(): string {
  return (
    process.env["PUBLIC_SITE_URL"] ??
    process.env["VITE_PUBLIC_SITE_URL"] ??
    "https://english-kids-spark.lovable.app"
  );
}
