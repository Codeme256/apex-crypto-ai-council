/**
 * Paper trading engine — Phase 1
 * Simulated fills with configurable fee, spread, and slippage.
 * No connection to live Binance order endpoints.
 */

import { randomUUID } from "node:crypto";
import type {
  MarketType,
  Side,
  PaperOrder,
  PaperPosition,
  PortfolioSnapshot,
  ExecutionMode,
  TradeCandidate,
} from "../types/index.ts";

export interface PaperConfig {
  initialEquity: number;
  feeRate: number;
  halfSpreadPct: number;
  slippagePct: number;
}

export const DEFAULT_PAPER_CONFIG: PaperConfig = {
  initialEquity: 10_000,
  feeRate: 0.001,
  halfSpreadPct: 0.0002,
  slippagePct: 0.0003,
};

export class PaperEngine {
  private config: PaperConfig;
  private equity: number;
  private available: number;
  private dailyPnl = 0;
  private weeklyPnl = 0;
  private consecutiveLosses = 0;
  private killSwitch = false;
  private circuitBreaker = false;
  private positions = new Map<string, PaperPosition>();
  private orders = new Map<string, PaperOrder>();
  private mode: ExecutionMode = "PAPER";

  constructor(config: Partial<PaperConfig> = {}) {
    this.config = { ...DEFAULT_PAPER_CONFIG, ...config };
    this.equity = this.config.initialEquity;
    this.available = this.config.initialEquity;
  }

  getSnapshot(): PortfolioSnapshot {
    let unrealized = 0;
    for (const p of this.positions.values()) {
      if (p.status === "OPEN") unrealized += p.unrealizedPnl;
    }
    return {
      mode: this.mode,
      equity: this.equity + unrealized,
      available: this.available,
      dailyPnl: this.dailyPnl,
      weeklyPnl: this.weeklyPnl,
      openPositions: [...this.positions.values()].filter((p) => p.status === "OPEN")
        .length,
      consecutiveLosses: this.consecutiveLosses,
      circuitBreakerActive: this.circuitBreaker,
      killSwitchActive: this.killSwitch,
      timestamp: Date.now(),
    };
  }

  setKillSwitch(active: boolean): void {
    this.killSwitch = active;
  }

  setCircuitBreaker(active: boolean): void {
    this.circuitBreaker = active;
  }

  openFromCandidate(
    candidate: TradeCandidate,
    quantity: number,
    markPrice: number,
  ): { order: PaperOrder; position: PaperPosition } | { error: string } {
    if (this.killSwitch) return { error: "Kill switch active" };
    if (this.circuitBreaker) return { error: "Circuit breaker active" };
    if (quantity <= 0) return { error: "Invalid quantity" };

    const fillPrice = this.applySlippageAndSpread(markPrice, candidate.side);
    const notional = fillPrice * quantity;
    const fees = notional * this.config.feeRate;
    if (notional + fees > this.available) {
      return { error: "Insufficient paper balance" };
    }

    const now = Date.now();
    const order: PaperOrder = {
      clientOrderId: randomUUID(),
      symbol: candidate.symbol,
      market: candidate.market,
      side: candidate.side,
      type: "MARKET",
      quantity,
      price: fillPrice,
      status: "FILLED",
      filledQty: quantity,
      avgPrice: fillPrice,
      fees,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(order.clientOrderId, order);

    const position: PaperPosition = {
      id: randomUUID(),
      symbol: candidate.symbol,
      market: candidate.market,
      side: candidate.side,
      quantity,
      entryPrice: fillPrice,
      stopLoss: candidate.stopLoss,
      takeProfit: candidate.takeProfit,
      unrealizedPnl: 0,
      realizedPnl: 0,
      fees,
      openedAt: now,
      status: "OPEN",
      candidateId: candidate.id,
    };
    this.positions.set(position.id, position);
    this.available -= notional + fees;

    return { order, position };
  }

  markToMarket(
    symbol: string,
    market: MarketType,
    markPrice: number,
  ): PaperPosition[] {
    const closed: PaperPosition[] = [];
    for (const pos of this.positions.values()) {
      if (pos.status !== "OPEN" || pos.symbol !== symbol || pos.market !== market) {
        continue;
      }
      const direction = pos.side === "BUY" ? 1 : -1;
      pos.unrealizedPnl =
        (markPrice - pos.entryPrice) * pos.quantity * direction;

      const hitSl =
        pos.side === "BUY"
          ? markPrice <= pos.stopLoss
          : markPrice >= pos.stopLoss;
      const hitTp =
        pos.side === "BUY"
          ? markPrice >= pos.takeProfit
          : markPrice <= pos.takeProfit;

      if (hitSl || hitTp) {
        this.closePosition(pos.id, markPrice, hitSl ? "SL" : "TP");
        closed.push(pos);
      }
    }
    return closed;
  }

  closePosition(
    positionId: string,
    markPrice: number,
    reason: "SL" | "TP" | "MANUAL",
  ): PaperPosition | null {
    const pos = this.positions.get(positionId);
    if (!pos || pos.status !== "OPEN") return null;

    const direction = pos.side === "BUY" ? 1 : -1;
    const exitPrice = this.applySlippageAndSpread(
      markPrice,
      pos.side === "BUY" ? "SELL" : "BUY",
    );
    const gross = (exitPrice - pos.entryPrice) * pos.quantity * direction;
    const exitFees = exitPrice * pos.quantity * this.config.feeRate;
    const net = gross - exitFees - pos.fees;

    pos.realizedPnl = net;
    pos.unrealizedPnl = 0;
    pos.status = "CLOSED";
    pos.closedAt = Date.now();

    this.available += pos.entryPrice * pos.quantity + net + pos.fees;
    this.equity += net;
    this.dailyPnl += net;
    this.weeklyPnl += net;

    if (net < 0) this.consecutiveLosses += 1;
    else this.consecutiveLosses = 0;

    void reason;
    return pos;
  }

  listOpenPositions(): PaperPosition[] {
    return [...this.positions.values()].filter((p) => p.status === "OPEN");
  }

  listOrders(): PaperOrder[] {
    return [...this.orders.values()];
  }

  private applySlippageAndSpread(price: number, side: Side): number {
    const slip = this.config.slippagePct + this.config.halfSpreadPct;
    if (side === "BUY") return price * (1 + slip);
    return price * (1 - slip);
  }

  resetDailyPnl(): void {
    this.dailyPnl = 0;
  }

  resetWeeklyPnl(): void {
    this.weeklyPnl = 0;
  }
}
