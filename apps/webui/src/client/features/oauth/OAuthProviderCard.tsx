import { useEffect, useRef, useState } from "react";
import { Badge, Button, Indicator } from "@/client/shared/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { fetchOAuthStatus, logoutOAuth } from "@/client/entities/config/index.js";
import type { OAuthStatus } from "@/client/entities/config/index.js";
import { DeviceCodeModal } from "./DeviceCodeModal.js";
import { providerLabel, formatExpires, isOAuthActive } from "./providerLabel.js";

export function OAuthProviderCard({
  providerName,
  onChange,
}: {
  providerName: string;
  onChange?: (active: boolean) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = providerLabel(providerName);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const notify = (next: OAuthStatus) => onChangeRef.current?.(isOAuthActive(next));

  useEffect(() => {
    void fetchOAuthStatus(providerName).then((s) => {
      setStatus(s);
      void notify(s);
    });
  }, [providerName]);

  const handleLogout = async () => {
    setBusy(true);
    try {
      const next = await logoutOAuth(providerName);
      setStatus(next);
      await notify(next);
    } finally {
      setBusy(false);
    }
  };

  const handleLoginDone = async (next: OAuthStatus) => {
    setStatus(next);
    await notify(next);
  };

  const active = isOAuthActive(status);
  const signedIn = status?.signedIn ?? false;
  const expired = signedIn && !active;
  const relative = formatExpires(status?.expiresAt);

  return (
    <div className="p-4 rounded-xl border border-edge/8 bg-elevated/30 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-fg">{label}</span>
          <Badge variant={active ? "accent" : "muted"}>
            <Indicator color={active ? "accent" : "fg"} />
            {signedIn ? (expired ? t("oauth.sessionExpired") : t("oauth.signedIn")) : t("oauth.notSignedIn")}
          </Badge>
        </div>
        {active && relative && (
          <span className="text-xs text-fg-3 font-mono">
            {t("oauth.expiresIn", { relative })}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {!active ? (
          <Button
            variant="accent"
            size="md"
            onClick={() => setModalOpen(true)}
            disabled={busy}
          >
            {t("oauth.signIn", { provider: label })}
          </Button>
        ) : (
          <Button
            variant="danger"
            size="md"
            onClick={() => void handleLogout()}
            disabled={busy}
          >
            {t("oauth.signOut")}
          </Button>
        )}
      </div>
      {modalOpen && (
        <DeviceCodeModal
          providerName={providerName}
          providerLabel={label}
          onDone={handleLoginDone}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
