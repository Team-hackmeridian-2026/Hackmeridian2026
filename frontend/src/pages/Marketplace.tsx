import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { escrow, isSettled, nft, paidToLab, type License, type Project } from "../stellar/contracts";
import { useAsync } from "../lib/useAsync";
import { eurc } from "../lib/format";
import { Badge, Card, ErrorBox, Skeleton, buttonClass } from "../components/ui";

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
): { label: string; tone: "neutral" | "brand" | "amber" | "navy" } {
  if (!project) return { label: t("funding.awaiting"), tone: "neutral" };
  if (!project.funded) return { label: t("funding.open"), tone: "amber" };
  const settled = project.milestones.filter((m) => isSettled(m.status)).length;
  if (settled === project.milestones.length) {
    const allPaid = project.milestones.every((m) => m.status === "Released");
    return { label: t(allPaid ? "funding.full" : "funding.done"), tone: "navy" };
  }
  return { label: t("funding.milestone", { current: settled + 1, total: project.milestones.length }), tone: "brand" };
}

function ListingCard({ license, project }: Listing) {
  const { t } = useTranslation();
  const total = project?.milestones.reduce((sum, m) => sum + m.amount, 0n) ?? 0n;
  const released = project?.milestones.reduce((s, m) => s + paidToLab(m), 0n) ?? 0n;
  const status = fundingStatus(t, project);
  const pct = total ? Number((released * 100n) / total) : 0;

  return (
    <Link to={`/licence/${license.id}`} className="group">
      <Card className="flex h-full flex-col gap-4 transition group-hover:border-brand-ink">
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
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted">
            {project ? t("marketplace.released", { released: eurc(released), total: eurc(total) }) : t("marketplace.noRound")}
          </p>
        </div>
      </Card>
    </Link>
  );
}

const POINTS = [
  { key: "licence", icon: "M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z M9 12l2 2 4-4" },
  { key: "milestones", icon: "M4 19h16 M7 19v-5 M12 19V9 M17 19V5" },
  { key: "royalties", icon: "M12 3v18 M5 8l7-5 7 5 M5 14h4 M15 14h4" },
] as const;

function ListingSkeleton() {
  return (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-28" />
      </div>
      <Skeleton className="h-6 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <div className="mt-6 flex flex-col gap-2">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </Card>
  );
}

export function Marketplace() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useAsync(loadListings, []);

  return (
    <div className="flex flex-col gap-12">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-navy px-6 py-10 text-paper sm:px-10 sm:py-12 md:px-12">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative flex flex-col gap-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">{t("marketplace.heroEyebrow")}</p>
          <h1 className="max-w-3xl break-words font-display text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">{t("marketplace.heroTitle")}</h1>
          <p className="max-w-2xl text-paper/75">{t("marketplace.heroText")}</p>
          <div className="flex flex-wrap items-center gap-5">
            <Link to="/new" className={buttonClass()}>
              {t("marketplace.listPatent")}
            </Link>
            <a href="#licences" className="text-sm font-semibold text-paper/80 underline-offset-4 transition duration-200 hover:text-paper hover:underline">
              {t("marketplace.browse")} ↓
            </a>
          </div>
          <ul className="mt-4 grid gap-5 border-t border-white/10 pt-8 md:grid-cols-3">
            {POINTS.map((point) => (
              <li key={point.key} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand ring-1 ring-inset ring-brand/30">
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={point.icon} />
                  </svg>
                </span>
                <div>
                  <p className="font-semibold">{t(`marketplace.points.${point.key}.title`)}</p>
                  <p className="text-sm text-paper/70">{t(`marketplace.points.${point.key}.text`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="licences" className="flex scroll-mt-24 flex-col gap-6" aria-busy={loading}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-ink">{t("marketplace.eyebrow")}</p>
          <h2 className="font-display text-2xl font-semibold">{t("marketplace.title")}</h2>
        </div>
        {error && <ErrorBox message={error} onRetry={reload} />}
        {data && data.length === 0 && (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand/15 text-brand-ink ring-1 ring-inset ring-brand/30">
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h4" />
              </svg>
            </span>
            <h3 className="font-display text-lg font-semibold">{t("marketplace.empty")}</h3>
            <p className="max-w-md text-sm text-muted">{t("marketplace.emptyText")}</p>
            <Link to="/new" className={buttonClass({ className: "mt-2" })}>
              {t("marketplace.emptyCta")}
            </Link>
          </Card>
        )}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {loading && !data && [0, 1, 2].map((i) => <ListingSkeleton key={i} />)}
          {data?.map((listing) => <ListingCard key={String(listing.license.id)} {...listing} />)}
        </div>
      </section>
    </div>
  );
}
