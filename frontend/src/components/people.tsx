import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ACCOUNTS } from "../config";
import { shortAddress } from "../lib/format";
import { Input } from "./ui";

export type PersonKind = "inventor" | "investor" | "arbiter" | "licensee" | "institution";
export type Person = { name: string; kind: PersonKind; address: string };

/** Demo accounts deployed by scripts/setup-accounts.sh, shown by name instead of raw addresses. */
export const DIRECTORY: Person[] = [
  { name: "Dr. Inventor", kind: "inventor", address: ACCOUNTS.inventor },
  { name: "Horizon Bio Fund", kind: "investor", address: ACCOUNTS.fund },
  { name: "Tech Transfer Board", kind: "arbiter", address: ACCOUNTS.arbiter },
  { name: "PharmaCo", kind: "licensee", address: ACCOUNTS.pharma },
  { name: "University lab", kind: "institution", address: ACCOUNTS.lab },
];

const OTHER = "__other__";

export function nameOf(address: string): string {
  return DIRECTORY.find((p) => p.address === address)?.name ?? shortAddress(address);
}

/** Picks a person by name; "Other address…" reveals a free input for any Stellar account. */
export function PersonPicker({
  value,
  onChange,
  suggested,
}: {
  value: string;
  onChange: (address: string) => void;
  suggested: Person[];
}) {
  const { t } = useTranslation();
  const known = suggested.some((p) => p.address === value);
  const [other, setOther] = useState(!known && value !== "");

  return (
    <div className="flex flex-col gap-2">
      <select
        className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-teal-dark"
        value={other ? OTHER : value}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setOther(true);
            onChange("");
          } else {
            setOther(false);
            onChange(e.target.value);
          }
        }}
      >
        {!known && !other && <option value="">{t("people.choose")}</option>}
        {suggested.map((p) => (
          <option key={p.address} value={p.address}>
            {p.name} ({t("people.demoAccount", { role: t(`people.kinds.${p.kind}`) })})
          </option>
        ))}
        <option value={OTHER}>{t("people.other")}</option>
      </select>
      {other ? (
        <Input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={t("people.placeholder")}
          className="font-mono"
        />
      ) : (
        value && (
          <p className="font-mono text-xs text-muted" title={value}>
            {shortAddress(value)}
          </p>
        )
      )}
    </div>
  );
}
