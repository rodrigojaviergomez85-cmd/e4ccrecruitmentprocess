import { createHmac, timingSafeEqual } from "crypto";
import { createFileRoute } from "@tanstack/react-router";

function validSignature(body: string, header: string, secret: string) {
  const values = Object.fromEntries(header.split(",").map((part) => part.trim().split("=")));
  const timestamp = values["t"];
  const signature = values["v1"];
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export const Route = createFileRoute("/api/public/webhooks/calendly")({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env["CALENDLY_WEBHOOK_SIGNING_KEY"];
    if (!secret) return new Response("Webhook not configured", { status: 503 });
    const body = await request.text();
    const signature = request.headers.get("calendly-webhook-signature") ?? "";
    if (!validSignature(body, signature, secret)) return new Response("Invalid signature", { status: 401 });
    const payload = JSON.parse(body) as { event?: string };
    if (payload.event !== "invitee.created" && payload.event !== "invitee.canceled") return new Response("ok");
    const { syncCalendly } = await import("@/lib/calendly.server");
    await syncCalendly({ sinceDays: 2 });
    return new Response("ok");
  } } },
});