import { repeatTeamsSweep } from './support/teams-repeat';
import { test } from './support/test';

// DIAGNOSTIC ONLY — not for merge. No BeginMainFrame while a pending tree waits to activate.
test.use({ launchOptions: { args: ['--disable-main-frame-before-activation'] } });
repeatTeamsSweep('no-mfba', { repeats: 15 });
