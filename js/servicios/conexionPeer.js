/**
 * Servicio de Red en Tiempo Real (WebSocket Seguro MQTT + Respaldo WebRTC PeerJS)
 * Permite partidas multijugador 1 vs 1 y chat sin servidor backend, incluso entre redes distintas (Wi-Fi / 4G / 5G).
 */

// Objeto global de red multijugador
const redP2P = {
  peer: null,
  conexion: null,
  mqttClient: null,
  modoTransporte: "mqtt", // "mqtt" | "peerjs"
  esAnfitrion: false,
  conectado: false,
  codigoSala: null,
  miId: null,
  rivalId: null,
  topicoSala: null,
  _intervaloJoin: null,
  _intervaloPing: null,
  _timeoutBroker: null,
  _timeoutReintentoPeer: null,
  _ultimoContactoRival: 0,
  _mensajesProcesados: new Set(),
  _brokerIndex: 0,
  _listenersRegistrados: false,

  // Brokers públicos WSS con respaldo automático (funcionan sobre TLS incluso detrás de NAT estrictos / 4G)
  brokersMQTT: [
    "wss://broker.emqx.io:8084/mqtt",
    "wss://broker.hivemq.com:8884/mqtt"
  ],

  // Servidores STUN de respaldo si se usa PeerJS
  configICE: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" }
    ]
  },

  // Manejadores de eventos (callbacks)
  eventos: {
    alConectar: null,       // (esAnfitrion) => {}
    alRecibirChat: null,    // (mensaje) => {}
    alRecibirAccion: null,  // (tipoAccion, datos) => {}
    alDesconectar: null,    // () => {}
    alError: null           // (mensajeError) => {}
  },

  /**
   * Genera un identificador aleatorio corto para distinguir cada jugador/mensaje
   * @param {string} prefijo
   * @returns {string}
   */
  _generarId(prefijo = "id") {
    const rand = Math.random().toString(36).slice(2, 10);
    const ts = Date.now().toString(36).slice(-4);
    return `${prefijo}_${rand}${ts}`;
  },

  /**
   * Registra eventos globales de pestaña una sola vez (reconexión al volver y aviso al cerrar)
   */
  _registrarEventosVentana() {
    if (this._listenersRegistrados || typeof window === "undefined") return;
    this._listenersRegistrados = true;

    // Al volver a la pestaña (ej: después de compartir el código en WhatsApp), asegura que siga conectado
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.codigoSala) {
        if (this.modoTransporte === "mqtt" && this.mqttClient && !this.mqttClient.connected) {
          try {
            this.mqttClient.reconnect();
          } catch (e) {}
        } else if (this.modoTransporte === "peerjs" && this.peer && this.peer.disconnected && !this.peer.destroyed) {
          try {
            this.peer.reconnect();
          } catch (e) {}
        }
      }
    });

    // Avisa al rival si el jugador cierra la pestaña
    window.addEventListener("beforeunload", () => {
      if (this.modoTransporte === "mqtt" && this.mqttClient && this.mqttClient.connected && this.topicoSala) {
        this._publicarMQTT({ tipo: "BYE" }, 0);
      }
    });
  },

  /**
   * Genera el ID de sala limpio a partir del código de sala
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
    this._registrarEventosVentana();
    this.codigoSala = codigoSala;
    this.esAnfitrion = true;
    this.miId = this._generarId("host");

    if (typeof mqtt !== "undefined") {
      this._iniciarMQTT(codigoSala, 0);
    } else if (typeof Peer !== "undefined") {
      this._crearSalaPeerJS(codigoSala);
    } else {
      showToast("No se pudo cargar el servicio de red. Verifica tu conexión a internet.", "error", 5000);
    }
  },

  /**
   * Inicia el modo Invitado (Jugador 2 se une al código del Jugador 1)
   * @param {string} codigoSala
   */
  unirseASalaP2P(codigoSala) {
    this.cerrar();
    this._registrarEventosVentana();
    this.codigoSala = codigoSala;
    this.esAnfitrion = false;
    this.miId = this._generarId("guest");

    if (typeof mqtt !== "undefined") {
      this._iniciarMQTT(codigoSala, 0);
    } else if (typeof Peer !== "undefined") {
      this._unirseSalaPeerJS(codigoSala);
    } else {
      showToast("No se pudo cargar el servicio de red. Verifica tu conexión a internet.", "error", 5000);
    }
  },

  /**
   * Promueve al jugador actual como Anfitrión de la sala cuando se queda solo.
   * Esto permite que la sala siga viva y pueda aceptar nuevas conexiones de rivales.
   */
  asumirRolAnfitrion() {
    this.esAnfitrion = true;
    this.conectado = false;
    this.rivalId = null;
    clearInterval(this._intervaloJoin);
    clearInterval(this._intervaloPing);

    // Guardar en sessionStorage para persistir rol si recarga
    if (this.codigoSala && typeof sessionStorage !== "undefined") {
      try {
        sessionStorage.setItem(`poke_host_${this.codigoSala}`, "true");
      } catch (e) {}
    }

    if (this.modoTransporte === "mqtt") {
      if (this.mqttClient && this.mqttClient.connected && this.topicoSala) {
        console.log(`[Red] Asumiendo rol de anfitrión en ${this.topicoSala}. Avisando HOST_READY...`);
        this._publicarMQTT({ tipo: "HOST_READY" }, 1);
      }
    } else if (this.modoTransporte === "peerjs") {
      if (this.codigoSala) {
        this._crearSalaPeerJS(this.codigoSala);
      }
    }
  },

  // =========================================================================
  // TRANSPORTE PRINCIPAL: MQTT OVER SECURE WEBSOCKET (WSS)
  // =========================================================================

  /**
   * Conecta al broker MQTT seguro y suscribe al tópico único de la sala
   * @param {string} codigoSala
   * @param {number} brokerIndex
   */
  _iniciarMQTT(codigoSala, brokerIndex = 0) {
    this.modoTransporte = "mqtt";
    this._brokerIndex = brokerIndex;
    const brokerUrl = this.brokersMQTT[brokerIndex] || this.brokersMQTT[0];
    const idLimpio = this.obtenerIdPeer(codigoSala);
    this.topicoSala = `pokequien-ouyeah/v1/sala/${idLimpio}`;

    console.log(`[Red] Conectando a sala ${codigoSala} (${this.esAnfitrion ? "Anfitrión" : "Invitado"}) vía ${brokerUrl}...`);

    try {
      const lwtPayload = JSON.stringify({
        msgId: this._generarId("bye"),
        senderId: this.miId,
        tipo: "BYE"
      });

      const client = mqtt.connect(brokerUrl, {
        clientId: `pkq_${this.miId}`,
        clean: true,
        connectTimeout: 6000,
        reconnectPeriod: 2500,
        keepalive: 30,
        timerVariant: "native",
        will: {
          topic: this.topicoSala,
          payload: lwtPayload,
          qos: 0,
          retain: false
        }
      });

      this.mqttClient = client;

      // Si el primer broker no conecta en 6 segundos, intenta automáticamente el broker de respaldo
      clearTimeout(this._timeoutBroker);
      this._timeoutBroker = setTimeout(() => {
        if (this.mqttClient === client && !client.connected) {
          console.warn(`[Red] Tiempo agotado en ${brokerUrl}.`);
          try { client.end(true); } catch (e) {}
          if (brokerIndex + 1 < this.brokersMQTT.length) {
            this._iniciarMQTT(codigoSala, brokerIndex + 1);
          } else if (typeof Peer !== "undefined") {
            console.warn("[Red] Cambiando a respaldo PeerJS...");
            if (this.esAnfitrion) {
              this._crearSalaPeerJS(codigoSala);
            } else {
              this._unirseSalaPeerJS(codigoSala);
            }
          } else {
            showToast("No se pudo conectar al servidor de partidas. Revisa tu conexión.", "error", 5000);
          }
        }
      }, 6500);

      client.on("connect", () => {
        if (this.mqttClient !== client) return;
        clearTimeout(this._timeoutBroker);
        console.log(`[Red] Conectado al broker (${brokerUrl}). Suscribiendo a ${this.topicoSala}...`);

        client.subscribe(this.topicoSala, { qos: 1 }, (err) => {
          if (err) {
            console.error("[Red] Error al suscribir a la sala:", err);
            showToast("Error al entrar a la sala. Intenta recargar.", "error");
            return;
          }

          if (this.esAnfitrion) {
            if (!this.conectado) {
              showToast("Sala lista. Esperando que el rival se una...", "info", 4000);
            }
            // Avisa que el anfitrión está listo (por si el invitado ya estaba esperando)
            this._publicarMQTT({ tipo: "HOST_READY" }, 1);
          } else {
            // Invitado solicita unirse al anfitrión con reintento automático hasta conectar
            this._solicitarUnionConReintentos();
          }
        });
      });

      client.on("message", (topic, payloadBuf) => {
        if (this.mqttClient !== client || topic !== this.topicoSala) return;
        try {
          const texto = typeof payloadBuf === "string" ? payloadBuf : payloadBuf.toString();
          const paquete = JSON.parse(texto);
          this._procesarPaqueteMQTT(paquete);
        } catch (e) {
          console.warn("[Red] Paquete JSON inválido recibido:", e);
        }
      });

      client.on("error", (err) => {
        console.warn("[Red] Error MQTT:", err?.message || err);
        if (this.eventos.alError) this.eventos.alError(err);
      });

      client.on("offline", () => {
        console.log("[Red] Conexión en pausa (offline), esperando reconexión...");
      });
    } catch (e) {
      console.error("[Red] Fallo al iniciar MQTT:", e);
      if (typeof Peer !== "undefined") {
        if (this.esAnfitrion) this._crearSalaPeerJS(codigoSala);
        else this._unirseSalaPeerJS(codigoSala);
      }
    }
  },

  /**
   * Publica un paquete JSON en el tópico de la sala
   * @param {object} datos
   * @param {number} [qos=1]
   */
  _publicarMQTT(datos, qos = 1) {
    if (!this.mqttClient || !this.mqttClient.connected || !this.topicoSala) return false;

    const paquete = {
      msgId: this._generarId("m"),
      senderId: this.miId,
      targetId: datos.targetId !== undefined ? datos.targetId : (this.rivalId || null),
      ...datos
    };

    try {
      this.mqttClient.publish(this.topicoSala, JSON.stringify(paquete), { qos });
      return true;
    } catch (e) {
      console.warn("[Red] No se pudo publicar paquete:", e);
      return false;
    }
  },

  /**
   * Como invitado, envía JOIN_REQ inmediatamente y reintenta cada 2.5s hasta recibir JOIN_ACK
   */
  _solicitarUnionConReintentos() {
    clearInterval(this._intervaloJoin);
    let intentos = 0;

    const enviarSolicitud = () => {
      if (this.conectado || !this.mqttClient || !this.mqttClient.connected) {
        if (this.conectado) clearInterval(this._intervaloJoin);
        return;
      }
      intentos++;
      this._publicarMQTT({ tipo: "JOIN_REQ", targetId: null }, 1);

      if (intentos === 1) {
        showToast("Conectando con el anfitrión de la sala...", "info", 3000);
      } else if (intentos === 6) {
        showToast("Aún esperando al anfitrión... Asegúrate de que tenga la sala abierta.", "info", 5000);
      }
    };

    enviarSolicitud();
    this._intervaloJoin = setInterval(enviarSolicitud, 2500);
  },

  /**
   * Inicia el latido periódico para detectar desconexiones silenciosas
   */
  _iniciarHeartbeat() {
    clearInterval(this._intervaloPing);
    this._ultimoContactoRival = Date.now();

    this._intervaloPing = setInterval(() => {
      if (!this.conectado) {
        clearInterval(this._intervaloPing);
        return;
      }
      this._publicarMQTT({ tipo: "PING" }, 0);
    }, 12000);
  },

  /**
   * Procesa los paquetes recibidos vía MQTT (handshake, control de sala llena, chat y acciones)
   * @param {object} paquete
   */
  _procesarPaqueteMQTT(paquete) {
    if (!paquete || typeof paquete !== "object") return;

    // Ignorar nuestros propios mensajes rebotados por el broker
    if (paquete.senderId === this.miId) return;

    // Deduplicar mensajes repetidos por QoS 1
    if (paquete.msgId) {
      if (this._mensajesProcesados.has(paquete.msgId)) return;
      this._mensajesProcesados.add(paquete.msgId);
      if (this._mensajesProcesados.size > 250) {
        const primeros = Array.from(this._mensajesProcesados).slice(0, 100);
        primeros.forEach(id => this._mensajesProcesados.delete(id));
      }
    }

    // Si el mensaje va dirigido a otro cliente específico, ignorarlo
    if (paquete.targetId && paquete.targetId !== this.miId) return;

    // --- Handshake de entrada ---
    if (paquete.tipo === "HOST_READY") {
      if (!this.esAnfitrion && (!this.conectado || this.rivalId !== paquete.senderId)) {
        this._publicarMQTT({ tipo: "JOIN_REQ", targetId: paquete.senderId }, 1);
      }
      return;
    }

    if (paquete.tipo === "JOIN_REQ") {
      if (!this.esAnfitrion) return;

      // Si ya hay un rival activo distinto y respondió recientemente (< 25s), rechaza al 3er jugador
      const rivalActivo = this.conectado && this.rivalId && this.rivalId !== paquete.senderId &&
        (Date.now() - this._ultimoContactoRival < 25000);

      if (rivalActivo) {
        console.warn("[Red] Intento de conexión rechazado: la sala ya tiene 2 jugadores.");
        this._publicarMQTT({
          tipo: "ERROR_SALA_LLENA",
          targetId: paquete.senderId,
          mensaje: "🚫 La sala ya está llena (máximo 2 jugadores). Crea una nueva sala para jugar."
        }, 1);
        return;
      }

      // Acepta al rival y responde JOIN_ACK
      const eraNuevo = !this.conectado || this.rivalId !== paquete.senderId;
      this.rivalId = paquete.senderId;
      this._ultimoContactoRival = Date.now();
      this._publicarMQTT({ tipo: "JOIN_ACK", targetId: paquete.senderId }, 1);

      if (eraNuevo) {
        this._notificarConexionEstablecida();
      }
      return;
    }

    if (paquete.tipo === "JOIN_ACK") {
      if (this.esAnfitrion) return;
      clearInterval(this._intervaloJoin);
      const eraNuevo = !this.conectado || this.rivalId !== paquete.senderId;
      this.rivalId = paquete.senderId;
      this._ultimoContactoRival = Date.now();

      if (eraNuevo) {
        this._notificarConexionEstablecida();
      }
      return;
    }

    if (paquete.tipo === "ERROR_SALA_LLENA") {
      clearInterval(this._intervaloJoin);
      showToast(paquete.mensaje || "🚫 La sala ya está llena (máximo 2 jugadores).", "error", 6000);
      this.cerrar();
      return;
    }

    // A partir de aquí, solo aceptar mensajes del rival emparejado
    if (this.rivalId && paquete.senderId !== this.rivalId) return;
    this._ultimoContactoRival = Date.now();

    if (paquete.tipo === "PING") {
      this._publicarMQTT({ tipo: "PONG" }, 0);
      return;
    }

    if (paquete.tipo === "PONG") {
      return;
    }

    if (paquete.tipo === "BYE") {
      if (this.conectado) {
        this.conectado = false;
        this.rivalId = null;
        clearInterval(this._intervaloPing);
        console.log("[Red] El rival se ha desconectado.");
        showToast("El rival se ha desconectado de la partida.", "error", 4000);
        if (this.eventos.alDesconectar) {
          this.eventos.alDesconectar();
        }
      }
      return;
    }

    // Paquetes de juego (CHAT / ACCION)
    this.procesarDatosRecibidos(paquete);
  },

  /**
   * Marca la sala como conectada y dispara sonidos, toast y callback de la app
   */
  _notificarConexionEstablecida() {
    this.conectado = true;
    this._iniciarHeartbeat();
    console.log("[Red] Canal de datos abierto y sincronizado con el rival.");
    showToast("¡Rival conectado! La partida en tiempo real está activa.", "success", 4000);

    if (typeof sounds !== "undefined" && sounds.playSelectSecret) {
      sounds.playSelectSecret();
    }

    if (this.eventos.alConectar) {
      this.eventos.alConectar(this.esAnfitrion);
    }
  },

  // =========================================================================
  // TRANSPORTE DE RESPALDO: PEERJS (WEBRTC)
  // =========================================================================

  /**
   * Respaldo WebRTC PeerJS como Anfitrión
   * @param {string} codigoSala
   */
  _crearSalaPeerJS(codigoSala) {
    this.modoTransporte = "peerjs";
    const idPeer = this.obtenerIdPeer(codigoSala);

    try {
      this.peer = new Peer(idPeer, {
        debug: 1,
        config: this.configICE
      });

      this.peer.on("open", (id) => {
        console.log(`[P2P] Sala creada con ID Peer: ${id}. Esperando rival...`);
        showToast("Sala P2P lista. Esperando que el rival se una...", "info", 4000);
      });

      this.peer.on("connection", (conn) => {
        if (this.conectado && this.conexion && this.conexion.open) {
          console.warn("[P2P] Intento de conexión rechazado: la sala ya tiene 2 jugadores.");
          conn.on("open", () => {
            try {
              conn.send({
                tipo: "ERROR_SALA_LLENA",
                mensaje: "🚫 La sala ya está llena (máximo 2 jugadores). Crea una nueva sala para jugar."
              });
              setTimeout(() => conn.close(), 500);
            } catch (e) {}
          });
          return;
        }

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
        console.log("[P2P] Desconectado del servidor de señalización. Reconectando...");
        if (this.peer && !this.peer.destroyed) {
          setTimeout(() => {
            try { this.peer.reconnect(); } catch (e) {}
          }, 1500);
        }
      });
    } catch (e) {
      console.error("[P2P Fallo al iniciar Peer]:", e);
    }
  },

  /**
   * Respaldo WebRTC PeerJS como Invitado
   * @param {string} codigoSala
   */
  _unirseSalaPeerJS(codigoSala) {
    this.modoTransporte = "peerjs";
    const idHost = this.obtenerIdPeer(codigoSala);

    try {
      this.peer = new Peer(null, {
        debug: 1,
        config: this.configICE
      });

      const conectarAlHost = () => {
        if (!this.peer || this.peer.destroyed || this.conectado) return;
        console.log(`[P2P] Conectando como invitado a: ${idHost}...`);
        const conn = this.peer.connect(idHost, { reliable: true });
        this.conexion = conn;
        this.configurarConexion(conn);
      };

      this.peer.on("open", conectarAlHost);

      this.peer.on("error", (err) => {
        console.warn("[P2P Error Invitado]:", err);
        if (err.type === "peer-unavailable" && !this.conectado) {
          clearTimeout(this._timeoutReintentoPeer);
          this._timeoutReintentoPeer = setTimeout(conectarAlHost, 3000);
        } else {
          showToast("No se pudo conectar a la sala. Verifica que el código sea correcto.", "error", 5000);
        }
        if (this.eventos.alError) this.eventos.alError(err);
      });
    } catch (e) {
      console.error("[P2P Fallo al unirse]:", e);
    }
  },

  /**
   * Configura los escuchadores del canal de datos DataConnection (respaldo PeerJS)
   * @param {DataConnection} conn
   */
  configurarConexion(conn) {
    conn.on("open", () => {
      this._notificarConexionEstablecida();
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

  // =========================================================================
  // INTERFAZ COMÚN DE ENVÍO Y RECEPCIÓN (CHAT Y ACCIONES DE JUEGO)
  // =========================================================================

  /**
   * Procesa cualquier paquete de juego o chat que llegue del otro jugador
   * @param {{ tipo: string, payload?: any, accion?: string, datos?: any }} paquete
   */
  procesarDatosRecibidos(paquete) {
    if (!paquete || typeof paquete !== "object") return;

    switch (paquete.tipo) {
      case "ERROR_SALA_LLENA":
        showToast(paquete.mensaje || "🚫 La sala ya está llena (máximo 2 jugadores).", "error", 6000);
        this.cerrar();
        break;

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
        console.log("[Red] Paquete desconocido recibido:", paquete);
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

    const paquete = {
      tipo: "CHAT",
      payload: {
        remitente: "Rival",
        texto: limpio,
        hora
      }
    };

    if (this.modoTransporte === "mqtt") {
      if (this.conectado) this._publicarMQTT(paquete, 1);
    } else if (this.conexion && this.conexion.open) {
      this.conexion.send(paquete);
    }

    return mensaje;
  },

  /**
   * Envía una acción del juego al rival (ej: cartas descartadas, intento de adivinar, turno)
   * @param {string} accion Nombre de la acción
   * @param {object} datos
   */
  enviarAccionJuego(accion, datos = {}) {
    const paquete = {
      tipo: "ACCION",
      accion,
      datos
    };

    if (this.modoTransporte === "mqtt") {
      if (this.conectado) this._publicarMQTT(paquete, 1);
    } else if (this.conexion && this.conexion.open) {
      this.conexion.send(paquete);
    }
  },

  /**
   * Cierra y limpia la conexión actual
   */
  cerrar() {
    clearInterval(this._intervaloJoin);
    clearInterval(this._intervaloPing);
    clearTimeout(this._timeoutBroker);
    clearTimeout(this._timeoutReintentoPeer);

    if (this.modoTransporte === "mqtt" && this.mqttClient) {
      try {
        if (this.mqttClient.connected && this.topicoSala) {
          this._publicarMQTT({ tipo: "BYE" }, 0);
        }
        this.mqttClient.end(true);
      } catch (e) {}
      this.mqttClient = null;
    }

    this.conectado = false;
    this.rivalId = null;
    this.topicoSala = null;
    this._mensajesProcesados.clear();

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
