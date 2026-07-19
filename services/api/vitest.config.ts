import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
    globals: false,
    // Integration tests that need a live database opt in via TCS_DB_TESTS=1.
    passWithNoTests: false,
  },
});
