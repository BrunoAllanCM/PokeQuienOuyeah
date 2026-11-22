/**
 * Controlador de la Vista de Configuración / Editor de Sala (Pantalla 1)
 */

/**
 * Inicializa y renderiza las tarjetas interactivas de generaciones
 */
function initSetupView() {
  const container = document.getElementById("gen-cards-container");
  if (!container) return;
  container.innerHTML = "";

  GENERATIONS.forEach(gen => {
    const card = document.createElement("div");
    card.className = `gen-card ${state.selectedGens.has(gen.id) ? "active" : ""}`;
    card.dataset.genId = gen.id;

    card.innerHTML = `
      <div class="gen-card-header">
        <span class="gen-number">${gen.roman}</span>
        <span class="gen-check-icon">✓</span>
      </div>
      <div class="gen-region">${gen.name}</div>
      <div class="gen-card-footer">
        <span>#${gen.start} - #${gen.end}</span>
        <span class="gen-count-badge">${gen.count}</span>
      </div>
    `;

    card.addEventListener("click", () => toggleGen(gen.id));
    container.appendChild(card);
  });

  updatePoolSummary();
  syncRangeSelectsFromSelected();
}

/**
 * Alterna la selección de una generación individual
 * @param {number} genId
 */
function toggleGen(genId) {
  if (state.selectedGens.has(genId)) {
    if (state.selectedGens.size <= 1) {
      showToast("Debes mantener al menos 1 generación seleccionada.", "error");
      return;
    }
    state.selectedGens.delete(genId);
  } else {
    state.selectedGens.add(genId);
  }

  const card = document.querySelector(`.gen-card[data-gen-id="${genId}"]`);
  if (card) {
    card.classList.toggle("active", state.selectedGens.has(genId));
  }

  updatePoolSummary();
  syncRangeSelectsFromSelected();
}

/**
 * Actualiza el contador dinámico del resumen del pool de Pokémon
 */
function updatePoolSummary() {
  const gensCountEl = document.getElementById("summary-gens-count");
  const poolCountEl = document.getElementById("summary-pool-count");
  const boardCountEl = document.querySelector(".pool-summary-banner .highlight-blue");

  const mode = state.gameModeConfig || "standard";

  if (mode === "starters") {
    let startersCount = 27;
    if (typeof STARTER_POKEMON_IDS !== "undefined") {
      const filtered = STARTER_POKEMON_IDS.filter(id => {
        if (state.selectedGens.size === 0 || state.selectedGens.size === 9) return true;
        const genNum = typeof getGenNumberForId === "function" ? getGenNumberForId(id) : 1;
        return state.selectedGens.has(genNum);
      });
      startersCount = filtered.length;
    }
    if (gensCountEl) gensCountEl.textContent = state.selectedGens.size === 9 ? "Todas (9)" : state.selectedGens.size;
    if (poolCountEl) poolCountEl.textContent = `${startersCount} iniciales`;
    if (boardCountEl) boardCountEl.textContent = startersCount;
    return;
  }

  if (mode === "legendaries") {
    let legCount = typeof LEGENDARY_POKEMON_IDS !== "undefined" ? LEGENDARY_POKEMON_IDS.length : 79;
    if (typeof LEGENDARY_POKEMON_IDS !== "undefined") {
      const filtered = LEGENDARY_POKEMON_IDS.filter(id => {
        if (state.selectedGens.size === 0 || state.selectedGens.size === 9) return true;
        const genNum = typeof getGenNumberForId === "function" ? getGenNumberForId(id) : 1;
        return state.selectedGens.has(genNum);
      });
      legCount = filtered.length;
    }
    const boardCardsCount = Math.min(30, legCount);
    if (gensCountEl) gensCountEl.textContent = state.selectedGens.size === 9 ? "Todas (9)" : state.selectedGens.size;
    if (poolCountEl) poolCountEl.textContent = `${legCount} legendarios`;
    if (boardCountEl) boardCountEl.textContent = boardCardsCount;
    return;
  }

  let totalPokemon = 0;
  state.selectedGens.forEach(genId => {
    const genDef = GENERATIONS.find(g => g.id === genId);
    if (genDef) totalPokemon += genDef.count;
  });

  if (gensCountEl) gensCountEl.textContent = state.selectedGens.size;
  if (poolCountEl) poolCountEl.textContent = totalPokemon.toLocaleString("es-ES");
  if (boardCountEl) boardCountEl.textContent = "30";
}

/**
 * Ajusta los selects de rango si la selección actual coincide con un rango continuo
 */
