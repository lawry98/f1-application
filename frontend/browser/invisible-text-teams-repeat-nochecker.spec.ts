import { repeatTeamsSweep } from './support/teams-repeat';
import { test } from './support/test';

// DIAGNOSTIC ONLY — not for merge. No checker-imaging of `decoding="async"` images.
test.use({ launchOptions: { args: ['--disable-checker-imaging'] } });
repeatTeamsSweep('no-checker', { repeats: 15 });
