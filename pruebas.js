/**
 * Test Suite de Lógica Pura (Node.js)
 * Ejecutar con: npm test  (o node test_modular.js)
 */

import fs from 'node:fs';
import vm from 'node:vm';

const context = {
  console,
  setTimeout,
  clearTimeout,
  Math,
  JSON,
  Set,
  Array,
  parseInt,
  Boolean,
  crypto: globalThis.crypto,
  TextEncoder: globalThis.TextEncoder,
  Uint8Array: globalThis.Uint8Array
};

vm.createContext(context);

const filesToLoad = [
  './js/constantes/datosPokemon.js',
  './js/logica/aleatorio.js',
  './js/logica/codigoSala.js',
  './js/logica/seguridadAntiTrampas.js',
  './js/servicios/apiPokemon.js'
];

for (const file of filesToLoad) {
  const code = fs.readFileSync(file, 'utf-8');
  vm.runInContext(code, context);
}

const { computeBoardIds, buildRoomCode, parseRoomCode, formatPokemonName, getGenForPokemonId, seguridadAntiTrampas, normalizeSearchText, getCombinedTypeSearchString } = context;

const results = [];

function assert(condition, testName) {
  if (condition) {
    results.push({ name: testName, pass: true });
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    results.push({ name: testName, pass: false });
    console.error(`  ❌ [FAIL] ${testName}`);
  }
}

console.log("\n==============================================");
console.log(" 🧪 INICIANDO TEST SUITE MODULAR (POKÉQUIÉN) ");
console.log("==============================================\n");

// 1. Tests de Determinismo (PRNG + Fisher-Yates)
console.log("📦 1. Módulo Core / PRNG Determinista:");
const run1 = computeBoardIds("PRUEBA", [1, 2, 3]);
const run2 = computeBoardIds("PRUEBA", [1, 2, 3]);
assert(run1.length === 30, "computeBoardIds retorna exactamente 30 Pokémon");
assert(JSON.stringify(run1) === JSON.stringify(run2), "computeBoardIds es 100% determinista para la misma semilla y generaciones");

const run3 = computeBoardIds("OTRAAA", [1, 2, 3]);
assert(JSON.stringify(run1) !== JSON.stringify(run3), "Semillas distintas producen tableros distintos");

const gen2to4 = computeBoardIds("TEST24", [2, 3, 4]);
const allInRange = gen2to4.every(id => id >= 152 && id <= 493);
assert(allInRange, "Gen 2 a 4 solo genera IDs entre 152 y 493");

// 2. Tests de Código de Sala
console.log("\n📦 2. Módulo Core / Códigos de Sala:");
const code1 = buildRoomCode("X7K9P2", new Set([1, 2, 3]), true);
assert(code1 === "X7K9P2-123", "buildRoomCode con tipos genera 'X7K9P2-123'");

const code2 = buildRoomCode("M4R8T2", new Set([9, 1]), false);
assert(code2 === "M4R8T2-19-NT", "buildRoomCode sin tipos y ordenado genera 'M4R8T2-19-NT'");

const parsed1 = parseRoomCode("X7K9P2-123");
assert(
  parsed1.valid === true &&
    parsed1.seed === "X7K9P2" &&
    JSON.stringify(parsed1.gens) === "[1,2,3]" &&
    parsed1.showTypes === true,
  "parseRoomCode decodifica correctamente 'X7K9P2-123'"
);

const parsed2 = parseRoomCode("M4R8T2-19-NT");
assert(
  parsed2.valid === true &&
    parsed2.seed === "M4R8T2" &&
    JSON.stringify(parsed2.gens) === "[1,9]" &&
    parsed2.showTypes === false,
  "parseRoomCode decodifica 'M4R8T2-19-NT' sin tipos"
);

const code3 = buildRoomCode("P6K2W8", new Set([1, 2]), true, false, true);
assert(code3 === "P6K2W8-12-NG-GS", "buildRoomCode con opciones -NG y -GS genera 'P6K2W8-12-NG-GS'");

const parsed3 = parseRoomCode("P6K2W8-12-NG-GS");
assert(
  parsed3.valid === true &&
    parsed3.seed === "P6K2W8" &&
    JSON.stringify(parsed3.gens) === "[1,2]" &&
    parsed3.showTypes === true &&
    parsed3.showGens === false &&
    parsed3.grayscale === true,
  "parseRoomCode decodifica opciones de generación y escala de grises (modo reto)"
);

const codePro = buildRoomCode("PRO982", new Set([1]), false, false, false, true);
assert(codePro === "PRO982-1-NT-NG-SN", "buildRoomCode con Modo Pro (Solo Nombre) genera 'PRO982-1-NT-NG-SN'");

const parsedPro = parseRoomCode("PRO982-1-NT-NG-SN");
assert(
  parsedPro.valid === true &&
    parsedPro.proMode === true &&
    parsedPro.showTypes === false &&
    parsedPro.showGens === false,
  "parseRoomCode decodifica Modo Pro: Solo Nombre (sin datos de tipo ni gen)"
);

