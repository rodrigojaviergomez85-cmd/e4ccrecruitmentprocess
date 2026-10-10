import { z } from "zod";

export const candidateContactSchema = z.object({
  applicationId: z.string().uuid(),
  full_name: z.string().trim().min(2, "Enter the candidate's full name").max(150),
  email: z.string().trim().email("Enter a valid email address").max(255).transform((v) => v.toLowerCase()),
  phone: z.string().trim().max(40).refine((v) => v.length === 0 || v.length >= 4, "Enter a valid phone number"),
  country_code: z.string().trim().min(2).max(8).optional(),
});

export function canEditInterviewContact(access: { canEvaluate: boolean; isAdmin: boolean }, status: string) {
  return access.canEvaluate && (status !== "Approved for Training" || access.isAdmin);
}