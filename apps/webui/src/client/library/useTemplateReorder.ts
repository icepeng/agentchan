import {
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useSWRConfig } from "swr";
import { qk, useI18n } from "@/client/platform/index.js";
import { saveTemplateOrder } from "./template.api.js";
import type { TemplateMeta } from "./template.types.js";

export function useTemplateReorder(templates: TemplateMeta[] | undefined) {
  const { t } = useI18n();
  const { mutate } = useSWRConfig();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (!templates) return;

    const from = templates.findIndex((tpl) => tpl.slug === active.id);
    const to = templates.findIndex((tpl) => tpl.slug === over.id);
    if (from < 0 || to < 0) return;

    const next = arrayMove(templates, from, to);
    try {
      await mutate<TemplateMeta[]>(
        qk.templates(),
        async () => {
          await saveTemplateOrder(next.map((tpl) => tpl.slug));
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
  };

  return { collisionDetection: closestCenter, handleDragEnd, sensors };
}
