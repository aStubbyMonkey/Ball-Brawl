// THE GAME LIST. To add a mini-game: copy _template.js, then import it and add it here.
// To remove one, delete its line. Order = order shown in the picker.
import lobby from './lobby.js';
import bumpArena from './bumpArena.js';
import lastBallRolling from './lastBallRolling.js';
import towerDrop from './towerDrop.js';
import ballRace from './ballRace.js';
import gemGrab from './gemGrab.js';
import miniGolf from './miniGolf.js';

export const LOBBY = lobby;

export const GAMES = [
  bumpArena,
  lastBallRolling,
  towerDrop,
  ballRace,
  gemGrab,
  miniGolf,
];

export const gameById = (id) => GAMES.find((g) => g.id === id);