const parsedInvalid = parseRoomCode("CODIGO_INVALIDO");
assert(parsedInvalid.valid === false, "parseRoomCode rechaza códigos inválidos");

// 3. Tests de Formato de Nombres Especiales
console.log("\n📦 3. Módulo Services / Formateo de Nombres:");
assert(formatPokemonName("mr-mime") === "Mr. Mime", "formatPokemonName maneja 'mr-mime'");
assert(formatPokemonName("ho-oh") === "Ho-Oh", "formatPokemonName maneja 'ho-oh'");
assert(formatPokemonName("pikachu") === "Pikachu", "formatPokemonName capitaliza nombres estándar");
assert(getGenForPokemonId(25) === "GEN I", "getGenForPokemonId identifica Pikachu como GEN I");
assert(getGenForPokemonId(252) === "GEN III", "getGenForPokemonId identifica Treecko como GEN III");
assert(normalizeSearchText("ELÉCTRICO") === "electrico", "normalizeSearchText remueve tildes y pasa a minúsculas");
assert(normalizeSearchText("Psíquico") === "psiquico", "normalizeSearchText maneja 'Psíquico' correctamente");

const typesCharizard = getCombinedTypeSearchString(["fire", "flying"]);
const cleanCharizardTypes = normalizeSearchText(typesCharizard);
assert(cleanCharizardTypes.includes("fuego") && cleanCharizardTypes.includes("volador"), "getCombinedTypeSearchString incluye tipos en español");
assert(cleanCharizardTypes.includes("fire") && cleanCharizardTypes.includes("flying"), "getCombinedTypeSearchString incluye tipos en inglés");

// 4. Tests de Seguridad Anti-Trampas (Criptografía SHA-256)
console.log("\n📦 4. Módulo Seguridad Anti-Trampas (Compromiso Criptográfico):");
const salt1 = seguridadAntiTrampas.generarSalt();
assert(typeof salt1 === "string" && salt1.length === 32, "generarSalt genera un salt hexadecimal de 32 caracteres");

const hashPikachu1 = await seguridadAntiTrampas.calcularHashPokemon(25, salt1, "SALA01");
const hashPikachu2 = await seguridadAntiTrampas.calcularHashPokemon(25, salt1, "SALA01");
assert(hashPikachu1 === hashPikachu2 && hashPikachu1.length === 64, "calcularHashPokemon es determinista y genera un SHA-256 de 64 caracteres");

const hashCharizard = await seguridadAntiTrampas.calcularHashPokemon(6, salt1, "SALA01");
assert(hashPikachu1 !== hashCharizard, "Pokémon distintos generan hashes completamente diferentes");

const verificacionValida = await seguridadAntiTrampas.verificarHashPokemon(25, salt1, "SALA01", hashPikachu1);
assert(verificacionValida === true, "verificarHashPokemon valida exitosamente un Pokémon y salt legítimos");

const intentoTrampa = await seguridadAntiTrampas.verificarHashPokemon(6, salt1, "SALA01", hashPikachu1);
assert(intentoTrampa === false, "verificarHashPokemon DETECTA TRAMPA si el Pokémon fue cambiado a otro ID");

// Blindaje de memoria y regla de cambio condicional
const mockState = {
  isPlayerReady: false,
  isRivalReady: false,
  isGameStarted: false,
  secretPokemon: { id: 25, name: "Pikachu" }
};
seguridadAntiTrampas.blindarEstadoJuego(mockState);
mockState.secretPokemon = { id: 1, name: "Bulbasaur" };
assert(mockState.secretPokemon.id === 1, "Permite cambiar Pokémon antes de pulsar listo");

mockState.isPlayerReady = true;
mockState.isRivalReady = false; // El rival aún no está listo
mockState.secretPokemon = { id: 4, name: "Charmander" };
assert(mockState.secretPokemon.id === 4, "Permite cambiar Pokémon si el usuario dio listo pero el rival aún no");

mockState.isRivalReady = true; // El rival ya está listo también
mockState.isGameStarted = true;
mockState.secretPokemon = { id: 150, name: "Mewtwo" }; // Intento de cambio bloqueado
assert(mockState.secretPokemon.id === 4, "Bloquea cambio de Pokémon una vez que ambos jugadores están listos");

// Resumen final
const passedCount = results.filter(r => r.pass).length;
console.log("\n==============================================");
console.log(` 📊 Total: ${results.length} | Aprobados: ${passedCount} | Fallidos: ${results.length - passedCount}`);
if (passedCount === results.length) {
  console.log(" 🎉 ¡TODOS LOS TESTS MODULARES PASARON EXITOSAMENTE!");
} else {
  console.error(" ⚠️ ALGUNOS TESTS HAN FALLADO.");
  process.exit(1);
}
console.log("==============================================\n");
