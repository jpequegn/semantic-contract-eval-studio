import { BadgeCheck, Database, ShieldCheck } from "lucide-react";

const stages = [
  ["Contracts", "Business meaning, ownership, freshness, and evidence."],
  ["Trials", "Compare a direct SQL route with governed resolution."],
  ["Decisions", "Block unsafe answers and explain what needs review."],
] as const;

export function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <ShieldCheck size={22} strokeWidth={2.25} />
          </span>
          <div>
            <p className="eyebrow">Synthetic evaluation workspace</p>
            <h1>Semantic Contract Eval Studio</h1>
          </div>
        </div>
        <span className="environment-badge">Local fixture</span>
      </header>

      <section className="workspace-intro" aria-labelledby="workspace-title">
        <div>
          <p className="eyebrow">Evaluation surface</p>
          <h2 id="workspace-title">
            Make business meaning and permissions testable.
          </h2>
          <p>
            The studio compares direct answers with governed semantic resolution
            using deterministic safety, outcome, and evidence gates.
          </p>
        </div>
      </section>

      <section className="stage-grid" aria-label="Evaluation stages">
        {stages.map(([title, description], index) => {
          const Icon =
            index === 0 ? Database : index === 1 ? BadgeCheck : ShieldCheck;
          return (
            <article className="stage" key={title}>
              <Icon size={20} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
