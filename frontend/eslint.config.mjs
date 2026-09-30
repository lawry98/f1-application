import { defineConfig, globalIgnores } from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

/**
 * The flat-config port of the old `.eslintrc.json`, in its order: Next's core-web-vitals, then
 * typescript-eslint's recommended set, then prettier switching off whatever formatting rules
 * those two turned on, then this project's own rules and overrides on top.
 *
 * `eslint .` walks the whole package. `next lint` walked only the directories named in
 * `next.config.js` and silently skipped the rest — tests/ and browser/ included — which is why
 * nothing here narrows the file set: a new top-level directory is linted by default.
 */
export default defineConfig([
  globalIgnores(['coverage/**', 'playwright-report/**', 'test-results/**', 'blob-report/**']),
  ...nextCoreWebVitals,
  // Also sets typescript-eslint's parser for every file, not only .ts/.tsx — as the old
  // top-level `"parser"` did.
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'react/no-array-index-key': 'warn',
      'prefer-const': 'error',
    },
  },
  {
    /*
     * eslint-config-next 16 brought eslint-plugin-react-hooks 7, whose `recommended` set adds the
     * React Compiler's rules on top of rules-of-hooks and exhaustive-deps. Ten of them pass here
     * and stay on. These four do not: they flag the latest-value ref written during render
     * (`use-scroll-spy`, `use-team-navigation`, `reveal-ordinal`, `use-compound-selection`), the
     * R3F camera `FitCamera` mutates, a synchronous setState in three effects, and
     * `Math.random()` in the vendored `ui/dot-pattern`. That is advice for a compiler this app
     * does not run, and acting on it rewrites code the browser suite pins, so it is not part of
     * the Next 16 upgrade. Off here, so `pnpm lint` enforces exactly what it did on Next 14 plus
     * the ten.
     */
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['components/ui/**/*.tsx', 'components/ui/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'react/no-array-index-key': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]);
