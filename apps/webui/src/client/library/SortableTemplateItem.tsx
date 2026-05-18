import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TemplateMeta } from "./template.types.js";
import { orderNumber } from "./orderNumber.js";

interface SortableTemplateItemProps {
  tpl: TemplateMeta;
  index: number;
  isSelected: boolean;
  onSelect: (slug: string) => void;
  dragHandleLabel: string;
  externalLabel: string;
}

export function SortableTemplateItem({
  tpl,
  index,
  isSelected,
  onSelect,
  dragHandleLabel,
  externalLabel,
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

  const showExternal = !tpl.trusted;

  return (
    <li
      ref={setNodeRef}
      style={style}
      role="option"
      aria-selected={isSelected}
      data-testid="template-index-item"
      data-slug={tpl.slug}
      data-trusted={tpl.trusted}
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
      {showExternal && (
        <span
          data-testid="template-external-label"
          className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-fg-4 px-1.5 py-0.5 rounded border border-edge/20"
        >
          {externalLabel}
        </span>
      )}
    </li>
  );
}
