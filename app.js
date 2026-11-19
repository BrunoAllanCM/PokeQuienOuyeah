/**
 * PokéQuién - Adivina Quién con Pokémon (2 Jugadores por Código de Sala)
 * 100% Frontend - Determinista (FNV-1a + Mulberry32 + Fisher-Yates) - PokéAPI + Caché Local
 */

// ========================================================
// 1. CONSTANTES Y CONFIGURACIONES
// ========================================================

const GENERATIONS = [
  { id: 1, name: "Kanto", start: 1, end: 151, count: 151, roman: "GEN I" },
  { id: 2, name: "Johto", start: 152, end: 251, count: 100, roman: "GEN II" },
  { id: 3, name: "Hoenn", start: 252, end: 386, count: 135, roman: "GEN III" },
  { id: 4, name: "Sinnoh", start: 387, end: 493, count: 107, roman: "GEN IV" },
  { id: 5, name: "Teselia", start: 494, end: 649, count: 156, roman: "GEN V" },
  { id: 6, name: "Kalos", start: 650, end: 721, count: 72, roman: "GEN VI" },
  { id: 7, name: "Alola", start: 722, end: 809, count: 88, roman: "GEN VII" },
  { id: 8, name: "Galar / Hisui", start: 810, end: 905, count: 96, roman: "GEN VIII" },
  { id: 9, name: "Paldea", start: 906, end: 1025, count: 120, roman: "GEN IX" }
];

const SEED_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const TYPE_TRANSLATIONS = {
  normal: "Normal",
  fire: "Fuego",
  water: "Agua",
  grass: "Planta",
  electric: "Eléctrico",
  ice: "Hielo",
  fighting: "Lucha",
  poison: "Veneno",
  ground: "Tierra",
  flying: "Volador",
  psychic: "Psíquico",
  bug: "Bicho",
  rock: "Roca",
  ghost: "Fantasma",
  dragon: "Dragón",
  steel: "Acero",
  fairy: "Hada",
  dark: "Siniestro"
};

// ========================================================
// 2. ESTADO GLOBAL DE LA APLICACIÓN
// ========================================================

const state = {
  // Configuración en Pantalla 1
  selectedGens: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]), // Gen 1 a 9 por defecto
  showTypesConfig: true,

  // Sala Activa en Pantalla 2
  roomCode: null,
  roomSeed: null,
  roomGens: [],
  roomShowTypes: true,
  boardPokemonIds: [],
  boardPokemonData: [],
  
  // Estado del Tablero
  discardedIds: new Set(),
  secretPokemon: null,
  isSecretHidden: false,
  isSelectingSecretMode: false,
  
  // Preferencias
  soundEnabled: true,
  theme: "retro" // "retro" (Pokédex Clásica Kanto) o "modern" (Cyber HUD)
};

// ========================================================
// 3. GENERADOR PSEUDOALEATORIO DETERMINISTA (PRNG)
// ========================================================

/**
 * Hash de 32 bits FNV-1a para convertir la semilla alfanumérica en un entero
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
 * PRNG Mulberry32: Generador determinista rápido y con excelente distribución
 */
function mulberry32(seed) {
  return function() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Barajado Fisher-Yates determinista sobre una copia del array
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
 * Calcula los 30 IDs deterministas para una semilla y generaciones dadas
 */
function computeBoardIds(seed, gensArray) {
  // Construir pool ordenado ascendentemente
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

  // Inicializar PRNG con el hash de la semilla
  const seedHash = fnv1a(seed);
  const prng = mulberry32(seedHash);

  // Barajar deterministamente y tomar 30
  const shuffled = seededShuffle(pool, prng);
  return shuffled.slice(0, 30);
}

// ========================================================
// 4. GENERACIÓN Y PARSEO DEL CÓDIGO DE SALA
// ========================================================

/**
 * Genera una semilla aleatoria de 6 caracteres sin caracteres ambiguos
 */
function generateRandomSeed(length = 6) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += SEED_CHARS.charAt(Math.floor(Math.random() * SEED_CHARS.length));
  }
  return result;
}

