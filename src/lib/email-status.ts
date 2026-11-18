/**
 * Email delivery states shown in the platform.
 * - "accepted": Make answered HTTP 200 — the request was received, delivery is not yet confirmed.
 * - "sent": delivery confirmed by the mail provider (Resend direct, or a later confirmation).
 */
export type EmailRowStatus = "accepted" | "sent" | "skipped" | "failed";

/** States that block a second send (duplicate protection). */
export const QUEUED_OR_SENT: EmailRowStatus[] = ["sent", "accepted"];

export function emailRowStatus(r: { ok: boolean; status: string }): EmailRowStatus {
  if (r.status === "accepted") return "accepted";
  if (r.status === "sent") return "sent";
  if (r.status === "skipped") return "skipped";
  return "failed";
}

export function emailStatusLabel(status: string): string {
  if (status === "accepted") return "Solicitud recibida por Make; envío pendiente de confirmación";
  if (status === "sent") return "Enviado";
  if (status === "resent") return "Reenviado";
  if (status === "skipped") return "No enviado (sin configuración)";
  if (status === "failed") return "Falló";
  return status;
}

/** Reminder row status from a provider result: accepted is kept for review, never upgraded to sent. */
export function reminderRowStatus(r: { ok: boolean; status: string }): EmailRowStatus {
  return emailRowStatus(r);
}

/** True when a reminder/preparation email must not be dispatched again automatically. */
export function alreadyRequested(status: string | null | undefined): boolean {
  return status === "accepted" || status === "sent" || status === "resent";
}
