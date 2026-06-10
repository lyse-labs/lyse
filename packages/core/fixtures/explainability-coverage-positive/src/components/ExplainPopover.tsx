export interface ExplainPayload {
  what: string;
  why: string;
  how: string;
}

export function ExplainPopover({ id, payload }: { id: string; payload: ExplainPayload }) {
  return (
    <div id={id} role="dialog" aria-label="AI explanation">
      <p><strong>What:</strong> {payload.what}</p>
      <p><strong>Why:</strong> {payload.why}</p>
      <p><strong>How:</strong> {payload.how}</p>
    </div>
  );
}
