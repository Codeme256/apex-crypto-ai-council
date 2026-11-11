/**
 * Kill switch & circuit breaker operations — Phase 6
 * State is intended to be persisted in crypto_paper_state / crypto_circuit_breakers.
 */

import type { PortfolioSnapshot } from "../types/index.ts";
import { PaperEngine } from "../paper/engine.ts";

export type HaltReason =
  | "OPERATOR"
  | "DAILY_LOSS"
  | "WEEKLY_LOSS"
  | "CONSECUTIVE_LOSSES"
  | "PROTECTION_FAILED"
  | "RECONCILE_FAIL"
  | "CONNECTIVITY"
  | "UNKNOWN";

export interface HaltEvent {
  id: string;
  type: "KILL_SWITCH" | "CIRCUIT_BREAKER";
  active: boolean;
  reason: HaltReason;
  detail: string;
  timestamp: number;
}

export function activateKillSwitch(
  paper: PaperEngine,
  reason: HaltReason = "OPERATOR",
  detail = "",
): HaltEvent {
  paper.setKillSwitch(true);
  return {
    id: newId(),
    type: "KILL_SWITCH",
    active: true,
    reason,
    detail,
    timestamp: Date.now(),
  };
}

export function deactivateKillSwitch(
  paper: PaperEngine,
  detail = "Operator cleared kill switch",
): HaltEvent {
  paper.setKillSwitch(false);
  return {
    id: newId(),
    type: "KILL_SWITCH",
    active: false,
    reason: "OPERATOR",
    detail,
    timestamp: Date.now(),
  };
}

export function activateCircuitBreaker(
  paper: PaperEngine,
  reason: HaltReason,
  detail = "",
): HaltEvent {
  paper.setCircuitBreaker(true);
  return {
    id: newId(),
    type: "CIRCUIT_BREAKER",
    active: true,
    reason,
    detail,
    timestamp: Date.now(),
  };
}

export function deactivateCircuitBreaker(
  paper: PaperEngine,
  detail = "Operator cleared circuit breaker",
): HaltEvent {
  paper.setCircuitBreaker(false);
  return {
    id: newId(),
    type: "CIRCUIT_BREAKER",
    active: false,
    reason: "OPERATOR",
    detail,
    timestamp: Date.now(),
  };
}

/**
 * Auto-trip circuit based on portfolio vs configured limits.
 * Does not clear kill switch.
 */
export function evaluateAutoHalt(
  portfolio: PortfolioSnapshot,
  limits: {
    dailyLossLimitPct: number;
    weeklyLossLimitPct: number;
    consecutiveLossPause: number;
  },
): HaltEvent | null {
  const equity = Math.max(portfolio.equity, 1e-9);
  if (portfolio.dailyPnl < 0) {
    const pct = (Math.abs(portfolio.dailyPnl) / equity) * 100;
    if (pct >= limits.dailyLossLimitPct) {
      return {
        id: newId(),
        type: "CIRCUIT_BREAKER",
        active: true,
        reason: "DAILY_LOSS",
        detail: `Daily loss ${pct.toFixed(2)}% >= ${limits.dailyLossLimitPct}%`,
        timestamp: Date.now(),
      };
    }
  }
  if (portfolio.weeklyPnl < 0) {
    const pct = (Math.abs(portfolio.weeklyPnl) / equity) * 100;
    if (pct >= limits.weeklyLossLimitPct) {
      return {
        id: newId(),
        type: "CIRCUIT_BREAKER",
        active: true,
        reason: "WEEKLY_LOSS",
        detail: `Weekly loss ${pct.toFixed(2)}% >= ${limits.weeklyLossLimitPct}%`,
        timestamp: Date.now(),
      };
    }
  }
  if (portfolio.consecutiveLosses >= limits.consecutiveLossPause) {
    return {
      id: newId(),
      type: "CIRCUIT_BREAKER",
      active: true,
      reason: "CONSECUTIVE_LOSSES",
      detail: `${portfolio.consecutiveLosses} consecutive losses`,
      timestamp: Date.now(),
    };
  }
  return null;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `halt_${Date.now()}`;
}
