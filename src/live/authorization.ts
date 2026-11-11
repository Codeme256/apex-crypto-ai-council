/**
 * Live trading authorization gate — Phase 4
 *
 * Spot live is OFF unless a server-side authorization record is:
 *  - present
 *  - not expired
 *  - explicitly scoped to SPOT_LIVE
 *  - not revoked
 *
 * Authorization cannot be granted via Telegram chat ID alone.
 * It must be written by a trusted operator process using PUBLISH/ADMIN secret.
 */

import { z } from "zod";
import type { ExecutionMode } from "../types/index.ts";

export const LiveAuthScopeSchema = z.enum(["SPOT_LIVE"]);
export type LiveAuthScope = z.infer<typeof LiveAuthScopeSchema>;

export const LiveAuthorizationSchema = z.object({
  id: z.string().min(8),
  scope: LiveAuthScopeSchema,
  /** Unix ms */
  issuedAt: z.number().int().positive(),
  /** Unix ms — hard expiry */
  expiresAt: z.number().int().positive(),
  /** Operator note (no secrets) */
  reason: z.string().max(500).default(""),
  /** Max notional per order in USDT */
  maxNotionalUsdt: z.number().positive().default(50),
  /** Max open live positions while this auth is valid */
  maxLivePositions: z.number().int().positive().default(1),
  revoked: z.boolean().default(false),
  /** SHA-256 of operator token used to issue (audit only) */
  issuerFingerprint: z.string().optional(),
});
export type LiveAuthorization = z.infer<typeof LiveAuthorizationSchema>;

export interface AuthCheckResult {
  allowed: boolean;
  reasons: string[];
  auth?: LiveAuthorization;
}

const MAX_AUTH_TTL_MS = 24 * 60 * 60 * 1000; // 24h absolute max
const DEFAULT_AUTH_TTL_MS = 4 * 60 * 60 * 1000; // 4h default

/**
 * Validate an authorization object for SPOT_LIVE at `now`.
 */
export function checkLiveAuthorization(
  auth: LiveAuthorization | null | undefined,
  now = Date.now(),
): AuthCheckResult {
  if (!auth) {
    return { allowed: false, reasons: ["No live authorization record"] };
  }
  const reasons: string[] = [];
  if (auth.scope !== "SPOT_LIVE") {
    reasons.push(`Scope ${auth.scope} is not SPOT_LIVE`);
  }
  if (auth.revoked) {
    reasons.push("Authorization has been revoked");
  }
  if (now >= auth.expiresAt) {
    reasons.push(
      `Authorization expired at ${new Date(auth.expiresAt).toISOString()}`,
    );
  }
  if (auth.expiresAt - auth.issuedAt > MAX_AUTH_TTL_MS) {
    reasons.push("Authorization TTL exceeds maximum allowed (24h)");
  }
  if (auth.issuedAt > now + 60_000) {
    reasons.push("Authorization issuedAt is in the future");
  }
  if (auth.maxNotionalUsdt <= 0 || auth.maxNotionalUsdt > 5_000) {
    reasons.push("maxNotionalUsdt out of acceptable range (0, 5000]");
  }
  if (auth.maxLivePositions < 1 || auth.maxLivePositions > 3) {
    reasons.push("maxLivePositions must be 1–3 for Phase 4");
  }
  return {
    allowed: reasons.length === 0,
    reasons,
    auth: reasons.length === 0 ? auth : auth,
  };
}

export function createLiveAuthorization(input: {
  id?: string;
  reason?: string;
  ttlMs?: number;
  maxNotionalUsdt?: number;
  maxLivePositions?: number;
  issuerFingerprint?: string;
  now?: number;
}): LiveAuthorization {
  const now = input.now ?? Date.now();
  const ttl = Math.min(input.ttlMs ?? DEFAULT_AUTH_TTL_MS, MAX_AUTH_TTL_MS);
  if (ttl < 15 * 60 * 1000) {
    throw new Error("Live authorization TTL must be at least 15 minutes");
  }
  return LiveAuthorizationSchema.parse({
    id: input.id ?? cryptoRandomId(),
    scope: "SPOT_LIVE",
    issuedAt: now,
    expiresAt: now + ttl,
    reason: input.reason ?? "",
    maxNotionalUsdt: input.maxNotionalUsdt ?? 50,
    maxLivePositions: input.maxLivePositions ?? 1,
    revoked: false,
    issuerFingerprint: input.issuerFingerprint,
  });
}

/**
 * Map requested mode through the gate.
 * SPOT_LIVE only passes when auth is valid; otherwise falls back to PAPER.
 */
export function resolveExecutionMode(
  requested: ExecutionMode,
  auth: LiveAuthorization | null | undefined,
  now = Date.now(),
): { mode: ExecutionMode; reasons: string[] } {
  if (requested !== "SPOT_LIVE") {
    if (requested === "FUTURES_LIVE") {
      return {
        mode: "PAPER",
        reasons: ["FUTURES_LIVE is Phase 5 and is not available"],
      };
    }
    return { mode: requested, reasons: [] };
  }
  const check = checkLiveAuthorization(auth, now);
  if (!check.allowed) {
    return {
      mode: "PAPER",
      reasons: ["SPOT_LIVE denied — falling back to PAPER", ...check.reasons],
    };
  }
  return { mode: "SPOT_LIVE", reasons: [] };
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `auth_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
