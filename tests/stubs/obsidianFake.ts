// A fake "obsidian" for the service tests of the improvements: files with a path, notices that are collected.
// A test file mocks with `vi.mock("obsidian", () => import("./stubs/obsidianFake"))` and the same for "../src/notice".
export const notices: string[] = [];
export const actions: { text: string; run: () => void }[] = [];

export class TFile {
  name: string;
  basename: string;
  extension: string;
  stat = { mtime: 1, size: 10 };
  constructor(public path: string) {
    this.name = path.split("/").pop()!;
    this.extension = this.name.includes(".") ? this.name.split(".").pop()! : "";
    this.basename = this.name.replace(/\.[^.]+$/, "");
  }
}

export class Notice {
  constructor(text: string) {
    notices.push(text);
  }
}

export const normalizePath = (p: string) => p;
export const requestUrl = () => undefined;

export function noticeWithAction(text: string, action?: { run: () => void }) {
  notices.push(text);
  if (action) actions.push({ text, run: action.run });
}
