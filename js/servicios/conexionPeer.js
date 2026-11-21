/**
 * Servicio de Red P2P con PeerJS (WebRTC)
 * Permite partidas multijugador y chat en tiempo real sin servidor backend.
 */

const redP2P = {
  peer: null,
  conexion: null,
  esAnfitrion: false,
  conectado: false,
  codigoSala: null,

  // Manejadores de eventos (callbacks)
  eventos: {
    alConectar: null,       // (esAnfitrion) => {}
    alRecibirChat: null,    // (mensaje) => {}
    alRecibirAccion: null,  // (tipoAccion, datos) => {}
    alDesconectar: null,    // () => {}
    alError: null           // (mensajeError) => {}
  },

  /**
   * Genera el ID de Peer único a partir del código de sala
   * @param {string} codigo
   * @returns {string}
   */
  obtenerIdPeer(codigo) {
    const limpio = (codigo || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    return `pokequien-${limpio}`;
  },

  /**
   * Inicia el modo Anfitrión (Jugador 1 crea la sala y espera rival)
   * @param {string} codigoSala
   */
  crearSalaP2P(codigoSala) {
    this.cerrar();
    this.codigoSala = codigoSala;
    this.esAnfitrion = true;

    const idPeer = this.obtenerIdPeer(codigoSala);

    try {
      this.peer = new Peer(idPeer, {
        debug: 1
      });

      this.peer.on("open", (id) => {
        console.log(`[P2P] Sala creada con ID Peer: ${id}. Esperando rival...`);
        showToast("Sala P2P lista. Esperando que el rival se una...", "info", 4000);
      });

      // El rival se conecta
      this.peer.on("connection", (conn) => {
        console.log("[P2P] Rival conectado!");
        this.conexion = conn;
        this.configurarConexion(conn);
      });

      this.peer.on("error", (err) => {
        console.warn("[P2P Error Anfitrión]:", err);
        if (err.type === "unavailable-id") {
          showToast("Este código de sala ya está en uso. Prueba creando una nueva partida.", "error", 5000);
        } else {
          showToast(`Error de conexión P2P: ${err.type || err.message}`, "error");
        }
        if (this.eventos.alError) this.eventos.alError(err);
      });

      this.peer.on("disconnected", () => {
        console.log("[P2P] Desconectado del servidor de señalización.");
      });

    } catch (e) {
      console.error("[P2P Fallo al iniciar Peer]:", e);
    }
  },

  /**
   * Inicia el modo Invitado (Jugador 2 se une al código del Jugador 1)
   * @param {string} codigoSala
   */
  unirseASalaP2P(codigoSala) {
    this.cerrar();
    this.codigoSala = codigoSala;
    this.esAnfitrion = false;

    const idHost = this.obtenerIdPeer(codigoSala);

    try {
      // Invitado se crea con ID aleatorio
      this.peer = new Peer(null, {
        debug: 1
      });

      this.peer.on("open", (miId) => {
        console.log(`[P2P] Conectando como invitado (${miId}) a: ${idHost}...`);
        const conn = this.peer.connect(idHost, {
          reliable: true
        });

        this.conexion = conn;
        this.configurarConexion(conn);
      });

      this.peer.on("error", (err) => {
        console.warn("[P2P Error Invitado]:", err);
        showToast("No se pudo conectar a la sala. Verifica que el código sea correcto.", "error", 5000);
        if (this.eventos.alError) this.eventos.alError(err);
      });

    } catch (e) {
      console.error("[P2P Fallo al unirse]:", e);
    }
  },

  /**
   * Configura los escuchadores del canal de datos DataConnection
   * @param {DataConnection} conn
   */
  configurarConexion(conn) {
    conn.on("open", () => {
      this.conectado = true;
      console.log("[P2P] Canal de datos abierto y sincronizado.");
      showToast("¡Rival conectado! La partida en tiempo real está activa.", "success", 4000);

      // Reproducir sonido de confirmación
      if (typeof sounds !== "undefined" && sounds.playSelectSecret) {
        sounds.playSelectSecret();
      }

      if (this.eventos.alConectar) {
        this.eventos.alConectar(this.esAnfitrion);
      }
    });

    conn.on("data", (datos) => {
      this.procesarDatosRecibidos(datos);
    });

    conn.on("close", () => {
      this.conectado = false;
      console.log("[P2P] El rival se ha desconectado.");
      showToast("El rival se ha desconectado de la partida.", "error", 4000);
      if (this.eventos.alDesconectar) {
        this.eventos.alDesconectar();
      }
    });

    conn.on("error", (err) => {
      console.error("[P2P Error en DataConnection]:", err);
      if (this.eventos.alError) this.eventos.alError(err);
    });
  },

  /**
   * Procesa cualquier paquete que llegue del otro jugador
   * @param {{ tipo: string, payload: any }} paquete
   */
  procesarDatosRecibidos(paquete) {
    if (!paquete || typeof paquete !== "object") return;

    switch (paquete.tipo) {
      case "CHAT":
        if (this.eventos.alRecibirChat) {
          this.eventos.alRecibirChat(paquete.payload);
        }
        break;

      case "ACCION":
        if (this.eventos.alRecibirAccion) {
          this.eventos.alRecibirAccion(paquete.accion, paquete.datos);
        }
        break;

      default:
        console.log("[P2P] Paquete desconocido recibido:", paquete);
    }
  },

  /**
   * Envía un mensaje de texto al chat del rival
   * @param {string} texto
   * @param {string} nombreRemitente
   * @returns {{ remitente: string, texto: string, hora: string }|null}
   */
  enviarMensajeChat(texto, nombreRemitente = "Tú") {
    const limpio = (texto || "").trim();
    if (!limpio) return null;

    const ahora = new Date();
    const hora = ahora.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const mensaje = {
      remitente: nombreRemitente,
      texto: limpio,
      hora
    };

    if (this.conexion && this.conexion.open) {
      this.conexion.send({
        tipo: "CHAT",
        payload: {
          remitente: "Rival",
          texto: limpio,
          hora
        }
      });
    }

    return mensaje;
  },

  /**
   * Envía una acción del juego al rival (ej: cartas descartadas, intento de adivinar)
   * @param {string} accion Nombre de la acción ('DESCARTE', 'ADIVINAR', 'VICTORIA')
   * @param {object} datos
   */
  enviarAccionJuego(accion, datos = {}) {
    if (this.conexion && this.conexion.open) {
      this.conexion.send({
        tipo: "ACCION",
        accion,
        datos
      });
    }
  },

  /**
   * Cierra y limpia la conexión actual
   */
  cerrar() {
    this.conectado = false;
    if (this.conexion) {
      try { this.conexion.close(); } catch (e) {}
      this.conexion = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
  }
};
