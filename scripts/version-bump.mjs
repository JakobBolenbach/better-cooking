// Läuft bei `pnpm version <patch|minor|major>`: übernimmt die Version aus package.json in manifest.json
// und trägt sie mit minAppVersion in versions.json ein (Obsidian wählt darüber die passende Fassung).
import { readFileSync, writeFileSync } from "node:fs";

const version = process.env.npm_package_version;
if (!version) throw new Error("npm_package_version fehlt; über `pnpm version` aufrufen.");
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = version;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[version] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
