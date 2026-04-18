import { useEffect, useRef, useState } from "react";
import { Dialog, Button } from "@/client/shared/ui/index.js";
import { useClipboard } from "@/client/shared/useClipboard.js";
import { useI18n } from "@/client/i18n/index.js";
import { useConfigMutations } from "@/client/entities/config/index.js";
import type { OAuthAuthInfo } from "@/client/entities/config/index.js";

export function DeviceCodeModal({
  providerName,
  providerLabel,
  onClose,
}: {
  providerName: string;
  providerLabel: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { loginOAuth } = useConfigMutations();
  const [authInfo, setAuthInfo] = useState<OAuthAuthInfo | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const { copied, copy } = useClipboard();

  const rawInstructions = authInfo?.instructions?.trim();
  const deviceCode = rawInstructions
    ? (rawInstructions.match(/:\s*(\S.*)$/)?.[1] ?? rawInstructions).trim()
    : null;

  // loginOAuth identity rotates each render — capture in a ref so the streaming
  // useEffect doesn't restart and abort its own in-flight poll.
  const onCloseRef = useRef(onClose);
  const loginOAuthRef = useRef(loginOAuth);
  useEffect(() => {
    onCloseRef.current = onClose;
    loginOAuthRef.current = loginOAuth;
  });

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    void loginOAuthRef.current(providerName, {
      signal: controller.signal,
      onAuth: (info) => setAuthInfo(info),
      onProgress: (msg) => setProgress(msg),
      onDone: () => {
        if (!controller.signal.aborted) onCloseRef.current();
      },
      onError: (msg) => {
        if (controller.signal.aborted) return;
        setError(msg);
      },
    }).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [providerName]);

  const handleCancel = () => {
    abortRef.current?.abort();
    onClose();
  };

  const handleCopyCode = () => {
    if (!deviceCode) return;
    void copy(deviceCode);
  };

  const instructionParts = authInfo
    ? t("oauth.deviceCodeInstructions").split("{{url}}")
    : null;

  return (
    <Dialog open={true} onOpenChange={(next) => { if (!next) handleCancel(); }}>
      <div className="p-6 space-y-4">
        <h3 className="font-display text-lg font-bold tracking-tight text-fg">
          {t("oauth.modalTitle", { provider: providerLabel })}
        </h3>
        {error ? (
          <div className="text-sm text-danger">{t("oauth.loginFailed", { message: error })}</div>
        ) : authInfo && instructionParts ? (
          <div className="space-y-3">
            <div className="text-sm text-fg-2">
              {instructionParts[0]}
              <a
                href={authInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline break-all"
              >
                {authInfo.url}
              </a>
              {instructionParts[1] ?? ""}
            </div>
            {deviceCode && (
              <button
                type="button"
                onClick={handleCopyCode}
                title={copied ? t("oauth.copied") : t("oauth.copyCode")}
                aria-label={t("oauth.copyCode")}
                className="relative w-full px-4 py-3 rounded-lg bg-elevated/40 border border-edge/8 text-lg font-mono tracking-widest text-center text-fg hover:bg-elevated/60 hover:border-edge/20 transition-colors cursor-pointer"
              >
                {deviceCode}
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-sans tracking-normal text-fg-3 pointer-events-none">
                  {copied ? t("oauth.copied") : t("oauth.copyCode")}
                </span>
              </button>
            )}
            <div className="text-xs text-fg-3">{progress || t("oauth.waiting")}</div>
          </div>
        ) : (
          <div className="text-sm text-fg-3">{t("oauth.signingIn")}</div>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="danger" size="md" onClick={handleCancel}>
            {t("oauth.cancel")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
