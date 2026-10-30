import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// One Vitest project per area in test-groups.json, so `npx vitest run --project orders` runs one area and CI shows
// each area as its own check. `npm run test:groups` proves every test file is in exactly one area.
type TestGroup = { id: string; unit: string[] };
const { groups } = JSON.parse(readFileSync(new URL("./test-groups.json", import.meta.url), "utf8")) as {
  groups: TestGroup[];
};

export default defineConfig({
  // Vite resolves the "@/..." paths from tsconfig.json itself (Vite 8+).
  resolve: { tsconfigPaths: true },
  // tsconfig.json says jsx "preserve" (Next.js compiles JSX itself); tests that import a .tsx file need Vite to do it.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    passWithNoTests: true,
    // The integration tests sign in several users and call the real database; 5 s (the default) is tight right after
    // a database reset or on a busy machine. Unit tests finish in milliseconds, so this only matters for them.
    testTimeout: 20_000,
    projects: groups.map((group) => ({
      extends: true,
      test: { name: group.id, include: group.unit },
    })),
  },
});
