/**
 * APEX Crypto AI — shared types (Phase 1)
 * Isolated module. No live order submission.
 */

import { z } from "zod";

export const ExecutionModeSchema = z.enum([
  "READ_ONLY",
  "PAPER",
  "SPOT_LIVE",
  "FUTURES_LIVE",
]);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

export const DEFAULT_EXECUTION_MODE: ExecutionMode = "PAPER";

export const MarketTypeSchema = z.enum(["SPOT", "USDT_M_FUTURES"]);
export type MarketType = z.infer<typeof MarketTypeSchema>;

export const SideSchema = z.enum(["BUY", "SELL"]);
export type Side = z.infer<typeof SideSchema>;

export const TimeframeSchema = z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]);
export type Timeframe = z.infer<typeof TimeframeSchema>;

export interface OHLCV {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface SymbolFilters {
  symbol: string;
  market: MarketType;
  baseAsset: string;
  quoteAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  tickSize: number;
  stepSize: number;
  minNotional: number;
  minQty: number;
}

export const CandidateStatusSchema = z.enum([
  "CANDIDATE",
  "EVALUATING",
  "APPROVED",
  "REJECTED",
  "ORDER_PENDING",
  "PARTIALLY_FILLED",
  "FILLED",
  "PROTECTED",
  "EXITING",
  "CLOSED",
  "UNKNOWN_ORDER_STATUS",
  "PROTECTION_FAILED",
  "DISCONNECTED",
  "MANUAL_INTERVENTION_REQUIRED",
]);
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;

export const TradeCandidateSchema = z.object({
  id: z.string().uuid(),
  symbol: z.string(),
  market: MarketTypeSchema,
  side: SideSchema,
  timeframe: TimeframeSchema,
  entry: z.number().positive(),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive(),
  proposedRiskPct: z.number().positive(),
  rewardRisk: z.number(),
  scoutScore: z.number().min(0).max(100).optional(),
  reasons: z.array(z.string()).default([]),
  marketDataTimestamp: z.number(),
  createdAt: z.number(),
  status: CandidateStatusSchema.default("CANDIDATE"),
});
export type TradeCandidate = z.infer<typeof TradeCandidateSchema>;

export const AgentIdSchema = z.enum([
  "SCOUT",
  "NEWS",
  "SENTIMENT",
  "CHART",
  "SKEPTIC",
  "CHIEF",
  "RISK",
]);
export type AgentId = z.infer<typeof AgentIdSchema>;

export const AgentReportSchema = z.object({
  agent: AgentIdSchema,
  stance: z.enum(["BULLISH", "BEARISH", "NEUTRAL", "BLOCK"]).optional(),
  confidence: z.number().min(0).max(100).optional(),
  summary: z.string(),
  bullets: z.array(z.string()).default([]),
  objections: z.array(z.string()).default([]),
  timestamp: z.number(),
});
export type AgentReport = z.infer<typeof AgentReportSchema>;

export const ChiefDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "HOLD"]),
  summary: z.string(),
  objections: z.array(z.string()).default([]),
  finalEntry: z.number().optional(),
  finalStop: z.number().optional(),
  finalTarget: z.number().optional(),
  riskPct: z.number().optional(),
  timestamp: z.number(),
});
export type ChiefDecision = z.infer<typeof ChiefDecisionSchema>;

export interface RiskLimits {
  riskPerSetupPct: number;
  dailyLossLimitPct: number;
  weeklyLossLimitPct: number;
  maxConcurrentPositions: number;
  consecutiveLossPause: number;
  minRewardRisk: number;
  maxLeverage?: number;
  requireIsolatedMargin?: boolean;
  minLiquidationBufferPct?: number;
}

export const SPOT_PAPER_LIMITS: RiskLimits = {
  riskPerSetupPct: 0.5,
  dailyLossLimitPct: 2,
  weeklyLossLimitPct: 5,
  maxConcurrentPositions: 3,
  consecutiveLossPause: 2,
  minRewardRisk: 2,
};

export const FUTURES_PAPER_LIMITS: RiskLimits = {
  riskPerSetupPct: 0.25,
  dailyLossLimitPct: 1,
  weeklyLossLimitPct: 3,
  maxConcurrentPositions: 1,
  consecutiveLossPause: 1,
  minRewardRisk: 2,
  maxLeverage: 1,
  requireIsolatedMargin: true,
  minLiquidationBufferPct: 5,
};

export interface RiskCheckResult {
  allowed: boolean;
  reasons: string[];
  adjustedQty?: number;
  riskAmount?: number;
}

export interface PaperOrder {
  clientOrderId: string;
  symbol: string;
  market: MarketType;
  side: Side;
  type: "MARKET" | "LIMIT";
  quantity: number;
  price?: number;
  status: "NEW" | "PARTIALLY_FILLED" | "FILLED" | "CANCELED" | "REJECTED";
  filledQty: number;
  avgPrice: number;
  fees: number;
  createdAt: number;
  updatedAt: number;
}

export interface PaperPosition {
  id: string;
  symbol: string;
  market: MarketType;
  side: Side;
  quantity: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  unrealizedPnl: number;
  realizedPnl: number;
  fees: number;
  openedAt: number;
  closedAt?: number;
  status: "OPEN" | "CLOSED";
  candidateId?: string;
}

export interface PortfolioSnapshot {
  mode: ExecutionMode;
  equity: number;
  available: number;
  dailyPnl: number;
  weeklyPnl: number;
  openPositions: number;
  consecutiveLosses: number;
  circuitBreakerActive: boolean;
  killSwitchActive: boolean;
  timestamp: number;
}

export interface AuditEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}
