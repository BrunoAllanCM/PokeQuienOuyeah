/**
 * Controlador del Tablero de Juego (Pantalla 2)
 * Renderizado de cartas 3D, gestión de Pokémon secreto, descartes y filtros
 */

/**
 * Alterna la vista activa entre Setup y Tablero
 * @param {"view-setup"|"view-board"} viewId
 */
function showView(viewId) {
  // Oculta todas las vistas
  document.querySelectorAll(".view-section").forEach(view => {
    view.classList.remove("active");
  });
  // Muestra la vista pedida
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.add("active");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Inicia la sala a partir de un código de sala válido
 * @param {string} code
 */
async function loadRoom(code) {
  // Valida el código de sala
  const parsed = parseRoomCode(code);
  if (!parsed.valid) {
    showToast(parsed.error, "error");
    return;
  }

  // Guarda la configuración de la sala en el estado
  state.roomCode = parsed.code;
  state.roomSeed = parsed.seed;
  state.roomGens = parsed.gens;
  state.roomShowTypes = parsed.showTypes;
  state.roomShowGens = parsed.showGens;
  state.roomGrayscale = parsed.grayscale || false;
  state.roomProMode = Boolean(parsed.proMode);
  state.roomGameMode = parsed.gameMode || "standard";

  // Actualiza la URL con el código de sala
  const newUrl = `${window.location.pathname}?sala=${encodeURIComponent(state.roomCode)}`;
  window.history.replaceState({ sala: state.roomCode }, "", newUrl);

  // Muestra el tablero y calcula los Pokémon
  showView("view-board");
  renderBoardHeader();
  state.boardPokemonIds = computeBoardIds(state.roomSeed, state.roomGens, state.roomGameMode);
  // Recupera datos guardados de la sesión
  loadDiscardsFromSession();
  loadReadyFromSession();
  loadCryptoCommitmentFromSession();
  loadTurnFromSession();
  // Protege el estado contra trampas
  if (typeof seguridadAntiTrampas !== "undefined") {
    seguridadAntiTrampas.blindarEstadoJuego(state);
  }
  syncReadyUI();
  actualizarUITurno();
  await renderAndFetchBoardPokemon();
}

let isRoomCodeHidden = false;

/**
 * Actualiza la información en la barra superior del tablero
 */
function renderBoardHeader() {
  const codeEl = document.getElementById("board-room-code");
  const gensBadge = document.getElementById("board-badge-gens");
  const typesBadge = document.getElementById("board-badge-types");
  const grayscaleBadge = document.getElementById("board-badge-grayscale");

  // Activa o desactiva la clase grayscale-mode y pro-mode-active en el contenedor del tablero y modales
  const boardView = document.getElementById("view-board");
  if (boardView) {
    boardView.classList.toggle("grayscale-mode", !!state.roomGrayscale);
    boardView.classList.toggle("pro-mode-active", !!state.roomProMode);
  }
  const guessModal = document.getElementById("modal-guess-pokemon");
  if (guessModal) {
    guessModal.classList.toggle("grayscale-mode", !!state.roomGrayscale);
    guessModal.classList.toggle("pro-mode-active", !!state.roomProMode);
  }

  // Muestra u oculta el código de sala
  if (codeEl) {
    codeEl.dataset.fullCode = state.roomCode || "";
    codeEl.textContent = isRoomCodeHidden ? "••••••••••" : (state.roomCode || "------");
  }

  // Texto de la insignia de generaciones
  if (gensBadge) {
    if (state.roomProMode) {
      gensBadge.textContent = "Datos: Ocultos";
    } else if (state.roomGens.length === 9) {
      gensBadge.textContent = "Gen 1-9 (Todas)";
    } else {
      gensBadge.textContent = `Gen ${state.roomGens.join(", ")}`;
    }
  }

  // Texto de la insignia de tipos
  if (typesBadge) {
    if (state.roomProMode) {
      typesBadge.textContent = "Modo: Solo Nombre";
    } else {
      typesBadge.textContent = state.roomShowTypes ? "Tipos: Visibles" : "Tipos: Ocultos";
    }
  }

  // Texto de la insignia de sprites
  if (grayscaleBadge) {
    if (state.roomProMode) {
      grayscaleBadge.textContent = "Sprites: Desactivados";
    } else {
      grayscaleBadge.textContent = state.roomGrayscale ? "Sprites: Blanco y Negro" : "Sprites: Color Normal";
    }
  }

  // Insignia del modo de juego
  const modeBadge = document.getElementById("board-badge-mode");
  if (modeBadge) {
    const boardCount = state.boardPokemonIds?.length || (state.roomGameMode === "starters" ? 27 : 30);
    if (state.roomGameMode === "starters") {
      modeBadge.textContent = `🌱🔥💧 Solo Iniciales (${boardCount})`;
      modeBadge.classList.remove("hidden");
    } else if (state.roomGameMode === "legendaries") {
      modeBadge.textContent = `👑 Solo Legendarios (${boardCount})`;
      modeBadge.classList.remove("hidden");
    } else {
      modeBadge.classList.add("hidden");
    }
  }
}

/**
 * Renderiza skeletons shimmer mientras carga PokéAPI (27 o 30 según el modo)
 */
function renderSkeletonGrid() {
  const grid = document.getElementById("board-cards-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const count = state.boardPokemonIds?.length || (state.roomGameMode === "starters" ? 27 : 30);
  // Crea tarjetas de carga vacías
  for (let i = 0; i < count; i++) {
    const skel = document.createElement("div");
    skel.className = "skeleton-card";
    skel.innerHTML = `
      <div class="skeleton-shimmer"></div>
      <div class="card-top">
        <span class="skeleton-bar skeleton-bar-sm"></span>
      </div>
      <div class="skeleton-circle"></div>
      <div class="card-bottom">
        <span class="skeleton-bar skeleton-bar-md"></span>
        <span class="skeleton-bar skeleton-bar-lg"></span>
      </div>
    `;
    grid.appendChild(skel);
  }
}

/**
 * Pre-carga en memoria todos los sprites animados antes de renderizar el tablero
 * para evitar micro-cortes visuales o parpadeos.
 * @param {Array<{ animatedImage?: string, image: string }>} pokemonList
 * @param {number} [timeoutMs=2500]
 * @returns {Promise<void>}
 */
function preloadBoardSprites(pokemonList, timeoutMs = 2500) {
  if (!pokemonList || pokemonList.length === 0) return Promise.resolve();
  // Carga cada imagen sin bloquear si falla
  const preloadPromises = pokemonList.map(p => {
    return new Promise(resolve => {
      const src = p.isShiny
        ? (p.animatedShinyImage || p.shinyImage || p.animatedImage || p.image)
        : (p.animatedImage || p.image);
      if (!src) return resolve();
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
    });
  });

  // Límite de espera para no bloquear el tablero
  const timeoutPromise = new Promise(resolve => setTimeout(resolve, timeoutMs));
  return Promise.race([Promise.all(preloadPromises), timeoutPromise]);
}

/**
 * Descarga los 30 Pokémon en paralelo y renderiza las cartas reales
 */
async function renderAndFetchBoardPokemon() {
  const errorPanel = document.getElementById("board-error-panel");
  if (errorPanel) errorPanel.classList.add("hidden");

  renderSkeletonGrid();

  try {
    // Descarga los datos de todos los Pokémon
    const promises = state.boardPokemonIds.map(id => fetchPokemonData(id));
    state.boardPokemonData = await Promise.all(promises);

    // Determina el único Pokémon Shiny del tablero (máximo 1 por partida para mantenerlo especial)
    const shinyId = typeof getBoardShinyPokemonId === "function"
      ? getBoardShinyPokemonId(state.roomCode, state.boardPokemonIds)
      : null;

    state.boardPokemonData.forEach(poke => {
      poke.isShiny = Boolean(shinyId !== null && poke.id === shinyId);
    });

    // Pre-cargar todos los sprites animados antes de renderizar el tablero
    await preloadBoardSprites(state.boardPokemonData);

    initSecretPokemon();
    renderBoardCards();
    updateCounterAndProgress();
  // Muestra el error de red
  } catch (error) {
    console.error("Error al cargar los Pokémon del tablero:", error);
    if (errorPanel) {
      errorPanel.classList.remove("hidden");
      const desc = document.getElementById("board-error-desc");
      if (desc) {
        desc.textContent =
          "Hubo un fallo de red al consultar PokéAPI. Por favor verifica tu conexión e intenta de nuevo.";
      }
    }
  }
}

/**
 * Renderiza las 30 cartas finales con sus datos interactivos
 */
function renderBoardCards() {
  const grid = document.getElementById("board-cards-grid");
  if (!grid) return;
  grid.innerHTML = "";

  state.boardPokemonData.forEach(pokemon => {
    const card = document.createElement("div");
    const isDiscarded = state.discardedIds.has(pokemon.id);
    const isSecret = state.secretPokemon && state.secretPokemon.id === pokemon.id;
    const isShiny = Boolean(pokemon.isShiny);
    const animSrc = isShiny ? (pokemon.animatedShinyImage || pokemon.shinyImage || pokemon.animatedImage) : pokemon.animatedImage;
    const staticSrc = isShiny ? (pokemon.shinyImage || pokemon.image) : pokemon.image;

    card.className = `poke-card ${isDiscarded ? "descartada" : ""} ${isSecret ? "is-secret-pokemon" : ""} ${isShiny ? "is-shiny-card" : ""}`;
    card.dataset.id = pokemon.id;
    card.dataset.name = pokemon.name.toLowerCase();
    card.dataset.types = (typeof getCombinedTypeSearchString === "function")
      ? getCombinedTypeSearchString(pokemon.types)
      : pokemon.types.join(" ");

    // Arma las insignias de tipo
    let typesHtml = "";
    if (state.roomShowTypes && !state.roomProMode) {
      typesHtml = pokemon.types
        .map(t => {
          const cleanType = String(t).toLowerCase().trim();
          const translated = TYPE_TRANSLATIONS[cleanType] || cleanType;
          return `<span class="type-badge type-${cleanType}">${translated}</span>`;
        })
        .join("");
    }

    // Prepara las piezas HTML de la carta
    const secretOwnerBadgeHtml = isSecret ? `<span class="secret-owner-badge">★ TU SECRETO</span>` : "";
    const genBadgeHtml = (state.roomShowGens && !state.roomProMode) ? `<span class="card-gen-badge">${getGenForPokemonId(pokemon.id)}</span>` : "";
    const cardNumHtml = !state.roomProMode ? `<span class="card-num">#${String(pokemon.id).padStart(3, "0")}</span>` : "";
    const nameHtml = `<span class="card-name" title="${pokemon.name}">${isShiny ? '✨ ' : ''}${pokemon.name}</span>`;

    // Imagen de la carta (signo ? en modo pro)
    const imgWrapHtml = state.roomProMode
      ? `<div class="card-img-wrap pro-mystery-wrap"><div class="pro-mystery-icon">?</div></div>`
      : `
        <div class="card-img-wrap">
          ${animSrc ? `
            <img
              src="${animSrc}"
              alt="${pokemon.name} animado ${isShiny ? 'shiny' : ''}"
              class="card-img card-img-animated ${state.roomGrayscale ? 'sprite-grayscale' : ''}"
              onerror="this.classList.add('hidden')"
            >
          ` : ""}
          <img
            src="${staticSrc}"
            alt="${pokemon.name} ${isShiny ? 'shiny' : ''}"
            class="card-img card-img-static ${state.roomGrayscale ? 'sprite-grayscale' : ''}"
          >
        </div>
      `;

    // Arma el HTML de la carta
    card.innerHTML = `
      ${secretOwnerBadgeHtml}
      <div class="card-top">
        ${cardNumHtml}
        ${genBadgeHtml}
      </div>
      <div class="card-name-wrap">
        ${nameHtml}
      </div>
      ${imgWrapHtml}
      <div class="card-bottom">
        ${(state.roomShowTypes && !state.roomProMode) ? `<div class="card-types">${typesHtml}</div>` : ""}
      </div>
    `;

    // Clic en la carta
    card.addEventListener("click", () => handleCardClick(pokemon));
    grid.appendChild(card);
  });
}

/**
 * Manejo del clic en una carta del tablero (descarte o selección de secreto)
 * @param {{ id: number, name: string, image: string, types: string[] }} pokemon
 */
function handleCardClick(pokemon) {
  // Efecto de sonido brillante si el Pokémon es Shiny
  if (pokemon.isShiny && typeof sounds !== "undefined" && sounds.playShinySparkle) {
    sounds.playShinySparkle();
  }

  // Modo elegir Pokémon secreto
  if (state.isSelectingSecretMode) {
    setSecretPokemon(pokemon, true);
    exitSelectingSecretMode();
    sounds.playSelectSecret();
    showToast(`Tu nuevo Pokémon secreto es ${pokemon.name}.`, "success");

    // Si ya habíamos marcado Listo antes (pero el rival aún no), actualizamos el compromiso SHA-256
    if (state.isPlayerReady && typeof seguridadAntiTrampas !== "undefined") {
      seguridadAntiTrampas.calcularHashPokemon(pokemon.id, state.secretSalt, state.roomCode).then(h => {
        state.secretHash = h;
        saveCryptoCommitmentToSession(state.secretSalt, state.secretHash);
        if (typeof redP2P !== "undefined" && redP2P.conectado) {
          redP2P.enviarAccionJuego("COMPROMISO_HASH", { hash: h, listo: true });
        }
      });
    }
    return;
  }

  // Validación de Turno: Solo se puede seleccionar y quitar Pokémon durante el turno del jugador
  if (state.isGameOver) {
    showToast("La partida ha terminado. Pulsa Revancha para jugar de nuevo.", "info", 3000);
    return;
  }

  if (state.isGameStarted && !state.esMiTurno) {
    showToast("✋ Es el turno de tu rival. Espera a que termine su turno para quitar Pokémon.", "warning", 3000);
    if (typeof sounds !== "undefined" && sounds.playFail) {
      sounds.playFail();
    }
    return;
  }

  // Alterna el descarte de la carta
  if (state.discardedIds.has(pokemon.id)) {
    state.discardedIds.delete(pokemon.id);
  } else {
    state.discardedIds.add(pokemon.id);
    sounds.playFlip();
  }

  saveDiscardsToSession();

  // Actualiza la carta en pantalla
  const card = document.querySelector(`.poke-card[data-id="${pokemon.id}"]`);
  if (card) {
    card.classList.toggle("descartada", state.discardedIds.has(pokemon.id));
  }

  updateCounterAndProgress();

  // Sincronizar acción de descarte con el rival en tiempo real
  if (typeof redP2P !== "undefined" && redP2P.conectado) {
    const total = state.boardPokemonData?.length || (state.roomGameMode === "starters" ? 27 : 30);
    const restantes = total - state.discardedIds.size;
    redP2P.enviarAccionJuego("DESCARTE", { restantes });
  }
}

/**
 * Actualiza el contador dinámico Restantes: X / Total y la barra de progreso
 */
function updateCounterAndProgress() {
  const total = state.boardPokemonData?.length || (state.roomGameMode === "starters" ? 27 : 30);
  const remainingCount = total - state.discardedIds.size;
  const counterEl = document.getElementById("counter-remaining");
  const counterTotalEl = document.getElementById("counter-total");
  const progressFill = document.getElementById("mini-progress-fill");

  if (counterEl) {
    counterEl.textContent = remainingCount;
  }
  if (counterTotalEl) {
    counterTotalEl.textContent = `/ ${total}`;
  }

  // Ajusta ancho y color de la barra
  if (progressFill) {
    const percent = Math.max(0, Math.min(100, (remainingCount / total) * 100));
    progressFill.style.width = `${percent}%`;
    if (percent <= 20) {
      progressFill.style.backgroundColor = "var(--poke-red)";
    } else if (percent <= 50) {
      progressFill.style.backgroundColor = "var(--poke-yellow)";
    } else {
      progressFill.style.backgroundColor = "var(--poke-cyan)";
    }
  }
}

/**
 * Reinicia todos los descartes a 0
 */
function resetDiscards() {
  state.discardedIds.clear();
  saveDiscardsToSession();

  // Quita la marca visual de descarte
  document.querySelectorAll(".poke-card").forEach(card => {
    card.classList.remove("descartada");
  });

  updateCounterAndProgress();
  sounds.playFlip();
  showToast("Se han desmarcado todas las cartas.", "info");

  if (typeof redP2P !== "undefined" && redP2P.conectado) {
    const total = state.boardPokemonData?.length || (state.roomGameMode === "starters" ? 27 : 30);
    redP2P.enviarAccionJuego("REINICIO", { restantes: total });
  }
}

/**
 * Sincroniza la interfaz visual del sistema de turnos
 */
function actualizarUITurno() {
  const turnBar = document.getElementById("board-turn-bar");
  const turnTitle = document.getElementById("turn-title");
  const turnSub = document.getElementById("turn-sub");
  const turnRoundChip = document.getElementById("turn-round-chip");
  const btnFinishTurn = document.getElementById("btn-finish-turn");
  const btnGuessRival = document.getElementById("btn-guess-rival");
  const cardsGrid = document.getElementById("board-cards-grid");

  if (!turnBar) return;

  // Datos de conexión y estado de la partida
  const estaConectado = typeof redP2P !== "undefined" ? redP2P.conectado : true;
  const esAnfitrion = typeof redP2P !== "undefined" ? redP2P.esAnfitrion : true;
  const juegoIniciado = Boolean(state.isGameStarted);

  if (!juegoIniciado) {
    // ========================================================
    // FASE PREVIA A INICIAR LA PARTIDA (PRE-PARTIDA)
    // ========================================================
    turnBar.classList.remove("is-my-turn", "is-rival-turn");
    turnBar.classList.add("is-pregame");

    if (turnRoundChip) {
      turnRoundChip.textContent = "Preparación";
    }

    // Regla: El botón de adivinar NO se da antes de que la partida inicie
    if (btnGuessRival) {
      btnGuessRival.classList.add("hidden");
      btnGuessRival.disabled = true;
    }

    if (cardsGrid) {
      cardsGrid.classList.remove("tablero-bloqueado-turno");
    }

    // Botón de turno antes de iniciar la partida
    if (btnFinishTurn) {
      if (esAnfitrion) {
        // Solo el primer jugador (anfitrión) tiene el botón para ceder el 1er turno
        btnFinishTurn.classList.remove("hidden");
        btnFinishTurn.classList.add("btn-ceder-turno");

        if (state.primerTurnoCedido) {
          btnFinishTurn.disabled = true;
          btnFinishTurn.classList.add("cedido", "disabled");
          btnFinishTurn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            <span>✓ 1er Turno al Rival</span>
          `;
          btnFinishTurn.title = "Ya has cedido el primer turno al rival.";
        } else {
          // Solo puede hacer clic si el rival está conectado
          btnFinishTurn.disabled = !estaConectado;
          btnFinishTurn.classList.toggle("disabled", !estaConectado);
          btnFinishTurn.classList.remove("cedido");
          btnFinishTurn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
            </svg>
            <span>🎯 Dar 1er Turno al Rival</span>
          `;
          btnFinishTurn.title = estaConectado
            ? "Ceder el primer turno de la partida al rival"
            : "Tu rival debe conectarse a la sala para poder cederle el primer turno";
        }
      } else {
        // El rival NO tiene este botón antes de iniciar la partida
        btnFinishTurn.classList.add("hidden");
        btnFinishTurn.disabled = true;
      }
    }

    // Título de la barra de turno
    if (turnTitle) {
      if (esAnfitrion) {
        turnTitle.textContent = state.primerTurnoCedido
          ? "EL RIVAL INICIARÁ LA PARTIDA"
          : "TIENES EL PRIMER TURNO";
      } else {
        turnTitle.textContent = state.primerTurnoCedido
          ? "¡EL ANFITRIÓN TE DIO EL PRIMER TURNO!"
          : "EL ANFITRIÓN TIENE EL PRIMER TURNO";
      }
    }

    // Subtítulo según el estado de ambos jugadores
    if (turnSub) {
      if (!estaConectado) {
        turnSub.textContent = "Esperando a que tu rival se conecte a la sala... Comparte el enlace de sala.";
      } else if (!state.isPlayerReady) {
        turnSub.textContent = "Elige tu Pokémon secreto y pulsa ¡Listo! para comenzar.";
      } else if (!state.isRivalReady) {
        turnSub.textContent = "¡Estás listo! Esperando a que tu rival pulse ¡Listo!...";
      } else {
        turnSub.textContent = "¡Ambos jugadores listos! Iniciando partida...";
      }
    }

    return;
  }

  // ========================================================
  // PARTIDA INICIADA OFICIALMENTE
  // ========================================================
  turnBar.classList.remove("is-pregame");
  const esMiTurno = Boolean(state.esMiTurno);

  // Alternar clases visuales
  turnBar.classList.toggle("is-my-turn", esMiTurno);
  turnBar.classList.toggle("is-rival-turn", !esMiTurno);

  if (turnRoundChip) {
    turnRoundChip.textContent = `Turno #${state.numeroTurno || 1}`;
  }

  if (turnTitle) {
    if (typeof redP2P !== "undefined" && redP2P.conectado) {
      turnTitle.textContent = esMiTurno ? "¡ES TU TURNO!" : "TURNO DEL RIVAL";
    } else {
      turnTitle.textContent = esMiTurno
        ? `¡ES TU TURNO! (JUGADOR ${state.turnoActual || 1})`
        : `TURNO DEL JUGADOR ${state.turnoActual || 1}`;
    }
  }

  if (turnSub) {
    if (esMiTurno) {
      turnSub.textContent = "Selecciona los Pokémon que quieras quitar, pregunta a tu rival o intenta adivinar.";
    } else {
      turnSub.textContent = "Esperando a que el otro jugador termine sus descartes o pase su turno...";
    }
  }

  // Ahora sí es el botón de pasar turno para ambos jugadores
  if (btnFinishTurn) {
    btnFinishTurn.classList.remove("hidden", "btn-ceder-turno", "cedido");
    const puedeTerminar = esMiTurno && !state.isGameOver;
    btnFinishTurn.disabled = !puedeTerminar;
    btnFinishTurn.classList.toggle("disabled", !puedeTerminar);
    btnFinishTurn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6zM16 6h2v12h-2z"/>
      </svg>
      <span>Terminar Turno</span>
    `;
    btnFinishTurn.title = state.isGameOver
      ? "Partida finalizada"
      : (esMiTurno ? "Terminar tu turno y pasárselo al otro jugador" : "Es el turno de tu rival, esperando...");
  }

  // El botón de adivinar solo se muestra y habilita durante la partida iniciada y en el turno del jugador
  if (btnGuessRival) {
    const puedeAdivinar = state.isGameStarted && esMiTurno && !state.isGameOver;
    btnGuessRival.classList.toggle("hidden", !state.isGameStarted);
    btnGuessRival.disabled = !puedeAdivinar;
    btnGuessRival.classList.toggle("disabled", !puedeAdivinar);
    if (!puedeAdivinar) {
      btnGuessRival.title = state.isGameOver
        ? "Partida finalizada"
        : (!state.isGameStarted
          ? "La partida comenzará cuando ambos jugadores estén conectados y listos"
          : "Solo puedes intentar adivinar durante tu turno");
    } else {
      btnGuessRival.title = "Adivinar el Pokémon secreto de tu rival";
    }
  }

  if (cardsGrid) {
    cardsGrid.classList.toggle("tablero-bloqueado-turno", state.isGameOver || (state.isGameStarted && !esMiTurno));
  }
}

/**
 * Finaliza el turno actual y se lo transfiere al otro jugador
 * @param {{ porFallo?: boolean }} opciones
 */
function terminarTurno({ porFallo = false } = {}) {
  if (!state.esMiTurno) {
    showToast("✋ No es tu turno.", "warning");
    return;
  }

  // Turno con rival conectado (P2P)
  if (typeof redP2P !== "undefined" && redP2P.conectado) {
    state.esMiTurno = false;
    state.turnoActual = redP2P.esAnfitrion ? 2 : 1;
    state.numeroTurno++;
    saveTurnToSession();
    actualizarUITurno();

    // Notificar al rival por P2P
    redP2P.enviarAccionJuego("PASAR_TURNO", {
      nuevoTurno: state.turnoActual,
      numeroTurno: state.numeroTurno,
      porFallo
    });

    // Mensajes según si falló o terminó voluntariamente
    if (porFallo) {
      showToast("❌ ¡Fallaste! Has perdido tu turno y pasa a tu rival.", "error", 4500);
      if (typeof vistaChat !== "undefined") {
        vistaChat.agregarBurbuja({
          texto: "❌ Has fallado tu intento de adivinanza. Tu turno ha terminado automáticamente y pasa al rival.",
          tipo: "system"
        });
      }
    } else {
      showToast("⏩ Has terminado tu turno. Ahora le toca al rival.", "info", 3000);
      if (typeof vistaChat !== "undefined") {
        vistaChat.agregarBurbuja({
          texto: `⏩ Has terminado tu turno (#${state.numeroTurno - 1}). Ahora es el turno del rival.`,
          tipo: "system"
        });
      }
      if (typeof sounds !== "undefined" && sounds.playTurnPass) {
        sounds.playTurnPass();
      }
    }
  } else {
    // Partida en local / 1 dispositivo (Pase y Juega)
    state.turnoActual = state.turnoActual === 1 ? 2 : 1;
    state.numeroTurno++;
    saveTurnToSession();
    actualizarUITurno();

    if (porFallo) {
      showToast(`❌ ¡Fallaste! Has perdido tu turno. Pasa al Jugador ${state.turnoActual}.`, "error", 4500);
      if (typeof vistaChat !== "undefined") {
        vistaChat.agregarBurbuja({
          texto: `❌ Intento fallido. El turno pasa automáticamente al Jugador ${state.turnoActual}.`,
          tipo: "system"
        });
      }
    } else {
      showToast(`⏩ Turno terminado. Ahora le toca al Jugador ${state.turnoActual}.`, "info", 3500);
      if (typeof vistaChat !== "undefined") {
        vistaChat.agregarBurbuja({
          texto: `⏩ Turno terminado. Ahora le toca al Jugador ${state.turnoActual}.`,
          tipo: "system"
        });
      }
      if (typeof sounds !== "undefined" && sounds.playTurnPass) {
        sounds.playTurnPass();
      }
    }
  }
}

