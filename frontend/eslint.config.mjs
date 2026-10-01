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
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    /*
     * `react-hooks/immutability` models every hook's return value as frozen. `useThree` hands back
     * three.js objects whose whole API is imperative mutation — R3F's own pattern — and `FitCamera`
     * sets the fitted `scene.fog` in a layout effect because the fog planes follow the camera
     * distance, which is only knowable inside the Canvas (see CLAUDE.md, "Neither 3D scene frames
     * its own camera"). One file, one rule: any other mutation of a hook's value still fails.
     */
    files: ['components/3d/fit-camera.tsx'],
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
  {
    files: ['components/ui/**/*.tsx', 'components/ui/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'react/no-array-index-key': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // Vendored shadcn/ui and Magic UI, re-added rather than hand-edited: `dot-pattern` draws its
      // twinkle delays with `Math.random()` during render, upstream's code and not ours to fix.
      'react-hooks/purity': 'off',
    },
  },
]);
