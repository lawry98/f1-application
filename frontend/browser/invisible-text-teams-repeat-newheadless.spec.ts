import { repeatTeamsSweep } from './support/teams-repeat';
import { test } from './support/test';

// DIAGNOSTIC ONLY — not for merge. Full Chromium in new headless mode instead of headless shell.
test.use({ channel: 'chromium' });
repeatTeamsSweep('new-headless', { repeats: 15 });
