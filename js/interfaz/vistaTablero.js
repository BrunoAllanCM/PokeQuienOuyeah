/**
 * Controlador del Tablero de Juego (Pantalla 2)
 * Renderizado de cartas 3D, gestión de Pokémon secreto, descartes y filtros
 */

/**
 * Alterna la vista activa entre Setup y Tablero
 * @param {"view-setup"|"view-board"} viewId
 */
function showView(viewId) {
  document.querySelectorAll(".view-section").forEach(view => {
    view.classList.remove("active");
  });
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
  const parsed = parseRoomCode(code);
  if (!parsed.valid) {
    showToast(parsed.error, "error");
    return;
  }

  state.roomCode = parsed.code;
  state.roomSeed = parsed.seed;
  state.roomGens = parsed.gens;
  state.roomShowTypes = parsed.showTypes;
  state.roomShowGens = parsed.showGens;
  state.roomGrayscale = parsed.grayscale || false;
  state.roomProMode = Boolean(parsed.proMode);

  const newUrl = `${window.location.pathname}?sala=${encodeURIComponent(state.roomCode)}`;
  window.history.replaceState({ sala: state.roomCode }, "", newUrl);

  showView("view-board");
  renderBoardHeader();
  state.boardPokemonIds = computeBoardIds(state.roomSeed, state.roomGens);
  loadDiscardsFromSession();
  loadReadyFromSession();
  loadCryptoCommitmentFromSession();
  if (typeof seguridadAntiTrampas !== "undefined") {
    seguridadAntiTrampas.blindarEstadoJuego(state);
  }
  syncReadyUI();
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

  if (codeEl) {
    codeEl.dataset.fullCode = state.roomCode || "";
    codeEl.textContent = isRoomCodeHidden ? "••••••••••" : (state.roomCode || "------");
  }

  if (gensBadge) {
    if (state.roomProMode) {
      gensBadge.textContent = "Datos: Ocultos";
    } else if (state.roomGens.length === 9) {
      gensBadge.textContent = "Gen 1-9 (Todas)";
    } else {
      gensBadge.textContent = `Gen ${state.roomGens.join(", ")}`;
    }
  }

  if (typesBadge) {
    if (state.roomProMode) {
      typesBadge.textContent = "Modo: Solo Nombre";
    } else {
      typesBadge.textContent = state.roomShowTypes ? "Tipos: Visibles" : "Tipos: Ocultos";
    }
  }

  if (grayscaleBadge) {
    if (state.roomProMode) {
      grayscaleBadge.textContent = "Sprites: Desactivados";
    } else {
      grayscaleBadge.textContent = state.roomGrayscale ? "Sprites: Blanco y Negro" : "Sprites: Color Normal";
    }
  }
}

/**
 * Renderiza 30 skeletons shimmer mientras carga PokéAPI
 */
