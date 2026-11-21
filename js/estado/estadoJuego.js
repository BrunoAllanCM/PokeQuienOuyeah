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

  // Criptografía y Seguridad Anti-Trampas (SHA-256)
  secretSalt: null,
  secretHash: null,
  rivalSecretHash: null,

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
