import { readFileSync } from "node:fs";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
	esbuild: {
		tsconfigRaw: "{}",
	},
	plugins: [
		{
			name: "template-loader",
			transform(_code, id) {
				if (id.endsWith(".template")) {
					const content = readFileSync(id, "utf-8");
					return `export default ${JSON.stringify(content)}`;
				}
			},
		},
	],
	test: {
		// Don't load .env in CI - tests must use fixture cache only
		env: process.env.CI === "true" ? {} : loadEnv(mode, process.cwd(), ""),
		globals: true,
		include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
		exclude: ["src/cli/e2e/**/*.test.ts", "node_modules/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/**/*.spec.ts",
				"src/cli.ts",
				"src/cli/**/*.ts",
				"src/index.ts",
				"src/export/index.ts",
				"src/types.ts",
			],
			thresholds: {
				statements: 90,
				branches: 80,
				functions: 90,
				lines: 90,
			},
		},
	},
}));