/**
 * Construye el código de sala según la especificación: [SEMILLA]-[GENERACIONES][-NT]
 */
function buildRoomCode(seed, gensSet, showTypes) {
  const gensSortedStr = Array.from(gensSet).sort((a, b) => a - b).join("");
  let code = `${seed.toUpperCase()}-${gensSortedStr}`;
  if (!showTypes) {
    code += "-NT";
  }
  return code;
}

/**
 * Parsea y valida un código de sala
 */
function parseRoomCode(rawCode) {
  if (!rawCode || typeof rawCode !== "string") {
    return { valid: false, error: "Código vacío" };
  }

  const clean = rawCode.trim().toUpperCase();
  // Formato: 6 caracteres alfanuméricos, guion, 1 a 9 dígitos únicos, guion opcional NT
  const regex = /^([A-Z2-9]{6})-([1-9]{1,9})(-NT)?$/;
  const match = clean.match(regex);

  if (!match) {
    return {
      valid: false,
      error: "Formato de código inválido. Debe ser como 'X7K9P2-123' o 'M4R8T2-19-NT'."
    };
  }

  const seed = match[1];
  const gensStr = match[2];
  const noTypes = Boolean(match[3]);

  // Validar dígitos de generaciones únicos del 1 al 9
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
    showTypes: !noTypes
  };
}

// ========================================================
// 5. CONSUMO DE POKÉAPI Y CACHÉ LOCAL
// ========================================================

/**
 * Formatea nombres especiales de Pokémon para presentación atractiva
 */
function formatPokemonName(rawName) {
  if (!rawName) return "";
  const name = rawName.toLowerCase();
  
  if (name === "mr-mime") return "Mr. Mime";
  if (name === "mime-jr") return "Mime Jr.";
  if (name === "mr-rime") return "Mr. Rime";
  if (name === "ho-oh") return "Ho-Oh";
  if (name === "porygon-z") return "Porygon-Z";
  if (name === "nidoran-m") return "Nidoran ♂";
  if (name === "nidoran-f") return "Nidoran ♀";
  if (name === "type-null") return "Código Cero";
  if (name === "flabebe") return "Flabébé";
  if (name === "tapu-koko") return "Tapu Koko";
  if (name === "tapu-lele") return "Tapu Lele";
  if (name === "tapu-bulu") return "Tapu Bulu";
  if (name === "tapu-fini") return "Tapu Fini";
  if (name === "ting-lu") return "Ting-Lu";
  if (name === "chien-pao") return "Chien-Pao";
  if (name === "wo-chien") return "Wo-Chien";
  if (name === "chi-yu") return "Chi-Yu";
  if (name === "iron-treads") return "Ferrodada";
  if (name === "great-tusk") return "Colmilargo";

  // Capitalización de palabras separadas por guion
  return name
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Obtiene los datos de un Pokémon, consultando primero localStorage
 */
async function fetchPokemonData(id) {
  const cacheKey = `poke_v1_${id}`;
  
  // 1. Consultar caché local
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn("No se pudo leer localStorage:", err);
  }

  // 2. Fetch a PokéAPI si no existe en caché
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status} al cargar Pokémon #${id}`);
    }

    const data = await response.json();

    // Extraer imagen con fallback
    const artwork = data.sprites?.other?.["official-artwork"]?.front_default;
    const defaultSprite = data.sprites?.front_default;
    const image = artwork || defaultSprite || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

    // Extraer tipos
    const types = data.types.map(t => t.type.name);

    const pokemonRecord = {
      id: data.id,
      name: formatPokemonName(data.name),
      rawName: data.name,
      image,
      types
    };

    // Guardar en caché local
    try {
      localStorage.setItem(cacheKey, JSON.stringify(pokemonRecord));
    } catch (err) {
      console.warn("No se pudo escribir en localStorage:", err);
    }

    return pokemonRecord;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ========================================================
// 6. AUDIO SINTÉTICO (WEB AUDIO API)
// ========================================================

