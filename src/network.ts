// Checks addresses taken from imported pages (untrusted) before the plugin fetches them.
// requestUrl ignores CORS; a crafted page could otherwise reach devices on the local network.
// Pure function without Obsidian, tested in tests/network.test.ts.

const LOCAL_NAMES = /(^|\.)(localhost|local|lan|home|internal|intranet|corp|home\.arpa|fritz\.box|speedport\.ip)$/;

/** IPv4 as numbers, or null if it is not an IPv4 address in dotted notation. */
function ipv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((t) => /^\d{1,3}$/.test(t))) return null;
  const z = parts.map(Number);
  return z.every((n) => n <= 255) ? z : null;
}

function isPrivateIpv4([a, b]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::" || h === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (mapped) {
    const v4 = ipv4(mapped[1]);
    return !v4 || isPrivateIpv4(v4);
  }
  // Hex notation of a mapped IPv4 address (::ffff:7f00:1) and other transition forms: do not fetch.
  if (h.startsWith("::ffff:") || h.startsWith("64:ff9b:")) return true;
  return /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("ff");
}

/**
 * true if the address is on the public internet and may be fetched:
 * only http(s), no credentials in the address, no local host name, no private, loopback,
 * link-local or multicast IP. Host names without a dot count as local.
 * requestUrl follows redirects itself; they cannot be checked here.
 */
export function isPublicAddress(address: string): boolean {
  let u: URL;
  try {
    u = new URL(address);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  if (host.startsWith("[")) return !isPrivateIpv6(host.slice(1, -1));
  const v4 = ipv4(host);
  if (v4) return !isPrivateIpv4(v4);
  // Numbers without dots (2130706433) or hex (0x7f.1) are usually converted by URL already; do not fetch what is left.
  if (/^[\d.]+$/.test(host) || /(^|\.)0x[0-9a-f]+/.test(host)) return false;
  if (!host.includes(".")) return false;
  return !LOCAL_NAMES.test(host);
}
