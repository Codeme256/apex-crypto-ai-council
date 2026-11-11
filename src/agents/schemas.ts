/**
 * Agent input/output schemas — Phase 1
 * Structured JSON only. LLMs never receive order credentials.
 */

import { z } from "zod";
import {
  AgentReportSchema,
  ChiefDecisionSchema,
  TradeCandidateSchema,
  MarketTypeSchema,
  SideSchema,
  TimeframeSchema,
} from "../types/index.ts";

export { AgentReportSchema, ChiefDecisionSchema, TradeCandidateSchema };

/** Deterministic chart features passed to Chart / Skeptic / Chief */
export const ChartFeaturesSchema = z.object({
  symbol: z.string(),
  market: MarketTypeSchema,
  timeframe: TimeframeSchema,
  ema9: z.number().optional(),
  ema21: z.number().optional(),
  ema50: z.number().optional(),
  rsi14: z.number().optional(),
  macd: z.number().optional(),
  macdSignal: z.number().optional(),
  macdHist: z.number().optional(),
  atr14: z.number().optional(),
  close: z.number(),
  volume: z.number().optional(),
  trend: z.enum(["UP", "DOWN", "RANGE"]).optional(),
  structureNote: z.string().optional(),
});
export type ChartFeatures = z.infer<typeof ChartFeaturesSchema>;

export const ScoutInputSchema = z.object({
  symbol: z.string(),
  market: MarketTypeSchema,
  timeframe: TimeframeSchema,
  candles: z.array(
    z.object({
      openTime: z.number(),
      open: z.number(),
      high: z.number(),
      low: z.number(),
      close: z.number(),
      volume: z.number(),
      closeTime: z.number(),
    }),
  ),
  marketDataTimestamp: z.number(),
});
export type ScoutInput = z.infer<typeof ScoutInputSchema>;

export const ScoutOutputSchema = z.object({
  found: z.boolean(),
  candidate: TradeCandidateSchema.optional(),
  report: AgentReportSchema,
});
export type ScoutOutput = z.infer<typeof ScoutOutputSchema>;

export const ChartAgentInputSchema = z.object({
  candidate: TradeCandidateSchema,
  features: ChartFeaturesSchema,
});
export type ChartAgentInput = z.infer<typeof ChartAgentInputSchema>;

export const NewsAgentInputSchema = z.object({
  symbol: z.string(),
  market: MarketTypeSchema,
  knownEvents: z.array(
    z.object({
      title: z.string(),
      time: z.string(),
      source: z.string(),
      impact: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    }),
  ),
});
export type NewsAgentInput = z.infer<typeof NewsAgentInputSchema>;

export const SentimentAgentInputSchema = z.object({
  symbol: z.string(),
  sources: z.array(
    z.object({
      name: z.string(),
      score: z.number().min(-1).max(1).optional(),
      note: z.string().optional(),
    }),
  ),
});
export type SentimentAgentInput = z.infer<typeof SentimentAgentInputSchema>;

export const SkepticInputSchema = z.object({
  candidate: TradeCandidateSchema,
  chartReport: AgentReportSchema.optional(),
  newsReport: AgentReportSchema.optional(),
  sentimentReport: AgentReportSchema.optional(),
  estimatedFeePct: z.number().default(0.1),
  correlatedExposure: z.number().default(0),
});
export type SkepticInput = z.infer<typeof SkepticInputSchema>;

export const ChiefInputSchema = z.object({
  candidate: TradeCandidateSchema,
  reports: z.array(AgentReportSchema),
});
export type ChiefInput = z.infer<typeof ChiefInputSchema>;
