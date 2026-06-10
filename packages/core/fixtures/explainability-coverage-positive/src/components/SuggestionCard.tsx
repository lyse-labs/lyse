import { AILabel } from "./AILabel.js";
import { ExplainPopover } from "./ExplainPopover.js";
import type { ExplainPayload } from "./ExplainPopover.js";

const EXPLAIN_ID = "suggestion-explain";

export function SuggestionCard({ text, explanation }: { text: string; explanation: ExplainPayload }) {
  return (
    <div className="suggestion-card">
      <AILabel explainId={EXPLAIN_ID} />
      <p>{text}</p>
      <ExplainPopover id={EXPLAIN_ID} payload={explanation} />
    </div>
  );
}
