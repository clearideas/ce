/**
 * Stylelint for the CE web UI (SCSS partials and <style> blocks in SFCs).
 *
 * `!important`: Vuetify 4's CSS is layered, so component styles never need it (error in SFCs; a
 * genuine exception — beating a Vuetify inline style — carries a disable comment saying why). In
 * global SCSS it is a warning; the remaining uses (utilities, vendor overrides, reduced motion) are
 * documented in place and `scripts/check-ce-ui-conventions.mjs` holds the budget (248 → 40).
 */
module.exports = {
  extends: ['stylelint-config-standard-scss'],
  overrides: [
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
      rules: { 'declaration-no-important': true },
    },
  ],
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    'apps/clearideas-ce/web/**',
    'apps/clearideas-ce/src-web/public/**',
  ],
  rules: {
    'declaration-no-important': [true, { severity: 'warning' }],
    'selector-max-specificity': ['0,4,0', { severity: 'warning' }],
    'selector-class-pattern': null,
    'scss/at-extend-no-missing-placeholder': null,
    // Prettier wraps long `calc()` expressions after `/`; formatting is Prettier's job.
    'scss/operator-no-newline-after': null,
    'no-descending-specificity': null,
    // Vuetify's documented form is `rgba(var(--v-theme-x), alpha)`; keep it.
    'color-function-notation': null,
    'color-function-alias-notation': null,
    'alpha-value-notation': null,
    // No autoprefixer in the Vite pipeline; prefixed declarations are intentional.
    'property-no-vendor-prefix': null,
    'value-no-vendor-prefix': null,
    'font-family-name-quotes': null,
    'declaration-block-no-redundant-longhand-properties': null,
    'scss/comment-no-empty': null,
    'comment-empty-line-before': null,
    'scss/dollar-variable-empty-line-before': null,
    'value-keyword-case': null,
    'media-feature-range-notation': null,
    'selector-pseudo-element-no-unknown': [true, { ignorePseudoElements: ['v-deep'] }],
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['deep', 'global', 'slotted'] }],
  },
}
