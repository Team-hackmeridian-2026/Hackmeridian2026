import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { escrow, nft, type License, type Project } from "../stellar/contracts";
import { useAsync } from "../lib/useAsync";
import { ErrorBox, Skeleton, buttonClass } from "../components/ui";
import { HeroVisual } from "../components/HeroVisual";
import { FundingProgress, fundingStatus } from "../components/Funding";
import { Molecule } from "../components/Molecule";
import { useDocumentTitle } from "../lib/useDocumentTitle";

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

export { fundingStatus };

const COLUMNS = "md:grid md:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.2fr)_1.5rem] md:items-center md:gap-6";

export function ListingRow({ license, project }: Listing) {
  const { t } = useTranslation();
  const term = t("common.years", { count: license.terms.duration_years });
  const type = license.terms.exclusive ? t("common.exclusive") : t("common.nonExclusive");

  return (
    <li>
      <Link
        to={`/licence/${license.id}`}
        aria-label={t("marketplace.openLicence", { title: license.title })}
        className={`group flex flex-col gap-4 px-5 py-5 transition duration-200 hover:bg-subtle/60 sm:px-7 sm:py-6 ${COLUMNS}`}
      >
        <div className="min-w-0">
          <p className="text-sm text-muted">{t("marketplace.licenceNumber", { id: String(license.id) })}</p>
          <p className="line-clamp-2 font-display text-xl leading-snug font-bold tracking-tight">{license.title}</p>
          <p className="mt-1 text-sm text-muted md:hidden">
            {license.terms.field} ·{" "}
            {t("marketplace.licenceLine", {
              licence: license.terms.exclusive ? t("marketplace.exclusiveLicence") : t("marketplace.nonExclusiveLicence"),
              territory: license.terms.territory,
              duration: term,
            })}
          </p>
        </div>
        <p className="hidden truncate md:block">{license.terms.field}</p>
        <p className="hidden truncate md:block">{license.terms.territory}</p>
        <p className="hidden md:block">{term}</p>
        <p className="hidden md:block">{type}</p>
        <FundingProgress project={project} />
        <svg viewBox="0 0 24 24" className="hidden size-5 text-brand-ink transition duration-200 group-hover:translate-x-0.5 md:block" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m9 6 6 6-6 6" />
        </svg>
      </Link>
    </li>
  );
}

function RowSkeleton() {
  return (
    <li className={`flex flex-col gap-4 px-5 py-6 sm:px-7 ${COLUMNS}`}>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-5 w-3/4" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="hidden h-4 w-16 md:block" />
      ))}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-1.5 w-full" />
      </div>
      <span />
    </li>
  );
}

/** The licences listed on-chain, as in the Figma table (stacked cards on phones). */
export function LicenceTable({ data, loading }: { data?: Listing[]; loading: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-card shadow-card">
      <div className={`hidden border-b border-line px-7 py-3.5 text-xs font-semibold text-muted ${COLUMNS}`}>
        <span>{t("marketplace.table.licence")}</span>
        <span>{t("marketplace.table.field")}</span>
        <span>{t("marketplace.table.territory")}</span>
        <span>{t("marketplace.table.term")}</span>
        <span>{t("marketplace.table.type")}</span>
        <span>{t("marketplace.table.funding")}</span>
        <span />
      </div>
      {data && data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <Molecule shape="tetra" className="w-24" />
          <h3 className="font-display text-xl font-bold">{t("marketplace.empty")}</h3>
          <p className="max-w-md text-sm text-muted">{t("marketplace.emptyText")}</p>
          <Link to="/new" className={buttonClass({ className: "mt-2" })}>
            {t("marketplace.emptyCta")}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {loading && !data && [0, 1].map((i) => <RowSkeleton key={i} />)}
          {data?.map((listing) => <ListingRow key={String(listing.license.id)} {...listing} />)}
        </ul>
      )}
    </div>
  );
}

