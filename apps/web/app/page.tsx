import Link from "next/link";
import { DashboardPreview } from "../components/dashboard-preview";
import { ModuleCard } from "../components/module-card";
import { plannedModules } from "../lib/placeholder-data";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-white/85">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-sm font-semibold uppercase text-[#111827]"
          >
            ADIA
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-[#111827] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2f3746]"
          >
            Open dashboard
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-6 pb-12 pt-10 lg:pt-14">
        <div className="max-w-4xl">
          <p className="text-sm font-semibold uppercase text-[var(--mint)]">
            Automated Deployment Insight Assistant
          </p>
          <h1 className="mt-4 text-5xl font-semibold leading-tight text-[#111827] md:text-7xl">
            ADIA
          </h1>
          <p className="mt-5 max-w-3xl text-xl leading-8 text-[var(--muted)]">
            ADIA helps DevOps engineers understand deployment risk, Terraform
            changes, and CI/CD anomalies before they become incidents.
          </p>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#394150]">
            Phase 0 is a safe foundation: static dashboard placeholders, shared
            TypeScript contracts, analyzer stubs, fixture directories, and
            documentation for future Supabase, Terraform, Checkov, and LLM
            phases.
          </p>
        </div>

        <DashboardPreview />
      </section>

      <section className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-[var(--blue)]">
                Planned MVP modules
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[#111827]">
                Visibility first, execution later
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">
              These modules are static placeholders in Phase 0. Real data,
              Supabase Realtime, parsing, anomaly detection, and LLM summaries
              will be added in later phases.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {plannedModules.map((module) => (
              <ModuleCard key={module.title} module={module} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
