interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md";
  mono?: boolean;
}

export function TextInput({ size = "sm", mono, className, ...props }: TextInputProps) {
  const sizeClasses = size === "md"
    ? "px-4 py-2.5 rounded-xl"
    : "px-3 py-1.5 rounded-lg";

  return (
    <input
      {...props}
      className={`w-full bg-elevated border border-edge/8 text-fg text-sm outline-none focus:border-accent/30 placeholder:text-fg-4 transition-colors ${sizeClasses}${mono ? " font-mono" : ""}${className ? ` ${className}` : ""}`}
    />
  );
}
