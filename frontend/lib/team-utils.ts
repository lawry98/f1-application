import { type Team } from '@/data/teams-data';

/** Returns inline style + extra className for a team-color-filled CTA button. */
export function teamColorButtonStyle(team: Team) {
  const isWhite = team.color === '#ffffff';
  return {
    style: {
      backgroundColor: isWhite ? '#27272a' : team.color,
      color: isWhite ? '#ffffff' : team.textOnColor === 'black' ? '#000000' : '#ffffff',
      borderColor: isWhite ? '#52525b' : 'transparent',
    },
    className: isWhite ? 'border' : '',
  };
}
