// Cosmetic catalog shared by the TV and the phones.
// To add an item: add an entry here, then a builder with the same id in parts.js
// (hats / eyes / outfits) or skins.js (ball patterns). `locked` is reserved for unlockables.

export const COLORS = [
  '#ff4d6d', '#ff9f1c', '#ffd60a', '#7bd389', '#2ec4b6', '#4cc9f0', '#4361ee', '#9b5de5',
  '#f15bb5', '#ff8fab', '#f4f1de', '#a47148', '#3d405b', '#06d6a0', '#ef476f', '#c77dff',
];

export const HATS = [
  { id: 'none', name: 'No hat' },
  { id: 'party', name: 'Party hat' },
  { id: 'tophat', name: 'Top hat' },
  { id: 'crown', name: 'Crown' },
  { id: 'propeller', name: 'Propeller cap' },
  { id: 'cowboy', name: 'Cowboy hat' },
  { id: 'beanie', name: 'Beanie' },
  { id: 'cap', name: 'Ball cap' },
  { id: 'viking', name: 'Viking helmet' },
  { id: 'chef', name: 'Chef hat' },
  { id: 'wizard', name: 'Wizard hat' },
  { id: 'pirate', name: 'Pirate hat' },
  { id: 'halo', name: 'Halo' },
  { id: 'headphones', name: 'Headphones' },
  { id: 'antennae', name: 'Alien antennae' },
  { id: 'catears', name: 'Cat ears' },
  { id: 'unicorn', name: 'Unicorn horn' },
  { id: 'mohawk', name: 'Mohawk' },
  { id: 'cone', name: 'Traffic cone' },
  { id: 'flower', name: 'Daisy' },
  { id: 'sprout', name: 'Sprout' },
  { id: 'bow', name: 'Bow' },
];

export const EYES = [
  { id: 'googly', name: 'Googly' },
  { id: 'happy', name: 'Happy' },
  { id: 'angry', name: 'Grumpy' },
  { id: 'sleepy', name: 'Sleepy' },
  { id: 'derp', name: 'Derp' },
  { id: 'lashes', name: 'Lashes' },
  { id: 'sparkle', name: 'Sparkly' },
  { id: 'dizzy', name: 'Dizzy' },
  { id: 'cyclops', name: 'Cyclops' },
  { id: 'shades', name: 'Sunglasses' },
  { id: 'hearts', name: 'Heart shades' },
  { id: 'stars', name: 'Star shades' },
  { id: 'nerd', name: 'Big glasses' },
  { id: 'monocle', name: 'Monocle' },
  { id: 'visor', name: 'Cyber visor' },
  { id: 'patch', name: 'Eye patch' },
];

export const OUTFITS = [
  { id: 'none', name: 'Nothing' },
  { id: 'bowtie', name: 'Bow tie' },
  { id: 'suit', name: 'Business suit' },
  { id: 'tux', name: 'Tuxedo' },
  { id: 'overalls', name: 'Overalls' },
  { id: 'scarf', name: 'Scarf' },
  { id: 'cape', name: 'Cape' },
  { id: 'hero', name: 'Superhero' },
  { id: 'floatie', name: 'Swim ring' },
  { id: 'tutu', name: 'Tutu' },
  { id: 'chain', name: 'Gold chain' },
  { id: 'lei', name: 'Flower lei' },
  { id: 'sash', name: 'Champion sash' },
  { id: 'bandana', name: 'Bandana' },
  { id: 'backpack', name: 'Backpack' },
];

export const SKINS = [
  { id: 'dots', name: 'Polka dots' },
  { id: 'plain', name: 'Plain' },
  { id: 'stripes', name: 'Stripes' },
  { id: 'candy', name: 'Candy swirl' },
  { id: 'beach', name: 'Beach ball' },
  { id: 'eight', name: 'Eight ball' },
  { id: 'checker', name: 'Checkers' },
  { id: 'zigzag', name: 'Zigzag' },
  { id: 'stars', name: 'Stars' },
  { id: 'hearts', name: 'Hearts' },
  { id: 'spots', name: 'Spotty' },
  { id: 'camo', name: 'Camo' },
  { id: 'galaxy', name: 'Galaxy' },
];

export const CATALOG = { hat: HATS, eyes: EYES, outfit: OUTFITS, skin: SKINS };
export const DEFAULT_LOOK = { hat: 'party', eyes: 'googly', outfit: 'none', skin: 'dots' };

/** Returns `id` if it's a real item of that kind, else the default. */
export function validItem(kind, id) {
  const list = CATALOG[kind];
  return list.some((x) => x.id === id && !x.locked) ? id : (kind === 'hat' ? 'none' : DEFAULT_LOOK[kind]);
}
export const itemName = (kind, id) => (CATALOG[kind].find((x) => x.id === id) || CATALOG[kind][0]).name;
