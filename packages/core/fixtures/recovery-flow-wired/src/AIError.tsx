interface AIErrorProps {
  message: string;
  onRetry: () => void;
  fallbackContent?: React.ReactNode;
}

export const AIError = ({ message, onRetry, fallbackContent }: AIErrorProps) => (
  <div role="alert">
    <strong>Generation failed</strong>
    <p>{message}</p>
    <button type="button" onClick={onRetry}>
      Retry
    </button>
    {fallbackContent && (
      <div aria-label="Previous result">
        {fallbackContent}
      </div>
    )}
  </div>
);
