/**
 * Controlador de la Interfaz del Chat en Tiempo Real
 */

// Objeto que maneja el chat y el estado de conexión del rival
const vistaChat = {
  // Referencias a elementos del DOM (se llenan en init)
  elementos: {
    contenedor: null,
    mensajes: null,
    formulario: null,
    input: null,
    indicadorEstado: null,
    textoEstado: null,
    barraRival: null,
    textoRestantesRival: null
  },

  /**
   * Inicializa referencias del DOM y vincula eventos
   */
  init() {
    this.elementos.contenedor = document.getElementById("chat-sidebar");
    this.elementos.mensajes = document.getElementById("chat-messages-container");
    this.elementos.formulario = document.getElementById("chat-form");
    this.elementos.input = document.getElementById("chat-input");
    this.elementos.indicadorEstado = document.getElementById("chat-status-indicator");
    this.elementos.textoEstado = document.getElementById("chat-status-text");
    this.elementos.barraRival = document.getElementById("rival-status-bar");
    this.elementos.textoRestantesRival = document.getElementById("rival-remaining-text");

    if (this.elementos.formulario) {
      this.elementos.formulario.addEventListener("submit", (e) => {
        e.preventDefault();
        this.enviarMensaje();
      });
    }
  },

  /**
   * Envía el texto actualmente escrito en el input
   */
  enviarMensaje() {
    if (!this.elementos.input) return;
    const texto = this.elementos.input.value.trim();
    if (!texto) return;

    this.enviarTextoDirecto(texto);
    this.elementos.input.value = "";
    this.elementos.input.focus();
  },

  /**
   * Envía un texto por P2P y lo dibuja en el chat
   * @param {string} texto
   */
  enviarTextoDirecto(texto) {
    if (typeof redP2P === "undefined") return;

    if (!redP2P.conectado) {
      showToast("Esperando a que el rival se conecte a la sala para chatear.", "info", 3000);
      return;
    }

    const mensaje = redP2P.enviarMensajeChat(texto, "Tú");
    if (mensaje) {
      this.agregarBurbuja({
        remitente: "Tú",
        texto: mensaje.texto,
        hora: mensaje.hora,
        tipo: "user"
      });

      // Efecto de sonido de envío
      if (typeof sounds !== "undefined" && sounds.playFlip) {
        sounds.playFlip();
      }
    }
  },

  /**
   * Agrega una nueva burbuja de mensaje en la ventana de chat
   * @param {{ remitente: string, texto: string, hora?: string, tipo?: 'user'|'rival'|'system' }} datos
   */
  agregarBurbuja({ remitente, texto, hora, tipo = "rival" }) {
    if (!this.elementos.mensajes) return;

    const div = document.createElement("div");

    // Mensajes del sistema: burbuja simple; los demás con autor y hora
    if (tipo === "system") {
      div.className = "chat-bubble chat-bubble-system";
      div.innerHTML = `<span>${texto}</span>`;
    } else {
      div.className = `chat-bubble chat-bubble-${tipo}`;
      div.innerHTML = `
        <div class="chat-bubble-text">${this.escaparHtml(texto)}</div>
        <div class="chat-bubble-meta">
          <span class="chat-bubble-author">${remitente}</span>
          <span class="chat-bubble-time">${hora || ""}</span>
        </div>
      `;
    }

    this.elementos.mensajes.appendChild(div);
    // Baja el scroll al último mensaje
    this.elementos.mensajes.scrollTop = this.elementos.mensajes.scrollHeight;
  },

  /**
   * Actualiza el indicador LED de conexión
   * @param {'esperando'|'conectado'|'desconectado'} estado
   * @param {string} texto
   */
  actualizarEstado(estado, texto) {
    if (!this.elementos.indicadorEstado) return;

    this.elementos.indicadorEstado.className = `chat-status ${estado}`;
    if (this.elementos.textoEstado) {
      this.elementos.textoEstado.textContent = texto;
    }
  },

  /**
   * Actualiza el contador de Pokémon restantes del rival
   * @param {number} restantes
   */
  actualizarRivalRestantes(restantes) {
    if (this.elementos.barraRival) {
      this.elementos.barraRival.classList.remove("hidden");
    }
    if (this.elementos.textoRestantesRival) {
      this.elementos.textoRestantesRival.textContent = `${restantes} Pokémon restantes`;
    }
  },

  /**
   * Limpia mensajes previos al entrar a una nueva sala
   */
  reiniciarChat(codigoSala) {
    if (!this.elementos.mensajes) return;
    this.elementos.mensajes.innerHTML = `
      <div class="chat-bubble chat-bubble-system">
        <span>Sala <strong>${codigoSala}</strong> iniciada. Comparte el código con tu rival para conectar.</span>
      </div>
    `;
    this.actualizarEstado("esperando", "Esperando rival...");
    if (this.elementos.barraRival) {
      this.elementos.barraRival.classList.add("hidden");
    }
  },

  /**
   * Prevención de inyección XSS básica
   */
  escaparHtml(str) {
    const p = document.createElement("p");
    p.textContent = str;
    return p.innerHTML;
  }
};
