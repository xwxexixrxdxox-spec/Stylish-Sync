// Retailer product-search links for the Reorder tab's "Find at" menu (see
// ReorderTab.tsx). Each entry is a query-URL builder, not an API
// integration — none of these retailers offer a public consumer product
// API, so this just reproduces what a customer would get typing the same
// query into that retailer's own search box, same as the original
// Amazon-only link this replaced.
//
// These URL shapes are reverse-engineered from each site's own search bar,
// not a documented/stable API — worth a quick manual spot-check against
// the live site any time one stops returning sensible results, since a
// retailer can change its query-string format without notice. Amazon's has
// been confirmed working in production; the rest are the best-known
// current formats as of when this shipped.
export interface Retailer {
  id: string;
  label: string;
  buildUrl: (query: string) => string;
}

export const RETAILERS: Retailer[] = [
  { id: "amazon", label: "Amazon", buildUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}` },
  { id: "walmart", label: "Walmart", buildUrl: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}` },
  { id: "lowes", label: "Lowe's", buildUrl: (q) => `https://www.lowes.com/search?searchTerm=${encodeURIComponent(q)}` },
  // Home Depot and Sam's Club use a path-segment search URL rather than a
  // `?k=`/`?q=` query string — a different shape per retailer, not a typo.
  { id: "homedepot", label: "Home Depot", buildUrl: (q) => `https://www.homedepot.com/s/${encodeURIComponent(q)}` },
  {
    id: "costco",
    label: "Costco",
    buildUrl: (q) => `https://www.costco.com/CatalogSearch?dept=All&keyword=${encodeURIComponent(q)}`,
  },
  { id: "samsclub", label: "Sam's Club", buildUrl: (q) => `https://www.samsclub.com/s/${encodeURIComponent(q)}` },
];