const AUDIENCES = ["labs", "investors", "industry"] as const;
const STEPS = [
  { key: "publish", line: "from-dna-indigo/70 to-dna-violet/30" },
  { key: "fund", line: "from-dna-violet/60 to-dna-pink/50" },
  { key: "payouts", line: "from-dna-pink/50 to-dna-peach/70" },
] as const;

export function Marketplace() {
  const { t } = useTranslation();
  useDocumentTitle(t("marketplace.heroTitle"), { brandFirst: true });
  const { data, error, loading, reload } = useAsync(loadListings, []);

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative isolate grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-6">
        <div className="flex flex-col gap-7 py-6 sm:py-10">
          <p className="flex items-center gap-2.5 text-sm text-muted">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-amber ring-4 ring-amber/20" />
            {t("marketplace.heroNote")}
          </p>
          <h1 className="max-w-[12ch] font-display text-5xl leading-[0.95] font-extrabold tracking-[-0.04em] text-balance sm:text-6xl lg:text-[5.4rem]">
            {t("marketplace.heroTitle")}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted sm:text-xl">{t("marketplace.heroText")}</p>
          <div className="flex flex-wrap gap-3">
            <a href="#licences" className={buttonClass()}>
              {t("marketplace.explore")}
            </a>
            <Link to="/new" className={buttonClass({ variant: "secondary" })}>
              {t("marketplace.listPatent")}
            </Link>
          </div>
        </div>
        <HeroVisual />
      </section>

      {/* Built for */}
      <section className="mt-6 border-t border-line pt-8">
        <h2 className="text-sm font-semibold text-muted">{t("marketplace.builtFor")}</h2>
        <ul className="mt-5 grid gap-6 md:grid-cols-3 md:gap-10">
          {AUDIENCES.map((key) => (
            <li key={key}>
              <h3 className="font-display text-xl font-bold tracking-tight">{t(`marketplace.audiences.${key}.title`)}</h3>
              <p className="mt-1.5 text-sm text-muted">{t(`marketplace.audiences.${key}.text`)}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* How funding reaches the lab */}
      <section className="mt-24 sm:mt-32">
        <div className="flex items-end justify-between gap-6">
          <h2 className="max-w-2xl font-display text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">{t("marketplace.how.title")}</h2>
          <Molecule shape="ring" className="hidden w-64 shrink-0 animate-[float_10s_ease-in-out_infinite] md:block" />
        </div>
        <ol className="mt-12 grid gap-12 md:grid-cols-3 md:gap-10">
          {STEPS.map((step, i) => (
            <li key={step.key} className="flex flex-col">
              <div className="flex items-center gap-6">
                <span className="font-display text-7xl leading-none font-extrabold tracking-tight text-brand-ink">{i + 1}</span>
                <span aria-hidden className={`h-px flex-1 bg-gradient-to-r ${step.line}`} />
              </div>
              <h3 className="mt-7 font-display text-2xl font-bold tracking-tight">{t(`marketplace.how.steps.${step.key}.title`)}</h3>
              <p className="mt-3 leading-relaxed text-muted">{t(`marketplace.how.steps.${step.key}.text`)}</p>
              <p className="mt-5 flex items-center gap-3 text-sm text-muted">
                <span aria-hidden className="h-px w-5 bg-muted/60" />
                {t(`marketplace.how.steps.${step.key}.note`)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Licences, on a full-width band that runs into the footer */}
      <section id="licences" aria-busy={loading} className="relative mt-24 -mb-8 scroll-mt-24 py-16 sm:mt-32 sm:-mb-12 sm:py-24">
        <div aria-hidden className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-band" />
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="font-display text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">{t("marketplace.title")}</h2>
            {data && <p className="mt-3 text-muted">{t("marketplace.count", { count: data.length })}</p>}
          </div>
          <Link to="/new" className={buttonClass({ variant: "secondary" })}>
            {t("marketplace.listPatent")}
          </Link>
        </div>
        <div className="mt-10 flex flex-col gap-4">
          {error && <ErrorBox message={error} onRetry={reload} />}
          {!error && <LicenceTable data={data} loading={loading} />}
        </div>
      </section>
    </div>
  );
}
