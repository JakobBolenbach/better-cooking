// Message for an exception that reaches a dialog (instead of leaving it busy without a word).
import { tr } from "./i18n";

export const failedText = (e: unknown): string =>
  tr("failedWith", { error: (e instanceof Error ? e.message : String(e)).slice(0, 120) });
