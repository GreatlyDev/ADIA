import {
  anomalyPreview,
  deploymentRuns,
  insightPreview,
  terraformSummary,
} from "../lib/placeholder-data";

const statusStyles = {
  queued: "bg-[#eef2f6] text-[#394150]",
  running: "bg-[#dbeafe] text-[#1d4ed8]",
  succeeded: "bg-[#d1fae5] text-[#0f766e]",
  failed: "bg-[#fee2e2] text-[#b91c1c]",
  canceled: "bg-[#f3f4f6] text-[#4b5563]",
} as const;

export function DashboardPreview({ compact = false }: { compact?: boolean }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm">
      <div className="border-b border-[var(--border)] bg-[#111827] px-5 py-4 text-white">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-[#99f6e4]">
              Static deployment preview
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              Demo project health snapshot
            </h2>
          </div>
          <p className="text-sm text-[#cbd5e1]">
            Supabase Realtime will replace this static view later.
          </p>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="border-b border-[var(--border)] p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-base font-semibold text-[#111827]">
              Deployment runs
            </h3>
            <span className="rounded-full bg-[#eef2f6] px-3 py-1 text-xs font-medium text-[#394150]">
              Planned ingestion
            </span>
          </div>

          <div className="mt-4 divide-y divide-[var(--border)]">
            {deploymentRuns.map((run) => (
              <div
                key={run.id}
                className="grid gap-3 py-4 md:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-medium text-[#111827]">{run.name}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {run.environment} - {run.commitSha}
                  </p>
                </div>
                <div className="flex items-center gap-3 md:justify-end">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[run.status]}`}
                  >
                    {run.status}
                  </span>
                  <span className="text-sm text-[var(--muted)]">
                    {run.durationSeconds}s
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5">
          <h3 className="text-base font-semibold text-[#111827]">
            Terraform risk preview
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <PreviewMetric label="Creates" value={terraformSummary.creates} />
            <PreviewMetric label="Updates" value={terraformSummary.updates} />
            <PreviewMetric label="Deletes" value={terraformSummary.deletes} />
            <PreviewMetric
              label="Replacements"
              value={terraformSummary.replacements}
            />
          </div>

          {!compact ? (
            <div className="mt-5 rounded-lg bg-[#f8fafc] p-4">
              <p className="text-sm font-semibold text-[#111827]">
                Anomaly placeholder
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {anomalyPreview.summary}
              </p>
            </div>
          ) : null}

          <div className="mt-5 border-t border-[var(--border)] pt-5">
            <p className="text-sm font-semibold text-[#111827]">
              AI insight placeholder
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {insightPreview.summary}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-l-4 border-[#0f766e] bg-[#f8fafc] px-4 py-3">
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[#111827]">{value}</p>
    </div>
  );
}
