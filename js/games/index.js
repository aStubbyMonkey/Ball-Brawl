// THE GAME LIST. To add a mini-game: copy _template.js, then import it and add it here.
// To remove one, delete its line. Order = order shown in the picker.
import lobby from './lobby.js';
import bumpArena from './bumpArena.js';
import lastBallRolling from './lastBallRolling.js';

export const LOBBY = lobby;

export const GAMES = [
  bumpArena,
  lastBallRolling,
  // ballRace,      // TODO: drifty obstacle course
  // collectAThon,  // TODO: grab glowing orbs
];

export const gameById = (id) => GAMES.find((g) => g.id === id);
