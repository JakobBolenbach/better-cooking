// Link shorteners and "link in bio" pages: a link there is never followed from a social media post (issue #87).
// requestUrl follows redirects by itself, and where they end cannot be checked (src/network.ts), so a short link
// could lead to a host on the local network. The target of a bio page is a list of links, not a recipe.
// A host here also covers its subdomains. Add new services here; tests/socialPage.test.ts checks the list works.

const REDIRECT_HOSTS = [
  // shorteners
  "bit.ly",
  "bitly.com",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "buff.ly",
  "lnk.to",
  "shorturl.at",
  "rebrand.ly",
  "cutt.ly",
  "is.gd",
  "v.gd",
  "t.ly",
  "rb.gy",
  "s.id",
  "soo.gd",
  "tiny.cc",
  "shorte.st",
  "adf.ly",
  // shopping shorteners
  "amzn.to",
  "amzn.eu",
  "amzn.com",
  "a.co",
  "shope.ee",
  // "link in bio" pages
  "linktr.ee",
  "beacons.ai",
  "linkin.bio",
  "tap.bio",
  "msha.ke",
  "flow.page",
  "lnk.bio",
  "bio.link",
  "linkpop.com",
  "carrd.co",
  "stan.store",
  "campsite.bio",
  "hoo.be",
  "solo.to",
  "withkoji.com",
  "direct.me",
  "snipfeed.co",
  "allmylinks.com",
];

/** later.com/linkinbio is a path on a host that also has other pages. */
const REDIRECT_PATHS = [{ host: "later.com", path: "/linkinbio" }];

/** Is this address a known shortener or bio page? Unparsable addresses count as such (never followed). */
export function isRedirectLink(address: string): boolean {
  let u: URL;
  try {
    u = new URL(address);
  } catch {
    return true;
  }
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  if (REDIRECT_HOSTS.some((d) => h === d || h.endsWith(`.${d}`))) return true;
  return REDIRECT_PATHS.some((p) => h === p.host && u.pathname.toLowerCase().startsWith(p.path));
}
