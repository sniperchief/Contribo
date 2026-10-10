/**
 * Minimal line-art illustrations for the landing page's problem cards:
 * hairline outlines, small dark dots, and dark pill labels on white.
 */

const LINE = "var(--sky)";
const MUTED = "color-mix(in oklab, var(--deep-teal) 60%, white)";

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-control bg-ink px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap text-paper ${className}`}>
      {children}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-medium tracking-[0.1em] uppercase" style={{ color: MUTED }}>{children}</p>;
}

/** 01 · Merged work that leaves no record. */
export function UnrecordedIllustration() {
  return (
    <div aria-hidden className="relative h-44 w-56">
      <div className="absolute inset-x-3 top-0 h-6 rounded-t-badge border border-b-0" style={{ borderColor: LINE }} />
      <div className="absolute inset-x-0 top-2 bottom-0 flex flex-col gap-3 rounded-badge border bg-paper px-4 pt-4" style={{ borderColor: LINE }}>
        <Label>Commit log</Label>
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-2.5">
            <span className="size-2 shrink-0 rounded-full border" style={{ borderColor: MUTED }} />
            <span className="h-1.5 rounded-full" style={{ background: LINE, width: `${[78, 60, 70][row]}%` }} />
          </div>
        ))}
        <div className="mt-auto border-t py-2" style={{ borderColor: LINE }}>
          <Label>Credit · none</Label>
        </div>
      </div>
      <Pill className="absolute top-[52px] -right-8">PR #42 merged</Pill>
    </div>
  );
}

/** 02 · Reward terms that change after the work is done. */
export function ChangingTermsIllustration() {
  return (
    <div aria-hidden className="relative h-44 w-60">
      <div className="absolute top-0 left-3 h-36 w-52 rounded-badge border" style={{ borderColor: LINE }} />
      <div className="absolute top-2.5 left-1.5 h-36 w-52 rounded-badge border bg-paper" style={{ borderColor: LINE }} />
      <div className="absolute top-5 left-0 flex h-36 w-52 flex-col gap-2.5 rounded-badge border-2 bg-paper p-4" style={{ borderColor: LINE }}>
        <span className="h-1.5 w-7 rounded-full bg-terracotta" />
        <Label>Reward terms · v1</Label>
        <p className="text-lg font-bold line-through decoration-2" style={{ color: MUTED }}>
          Fixed reward
        </p>
        <span className="mt-auto h-1.5 w-full rounded-full" style={{ background: LINE }} />
      </div>
      <Pill className="absolute right-0 bottom-0">Changed after merge</Pill>
    </div>
  );
}

/** 03 · Opportunities scattered across chats, forums and repos. */
export function ScatteredIllustration() {
  const targets = [
    { label: "Chats", y: 18 },
    { label: "Forums", y: 80 },
    { label: "Repos", y: 142 },
  ];
  return (
    <div aria-hidden className="relative h-40 w-64">
      <svg viewBox="0 0 256 160" className="absolute inset-0 size-full" fill="none">
        {targets.map((t) => (
          <path key={t.label} d={`M 72 80 C 120 80, 120 ${t.y}, 176 ${t.y}`} stroke={LINE} strokeWidth="1.5" />
        ))}
        <circle cx="72" cy="80" r="3.5" fill="var(--ink)" />
        <circle cx="124" cy="52" r="3.5" fill="var(--ink)" />
        <circle cx="124" cy="80" r="3.5" fill="var(--ink)" />
        <circle cx="160" cy="139" r="3.5" fill="var(--ink)" />
      </svg>
      <Pill className="absolute top-1/2 left-0 -translate-y-1/2">You</Pill>
      {targets.map((t) => (
        <span
          key={t.label}
          className="absolute right-0 inline-flex w-[76px] -translate-y-1/2 justify-center rounded-control border bg-paper py-1.5 text-[11px] font-medium"
          style={{ top: `${(t.y / 160) * 100}%`, borderColor: LINE, color: "var(--deep-teal)" }}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}
