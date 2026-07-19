import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Database,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Route = "governed" | "naive";
type Status = "answered" | "blocked" | "escalated";

interface Grade {
  readonly detail: string;
  readonly dimension: "safety" | "outcome" | "evidence" | "efficiency";
  readonly passed: boolean;
}

interface Trial {
  readonly accepted: boolean;
  readonly contextBytes: number;
  readonly grades: readonly Grade[];
  readonly result: {
    readonly evidence?: {
      readonly asOf: string;
      readonly metricId: string;
      readonly owner: string;
      readonly queryHash: string;
      readonly source: string;
      readonly version: number;
    } | null;
    readonly query: string | null;
    readonly reasonCodes?: readonly string[];
    readonly route: Route;
    readonly source: string | null;
    readonly status: Status;
    readonly toolCalls: readonly { readonly name: string }[];
  };
}

interface ReviewTask {
  readonly actor: { readonly purpose: string; readonly role: string };
  readonly capability: string;
  readonly category: string;
  readonly expected: {
    readonly contractId?: string;
    readonly outcome: string;
    readonly reason: string;
  };
  readonly id: string;
  readonly request: string;
  readonly risk: string;
}

interface TaskReview {
  readonly task: ReviewTask;
  readonly trials: readonly Trial[];
}

interface Scorecard {
  readonly acceptedRate: number;
  readonly ambiguityEscalationRate: number;
  readonly averageContextBytes: number;
  readonly averageToolCalls: number;
  readonly evidenceCompletenessRate: number;
  readonly freshnessEscalationRate: number;
  readonly permissionSafetyRate: number;
  readonly reviewerBurdenMinutes: number;
  readonly route: Route;
  readonly semanticSuccessRate: number;
  readonly split: { readonly kind: string; readonly value: string };
  readonly totalTrials: number;
}

interface OverviewResponse {
  readonly scorecards: readonly Scorecard[];
  readonly summary: {
    readonly governed?: Scorecard;
    readonly naive?: Scorecard;
    readonly taskCount: number;
    readonly trialCount: number;
  };
}

interface Filters {
  readonly capability: string;
  readonly risk: string;
  readonly role: string;
}

const initialFilters: Filters = {
  capability: "all",
  risk: "all",
  role: "all",
};
const routeOrder: readonly Route[] = ["naive", "governed"];

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function rate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function statusClass(status: Status, accepted: boolean): string {
  if (accepted) {
    return "status status-accepted";
  }
  if (status === "blocked") {
    return "status status-blocked";
  }
  if (status === "escalated") {
    return "status status-escalated";
  }
  return "status status-failed";
}

function StatusPill({ trial }: { readonly trial: Trial }) {
  const label = trial.accepted ? "accepted" : trial.result.status;
  return (
    <span className={statusClass(trial.result.status, trial.accepted)}>
      {label}
    </span>
  );
}

function trialFor(review: TaskReview, route: Route): Trial {
  const trial = review.trials.find((item) => item.result.route === route);
  if (!trial) {
    throw new Error(`Missing ${route} trial for ${review.task.id}`);
  }
  return trial;
}

function queryFor(filters: Filters): string {
  const parameters = new URLSearchParams();
  if (filters.role !== "all") parameters.set("role", filters.role);
  if (filters.risk !== "all") parameters.set("risk", filters.risk);
  if (filters.capability !== "all") {
    parameters.set("capability", filters.capability);
  }
  const serialized = parameters.toString();
  return serialized ? `?${serialized}` : "";
}

