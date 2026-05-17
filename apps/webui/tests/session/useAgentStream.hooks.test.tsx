import { describe, expect, test } from "bun:test";
import "../setup/happydom.js";
import "../setup/testing-library.js";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  SessionProvider,
  useAgentStream,
} from "@/client/session/index.js";
import { useAgentStreamDispatch } from "@/client/session/stream/AgentStreamStoreContext.js";
import type { AgentStateAction } from "@/client/session/stream/agentStreamStore.js";

function SessionWrapper({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

describe("useAgentStream hook isolation", () => {
  test("does not re-render alpha subscribers when beta dispatches", () => {
    const alphaStates: boolean[] = [];
    const secondAlphaStates: boolean[] = [];
    let dispatch: ((action: AgentStateAction) => void) | null = null;

    function AlphaProbe({ states }: { states: boolean[] }) {
      states.push(useAgentStream("alpha").isStreaming);
      return null;
    }

    function DispatchProbe() {
      dispatch = useAgentStreamDispatch();
      return null;
    }

    render(
      <SessionWrapper>
        <AlphaProbe states={alphaStates} />
        <AlphaProbe states={secondAlphaStates} />
        <DispatchProbe />
      </SessionWrapper>,
    );

    act(() => {
      dispatch?.({ type: "START", projectSlug: "beta" });
    });

    expect(alphaStates).toEqual([false]);
    expect(secondAlphaStates).toEqual([false]);

    act(() => {
      dispatch?.({ type: "START", projectSlug: "alpha" });
    });

    expect(alphaStates).toEqual([false, true]);
    expect(secondAlphaStates).toEqual([false, true]);
  });
});
