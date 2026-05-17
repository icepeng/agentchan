interface IndicatorProps {
  color?: "accent" | "muted" | "fg";
  pulse?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const sizeClass = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
} as const;

const colorClass = {
  accent: "bg-accent",
  muted: "bg-fg-4/30",
  fg: "bg-fg-3",
} as const;

export function Indicator({ color = "accent", pulse, size = "sm", className }: IndicatorProps) {
  const classes = `rounded-full flex-shrink-0 ${sizeClass[size]} ${colorClass[color]}${pulse ? " animate-glow" : ""}${className ? ` ${className}` : ""}`;
  return <span className={classes} />;
}