class SoundController {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  playFlip() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (state.theme === "retro") {
        // Chiptune 8-bit auténtico estilo Game Boy (onda cuadrada con salto de tono)
        osc.type = "square";
        osc.frequency.setValueAtTime(260, this.ctx.currentTime);
        osc.frequency.setValueAtTime(130, this.ctx.currentTime + 0.035);
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.075);
      } else {
        osc.type = "sine";
        osc.frequency.setValueAtTime(320, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(140, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
      }

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch (e) {}
  }

  playSelectSecret() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (state.theme === "retro") {
        // Arpegio Game Boy ascendente clásico al identificar Pokémon
        osc.type = "square";
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.setValueAtTime(440, now + 0.045);
        osc.frequency.setValueAtTime(660, now + 0.09);
        osc.frequency.setValueAtTime(880, now + 0.14);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      } else {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      }

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(now + 0.22);
    } catch (e) {}
  }

  playThemeSwitch() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.setValueAtTime(780, now + 0.06);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(now + 0.12);
    } catch (e) {}
  }
}

const sounds = new SoundController();

// ========================================================
// 6.1 GESTIÓN DE TEMAS (CLÁSICA RETRO vs MODERNA CYBER)
// ========================================================

function applyTheme(themeName) {
  state.theme = themeName;
  localStorage.setItem("poke_theme", themeName);

  document.body.classList.remove("theme-retro", "theme-modern");
  document.body.classList.add(`theme-${themeName}`);

  const switchBtn = document.getElementById("btn-toggle-theme");
  const switchIcon = document.getElementById("theme-switch-icon");
  const switchText = document.getElementById("theme-switch-text");

  if (themeName === "retro") {
    if (switchIcon) switchIcon.textContent = "📟";
    if (switchText) switchText.textContent = "Pokédex Clásica";
    if (switchBtn) switchBtn.title = "Cambiar a diseño Pokédex Moderna (Cyber)";
  } else {
    if (switchIcon) switchIcon.textContent = "⚡";
    if (switchText) switchText.textContent = "Pokédex Moderna";
    if (switchBtn) switchBtn.title = "Cambiar a diseño Pokédex Clásica (Retro)";
  }
}

function toggleTheme() {
  const nextTheme = state.theme === "retro" ? "modern" : "retro";
  applyTheme(nextTheme);
  sounds.playThemeSwitch();
  showToast(
    nextTheme === "retro" 
      ? "Estilo cambiado: Pokédex Clásica (Kanto)" 
      : "Estilo cambiado: Pokédex Moderna (Cyber HUD)",
    "info",
    2500
  );
}

// ========================================================
// 7. TOAST NOTIFICATIONS UI
// ========================================================

function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "ℹ️";
  if (type === "success") icon = "✅";
  if (type === "error") icon = "⚠️";

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "toastOut 0.3s ease forwards";
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
}

// ========================================================
// 8. RENDERIZADO Y CONTROL DE PANTALLA 1 (SETUP)
// ========================================================

/**
 * Inicializa y renderiza las tarjetas de generaciones en Pantalla 1
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
 */
function toggleGen(genId) {
  if (state.selectedGens.has(genId)) {
    // Regla de validación: Siempre debe quedar al menos 1 generación seleccionada
    if (state.selectedGens.size <= 1) {
      showToast("Debes mantener al menos 1 generación seleccionada.", "error");
      return;
    }
    state.selectedGens.delete(genId);
  } else {
    state.selectedGens.add(genId);
  }

  // Actualizar clases de tarjetas
  const card = document.querySelector(`.gen-card[data-gen-id="${genId}"]`);
  if (card) {
    card.classList.toggle("active", state.selectedGens.has(genId));
  }

  updatePoolSummary();
  syncRangeSelectsFromSelected();
}

/**
 * Actualiza el contador dinámico del resumen del pool
 */
