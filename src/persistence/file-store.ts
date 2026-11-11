/**
 * Simple JSON file persistence for paper portfolio (Node API process).
 * Free, no external DB required for MVP completion.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PortfolioSnapshot } from "../types/index.ts";

const DEFAULT_PATH = join(process.cwd(), "data", "paper-state.json");

export interface PersistedPaperState {
  version: 1;
  savedAt: number;
  portfolio: PortfolioSnapshot;
  /** Opaque engine dump if provided */
  engineJson?: string;
}

export async function loadPaperState(
  path = process.env.PAPER_STATE_PATH || DEFAULT_PATH,
): Promise<PersistedPaperState | null> {
  try {
    const raw = await readFile(path, "utf8");
    const data = JSON.parse(raw) as PersistedPaperState;
    if (data?.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export async function savePaperState(
  state: PersistedPaperState,
  path = process.env.PAPER_STATE_PATH || DEFAULT_PATH,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), "utf8");
}
