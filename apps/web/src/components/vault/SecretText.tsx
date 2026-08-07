"use client";

interface SecretTextProps {
  value: string;
  revealed?: boolean;
  className?: string;
}

export function SecretText({ value, revealed = false, className }: SecretTextProps) {
  return (
    <span className={`font-mono tracking-tight inline-flex items-center ${className ?? ""}`}>
      <span className="relative inline-grid" style={{ gridTemplateAreas: "stack" }}>
        <span
          className="transition-all duration-300"
          style={{
            gridArea: "stack",
            filter: revealed ? "blur(0px)" : "blur(5px)",
            opacity: revealed ? 1 : 0,
            transform: revealed ? "translateY(0)" : "translateY(1px)",
          }}
        >
          {value}
        </span>
        <span
          className="transition-all duration-300 flex items-center gap-[3px]"
          style={{
            gridArea: "stack",
            opacity: revealed ? 0 : 1,
            transform: revealed ? "scale(0.85)" : "scale(1)",
          }}
        >
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
          ))}
        </span>
      </span>
    </span>
  );
}
