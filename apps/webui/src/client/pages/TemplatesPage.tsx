import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ArrowLeft, BookOpen, GripVertical } from "lucide-react";
import { useSWRConfig } from "swr";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useI18n } from "@/client/i18n/index.js";
import { useUIDispatch } from "@/client/entities/ui/index.js";
import {
  saveTemplateOrder,
  useTemplates,
  useTemplateReadme,
  type TemplateMeta,
} from "@/client/entities/template/index.js";
import { qk } from "@/client/shared/queryKeys.js";
import { useProject } from "@/client/features/project/index.js";
import { IconButton, ScrollArea } from "@/client/shared/ui/index.js";
import { ReadmeView, type ReadmeDoc } from "@/client/shared/ReadmeView.js";
import { BASE } from "@/client/shared/api.js";

/** Two-digit order index ("01", "02", …) used in the left rail and separator. */
function orderNumber(i: number): string {
  return String(i + 1).padStart(2, "0");
}

interface SortableTemplateItemProps {
  tpl: TemplateMeta;
  index: number;
  isSelected: boolean;
  onSelect: (slug: string) => void;
  dragHandleLabel: string;
}

function SortableTemplateItem({
  tpl,
  index,
  isSelected,
  onSelect,
  dragHandleLabel,
}: SortableTemplateItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tpl.slug,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    animationDelay: `${index * 60}ms`,
    animationFillMode: "both",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      role="option"
      aria-selected={isSelected}
      data-testid="template-index-item"
      data-slug={tpl.slug}
      onClick={() => onSelect(tpl.slug)}
      className={`group relative flex items-baseline gap-3 pl-6 pr-5 py-3 transition-colors animate-fade-slide ${
        isSelected ? "text-accent" : "text-fg-2 hover:text-fg hover:bg-elevated/30"
      } ${isDragging ? "opacity-70 cursor-grabbing bg-elevated/40" : "cursor-pointer"}`}
    >
      {isSelected && (
        <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-accent" aria-hidden />
      )}
      <button
        type="button"
        aria-label={dragHandleLabel}
        data-testid="template-drag-handle"
        data-slug={tpl.slug}
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-4 h-4 text-fg-4 opacity-0 group-hover:opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60 rounded cursor-grab active:cursor-grabbing transition-opacity"
      >
        <GripVertical size={12} strokeWidth={2} />
      </button>
      <span
        className={`font-mono text-[10px] tabular-nums tracking-wider shrink-0 ${
          isSelected ? "text-accent/70" : "text-fg-4"
        }`}
      >
        {orderNumber(index)}
      </span>
      <span className="font-display text-sm truncate">{tpl.name}</span>
    </li>
  );
}