function syncRangeSelectsFromSelected() {
  const sorted = Array.from(state.selectedGens).sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  let isContiguous = true;
  for (let i = min; i <= max; i++) {
    if (!state.selectedGens.has(i)) {
      isContiguous = false;
      break;
    }
  }

  const selectDesde = document.getElementById("select-gen-desde");
  const selectHasta = document.getElementById("select-gen-hasta");

  if (isContiguous && selectDesde && selectHasta) {
    selectDesde.value = String(min);
    selectHasta.value = String(max);
  }
}

/**
 * Aplica un rango continuo desde "Desde" hasta "Hasta"
 * @param {string|number} desdeVal
 * @param {string|number} hastaVal
 */
function applyRangeSelection(desdeVal, hastaVal) {
  let start = parseInt(desdeVal, 10);
  let end = parseInt(hastaVal, 10);

  if (start > end) {
    end = start;
    const selectHasta = document.getElementById("select-gen-hasta");
    if (selectHasta) selectHasta.value = String(end);
  }

  state.selectedGens.clear();
  for (let g = start; g <= end; g++) {
    state.selectedGens.add(g);
  }

  document.querySelectorAll(".gen-card").forEach(card => {
    const gId = parseInt(card.dataset.genId, 10);
    card.classList.toggle("active", state.selectedGens.has(gId));
  });

  updatePoolSummary();
}

/**
 * Vincula todos los event listeners de la Pantalla 1 (Setup)
 * @param {(roomCode: string) => void} onLoadRoom Función callback para iniciar sala
 */
