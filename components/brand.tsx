/** App logo: a white document on a tile, sized by the caller. "glass" sits on navy, "solid" on white. */
export function BrandMark({ className = "", tone = "glass" }: { className?: string; tone?: "glass" | "solid" }) {
  const tile = tone === "solid" ? "bg-accent" : "bg-white/15 ring-1 ring-white/20";
  return (
    <span className={`flex items-center justify-center rounded-xl ${tile} ${className}`}>
      <svg viewBox="0 0 24 24" className="size-[55%]" aria-hidden="true">
        <path d="M6 3h8l4 4v14H6z" fill="#fff" />
        <path d="M14 3v4h4" fill="#c9d6e8" />
        <path d="M9 12h6M9 16h6" stroke="#1b365d" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}
