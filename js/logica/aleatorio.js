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
 * Calcula los 30 IDs deterministas para una semilla y conjunto de generaciones dados
 * @param {string} seed
 * @param {number[]|Set<number>} gensArray
 * @returns {number[]} Array con exactamente 30 IDs de Pokémon
 */
function computeBoardIds(seed, gensArray) {
  const pool = [];
  const sortedGens = [...gensArray].sort((a, b) => a - b);

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