function renderSkeletonGrid() {
  const grid = document.getElementById("board-cards-grid");
  if (!grid) return;
  grid.innerHTML = "";

  for (let i = 0; i < 30; i++) {
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
 * Descarga los 30 Pokémon en paralelo y renderiza las cartas reales
 */
async function renderAndFetchBoardPokemon() {
  const errorPanel = document.getElementById("board-error-panel");
  if (errorPanel) errorPanel.classList.add("hidden");

  renderSkeletonGrid();

  try {
    const promises = state.boardPokemonIds.map(id => fetchPokemonData(id));
    state.boardPokemonData = await Promise.all(promises);

    initSecretPokemon();
    renderBoardCards();
    updateCounterAndProgress();
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

    card.className = `poke-card ${isDiscarded ? "descartada" : ""} ${isSecret ? "is-secret-pokemon" : ""}`;
    card.dataset.id = pokemon.id;
    card.dataset.name = pokemon.name.toLowerCase();
    card.dataset.types = (typeof getCombinedTypeSearchString === "function")
      ? getCombinedTypeSearchString(pokemon.types)
      : pokemon.types.join(" ");

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

    const secretOwnerBadgeHtml = isSecret ? `<span class="secret-owner-badge">★ TU SECRETO</span>` : "";
    const genBadgeHtml = (state.roomShowGens && !state.roomProMode) ? `<span class="card-gen-badge">${getGenForPokemonId(pokemon.id)}</span>` : "";
    const cardNumHtml = !state.roomProMode ? `<span class="card-num">#${String(pokemon.id).padStart(3, "0")}</span>` : "";
    const nameHtml = `<span class="card-name" title="${pokemon.name}">${pokemon.name}</span>`;

    const imgWrapHtml = state.roomProMode
      ? `<div class="card-img-wrap pro-mystery-wrap"><div class="pro-mystery-icon">?</div></div>`
      : `
        <div class="card-img-wrap">
          ${pokemon.animatedImage ? `
            <img
              src="${pokemon.animatedImage}"
              alt="${pokemon.name} animado"
              class="card-img card-img-animated ${state.roomGrayscale ? 'sprite-grayscale' : ''}"
              loading="lazy"
              onerror="this.classList.add('hidden')"
            >
          ` : ""}
          <img
            src="${pokemon.image}"
            alt="${pokemon.name}"
            class="card-img card-img-static ${state.roomGrayscale ? 'sprite-grayscale' : ''}"
            loading="lazy"
          >
        </div>
      `;

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

    card.addEventListener("click", () => handleCardClick(pokemon));
    grid.appendChild(card);
  });
}

/**
 * Manejo del clic en una carta del tablero (descarte o selección de secreto)
 * @param {{ id: number, name: string, image: string, types: string[] }} pokemon
 */
function handleCardClick(pokemon) {
  if (state.isSelectingSecretMode) {
    setSecretPokemon(pokemon);
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

  if (state.discardedIds.has(pokemon.id)) {
    state.discardedIds.delete(pokemon.id);
  } else {
    state.discardedIds.add(pokemon.id);
    sounds.playFlip();
  }

  saveDiscardsToSession();

  const card = document.querySelector(`.poke-card[data-id="${pokemon.id}"]`);
  if (card) {
    card.classList.toggle("descartada", state.discardedIds.has(pokemon.id));
  }

  updateCounterAndProgress();

  // Sincronizar acción de descarte con el rival en tiempo real
  if (typeof redP2P !== "undefined" && redP2P.conectado) {
    const restantes = 30 - state.discardedIds.size;
    redP2P.enviarAccionJuego("DESCARTE", { restantes });
  }
}

/**
 * Actualiza el contador dinámico Restantes: X / 30 y la barra de progreso
 */
function updateCounterAndProgress() {
  const remainingCount = 30 - state.discardedIds.size;
  const counterEl = document.getElementById("counter-remaining");
  const progressFill = document.getElementById("mini-progress-fill");

  if (counterEl) {
    counterEl.textContent = remainingCount;
  }

  if (progressFill) {
    const percent = Math.max(0, Math.min(100, (remainingCount / 30) * 100));
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

  document.querySelectorAll(".poke-card").forEach(card => {
    card.classList.remove("descartada");
  });

  updateCounterAndProgress();
  sounds.playFlip();
  showToast("Se han desmarcado todas las cartas.", "info");

  if (typeof redP2P !== "undefined" && redP2P.conectado) {
    redP2P.enviarAccionJuego("REINICIO", { restantes: 30 });
  }
}

/**
 * Inicializa el Pokémon secreto usando sessionStorage o Math.random() independiente
 */
function initSecretPokemon() {
  const sessionKey = `poke_secret_${state.roomCode}`;
  let secretId = null;

  try {
    const stored = sessionStorage.getItem(sessionKey);
    if (stored) {
      secretId = parseInt(stored, 10);
    }
  } catch (e) {}

  let poke = state.boardPokemonData.find(p => p.id === secretId);

  if (!poke && state.boardPokemonData.length > 0) {
    const randomIndex = Math.floor(Math.random() * state.boardPokemonData.length);
    poke = state.boardPokemonData[randomIndex];
    try {
      sessionStorage.setItem(sessionKey, String(poke.id));
    } catch (e) {}
  }

  setSecretPokemon(poke);
}

/**
 * Asigna un Pokémon como secreto y actualiza el widget en la barra superior
 * @param {{ id: number, name: string, image: string, types: string[] }} pokemon
 */
function setSecretPokemon(pokemon) {
  if (!pokemon) return;
  state.secretPokemon = pokemon;

  try {
    sessionStorage.setItem(`poke_secret_${state.roomCode}`, String(pokemon.id));
  } catch (e) {}

  const imgEl = document.getElementById("secret-img");
  const numEl = document.getElementById("secret-num");
  const nameEl = document.getElementById("secret-name");
  const typesEl = document.getElementById("secret-types");

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
      imgEl.dataset.static = pokemon.image;
      imgEl.src = pokemon.animatedImage || pokemon.image;
      imgEl.alt = pokemon.name;
      imgEl.classList.toggle("sprite-grayscale", !!state.roomGrayscale);
    }
  }
  if (numEl) {
    if (state.roomProMode) {
      numEl.textContent = "MODO PRO";
    } else {
      const genText = state.roomShowGens ? ` • ${getGenForPokemonId(pokemon.id)}` : "";
      numEl.textContent = `#${String(pokemon.id).padStart(3, "0")}${genText}`;
    }
  }
  if (nameEl) {
    nameEl.textContent = pokemon.name;
  }
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

  // La partida se bloquea únicamente si ya inició oficialmente o si ambos están listos
  const partidaBloqueada = state.isGameStarted || (state.isPlayerReady && state.isRivalReady);

  if (partidaBloqueada) {
    state.isGameStarted = true;
    if (btnChange) btnChange.classList.add("hidden");
    if (btnReady) btnReady.classList.add("hidden");
    if (rivalNote) rivalNote.classList.add("hidden");
    if (badgeLocked) badgeLocked.classList.remove("hidden");
    if (btnGuess && (typeof redP2P !== "undefined" && redP2P.conectado)) {
      btnGuess.classList.remove("hidden");
    }
  } else {
    // Si la partida NO ha comenzado oficialmente:
    // El botón de cambiar SIEMPRE está disponible
    if (btnChange) btnChange.classList.remove("hidden");
    if (btnReady) btnReady.classList.remove("hidden");
    if (badgeLocked) badgeLocked.classList.add("hidden");
    if (btnGuess) btnGuess.classList.add("hidden");

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
  // Si la partida ya empezó oficialmente (ambos listos), no hacer nada
  if (state.isGameStarted || (state.isPlayerReady && state.isRivalReady)) return;
  if (!state.secretPokemon) return;

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

  state.isPlayerReady = true;

  // Si el rival ya estaba listo o jugamos solos, la partida arranca y se bloquea
  const ambosListos = state.isRivalReady || (typeof redP2P !== "undefined" && !redP2P.conectado);
  if (ambosListos) {
    state.isGameStarted = true;
    saveReadyToSession();
  }

  syncReadyUI();

  if (state.soundEnabled && sounds.playSelectSecret) {
    sounds.playSelectSecret();
  }

  // Enviar acción P2P con el hash sellado al rival
  if (typeof redP2P !== "undefined" && redP2P.enviarAccionJuego) {
    redP2P.enviarAccionJuego("COMPROMISO_HASH", {
      hash: state.secretHash,
      listo: true
    });
  }

  if (typeof vistaChat !== "undefined") {
    vistaChat.agregarBurbuja({
      texto: "👍 Te has declarado listo.",
      tipo: "system"
    });

    if (state.isRivalReady) {
      vistaChat.agregarBurbuja({
        texto: "🎮 ¡Ambos jugadores están listos! Pokémon secretos fijados. ¡A jugar!",
        tipo: "system"
      });
      showToast("¡Ambos jugadores listos! ¡A jugar!", "success", 4000);
    } else if (redP2P.conectado) {
      showToast("¡Listo! Puedes cambiar tu Pokémon hasta que tu rival también confirme.", "info", 4000);
      vistaChat.agregarBurbuja({
        texto: "Esperando a que tu rival confirme su Pokémon secreto...",
        tipo: "system"
      });
    } else {
      showToast("¡Estás listo! Tu Pokémon secreto ha quedado fijado.", "success", 3500);
    }
  }
}

/**
 * Abre el modal para adivinar el Pokémon secreto del rival
 */
function openGuessModal() {
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
  const clean = (typeof normalizeSearchText === "function")
    ? normalizeSearchText(query)
    : (query || "").trim().toLowerCase();
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

    const isDiscarded = state.discardedIds.has(pokemon.id);
    if (isDiscarded) item.classList.add("is-discarded");

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
 * Envía el intento oficial de adivinanza al rival por P2P
 */
function sendGuessAttempt(pokemon) {
  if (!redP2P.conectado) {
    showToast("Tu rival debe estar conectado para enviar tu adivinanza.", "warning");
    return;
  }
  showToast(`Enviando conjetura: "${pokemon.name}"...`, "info", 3000);
  redP2P.enviarAccionJuego("ADIVINAR", {
    guessedPokemonId: pokemon.id
  });
  if (typeof vistaChat !== "undefined") {
    vistaChat.agregarBurbuja({
      texto: `🎯 ¡Has intentado adivinar que el Pokémon del rival es ${pokemon.name}!`,
      tipo: "user"
    });
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

/**
 * Muestra el modal con el resultado y la comprobación criptográfica
 */
function showGameResultModal({ titulo, subtitulo, esTrampa, pokemonRival }) {
  const modal = document.getElementById("modal-game-result");
  const titleEl = document.getElementById("result-modal-title");
  const bodyEl = document.getElementById("result-modal-body");
  if (!modal || !bodyEl) return;

  if (titleEl) titleEl.textContent = titulo;

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

  let pokeHtml = "";
  if (pokemonRival) {
    pokeHtml = `
      <div class="result-pokemon-showcase">
        <img src="${pokemonRival.animatedImage || pokemonRival.image}" alt="${pokemonRival.name}" class="result-poke-img">
        <h4>#${String(pokemonRival.id).padStart(3, "0")} ${pokemonRival.name}</h4>
      </div>
    `;
  }

  bodyEl.innerHTML = `
    <p class="result-subtitle">${subtitulo}</p>
    ${pokeHtml}
    ${badgeHtml}
  `;

  modal.classList.remove("hidden");
}

/**
 * Entra al modo de selección de Pokémon secreto desde el tablero
 */
function enterSelectingSecretMode() {
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
  const clean = (typeof normalizeSearchText === "function")
    ? normalizeSearchText(query)
    : (query || "").trim().toLowerCase();
  const cards = document.querySelectorAll(".poke-card");

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

  const btnReset = document.getElementById("btn-reset-discards");
  if (btnReset) {
    btnReset.addEventListener("click", resetDiscards);
  }

  const btnToggleSecretHide = document.getElementById("btn-toggle-secret-hide");
  if (btnToggleSecretHide) {
    btnToggleSecretHide.addEventListener("click", toggleSecretHide);
  }

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

  const inputFilter = document.getElementById("input-board-filter");
  if (inputFilter) {
    inputFilter.addEventListener("input", e => {
      handleBoardFilter(e.target.value);
    });
  }

  const btnRetry = document.getElementById("btn-retry-fetch");
  if (btnRetry) {
    btnRetry.addEventListener("click", renderAndFetchBoardPokemon);
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

  const btnCloseResult = document.getElementById("btn-close-result-modal");
  const btnAckResult = document.getElementById("btn-ack-result");
  const modalResult = document.getElementById("modal-game-result");
  const closeResult = () => {
    if (modalResult) modalResult.classList.add("hidden");
  };
  if (btnCloseResult) btnCloseResult.addEventListener("click", closeResult);
  if (btnAckResult) btnAckResult.addEventListener("click", closeResult);
}
