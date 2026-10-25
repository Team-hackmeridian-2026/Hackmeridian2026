import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { escrow, isSettled, nft, paidToLab, type License, type Project } from "../stellar/contracts";
import { useAsync } from "../lib/useAsync";
import { eurc } from "../lib/format";
import { Badge, Button, Card, ErrorBox, Spinner } from "../components/ui";

type Listing = { license: License; project?: Project };

async function loadListings(): Promise<Listing[]> {
  const licenses = await nft.list(1n, 50);
  return Promise.all(
    licenses.map(async (license) => {
      const ids = await escrow.projectsByLicense(license.id);
      const project = ids.length ? await escrow.get(ids[ids.length - 1]) : undefined;
      return { license, project };
    }),
  );
}

export function fundingStatus(
  t: TFunction,
  project?: Project,
): { label: string; tone: "neutral" | "teal" | "amber" | "navy" } {
  if (!project) return { label: t("funding.awaiting"), tone: "neutral" };
  if (!project.funded) return { label: t("funding.open"), tone: "amber" };
  const settled = project.milestones.filter((m) => isSettled(m.status)).length;
  if (settled === project.milestones.length) {
    const allPaid = project.milestones.every((m) => m.status === "Released");
    return { label: t(allPaid ? "funding.full" : "funding.done"), tone: "navy" };
  }
  return { label: t("funding.milestone", { current: settled + 1, total: project.milestones.length }), tone: "teal" };
}

function ListingCard({ license, project }: Listing) {
  const { t } = useTranslation();
  const total = project?.milestones.reduce((sum, m) => sum + m.amount, 0n) ?? 0n;
  const released = project?.milestones.reduce((s, m) => s + paidToLab(m), 0n) ?? 0n;
  const status = fundingStatus(t, project);
  const pct = total ? Number((released * 100n) / total) : 0;

  return (
    <Link to={`/licence/${license.id}`} className="group">
      <Card className="flex h-full flex-col gap-4 transition group-hover:border-teal-dark">
        <div className="flex items-start justify-between gap-3">
          <Badge tone="neutral">{license.terms.field}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <h3 className="font-display text-xl font-semibold leading-snug">{license.title}</h3>
        <p className="text-sm text-muted">
          {t("marketplace.licenceLine", {
            licence: license.terms.exclusive ? t("marketplace.exclusiveLicence") : t("marketplace.nonExclusiveLicence"),
            territory: license.terms.territory,
            duration: t("common.years", { count: license.terms.duration_years }),
          })}
        </p>
        <div className="mt-auto flex flex-col gap-2">
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted">
            {project ? t("marketplace.released", { released: eurc(released), total: eurc(total) }) : t("marketplace.noRound")}
          </p>
        </div>
      </Card>
    </Link>
  );
}

export function Marketplace() {
  const { t } = useTranslation();
  const { data, error, loading } = useAsync(loadListings, []);

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-6 rounded-3xl bg-navy px-8 py-12 text-paper md:px-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal">{t("marketplace.heroEyebrow")}</p>
        <h1 className="max-w-3xl break-words font-display text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">{t("marketplace.heroTitle")}</h1>
        <p className="max-w-2xl text-paper/70">{t("marketplace.heroText")}</p>
        <div className="flex flex-wrap gap-3">
          <Link to="/new">
            <Button className="bg-teal text-navy hover:bg-teal/90">{t("marketplace.listPatent")}</Button>
          </Link>
          <a href="#licences">
            <Button variant="secondary" className="border-white/20 bg-transparent text-paper hover:border-teal">
              {t("marketplace.browse")}
            </Button>
          </a>
        </div>
      </section>

      <section id="licences" className="flex flex-col gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-dark">{t("marketplace.eyebrow")}</p>
          <h2 className="font-display text-2xl font-semibold">{t("marketplace.title")}</h2>
        </div>
        {loading && <Spinner />}
        {error && <ErrorBox message={error} />}
        {data && data.length === 0 && (
          <Card className="text-sm text-muted">
            {t("marketplace.empty")}{" "}
            <Link to="/new" className="font-semibold text-teal-dark">
              {t("marketplace.emptyCta")}
            </Link>
          </Card>
        )}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data?.map((listing) => <ListingCard key={String(listing.license.id)} {...listing} />)}
        </div>
      </section>
    </div>
  );
}