function updatePoolSummary() {
  const gensCountEl = document.getElementById("summary-gens-count");
  const poolCountEl = document.getElementById("summary-pool-count");

  let totalPokemon = 0;
  state.selectedGens.forEach(genId => {
    const genDef = GENERATIONS.find(g => g.id === genId);
    if (genDef) totalPokemon += genDef.count;
  });

  if (gensCountEl) gensCountEl.textContent = state.selectedGens.size;
  if (poolCountEl) poolCountEl.textContent = totalPokemon.toLocaleString("es-ES");
}

/**
 * Ajusta los selects de rango si la selección actual coincide con un rango continuo
 */
function syncRangeSelectsFromSelected() {
  const sorted = Array.from(state.selectedGens).sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // Comprobar si es continuo
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
 */
function applyRangeSelection(desdeVal, hastaVal) {
  let start = parseInt(desdeVal, 10);
  let end = parseInt(hastaVal, 10);

  if (start > end) {
    // Si desde es mayor que hasta, ajustar hasta
    end = start;
    const selectHasta = document.getElementById("select-gen-hasta");
    if (selectHasta) selectHasta.value = String(end);
  }

  state.selectedGens.clear();
  for (let g = start; g <= end; g++) {
    state.selectedGens.add(g);
  }

  // Refrescar tarjetas visualmente
  document.querySelectorAll(".gen-card").forEach(card => {
    const gId = parseInt(card.dataset.genId, 10);
    card.classList.toggle("active", state.selectedGens.has(gId));
  });

  updatePoolSummary();
}

// ========================================================
// 9. NAVEGACIÓN Y CARGA DE VISTAS
// ========================================================

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

  // Actualizar URL sin recargar
  const newUrl = `${window.location.pathname}?sala=${encodeURIComponent(state.roomCode)}`;
  window.history.replaceState({ sala: state.roomCode }, "", newUrl);

  // Cambiar a vista de tablero
  showView("view-board");

  // Actualizar topbar con datos de sala
  renderBoardHeader();

  // Calcular los 30 IDs deterministas
  state.boardPokemonIds = computeBoardIds(state.roomSeed, state.roomGens);

  // Cargar estado de descartes previo guardado en sessionStorage si existe
  loadDiscardsFromSession();

  // Renderizar esqueletos y descargar pokémon
  await renderAndFetchBoardPokemon();
}

/**
 * Actualiza la información en la barra superior del tablero
 */
function renderBoardHeader() {
  const codeEl = document.getElementById("board-room-code");
  const gensBadge = document.getElementById("board-badge-gens");
  const typesBadge = document.getElementById("board-badge-types");

  if (codeEl) codeEl.textContent = state.roomCode;
  
  if (gensBadge) {
    // Si son todas (1-9)
    if (state.roomGens.length === 9) {
      gensBadge.textContent = "Gen 1-9 (Todas)";
    } else {
      gensBadge.textContent = `Gen ${state.roomGens.join(", ")}`;
    }
  }

  if (typesBadge) {
    typesBadge.textContent = state.roomShowTypes ? "Tipos: Visibles" : "Tipos: Ocultos";
  }
}

// ========================================================
// 10. RENDERIZADO Y CONTROL DEL TABLERO DE JUEGO (PANTALLA 2)
// ========================================================

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
    // Carga en paralelo con Promise.all
    const promises = state.boardPokemonIds.map(id => fetchPokemonData(id));
    state.boardPokemonData = await Promise.all(promises);

    // Inicializar o restaurar el Pokémon secreto
    initSecretPokemon();

    // Renderizar cartas completas
    renderBoardCards();
    updateCounterAndProgress();

  } catch (error) {
    console.error("Error al cargar los Pokémon del tablero:", error);
    if (errorPanel) {
      errorPanel.classList.remove("hidden");
      const desc = document.getElementById("board-error-desc");
      if (desc) {
        desc.textContent = "Hubo un fallo de red al consultar PokéAPI. Por favor verifica tu conexión e intenta de nuevo.";
      }
    }
  }
}

