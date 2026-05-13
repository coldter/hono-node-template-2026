/**
 * Zod schemas for the custom-hostname HTTP layer. Wire-shape only;
 * hostname-shape policy lives in `./custom-hostname-service.ts`
 * (`validateHostnameShape`) so it's tested alongside the service.
 */

import { z } from "@hono/zod-openapi";
import { customHostnameLifecycle } from "@repo/db/schema";

export const customHostnameRowSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  hostname: z.string(),
  lifecycleStatus: z.enum(customHostnameLifecycle),
  caddyCertStorageKey: z.string().nullable(),
  verificationToken: z.string(),
  verificationVerifiedAt: z.string().nullable(),
  verificationErrors: z.array(z.string()),
  lastReconciledAt: z.string().nullable(),
  lastHandshakeAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomHostnameRow = z.infer<typeof customHostnameRowSchema>;

export const createCustomHostnameBodySchema = z.object({
  hostname: z
    .string()
    .min(1)
    .max(253)
    .describe("The custom hostname the tenant wants to associate."),
});

export const createCustomHostnameResponseSchema = z.object({
  hostname: customHostnameRowSchema,
  cnameTarget: z.string(),
  txtLabel: z.string(),
});

export const listCustomHostnamesResponseSchema = z.object({
  hostnames: z.array(customHostnameRowSchema),
});

export const customHostnameIdParamSchema = z.object({
  id: z.string().min(1).describe("Custom hostname row id (prefix `tnh_`)."),
});
