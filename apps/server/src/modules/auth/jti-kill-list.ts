/**
 * Seam: the kill-list contract, not the transport. We keep this an interface
 * so tests + single-node dev use the in-memory adapter and prod swaps in the
 * Redis adapter without callers (logout flow, JWT verify) depending on Redis.
 */
export type JtiKillList = Readonly<{
  addKilled(jti: string, ttlSeconds: number): Promise<void>;
  isKilled(jti: string): Promise<boolean>;
}>;
