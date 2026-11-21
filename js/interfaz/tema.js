/**
 * Gestor del Tema Visual (Pokédex Clásica Retro vs Cyber HUD Moderno)
 * y Personalización de Color de Carcasa
 */

const CASING_COLORS = {
  rojo: { name: "Rojo Clásico", color: "#dc2626" },
  celeste: { name: "Azul Pokédex", color: "#0ea5e9" },
  rosa: { name: "Rosita", color: "#ec4899" },
  gris: { name: "Gris Clásico", color: "#64748b" },
  negro: { name: "Negro Ónix", color: "#1e293b" }
};

/**
 * Aplica el color de la carcasa de la Pokédex
 * @param {string} colorKey
 */
function applyCasingColor(colorKey) {
  if (!CASING_COLORS[colorKey]) {
    if (colorKey === "azul") colorKey = "celeste";
    else if (colorKey === "pink") colorKey = "rosa";
    else colorKey = "rojo";
  }

  document.body.dataset.casing = colorKey;
  localStorage.setItem("poke_casing_color", colorKey);

  const activeDot = document.getElementById("casing-active-swatch");
  if (activeDot) {
    activeDot.style.backgroundColor = CASING_COLORS[colorKey].color;
  }

  document.querySelectorAll(".casing-swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.color === colorKey);
  });
}

/**
 * Inicializa el selector interactivo de color de carcasa en el header
 */
function initCasingPicker() {
  const btnPicker = document.getElementById("btn-casing-picker");
  const menu = document.getElementById("casing-color-menu");

  if (!btnPicker || !menu) return;

  btnPicker.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("hidden");
  });

  document.querySelectorAll(".casing-swatch").forEach((swatch) => {
    swatch.addEventListener("click", (e) => {
      e.stopPropagation();
      const color = swatch.dataset.color;
      applyCasingColor(color);
      menu.classList.add("hidden");
      if (typeof sounds !== "undefined" && sounds.playFlip) {
        sounds.playFlip();
      }
      showToast(`Carcasa: ${CASING_COLORS[color].name}`, "info", 1800);
    });
  });

  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && e.target !== btnPicker) {
      menu.classList.add("hidden");
    }
  });

  const savedColor = localStorage.getItem("poke_casing_color") || "rojo";
  applyCasingColor(savedColor);
}

/**
 * Aplica el tema seleccionado en el DOM y actualiza los controles del header
 * @param {"retro"|"modern"} themeName
 */
function applyTheme(themeName) {
  state.theme = themeName;
  localStorage.setItem("poke_theme", themeName);

  document.body.classList.remove("theme-retro", "theme-modern");
  document.body.classList.add(`theme-${themeName}`);

  const switchBtn = document.getElementById("btn-toggle-theme");
  const switchIcon = document.getElementById("theme-switch-icon");
  const switchText = document.getElementById("theme-switch-text");
  const casingMenu = document.getElementById("casing-color-menu");

  if (casingMenu) {
    casingMenu.classList.add("hidden");
  }

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

/**
 * Alterna entre el tema Retro y Moderno
 */
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