/**
 * Limpia la selección del Pokémon secreto, dejando la casilla lista para que el usuario elija
 */
function clearSecretPokemon() {
  // Borra el secreto guardado
  state.secretPokemon = null;
  try {
    sessionStorage.removeItem(`poke_secret_${state.roomCode}`);
  } catch (e) {}

  // Restablece el widget del secreto
  const imgEl = document.getElementById("secret-img");
  const numEl = document.getElementById("secret-num");
  const nameEl = document.getElementById("secret-name");
  const typesEl = document.getElementById("secret-types");

  if (imgEl) {
    imgEl.style.display = "none";
    let placeholder = document.getElementById("secret-placeholder-icon");
    if (!placeholder) {
      placeholder = document.createElement("div");
      placeholder.id = "secret-placeholder-icon";
      placeholder.className = "pro-mystery-icon";
      placeholder.textContent = "?";
      imgEl.parentNode.appendChild(placeholder);
    }
    placeholder.style.display = "flex";
  }

  if (numEl) {
    numEl.textContent = "---";
  }
  if (nameEl) {
    nameEl.textContent = "Elige tu Pokémon";
  }
  if (typesEl) {
    typesEl.innerHTML = `<span class="type-badge-pending">Elige del tablero</span>`;
  }

  // Quita la marca de secreto de las cartas
  document.querySelectorAll(".poke-card").forEach(card => {
    card.classList.remove("is-secret-pokemon");
    const existingBadge = card.querySelector(".secret-owner-badge");
    if (existingBadge) existingBadge.remove();
  });
}

