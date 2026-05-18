import { useState } from "react";
import type { TemplateMeta } from "./template.types.js";

export function useTemplateSelection(templates: TemplateMeta[] | undefined) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const effectiveSelectedSlug = selectedSlug ?? templates?.[0]?.slug ?? null;
  const selectedIndex = templates && effectiveSelectedSlug
    ? templates.findIndex((tpl) => tpl.slug === effectiveSelectedSlug)
    : -1;
  const selectedTemplate = selectedIndex >= 0 ? templates?.[selectedIndex] ?? null : null;

  const handleKeyNav = (e: React.KeyboardEvent) => {
    if (!templates || templates.length === 0) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

    e.preventDefault();
    const cur = selectedIndex < 0 ? 0 : selectedIndex;
    const next =
      e.key === "ArrowDown"
        ? Math.min(cur + 1, templates.length - 1)
        : Math.max(cur - 1, 0);
    const nextTemplate = templates[next];
    if (nextTemplate) setSelectedSlug(nextTemplate.slug);
  };

  return {
    effectiveSelectedSlug,
    handleKeyNav,
    selectedIndex,
    selectedTemplate,
    setSelectedSlug,
  };
}
