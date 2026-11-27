import { z } from "zod";
import { MAX_REFERENCES, REFERENCE_CALL_RESULTS } from "./admon";

export const admonReferencesInput = z.object({
  id: z.string().uuid(),
  calls: z.array(z.object({ result: z.enum(REFERENCE_CALL_RESULTS), comment: z.string().max(2000) })).max(10),
  references: z.array(z.object({
    company: z.string().trim().max(500),
    boss: z.string().trim().min(1, "Ingresa el nombre del contacto").max(500),
    phone: z.string().trim().max(80),
  })).max(MAX_REFERENCES).optional(),
}).refine((v) => !v.references || v.references.length === v.calls.length, "Cada referencia debe tener su propio resultado");

export function mergeAdmonReferences(previous: Record<string, unknown>[], incoming: { company: string; boss: string; phone: string }[]) {
  return incoming.map((reference, i) => ({ ...previous[i], ...reference }));
}