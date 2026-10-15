import { repeatTeamsSweep } from './support/teams-repeat';
import { test } from './support/test';

/**
 * DIAGNOSTIC ONLY — not for merge. As the control, with Chromium's speculative image decodes off.
 * Chromium keeps one `--disable-features`, so this repeats Playwright 1.63's own list
 * (chromiumSwitches.ts) and adds to it, which is right whether the switch merges or replaces.
 */
const PLAYWRIGHT_DISABLED = [
  'AvoidUnnecessaryBeforeUnloadCheckSync',
  'DestroyProfileOnBrowserClose',
  'DialMediaRouteProvider',
  'GlobalMediaControls',
  'HttpsUpgrades',
  'LensOverlay',
  'MediaRouter',
  'PaintHolding',
  'ThirdPartyStoragePartitioning',
  'BlockOriginHeaderModificationOnRedirect',
  'Translate',
  'AutoDeElevate',
  'OptimizationHints',
  'msForceBrowserSignIn',
  'msEdgeUpdateLaunchServicesPreferredVersion',
];
test.use({ launchOptions: { args: [`--disable-features=${[...PLAYWRIGHT_DISABLED, 'SpeculativeImageDecodes'].join(',')}`] } });
repeatTeamsSweep('no-spec-decode', { repeats: 20 });
