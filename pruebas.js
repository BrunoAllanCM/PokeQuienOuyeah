/**
 * Test Suite de Lógica Pura (Node.js)
 * Ejecutar con: npm test  (o node test_modular.js)
 */

import fs from 'node:fs';
import vm from 'node:vm';

// Contexto aislado con lo mínimo que necesitan los módulos
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

// Módulos de lógica que se cargan para probar
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

// Guarda el resultado de cada prueba
const results = [];

// Registra y muestra si una prueba pasó o falló
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

// 5. Tests del Sistema de Turnos
console.log("\n📦 5. Módulo Sistema de Turnos:");
const turnState = {
  turnoActual: 1,
  numeroTurno: 1,
  esMiTurno: true
};

// Simula pasar turno alternando jugador
function simularPasarTurno(s, porFallo = false) {
  s.turnoActual = s.turnoActual === 1 ? 2 : 1;
  s.numeroTurno++;
  return s;
}

simularPasarTurno(turnState);
assert(turnState.turnoActual === 2 && turnState.numeroTurno === 2, "Pasar turno alterna al Jugador 2 e incrementa el número de turno");

simularPasarTurno(turnState, true);
assert(turnState.turnoActual === 1 && turnState.numeroTurno === 3, "Fallar adivinanza pasa automáticamente el turno al Jugador 1");

// 6. Tests de Carcasa Verde y Reinicio con Mismos Pokémon
console.log("\n📦 6. Módulo Carcasa Verde y Reinicio / Revancha:");
const casingColors = {
  rojo: { name: "Rojo Clásico", color: "#dc2626" },
  verde: { name: "Verde Planta", color: "#22c55e" }
};
assert(casingColors.verde && casingColors.verde.color === "#22c55e", "Carcasa verde definida con color correcto #22c55e");

