export function CueIcon({ size = 34, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="15" fill="#242933" />
      <text
        x="32"
        y="47"
        textAnchor="middle"
        fontFamily="Outfit, system-ui, -apple-system, sans-serif"
        fontSize="46"
        fontWeight="800"
        fill="#E6EAF0"
      >
        c
      </text>
    </svg>
  );
}

export function CueWordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`select-none font-display font-bold lowercase tracking-tight text-2xl text-ink ${className}`}
    >
      cue
    </span>
  );
}
