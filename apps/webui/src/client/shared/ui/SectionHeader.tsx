interface SectionHeaderProps {
  title: string;
  description?: string;
}

export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <div>
      <h3 className="font-display text-sm font-semibold text-fg-2 tracking-wide uppercase">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-fg-3 mt-1">{description}</p>
      )}
      <div className="mt-2 h-px bg-gradient-to-r from-accent/20 via-accent/5 to-transparent" />
    </div>
  );
}