export function App() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [overview, setOverview] = useState<OverviewResponse>();
  const [reviews, setReviews] = useState<readonly TaskReview[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);

  const loadOverview = async () => {
    setRefreshing(true);
    try {
      setOverview(await fetchJson<OverviewResponse>("/api/overview"));
      setError(undefined);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load results.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    let active = true;
    void fetchJson<{ readonly items: readonly TaskReview[] }>(
      `/api/tasks${queryFor(filters)}`,
    )
      .then((response) => {
        if (!active) return;
        setReviews(response.items);
        setSelectedId((current) =>
          response.items.some((review) => review.task.id === current)
            ? current
            : response.items[0]?.task.id,
        );
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load tasks.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [filters]);

  const selected = useMemo(
    () => reviews.find((review) => review.task.id === selectedId) ?? reviews[0],
    [reviews, selectedId],
  );
  const overallScorecards = overview?.scorecards.filter(
    (scorecard) => scorecard.split.kind === "overall",
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <ShieldCheck size={21} strokeWidth={2.25} />
          </span>
          <div>
            <p className="eyebrow">Local synthetic fixture</p>
            <h1>Semantic Contract Eval Studio</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="environment-badge">Read only</span>
          <button
            aria-label="Refresh evaluation results"
            className="icon-button"
            disabled={refreshing}
            onClick={() => void loadOverview()}
            title="Refresh evaluation results"
            type="button"
          >
            <RefreshCw className={refreshing ? "spin" : undefined} size={18} />
          </button>
        </div>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="metric-strip" aria-label="Executive evidence summary">
        <div className="metric">
          <span>Trials</span>
          <strong>{overview?.summary.trialCount ?? "-"}</strong>
        </div>
        <div className="metric">
          <span>Governed accepted</span>
          <strong>
            {overview?.summary.governed
              ? rate(overview.summary.governed.acceptedRate)
              : "-"}
          </strong>
        </div>
        <div className="metric">
          <span>Permission safety</span>
          <strong>
            {overview?.summary.governed
              ? rate(overview.summary.governed.permissionSafetyRate)
              : "-"}
          </strong>
        </div>
        <div className="metric">
          <span>Review burden</span>
          <strong>
            {overview?.summary.governed
              ? `${overview.summary.governed.reviewerBurdenMinutes} min`
              : "-"}
          </strong>
        </div>
      </section>

      <section
        className="comparison-section"
        aria-labelledby="comparison-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Overall scorecard</p>
            <h2 id="comparison-title">Route comparison</h2>
          </div>
          <Database size={20} aria-hidden="true" />
        </div>
        <div className="table-wrap">
          <table className="scorecard-table">
            <thead>
              <tr>
                <th scope="col">Route</th>
                <th scope="col">Accepted</th>
                <th scope="col">Permission</th>
                <th scope="col">Semantic</th>
                <th scope="col">Ambiguity</th>
                <th scope="col">Freshness</th>
                <th scope="col">Evidence</th>
                <th scope="col">Cost</th>
                <th scope="col">Review</th>
              </tr>
            </thead>
            <tbody>
              {overallScorecards?.map((scorecard) => (
                <tr key={scorecard.route}>
                  <th scope="row">{scorecard.route}</th>
                  <td>{rate(scorecard.acceptedRate)}</td>
                  <td>{rate(scorecard.permissionSafetyRate)}</td>
                  <td>{rate(scorecard.semanticSuccessRate)}</td>
                  <td>{rate(scorecard.ambiguityEscalationRate)}</td>
                  <td>{rate(scorecard.freshnessEscalationRate)}</td>
                  <td>{rate(scorecard.evidenceCompletenessRate)}</td>
                  <td>{scorecard.averageToolCalls.toFixed(1)} tools</td>
                  <td>{scorecard.reviewerBurdenMinutes} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="review-toolbar" aria-label="Task review filters">
        <div className="filter-field">
          <label htmlFor="role-filter">Role</label>
          <select
            id="role-filter"
            onChange={(event) =>
              setFilters({ ...filters, role: event.target.value })
            }
            value={filters.role}
          >
            <option value="all">All roles</option>
            <option value="executive">Executive</option>
            <option value="finance">Finance</option>
            <option value="support">Support</option>
            <option value="sales">Sales</option>
            <option value="analyst">Analyst</option>
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="risk-filter">Risk</label>
          <select
            id="risk-filter"
            onChange={(event) =>
              setFilters({ ...filters, risk: event.target.value })
            }
            value={filters.risk}
          >
            <option value="all">All risk levels</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="capability-filter">Capability</label>
          <select
            id="capability-filter"
            onChange={(event) =>
              setFilters({ ...filters, capability: event.target.value })
            }
            value={filters.capability}
          >
            <option value="all">All capabilities</option>
            <option value="evidence">Evidence</option>
            <option value="freshness">Freshness</option>
            <option value="permission">Permission</option>
            <option value="resolution">Resolution</option>
            <option value="escalation">Escalation</option>
          </select>
        </div>
        <span className="review-count">{reviews.length} task reviews</span>
      </section>

      <section className="review-grid" aria-label="Task reviews">
        <div className="task-list-panel">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Evaluation queue</p>
              <h2>Task reviews</h2>
            </div>
            <CircleHelp size={19} aria-hidden="true" />
          </div>
          <div className="task-list" role="list">
            {reviews.map((review) => {
              const governed = trialFor(review, "governed");
              return (
                <button
                  aria-label={`Review ${review.task.id}`}
                  className={
                    review.task.id === selected?.task.id
                      ? "task-row task-row-selected"
                      : "task-row"
                  }
                  key={review.task.id}
                  onClick={() => setSelectedId(review.task.id)}
                  type="button"
                >
                  <span className="task-row-main">
                    <span className="task-meta">
                      {review.task.actor.role} · {review.task.risk} risk
                    </span>
                    <span className="task-request">{review.task.request}</span>
                  </span>
                  <StatusPill trial={governed} />
                </button>
              );
            })}
          </div>
        </div>

        <aside className="detail-panel" aria-live="polite">
          {selected ? (
            <TaskDetail review={selected} />
          ) : (
            <p className="empty-state">No task matches the selected filters.</p>
          )}
        </aside>
      </section>
    </main>
  );
}

function TaskDetail({ review }: { readonly review: TaskReview }) {
  const governed = trialFor(review, "governed");
  const evidence = governed.result.evidence;
  const details = routeOrder.map((route) => trialFor(review, route));

  return (
    <>
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">Review detail</p>
          <h2>{review.task.id}</h2>
        </div>
        <StatusPill trial={governed} />
      </div>
      <p className="detail-request">{review.task.request}</p>
      <dl className="detail-facts">
        <div>
          <dt>Expected</dt>
          <dd>{review.task.expected.outcome}</dd>
        </div>
        <div>
          <dt>Contract</dt>
          <dd>{review.task.expected.contractId ?? "clarify"}</dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{review.task.expected.reason}</dd>
        </div>
      </dl>

      <section className="detail-section" aria-labelledby="decisions-title">
        <h3 id="decisions-title">Route decisions</h3>
        <div className="decision-list">
          {details.map((trial) => (
            <div className="decision-row" key={trial.result.route}>
              <strong>{trial.result.route}</strong>
              <StatusPill trial={trial} />
              <span>
                {trial.result.source ??
                  trial.result.reasonCodes?.join(", ") ??
                  "no source"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="detail-section" aria-labelledby="evidence-title">
        <h3 id="evidence-title">Evidence packet</h3>
        {evidence ? (
          <dl className="evidence-grid">
            <div>
              <dt>Metric</dt>
              <dd>
                {evidence.metricId} v{evidence.version}
              </dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{evidence.owner}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{evidence.source}</dd>
            </div>
            <div>
              <dt>As of</dt>
              <dd>{new Date(evidence.asOf).toISOString()}</dd>
            </div>
            <div className="wide">
              <dt>Query hash</dt>
              <dd>{evidence.queryHash}</dd>
            </div>
          </dl>
        ) : (
          <p className="empty-state">No certified answer was returned.</p>
        )}
      </section>

      <section className="detail-section" aria-labelledby="grades-title">
        <h3 id="grades-title">Grader decisions</h3>
        <ul className="grade-list">
          {governed.grades.map((grade) => (
            <li key={grade.dimension}>
              {grade.passed ? (
                <CheckCircle2 size={16} aria-hidden="true" />
              ) : (
                <AlertTriangle size={16} aria-hidden="true" />
              )}
              <span>
                <strong>{grade.dimension}</strong>
                {grade.detail}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="detail-section" aria-labelledby="query-title">
        <h3 id="query-title">Query records</h3>
        <div className="query-records">
          {details.map((trial) => (
            <div className="query-record" key={trial.result.route}>
              <strong>{trial.result.route}</strong>
              <pre>{trial.result.query ?? "No query was authorized."}</pre>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
