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
 * fire-and-forget MessagePort RPC channel and exposes the shell proxy through
 * `onShellReady`. Slug or digest changes recreate the iframe entirely
 * (key change), forcing a fresh handshake on the new generation.
 *
 * `hostHandlers` and `scheme` are captured by ref so identity changes (e.g.
 * appearance toggle) do not tear down the iframe channel — scheme updates
 * after INIT flow through `shell.pushScheme()` from the parent.
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
  const schemeRef = useRef(scheme);

  useEffect(() => {
    handlersRef.current = hostHandlers;
    onShellReadyRef.current = onShellReady;
    schemeRef.current = scheme;
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
        scheme: schemeRef.current,
      };
      win.postMessage(init, "*", [channel.port2]);
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
  }, [slug, digest]);

  const src =
    `${SHELL_PATH}?slug=${encodeURIComponent(slug)}` +
    `&v=${encodeURIComponent(digest)}`;

  return (
    <iframe
      ref={iframeRef}
      key={`${slug}:${digest}`}
      title="renderer"
      src={src}
      sandbox="allow-scripts"
      className={className ?? "w-full h-full border-0 block bg-transparent"}
    />
  );
}
