export function AILabel({ explainId }: { explainId: string }) {
  return (
    <button aria-describedby={explainId} className="ai-badge">
      AI
    </button>
  );
}
