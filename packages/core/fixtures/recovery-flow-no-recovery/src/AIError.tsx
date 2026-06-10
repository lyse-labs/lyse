export const AIError = ({ message }: { message: string }) => (
  <div role="alert">
    <strong>Generation failed</strong>
    <p>{message}</p>
  </div>
);