/**
 * Renderiza las 30 cartas finales con sus datos
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
    card.dataset.types = pokemon.types.join(" ");

    // Badges de tipos (si está activado en la sala)
    let typesHtml = "";
    if (state.roomShowTypes) {
      typesHtml = pokemon.types.map(t => {
        const translated = TYPE_TRANSLATIONS[t] || t;
        return `<span class="type-badge type-${t}">${translated}</span>`;
      }).join("");
    }

    // Badge sutil si es el secreto
    const secretOwnerBadgeHtml = isSecret ? `<span class="secret-owner-badge">★ TU SECRETO</span>` : "";

    card.innerHTML = `
      ${secretOwnerBadgeHtml}
      <div class="card-top">
        <span class="card-num">#${String(pokemon.id).padStart(3, "0")}</span>
      </div>
      <div class="card-img-wrap">
        <img
          src="${pokemon.image}"
          alt="${pokemon.name}"
          class="card-img"
          loading="lazy"
        >
      </div>
      <div class="card-bottom">
        <span class="card-name" title="${pokemon.name}">${pokemon.name}</span>
        ${state.roomShowTypes ? `<div class="card-types">${typesHtml}</div>` : ""}
      </div>
    `;

    card.addEventListener("click", () => handleCardClick(pokemon));
    grid.appendChild(card);
  });
}

/**
 * Manejo del clic en una carta del tablero
 */
function handleCardClick(pokemon) {
  // Caso A: Modo "Cambiar Pokémon secreto" activo
  if (state.isSelectingSecretMode) {
    setSecretPokemon(pokemon);
    exitSelectingSecretMode();
    sounds.playSelectSecret();
    showToast(`Tu nuevo Pokémon secreto es ${pokemon.name}.`, "success");
    return;
  }

  // Caso B: Modo normal -> Alternar estado descartado
  if (state.discardedIds.has(pokemon.id)) {
    state.discardedIds.delete(pokemon.id);
  } else {
    state.discardedIds.add(pokemon.id);
    sounds.playFlip();
  }

  // Guardar en sesión
  saveDiscardsToSession();

  // Actualizar clase visual en la carta
  const card = document.querySelector(`.poke-card[data-id="${pokemon.id}"]`);
  if (card) {
    card.classList.toggle("descartada", state.discardedIds.has(pokemon.id));
  }

  updateCounterAndProgress();
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
}

// ========================================================
// 11. GESTIÓN DEL POKÉMON SECRETO
// ========================================================

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

  // Verificar si el ID guardado pertenece a los 30 del tablero actual
  let poke = state.boardPokemonData.find(p => p.id === secretId);

  // Si no está guardado o no coincide, elegir al azar con Math.random() normal (NO determinista)
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
 */
