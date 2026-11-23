/** ApplyReach mark: a paper plane on its way up, with a dotted trail. Same drawing as app/icon.svg. */
export function LogoMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className}>
      <rect width="64" height="64" rx="15" fill="#1f5f4a" />
      <path d="M11 51 Q 17 41 27 39" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 6" />
      <path d="M16 33 L49 17 L38 48 L31.5 38.5 Z" fill="#ffffff" />
      <path d="M49 17 L31.5 38.5" stroke="#1f5f4a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M31.5 38.5 L30 47 L35 42" fill="#cfe7dc" />
    </svg>
  );
}

/** Mark + wordmark, used in the sidebar and on the sign-in pages. */
export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={26} />
      <span className="text-[15px] font-semibold tracking-tight text-text">
        Apply<span className="text-accent">Reach</span>
      </span>
    </span>
  );
}
