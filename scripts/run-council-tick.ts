#!/usr/bin/env tsx
/**
 * CLI: watchlist paper tick
 * Usage: npm run council
 */

import { actionRunCouncilTick } from "../src/index.ts";

const tick = await actionRunCouncilTick({ maxSymbolsPerTick: 2, mode: "PAPER" });
console.log(
  JSON.stringify(
    {
      scanned: tick.scanned,
      candidates: tick.candidates,
      approved: tick.approved,
      paperFills: tick.paperFills,
      rejected: tick.rejected,
      errors: tick.errors,
      notifications: tick.notifications,
      portfolio: tick.portfolio,
    },
    null,
    2,
  ),
);
