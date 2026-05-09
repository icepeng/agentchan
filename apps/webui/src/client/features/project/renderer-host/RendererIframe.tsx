import { useEffect, useRef } from "react";
import {
  attachRpc,
  RENDERER_INIT_MESSAGE_TYPE,
  type RendererHostApi,
  type RendererInitMessage,
  type RendererShellApi,
} from "@agentchan/renderer/host";

interface Props {
  slug: string;
  digest: string;
  scheme: "light" | "dark";
  className?: string;
  hostHandlers: RendererHostApi;
  onShellReady: (shell: RendererShellApi | null) => void;
}

const SHELL_PATH = "/renderer-shell.html";

/**
 * Mounts a single iframe pinned to `?slug=&v={digest}`. On `iframe.onload`,
 * transfers a MessageChannel.port2 via INIT postMessage, then wires the
 * Comlink-style RPC channel and exposes the shell proxy through
 * `onShellReady`. Slug or digest changes recreate the iframe entirely
 * (key change), forcing a fresh handshake on the new generation.
 *
 * `hostHandlers` is captured by ref so handler-identity changes do not
 * tear down the iframe — the parent updates its state without re-creating
 * the channel.
 */
export function RendererIframe({
  slug,
  digest,
  scheme,
  className,
  hostHandlers,
  onShellReady,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const handlersRef = useRef(hostHandlers);
  const onShellReadyRef = useRef(onShellReady);

  useEffect(() => {
    handlersRef.current = hostHandlers;
    onShellReadyRef.current = onShellReady;
  });

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let port: MessagePort | null = null;
    const channelHandlers: RendererHostApi = {
      mounted(payload) {
        handlersRef.current.mounted(payload);
      },
      send(text) {
        handlersRef.current.send(text);
      },
      fill(text) {
        handlersRef.current.fill(text);
      },
      onTheme(theme) {
        handlersRef.current.onTheme(theme);
      },
      onError(message) {
        handlersRef.current.onError(message);
      },
    };

    const handleLoad = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      const channel = new MessageChannel();
      port = channel.port1;
      const init: RendererInitMessage = {
        type: RENDERER_INIT_MESSAGE_TYPE,
        hostOrigin: window.location.origin,
        scheme,
      };
      win.postMessage(init, window.location.origin, [channel.port2]);
      const shell = attachRpc<RendererHostApi, RendererShellApi>(
        port,
        channelHandlers,
      );
      onShellReadyRef.current(shell);
    };

    iframe.addEventListener("load", handleLoad);
    return () => {
      iframe.removeEventListener("load", handleLoad);
      onShellReadyRef.current(null);
      try {
        port?.close();
      } catch {
        // ignore close errors during teardown
      }
    };
  }, [slug, digest, scheme]);

  const src = `${SHELL_PATH}?slug=${encodeURIComponent(slug)}&v=${encodeURIComponent(digest)}`;

  return (
    <iframe
      ref={iframeRef}
      key={`${slug}:${digest}`}
      title="renderer"
      src={src}
      className={className ?? "w-full h-full border-0 block bg-transparent"}
    />
  );
}
