import { ScrollArea, MarkdownBody } from "@/client/design-system/index.js";
import { BASE } from "@/client/platform/index.js";
import type { ReadmeDoc, TemplateMeta } from "./template.types.js";
import { orderNumber } from "./orderNumber.js";
import { ProjectCreateForm } from "./ProjectCreateForm.js";

interface TemplateDetailPanelProps {
  selectedIndex: number;
  selectedTemplate: TemplateMeta | null;
  readme: ReadmeDoc | undefined;
  createFromTemplate: (projectName: string, templateSlug: string) => Promise<unknown>;
  placeholder: string;
}

export function TemplateDetailPanel({
  selectedIndex,
  selectedTemplate,
  readme,
  createFromTemplate,
  placeholder,
}: TemplateDetailPanelProps) {
  const displayDoc: ReadmeDoc | null = selectedTemplate
    ? readme ?? {
        frontmatter: {
          name: selectedTemplate.name,
          description: selectedTemplate.description,
        },
        body: "",
      }
    : null;

  return (
    <ScrollArea className="flex-1 min-w-0">
      {selectedTemplate && displayDoc ? (
        <div
          key={selectedTemplate.slug}
          className="max-w-3xl mx-auto px-10 md:px-14 py-10 animate-fade-slide"
        >
          <TemplateHero
            doc={displayDoc}
            coverUrl={
              selectedTemplate.hasCover
                ? `${BASE}/templates/${encodeURIComponent(selectedTemplate.slug)}/cover`
                : undefined
            }
            orderNumber={orderNumber(selectedIndex)}
            fallbackName={selectedTemplate.name}
          />
          <ProjectCreateForm
            templateSlug={selectedTemplate.slug}
            createFromTemplate={createFromTemplate}
          />
        </div>
      ) : (
        <div className="h-full flex items-center justify-center text-fg-4 text-sm">
          {placeholder}
        </div>
      )}
    </ScrollArea>
  );
}

function TemplateHero({
  doc,
  coverUrl,
  orderNumber,
  fallbackName,
}: {
  doc: ReadmeDoc;
  coverUrl?: string;
  orderNumber: string;
  fallbackName: string;
}) {
  const name = doc.frontmatter.name ?? fallbackName;
  const description = doc.frontmatter.description;
  const body = doc.body.trim();

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
          <div className="readme-body">
            <MarkdownBody source={body} />
          </div>
        </>
      )}
    </div>
  );
}

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

function Separator({ orderNumber }: { orderNumber: string }) {
  return (
    <div className="mt-10 mb-2 flex items-center gap-3 text-[10px] text-fg-4 font-mono uppercase tracking-[0.2em]">
      <span className="border-t border-edge/8 w-8" aria-hidden />
      <span>{orderNumber}</span>
      <span className="border-t border-edge/8 flex-1" aria-hidden />
    </div>
  );
}
