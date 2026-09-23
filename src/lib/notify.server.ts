/** Server-only notification helpers. Never logs secrets or message credentials. */

export type SendResult = {
  ok: boolean;
  status: "sent" | "skipped" | "failed";
  detail: string;
};

export function emailConfigured(): boolean {
  return Boolean(process.env["MAKE_RECRUITMENT_WEBHOOK_URL"] ?? process.env["RESEND_API_KEY"]);
}

export function whatsappConfigured(): boolean {
  return Boolean(process.env["WHATSAPP_TOKEN"] && process.env["WHATSAPP_PHONE_NUMBER_ID"]);
}

/**
 * Delivery goes through the Make scenario connected to Microsoft 365 Outlook.
 * The webhook URL lives only in the server environment and is never logged or
 * returned to the browser. Resend stays as a fallback when Make is not set.
 */
async function sendViaMake(opts: {
  to: string;
  subject: string;
  html: string;
  candidateName?: string;
  result?: string;
}): Promise<SendResult | null> {
  const url = process.env["MAKE_RECRUITMENT_WEBHOOK_URL"];
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: opts.to,
        candidate_name: opts.candidateName ?? "",
        result: opts.result ?? "notification",
        subject: opts.subject,
        html_body: opts.html,
      }),
    });
    const text = (await res.text()).slice(0, 300);
    if (!res.ok) return { ok: false, status: "failed", detail: `mail relay ${res.status}: ${text}` };
    return { ok: true, status: "sent", detail: "email accepted by mail relay" };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      detail: err instanceof Error ? err.message.slice(0, 300) : "mail relay error",
    };
  }
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  candidateName?: string;
  result?: string;
}): Promise<SendResult> {
  const viaMake = await sendViaMake(opts);
  if (viaMake) return viaMake;
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
    "https://e4ccrecruitmentprocess.lovable.app"
  );
}
