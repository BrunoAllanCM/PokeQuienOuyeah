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
  gameModeConfig: "standard", // "standard", "starters" o "legendaries"

  // Sala Activa en Pantalla 2 (Tablero)
  roomCode: null,
  roomSeed: null,
  roomGens: [],
  roomShowTypes: true,
  roomShowGens: true,
  roomGrayscale: false,
  roomProMode: false,
  roomGameMode: "standard", // "standard", "starters" o "legendaries"
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

  // Resultado final guardado para persistir al recargar (victoria/derrota/trampa)
  savedGameResult: null,
  _tieneTurnoGuardado: false,

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
 * Guarda el estado completo de la partida en curso en sessionStorage
 */
function saveMatchStateToSession() {
  if (!state.roomCode) return;
  try {
    const snapshot = {
      isPlayerReady: Boolean(state.isPlayerReady),
      isRivalReady: Boolean(state.isRivalReady),
      isGameStarted: Boolean(state.isGameStarted),
      isGameOver: Boolean(state.isGameOver),
      rivalSecretHash: state.rivalSecretHash || null,
      fallosAdivinanza: state.fallosAdivinanza || 0,
      fallosAdivinanzaRival: state.fallosAdivinanzaRival || 0,
      fallosAdivinanzaJ1: state.fallosAdivinanzaJ1 || 0,
      fallosAdivinanzaJ2: state.fallosAdivinanzaJ2 || 0,
      primerTurnoCedido: Boolean(state.primerTurnoCedido),
      primerTurnoPara: state.primerTurnoPara || 1,
      secretPokemonRival: state.secretPokemonRival || null
    };
    sessionStorage.setItem(`poke_match_state_${state.roomCode}`, JSON.stringify(snapshot));
  } catch (e) {
    console.warn("No se pudo guardar estado de partida en sesión:", e);
  }
}

/**
 * Carga el estado completo de la partida en curso desde sessionStorage
 */
function loadMatchStateFromSession() {
  state.isPlayerReady = false;
  state.isRivalReady = false;
  state.isGameStarted = false;
  state.isGameOver = false;
  state.rivalSecretHash = null;
  state.fallosAdivinanza = 0;
  state.fallosAdivinanzaRival = 0;
  state.fallosAdivinanzaJ1 = 0;
  state.fallosAdivinanzaJ2 = 0;
  state.primerTurnoCedido = false;
  state.primerTurnoPara = 1;
  state.secretPokemonRival = null;

  if (!state.roomCode) return false;
  try {
    const raw = sessionStorage.getItem(`poke_match_state_${state.roomCode}`);
    if (raw) {
      const snap = JSON.parse(raw);
      if (snap && typeof snap === "object") {
        state.isPlayerReady = Boolean(snap.isPlayerReady);
        state.isRivalReady = Boolean(snap.isRivalReady);
        state.isGameStarted = Boolean(snap.isGameStarted);
        state.isGameOver = Boolean(snap.isGameOver);
        state.rivalSecretHash = snap.rivalSecretHash || null;
        state.fallosAdivinanza = Number(snap.fallosAdivinanza) || 0;
        state.fallosAdivinanzaRival = Number(snap.fallosAdivinanzaRival) || 0;
        state.fallosAdivinanzaJ1 = Number(snap.fallosAdivinanzaJ1) || 0;
        state.fallosAdivinanzaJ2 = Number(snap.fallosAdivinanzaJ2) || 0;
        state.primerTurnoCedido = Boolean(snap.primerTurnoCedido);
        state.primerTurnoPara = Number(snap.primerTurnoPara) || 1;
        state.secretPokemonRival = snap.secretPokemonRival || null;
        return true;
      }
    }
  } catch (e) {
    console.warn("No se pudo cargar estado de partida desde sesión:", e);
  }
  return false;
}

/**
 * Guarda el resultado final de la partida (victoria/derrota/trampa) para restaurarlo al recargar
 * @param {object} resultado
 */
function saveGameResultToSession(resultado) {
  if (!state.roomCode || !resultado) return;
  state.savedGameResult = resultado;
  try {
    sessionStorage.setItem(`poke_game_result_${state.roomCode}`, JSON.stringify(resultado));
  } catch (e) {
    console.warn("No se pudo guardar resultado final en sesión:", e);
  }
}

/**
 * Carga el resultado final guardado si la partida ya terminó
 * @returns {object|null}
 */
function loadGameResultFromSession() {
  state.savedGameResult = null;
  if (!state.roomCode) return null;
  try {
    const raw = sessionStorage.getItem(`poke_game_result_${state.roomCode}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state.savedGameResult = parsed;
        state.isGameOver = true;
        return parsed;
      }
    }
  } catch (e) {
    console.warn("No se pudo cargar resultado final desde sesión:", e);
  }
  return null;
}

/**
 * Limpia el resultado final guardado de sessionStorage
 */
function clearGameResultFromSession() {
  state.savedGameResult = null;
  if (!state.roomCode) return;
  try {
    sessionStorage.removeItem(`poke_game_result_${state.roomCode}`);
  } catch (e) {}
}

/**
 * Limpia todo el estado guardado en sesión de una sala al iniciar una revancha
 * @param {string} [roomCode]
 */
function clearRoomSessionState(roomCode = state.roomCode) {
  state.savedGameResult = null;
  state._tieneTurnoGuardado = false;
  if (!roomCode) return;
  try {
    [
      `poke_ready_${roomCode}`,
      `poke_match_state_${roomCode}`,
      `poke_game_result_${roomCode}`,
      `poke_salt_${roomCode}`,
      `poke_hash_${roomCode}`,
      `poke_secret_${roomCode}`,
      `poke_discards_${roomCode}`,
      `poke_turno_actual_${roomCode}`,
      `poke_num_turno_${roomCode}`,
      `poke_es_mi_turno_${roomCode}`,
      `poke_chat_${roomCode}`
    ].forEach(k => sessionStorage.removeItem(k));
  } catch (e) {}
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
  saveMatchStateToSession();
}

/**
 * Carga el estado de jugador listo desde sessionStorage
 */
function loadReadyFromSession() {
  if (loadMatchStateFromSession()) {
    return state.isPlayerReady;
  }
  state.isPlayerReady = false;
  state.isGameStarted = false;
  if (!state.roomCode) return false;
  try {
    const raw = sessionStorage.getItem(`poke_ready_${state.roomCode}`);
    if (raw === "true") {
      state.isPlayerReady = true;
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
  state._tieneTurnoGuardado = true;
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
  state._tieneTurnoGuardado = false;
  state.turnoActual = 1;
  state.numeroTurno = 1;
  state.esMiTurno = true;
  if (!state.roomCode) return;
  try {
    const tActual = sessionStorage.getItem(`poke_turno_actual_${state.roomCode}`);
    const numT = sessionStorage.getItem(`poke_num_turno_${state.roomCode}`);
    const esMiT = sessionStorage.getItem(`poke_es_mi_turno_${state.roomCode}`);

    if (tActual !== null || numT !== null || esMiT !== null) {
      state._tieneTurnoGuardado = true;
    }
    if (tActual !== null) state.turnoActual = parseInt(tActual, 10);
    if (numT !== null) state.numeroTurno = parseInt(numT, 10);
    if (esMiT !== null) state.esMiTurno = (esMiT === "true");
  } catch (e) {
    console.warn("No se pudo cargar turno desde sesión:", e);
  }
}
