// Prüft Adressen, die aus importierten Seiten stammen (nicht vertrauenswürdig), bevor das Plugin sie abruft.
// requestUrl kennt kein CORS; eine präparierte Seite könnte sonst Geräte im lokalen Netz ansprechen.
// Reine Funktion ohne Obsidian, getestet in tests/netz.test.ts.

const LOKALE_NAMEN = /(^|\.)(localhost|local|lan|home|internal|intranet|corp|home\.arpa|fritz\.box|speedport\.ip)$/;

/** IPv4 als Zahlen, oder null, wenn es keine IPv4-Adresse in Punktschreibweise ist. */
function ipv4(host: string): number[] | null {
  const teile = host.split(".");
  if (teile.length !== 4 || !teile.every((t) => /^\d{1,3}$/.test(t))) return null;
  const z = teile.map(Number);
  return z.every((n) => n <= 255) ? z : null;
}

function privatesIpv4([a, b]: number[]): boolean {
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

function privatesIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::" || h === "::1") return true;
  const gemappt = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (gemappt) {
    const v4 = ipv4(gemappt[1]);
    return !v4 || privatesIpv4(v4);
  }
  // Hex-Schreibweise einer gemappten IPv4-Adresse (::ffff:7f00:1) und andere Übergangsformen: nicht abrufen.
  if (h.startsWith("::ffff:") || h.startsWith("64:ff9b:")) return true;
  return /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("ff");
}

/**
 * true, wenn die Adresse aus dem öffentlichen Internet kommt und abgerufen werden darf:
 * nur http(s), keine Zugangsdaten in der Adresse, kein lokaler Hostname, keine private, Loopback-,
 * Link-local- oder Multicast-IP. Hostnamen ohne Punkt gelten als lokal.
 * Weiterleitungen folgt requestUrl selbst; sie lassen sich hier nicht prüfen.
 */
export function oeffentlicheAdresse(adresse: string): boolean {
  let u: URL;
  try {
    u = new URL(adresse);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  if (host.startsWith("[")) return !privatesIpv6(host.slice(1, -1));
  const v4 = ipv4(host);
  if (v4) return !privatesIpv4(v4);
  // Zahlen ohne Punkte (2130706433) oder Hex (0x7f.1) wandelt URL meist schon um; was übrig bleibt, nicht abrufen.
  if (/^[\d.]+$/.test(host) || /(^|\.)0x[0-9a-f]+/.test(host)) return false;
  if (!host.includes(".")) return false;
  return !LOKALE_NAMEN.test(host);
}
