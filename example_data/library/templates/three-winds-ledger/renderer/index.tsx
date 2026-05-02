import { createRenderer } from "@agentchan/renderer/react";
import { useEffect, useMemo, useRef, useState } from "react";
import "./index.css";

import { buildNameMap, findSceneFile, parseScene } from "./data/scene";
import type { ParsedScene, RendererProps, RendererSnapshot, RendererTheme } from "./data/types";
import { deriveWindBalance } from "./data/wind";
import {
  readInventoryYaml,
  readLedgerYaml,
  readQuestYaml,
  readRelationshipYaml,
  readStatsYaml,
  readStatusYaml,
  readWorldStateYaml,
} from "./data/yaml";
import { ChapterCard } from "./overlays/ChapterCard";
import { BellShockwave } from "./overlays/BellShockwave";
import { StampOverlay } from "./overlays/StampOverlay";
import { HarborScene } from "./scene/HarborScene";
import { Choices } from "./ui/Choices";
import { CompassHUD } from "./ui/CompassHUD";
import { LedgerBoard } from "./ui/LedgerBoard";
import { SceneReel } from "./ui/SceneReel";
import { StatusPanel } from "./ui/StatusPanel";

function Renderer({ snapshot, actions }: RendererProps) {
  const isStreaming = snapshot.state.isStreaming;

  const nameMap = useMemo(() => buildNameMap(snapshot.files), [snapshot.files]);
  const sceneFile = useMemo(() => findSceneFile(snapshot.files), [snapshot.files]);
  const parsed = useMemo(
    () => parseScene(sceneFile?.content ?? "", nameMap),
    [sceneFile?.content, nameMap],
  );

  const status = useMemo(() => readStatusYaml(snapshot.files), [snapshot.files]);
  const stats = useMemo(() => readStatsYaml(snapshot.files), [snapshot.files]);
  const inventory = useMemo(() => readInventoryYaml(snapshot.files), [snapshot.files]);
  const ledger = useMemo(() => readLedgerYaml(snapshot.files), [snapshot.files]);
  const quests = useMemo(() => readQuestYaml(snapshot.files), [snapshot.files]);
  const relationship = useMemo(() => readRelationshipYaml(snapshot.files), [snapshot.files]);
  const world = useMemo(() => readWorldStateYaml(snapshot.files), [snapshot.files]);

  const windBalance = useMemo(() => deriveWindBalance(ledger, world), [ledger, world]);

  const judgmentSignal = useJudgmentSignal(parsed);

  return (
    <div className={`tw-stage tw-stage-${world.mode}`}>
      <div className="tw-stage-canvas">
        <HarborScene
          windBalance={windBalance}
          worldMode={world.mode}
          isStreaming={isStreaming}
          bellPulse={judgmentSignal.pulse}
          act={world.act}
        />
      </div>

      <div className="tw-stage-grain" aria-hidden="true" />
      <div className="tw-stage-vignette" aria-hidden="true" />

      <div className="tw-stage-ui">
        <header className="tw-topbar">
          <div className="tw-brand">
            <span className="tw-brand-mark">三</span>
            <div className="tw-brand-text">
              <span className="tw-brand-title">살레른 항구</span>
              <span className="tw-brand-sub">Three Winds Ledger</span>
            </div>
          </div>
          <CompassHUD balance={windBalance} />
          <div className="tw-act-marker">
            <span className="tw-act-num">{romanAct(world.act)}</span>
            <span className="tw-act-label">
              {world.mode === "combat" ? "교전" : `Act ${world.act}`}
            </span>
          </div>
        </header>

        <div className="tw-columns">
          <aside className="tw-col tw-col-status">
            <StatusPanel
              status={status}
              stats={stats}
              relationship={relationship}
              inventory={inventory}
              quests={quests}
            />
          </aside>

          <main className="tw-col tw-col-reel">
            <SceneReel
              parsed={parsed}
              snapshot={snapshot}
              nameMap={nameMap}
              isStreaming={isStreaming}
            />
            <Choices
              choices={parsed.choices}
              stats={stats}
              actions={actions}
              isStreaming={isStreaming}
            />
          </main>

          <aside className="tw-col tw-col-board">
            <div className="tw-board-header">
              <span className="tw-board-title">증거 보드</span>
              <span className="tw-board-count">{ledger.length} entries</span>
            </div>
            <LedgerBoard entries={ledger} />
          </aside>
        </div>
      </div>

      <div className="tw-stage-overlays" aria-hidden="true">
        <BellShockwave pulse={judgmentSignal.pulse} variant={judgmentSignal.variant} />
        <ChapterCard act={world.act} worldMode={world.mode} />
        <StampOverlay ledgerCount={ledger.length} inventoryCount={inventory.length} />
      </div>

      {snapshot.state.errorMessage && (
        <div className="tw-error" role="alert">
          {snapshot.state.errorMessage}
        </div>
      )}
    </div>
  );
}

interface JudgmentSignal {
  pulse: number;
  variant: "neutral" | "success" | "fail";
}

function useJudgmentSignal(parsed: ParsedScene): JudgmentSignal {
  const judgmentLines = useMemo(() => {
    const out: { judgmentSuccess?: boolean }[] = [];
    for (const group of parsed.groups) {
      if (group.kind !== "system") continue;
      for (const line of group.lines) {
        if (line.systemKind === "judgment") {
          out.push({ judgmentSuccess: line.judgmentSuccess });
        }
      }
    }
    return out;
  }, [parsed.groups]);

  const [signal, setSignal] = useState<JudgmentSignal>({ pulse: 0, variant: "neutral" });
  const lastCount = useRef(judgmentLines.length);

  useEffect(() => {
    if (judgmentLines.length > lastCount.current) {
      const latest = judgmentLines[judgmentLines.length - 1];
      const variant =
        latest.judgmentSuccess === true
          ? "success"
          : latest.judgmentSuccess === false
            ? "fail"
            : "neutral";
      setSignal((prev) => ({ pulse: prev.pulse + 1, variant }));
    }
    lastCount.current = judgmentLines.length;
  }, [judgmentLines]);

  return signal;
}

function romanAct(act: number): string {
  return act === 3 ? "III" : act === 2 ? "II" : "I";
}

function theme(snapshot: RendererSnapshot): RendererTheme {
  const world = readWorldStateYaml(snapshot.files);
  if (world.mode === "combat") {
    return {
      base: {
        void: "#0a0303",
        base: "#100706",
        surface: "#160806",
        elevated: "#1f0a08",
        accent: "#b6822a",
        fg: "#e8d8b8",
        fg2: "#b8a08a",
        fg3: "#8a6d58",
        edge: "#3a1818",
      },
      prefersScheme: "dark",
    };
  }
  return {
    base: {
      void: "#06080a",
      base: "#0c1118",
      surface: "#10161e",
      elevated: "#161e2a",
      accent: "#b6822a",
      fg: "#e8dcc0",
      fg2: "#bba888",
      fg3: "#8a785a",
      edge: "#1a2230",
    },
    prefersScheme: "dark",
  };
}

export const renderer = createRenderer(Renderer, { theme });
