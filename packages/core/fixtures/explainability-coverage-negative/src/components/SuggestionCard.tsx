import { AILabel } from "./AILabel.js";

export function SuggestionCard({ text }: { text: string }) {
  return (
    <div className="suggestion-card">
      <AILabel />
      <p>{text}</p>
    </div>
  );
}
