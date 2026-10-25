import { useEffect } from "react";

const BRAND = "BioLicensing";

/**
 * Sets the browser tab title for the current page: "<title> · BioLicensing", or
 * "BioLicensing · <title>" on the home page. Without a title (still loading), the
 * tab just shows the brand.
 */
export function useDocumentTitle(title?: string, { brandFirst = false } = {}) {
  useEffect(() => {
    if (!title) document.title = BRAND;
    else document.title = brandFirst ? `${BRAND} · ${title}` : `${title} · ${BRAND}`;
  }, [title, brandFirst]);
}
