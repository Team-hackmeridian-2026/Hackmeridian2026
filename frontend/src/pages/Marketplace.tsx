import { Link } from "react-router-dom";
import { escrow, nft, type License, type Project } from "../stellar/contracts";
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

export function fundingStatus(project?: Project): { label: string; tone: "neutral" | "teal" | "amber" | "navy" } {
  if (!project) return { label: "Awaiting funding round", tone: "neutral" };
  if (!project.funded) return { label: "Open for funding", tone: "amber" };
  const released = project.milestones.filter((m) => m.status === "Released").length;
  if (released === project.milestones.length) return { label: "Fully funded", tone: "navy" };
  return { label: `Milestone ${released + 1} of ${project.milestones.length}`, tone: "teal" };
}

function ListingCard({ license, project }: Listing) {
  const total = project?.milestones.reduce((sum, m) => sum + m.amount, 0n) ?? 0n;
  const released = project?.milestones.filter((m) => m.status === "Released").reduce((s, m) => s + m.amount, 0n) ?? 0n;
  const status = fundingStatus(project);
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
          {license.terms.exclusive ? "Exclusive" : "Non-exclusive"} licence · {license.terms.territory} ·{" "}
          {license.terms.duration_years} years
        </p>
        <div className="mt-auto flex flex-col gap-2">
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted">
            {project ? `${eurc(released)} released of ${eurc(total)}` : "No funding round yet"}
          </p>
        </div>
      </Card>
    </Link>
  );
}

export function Marketplace() {
  const { data, error, loading } = useAsync(loadListings, []);

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-6 rounded-3xl bg-navy px-8 py-12 text-paper md:px-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal">Funding European research</p>
        <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight md:text-5xl">
          Turn a patent into a programmable licence: funded in euros, released by milestones, paid out automatically.
        </h1>
        <p className="max-w-2xl text-paper/70">
          Universities keep ownership. Investors fund in EURC through an escrow that only pays out when milestones are
          met. Royalties are split between the university, its inventors and investors in a single transaction.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/new">
            <Button className="bg-teal text-navy hover:bg-teal/90">List a patent</Button>
          </Link>
          <a href="#licences">
            <Button variant="secondary" className="border-white/20 bg-transparent text-paper hover:border-teal">
              Browse licences
            </Button>
          </a>
        </div>
      </section>

      <section id="licences" className="flex flex-col gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-dark">Marketplace</p>
          <h2 className="font-display text-2xl font-semibold">Licences on Stellar</h2>
        </div>
        {loading && <Spinner />}
        {error && <ErrorBox message={error} />}
        {data && data.length === 0 && (
          <Card className="text-sm text-muted">
            No licence yet. <Link to="/new" className="font-semibold text-teal-dark">List the first patent →</Link>
          </Card>
        )}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data?.map((listing) => <ListingCard key={String(listing.license.id)} {...listing} />)}
        </div>
      </section>
    </div>
  );
}
