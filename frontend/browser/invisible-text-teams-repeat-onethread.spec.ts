import { repeatTeamsSweep } from './support/teams-repeat';
import { test } from './support/test';

// DIAGNOSTIC ONLY — not for merge. Software raster on a single raster worker.
test.use({ launchOptions: { args: ['--num-raster-threads=1'] } });
repeatTeamsSweep('one-raster-thread', { repeats: 15 });
