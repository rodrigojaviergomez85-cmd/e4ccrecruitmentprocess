import { primaryRole } from "./roles";

type AnyDb = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/**
 * Writes one extended audit row: actor, actor role, action, entity, application,
 * old value and new value. Never pass passwords, codes, tokens or webhook URLs.
 */
export async function writeAudit(
  db: AnyDb,
  entry: {
    actorId: string | null;
    actorEmail?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    applicationId?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
    details?: Record<string, unknown>;
  },
) {
  let actorRole: string | null = null;
  if (entry.actorId) {
    const { data } = await db.from("user_roles").select("role").eq("user_id", entry.actorId);
    actorRole = primaryRole(((data as { role: string }[] | null) ?? []).map((r) => r.role));
  }
  await db.from("audit_logs").insert({
    actor_id: entry.actorId,
    actor_email: entry.actorEmail ?? null,
    actor_role: actorRole,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    application_id: entry.applicationId ?? null,
    old_value: entry.oldValue === undefined ? null : entry.oldValue,
    new_value: entry.newValue === undefined ? null : entry.newValue,
    details: entry.details ?? {},
  });
}
