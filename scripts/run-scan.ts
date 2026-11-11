#!/usr/bin/env tsx
/**
 * CLI: one paper council scan against public Binance data
 * Usage: npm run scan -- BTCUSDT
 */

import { actionRunScan, publicWorkflowView, actionGetPortfolio } from "../src/index.ts";

const symbol = (process.argv[2] || "BTCUSDT").toUpperCase();

const result = await actionRunScan({
  symbol,
  market: "SPOT",
  timeframe: "15m",
  mode: "PAPER",
});

console.log(JSON.stringify({ ...publicWorkflowView(result), portfolio: actionGetPortfolio() }, null, 2));
