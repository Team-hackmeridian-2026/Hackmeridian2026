import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Card, buttonClass } from "./ui";
import { Molecule } from "./Molecule";

function ErrorCard({ title, text, reload = false }: { title: string; text: string; reload?: boolean }) {
  const { t } = useTranslation();
  return (
    <Card className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-6 py-12 text-center">
      <Molecule shape="tetra" className="w-24" />
      <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
      <p className="max-w-md text-muted">{text}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link to="/" className={buttonClass()}>
          {t("errorPage.back")}
        </Link>
        {reload && (
          <Button variant="secondary" onClick={() => window.location.reload()}>
            {t("errorPage.reload")}
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Unknown address, or a licence that does not exist on-chain. */
export function NotFound({ title }: { title?: string }) {
  const { t } = useTranslation();
  return <ErrorCard title={title ?? t("errorPage.notFoundTitle")} text={t("errorPage.notFoundText")} />;
}

/** Shown by the router instead of a blank page when a screen throws while rendering. */
export function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  // Kept in the console for debugging; the page itself stays in plain language.
  console.error(error);
  return <ErrorCard title={t("errorPage.title")} text={t("errorPage.text")} reload />;
}
