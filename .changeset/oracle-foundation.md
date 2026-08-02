---
"@lyse-labs/lyse": patch
---

Three checks that reported success without having checked anything.

- **The CI gate treated an axis that stopped being scored as an axis that held.** `evaluateGate` compared scores behind `typeof cur === "number"`, and `cli.ts` builds the current map by dropping every non-numeric score — so an axis that abstained arrived as `undefined` and was skipped in silence. Push an axis under the minimum-sample guard and the gate exits 0 while the headline score *rises*, because the mean then runs over fewer axes: cruip 80 → 92, shadcn 86 → 93. A baselined axis that is no longer scored now fails by name, and no `scoreTolerance` excuses it.
- **A missing golden snapshot wrote itself and then asserted against it.** `if (UPDATE || !existsSync(snapPath)) writeFileSync(...)` turned a deleted snapshot into `x === x`. Only `UPDATE_GOLDEN=1` writes now; an absent reference is an error naming the repo and the regeneration command.
- **`lyse handoff` kept no record of the agent it spawned.** The default handoff disables the agent's permission prompts and lets it edit the working tree; `stdio: "inherit"` sent that output to the terminal and nowhere else. stdout and stderr are now teed to `.lyse/handoff/agent-transcript.log`, truncated per run, best-effort so an unwritable log never fails the handoff.
