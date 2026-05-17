interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md";
  active?: boolean;
}

export function IconButton({ size = "md", active, className, children, ...props }: IconButtonProps) {
  return (
    <button
      className={`rounded-lg transition-all ${
        size === "sm" ? "p-1" : "p-1.5"
      } ${
        active
          ? "text-accent bg-elevated"
          : "text-fg-3 hover:text-fg hover:bg-elevated/50"
      } ${className ?? ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
