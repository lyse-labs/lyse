import { BadgeIA } from "./BadgeIA.js";

export function ActionsIA({ onRegenerate }: { onRegenerate: () => void }) {
  return (
    <button type="button" onClick={onRegenerate}>
      Régénérer
    </button>
  );
}

export function ResumeIA({
  resume,
  onRegenerate,
}: {
  resume: string;
  onRegenerate: () => void;
}) {
  return (
    <section className="resume-ia">
      <BadgeIA />
      <p>{resume}</p>
      <p className="avertissement">Généré par l'IA. Vérifiez les résultats.</p>
      <ActionsIA onRegenerate={onRegenerate} />
    </section>
  );
}
