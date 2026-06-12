import { KIBadge } from "./KIBadge.js";

export function KIZusammenfassung({
  text,
  onRegenerate,
}: {
  text: string;
  onRegenerate: () => void;
}) {
  return (
    <section className="ki-zusammenfassung">
      <KIBadge />
      <p>{text}</p>
      <p className="hinweis">KI-generiert. Kann ungenau sein.</p>
      <button type="button" onClick={onRegenerate}>
        Neu generieren
      </button>
    </section>
  );
}
