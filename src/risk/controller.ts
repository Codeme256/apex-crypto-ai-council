/**
 * Deterministic risk controller — Phase 1
 * Agents cannot override these checks.
 */

import {
  type MarketType,
  type RiskLimits,
  type RiskCheckResult,
  type TradeCandidate,
  type PortfolioSnapshot,
  type SymbolFilters,
  SPOT_PAPER_LIMITS,
  FUTURES_PAPER_LIMITS,
} from "../types/index.ts";

const STALE_MS = 60_000; // reject if market data older than 60s

export function getLimits(market: MarketType): RiskLimits {
  return market === "SPOT" ? SPOT_PAPER_LIMITS : FUTURES_PAPER_LIMITS;
}

export interface RiskContext {
  portfolio: PortfolioSnapshot;
  filters: SymbolFilters;
  now?: number;
}

/**
 * Hard risk gate. Returns allowed=false with reasons when any rule fails.
 * Never throws for business-rule failures.
 */
export function evaluateRisk(
  candidate: TradeCandidate,
  ctx: RiskContext,
): RiskCheckResult {
  const reasons: string[] = [];
  const limits = getLimits(candidate.market);
  const now = ctx.now ?? Date.now();
  const { portfolio, filters } = ctx;

  if (portfolio.killSwitchActive) {
    reasons.push("Kill switch is active");
  }
  if (portfolio.circuitBreakerActive) {
    reasons.push("Circuit breaker is active");
  }

  if (now - candidate.marketDataTimestamp > STALE_MS) {
    reasons.push(
      `Stale market data (${Math.round((now - candidate.marketDataTimestamp) / 1000)}s old)`,
    );
  }

  if (portfolio.openPositions >= limits.maxConcurrentPositions) {
    reasons.push(
      `Max concurrent positions reached (${limits.maxConcurrentPositions})`,
    );
  }

  if (portfolio.consecutiveLosses >= limits.consecutiveLossPause) {
    reasons.push(
      `Paused after ${portfolio.consecutiveLosses} consecutive losses (limit ${limits.consecutiveLossPause})`,
    );
  }

  const equity = Math.max(portfolio.equity, 1e-9);
  if (portfolio.dailyPnl < 0) {
    const dailyLossPct = (Math.abs(portfolio.dailyPnl) / equity) * 100;
    if (dailyLossPct >= limits.dailyLossLimitPct) {
      reasons.push(
        `Daily loss limit reached (${dailyLossPct.toFixed(2)}% >= ${limits.dailyLossLimitPct}%)`,
      );
    }
  }
  if (portfolio.weeklyPnl < 0) {
    const weeklyLossPct = (Math.abs(portfolio.weeklyPnl) / equity) * 100;
    if (weeklyLossPct >= limits.weeklyLossLimitPct) {
      reasons.push(
        `Weekly loss limit reached (${weeklyLossPct.toFixed(2)}% >= ${limits.weeklyLossLimitPct}%)`,
      );
    }
  }

  const riskDist = Math.abs(candidate.entry - candidate.stopLoss);
  const rewardDist = Math.abs(candidate.takeProfit - candidate.entry);
  if (riskDist <= 0) {
    reasons.push("Invalid stop distance (zero or negative)");
  } else {
    const rr = rewardDist / riskDist;
    if (rr < limits.minRewardRisk) {
      reasons.push(
        `Reward/risk ${rr.toFixed(2)} below minimum ${limits.minRewardRisk}`,
      );
    }
  }

  if (filters.symbol !== candidate.symbol) {
    reasons.push("Symbol filter mismatch");
  }
  const riskPct = Math.min(
    candidate.proposedRiskPct,
    limits.riskPerSetupPct,
  );
  const riskAmount = (equity * riskPct) / 100;
  let qty = riskDist > 0 ? riskAmount / riskDist : 0;

  if (filters.stepSize > 0) {
    qty = Math.floor(qty / filters.stepSize) * filters.stepSize;
  }
  const factor = 10 ** filters.quantityPrecision;
  qty = Math.floor(qty * factor) / factor;

  if (qty < filters.minQty) {
    reasons.push(`Quantity ${qty} below minQty ${filters.minQty}`);
  }
  const notional = qty * candidate.entry;
  if (notional < filters.minNotional) {
    reasons.push(
      `Notional ${notional.toFixed(4)} below minNotional ${filters.minNotional}`,
    );
  }

  if (candidate.market === "USDT_M_FUTURES") {
    if (limits.maxLeverage !== undefined && limits.maxLeverage < 1) {
      reasons.push("Invalid max leverage configuration");
    }
  }

  if (!Number.isFinite(portfolio.equity) || portfolio.equity <= 0) {
    reasons.push("Account equity unknown or non-positive");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    adjustedQty: reasons.length === 0 ? qty : undefined,
    riskAmount: reasons.length === 0 ? riskAmount : undefined,
  };
}

export function computeRewardRisk(
  entry: number,
  stop: number,
  target: number,
): number {
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return 0;
  return Math.abs(target - entry) / risk;
}
