import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import type { RendererSnapshot } from "@/client/entities/renderer/index.js";
import type { RendererLayerId } from "./rendererRuntime.js";

interface UseRendererSnapshotsOptions {
  snapshot: RendererSnapshot | null;
}

export interface RendererSnapshotStore {
  latestSnapshotRef: React.MutableRefObject<RendererSnapshot | null>;
  clearLayer: (layer: RendererLayerId) => void;
  getSnapshot: (layer: RendererLayerId) => RendererSnapshot;
  notifyLayer: (layer: RendererLayerId) => void;
  setLayerSnapshot: (layer: RendererLayerId, snapshot: RendererSnapshot | null) => void;
  subscribe: (layer: RendererLayerId, listener: () => void) => () => void;
}

export function useRendererSnapshots({
  snapshot,
}: UseRendererSnapshotsOptions): RendererSnapshotStore {
  const latestSnapshotRef = useRef(snapshot);
  const layerSnapshotsRef = useRef<[RendererSnapshot | null, RendererSnapshot | null]>([
    snapshot,
    null,
  ]);
  const layerListenersRef = useRef<[Set<() => void>, Set<() => void>]>([
    new Set(),
    new Set(),
  ]);

  useLayoutEffect(() => {
    latestSnapshotRef.current = snapshot;
  }, [snapshot]);

  // Stable store methods are part of the external subscription contract.
  const clearLayer = useCallback((layer: RendererLayerId) => {
    layerSnapshotsRef.current[layer] = null;
  }, []);

  const getSnapshot = useCallback((layer: RendererLayerId) => {
    const layerSnapshot = layerSnapshotsRef.current[layer];
    if (!layerSnapshot) throw new Error("Renderer snapshot is not ready.");
    return layerSnapshot;
  }, []);

  const notifyLayer = useCallback((layer: RendererLayerId) => {
    for (const listener of layerListenersRef.current[layer]) listener();
  }, []);

  const setLayerSnapshot = useCallback(
    (layer: RendererLayerId, nextSnapshot: RendererSnapshot | null) => {
      layerSnapshotsRef.current[layer] = nextSnapshot;
      if (nextSnapshot) notifyLayer(layer);
    },
    [notifyLayer],
  );

  const subscribe = useCallback((layer: RendererLayerId, listener: () => void) => {
    layerListenersRef.current[layer].add(listener);
    return () => layerListenersRef.current[layer].delete(listener);
  }, []);

  return useMemo(
    () => ({
      latestSnapshotRef,
      clearLayer,
      getSnapshot,
      notifyLayer,
      setLayerSnapshot,
      subscribe,
    }),
    [
      clearLayer,
      getSnapshot,
      notifyLayer,
      setLayerSnapshot,
      subscribe,
    ],
  );
}
