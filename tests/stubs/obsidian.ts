// Stand-in for the "obsidian" package (types only, nothing to load) so modules that import it can be tested; tests that
// need its classes replace it with vi.mock("obsidian", …).
export {};
