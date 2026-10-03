import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

// Clean Architecture guardrails (see .claude/skills/architecture-rules).
// Inner layers must never import outer layers or frameworks/SDKs.
const frameworks = ["next", "next/*", "react", "react-dom", "@supabase/*"];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { ignores: ["node_modules/**", ".next/**", "out/**", "next-env.d.ts"] },
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: frameworks, message: "Domain must be framework-free." },
          { group: ["@/application/*", "@/interface/*", "@/infrastructure/*", "@/app/*"], message: "Domain cannot depend on outer layers." },
        ],
      }],
    },
  },
  {
    files: ["src/application/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: frameworks, message: "Use cases must be framework-free; go through a port." },
          { group: ["@/interface/*", "@/infrastructure/*", "@/app/*"], message: "Application cannot depend on outer layers." },
        ],
      }],
    },
  },
  {
    files: ["src/interface/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@supabase/*"], message: "Only infrastructure may import Supabase." },
          { group: ["@/infrastructure/*", "!@/infrastructure/container"], message: "Interface may only use infrastructure via the composition root (@/infrastructure/container)." },
        ],
      }],
    },
  },
];

export default eslintConfig;
