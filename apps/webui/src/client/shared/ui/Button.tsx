const variantStyles = {
  accent:
    "bg-accent/10 text-accent border border-accent/20 hover:bg-accent/15 disabled:opacity-40",
  danger:
    "bg-danger/10 text-danger border border-danger/20 hover:bg-danger/15 disabled:opacity-40",
  ghost: "text-fg-3 hover:text-fg-2 disabled:opacity-40",
} as const;

const sizeStyles = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2 text-xs",
} as const;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: "accent" | "danger" | "ghost";
  size?: "sm" | "md";
}

export function Button({
  variant,
  size = "sm",
  className,
  ...props
}: ButtonProps) {
  const classes = [
    "rounded-lg font-medium transition-all",
    variantStyles[variant],
    sizeStyles[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button className={classes} {...props} />;
}
