import { describe, expect, it } from "vitest";
import { oeffentlicheAdresse } from "../src/netz";

describe("oeffentlicheAdresse", () => {
  it("erlaubt normale Bilder im Internet", () => {
    for (const a of [
      "https://img.example.org/rezept.jpg",
      "http://cdn.example.com/a/b.webp?w=800",
      "https://93.184.216.34/bild.png",
      "https://[2606:4700::6810:84e5]/bild.png",
      "https://example.org./bild.png",
    ])
      expect(oeffentlicheAdresse(a), a).toBe(true);
  });

  it("weist lokale Rechner und Namen ab", () => {
    for (const a of [
      "http://localhost/x.png",
      "http://LOCALHOST:8080/x.png",
      "http://foo.localhost/x.png",
      "http://router.local/x.png",
      "http://nas.lan/x.png",
      "http://fritz.box.home.arpa/x.png",
      "http://drucker/x.png",
      "http://intern.corp/x.png",
      "http://fritz.box/x.png",
      "http://speedport.ip/x.png",
    ])
      expect(oeffentlicheAdresse(a), a).toBe(false);
  });

  it("weist private, Loopback-, Link-local- und Multicast-IPs ab", () => {
    for (const a of [
      "http://127.0.0.1/x.png",
      "http://127.1.2.3/x.png",
      "http://0.0.0.0/x.png",
      "http://10.0.0.5/x.png",
      "http://172.16.0.1/x.png",
      "http://172.31.255.255/x.png",
      "http://192.168.178.1/x.png",
      "http://169.254.169.254/latest/meta-data",
      "http://100.64.0.1/x.png",
      "http://224.0.0.1/x.png",
      "http://[::1]/x.png",
      "http://[fe80::1]/x.png",
      "http://[fd00::1]/x.png",
      "http://[::ffff:127.0.0.1]/x.png",
      "http://[::ffff:7f00:1]/x.png",
    ])
      expect(oeffentlicheAdresse(a), a).toBe(false);
  });

  it("weist Zahlen-Schreibweisen von IPs ab, die auf lokale Adressen zeigen", () => {
    for (const a of ["http://2130706433/x.png", "http://0x7f.0.0.1/x.png", "http://017700000001/x.png"])
      expect(oeffentlicheAdresse(a), a).toBe(false);
  });

  it("weist andere Protokolle, Zugangsdaten und Unsinn ab", () => {
    for (const a of [
      "file:///etc/passwd",
      "ftp://example.org/x.png",
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
      "https://user:pw@example.org/x.png",
      "kein link",
      "",
    ])
      expect(oeffentlicheAdresse(a), a).toBe(false);
  });

  it("lässt öffentliche IPs neben privaten Bereichen zu", () => {
    expect(oeffentlicheAdresse("http://172.15.0.1/x.png")).toBe(true);
    expect(oeffentlicheAdresse("http://172.32.0.1/x.png")).toBe(true);
    expect(oeffentlicheAdresse("http://192.169.0.1/x.png")).toBe(true);
  });
});
