import { useState } from "react";
import { Rocket, Wrench } from "lucide-react";
import { useI18n } from "@/client/i18n/index.js";
import { SaveAsTemplateModal } from "./SaveAsTemplateModal.js";

interface WorkbenchHeaderProps {
  slug: string;
}

/**
 * Workbench-intent 프로젝트에서만 AgentPanel 상단에 노출되는 헤더.
 * Publish as Template 진입점을 눈에 띄는 위치로 끌어올려 템플릿 저작 흐름을
 * 사이드바 우클릭에 의존하지 않게 한다.
 */
export function WorkbenchHeader({ slug }: WorkbenchHeaderProps) {
  const { t } = useI18n();
  const [publishOpen, setPublishOpen] = useState(false);

  return (
    <>
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-edge/6 bg-accent/[0.03]"
        data-testid="workbench-header"
      >
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-[10px] font-semibold tracking-wider uppercase text-accent">
          <Wrench size={10} strokeWidth={2.5} />
          {t("workbench.badge")}
        </span>
        <span className="flex-1 text-[11px] text-fg-3 truncate tracking-wide">
          {t("workbench.description")}
        </span>
        <button
          onClick={() => setPublishOpen(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent text-void text-[11px] font-semibold tracking-wide hover:bg-accent/90 active:scale-[0.98] transition-all"
          data-testid="workbench-publish"
        >
          <Rocket size={10} strokeWidth={2.5} />
          {t("workbench.publish")}
        </button>
      </div>
      <SaveAsTemplateModal
        slug={publishOpen ? slug : null}
        onClose={() => setPublishOpen(false)}
      />
    </>
  );
}
