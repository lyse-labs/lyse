export function injectDrift(source: string, marker: string, literal: string): { source: string; line: number } {
  const idx = source.indexOf(marker);
  if (idx === -1) throw new Error(`injectDrift: marker not found: ${marker}`);
  let line = 1;
  for (let i = 0; i < idx; i++) if (source.charCodeAt(i) === 10) line++;
  return { source: source.slice(0, idx) + literal + source.slice(idx + marker.length), line };
}
