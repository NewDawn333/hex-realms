'use strict';

// ---- Game rule constants (synthesized from Gemini Hex + HexStrategyGame2) ----
const RULES = {
  MOVE_RANGE: 4,

  // Cumulative purchase cost for unit levels 1..4
  UNIT_COST: [0, 3, 8, 18, 33],
  // Per-turn upkeep for unit levels 1..4
  UNIT_UPKEEP: [0, 2, 5, 12, 25],

  COST_TOWN: 5,
  COST_CITY_UPGRADE: 10,
  COST_TOWER: 15,
  COST_TOWER_UPGRADE: 10,
  TOWER_UPKEEP: [0, 5, 15],

  // Income by hex kind (a hex with a tree produces 0)
  INCOME: { plain: 1, town: 3, city: 6, capital: 5, tower: 0 },

  // Static defense by hex kind (towers use TOWER_DEF by level).
  // Capture needs unit level >= defense + 1 (Champion lv4 breaks bastions).
  // Towns/cities: lv2 | Capitals & watchtowers: lv3 | Bastions: lv4
  DEF: { plain: 0, town: 1, city: 1, capital: 2 },
  TOWER_DEF: [0, 2, 3],

  TREE_CHOP_GOLD: 3,
  TREE_SPREAD_CHANCE: 0.06,   // per tree per round
  TREE_SPAWN_CHANCE: 0.002,   // per empty neutral hex per round
  TREE_MAX_FRACTION: 0.22,    // max fraction of land covered by trees

  START_MONEY: { easy: 18, normal: 12, hard: 8 },
};

const UNIT_NAMES = ['', 'Militia', 'Spearman', 'Knight', 'Champion'];

const PLAYER_COLORS = [
  { main: '#3f8fd2', light: '#6fb3e8', dark: '#2a6ca6', name: 'Blue' },
  { main: '#d25347', light: '#e8867c', dark: '#a83a30', name: 'Red' },
  { main: '#53a85e', light: '#82c98b', dark: '#3a7d44', name: 'Green' },
  { main: '#d2a33f', light: '#e8c477', dark: '#a87f2a', name: 'Gold' },
  { main: '#9268c9', light: '#b494de', dark: '#6f4aa3', name: 'Purple' },
  { main: '#d2699f', light: '#e895bf', dark: '#a84a7b', name: 'Pink' },
  { main: '#4aabb8', light: '#7eced8', dark: '#358792', name: 'Teal' },
  { main: '#c97a4a', light: '#e0a078', dark: '#9a5c32', name: 'Orange' },
];

const NEUTRAL_COLOR = { main: '#b9b29b', light: '#cdc7b4', dark: '#9a937d' };
const MOUNTAIN_COLOR = { main: '#7d756e', light: '#958d84', dark: '#5d564f' };
const STRAIT_COLOR = { main: '#2e6088', light: '#3d7aa8', dark: '#224a6a' };

const MAP_SIZES = {
  small:    { land: 150, radius: 12, mountains: 110 },
  medium:   { land: 280, radius: 16, mountains: 75 },
  large:    { land: 450, radius: 21, mountains: 55 },
  huge:     { land: 650, radius: 26, mountains: 42 },
  gigantic: { land: 950, radius: 32, mountains: 32 },
};
