/**
 * Estado Centralizado de la Aplicación (Store)
 * Única fuente de la verdad para PokéQuién
 */

const state = {
  // Configuración en Pantalla 1 (Setup)
  selectedGens: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]),
  showTypesConfig: true,
  showGensConfig: true,
  grayscaleConfig: false,

  // Sala Activa en Pantalla 2 (Tablero)
  roomCode: null,
  roomSeed: null,
  roomGens: [],
  roomShowTypes: true,
  roomShowGens: true,
  roomGrayscale: false,
  roomProMode: false,
  boardPokemonIds: [],
  boardPokemonData: [],

  // Estado del Tablero de Juego
  discardedIds: new Set(),
  secretPokemon: null,
  isSecretHidden: false,
  isSelectingSecretMode: false,
  isPlayerReady: false,
  isRivalReady: false,
  isGameStarted: false,
  isGameOver: false,

  // Límite de Oportunidades de Adivinanza (Máximo 2 intentos fallidos)
  fallosAdivinanza: 0,
  fallosAdivinanzaRival: 0,
  fallosAdivinanzaJ1: 0,
  fallosAdivinanzaJ2: 0,

  // Criptografía y Seguridad Anti-Trampas (SHA-256)
  secretSalt: null,
  secretHash: null,
  rivalSecretHash: null,

  // Sistema de Turnos del Juego
  turnoActual: 1, // 1 (Jugador 1 / Anfitrión) o 2 (Jugador 2 / Invitado)
  numeroTurno: 1, // Contador correlativo de turnos (1, 2, 3...)
  esMiTurno: true, // true si este cliente tiene el control de su turno
  primerTurnoCedido: false, // true si el anfitrión cedió el primer turno al rival
  primerTurnoPara: 1, // 1 (Anfitrión) o 2 (Rival)

  // Sistema de Reinicio / Revancha Mutua
  solicitudReinicioEnviada: false,
  solicitudReinicioRecibida: false,

  // Preferencias de Usuario
  soundEnabled: true,
  theme: "retro"
};

/**
 * Guarda los valores criptográficos de compromiso en sessionStorage
 */
function saveCryptoCommitmentToSession(salt, hash) {
  if (!state.roomCode) return;
  try {
    sessionStorage.setItem(`poke_salt_${state.roomCode}`, String(salt || ""));
    sessionStorage.setItem(`poke_hash_${state.roomCode}`, String(hash || ""));
  } catch (e) {
    console.warn("No se pudo guardar compromiso criptográfico:", e);
  }
}

/**
 * Carga los valores criptográficos de compromiso desde sessionStorage
 */
function loadCryptoCommitmentFromSession() {
  if (!state.roomCode) return;
  try {
    const s = sessionStorage.getItem(`poke_salt_${state.roomCode}`);
    const h = sessionStorage.getItem(`poke_hash_${state.roomCode}`);
    if (s && h) {
      state.secretSalt = s;
      state.secretHash = h;
    }
  } catch (e) {
    console.warn("No se pudo cargar compromiso criptográfico:", e);
  }
}

/**
 * Guarda el estado de jugador listo en sessionStorage
 */
function saveReadyToSession() {
  if (!state.roomCode) return;
  try {
    sessionStorage.setItem(`poke_ready_${state.roomCode}`, String(state.isPlayerReady));
  } catch (e) {
    console.warn("No se pudo guardar estado listo en sesión:", e);
  }
}

/**
 * Carga el estado de jugador listo desde sessionStorage
 */
function loadReadyFromSession() {
  state.isPlayerReady = false;
  state.isGameStarted = false;
  if (!state.roomCode) return false;
  try {
    const raw = sessionStorage.getItem(`poke_ready_${state.roomCode}`);
    if (raw === "true") {
      state.isPlayerReady = true;
      state.isGameStarted = true;
      return true;
    }
  } catch (e) {
    console.warn("No se pudo cargar estado listo desde sesión:", e);
  }
  return false;
}

/**
 * Guarda los IDs descartados en sessionStorage indexados por código de sala
 */
function saveDiscardsToSession() {
  if (!state.roomCode) return;
  try {
    const arr = Array.from(state.discardedIds);
    sessionStorage.setItem(`poke_discards_${state.roomCode}`, JSON.stringify(arr));
  } catch (e) {
    console.warn("No se pudo guardar descartes en sesión:", e);
  }
}

/**
 * Carga los IDs descartados desde sessionStorage si existen para la sala actual
 */
function loadDiscardsFromSession() {
  state.discardedIds.clear();
  if (!state.roomCode) return;
  try {
    const raw = sessionStorage.getItem(`poke_discards_${state.roomCode}`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach(id => state.discardedIds.add(id));
      }
    }
  } catch (e) {
    console.warn("No se pudo cargar descartes desde sesión:", e);
  }
}

/**
 * Guarda el estado del sistema de turnos en sessionStorage
 */
function saveTurnToSession() {
  if (!state.roomCode) return;
  try {
    sessionStorage.setItem(`poke_turno_actual_${state.roomCode}`, String(state.turnoActual));
    sessionStorage.setItem(`poke_num_turno_${state.roomCode}`, String(state.numeroTurno));
    sessionStorage.setItem(`poke_es_mi_turno_${state.roomCode}`, String(state.esMiTurno));
  } catch (e) {
    console.warn("No se pudo guardar turno en sesión:", e);
  }
}

/**
 * Carga el estado del sistema de turnos desde sessionStorage
 */
function loadTurnFromSession() {
  if (!state.roomCode) return;
  try {
    const tActual = sessionStorage.getItem(`poke_turno_actual_${state.roomCode}`);
    const numT = sessionStorage.getItem(`poke_num_turno_${state.roomCode}`);
    const esMiT = sessionStorage.getItem(`poke_es_mi_turno_${state.roomCode}`);

    if (tActual !== null) state.turnoActual = parseInt(tActual, 10);
    if (numT !== null) state.numeroTurno = parseInt(numT, 10);
    if (esMiT !== null) state.esMiTurno = (esMiT === "true");
  } catch (e) {
    console.warn("No se pudo cargar turno desde sesión:", e);
  }
}