/**
 * Inicializa el Pokémon secreto usando sessionStorage o esperando selección manual del usuario
 */
function initSecretPokemon() {
  // Lee el secreto guardado en la sesión
  const sessionKey = `poke_secret_${state.roomCode}`;
  let secretId = null;

  try {
    const stored = sessionStorage.getItem(sessionKey);
    if (stored) {
      secretId = parseInt(stored, 10);
    }
  } catch (e) {}

  let poke = state.boardPokemonData.find(p => p.id === secretId);

  if (poke) {
    setSecretPokemon(poke, false);
  } else {
    // No hay selección previa: no autoseleccionar nada, el usuario debe elegirlo
    clearSecretPokemon();
    enterSelectingSecretMode();
  }
}

/**
 * Asigna un Pokémon como secreto y actualiza el widget en la barra superior
 * @param {{ id: number, name: string, image: string, types: string[], cry?: string }} pokemon
 * @param {boolean} [playCry=false] Si es true, reproduce el grito/sonido del Pokémon
 */
function setSecretPokemon(pokemon, playCry = false) {
  if (!pokemon) return;
  // Guarda el secreto en el estado y la sesión
  state.secretPokemon = pokemon;

  try {
    sessionStorage.setItem(`poke_secret_${state.roomCode}`, String(pokemon.id));
  } catch (e) {}

  // Reproduce el grito si se pidió
  if (playCry && typeof sounds !== "undefined" && sounds.playPokemonCry) {
    sounds.playPokemonCry(pokemon.id, pokemon.cry);
  }

  const placeholder = document.getElementById("secret-placeholder-icon");
  if (placeholder) {
    placeholder.style.display = "none";
  }

  const imgEl = document.getElementById("secret-img");
  const numEl = document.getElementById("secret-num");
  const nameEl = document.getElementById("secret-name");
  const typesEl = document.getElementById("secret-types");

  // Imagen del secreto (oculta en modo pro)
  if (imgEl) {
    if (state.roomProMode) {
      imgEl.style.display = "none";
      let proIcon = document.getElementById("secret-pro-icon");
      if (!proIcon) {
        proIcon = document.createElement("div");
        proIcon.id = "secret-pro-icon";
        proIcon.className = "pro-mystery-icon";
        proIcon.textContent = "?";
        imgEl.parentNode.appendChild(proIcon);
      }
      proIcon.style.display = "flex";
    } else {
      imgEl.style.display = "";
      const proIcon = document.getElementById("secret-pro-icon");
      if (proIcon) proIcon.style.display = "none";
      const isShiny = Boolean(pokemon.isShiny);
      const staticSrc = isShiny ? (pokemon.shinyImage || pokemon.image) : pokemon.image;
      const animSrc = isShiny
        ? (pokemon.animatedShinyImage || pokemon.shinyImage || pokemon.animatedImage || pokemon.image)
        : (pokemon.animatedImage || pokemon.image);
      imgEl.dataset.static = staticSrc;
      imgEl.src = animSrc;
      imgEl.alt = pokemon.name;
      imgEl.classList.toggle("sprite-grayscale", !!state.roomGrayscale);
    }
  }
  // Número del secreto
  if (numEl) {
    if (state.roomProMode) {
      numEl.textContent = "MODO PRO";
    } else {
      const genText = state.roomShowGens ? ` • ${getGenForPokemonId(pokemon.id)}` : "";
      numEl.textContent = `#${String(pokemon.id).padStart(3, "0")}${genText}`;
    }
  }
  if (nameEl) {
    nameEl.innerHTML = pokemon.isShiny ? `<span class="shiny-star-icon">✨</span> ${pokemon.name}` : pokemon.name;
  }
  // Tipos del secreto
  if (typesEl) {
    if (state.roomShowTypes && !state.roomProMode) {
      typesEl.innerHTML = pokemon.types
        .map(t => {
          const cleanType = String(t).toLowerCase().trim();
          const translated = TYPE_TRANSLATIONS[cleanType] || cleanType;
          return `<span class="type-badge type-${cleanType}">${translated}</span>`;
        })
        .join("");
    } else {
      typesEl.innerHTML = "";
    }
  }

  // Respetar estado si estaba oculto previamente
  const detailsEl = document.getElementById("secret-details");
  const detailsMaskedEl = document.getElementById("secret-details-masked");
  const coverEl = document.getElementById("secret-mask-cover");
  if (detailsEl && detailsMaskedEl && coverEl) {
    coverEl.classList.toggle("hidden", !state.isSecretHidden);
    detailsEl.classList.toggle("hidden", state.isSecretHidden);
    detailsMaskedEl.classList.toggle("hidden", !state.isSecretHidden);
  }

  // Marca la carta secreta en el tablero
  document.querySelectorAll(".poke-card").forEach(card => {
    const id = parseInt(card.dataset.id, 10);
    const isSecret = id === pokemon.id;
    card.classList.toggle("is-secret-pokemon", isSecret);

    const existingBadge = card.querySelector(".secret-owner-badge");
    if (existingBadge) existingBadge.remove();

    if (isSecret) {
      const badge = document.createElement("span");
      badge.className = "secret-owner-badge";
      badge.textContent = "★ TU SECRETO";
      card.prepend(badge);
    }
  });
}

