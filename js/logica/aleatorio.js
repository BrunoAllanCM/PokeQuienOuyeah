/**
 * Generador Pseudoaleatorio Determinista (PRNG) y Algoritmo de Barajado
 * 100% Determinista (FNV-1a + Mulberry32 + Fisher-Yates)
 */

/**
 * Hash de 32 bits FNV-1a para convertir una semilla alfanumérica en un entero de 32 bits
 * @param {string} str
 * @returns {number}
 */
function fnv1a(str) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * PRNG Mulberry32: Generador pseudoaleatorio determinista de 32 bits
 * @param {number} seed
 * @returns {() => number} Función que retorna un número entre [0, 1)
 */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Barajado Fisher-Yates determinista sobre una copia del array
 * @param {Array} array
 * @param {() => number} randomFn
 * @returns {Array} Nueva copia del array barajado
 */
function seededShuffle(array, randomFn) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

/**
 * Calcula los IDs deterministas para una semilla, conjunto de generaciones y modo de juego dados
 * @param {string} seed
 * @param {number[]|Set<number>} gensArray
 * @param {string} [gameMode="standard"] "standard", "starters" o "legendaries"
 * @returns {number[]} Array con los IDs de Pokémon para el tablero
 */
function computeBoardIds(seed, gensArray, gameMode = "standard") {
  // Arma el pool de IDs según el modo de juego
  let pool = [];
  const sortedGens = [...gensArray].sort((a, b) => a - b);

  if (gameMode === "starters" || gameMode === "iniciales") {
    // Modo Solo Iniciales: Las formas base de los iniciales según las generaciones seleccionadas
    const baseStarters = typeof STARTER_POKEMON_IDS !== "undefined"
      ? STARTER_POKEMON_IDS
      : [1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501, 650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912];

    pool = baseStarters.filter(id => {
      if (sortedGens.length === 0 || sortedGens.length === 9) return true;
      const genNum = typeof getGenNumberForId === "function" ? getGenNumberForId(id) : 1;
      return sortedGens.includes(genNum);
    });

    // Baraja el pool con la semilla (misma semilla, mismo resultado)
    const seedHash = fnv1a(seed);
    const prng = mulberry32(seedHash);
    const shuffled = seededShuffle(pool, prng);
    return shuffled;
  }

  if (gameMode === "legendaries" || gameMode === "legendarios") {
    // Modo Solo Legendarios: Pool filtrado estrictamente por las generaciones seleccionadas
    if (typeof LEGENDARY_POKEMON_IDS !== "undefined") {
      pool = LEGENDARY_POKEMON_IDS.filter(id => {
        if (sortedGens.length === 0 || sortedGens.length === 9) return true;
        const genNum = typeof getGenNumberForId === "function" ? getGenNumberForId(id) : 1;
        return sortedGens.includes(genNum);
      });
    }
    const seedHash = fnv1a(seed);
    const prng = mulberry32(seedHash);
    const shuffled = seededShuffle(pool, prng);
    return shuffled.slice(0, 30);
  }

  // Modo Estándar
  // Agrega todos los IDs de cada generación elegida
  for (const genId of sortedGens) {
    const genDef = GENERATIONS.find(g => g.id === genId);
    if (genDef) {
      for (let id = genDef.start; id <= genDef.end; id++) {
        pool.push(id);
      }
    }
  }

  const seedHash = fnv1a(seed);
  const prng = mulberry32(seedHash);
  const shuffled = seededShuffle(pool, prng);
  return shuffled.slice(0, 30);
}

/**
 * Determina qué Pokémon del tablero es Shiny (MÁXIMO 1 POR TABLERO para que sea especial).
 * Usa la semilla de la sala para que ambos jugadores vean exactamente al mismo Shiny.
 * @param {string} seed Semilla o código de la sala
 * @param {number[]} boardPokemonIds Array con los IDs de Pokémon del tablero
 * @param {number} [odds] Probabilidad opcional (por defecto usa PROBABILIDAD_SHINY)
 * @returns {number|null} ID del Pokémon que es shiny en este tablero, o null si ninguno lo es
 */
function getBoardShinyPokemonId(seed, boardPokemonIds, odds) {
  const currentOdds = typeof odds === "number"
    ? odds
    : (typeof window !== "undefined" && typeof window.PROBABILIDAD_SHINY === "number"
        ? window.PROBABILIDAD_SHINY
        : (typeof PROBABILIDAD_SHINY === "number" ? PROBABILIDAD_SHINY : 1 / 8));

  if (!currentOdds || currentOdds <= 0 || !boardPokemonIds || boardPokemonIds.length === 0) {
    return null;
  }

  // PRNG determinista basado en la semilla de la sala
  const seedHash = fnv1a(`${seed || "DEFAULT"}_board_shiny`);
  const prng = mulberry32(seedHash);

  // Tirada de probabilidad: ¿este tablero tiene la fortuna de tener un shiny?
  if (currentOdds < 1 && prng() >= currentOdds) {
    return null;
  }

  // Si tiene shiny, se elige exactamente a UNO de los Pokémon del tablero
  const shinyIndex = Math.floor(prng() * boardPokemonIds.length);
  return boardPokemonIds[shinyIndex];
}

/**
 * Función de compatibilidad para verificar si un ID de Pokémon específico es el shiny del tablero
 * @param {string} seed Semilla de la sala
 * @param {number} pokemonId ID del Pokémon a verificar
 * @param {number} [odds] Probabilidad
 * @returns {boolean}
 */
function isPokemonShiny(seed, pokemonId, odds) {
  if (typeof odds === "number" && odds <= 0) return false;
  if (typeof odds === "number" && odds >= 1) return true;
  const shinyId = getBoardShinyPokemonId(seed, [pokemonId], odds);
  return shinyId === pokemonId;
}
