import { useSkillState } from "@/client/entities/skill/index.js";
import { useI18n } from "@/client/i18n/index.js";

export function SkillList() {
  const skill = useSkillState();
  const { t } = useI18n();

  if (skill.skills.length === 0) return null;

  return (
    <div className="p-3 border-t border-edge/6">
      <label className="text-[11px] font-semibold text-fg-3 uppercase tracking-[0.12em] mb-2 block">
        {t("skills.label")}
      </label>
      <div className="space-y-0.5">
        {skill.skills.map((s) => (
          <div
            key={s.name}
            className="w-full text-left px-2.5 py-2 rounded-lg"
          >
            <div className="min-w-0">
              <div className="text-sm truncate text-fg-2">{s.name}</div>
              <div className="text-xs text-fg-3 truncate">{s.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
