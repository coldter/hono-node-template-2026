import type { DrizzleClient, Executor } from "@repo/db";

/**
 * Centralized typed stub constructors for Drizzle's `DrizzleClient` and
 * `Executor` types.
 *
 * boundary: Drizzle vendor-SDK generic variance — `DrizzleClient` is a deeply
 * composed type built from the full schema graph. Tests stub only the call
 * sites they exercise (e.g. `select().from()...`), and reconstructing the full
 * shape is intractable. Centralizing the cast here keeps the boundary at one
 * site instead of N callers. The `& TShape` intersection preserves access to
 * the explicit fields the caller provided while satisfying the consumer's
 * structural requirement of the full client type.
 */
export function makeDrizzleStub<TShape extends object>(
  shape: TShape
): DrizzleClient & TShape {
  return shape as DrizzleClient & TShape;
}

/**
 * Same boundary rationale as `makeDrizzleStub`, but for the `Executor` union
 * (`DrizzleClient | Transaction`) used by code paths that accept either a
 * standalone client or an open transaction.
 */
export function makeExecutorStub<TShape extends object>(
  shape: TShape
): Executor & TShape {
  return shape as Executor & TShape;
}
