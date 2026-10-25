import { useState } from "react";
import { ACCOUNTS } from "../config";
import { nft, splitter, type TxResult } from "../stellar/contracts";
import { useWallet } from "../stellar/wallet";
import { useToasts } from "../components/toasts";
import { Badge, Button, Card, ErrorBox, Field, Input, SectionTitle } from "../components/ui";

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
      <Field label="Stellar address">
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
      {status !== null && <Badge tone={status ? "teal" : "neutral"}>{status ? "Verified" : "Not verified"}</Badge>}
      <div className="flex gap-2">
        <Button busy={busy} disabled={who.length !== 56} onClick={() => set(true)}>
          Verify
        </Button>
        <Button variant="danger" busy={busy} disabled={who.length !== 56} onClick={() => set(false)}>
          Revoke
        </Button>
      </div>
    </Card>
  );
}

export function Admin() {
  const { signer } = useWallet();
  const isAdmin = signer?.address === ACCOUNTS.admin;

  return (
    <div className="flex flex-col gap-8">
      <SectionTitle eyebrow="Compliance" title="Platform administration">
        <p className="max-w-md text-sm text-muted">
          Only verified institutions can list patents, and only investors who passed KYC can hold revenue shares.
        </p>
      </SectionTitle>
      {!isAdmin && <ErrorBox message="Connect the platform admin account to change these registries. Anyone can look up a status." />}
      {signer && (
        <div className="grid gap-6 md:grid-cols-2">
          <Registry
            title="Verified institutions"
            description="Universities, labs and tech transfer offices allowed to mint licences."
            check={nft.isInstitution}
            grant={(who, value) => nft.setInstitution(signer, who, value)}
            yes="Institution verified"
            no="Institution revoked"
          />
          <Registry
            title="KYC allowlist"
            description="Investors allowed to hold, buy or sell revenue shares."
            check={splitter.isAllowed}
            grant={(who, value) => splitter.setAllowed(signer, who, value)}
            yes="Investor verified"
            no="Investor revoked"
          />
        </div>
      )}
    </div>
  );
}
