export function ExplainPopover({ content }: { content: string }) {
  return (
    <div role="dialog" aria-label="Explanation">
      {content}
    </div>
  );
}
