// Cosmetic catalog shared by the TV and the phones.
// `locked` is a placeholder for future unlockables.
export const COLORS = [
  '#ff4d6d', '#ff9f1c', '#ffd60a', '#7bd389', '#2ec4b6', '#4cc9f0',
  '#4361ee', '#9b5de5', '#f15bb5', '#f4f1de', '#a47148', '#3d405b',
];

export const HATS = [
  { id: 'none', name: 'No hat', emoji: '🚫' },
  { id: 'party', name: 'Party hat', emoji: '🎉' },
  { id: 'tophat', name: 'Top hat', emoji: '🎩' },
  { id: 'crown', name: 'Crown', emoji: '👑' },
  { id: 'propeller', name: 'Propeller', emoji: '🌀' },
  { id: 'bow', name: 'Bow', emoji: '🎀' },
];

export const hatById = (id) => HATS.find((h) => h.id === id) || HATS[0];
