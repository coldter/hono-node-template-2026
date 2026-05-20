import { z } from "zod";

const SUB_ROLE = z.enum(["platform_admin", "support", "read_only"]);

export const inviteOperatorBody = z.object({
  email: z.string().email().max(254),
  subRole: SUB_ROLE,
  ttlDays: z.number().int().min(1).max(30).optional(),
});
export type InviteOperatorBody = z.infer<typeof inviteOperatorBody>;

export const redeemEnrollmentBody = z.object({
  // Optional; the URL token is canonical and the route layer enforces equality when both are present.
  token: z.string().min(16).max(256).optional(),
  password: z
    .string()
    .min(12, "password must be at least 12 characters")
    .max(256),
  displayName: z.string().min(1).max(120).optional(),
});
export type RedeemEnrollmentBody = z.infer<typeof redeemEnrollmentBody>;

export const enrollmentIdParam = z.object({
  id: z.string().min(1),
});
export type EnrollmentIdParam = z.infer<typeof enrollmentIdParam>;

export const tokenParam = z.object({
  token: z.string().min(16).max(256),
});
export type TokenParam = z.infer<typeof tokenParam>;

// Plaintext token is returned exactly once; the server never re-emits it after this response.
export const inviteResponse = z.object({
  enrollmentId: z.string(),
  token: z.string(),
  expiresAt: z.string(),
});
export type InviteResponse = z.infer<typeof inviteResponse>;

export const enrollmentRow = z.object({
  id: z.string(),
  email: z.string(),
  subRole: SUB_ROLE,
  expiresAt: z.string().nullable(),
  invitedAt: z.string(),
});
export type EnrollmentRow = z.infer<typeof enrollmentRow>;

export const listPendingResponse = z.object({
  rows: z.array(enrollmentRow),
});
export type ListPendingResponse = z.infer<typeof listPendingResponse>;
