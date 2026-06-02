type StatusTone = "neutral" | "success" | "warning" | "danger" | "insight";

export interface StatusCardProps {
  title: string;
  value: string;
  detail: string;
  tone?: StatusTone;
}

const toneStyles: Record<StatusTone, string> = {
  neutral: "border-[var(--border)]",
  success: "border-[#8dd6c5]",
  warning: "border-[#f0c36b]",
  danger: "border-[#f0a0a0]",
  insight: "border-[#9bb8ff]",
};

export function StatusCard({
  title,
  value,
  detail,
  tone = "neutral",
}: StatusCardProps) {
  return (
    <section
      className={`rounded-lg border bg-white p-5 shadow-sm ${toneStyles[tone]}`}
    >
      <p className="text-sm font-medium text-[var(--muted)]">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-[#111827]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail}</p>
    </section>
  );
}