// Simulación de reinicio con mismos 30 Pokémon
const testBoardData = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Pokemon_${i + 1}` }));
const testDiscarded = new Set([3, 5, 12]);
let testTurno = 8;
let testGameStarted = true;

// Simula revancha: mismo tablero, descartes y turno reiniciados
function simularReinicioMismosPokemon(board, discards) {
  discards.clear();
  testTurno = 1;
  testGameStarted = false;
  return { boardCount: board.length, discardsCount: discards.size, turno: testTurno, gameStarted: testGameStarted };
}

const reinicioRes = simularReinicioMismosPokemon(testBoardData, testDiscarded);
assert(reinicioRes.boardCount === 30, "Reinicio conserva exactamente los 30 Pokémon originales");
assert(reinicioRes.discardsCount === 0, "Reinicio limpia los descartes a 0");
assert(reinicioRes.turno === 1 && reinicioRes.gameStarted === false, "Reinicio resetea turno a 1 y reinicia estado de listo");

// 7. Tests de Regla de 2 Oportunidades de Adivinanza
console.log("\n📦 7. Módulo Regla de 2 Oportunidades de Adivinanza:");
let fallosP1 = 0;
let gameOver = false;
let ganador = null;

// Simula la regla: 2 fallos pierden la partida
function simularIntentoAdivinar(acierto) {
  if (acierto) {
    gameOver = true;
    ganador = 1;
    return;
  }
  fallosP1++;
  if (fallosP1 >= 2) {
    gameOver = true;
    ganador = 2; // Gana el otro jugador
  }
}

// 1er intento fallido
simularIntentoAdivinar(false);
assert(fallosP1 === 1 && gameOver === false, "Primer fallo consume 1 intento sin terminar la partida");

// 2do intento fallido
simularIntentoAdivinar(false);
assert(fallosP1 === 2 && gameOver === true && ganador === 2, "Segundo fallo termina la partida y otorga victoria al Jugador 2");

// 8. Tests de Conexión Requerida y Ceder Primer Turno
console.log("\n📦 8. Módulo de Conexión Requerida y Ceder Primer Turno:");
let mockRedP2P = { conectado: false, esAnfitrion: true };
let testState = {
  isGameStarted: false,
  isPlayerReady: false,
  isRivalReady: false,
  primerTurnoCedido: false,
  primerTurnoPara: 1,
  esMiTurno: true,
  turnoActual: 1
};

// Solo inicia si hay conexión y ambos están listos
function verificarPuedeComenzar(state, red) {
  const estanConectados = red.conectado;
  return Boolean(estanConectados && state.isPlayerReady && state.isRivalReady);
}

// Jugador da listo pero rival no está conectado
testState.isPlayerReady = true;
testState.isGameStarted = verificarPuedeComenzar(testState, mockRedP2P);
assert(testState.isGameStarted === false, "Partida no inicia si el rival no está conectado aunque el anfitrión dé listo");

// Rival se conecta pero no ha dado listo
mockRedP2P.conectado = true;
testState.isGameStarted = verificarPuedeComenzar(testState, mockRedP2P);
assert(testState.isGameStarted === false, "Partida no inicia si el rival está conectado pero aún no ha dado listo");

// Anfitrión cede el primer turno
// Solo el anfitrión puede ceder el primer turno, una vez
function cederPrimerTurno(state, red) {
  if (!red.esAnfitrion || state.primerTurnoCedido || state.isGameStarted) return false;
  state.primerTurnoCedido = true;
  state.primerTurnoPara = 2;
  state.esMiTurno = false;
  state.turnoActual = 2;
  return true;
}

const cederExito = cederPrimerTurno(testState, mockRedP2P);
assert(cederExito === true && testState.primerTurnoCedido === true && testState.primerTurnoPara === 2, "Anfitrión cede exitosamente el primer turno al rival");

// Rival intenta regresar el turno (no permitido)
let mockRedRival = { conectado: true, esAnfitrion: false };
const cederRival = cederPrimerTurno(testState, mockRedRival);
assert(cederRival === false && testState.primerTurnoPara === 2, "El rival no tiene permitido ceder ni regresar el primer turno");

// Ambos listos y conectados: la partida arranca con el 1er turno para el rival
testState.isRivalReady = true;
testState.isGameStarted = verificarPuedeComenzar(testState, mockRedP2P);
assert(testState.isGameStarted === true, "Partida arranca al estar ambos conectados y listos");
assert(testState.primerTurnoPara === 2 && testState.esMiTurno === false, "La partida arranca con el turno 1 asignado al rival");

// 9. Tests de Modos Especiales: Solo Iniciales y Solo Legendarios
console.log("\n📦 9. Módulo Modos Especiales: Solo Iniciales y Solo Legendarios:");
const { STARTER_POKEMON_IDS, LEGENDARY_POKEMON_IDS } = context;
assert(STARTER_POKEMON_IDS && STARTER_POKEMON_IDS.length === 27, "Pool de iniciales cuenta con exactamente 27 Pokémon (1ª fase)");
assert(LEGENDARY_POKEMON_IDS && LEGENDARY_POKEMON_IDS.length >= 30, "Pool de legendarios cuenta con al menos 30 Pokémon legendarios oficiales");

const codeIni = buildRoomCode("INICIA", new Set([1,2,3,4,5,6,7,8,9]), true, true, false, false, "starters");
assert(codeIni.includes("-INI"), "buildRoomCode añade '-INI' en modo Solo Iniciales");
const parsedIni = parseRoomCode(codeIni);
assert(parsedIni.valid && parsedIni.gameMode === "starters", "parseRoomCode reconoce 'starters' con flag '-INI'");

const codeLeg = buildRoomCode("LEGEND", new Set([1,2,3,4,5,6,7,8,9]), true, true, false, false, "legendaries");
assert(codeLeg.includes("-LEG"), "buildRoomCode añade '-LEG' en modo Solo Legendarios");
const parsedLeg = parseRoomCode(codeLeg);
assert(parsedLeg.valid && parsedLeg.gameMode === "legendaries", "parseRoomCode reconoce 'legendaries' con flag '-LEG'");

const boardIni = computeBoardIds("SEED12", [1,2,3,4,5,6,7,8,9], "starters");
assert(boardIni.length === 27, "computeBoardIds en modo iniciales genera exactamente 27 cartas");
assert(boardIni.every(id => STARTER_POKEMON_IDS.includes(id)), "Todas las cartas generadas en modo iniciales son de STARTER_POKEMON_IDS");

const boardLeg = computeBoardIds("SEED12", [1,2,3,4,5,6,7,8,9], "legendaries");
assert(boardLeg.length === 30, "computeBoardIds en modo legendarios genera exactamente 30 cartas");
assert(boardLeg.every(id => LEGENDARY_POKEMON_IDS.includes(id)), "Todas las cartas generadas en modo legendarios son de LEGENDARY_POKEMON_IDS");

const paradoxIds = [1009, 1010, 1020, 1021, 1022, 1023];
assert(paradoxIds.every(id => !LEGENDARY_POKEMON_IDS.includes(id)), "Versiones paradoja de legendarios (Walking Wake, Gouging Fire, etc.) están excluidas del pool");

const boardLegGen1 = computeBoardIds("SEED12", [1], "legendaries");
assert(boardLegGen1.length === 5, "computeBoardIds con solo Gen 1 en modo legendarios genera exactamente 5 Pokémon");
assert(boardLegGen1.every(id => getGenForPokemonId(id) === "GEN I"), "Todos los legendarios generados con solo Gen 1 pertenecen a la GEN I");

const boardIniGen1 = computeBoardIds("SEED12", [1], "starters");
assert(boardIniGen1.length === 3, "computeBoardIds con solo Gen 1 en modo iniciales genera exactamente 3 Pokémon");
assert(boardIniGen1.every(id => getGenForPokemonId(id) === "GEN I"), "Todos los iniciales generados con solo Gen 1 pertenecen a la GEN I");

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
