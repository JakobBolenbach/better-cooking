// Runs on `pnpm version <patch|minor|major>`: copies the version from package.json into manifest.json
// and adds it with minAppVersion to versions.json (Obsidian picks the matching release from it).
import { readFileSync, writeFileSync } from "node:fs";

const version = process.env.npm_package_version;
if (!version) throw new Error("npm_package_version fehlt; über `pnpm version` aufrufen.");
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = version;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[version] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
