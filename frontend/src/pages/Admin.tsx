import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ACCOUNTS } from "../config";
import { nft, splitter, type TxResult } from "../stellar/contracts";
import { useWallet } from "../stellar/wallet";
import { useToasts } from "../components/toasts";
import { Badge, Button, Card, Field, Input, Notice, SectionTitle } from "../components/ui";

function Registry({
  title,
  description,
  check,
  grant,
  yes,
  no,
}: {
  title: string;
  description: string;
  check: (who: string) => Promise<boolean>;
  grant: (who: string, value: boolean) => Promise<TxResult>;
  yes: string;
  no: string;
}) {
  const { t } = useTranslation();
  const { run } = useToasts();
  const [who, setWho] = useState("");
  const [status, setStatus] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup(address = who) {
    setStatus(null);
    if (address.length === 56) setStatus(await check(address).catch(() => null));
  }

  async function set(value: boolean) {
    setBusy(true);
    if (await run(value ? yes : no, () => grant(who, value))) await lookup();
    setBusy(false);
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <Field label={t("admin.address")}>
        <Input
          value={who}
          onChange={(e) => {
            setWho(e.target.value.trim());
            lookup(e.target.value.trim());
          }}
          placeholder="G…"
          className="font-mono"
        />
      </Field>
      {status !== null && <Badge tone={status ? "brand" : "neutral"}>{status ? t("admin.verified") : t("admin.notVerified")}</Badge>}
      <div className="flex gap-2">
        <Button busy={busy} disabled={who.length !== 56} onClick={() => set(true)}>
          {t("admin.verify")}
        </Button>
        <Button variant="danger" busy={busy} disabled={who.length !== 56} onClick={() => set(false)}>
          {t("admin.revoke")}
        </Button>
      </div>
    </Card>
  );
}

export function Admin() {
  const { t } = useTranslation();
  const { signer } = useWallet();
  const isAdmin = signer?.address === ACCOUNTS.admin;

  return (
    <div className="flex flex-col gap-8">
      <SectionTitle eyebrow={t("admin.eyebrow")} title={t("admin.title")}>
        <p className="max-w-md text-sm text-muted">{t("admin.intro")}</p>
      </SectionTitle>
      {!isAdmin && <Notice>{t("admin.notAdmin")}</Notice>}
      {signer && (
        <div className="grid gap-6 md:grid-cols-2">
          <Registry
            title={t("admin.institutionsTitle")}
            description={t("admin.institutionsText")}
            check={nft.isInstitution}
            grant={(who, value) => nft.setInstitution(signer, who, value)}
            yes={t("admin.institutionVerified")}
            no={t("admin.institutionRevoked")}
          />
          <Registry
            title={t("admin.kycTitle")}
            description={t("admin.kycText")}
            check={splitter.isAllowed}
            grant={(who, value) => splitter.setAllowed(signer, who, value)}
            yes={t("admin.investorVerified")}
            no={t("admin.investorRevoked")}
          />
        </div>
      )}
    </div>
  );
}
