import base from './playwright.config';
import { defineConfig } from '@playwright/test';
export default defineConfig(base, {
  use: { ...base.use, channel: 'chrome', launchOptions: { chromiumSandbox: true } },
  reporter: [['list'], ['json', { outputFile: 'results/local-browser-results.json' }]],
});
