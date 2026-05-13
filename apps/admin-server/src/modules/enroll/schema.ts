/**
 * Wire schemas for `/api/admin/operator-enroll`. The lifecycle itself
 * (state-machine, audit emission, user/account materialisation) lives in
 * `./lifecycle.ts`; this module only describes the JSON shapes the admin
 * UI exchanges. Validation lives here so a malformed payload fails before
 * the writer transaction opens.
 */

import { z } from "zod";

const SUB_ROLE = z.enum(["platform_admin", "support", "read_only"]);

export const inviteOperatorBody = z.object({
  email: z.string().email().max(254),
  subRole: SUB_ROLE,
  ttlDays: z.number().int().min(1).max(30).optional(),
});
export type InviteOperatorBody = z.infer<typeof inviteOperatorBody>;

export const redeemEnrollmentBody = z.object({
  token: z.string().min(16).max(256),
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

// Wire-shape mirror of the lifecycle's `InviteResult`. The plaintext token
// is returned exactly once on invite so the operator can transport it to
// the invitee through whatever channel they choose. After this response
// the server never re-emits the token.
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
