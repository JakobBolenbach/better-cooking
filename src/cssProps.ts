// Sets CSS variables on an element: Obsidian's setCssProps in the app, style.setProperty where it does not exist
// (browser preview in dev/preview, tests without Obsidian). Skips the write if the value is unchanged; an empty value removes the variable.
export function setCssVar(el: HTMLElement, name: string, value: string): void {
  if (el.style.getPropertyValue(name) === value) return;
  if (typeof el.setCssProps === "function") el.setCssProps({ [name]: value });
  else el.style.setProperty(name, value);
}