export function TemplatesPage() {
  const { t } = useI18n();
  const uiDispatch = useUIDispatch();
  const { createProject } = useProject();
  const { mutate } = useSWRConfig();

  const { data: templates, isLoading } = useTemplates();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [creating, setCreating] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-select first template once the list arrives.
  useEffect(() => {
    if (selectedSlug || !templates) return;
    const first = templates[0];
    if (!first) return;
    setSelectedSlug(first.slug);
  }, [templates, selectedSlug]);

  const { data: readme } = useTemplateReadme(selectedSlug);

  const selectedIndex = templates && selectedSlug
    ? templates.findIndex((t) => t.slug === selectedSlug)
    : -1;
  const selectedTemplate = selectedIndex >= 0 ? templates![selectedIndex] : null;

  // Show cached README when available, otherwise synthesize a doc from the
  // template meta so the hero/cover still render while the body fetches.
  const displayDoc: ReadmeDoc | null = useMemo(() => {
    if (!selectedTemplate) return null;
    if (readme) return readme;
    return {
      frontmatter: {
        name: selectedTemplate.name,
        description: selectedTemplate.description,
      },
      body: "",
    };
  }, [selectedTemplate, readme]);

  const handleCreate = useCallback(async () => {
    if (!selectedSlug || creating) return;
    const name = nameInput.trim();
    if (!name) {
      nameInputRef.current?.focus();
      return;
    }
    setCreating(true);
    try {
      await createProject(name, selectedSlug);
      uiDispatch({ type: "NAVIGATE", route: { page: "main" } });
    } finally {
      setCreating(false);
    }
  }, [selectedSlug, creating, nameInput, createProject, uiDispatch]);

  const handleKeyNav = useCallback(
    (e: React.KeyboardEvent) => {
      if (!templates || templates.length === 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const cur = selectedIndex < 0 ? 0 : selectedIndex;
        const next =
          e.key === "ArrowDown"
            ? Math.min(cur + 1, templates.length - 1)
            : Math.max(cur - 1, 0);
        const nextTemplate = templates[next];
        if (nextTemplate) setSelectedSlug(nextTemplate.slug);
      }
    },
    [templates, selectedIndex],
  );

  const sensors = useSensors(
    // Require a small drag distance so that clicks on the handle (to focus it)
    // don't immediately start a drag, and the underlying <li> stays clickable.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      if (!templates) return;
      const from = templates.findIndex((x) => x.slug === active.id);
      const to = templates.findIndex((x) => x.slug === over.id);
      if (from < 0 || to < 0) return;
      const next = arrayMove(templates, from, to);
      try {
        await mutate<TemplateMeta[]>(
          qk.templates(),
          async () => {
            await saveTemplateOrder(next.map((x) => x.slug));
            return next;
          },
          {
            optimisticData: next,
            rollbackOnError: true,
            revalidate: false,
            populateCache: true,
          },
        );
      } catch (err) {
        console.error("[templates] reorder failed", err);
        alert(t("templates.reorderFailed"));
      }
    },
    [templates, mutate, t],
  );

  const templateIds = useMemo(() => templates?.map((tpl) => tpl.slug) ?? [], [templates]);

  return (
    <div
      className="relative flex flex-col h-full bg-void"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at top right, color-mix(in srgb, var(--color-accent) 7%, transparent), transparent 55%)",
      }}
    >
      <div className="flex items-center gap-4 px-6 py-4 border-b border-edge/6 bg-base/40 backdrop-blur-sm shrink-0">
        <IconButton
          onClick={() => uiDispatch({ type: "NAVIGATE", route: { page: "main" } })}
          title={t("settings.back")}
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </IconButton>
        <h2 className="font-display text-lg font-bold tracking-tight">
          {t("templates.title")}
        </h2>
        <span
          className="ml-auto font-mono text-[10px] uppercase tracking-[0.28em] text-fg-4"
          aria-hidden
        >
          {t("templates.label")}
        </span>
      </div>

      {!templates || isLoading ? (
        <div className="flex-1 flex items-center justify-center text-fg-4 text-sm">
          {t("templates.loading")}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-fg-4 text-sm flex-col gap-3">
          <BookOpen size={32} className="opacity-40" />
          {t("templates.empty")}
        </div>
      ) : (
        <div className="flex-1 flex min-h-0" onKeyDown={handleKeyNav} tabIndex={-1}>
          <ScrollArea className="w-72 shrink-0 border-r border-edge/6 bg-base/20">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={templateIds} strategy={verticalListSortingStrategy}>
                <ul className="py-4" role="listbox" aria-label={t("templates.title")}>
                  {templates.map((tpl, i) => (
                    <SortableTemplateItem
                      key={tpl.slug}
                      tpl={tpl}
                      index={i}
                      isSelected={tpl.slug === selectedSlug}
                      onSelect={setSelectedSlug}
                      dragHandleLabel={t("templates.dragHandle")}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </ScrollArea>

          <ScrollArea className="flex-1 min-w-0">
            {selectedTemplate && displayDoc ? (
              <div
                key={selectedTemplate.slug}
                className="max-w-3xl mx-auto px-10 md:px-14 py-10 animate-fade-slide"
              >
                <ReadmeView
                  doc={displayDoc}
                  variant="hero"
                  coverUrl={
                    selectedTemplate.hasCover
                      ? `${BASE}/templates/${encodeURIComponent(selectedTemplate.slug)}/cover`
                      : undefined
                  }
                  orderNumber={orderNumber(selectedIndex)}
                  fallbackName={selectedTemplate.name}
                />

                <div className="mt-14 pt-8 border-t border-edge/8">
                  <label
                    className="block text-[10px] uppercase tracking-[0.24em] text-fg-4 font-mono mb-3"
                    htmlFor="new-project-name"
                  >
                    {t("templates.nameLabel")}
                  </label>
                  <div className="flex items-end gap-4">
                    <input
                      id="new-project-name"
                      ref={nameInputRef}
                      data-testid="templates-name-input"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleCreate();
                        }
                      }}
                      placeholder={t("templates.namePlaceholder")}
                      className="flex-1 bg-transparent border-b border-edge/12 focus:border-accent outline-none font-display text-xl text-fg placeholder:text-fg-4 py-2 px-0 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCreate()}
                      data-testid="templates-begin-button"
                      disabled={creating || !nameInput.trim()}
                      className="group shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-void text-sm font-semibold uppercase tracking-[0.18em] hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      {creating ? t("templates.loading") : t("templates.begin")}
                      <span
                        aria-hidden
                        className="transition-transform group-hover:translate-x-0.5"
                      >
                        →
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-fg-4 text-sm">
                {t("templates.heroPlaceholder")}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
