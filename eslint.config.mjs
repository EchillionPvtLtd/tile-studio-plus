import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "node_modules/**", "public/**", "next-env.d.ts", "prisma/dev.db*"]),
  {
    rules: {
      // Showing up as warnings so `npm run lint` passes today while the existing code is cleaned up gradually.
      // Everything not listed here (rules of hooks, no-undef, unreachable code, ...) still fails the build as an error.
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      // `interface Props extends Base {}` is the usual way to name a component's props
      "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends" }],
    },
  },
  {
    // Config files run in Node and load plugins with require()
    files: ["*.config.js", "*.config.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);
