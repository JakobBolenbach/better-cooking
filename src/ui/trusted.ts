/** Did the user make this event (not a script)? Own function so tests can stand in: jsdom marks every event as untrusted. */
export function isTrusted(e: Event): boolean {
  return e.isTrusted;
}
