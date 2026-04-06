import { useState, useEffect } from "react";
import { useI18n } from "@/client/i18n/index.js";
import { IconButton, Badge, Button } from "@/client/shared/ui/index.js";
import { fetchLibrarySkills, copyLibrarySkillToProject } from "@/client/entities/skill/index.js";
import type { SkillMetadata } from "@/client/entities/skill/index.js";
import { ProjectTypeTags } from "./ProjectTypeTags.js";

interface LibraryBrowserProps {
  projectSlug: string;
  existingSkills: string[];
  onCopied: () => void;
  onClose: () => void;
}

export function LibraryBrowser({ projectSlug, existingSkills, onCopied, onClose }: LibraryBrowserProps) {
  const { t } = useI18n();
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [copying, setCopying] = useState<string | null>(null);

  useEffect(() => {
    void fetchLibrarySkills().then(setSkills);
  }, []);

  const handleCopy = async (name: string) => {
    setCopying(name);
    try {
      await copyLibrarySkillToProject(projectSlug, name);
      onCopied();
    } finally {
      setCopying(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge/6">
        <h3 className="text-sm font-medium text-fg-2">{t("libraryBrowser.title")}</h3>
        <IconButton size="sm" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {skills.length === 0 ? (
          <div className="text-center text-fg-3 text-sm py-8">
            {t("libraryBrowser.noLibrarySkills")}
          </div>
        ) : (
          skills.map((s) => {
            const isAdded = existingSkills.includes(s.name);
            return (
              <div
                key={s.name}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-elevated/50 transition-all"
              >
                <div className="flex-1 min-w-0 mr-3">
                  <div className="text-sm font-medium text-fg-2 truncate">{s.name}</div>
                  {s.description && (
                    <div className="text-xs text-fg-3 mt-0.5 truncate">{s.description}</div>
                  )}
                  <ProjectTypeTags metadata={s.metadata} />
                </div>
                {isAdded ? (
                  <Badge variant="accent">{t("libraryBrowser.added")}</Badge>
                ) : (
                  <Button
                    variant="accent"
                    onClick={() => handleCopy(s.name)}
                    disabled={copying !== null}
                    className="flex-shrink-0"
                  >
                    {copying === s.name ? t("libraryBrowser.copying") : t("libraryBrowser.add")}
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
