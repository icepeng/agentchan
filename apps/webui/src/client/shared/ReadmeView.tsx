import { parseBlockMarkdown } from "./blockMarkdown.js";

export interface ReadmeDoc {
  frontmatter: { name?: string; description?: string };
  body: string;
}

interface ReadmeViewProps {
  doc: ReadmeDoc;
  variant?: "hero" | "compact";
  coverUrl?: string;
  orderNumber?: string;
  fallbackName?: string;
}

/**
 * Render a parsed README document in two editorial styles:
 *
 * - `hero` — oversized display title split across two lines, accent bar,
 *   description, optional cover, ornament separator, then body. Used on the
 *   TemplatesPage "The Library" right pane.
 * - `compact` — single-line title, description, body. Used in the in-project
 *   README modal where space is tighter and cover art is skipped.
 */
export function ReadmeView({
  doc,
  variant = "hero",
  coverUrl,
  orderNumber,
  fallbackName,
}: ReadmeViewProps) {
  const name = doc.frontmatter.name ?? fallbackName ?? "";
  const description = doc.frontmatter.description;
  const body = doc.body.trim();

  if (variant === "compact") {
    return (
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg text-balance">
          {name}
        </h1>
        {description && (
          <p className="mt-2 text-sm text-fg-2 leading-relaxed text-pretty">{description}</p>
        )}
        <div className="mt-5">
          {body ? parseBlockMarkdown(body) : null}
        </div>
      </div>
    );
  }

  // hero variant
  return (
    <div>
      <HeroTitle name={name} />
      <div className="w-16 h-1 bg-accent my-5" aria-hidden />
      {description && (
        <p className="text-fg-2 text-base leading-relaxed text-pretty">
          {description}
        </p>
      )}
      {coverUrl && (
        <div className="mt-8 w-full aspect-[21/9] rounded-2xl overflow-hidden border border-edge/8 bg-gradient-to-br from-accent/8 to-transparent">
          <img
            src={coverUrl}
            alt={name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      {body && (
        <>
          <Separator orderNumber={orderNumber} />
          <div className="readme-body">{parseBlockMarkdown(body)}</div>
        </>
      )}
    </div>
  );
}

/** Split the title on the first whitespace so the hero stacks on two lines. */
function HeroTitle({ name }: { name: string }) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const spaceIdx = trimmed.indexOf(" ");
  const firstLine = spaceIdx > 0 ? trimmed.slice(0, spaceIdx) : trimmed;
  const secondLine = spaceIdx > 0 ? trimmed.slice(spaceIdx + 1) : null;
  return (
    <h1 className="font-display font-bold tracking-tight leading-[0.95] text-5xl md:text-6xl text-fg uppercase text-balance">
      <span className="block">{firstLine}</span>
      {secondLine && <span className="block">{secondLine}</span>}
    </h1>
  );
}

function Separator({ orderNumber }: { orderNumber?: string }) {
  return (
    <div className="mt-10 mb-2 flex items-center gap-3 text-[10px] text-fg-4 font-mono uppercase tracking-[0.2em]">
      <span className="border-t border-edge/8 w-8" aria-hidden />
      <span>{orderNumber ?? "—"}</span>
      <span className="border-t border-edge/8 flex-1" aria-hidden />
    </div>
  );
}
