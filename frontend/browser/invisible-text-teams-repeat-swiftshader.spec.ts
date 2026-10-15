import { repeatTeamsSweep } from './support/teams-repeat';
import { test } from './support/test';

// DIAGNOSTIC ONLY — not for merge. GPU compositing and raster on SwiftShader, off the software tile path.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } });
repeatTeamsSweep('swiftshader', { repeats: 20 });
