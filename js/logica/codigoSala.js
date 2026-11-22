/**
 * Generación, Construcción y Validación de Códigos de Sala
 * Formato estándar: [SEMILLA 6 CARACTERES]-[GENERACIONES][-NT opcional]
 */

/**
 * Genera una semilla aleatoria de 6 caracteres sin caracteres ambiguos
 * @param {number} length
 * @returns {string}
 */
function generateRandomSeed(length = 6) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += SEED_CHARS.charAt(Math.floor(Math.random() * SEED_CHARS.length));
  }
  return result;
}

/**
 * Construye el código de sala según la especificación: [SEMILLA]-[GENERACIONES][-NT][-NG][-GS][-SN][-INI][-LEG]
 * @param {string} seed
 * @param {Set<number>|number[]} gensSet
 * @param {boolean} showTypes
 * @param {boolean} [showGens=true]
 * @param {boolean} [grayscale=false]
 * @param {boolean} [proMode=false]
 * @param {string} [gameMode="standard"]
 * @returns {string}
 */
function buildRoomCode(seed, gensSet, showTypes = true, showGens = true, grayscale = false, proMode = false, gameMode = "standard") {
  if (proMode) {
    showTypes = false;
    showGens = false;
    grayscale = false;
  }

  const gensSortedStr = Array.from(gensSet).sort((a, b) => a - b).join("");
  let code = `${seed.toUpperCase()}-${gensSortedStr}`;
  if (!showTypes) code += "-NT";
  if (!showGens) code += "-NG";
  if (grayscale) code += "-GS";
  if (proMode) code += "-SN";
  if (gameMode === "starters" || gameMode === "iniciales") code += "-INI";
  if (gameMode === "legendaries" || gameMode === "legendarios") code += "-LEG";
  return code;
}

/**
 * Parsea y valida exhaustivamente un código de sala
 * @param {string} rawCode
 * @returns {{ valid: boolean, error?: string, code?: string, seed?: string, gens?: number[], showTypes?: boolean, showGens?: boolean, grayscale?: boolean, proMode?: boolean }}
 */
function parseRoomCode(rawCode) {
  if (!rawCode || typeof rawCode !== "string") {
    return { valid: false, error: "Código vacío" };
  }

  const clean = rawCode.trim().toUpperCase();
  const regex = /^([A-Z2-9]{6})-([1-9]{1,9})((?:-[A-Z0-9]+)*)$/;
  const match = clean.match(regex);

  if (!match) {
    return {
      valid: false,
      error: "Formato de código inválido. Debe ser como 'X7K9P2-123' o 'M4R8T2-19-NT'."
    };
  }

  const seed = match[1];
  const gensStr = match[2];
  const flagsStr = match[3] || "";
  const flags = flagsStr.split("-").filter(Boolean);

  const validFlags = new Set(["NT", "NG", "GS", "NN", "SN", "PRO", "INI", "LEG"]);
  for (const f of flags) {
    if (!validFlags.has(f)) {
      return { valid: false, error: "Modificador de sala desconocido en el código." };
    }
  }

  const noTypes = flags.includes("NT");
  const noGens = flags.includes("NG");
  const grayscale = flags.includes("GS") || flags.includes("NN");
  const proMode = flags.includes("SN") || flags.includes("PRO");

  let gameMode = "standard";
  if (flags.includes("INI")) gameMode = "starters";
  if (flags.includes("LEG")) gameMode = "legendaries";

  const gens = [];
  const seenGens = new Set();
  for (const char of gensStr) {
    const num = parseInt(char, 10);
    if (num >= 1 && num <= 9 && !seenGens.has(num)) {
      gens.push(num);
      seenGens.add(num);
    }
  }

  if (gens.length === 0) {
    return { valid: false, error: "El código no incluye ninguna generación válida (1-9)." };
  }

  return {
    valid: true,
    code: clean,
    seed,
    gens: gens.sort((a, b) => a - b),
    showTypes: !noTypes,
    showGens: !noGens,
    grayscale: grayscale,
    proMode: proMode,
    gameMode: gameMode
  };
}