function setSecretPokemon(pokemon) {
  if (!pokemon) return;
  state.secretPokemon = pokemon;

  // Persistir en sessionStorage por código de sala
  try {
    sessionStorage.setItem(`poke_secret_${state.roomCode}`, String(pokemon.id));
  } catch (e) {}

  // Actualizar elementos DOM del widget secreto
  const imgEl = document.getElementById("secret-img");
  const numEl = document.getElementById("secret-num");
  const nameEl = document.getElementById("secret-name");
  const typesEl = document.getElementById("secret-types");

  if (imgEl) {
    imgEl.src = pokemon.image;
    imgEl.alt = pokemon.name;
  }
  if (numEl) {
    numEl.textContent = `#${String(pokemon.id).padStart(3, "0")}`;
  }
  if (nameEl) {
    nameEl.textContent = pokemon.name;
  }
  if (typesEl) {
    if (state.roomShowTypes) {
      typesEl.innerHTML = pokemon.types.map(t => {
        const translated = TYPE_TRANSLATIONS[t] || t;
        return `<span class="type-badge type-${t}">${translated}</span>`;
      }).join("");
    } else {
      typesEl.innerHTML = "";
    }
  }

  // Actualizar badges visuales de secreto en el tablero
  document.querySelectorAll(".poke-card").forEach(card => {
    const id = parseInt(card.dataset.id, 10);
    const isSecret = id === pokemon.id;
    card.classList.toggle("is-secret-pokemon", isSecret);
    
    // Remover badge anterior si existía
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
 * Alterna el ocultamiento temporal del Pokémon secreto (por si el rival está cerca)
 */
function toggleSecretHide() {
  state.isSecretHidden = !state.isSecretHidden;
  
  const cover = document.getElementById("secret-mask-cover");
  const details = document.getElementById("secret-details");
  const textEl = document.getElementById("secret-visibility-text");

  if (cover) cover.classList.toggle("hidden", !state.isSecretHidden);
  if (details) details.style.opacity = state.isSecretHidden ? "0.2" : "1";
  if (textEl) textEl.textContent = state.isSecretHidden ? "Mostrar" : "Ocultar";
}

/**
 * Entra al modo de selección de Pokémon secreto desde el tablero
 */
function enterSelectingSecretMode() {
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

// ========================================================
// 12. PERSISTENCIA DE DESCARTES EN SESIÓN
// ========================================================

function saveDiscardsToSession() {
  if (!state.roomCode) return;
  try {
    const arr = Array.from(state.discardedIds);
    sessionStorage.setItem(`poke_discards_${state.roomCode}`, JSON.stringify(arr));
  } catch (e) {}
}

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
  } catch (e) {}
}

// ========================================================
// 13. FILTRO RÁPIDO EN EL TABLERO
// ========================================================

function handleBoardFilter(query) {
  const clean = (query || "").trim().toLowerCase();
  const cards = document.querySelectorAll(".poke-card");

  cards.forEach(card => {
    if (!clean) {
      card.style.display = "";
      return;
    }
    const name = card.dataset.name || "";
    const types = card.dataset.types || "";
    const matches = name.includes(clean) || types.includes(clean);
    card.style.display = matches ? "" : "none";
  });
}

// ========================================================
// 14. INICIALIZACIÓN Y EVENT LISTENERS
// ========================================================

document.addEventListener("DOMContentLoaded", () => {
  // Inicializar Pantalla 1
  initSetupView();

  // Escuchar selector de rango
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

  // Botones de acción rápida en rango
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

  // Checkbox de mostrar tipos en cartas
  const chkShowTypes = document.getElementById("chk-show-types");
  if (chkShowTypes) {
    chkShowTypes.addEventListener("change", (e) => {
      state.showTypesConfig = e.target.checked;
    });
  }

  // Botón "Crear sala y empezar"
  const btnCreateRoom = document.getElementById("btn-create-room");
  if (btnCreateRoom) {
    btnCreateRoom.addEventListener("click", () => {
      if (state.selectedGens.size === 0) {
        showToast("Selecciona al menos 1 generación antes de crear la sala.", "error");
        return;
      }
      const seed = generateRandomSeed(6);
      const code = buildRoomCode(seed, state.selectedGens, state.showTypesConfig);
      loadRoom(code);
    });
  }

  // Formulario / Botón "Unirse a una sala existente"
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
    loadRoom(parsed.code);
  };

  if (formJoin) {
    formJoin.addEventListener("submit", (e) => {
      e.preventDefault();
      handleJoinSubmit();
    });
  }

  // Botón "Nueva configuración" (vuelve a Pantalla 1 y limpia URL)
  const btnNewConfig = document.getElementById("btn-new-config");
  if (btnNewConfig) {
    btnNewConfig.addEventListener("click", () => {
      window.history.replaceState({}, "", window.location.pathname);
      showView("view-setup");
      showToast("Configura una nueva partida.", "info");
    });
  }

  // Botón "Copiar enlace de sala"
  const btnCopyLink = document.getElementById("btn-copy-link");
  if (btnCopyLink) {
    btnCopyLink.addEventListener("click", async () => {
      if (!state.roomCode) return;
      const url = `${window.location.origin}${window.location.pathname}?sala=${encodeURIComponent(state.roomCode)}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast("¡Enlace de sala copiado al portapapeles!", "success");
      } catch (err) {
        // Fallback clásico
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

  // Botón "Copiar código de sala" (solo texto del código)
  const btnCopyCode = document.getElementById("btn-copy-code");
  if (btnCopyCode) {
    btnCopyCode.addEventListener("click", async () => {
      if (!state.roomCode) return;
      try {
        await navigator.clipboard.writeText(state.roomCode);
        showToast(`Código copiado: ${state.roomCode}`, "success");
      } catch (e) {
        showToast(`Código de sala: ${state.roomCode}`, "info");
      }
    });
  }

  // Botón "Reiniciar descartes"
  const btnReset = document.getElementById("btn-reset-discards");
  if (btnReset) {
    btnReset.addEventListener("click", resetDiscards);
  }

  // Botón "Ocultar / Mostrar" Pokémon secreto
  const btnToggleSecretHide = document.getElementById("btn-toggle-secret-hide");
  if (btnToggleSecretHide) {
    btnToggleSecretHide.addEventListener("click", toggleSecretHide);
  }

  // Botón "Cambiar" Pokémon secreto
  const btnChangeSecret = document.getElementById("btn-change-secret");
  if (btnChangeSecret) {
    btnChangeSecret.addEventListener("click", enterSelectingSecretMode);
  }

  // Botón "Cancelar" en banner de selección de secreto
  const btnCancelSecret = document.getElementById("btn-cancel-secret-select");
  if (btnCancelSecret) {
    btnCancelSecret.addEventListener("click", exitSelectingSecretMode);
  }

  // Filtro rápido de cartas
  const inputFilter = document.getElementById("input-board-filter");
  if (inputFilter) {
    inputFilter.addEventListener("input", (e) => {
      handleBoardFilter(e.target.value);
    });
  }

  // Reintentar carga en error
  const btnRetry = document.getElementById("btn-retry-fetch");
  if (btnRetry) {
    btnRetry.addEventListener("click", renderAndFetchBoardPokemon);
  }

  // Inicializar Tema (Clásico Retro vs Moderno Cyber)
  const savedTheme = localStorage.getItem("poke_theme") || "retro";
  applyTheme(savedTheme);

  const btnThemeToggle = document.getElementById("btn-toggle-theme");
  if (btnThemeToggle) {
    btnThemeToggle.addEventListener("click", toggleTheme);
  }

  // Toggle de sonido
  const btnSound = document.getElementById("btn-toggle-sound");
  const iconSoundOn = document.querySelector(".icon.sound-on");
  const iconSoundOff = document.querySelector(".icon.sound-off");
  
  if (btnSound) {
    // Cargar preferencia
    const savedSound = localStorage.getItem("poke_sound_enabled");
    if (savedSound !== null) {
      state.soundEnabled = savedSound === "true";
      if (iconSoundOn && iconSoundOff) {
        iconSoundOn.classList.toggle("hidden", !state.soundEnabled);
        iconSoundOff.classList.toggle("hidden", state.soundEnabled);
      }
    }

    btnSound.addEventListener("click", () => {
      state.soundEnabled = !state.soundEnabled;
      localStorage.setItem("poke_sound_enabled", String(state.soundEnabled));
      if (iconSoundOn && iconSoundOff) {
        iconSoundOn.classList.toggle("hidden", !state.soundEnabled);
        iconSoundOff.classList.toggle("hidden", state.soundEnabled);
      }
      showToast(state.soundEnabled ? "Sonido activado" : "Sonido silenciado", "info", 1500);
      if (state.soundEnabled) sounds.playFlip();
    });
  }

  // ----------------------------------------------------
  // Sincronización Inicial por URL (?sala=CODIGO)
  // ----------------------------------------------------
  const urlParams = new URLSearchParams(window.location.search);
  const paramSala = urlParams.get("sala");

  if (paramSala) {
    const parsed = parseRoomCode(paramSala);
    if (parsed.valid) {
      loadRoom(parsed.code);
    } else {
      showToast("El enlace de sala contiene un código inválido.", "error");
      showView("view-setup");
    }
  } else {
    showView("view-setup");
  }
});

