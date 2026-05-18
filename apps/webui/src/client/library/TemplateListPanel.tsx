import { DndContext } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ScrollArea } from "@/client/design-system/index.js";
import type { TemplateMeta } from "./template.types.js";
import { SortableTemplateItem } from "./SortableTemplateItem.js";
import { useTemplateReorder } from "./useTemplateReorder.js";

interface TemplateListPanelProps {
  templates: TemplateMeta[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  titleLabel: string;
  dragHandleLabel: string;
  externalLabel: string;
}

export function TemplateListPanel({
  templates,
  selectedSlug,
  onSelect,
  titleLabel,
  dragHandleLabel,
  externalLabel,
}: TemplateListPanelProps) {
  const { collisionDetection, handleDragEnd, sensors } = useTemplateReorder(templates);
  const templateIds = templates.map((tpl) => tpl.slug);

  return (
    <ScrollArea className="w-72 shrink-0 border-r border-edge/6 bg-base/20">
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={templateIds} strategy={verticalListSortingStrategy}>
          <ul className="py-4" role="listbox" aria-label={titleLabel}>
            {templates.map((tpl, index) => (
              <SortableTemplateItem
                key={tpl.slug}
                tpl={tpl}
                index={index}
                isSelected={tpl.slug === selectedSlug}
                onSelect={onSelect}
                dragHandleLabel={dragHandleLabel}
                externalLabel={externalLabel}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </ScrollArea>
  );
}
