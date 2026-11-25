// Entscheidet beim Selbst-Neuladen (seit 0.7.2), ob eine neue Fassung des Plugins da und fertig geschrieben ist.
// Reine Funktion ohne Obsidian, deshalb mit Vitest testbar. Ablauf in src/main.ts, Doku in Cockpit-Plugin.md.

/**
 * `geladen`: Stand der Plugin-Dateien beim Laden; `kandidat`: zuletzt gesehener abweichender Stand; `jetzt`: aktueller Stand.
 * Neu geladen wird erst, wenn ein abweichender Stand zweimal hintereinander gleich ist (Datei fertig geschrieben).
 */
export function nextStep(loaded: string, candidate: string, now: string): { reload: boolean; candidate: string } {
  if (!loaded || now === loaded) return { reload: false, candidate: "" };
  if (now !== candidate) return { reload: false, candidate: now };
  return { reload: true, candidate: now };
}
