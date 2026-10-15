import { repeatTeamsSweep } from './support/teams-repeat';
import { test } from './support/test';

// DIAGNOSTIC ONLY — not for merge. As the control, without Playwright's trace (and so its screencast).
test.use({ trace: 'off' });
repeatTeamsSweep('pw-trace-off');
