interface BadgeProps {
  variant?: "accent" | "muted" | "param";
  onDismiss?: () => void;
  className?: string;
  children: React.ReactNode;
}

const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  accent: "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full font-medium bg-accent/10 text-accent",
  muted: "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full font-medium bg-fg-3/10 text-fg-3",
  param: "text-[9px] px-1.5 py-0.5 rounded-full bg-accent/8 text-accent/70 font-mono leading-none",
};

const dismissibleStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  accent: "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-accent/15 text-accent hover:bg-accent/25 transition-colors cursor-pointer",
  muted: "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full font-medium bg-fg-3/10 text-fg-3 hover:bg-fg-3/20 transition-colors cursor-pointer",
  param: "text-[9px] px-1.5 py-0.5 rounded-full bg-accent/8 text-accent/70 font-mono leading-none hover:bg-accent/15 transition-colors cursor-pointer",
};

export function Badge({ variant = "accent", onDismiss, className, children }: BadgeProps) {
  const base = onDismiss ? dismissibleStyles[variant] : variantStyles[variant];
  const cls = className ? `${base} ${className}` : base;

  if (onDismiss) {
    return (
      <button type="button" onClick={onDismiss} className={cls}>
        {children}
        <span className="opacity-60 text-[10px]">x</span>
      </button>
    );
  }

  return <span className={cls}>{children}</span>;
}