function bindSetupEvents(onLoadRoom) {
  const selectDesde = document.getElementById("select-gen-desde");
  const selectHasta = document.getElementById("select-gen-hasta");

  if (selectDesde && selectHasta) {
    selectDesde.addEventListener("change", () => {
      applyRangeSelection(selectDesde.value, selectHasta.value);
    });
    selectHasta.addEventListener("change", () => {
      applyRangeSelection(selectDesde.value, selectHasta.value);
    });
  }

  const btnQuickAll = document.getElementById("btn-quick-all");
  if (btnQuickAll) {
    btnQuickAll.addEventListener("click", () => {
      if (selectDesde) selectDesde.value = "1";
      if (selectHasta) selectHasta.value = "9";
      applyRangeSelection(1, 9);
      showToast("Seleccionadas todas las generaciones (Gen 1-9).", "info");
    });
  }

  const btnQuickClassic = document.getElementById("btn-quick-classic");
  if (btnQuickClassic) {
    btnQuickClassic.addEventListener("click", () => {
      if (selectDesde) selectDesde.value = "1";
      if (selectHasta) selectHasta.value = "3";
      applyRangeSelection(1, 3);
      showToast("Seleccionadas generaciones clásicas (Gen 1-3).", "info");
    });
  }

  // Función para seleccionar el modo de juego de forma limpia sin duplicados
  function selectGameMode(chosenMode, userInitiated = true) {
    const currentActiveCard = document.querySelector(`.game-mode-card[data-mode="${chosenMode}"]`);
    if (state.gameModeConfig === chosenMode && currentActiveCard && currentActiveCard.classList.contains("active")) {
      return; // Ya está activo ese modo, no repetir acción ni toast
    }

    state.gameModeConfig = chosenMode;
    const modeCards = document.querySelectorAll(".game-mode-card");
    modeCards.forEach(c => c.classList.toggle("active", c.dataset.mode === chosenMode));

    const radio = document.querySelector(`input[name="game-mode-choice"][value="${chosenMode}"]`);
    if (radio) radio.checked = true;

    if (userInitiated) {
      if (chosenMode === "starters") {
        showToast("🌱 Modo Solo Iniciales: 27 Pokémon iniciales (1ª fase de Gen 1 a 9).", "info", 3500);
      } else if (chosenMode === "legendaries") {
        showToast("👑 Modo Solo Legendarios: Exclusivo de Pokémon Legendarios y Singulares.", "info", 3500);
      } else {
        showToast("🌟 Modo Estándar: Todos los Pokémon del rango seleccionado.", "info", 2500);
      }

      if (typeof sounds !== "undefined" && sounds.playFlip) {
        sounds.playFlip();
      }
    }

    updatePoolSummary();
  }

  // Selector de Modo de Juego (Estándar, Solo Iniciales, Solo Legendarios)
  const modeCards = document.querySelectorAll(".game-mode-card");
  modeCards.forEach(card => {
    card.addEventListener("click", (e) => {
      // Ignorar el evento si el target es directamente el input para evitar doble disparo en <label>
      if (e.target && e.target.tagName === "INPUT") return;
      const chosenMode = card.dataset.mode || "standard";
      selectGameMode(chosenMode, true);
    });
  });

  const modeRadios = document.querySelectorAll("input[name='game-mode-choice']");
  modeRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      if (radio.checked) {
        selectGameMode(radio.value || "standard", true);
      }
    });
  });

  const chkShowTypes = document.getElementById("chk-show-types");
  const chkShowGens = document.getElementById("chk-show-gens");
  const chkGrayscale = document.getElementById("chk-grayscale");
  const chkProMode = document.getElementById("chk-pro-mode");

  // Al activar Modo Pro (Solo nombre): en automático todas las casillas deben quedar en x
  if (chkProMode) {
    chkProMode.addEventListener("change", e => {
      const isPro = e.target.checked;
      if (isPro) {
        if (chkShowTypes) {
          chkShowTypes.checked = false;
          state.showTypesConfig = false;
        }
        if (chkShowGens) {
          chkShowGens.checked = false;
          state.showGensConfig = false;
        }
        if (chkGrayscale) {
          chkGrayscale.checked = false;
          state.grayscaleConfig = false;
        }
        showToast("⚠️ ¡Bajo tu propio riesgo! Solo para verdaderos pros de la Pokédex...", "warning", 3000);
      } else {
        // Al desmarcar Modo Pro: restaurar las casillas normales a activas
        if (chkShowTypes) {
          chkShowTypes.checked = true;
          state.showTypesConfig = true;
        }
        if (chkShowGens) {
          chkShowGens.checked = true;
          state.showGensConfig = true;
        }
      }
      sounds.playFlip();
    });
  }

  if (chkShowTypes) {
    chkShowTypes.addEventListener("change", e => {
      state.showTypesConfig = e.target.checked;
      if (e.target.checked && chkProMode && chkProMode.checked) {
        chkProMode.checked = false;
      }
      sounds.playFlip();
    });
  }

  if (chkShowGens) {
    chkShowGens.addEventListener("change", e => {
      state.showGensConfig = e.target.checked;
      if (e.target.checked && chkProMode && chkProMode.checked) {
        chkProMode.checked = false;
      }
      sounds.playFlip();
    });
  }

  if (chkGrayscale) {
    chkGrayscale.addEventListener("change", e => {
      state.grayscaleConfig = e.target.checked;
      if (e.target.checked && chkProMode && chkProMode.checked) {
        chkProMode.checked = false;
      }
      sounds.playFlip();
    });
  }

  const btnCreateRoom = document.getElementById("btn-create-room");
  if (btnCreateRoom) {
    btnCreateRoom.addEventListener("click", () => {
      if (state.selectedGens.size === 0) {
        showToast("Selecciona al menos 1 generación antes de crear la sala.", "error");
        return;
      }
      const chkTypes = document.getElementById("chk-show-types");
      const chkGens = document.getElementById("chk-show-gens");
      const chkGray = document.getElementById("chk-grayscale");
      const chkPro = document.getElementById("chk-pro-mode");

      const proMode = chkPro ? chkPro.checked : false;
      const showTypes = proMode ? false : (chkTypes ? chkTypes.checked : state.showTypesConfig);
      const showGens = proMode ? false : (chkGens ? chkGens.checked : state.showGensConfig);
      const grayscale = proMode ? false : (chkGray ? chkGray.checked : state.grayscaleConfig);

      state.showTypesConfig = showTypes;
      state.showGensConfig = showGens;
      state.grayscaleConfig = grayscale;

      const seed = generateRandomSeed(6);
      const code = buildRoomCode(
        seed,
        state.selectedGens,
        showTypes,
        showGens,
        grayscale,
        proMode,
        state.gameModeConfig || "standard"
      );
      onLoadRoom(code, true);
    });
  }

  const formJoin = document.getElementById("form-join-room");
  const inputJoin = document.getElementById("input-room-code");
  const errorJoin = document.getElementById("join-error-msg");

  const handleJoinSubmit = () => {
    if (!inputJoin) return;
    const rawVal = inputJoin.value.trim();
    if (!rawVal) {
      if (errorJoin) {
        errorJoin.textContent = "Por favor ingresa un código de sala.";
        errorJoin.classList.remove("hidden");
      }
      return;
    }

    const parsed = parseRoomCode(rawVal);
    if (!parsed.valid) {
      if (errorJoin) {
        errorJoin.textContent = parsed.error;
        errorJoin.classList.remove("hidden");
      }
      return;
    }

    if (errorJoin) errorJoin.classList.add("hidden");
    onLoadRoom(parsed.code, false);
  };

  if (formJoin) {
    formJoin.addEventListener("submit", e => {
      e.preventDefault();
      handleJoinSubmit();
    });
  }
}
