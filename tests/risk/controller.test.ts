import { describe, expect, it } from "vitest";
import type {
  PortfolioSnapshot,
  SymbolFilters,
  TradeCandidate,
} from "../../src/types/index.ts";
import { evaluateRisk } from "../../src/risk/controller.ts";

const NOW = 1_800_000_000_000;

function candidate(overrides: Partial<TradeCandidate> = {}): TradeCandidate {
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    symbol: "BTCUSDT",
    market: "SPOT",
    side: "BUY",
    timeframe: "15m",
    entry: 100,
    stopLoss: 95,
    takeProfit: 110,
    proposedRiskPct: 0.5,
    rewardRisk: 2,
    reasons: [],
    marketDataTimestamp: NOW,
    createdAt: NOW,
    status: "CANDIDATE",
    ...overrides,
  };
}

function portfolio(overrides: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
  return {
    mode: "PAPER",
    equity: 10_000,
    available: 10_000,
    dailyPnl: 0,
    weeklyPnl: 0,
    openPositions: 0,
    consecutiveLosses: 0,
    circuitBreakerActive: false,
    killSwitchActive: false,
    timestamp: NOW,
    ...overrides,
  };
}

const filters: SymbolFilters = {
  symbol: "BTCUSDT",
  market: "SPOT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  pricePrecision: 2,
  quantityPrecision: 3,
  tickSize: 0.01,
  stepSize: 0.001,
  minNotional: 10,
  minQty: 0.001,
};

const context = (overrides: Partial<PortfolioSnapshot> = {}) => ({
  portfolio: portfolio(overrides),
  filters,
  now: NOW,
});

describe("evaluateRisk", () => {
  it("allows a fresh candidate meeting the paper limits and sizes by stop distance", () => {
    const result = evaluateRisk(candidate(), context());

    expect(result).toEqual({
      allowed: true,
      reasons: [],
      adjustedQty: 10,
      riskAmount: 50,
    });
  });

  it("rejects a candidate when the kill switch is active", () => {
    const result = evaluateRisk(candidate(), context({ killSwitchActive: true }));

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Kill switch is active");
    expect(result.adjustedQty).toBeUndefined();
  });

  it("rejects stale market data", () => {
    const result = evaluateRisk(
      candidate({ marketDataTimestamp: NOW - 60_001 }),
      context(),
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Stale market data (60s old)");
  });

  it("rejects a reward-to-risk ratio below the minimum", () => {
    const result = evaluateRisk(candidate({ takeProfit: 104 }), context());

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Reward/risk 0.80 below minimum 2");
  });

  it("rejects mismatched exchange symbol filters", () => {
    const result = evaluateRisk(candidate(), {
      ...context(),
      filters: { ...filters, symbol: "ETHUSDT" },
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Symbol filter mismatch");
  });
});