/**
 * Alterna el ocultamiento temporal del Pokémon secreto
 */
function toggleSecretHide() {
  state.isSecretHidden = !state.isSecretHidden;

  const cover = document.getElementById("secret-mask-cover");
  const details = document.getElementById("secret-details");
  const detailsMasked = document.getElementById("secret-details-masked");
  const btn = document.getElementById("btn-toggle-secret-hide");
  const eyeOpen = document.getElementById("secret-eye-open");
  const eyeClosed = document.getElementById("secret-eye-closed");

  // Muestra u oculta los detalles
  if (cover) cover.classList.toggle("hidden", !state.isSecretHidden);
  if (details) details.classList.toggle("hidden", state.isSecretHidden);
  if (detailsMasked) detailsMasked.classList.toggle("hidden", !state.isSecretHidden);

  if (eyeOpen && eyeClosed) {
    eyeOpen.classList.toggle("hidden", state.isSecretHidden);
    eyeClosed.classList.toggle("hidden", !state.isSecretHidden);
  }

  if (btn) {
    btn.title = state.isSecretHidden ? "Mostrar Pokémon secreto" : "Ocultar Pokémon secreto";
    btn.setAttribute("aria-label", btn.title);
  }

  // Oculta también las insignias del tablero
  const grid = document.getElementById("board-cards-grid");
  if (grid) grid.classList.toggle("hide-secret-badges", state.isSecretHidden);
}

/**
 * Sincroniza la visibilidad de los controles de Pokémon secreto y anti-trampas
 */
function syncReadyUI() {
  const btnChange = document.getElementById("btn-change-secret");
  const btnReady = document.getElementById("btn-ready-game");
  const btnReadyText = document.getElementById("btn-ready-text");
  const rivalNote = document.getElementById("rival-ready-note");
  const badgeLocked = document.getElementById("badge-game-locked");
  const btnGuess = document.getElementById("btn-guess-rival");

  // Revisa si ambos están conectados y listos
  const estanConectados = typeof redP2P !== "undefined" ? redP2P.conectado : true;
  // Regla estricta: La partida SOLO puede arrancar y bloquearse si AMBOS están conectados Y AMBOS están listos
  const ambosListosYConectados = Boolean(estanConectados && state.isPlayerReady && state.isRivalReady);

  // Partida iniciada: bloquea los controles
  if (ambosListosYConectados || state.isGameStarted) {
    if (ambosListosYConectados) {
      state.isGameStarted = true;
    }
    if (btnChange) btnChange.classList.add("hidden");
    if (btnReady) btnReady.classList.add("hidden");
    if (rivalNote) rivalNote.classList.add("hidden");
    if (badgeLocked) badgeLocked.classList.remove("hidden");
    // El botón de adivinar solo se muestra si la partida ya arrancó oficialmente
    if (btnGuess) btnGuess.classList.remove("hidden");
    actualizarUITurno();
  } else {
    // Si la partida NO ha comenzado oficialmente (esperando conexión o que el rival dé listo):
    // El botón de adivinar NUNCA se muestra antes de iniciar la partida
    state.isGameStarted = false;
    if (btnGuess) btnGuess.classList.add("hidden");
    if (btnChange) btnChange.classList.remove("hidden");
    if (btnReady) btnReady.classList.remove("hidden");
    if (badgeLocked) badgeLocked.classList.add("hidden");
    actualizarUITurno();

    // Estado del botón "Listo" de este jugador
    if (btnReadyText && btnReady) {
      if (state.isPlayerReady) {
        btnReadyText.textContent = "✓ ¡Listo!";
        btnReady.classList.add("ready-active");
      } else {
        btnReadyText.textContent = "¡Listo!";
        btnReady.classList.remove("ready-active");
      }
    }

    // Nota debajo del botón indicando si el rival está listo
    if (rivalNote) {
      if (state.isRivalReady) {
        rivalNote.classList.remove("hidden");
        rivalNote.classList.add("active");
      } else {
        rivalNote.classList.add("hidden");
        rivalNote.classList.remove("active");
      }
    }
  }
}

/**
 * Maneja el clic en "¡Listo!" para confirmar selección de Pokémon
 */
async function handleReadyClick() {
  const estanConectados = typeof redP2P !== "undefined" ? redP2P.conectado : true;

  // Si la partida ya empezó oficialmente (ambos listos y conectados), no hacer nada
  if (state.isGameStarted || (estanConectados && state.isPlayerReady && state.isRivalReady)) return;
  // Exige haber elegido un secreto
  if (!state.secretPokemon) {
    showToast("⚠️ Primero debes elegir tu Pokémon secreto en el tablero.", "warning");
    enterSelectingSecretMode();
    return;
  }

  if (state.isSelectingSecretMode) {
    exitSelectingSecretMode();
  }

  // Generar compromiso criptográfico SHA-256
  if (typeof seguridadAntiTrampas !== "undefined") {
    state.secretSalt = state.secretSalt || seguridadAntiTrampas.generarSalt();
    state.secretHash = await seguridadAntiTrampas.calcularHashPokemon(
      state.secretPokemon.id,
      state.secretSalt,
      state.roomCode
    );
    saveCryptoCommitmentToSession(state.secretSalt, state.secretHash);
  }

  // Marca al jugador como listo
  state.isPlayerReady = true;

  // Regla: La partida solo arranca cuando ambos están conectados Y listos
  const ambosListos = Boolean(estanConectados && state.isRivalReady);
  if (ambosListos) {
    state.isGameStarted = true;
    saveReadyToSession();
  }

  syncReadyUI();
  actualizarUITurno();

  // Sonido de confirmación
  if (state.soundEnabled && sounds.playSelectSecret) {
    sounds.playSelectSecret();
  }

  // Enviar acción P2P con el hash sellado al rival si está conectado
  if (typeof redP2P !== "undefined" && redP2P.conectado && redP2P.enviarAccionJuego) {
    redP2P.enviarAccionJuego("COMPROMISO_HASH", {
      hash: state.secretHash,
      listo: true
    });
  }

  // Avisa en el chat según el estado
  if (typeof vistaChat !== "undefined") {
    vistaChat.agregarBurbuja({
      texto: "👍 Te has declarado listo.",
      tipo: "system"
    });

    if (ambosListos) {
      vistaChat.agregarBurbuja({
        texto: "🎮 ¡Ambos jugadores están conectados y listos! Pokémon secretos fijados. ¡A jugar!",
        tipo: "system"
      });
      showToast("¡Ambos jugadores listos! ¡A jugar!", "success", 4000);
    } else if (estanConectados) {
      showToast("¡Listo! Esperando a que tu rival confirme su Pokémon secreto...", "info", 4000);
      vistaChat.agregarBurbuja({
        texto: "Esperando a que tu rival confirme su Pokémon secreto...",
        tipo: "system"
      });
    } else {
      showToast("¡Listo! Esperando a que tu rival se conecte a la sala para comenzar.", "info", 5000);
      vistaChat.agregarBurbuja({
        texto: "Esperando a que tu rival se conecte a la sala para poder comenzar.",
        tipo: "system"
      });
    }
  }
}

