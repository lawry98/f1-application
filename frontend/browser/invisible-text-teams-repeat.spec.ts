import { repeatTeamsSweep } from './support/teams-repeat';

// DIAGNOSTIC ONLY — not for merge. Control, and the sweep's scrollTo moved out of the rAF callback.
repeatTeamsSweep('control');
repeatTeamsSweep('scroll-in-task', { scrollInTask: true });
