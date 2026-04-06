/** Deterministic color palette for project-type tags */
const TAG_PALETTE = [
  { bg: "bg-accent/12", text: "text-accent" },
  { bg: "bg-warm/12", text: "text-warm" },
  { bg: "bg-[#a78bfa]/12", text: "text-[#a78bfa]" },
  { bg: "bg-[#f472b6]/12", text: "text-[#f472b6]" },
  { bg: "bg-[#60a5fa]/12", text: "text-[#60a5fa]" },
  { bg: "bg-[#34d399]/12", text: "text-[#34d399]" },
  { bg: "bg-[#fb923c]/12", text: "text-[#fb923c]" },
] as const;

function hashTagColor(tag: string): (typeof TAG_PALETTE)[number] {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = ((h << 5) - h + tag.charCodeAt(i)) | 0;
  return TAG_PALETTE[((h % TAG_PALETTE.length) + TAG_PALETTE.length) % TAG_PALETTE.length];
}

export function parseProjectTypes(metadata?: Record<string, string>): string[] {
  const raw = metadata?.["project-type"];
  if (!raw || typeof raw !== "string") return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function ProjectTypeTags({ metadata }: { metadata?: Record<string, string> }) {
  const tags = parseProjectTypes(metadata);
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map((tag) => {
        const color = hashTagColor(tag);
        return (
          <span
            key={tag}
            className={`inline-flex items-center px-1.5 py-0.5 text-[11px] leading-none rounded-full font-medium ${color.bg} ${color.text}`}
          >
            {tag}
          </span>
        );
      })}
    </div>
  );
}