/**
 * Cede el primer turno de la partida al rival (solo disponible para el Anfitrión antes de iniciar)
 */
function cederPrimerTurnoAlRival() {
  if (state.isGameStarted) return;
  const estaConectado = typeof redP2P !== "undefined" ? redP2P.conectado : true;

  if (!estaConectado) {
    showToast("⚠️ Tu rival debe estar conectado a la sala para poder cederle el primer turno.", "warning", 4000);
    if (typeof sounds !== "undefined" && sounds.playFail) sounds.playFail();
    return;
  }

  if (state.primerTurnoCedido) {
    showToast("Ya has cedido el primer turno al rival.", "info");
    return;
  }

  // Registra la cesión del turno
  state.primerTurnoCedido = true;
  state.primerTurnoPara = 2; // El jugador 2 (rival) empezará la partida
  state.esMiTurno = false;
  state.turnoActual = 2;

  if (typeof redP2P !== "undefined" && redP2P.conectado) {
    redP2P.enviarAccionJuego("CEDER_PRIMER_TURNO", {
      primerTurnoPara: 2
    });
  }

  if (typeof sounds !== "undefined" && sounds.playTurnPass) {
    sounds.playTurnPass();
  }

  showToast("🎯 Has cedido el primer turno a tu rival.", "success", 4000);

  if (typeof vistaChat !== "undefined") {
    vistaChat.agregarBurbuja({
      texto: "🎯 Has cedido el primer turno a tu rival. El rival comenzará jugando cuando ambos den ¡Listo!.",
      tipo: "system"
    });
  }

  actualizarUITurno();
}

/**
 * Abre el modal para adivinar el Pokémon secreto del rival
 */
function openGuessModal() {
  if (state.isGameStarted && !state.esMiTurno) {
    showToast("✋ Solo puedes intentar adivinar durante tu turno.", "warning", 3500);
    if (typeof sounds !== "undefined" && sounds.playFail) sounds.playFail();
    return;
  }
  // Prepara y abre el modal
  const modal = document.getElementById("modal-guess-pokemon");
  if (!modal) return;
  renderGuessGrid();
  modal.classList.remove("hidden");
  const inputFilter = document.getElementById("input-guess-filter");
  if (inputFilter) {
    inputFilter.value = "";
    inputFilter.focus();
  }
}

/**
 * Cierra el modal de adivinar
 */
function closeGuessModal() {
  const modal = document.getElementById("modal-guess-pokemon");
  if (modal) modal.classList.add("hidden");
}

/**
 * Filtra los Pokémon dentro del modal de adivinar (por nombre o tipo, en español o inglés)
 */
function handleGuessFilter(query) {
  // Texto de búsqueda normalizado
  const clean = (typeof normalizeSearchText === "function")
    ? normalizeSearchText(query)
    : (query || "").trim().toLowerCase();
  // Muestra solo las coincidencias
  const items = document.querySelectorAll(".guess-item");
  items.forEach(el => {
    const name = (typeof normalizeSearchText === "function")
      ? normalizeSearchText(el.dataset.name)
      : (el.dataset.name || "").toLowerCase();
    const types = (typeof normalizeSearchText === "function")
      ? normalizeSearchText(el.dataset.types)
      : (el.dataset.types || "").toLowerCase();
    const match = name.includes(clean) || types.includes(clean);
    el.style.display = match ? "" : "none";
  });
}

/**
 * Renderiza la lista de candidatos en el modal de adivinar
 */
function renderGuessGrid() {
  const grid = document.getElementById("guess-pokemon-grid");
  if (!grid) return;
  grid.innerHTML = "";

  state.boardPokemonData.forEach(pokemon => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "guess-item";
    item.dataset.name = pokemon.name.toLowerCase();
    item.dataset.types = (typeof getCombinedTypeSearchString === "function")
      ? getCombinedTypeSearchString(pokemon.types)
      : (pokemon.types || []).join(" ").toLowerCase();

    // Marca los ya descartados
    const isDiscarded = state.discardedIds.has(pokemon.id);
    if (isDiscarded) item.classList.add("is-discarded");

    // Miniatura y número del candidato
    const guessThumbHtml = state.roomProMode
      ? `<span class="guess-thumb-pro">?</span>`
      : `<img src="${pokemon.image}" alt="${pokemon.name}" class="guess-thumb ${state.roomGrayscale ? 'sprite-grayscale' : ''}">`;

    const guessNumHtml = !state.roomProMode
      ? `<span class="guess-num">#${String(pokemon.id).padStart(3, "0")}</span>`
      : "";

    item.innerHTML = `
      ${guessThumbHtml}
      ${guessNumHtml}
      <span class="guess-name">${pokemon.name}</span>
    `;

    // Confirma antes de enviar el intento
    item.addEventListener("click", () => {
      const confirmGuess = confirm(`¿Estás seguro de adivinar que el Pokémon secreto de tu rival es ${pokemon.name}?`);
      if (!confirmGuess) return;
      closeGuessModal();
      sendGuessAttempt(pokemon);
    });

    grid.appendChild(item);
  });
}

/**
 * Envía el intento oficial de adivinanza al rival por P2P o lo evalúa en modo local
 */
function sendGuessAttempt(pokemon) {
  // Validaciones de partida y turno
  if (state.isGameOver) {
    showToast("La partida ha finalizado. Pulsa Revancha para empezar de nuevo.", "info");
    return;
  }

  if (state.isGameStarted && !state.esMiTurno) {
    showToast("✋ Solo puedes intentar adivinar durante tu turno.", "warning", 3500);
    return;
  }

  // Con P2P envía el intento al rival
  if (typeof redP2P !== "undefined" && redP2P.conectado) {
    showToast(`Enviando conjetura: "${pokemon.name}"...`, "info", 3000);
    redP2P.enviarAccionJuego("ADIVINAR", {
      guessedPokemonId: pokemon.id,
      intentoNumero: (state.fallosAdivinanza || 0) + 1,
      guesserPokemon: state.secretPokemon ? {
        id: state.secretPokemon.id,
        name: state.secretPokemon.name,
        image: state.secretPokemon.image,
        animatedImage: state.secretPokemon.animatedImage,
        types: state.secretPokemon.types
      } : null,
      guesserSalt: state.secretSalt || null
    });
    if (typeof vistaChat !== "undefined") {
      vistaChat.agregarBurbuja({
        texto: `🎯 ¡Has intentado adivinar que el Pokémon del rival es ${pokemon.name}!`,
        tipo: "user"
      });
    }
  } else {
    // Modo local / sin conexión P2P activa
    // Si no hay P2P conectado, comprobamos si acertó
    const rivalSecret = state.secretPokemonRival || state.secretPokemon;
    const acierto = Boolean(rivalSecret && rivalSecret.id === pokemon.id);

    // Acierto en modo local: muestra victoria
    if (acierto) {
      if (typeof showGameResultModal === "function") {
        showGameResultModal({
          titulo: "🏆 ¡VICTORIA! ¡ADIVINASTE!",
          subtitulo: `¡Adivinaste correctamente! El Pokémon secreto era ${pokemon.name}.`,
          esTrampa: false,
          pokemonRival: pokemon,
          tipoResultado: "victory"
        });
      }
      if (typeof vistaChat !== "undefined") {
        vistaChat.agregarBurbuja({
          texto: `🏆 ¡VICTORIA! ¡Has adivinado que el Pokémon secreto era ${pokemon.name}!`,
          tipo: "system"
        });
      }
    } else {
      // Regla: 2 oportunidades para intentar adivinar
      const jugadorActual = state.turnoActual || 1;
      const fallos = (jugadorActual === 1 ? ++state.fallosAdivinanzaJ1 : ++state.fallosAdivinanzaJ2);

      if (fallos >= 2) {
        // Segundo fallo: El otro jugador gana automáticamente y se muestra el Pokémon secreto del rival
        const jugadorGanador = jugadorActual === 1 ? 2 : 1;

        if (typeof showGameResultModal === "function") {
          showGameResultModal({
            titulo: `🏆 ¡VICTORIA DEL JUGADOR ${jugadorGanador}!`,
            subtitulo: `El Jugador ${jugadorActual} falló sus 2 intentos de adivinanza. ¡El Jugador ${jugadorGanador} gana la partida automáticamente!`,
            esTrampa: false,
            pokemonRival: rivalSecret,
            tipoResultado: "victory"
          });
        }
        if (typeof vistaChat !== "undefined") {
          vistaChat.agregarBurbuja({
            texto: `💀 El Jugador ${jugadorActual} falló su 2do intento de adivinanza y quedó eliminado. 🏆 ¡Gana el Jugador ${jugadorGanador}! El Pokémon secreto del rival era ${rivalSecret.name}.`,
            tipo: "system"
          });
        }
      } else {
        // Primer fallo: NO se le avisa que le queda una oportunidad más (según la instrucción del usuario)
        if (typeof sounds !== "undefined" && sounds.playFail) sounds.playFail();
        terminarTurno({ porFallo: true });
      }
    }
  }
}

/**
 * Solicita revelar ambos Pokémon al terminar y comprobar firmas
 */
