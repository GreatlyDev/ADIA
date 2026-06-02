import Link from "next/link";
import { DashboardPreview } from "../../components/dashboard-preview";
import { ModuleCard } from "../../components/module-card";
import { StatusCard } from "../../components/status-card";
import {
  dashboardMetrics,
  plannedModules,
  recommendations,
} from "../../lib/placeholder-data";

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-sm font-semibold uppercase text-[#111827]"
          >
            ADIA
          </Link>
          <p className="text-sm text-[var(--muted)]">Phase 0 static preview</p>
        </nav>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--mint)]">
              Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[#111827]">
              Deployment visibility workspace
            </h1>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">
            This route uses placeholder data only. Supabase, ingestion, parsing,
            anomaly detection, and AI insight generation are planned for later
            phases.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dashboardMetrics.map((metric) => (
            <StatusCard key={metric.title} {...metric} />
          ))}
        </div>

        <div className="mt-8">
          <DashboardPreview compact />
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div>
            <h2 className="text-lg font-semibold text-[#111827]">
              Planned analysis modules
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {plannedModules.map((module) => (
                <ModuleCard key={module.title} module={module} />
              ))}
            </div>
          </div>

          <aside className="rounded-lg border border-[var(--border)] bg-white p-5">
            <h2 className="text-lg font-semibold text-[#111827]">
              Recommendation preview
            </h2>
            <div className="mt-4 space-y-4">
              {recommendations.map((recommendation) => (
                <div
                  key={recommendation.id}
                  className="border-b border-[var(--border)] pb-4 last:border-b-0 last:pb-0"
                >
                  <p className="text-sm font-medium text-[#111827]">
                    {recommendation.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                    {recommendation.summary}
                  </p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
