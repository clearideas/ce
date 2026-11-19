// ESLint flat config for Clear Ideas CE.
//
// Scope is deliberately limited to the web UI (`apps/clearideas-ce/src-web`) and its tests
// for the UI remediation work; the API/core packages can be added once the rule set settles.
//
// Custom UI conventions that ESLint cannot express cheaply (icon naming, `!important` budgets,
// line length in SFC templates) live in `scripts/check-ce-ui-conventions.mjs`.

import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import vueA11y from 'eslint-plugin-vuejs-accessibility'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

const WEB_ROOT = 'apps/clearideas-ce/src-web/src'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'apps/clearideas-ce/web/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'apps/clearideas-ce/src-web/public/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  ...vueA11y.configs['flat/recommended'],
  prettier,

  {
    files: [
      `${WEB_ROOT}/**/*.{ts,vue}`,
      'packages/clearideas-pdf-viewer/src/**/*.{ts,vue}',
      'apps/clearideas-ce/test/web/**/*.ts',
      'apps/clearideas-ce/test/e2e/**/*.ts',
    ],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: { ...globals.browser, ...globals.es2022 },
    },
    rules: {
      // ---- Vue conventions -------------------------------------------------------------
      'vue/multi-word-component-names': 'off', // `Avatar`, `Tag`, `Footer` are established names
      'vue/component-name-in-template-casing': ['error', 'PascalCase', { registeredComponentsOnly: false }],
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
      'vue/define-macros-order': ['error', { order: ['defineProps', 'defineEmits', 'defineModel'] }],
      'vue/no-unused-properties': ['warn', { groups: ['props'] }],
      'vue/no-mutating-props': 'error',
      'vue/require-default-prop': 'off',
      'vue/require-explicit-emits': 'error',
      'vue/no-v-html': 'warn',
      'vue/no-useless-v-bind': 'error',
      'vue/prefer-true-attribute-shorthand': 'warn',
      'vue/padding-line-between-blocks': 'error',
      'vue/html-self-closing': 'off', // Prettier owns formatting
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/attributes-order': 'warn',
      // Vuetify slot names contain dots (`#item.name`, `#header.name`).
      'vue/valid-v-slot': ['error', { allowModifiers: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],

      // `vue-tippy` is the single tooltip system (plan decision). VTooltip is forbidden.
      'vue/no-restricted-html-elements': [
        'error',
        { element: ['VTooltip', 'v-tooltip'], message: 'Use the `v-tippy` directive or `<Tippy>` (vue-tippy) instead of VTooltip.' },
      ],

      // ---- Accessibility -------------------------------------------------------------
      'vuejs-accessibility/label-has-for': ['error', { required: { some: ['nesting', 'id'] } }],
      'vuejs-accessibility/click-events-have-key-events': 'warn', // raised to error after Phase 2.9
      'vuejs-accessibility/no-static-element-interactions': 'warn', // raised to error after Phase 2.9
      'vuejs-accessibility/form-control-has-label': 'warn',
      // `autofocus` on a Vuetify field inside a just-opened dialog is the expected focus management;
      // the rule still flags raw DOM `autofocus`.
      'vuejs-accessibility/no-autofocus': ['error', { ignoreNonDOM: true }],
      // Audio/video here are user-uploaded files; captions cannot be synthesised by the app.
      'vuejs-accessibility/media-has-caption': 'off',

      // ---- TypeScript ----------------------------------------------------------------
      'no-undef': 'off', // TypeScript checks identifiers (and knows DOM lib types such as ScrollBehavior)
      '@typescript-eslint/no-explicit-any': 'error', // zero in src-web + pdf-viewer since Batch B 3.11; tests are exempt below
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // ---- Browser APIs we do not want in the UI ---------------------------------------
      'no-restricted-globals': [
        'error',
        { name: 'confirm', message: 'Use <BaseDialog> for confirmations.' },
        { name: 'alert', message: 'Use useAlert() toasts.' },
        { name: 'prompt', message: 'Use a dialog with a form field.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'confirm', message: 'Use <BaseDialog> for confirmations.' },
        { object: 'window', property: 'alert', message: 'Use useAlert() toasts.' },
        { object: 'window', property: 'prompt', message: 'Use a dialog with a form field.' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  {
    // Tests: relax a few rules that fight against mocking.
    files: ['apps/clearideas-ce/test/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
