import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "out/**", "build/**"],
  },
  ...tseslint.configs.recommended,
);
