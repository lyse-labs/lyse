import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

interface State {
  date: string;
  spentUsd: number;
}

export const DEFAULT_BUDGET_STATE_PATH = resolve(homedir(), ".cache", "lyse", "llm-budget.json");

export class LLMBudget {
  constructor(private opts: { dailyUsd: number; statePath: string }) {}

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private load(): State {
    const today = this.todayIso();
    if (!existsSync(this.opts.statePath)) return { date: today, spentUsd: 0 };
    try {
      const s = JSON.parse(readFileSync(this.opts.statePath, "utf8")) as State;
      return s.date === today ? s : { date: today, spentUsd: 0 };
    } catch {
      return { date: today, spentUsd: 0 };
    }
  }

  private save(s: State): void {
    mkdirSync(dirname(this.opts.statePath), { recursive: true });
    writeFileSync(this.opts.statePath, JSON.stringify(s));
  }

  canSpend(estimateUsd: number): boolean {
    const s = this.load();
    return s.spentUsd + estimateUsd <= this.opts.dailyUsd;
  }

  record(actualUsd: number): void {
    const s = this.load();
    s.spentUsd += actualUsd;
    this.save(s);
  }
}
