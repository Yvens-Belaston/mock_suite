import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ".claude/**", "e2e/**", "web/**"],
    // Mock API latency (spec: 0 in tests); a test that needs it passes `responseDelayMs`.
    env: { RESPONSE_DELAY_MS: "0" },
  },
});
