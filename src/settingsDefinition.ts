// Row to the definition Obsidian 1.13+ expects. Obsidian calls what `render` returns as a cleanup function on every
// redraw, so a row that returns a Setting (arrow functions do) would raise "is not a function": return nothing.
import type { Setting } from "obsidian";

interface RenderRow {
  render: (s: Setting) => void;
}

export function definitionRender(row: RenderRow): (s: Setting) => void {
  return (s) => {
    row.render(s);
  };
}
