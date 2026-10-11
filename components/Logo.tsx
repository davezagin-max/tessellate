/** Three rhombs of a Penrose vertex: the mark for the wordmark. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M12 12 3.4 7 12 2z" fill="var(--fg)" />
      <path d="M12 12 12 2l8.6 5z" fill="var(--accent)" />
      <path d="M12 12 20.6 7v10z" fill="var(--fg)" opacity="0.28" />
      <path d="M12 12 20.6 17 12 22z" fill="var(--fg)" />
      <path d="M12 12 12 22l-8.6-5z" fill="var(--fg)" opacity="0.28" />
      <path d="M12 12 3.4 17V7z" fill="var(--fg)" opacity="0.6" />
    </svg>
  );
}
