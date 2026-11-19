import { defineConfig, devices } from '@playwright/test'

/**
 * Browser matrix for the CE UI.
 *
 * - `desktop-light` runs every spec (functional smoke + UI journeys + visual baselines).
 * - `desktop-dark` and `mobile-light` run the UI/visual specs only; the API-driven smoke spec
 *   is theme/viewport independent.
 *
 * Each project sets the persisted theme through `localStorage['app-theme']` (see
 * `src-web/src/composables/useAppTheme.ts`) via `storageState` so no UI interaction is needed
 * to switch themes.
 */
const uiSpecs = /(ui-|visual|a11y).*\.spec\.ts$/

export default defineConfig({
  testDir: './test/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  use: {
    browserName: 'chromium',
    trace: 'retain-on-failure',
    colorScheme: 'light',
  },
  projects: [
    {
      name: 'desktop-light',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'desktop-dark',
      testMatch: uiSpecs,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
    },
    {
      name: 'mobile-light',
      testMatch: uiSpecs,
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
})
