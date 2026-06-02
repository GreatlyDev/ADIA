export interface PlannedModule {
  title: string;
  label: string;
  description: string;
}

export function ModuleCard({ module }: { module: PlannedModule }) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase text-[var(--blue)]">
        {module.label}
      </p>
      <h3 className="mt-3 text-base font-semibold text-[#111827]">
        {module.title}
      </h3>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        {module.description}
      </p>
    </article>
  );
}
