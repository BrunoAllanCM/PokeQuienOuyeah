/**
 * Componente UI de Notificaciones Toast
 */

let lastToastMsg = "";
let lastToastTime = 0;

/**
 * Muestra una notificación toast temporal en pantalla
 * @param {string} message Texto del mensaje
 * @param {"info"|"success"|"error"} type Tipo de alerta
 * @param {number} duration Duración en milisegundos
 */
function showToast(message, type = "info", duration = 3000) {
  const now = Date.now();
  // Evitar duplicados inmediatos del mismo mensaje
  if (message === lastToastMsg && (now - lastToastTime) < 600) {
    return;
  }
  lastToastMsg = message;
  lastToastTime = now;

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
