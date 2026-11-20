export function LogoMark({ className = "size-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="18" fill="#0B6B45" />
      <ellipse cx="32" cy="42" rx="16" ry="6" fill="#C6EF5E" />
      <rect x="16" y="32" width="32" height="10" fill="#C6EF5E" />
      <ellipse cx="32" cy="32" rx="16" ry="6" fill="#E3F8A8" />
      <ellipse cx="32" cy="24" rx="16" ry="6" fill="#C6EF5E" />
      <rect x="16" y="18" width="32" height="6" fill="#C6EF5E" />
      <ellipse cx="32" cy="18" rx="16" ry="6" fill="#E3F8A8" />
      <path d="M26 18h12" stroke="#0B6B45" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className="size-9" />
      <span className="text-2xl font-bold tracking-tight">granaa</span>
    </span>
  );
}
