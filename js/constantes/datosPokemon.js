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
    POKEMON_TOTAL,
    GEN_RANGES,
    TYPE_TRANSLATIONS,
    normalizeSearchText,
    getCombinedTypeSearchString
  };
}
