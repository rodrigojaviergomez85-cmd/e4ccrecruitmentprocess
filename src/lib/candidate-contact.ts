import { z } from "zod";

export const candidateContactSchema = z.object({
  applicationId: z.string().uuid(),
  full_name: z.string().trim().min(2, "Enter the candidate's full name").max(150),
  email: z.string().trim().email("Enter a valid email address").max(255).transform((v) => v.toLowerCase()),
  phone: z.string().trim().min(4, "Enter the candidate's phone number").max(40),
});

export function canEditInterviewContact(access: { canEvaluate: boolean; isAdmin: boolean }, status: string) {
  return access.canEvaluate && (status !== "Approved for Training" || access.isAdmin);
}