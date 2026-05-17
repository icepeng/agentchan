import { Image } from "lucide-react";

interface CoverImageProps {
  type: "projects" | "templates";
  slug: string;
  hasCover?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function CoverImage({ type, slug, hasCover, size = "sm", className = "" }: CoverImageProps) {
  const base = size === "sm"
    ? "w-7 h-7 rounded-lg shrink-0"
    : "w-full h-32 rounded-t-xl";

  if (!hasCover) {
    return (
      <div className={`${base} bg-elevated/80 flex items-center justify-center ${className}`}>
        <Image size={size === "sm" ? 12 : 24} className="text-fg-4/40" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={`/api/${type}/${encodeURIComponent(slug)}/cover`}
      alt=""
      className={`${base} object-cover ${className}`}
      loading="lazy"
    />
  );
}
