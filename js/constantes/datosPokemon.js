/**
 * Constantes y Datos Estáticos de Pokémon
 */

const GENERATIONS = [
  { id: 1, name: "Kanto", start: 1, end: 151, count: 151, roman: "GEN I" },
  { id: 2, name: "Johto", start: 152, end: 251, count: 100, roman: "GEN II" },
  { id: 3, name: "Hoenn", start: 252, end: 386, count: 135, roman: "GEN III" },
  { id: 4, name: "Sinnoh", start: 387, end: 493, count: 107, roman: "GEN IV" },
  { id: 5, name: "Teselia", start: 494, end: 649, count: 156, roman: "GEN V" },
  { id: 6, name: "Kalos", start: 650, end: 721, count: 72, roman: "GEN VI" },
  { id: 7, name: "Alola", start: 722, end: 809, count: 88, roman: "GEN VII" },
  { id: 8, name: "Galar / Hisui", start: 810, end: 905, count: 96, roman: "GEN VIII" },
  { id: 9, name: "Paldea", start: 906, end: 1025, count: 120, roman: "GEN IX" }
];

/**
 * Obtiene el número romano de la generación correspondiente a un ID de Pokémon
 * @param {number} id
 * @returns {string}
 */
function getGenForPokemonId(id) {
  const gen = GENERATIONS.find(g => id >= g.start && id <= g.end);
  return gen ? gen.roman : "";
}

/**
 * Obtiene el número de generación (1 a 9) correspondiente a un ID de Pokémon
 * @param {number} id
 * @returns {number}
 */
function getGenNumberForId(id) {
  const gen = GENERATIONS.find(g => id >= g.start && id <= g.end);
  return gen ? gen.id : 1;
}

/**
 * Los 27 Pokémon Iniciales (Forma base / primera fase) de Gen 1 a Gen 9
 */
var STARTER_POKEMON_IDS = [
  // Gen 1: Kanto
  1, 4, 7,
  // Gen 2: Johto
  152, 155, 158,
  // Gen 3: Hoenn
  252, 255, 258,
  // Gen 4: Sinnoh
  387, 390, 393,
  // Gen 5: Teselia
  495, 498, 501,
  // Gen 6: Kalos
  650, 653, 656,
  // Gen 7: Alola
  722, 725, 728,
  // Gen 8: Galar
  810, 813, 816,
  // Gen 9: Paldea
  906, 909, 912
];

/**
 * Pool de Pokémon Legendarios y Singulares de Gen 1 a Gen 9
 */
var LEGENDARY_POKEMON_IDS = [
  // Gen 1 (Kanto)
  144, 145, 146, 150, 151,
  // Gen 2 (Johto)
  243, 244, 245, 249, 250, 251,
  // Gen 3 (Hoenn)
  377, 378, 379, 380, 381, 382, 383, 384, 385, 386,
  // Gen 4 (Sinnoh)
  480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493,
  // Gen 5 (Teselia)
  494, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649,
  // Gen 6 (Kalos)
  716, 717, 718, 719, 720, 721,
  // Gen 7 (Alola)
  772, 773, 785, 786, 787, 788, 789, 790, 791, 792, 793, 794, 795, 796, 797, 798, 799, 800, 801, 802, 803, 804, 805, 806, 807, 808, 809,
  // Gen 8 (Galar / Hisui)
  888, 889, 890, 891, 892, 893, 894, 895, 896, 897, 898, 905,
  // Gen 9 (Paldea) - Sin versiones paradoja (Walking Wake, Gouging Fire, Raging Bolt, Iron Leaves, Iron Boulder, Iron Crown excluidas)
  1001, 1002, 1003, 1004, 1007, 1008, 1014, 1015, 1016, 1017, 1024, 1025
];

const SEED_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const TYPE_TRANSLATIONS = {
  normal: "Normal",
  fire: "Fuego",
  water: "Agua",
  grass: "Planta",
  electric: "Eléctrico",
  ice: "Hielo",
  fighting: "Lucha",
  poison: "Veneno",
  ground: "Tierra",
  flying: "Volador",
  psychic: "Psíquico",
  bug: "Bicho",
  rock: "Roca",
  ghost: "Fantasma",
  dragon: "Dragón",
  steel: "Acero",
  fairy: "Hada",
  dark: "Siniestro"
};

/**
 * Normaliza un texto para búsquedas (pasa a minúsculas y remueve acentos/diacríticos)
 * @param {string} str
 * @returns {string}
 */
function normalizeSearchText(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Combina los nombres de tipos en inglés y español para facilitar búsquedas bilingües
 * @param {string[]} types
 * @returns {string}
 */
function getCombinedTypeSearchString(types) {
  const english = (types || []).map(t => String(t).toLowerCase().trim());
  const spanish = english.map(t => (TYPE_TRANSLATIONS[t] || "").toLowerCase().trim());
  return [...new Set([...english, ...spanish])].filter(Boolean).join(" ");
}

// Compatibilidad Node.js / Browser
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GENERATIONS,
    POKEMON_TOTAL: 1025,
    TYPE_TRANSLATIONS,
    STARTER_POKEMON_IDS,
    LEGENDARY_POKEMON_IDS,
    getGenNumberForId,
    getGenForPokemonId,
    normalizeSearchText,
    getCombinedTypeSearchString
  };
}