function sendRevealAll() {
  if (!redP2P.conectado) {
    showToast("Tu rival debe estar conectado para revelar ambos Pokémon.", "warning");
    return;
  }
  closeGuessModal();
  const conf = confirm("¿Deseas revelar los Pokémon secretos de ambos jugadores?");
  if (!conf) return;

  redP2P.enviarAccionJuego("REVELAR_FINAL", {
    pokemon: {
      id: state.secretPokemon.id,
      name: state.secretPokemon.name,
      image: state.secretPokemon.image,
      animatedImage: state.secretPokemon.animatedImage,
      types: state.secretPokemon.types
    },
    salt: state.secretSalt,
    esRespuesta: false
  });

  showToast("Solicitud de revelación enviada al rival...", "info", 3000);
}

let _confettiAnimFrame = null;

/**
 * Detiene y elimina el canvas de confetti si está activo
 */
function detenerConfettiResultado() {
  if (_confettiAnimFrame) {
    cancelAnimationFrame(_confettiAnimFrame);
    _confettiAnimFrame = null;
  }
  const existing = document.getElementById("result-confetti-canvas");
  if (existing) existing.remove();
}

/**
 * Lanza animación de confetti en pantalla completa:
 * - "victory": explosión festiva brillante (dorado, rojo, azul, amarillo, verde)
 * - "defeat": lluvia lenta y apagada en tonos grises/pizarra
 * @param {"victory"|"defeat"} tipo
 */
function lanzarConfettiResultado(tipo = "victory") {
  detenerConfettiResultado();
  if (typeof document === "undefined") return;

  const canvas = document.createElement("canvas");
  canvas.id = "result-confetti-canvas";
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "10050";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();

  const esVictoria = tipo === "victory";
  const colores = esVictoria
    ? ["#ffd700", "#fbbf24", "#f59e0b", "#ef4444", "#38bdf8", "#34d399", "#f472b6", "#fffbeb"]
    : ["#64748b", "#94a3b8", "#475569", "#78716c", "#52525b", "#6b7280", "#8b7d8b"];

  const cantidad = esVictoria ? 135 : 52;
  const particulas = [];

  for (let i = 0; i < cantidad; i++) {
    if (esVictoria) {
      // Mezcla cañones laterales y lluvia superior
      const origen = i % 3;
      const x = origen === 0 ? 0 : (origen === 1 ? canvas.width : Math.random() * canvas.width);
      const y = origen === 2 ? -20 - Math.random() * 140 : canvas.height * (0.45 + Math.random() * 0.3);
      const vx = origen === 0
        ? 4 + Math.random() * 9
        : (origen === 1 ? -(4 + Math.random() * 9) : (Math.random() - 0.5) * 4);
      const vy = origen === 2 ? 2 + Math.random() * 4 : -(8 + Math.random() * 10);

      particulas.push({
        x, y, vx, vy,
        w: 6 + Math.random() * 7,
        h: 4 + Math.random() * 5,
        color: colores[Math.floor(Math.random() * colores.length)],
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.28,
        wobble: Math.random() * Math.PI * 2,
        alpha: 1,
        forma: Math.random() > 0.25 ? "rect" : "circle"
      });
    } else {
      // Confetti apagado y lento cayendo suavemente desde arriba
      particulas.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 220,
        vx: (Math.random() - 0.5) * 1.1,
        vy: 1.0 + Math.random() * 1.6,
        w: 5 + Math.random() * 5,
        h: 3 + Math.random() * 4,
        color: colores[Math.floor(Math.random() * colores.length)],
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.08,
        wobble: Math.random() * Math.PI * 2,
        alpha: 0.52,
        forma: "rect"
      });
    }
  }

  const inicio = performance.now();
  const duracionMax = esVictoria ? 4400 : 4200;

  const animar = (ahora) => {
    const elapsed = ahora - inicio;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let vivas = 0;
    const fadeFactor = elapsed > duracionMax - 1000
      ? Math.max(0, (duracionMax - elapsed) / 1000)
      : 1;

    for (const p of particulas) {
      if (esVictoria) {
        p.vy += 0.22; // Gravedad alegre
        p.vx *= 0.99;
      } else {
        p.vy += 0.025; // Caída lenta y apagada
        p.vy = Math.min(p.vy, 2.6);
      }

      p.wobble += esVictoria ? 0.09 : 0.04;
      p.x += p.vx + Math.sin(p.wobble) * (esVictoria ? 0.9 : 0.55);
      p.y += p.vy;
      p.rot += p.vRot;

      if (p.y < canvas.height + 40 && fadeFactor > 0.01) {
        vivas++;
        ctx.save();
        ctx.globalAlpha = p.alpha * fadeFactor;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.forma === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.w * 0.45, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
    }

    if (vivas > 0 && elapsed < duracionMax) {
      _confettiAnimFrame = requestAnimationFrame(animar);
    } else {
      detenerConfettiResultado();
    }
  };

  _confettiAnimFrame = requestAnimationFrame(animar);
}

/**
 * Muestra el modal con el resultado y la comprobación criptográfica
 */
function showGameResultModal({ titulo, subtitulo, esTrampa, pokemonRival, etiquetaPokemon, tipoResultado }) {
  const modal = document.getElementById("modal-game-result");
  const cardEl = modal ? modal.querySelector(".modal-result-card") : null;
  const titleEl = document.getElementById("result-modal-title");
  const bodyEl = document.getElementById("result-modal-body");
  if (!modal || !bodyEl) return;

  // Marca el fin de la partida
  state.isGameOver = true;

  // Determina el tipo visual/sonoro del resultado
  const tituloUpper = String(titulo || "").toUpperCase();
  let tipo = tipoResultado;
  if (!tipo) {
    if (esTrampa) tipo = "cheat";
    else if (tituloUpper.includes("VICTORIA")) tipo = "victory";
    else if (tituloUpper.includes("DERROTA")) tipo = "defeat";
    else tipo = "neutral";
  }

  // Aplica la clase visual del resultado al modal (victoria dorada o derrota apagada)
  if (cardEl) {
    cardEl.classList.remove("result-victory", "result-defeat", "result-cheat");
    if (tipo === "victory") cardEl.classList.add("result-victory");
    else if (tipo === "defeat") cardEl.classList.add("result-defeat");
    else if (tipo === "cheat") cardEl.classList.add("result-cheat");
  }

  // El botón de reiniciar partida solo aparece cuando la partida se haya acabado
  const btnRestartMatch = document.getElementById("btn-restart-match");
  if (btnRestartMatch) {
    btnRestartMatch.classList.remove("hidden");
  }

  if (typeof actualizarUITurno === "function") {
    actualizarUITurno();
  }

  // Separa el emoji inicial del texto para que el degradado dorado no tiña el trofeo
  if (titleEl) {
    const rawTitle = String(titulo || "");
    const emojiMatch = rawTitle.match(/^(\p{Extended_Pictographic}\uFE0F?)\s*(.*)$/u);
    if (emojiMatch) {
      titleEl.innerHTML = `<span class="result-title-icon">${emojiMatch[1]}</span><span class="result-title-text">${emojiMatch[2]}</span>`;
    } else {
      titleEl.innerHTML = `<span class="result-title-text">${rawTitle}</span>`;
    }
  }

  // Aviso si hubo trampa
  let badgeHtml = "";
  if (esTrampa) {
    badgeHtml = `
      <div class="result-badge badge-cheat">
        <span class="badge-icon">🚨</span>
        <div>
          <strong>¡Trampa Detectada!</strong>
          <p>El rival modificó su Pokémon durante la partida.</p>
        </div>
      </div>
    `;
  }

  // Muestra el Pokémon del rival
  let pokeHtml = "";
  if (pokemonRival) {
    const labelTexto = etiquetaPokemon || "Pokémon que eligió tu rival:";
    pokeHtml = `
      <div class="result-pokemon-showcase">
        <span class="result-showcase-label" style="font-size:0.85rem; color:var(--text-muted); display:block; margin-bottom:0.2rem;">${labelTexto}</span>
        <img src="${pokemonRival.animatedImage || pokemonRival.image}" alt="${pokemonRival.name}" class="result-poke-img">
        <h4>#${String(pokemonRival.id).padStart(3, "0")} ${pokemonRival.name}</h4>
      </div>
    `;
  }

  // Rellena y abre el modal
  bodyEl.innerHTML = `
    <p class="result-subtitle">${subtitulo}</p>
    ${pokeHtml}
    ${badgeHtml}
  `;

  modal.classList.remove("hidden");

  // Efectos de sonido y confetti según victoria o derrota
  if (tipo === "victory") {
    if (typeof sounds !== "undefined" && sounds.playVictory) sounds.playVictory();
    lanzarConfettiResultado("victory");
  } else if (tipo === "defeat") {
    if (typeof sounds !== "undefined" && sounds.playDefeat) sounds.playDefeat();
    lanzarConfettiResultado("defeat");
  } else if (tipo === "cheat") {
    if (typeof sounds !== "undefined" && sounds.playFail) sounds.playFail();
  }
}

/**
 * Entra al modo de selección de Pokémon secreto desde el tablero
 */
function enterSelectingSecretMode() {
  // No permite cambiar si ya empezó
  const partidaBloqueada = state.isGameStarted || (state.isPlayerReady && state.isRivalReady);
  if (partidaBloqueada) {
    showToast("La partida ya comenzó. No puedes cambiar tu Pokémon secreto.", "warning");
    return;
  }
  state.isSelectingSecretMode = true;
  const boardSection = document.getElementById("view-board");
  const banner = document.getElementById("board-instruction-banner");

  if (boardSection) boardSection.classList.add("selecting-secret-mode");
  if (banner) banner.classList.remove("hidden");

  showToast("Haz clic en cualquier carta del tablero para elegirla como secreto.", "info", 4000);
}

/**
 * Sale del modo de selección de secreto
 */
