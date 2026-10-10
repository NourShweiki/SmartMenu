import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
    // The integration tests sign in several users and call the real database; 5 s (the default) is tight right after
    // a database reset or on a busy machine. Unit tests finish in milliseconds, so this only matters for them.
    testTimeout: 20_000,
  },
});
