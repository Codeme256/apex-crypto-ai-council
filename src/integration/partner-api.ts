/**
 * Partner read API for Signal Tank — display only, no trade authority.
 */

export interface PartnerStatus {
  mode: string;
  killSwitch: boolean;
  circuitBreaker: boolean;
  equity: number;
  openPositions: number;
  timestamp: number;
}

export interface PartnerSignal {
  id: string;
  symbol: string;
  side: string;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  status: string;
  decidedAt: number;
  summary: string;
}

const signalBuffer: PartnerSignal[] = [];
const MAX_SIGNALS = 50;

export function pushPartnerSignal(s: PartnerSignal): void {
  signalBuffer.unshift(s);
  if (signalBuffer.length > MAX_SIGNALS) signalBuffer.length = MAX_SIGNALS;
}

export function listPartnerSignals(limit = 10): PartnerSignal[] {
  return signalBuffer.slice(0, Math.min(limit, MAX_SIGNALS));
}

export function verifyPartnerToken(
  header: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || expected.length < 16) return false;
  if (!header) return false;
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();
  return token === expected;
}