function exitSelectingSecretMode() {
  state.isSelectingSecretMode = false;
  const boardSection = document.getElementById("view-board");
  const banner = document.getElementById("board-instruction-banner");

  if (boardSection) boardSection.classList.remove("selecting-secret-mode");
  if (banner) banner.classList.add("hidden");
}

/**
 * Filtro de búsqueda rápida en el tablero (nombre o tipo, en español o inglés, con o sin tildes)
 * @param {string} query
 */
function handleBoardFilter(query) {
  // Normaliza el texto de búsqueda
  const clean = (typeof normalizeSearchText === "function")
    ? normalizeSearchText(query)
    : (query || "").trim().toLowerCase();
  const cards = document.querySelectorAll(".poke-card");

  // Oculta las cartas que no coinciden
  cards.forEach(card => {
    if (!clean) {
      card.style.display = "";
      return;
    }
    const name = (typeof normalizeSearchText === "function")
      ? normalizeSearchText(card.dataset.name)
      : (card.dataset.name || "").toLowerCase();
    const types = (typeof normalizeSearchText === "function")
      ? normalizeSearchText(card.dataset.types)
      : (card.dataset.types || "").toLowerCase();
    const matches = name.includes(clean) || types.includes(clean);
    card.style.display = matches ? "" : "none";
  });
}

/**
 * Vincula todos los event listeners de la Pantalla 2 (Tablero)
 */
