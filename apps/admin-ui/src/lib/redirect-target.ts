import { z } from "zod";

// Rejects protocol-relative, backslash, and absolute-URL bypasses.
export const SAFE_REDIRECT_PATTERN = /^\/(?![/\\])[^\\]*$/;

// Accepts both DOM `Location` and TanStack Router `ParsedLocation` shapes.
export interface RedirectLocationLike {
  hash?: string;
  pathname: string;
  search?: unknown;
  searchStr?: string;
}

function normalizeHash(hash: string | undefined): string {
  if (!hash) {
    return "";
  }
  return hash.startsWith("#") ? hash : `#${hash}`;
}

function normalizeSearch(location: RedirectLocationLike): string {
  if (typeof location.searchStr === "string") {
    return location.searchStr;
  }
  if (typeof location.search === "string") {
    return location.search;
  }
  return "";
}

export function toRedirectParam(location: RedirectLocationLike): string {
  return (
    location.pathname + normalizeSearch(location) + normalizeHash(location.hash)
  );
}

function isSafePath(value: string): boolean {
  return SAFE_REDIRECT_PATTERN.test(value);
}

export function resolveRedirectTarget(
  value: string | undefined,
  fallback: string
): string {
  if (!isSafePath(fallback)) {
    throw new Error(`resolveRedirectTarget: unsafe fallback path: ${fallback}`);
  }
  if (!value) {
    return fallback;
  }
  return isSafePath(value) ? value : fallback;
}

export const redirectSearchSchema = z.object({
  redirect: z.string().regex(SAFE_REDIRECT_PATTERN).optional().catch(undefined),
});