function bindBoardEvents() {
  // Botón de nueva configuración
  const btnNewConfig = document.getElementById("btn-new-config");
  if (btnNewConfig) {
    btnNewConfig.addEventListener("click", () => {
      if (typeof redP2P !== "undefined") {
        redP2P.cerrar();
      }
      window.history.replaceState({}, "", window.location.pathname);
      showView("view-setup");
      showToast("Configura una nueva partida.", "info");
    });
  }

  // Botón de copiar enlace (con alternativa)
  const btnCopyLink = document.getElementById("btn-copy-link");
  if (btnCopyLink) {
    btnCopyLink.addEventListener("click", async () => {
      if (!state.roomCode) return;
      const url = `${window.location.origin}${window.location.pathname}?sala=${encodeURIComponent(state.roomCode)}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast("¡Enlace de sala copiado al portapapeles!", "success");
      } catch (err) {
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        showToast("¡Enlace copiado al portapapeles!", "success");
      }
    });
  }

  // Botón de ocultar código de sala
  const btnToggleCodeHide = document.getElementById("btn-toggle-code-hide");
  if (btnToggleCodeHide) {
    btnToggleCodeHide.addEventListener("click", () => {
      isRoomCodeHidden = !isRoomCodeHidden;
      const codeEl = document.getElementById("board-room-code");
      const iconOpen = document.getElementById("icon-code-eye-open");
      const iconClosed = document.getElementById("icon-code-eye-closed");

      if (codeEl) {
        codeEl.textContent = isRoomCodeHidden ? "••••••••••" : (state.roomCode || "------");
      }
      if (iconOpen && iconClosed) {
        iconOpen.classList.toggle("hidden", isRoomCodeHidden);
        iconClosed.classList.toggle("hidden", !isRoomCodeHidden);
      }
      btnToggleCodeHide.title = isRoomCodeHidden ? "Mostrar código de sala" : "Ocultar código de sala";
      btnToggleCodeHide.setAttribute("aria-label", btnToggleCodeHide.title);
      playSound("click");
    });
  }

  // Botón de copiar código
  const btnCopyCode = document.getElementById("btn-copy-code");
  if (btnCopyCode) {
    btnCopyCode.addEventListener("click", async () => {
      if (!state.roomCode) return;
      try {
        await navigator.clipboard.writeText(state.roomCode);
        showToast(`Código copiado: ${state.roomCode}`, "success");
      } catch (e) {
        const input = document.createElement("input");
        input.value = state.roomCode;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        showToast(`Código copiado: ${state.roomCode}`, "success");
      }
    });
  }

  // Botón de quitar todos los descartes
  const btnReset = document.getElementById("btn-reset-discards");
  if (btnReset) {
    btnReset.addEventListener("click", resetDiscards);
  }

  // Botón de ocultar secreto
  const btnToggleSecretHide = document.getElementById("btn-toggle-secret-hide");
  if (btnToggleSecretHide) {
    btnToggleSecretHide.addEventListener("click", toggleSecretHide);
  }

  // Botón de grito del secreto
  const btnPlaySecretCry = document.getElementById("btn-play-secret-cry");
  if (btnPlaySecretCry) {
    btnPlaySecretCry.addEventListener("click", () => {
      if (state.secretPokemon) {
        if (typeof sounds !== "undefined" && sounds.playPokemonCry) {
          sounds.playPokemonCry(state.secretPokemon.id, state.secretPokemon.cry);
        }
      } else {
        showToast("⚠️ Aún no has seleccionado tu Pokémon secreto.", "info");
      }
    });
  }

  // Clic en el secreto reproduce su grito
  const secretBody = document.getElementById("secret-body");
  if (secretBody) {
    secretBody.addEventListener("click", () => {
      if (state.secretPokemon && !state.isSecretHidden) {
        if (typeof sounds !== "undefined" && sounds.playPokemonCry) {
          sounds.playPokemonCry(state.secretPokemon.id, state.secretPokemon.cry);
        }
      }
    });
  }

  // Botones de elegir y confirmar secreto
  const btnChangeSecret = document.getElementById("btn-change-secret");
  if (btnChangeSecret) {
    btnChangeSecret.addEventListener("click", enterSelectingSecretMode);
  }

  const btnReadyGame = document.getElementById("btn-ready-game");
  if (btnReadyGame) {
    btnReadyGame.addEventListener("click", handleReadyClick);
  }

  const btnCancelSecret = document.getElementById("btn-cancel-secret-select");
  if (btnCancelSecret) {
    btnCancelSecret.addEventListener("click", exitSelectingSecretMode);
  }

  // Buscador del tablero
  const inputFilter = document.getElementById("input-board-filter");
  if (inputFilter) {
    inputFilter.addEventListener("input", e => {
      handleBoardFilter(e.target.value);
    });
  }

  // Botón de reintentar la carga
  const btnRetry = document.getElementById("btn-retry-fetch");
  if (btnRetry) {
    btnRetry.addEventListener("click", renderAndFetchBoardPokemon);
  }

  // Evento de Terminar Turno / Ceder Primer Turno
  const btnFinishTurn = document.getElementById("btn-finish-turn");
  if (btnFinishTurn) {
    btnFinishTurn.addEventListener("click", () => {
      if (!state.isGameStarted) {
        // Fase previa a iniciar la partida: Ceder el primer turno al rival
        const esAnfitrion = typeof redP2P !== "undefined" ? redP2P.esAnfitrion : true;
        if (!esAnfitrion) return;
        cederPrimerTurnoAlRival();
        return;
      }

      if (!state.esMiTurno) {
        showToast("✋ Es el turno de tu rival. Espera a que termine.", "warning");
        if (typeof sounds !== "undefined" && sounds.playFail) sounds.playFail();
        return;
      }
      terminarTurno({ porFallo: false });
    });
  }

  // Eventos de Adivinar y Anti-Trampas
  const btnGuessRival = document.getElementById("btn-guess-rival");
  if (btnGuessRival) {
    btnGuessRival.addEventListener("click", openGuessModal);
  }

  const btnCloseGuess = document.getElementById("btn-close-guess-modal");
  if (btnCloseGuess) {
    btnCloseGuess.addEventListener("click", closeGuessModal);
  }

  const inputGuessFilter = document.getElementById("input-guess-filter");
  if (inputGuessFilter) {
    inputGuessFilter.addEventListener("input", e => handleGuessFilter(e.target.value));
  }

  const btnRevealAll = document.getElementById("btn-reveal-all");
  if (btnRevealAll) {
    btnRevealAll.addEventListener("click", sendRevealAll);
  }

  // Cierre del modal de resultado
  const btnCloseResult = document.getElementById("btn-close-result-modal");
  const btnAckResult = document.getElementById("btn-ack-result");
  const modalResult = document.getElementById("modal-game-result");
  const closeResult = () => {
    detenerConfettiResultado();
    if (modalResult) modalResult.classList.add("hidden");
  };
  if (btnCloseResult) btnCloseResult.addEventListener("click", closeResult);
  if (btnAckResult) btnAckResult.addEventListener("click", closeResult);

  // Eventos de Reinicio / Revancha de Partida con Mismos Pokémon
  const btnRestartMatch = document.getElementById("btn-restart-match");
  if (btnRestartMatch) {
    btnRestartMatch.addEventListener("click", abrirModalReinicio);
  }

  // Botón de revancha desde el resultado
  const btnRestartFromModal = document.getElementById("btn-restart-from-modal");
  if (btnRestartFromModal) {
    btnRestartFromModal.addEventListener("click", () => {
      closeResult();
      abrirModalReinicio();
    });
  }

  // Botones del modal de reinicio
  const btnCloseRestart = document.getElementById("btn-close-restart-modal");
  if (btnCloseRestart) {
    btnCloseRestart.addEventListener("click", cancelarSolicitudReinicio);
  }

  const btnRestartCancel = document.getElementById("btn-restart-cancel");
  if (btnRestartCancel) {
    btnRestartCancel.addEventListener("click", cancelarSolicitudReinicio);
  }

  const btnRestartSend = document.getElementById("btn-restart-send");
  if (btnRestartSend) {
    btnRestartSend.addEventListener("click", solicitarReinicioPartida);
  }

  const btnRestartAccept = document.getElementById("btn-restart-accept");
  if (btnRestartAccept) {
    btnRestartAccept.addEventListener("click", aceptarReinicioPartida);
  }

  const btnRestartReject = document.getElementById("btn-restart-reject");
  if (btnRestartReject) {
    btnRestartReject.addEventListener("click", rechazarReinicioPartida);
  }
}

/**
 * Abre el modal de confirmación de reinicio de partida
 */
function abrirModalReinicio() {
  // Elementos del modal de reinicio
  const modal = document.getElementById("modal-restart-confirm");
  const viewPrompt = document.getElementById("restart-state-prompt");
  const viewWaiting = document.getElementById("restart-state-waiting");
  const viewReceived = document.getElementById("restart-state-received");
  const btnCancel = document.getElementById("btn-restart-cancel");
  const btnSend = document.getElementById("btn-restart-send");
  const btnAccept = document.getElementById("btn-restart-accept");
  const btnReject = document.getElementById("btn-restart-reject");

  if (!modal) return;

  // Limpia solicitudes previas
  state.solicitudReinicioEnviada = false;
  state.solicitudReinicioRecibida = false;

  // Muestra solo la pantalla de pregunta
  if (viewPrompt) viewPrompt.classList.remove("hidden");
  if (viewWaiting) viewWaiting.classList.add("hidden");
  if (viewReceived) viewReceived.classList.add("hidden");

  if (btnCancel) btnCancel.classList.remove("hidden");
  if (btnSend) {
    btnSend.classList.remove("hidden");
    const estaConectado = typeof redP2P !== "undefined" && redP2P.conectado;
    btnSend.textContent = estaConectado ? "Solicitar Reinicio" : "Confirmar Reinicio (Ambos)";
  }
  if (btnAccept) btnAccept.classList.add("hidden");
  if (btnReject) btnReject.classList.add("hidden");

  modal.classList.remove("hidden");
}

/**
 * Cierra el modal de confirmación de reinicio
 */
function cerrarModalReinicio() {
  const modal = document.getElementById("modal-restart-confirm");
  if (modal) modal.classList.add("hidden");
}

/**
 * Solicita el reinicio de la partida con los mismos Pokémon
 */
function solicitarReinicioPartida() {
  const estaConectado = typeof redP2P !== "undefined" && redP2P.conectado;

  // Con P2P pide el reinicio al rival
  if (estaConectado) {
    if (state.solicitudReinicioRecibida) {
      aceptarReinicioPartida();
      return;
    }

    state.solicitudReinicioEnviada = true;

    const viewPrompt = document.getElementById("restart-state-prompt");
    const viewWaiting = document.getElementById("restart-state-waiting");
    const btnSend = document.getElementById("btn-restart-send");

    if (viewPrompt) viewPrompt.classList.add("hidden");
    if (viewWaiting) viewWaiting.classList.remove("hidden");
    if (btnSend) btnSend.classList.add("hidden");

    redP2P.enviarAccionJuego("SOLICITAR_REINICIO", {});

    if (typeof vistaChat !== "undefined") {
      vistaChat.agregarBurbuja({
        texto: "📢 Has solicitado reiniciar la partida. Esperando que tu rival acepte la revancha.",
        tipo: "system"
      });
    }
    showToast("Solicitud de reinicio enviada al rival...", "info", 4000);
  } else {
    // Modo local / 1 dispositivo
    cerrarModalReinicio();
    reiniciarPartidaMismosPokemon();
  }
}

/**
 * Muestra el modal cuando el rival ha solicitado reiniciar la partida
 */
function mostrarModalSolicitudReinicioRecibida() {
  state.solicitudReinicioRecibida = true;

  // Oculta el resultado y muestra la solicitud
  const modalResult = document.getElementById("modal-game-result");
  if (modalResult) modalResult.classList.add("hidden");

  const modal = document.getElementById("modal-restart-confirm");
  const viewPrompt = document.getElementById("restart-state-prompt");
  const viewWaiting = document.getElementById("restart-state-waiting");
  const viewReceived = document.getElementById("restart-state-received");
  const btnCancel = document.getElementById("btn-restart-cancel");
  const btnSend = document.getElementById("btn-restart-send");
  const btnAccept = document.getElementById("btn-restart-accept");
  const btnReject = document.getElementById("btn-restart-reject");

  if (!modal) return;

  // Muestra solo la vista de solicitud recibida
  if (viewPrompt) viewPrompt.classList.add("hidden");
  if (viewWaiting) viewWaiting.classList.add("hidden");
  if (viewReceived) viewReceived.classList.remove("hidden");

  if (btnCancel) btnCancel.classList.add("hidden");
  if (btnSend) btnSend.classList.add("hidden");
  if (btnAccept) btnAccept.classList.remove("hidden");
  if (btnReject) btnReject.classList.remove("hidden");

  modal.classList.remove("hidden");

  // Sonido y avisos al rival
  if (typeof sounds !== "undefined" && sounds.playTurnStart) {
    sounds.playTurnStart();
  }
  showToast("¡Tu rival solicita reiniciar la partida!", "info", 6000);

  if (typeof vistaChat !== "undefined") {
    vistaChat.agregarBurbuja({
      texto: "📢 ¡Tu rival ha solicitado reiniciar la partida con los mismos Pokémon!",
      tipo: "system"
    });
  }
}

/**
 * Acepta la solicitud de reinicio del rival
 */
function aceptarReinicioPartida() {
  if (typeof redP2P !== "undefined" && redP2P.conectado) {
    redP2P.enviarAccionJuego("ACEPTAR_REINICIO", {});
  }
  cerrarModalReinicio();
  reiniciarPartidaMismosPokemon();
}

/**
 * Rechaza la solicitud de reinicio del rival
 */
function rechazarReinicioPartida() {
  if (typeof redP2P !== "undefined" && redP2P.conectado) {
    redP2P.enviarAccionJuego("RECHAZAR_REINICIO", {});
  }
  state.solicitudReinicioRecibida = false;
  cerrarModalReinicio();

  if (typeof vistaChat !== "undefined") {
    vistaChat.agregarBurbuja({
      texto: "Has rechazado la solicitud de reinicio.",
      tipo: "system"
    });
  }
  showToast("Reinicio rechazado.", "info");
}

/**
 * Cancela una solicitud de reinicio enviada
 */
function cancelarSolicitudReinicio() {
  if (state.solicitudReinicioEnviada && typeof redP2P !== "undefined" && redP2P.conectado) {
    redP2P.enviarAccionJuego("CANCELAR_REINICIO", {});
  }
  state.solicitudReinicioEnviada = false;
  cerrarModalReinicio();
}

/**
 * Reinicia la partida conservando las mismas configuraciones y los mismos 30 Pokémon
 */
function reiniciarPartidaMismosPokemon() {
  // Limpiar modales abiertos y confetti
  detenerConfettiResultado();
  cerrarModalReinicio();
  const modalResult = document.getElementById("modal-game-result");
  if (modalResult) modalResult.classList.add("hidden");
  const modalGuess = document.getElementById("modal-guess-pokemon");
  if (modalGuess) modalGuess.classList.add("hidden");

  // Limpiar estados de revancha y límites de adivinanza
  state.isGameOver = false;
  state.fallosAdivinanza = 0;
  state.fallosAdivinanzaRival = 0;
  state.fallosAdivinanzaJ1 = 0;
  state.fallosAdivinanzaJ2 = 0;
  state.primerTurnoCedido = false;
  state.primerTurnoPara = 1;
  state.solicitudReinicioEnviada = false;
  state.solicitudReinicioRecibida = false;

  // Ocultar de nuevo el botón de reiniciar partida en la barra superior (solo se muestra al terminar la partida)
  const btnRestartMatch = document.getElementById("btn-restart-match");
  if (btnRestartMatch) {
    btnRestartMatch.classList.add("hidden");
  }

  // Limpiar descartes
  state.discardedIds.clear();
  saveDiscardsToSession();
  document.querySelectorAll(".poke-card").forEach(c => c.classList.remove("descartada"));

  // Limpiar filtro de búsqueda
  const inputFilter = document.getElementById("input-board-filter");
  if (inputFilter) {
    inputFilter.value = "";
    handleBoardFilter("");
  }

  // Quitar insignias previas de secreto en cartas
  document.querySelectorAll(".secret-owner-badge").forEach(b => b.remove());
  document.querySelectorAll(".poke-card").forEach(c => c.classList.remove("is-secret-pokemon"));

  // Resetear estados de juego y seguridad criptográfica
  state.isGameStarted = false;
  state.isPlayerReady = false;
  state.isRivalReady = false;
  state.secretSalt = null;
  state.secretHash = null;
  state.rivalSecretHash = null;

  try {
    sessionStorage.removeItem(`poke_ready_${state.roomCode}`);
    sessionStorage.removeItem(`poke_salt_${state.roomCode}`);
    sessionStorage.removeItem(`poke_hash_${state.roomCode}`);
    sessionStorage.removeItem(`poke_secret_${state.roomCode}`);
  } catch (e) {}

  // Asignar un nuevo Pokémon secreto aleatorio dentro de los mismos 30
  initSecretPokemon();

  // Resetear sistema de turnos
  state.numeroTurno = 1;
  state.turnoActual = 1;
  if (typeof redP2P !== "undefined" && redP2P.conectado) {
    state.esMiTurno = Boolean(redP2P.esAnfitrion);
  } else {
    state.esMiTurno = true;
  }
  saveTurnToSession();
  actualizarUITurno();

  // Sincronizar UI
  updateCounterAndProgress();
  syncReadyUI();

  // Sonidos y notificaciones
  if (typeof sounds !== "undefined" && sounds.playTurnStart) {
    sounds.playTurnStart();
  }
  const totalCards = state.boardPokemonData.length || (state.roomGameMode === "starters" ? 27 : 30);
  showToast(`🔄 ¡Partida reiniciada! Mismos ${totalCards} Pokémon listos para jugar.`, "success", 4500);

  if (typeof vistaChat !== "undefined") {
    vistaChat.actualizarRivalRestantes(totalCards);
    vistaChat.agregarBurbuja({
      texto: "🔄 ¡Partida reiniciada con las mismas configuraciones y los mismos Pokémon! Elige tu Pokémon secreto y pulsa ¡Listo!.",
      tipo: "system"
    });
  }
}
