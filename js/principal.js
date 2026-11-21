/**
 * PokéQuién - Adivina Quién con Pokémon (2 Jugadores)
 * Punto de Entrada Principal (Orquestador de Módulos y P2P)
 */

/**
 * Configura los eventos de conexión, chat y sincronización P2P
 */
function configurarEventosP2P() {
  if (typeof redP2P === "undefined") return;

  // Cuando se establece la conexión directa entre ambos jugadores
  redP2P.eventos.alConectar = (esAnfitrion) => {
    if (typeof vistaChat !== "undefined") {
      vistaChat.actualizarEstado("conectado", "Rival en línea");
      vistaChat.agregarBurbuja({
        texto: "🟢 ¡Rival conectado! La partida en tiempo real está activa.",
        tipo: "system"
      });
      // Sincronizar conteo inicial de cartas
      const restantes = 30 - state.discardedIds.size;
      redP2P.enviarAccionJuego("DESCARTE", { restantes });

      // Si ya estábamos listos antes de la conexión, avisar al rival con compromiso
      if (state.isPlayerReady) {
        if (state.secretHash) {
          redP2P.enviarAccionJuego("COMPROMISO_HASH", { hash: state.secretHash, listo: true });
        } else {
          redP2P.enviarAccionJuego("LISTO", { listo: true });
        }
      }
    }
  };

  // Cuando llega un mensaje de chat desde el rival
  redP2P.eventos.alRecibirChat = (payload) => {
    if (typeof vistaChat !== "undefined") {
      vistaChat.agregarBurbuja({
        remitente: payload.remitente || "Rival",
        texto: payload.texto,
        hora: payload.hora,
        tipo: "rival"
      });
    }
    // Sonido al recibir mensaje
    if (typeof sounds !== "undefined" && sounds.playFlip) {
      sounds.playFlip();
    }
  };

  // Cuando el rival realiza una acción en su tablero (descarte, reinicio, adivinanza, anti-trampas)
  redP2P.eventos.alRecibirAccion = async (tipoAccion, datos) => {
    if (tipoAccion === "DESCARTE" && typeof vistaChat !== "undefined") {
      vistaChat.actualizarRivalRestantes(datos.restantes);
      vistaChat.agregarBurbuja({
        texto: `El rival tiene ${datos.restantes} Pokémon restantes en su tablero.`,
        tipo: "system"
      });
    } else if (tipoAccion === "REINICIO" && typeof vistaChat !== "undefined") {
      vistaChat.actualizarRivalRestantes(30);
      vistaChat.agregarBurbuja({
        texto: "El rival ha reiniciado todos sus descartes (30 restantes).",
        tipo: "system"
      });
    } else if ((tipoAccion === "LISTO" || tipoAccion === "COMPROMISO_HASH") && typeof vistaChat !== "undefined") {
      state.isRivalReady = true;
      if (datos.hash) {
        state.rivalSecretHash = datos.hash;
      }

      // Si este jugador ya estaba listo, ambos lo están ahora: la partida se bloquea
      if (state.isPlayerReady) {
        state.isGameStarted = true;
        if (typeof saveReadyToSession === "function") saveReadyToSession();
      }

      if (typeof syncReadyUI === "function") {
        syncReadyUI();
      }

      const hashCorto = datos.hash ? ` (Hash SHA-256: ${datos.hash.substring(0, 8)}...)` : "";
      vistaChat.agregarBurbuja({
        texto: `🛡️ Tu rival ha confirmado su Pokémon secreto y está ¡Listo!${hashCorto}`,
        tipo: "system"
      });

      if (state.isPlayerReady) {
        vistaChat.agregarBurbuja({
          texto: "🎮 ¡Ambos jugadores están listos y protegidos con Anti-Trampas! ¡Que comience la partida!",
          tipo: "system"
        });
        showToast("¡Ambos jugadores listos! ¡A jugar!", "success", 4000);
        if (state.soundEnabled && sounds.playSelectSecret) {
          sounds.playSelectSecret();
        }
      } else {
        showToast("¡Tu rival ya está listo! Elige tu Pokémon y pulsa ¡Listo!", "info", 4000);
      }
    } else if (tipoAccion === "ADIVINAR") {
      // El rival está intentando adivinar nuestro Pokémon secreto
      const guessedId = Number(datos.guessedPokemonId);
      const acierto = Boolean(state.secretPokemon && state.secretPokemon.id === guessedId);

      if (acierto) {
        redP2P.enviarAccionJuego("RESPUESTA_ADIVINAR", {
          acierto: true,
          pokemon: {
            id: state.secretPokemon.id,
            name: state.secretPokemon.name,
            image: state.secretPokemon.image,
            animatedImage: state.secretPokemon.animatedImage,
            types: state.secretPokemon.types
          },
          salt: state.secretSalt
        });

        if (typeof vistaChat !== "undefined") {
          vistaChat.agregarBurbuja({
            texto: `🎯 ¡Tu rival adivinó tu Pokémon secreto (${state.secretPokemon.name})! Fin de la partida.`,
            tipo: "system"
          });
        }

        if (typeof showGameResultModal === "function") {
          showGameResultModal({
            titulo: "¡Tu rival ha adivinado tu Pokémon!",
            subtitulo: `Tu Pokémon secreto era ${state.secretPokemon.name}. Tu rival ha ganado la partida.`,
            esTrampa: false,
            pokemonRival: state.secretPokemon
          });
        }
      } else {
        const guessedPoke = state.boardPokemonData.find(p => p.id === guessedId);
        const guessedName = guessedPoke ? guessedPoke.name : "un Pokémon";

        redP2P.enviarAccionJuego("RESPUESTA_ADIVINAR", {
          acierto: false,
          guessedPokemonId: guessedId
        });

        if (typeof vistaChat !== "undefined") {
          vistaChat.agregarBurbuja({
            texto: `🎯 Tu rival intentó adivinar "${guessedName}", ¡pero falló!`,
            tipo: "system"
          });
        }
        showToast(`Tu rival intentó adivinar (${guessedName}) pero falló.`, "info", 4000);
      }
    } else if (tipoAccion === "RESPUESTA_ADIVINAR") {
      // El rival respondió a nuestro intento de adivinanza
      if (datos.acierto) {
        let esLimpio = true;
        if (typeof seguridadAntiTrampas !== "undefined" && state.rivalSecretHash) {
          esLimpio = await seguridadAntiTrampas.verificarHashPokemon(
            datos.pokemon.id,
            datos.salt,
            state.roomCode,
            state.rivalSecretHash
          );
        }

        if (esLimpio) {
          if (state.soundEnabled && sounds.playSelectSecret) sounds.playSelectSecret();
          if (typeof showGameResultModal === "function") {
            showGameResultModal({
              titulo: "🏆 ¡VICTORIA! ¡ADIVINASTE!",
              subtitulo: `¡Adivinaste correctamente! El Pokémon secreto de tu rival era ${datos.pokemon.name}.`,
              esTrampa: false,
              pokemonRival: datos.pokemon
            });
          }
          if (typeof vistaChat !== "undefined") {
            vistaChat.agregarBurbuja({
              texto: `🏆 ¡VICTORIA! Adivinaste el Pokémon del rival (${datos.pokemon.name}). 🛡️ Firma SHA-256 verificada: 100% LIMPIA.`,
              tipo: "system"
            });
          }
        } else {
          if (typeof showGameResultModal === "function") {
            showGameResultModal({
              titulo: "🚨 ¡TRAMPA DETECTADA!",
              subtitulo: `El rival alteró su Pokémon secreto durante la partida. La firma SHA-256 no coincide con el sello inicial.`,
              esTrampa: true,
              pokemonRival: datos.pokemon
            });
          }
          if (typeof vistaChat !== "undefined") {
            vistaChat.agregarBurbuja({
              texto: `🚨 ¡ALERTA DE TRAMPA! El rival modificó su Pokémon secreto. La firma SHA-256 fue rechazada.`,
              tipo: "system"
            });
          }
        }
      } else {
        showToast("❌ ¡Fallaste! Ese no es el Pokémon secreto de tu rival.", "error", 4000);
        if (typeof vistaChat !== "undefined") {
          vistaChat.agregarBurbuja({
            texto: "❌ Tu intento de adivinanza fue incorrecto. ¡Sigue preguntando!",
            tipo: "system"
          });
        }
      }
    } else if (tipoAccion === "REVELAR_FINAL") {
      // Solicitud de revelación mutua al terminar
      if (!datos.esRespuesta && state.secretPokemon) {
        redP2P.enviarAccionJuego("REVELAR_FINAL", {
          pokemon: {
            id: state.secretPokemon.id,
            name: state.secretPokemon.name,
            image: state.secretPokemon.image,
            animatedImage: state.secretPokemon.animatedImage,
            types: state.secretPokemon.types
          },
          salt: state.secretSalt,
          esRespuesta: true
        });
      }

      let esLimpio = true;
      if (typeof seguridadAntiTrampas !== "undefined" && state.rivalSecretHash) {
        esLimpio = await seguridadAntiTrampas.verificarHashPokemon(
          datos.pokemon.id,
          datos.salt,
          state.roomCode,
          state.rivalSecretHash
        );
      }

      if (typeof showGameResultModal === "function") {
        showGameResultModal({
          titulo: esLimpio ? "Partida Finalizada" : "🚨 ¡TRAMPA DETECTADA!",
          subtitulo: esLimpio
            ? `El Pokémon secreto del rival era ${datos.pokemon.name}. Partida 100% limpia y verificada.`
            : `El rival intentó alterar su Pokémon secreto. El hash SHA-256 no coincide.`,
          esTrampa: !esLimpio,
          pokemonRival: datos.pokemon
        });
      }
    }
  };

  // Si el rival se desconecta
  redP2P.eventos.alDesconectar = () => {
    if (typeof vistaChat !== "undefined") {
      vistaChat.actualizarEstado("desconectado", "Rival desconectado");
      vistaChat.agregarBurbuja({
        texto: "🔴 El rival se ha desconectado de la sala.",
        tipo: "system"
      });
    }
  };
}

/**
 * Inicia la conexión P2P para la sala actual
 * @param {string} codigo
 * @param {boolean} esAnfitrion
 */
function iniciarPartidaP2P(codigo, esAnfitrion) {
  if (typeof vistaChat !== "undefined") {
    vistaChat.reiniciarChat(codigo);
  }
  if (typeof redP2P !== "undefined") {
    if (esAnfitrion) {
      redP2P.crearSalaP2P(codigo);
    } else {
      redP2P.unirseASalaP2P(codigo);
    }
  }
}

function initApp() {
  // 1. Inicializar Pantalla 1 (Setup) y Panel de Chat
  initSetupView();
  if (typeof vistaChat !== "undefined") {
    vistaChat.init();
  }

  // 2. Configurar eventos de red P2P WebRTC
  configurarEventosP2P();

  // 3. Vincular eventos de interfaces
  bindSetupEvents((roomCode, esAnfitrion) => {
    loadRoom(roomCode);
    iniciarPartidaP2P(roomCode, esAnfitrion);
  });
  bindBoardEvents();

  // 4. Inicializar y vincular Tema Visual y Color de Carcasa
  const savedTheme = localStorage.getItem("poke_theme") || "retro";
  applyTheme(savedTheme);

  if (typeof initCasingPicker === "function") {
    initCasingPicker();
  }

  const btnThemeToggle = document.getElementById("btn-toggle-theme");
  if (btnThemeToggle) {
    btnThemeToggle.addEventListener("click", toggleTheme);
  }

  // 5. Inicializar y vincular Audio Sintético
  const btnSound = document.getElementById("btn-toggle-sound");
  const iconSoundOn = document.querySelector(".icon.sound-on");
  const iconSoundOff = document.querySelector(".icon.sound-off");

  if (btnSound) {
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

  // 5b. Control de Pantalla Completa (Fullscreen API)
  const btnFs = document.getElementById("btn-toggle-fullscreen");
  if (btnFs) {
    const iconExpand = btnFs.querySelector(".fs-expand");
    const iconCompress = btnFs.querySelector(".fs-compress");

    function isFullscreenActive() {
      return Boolean(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
    }

    function syncFullscreenUI() {
      const active = isFullscreenActive();
      if (iconExpand && iconCompress) {
        iconExpand.classList.toggle("hidden", active);
        iconCompress.classList.toggle("hidden", !active);
      }
      btnFs.title = active ? "Salir de pantalla completa (Esc)" : "Pantalla completa";
      btnFs.setAttribute("aria-label", btnFs.title);
    }

    btnFs.addEventListener("click", async () => {
      try {
        if (!isFullscreenActive()) {
          const docEl = document.documentElement;
          if (docEl.requestFullscreen) {
            await docEl.requestFullscreen();
          } else if (docEl.webkitRequestFullscreen) {
            await docEl.webkitRequestFullscreen();
          } else if (docEl.msRequestFullscreen) {
            await docEl.msRequestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            await document.webkitExitFullscreen();
          } else if (document.msExitFullscreen) {
            await document.msExitFullscreen();
          }
        }
      } catch (e) {
        console.warn("Fullscreen no permitido o cancelado:", e);
      }
      syncFullscreenUI();
    });

    document.addEventListener("fullscreenchange", syncFullscreenUI);
    document.addEventListener("webkitfullscreenchange", syncFullscreenUI);
    document.addEventListener("mozfullscreenchange", syncFullscreenUI);
    document.addEventListener("MSFullscreenChange", syncFullscreenUI);
  }

  // 6. Enrutamiento Inicial por URL (?sala=CODIGO)
  const urlParams = new URLSearchParams(window.location.search);
  const paramSala = urlParams.get("sala");

  if (paramSala) {
    const parsed = parseRoomCode(paramSala);
    if (parsed.valid) {
      loadRoom(parsed.code);
      // Al entrar por URL compartida se asume que es el invitado uniéndose
      iniciarPartidaP2P(parsed.code, false);
    } else {
      showToast("El enlace de sala contiene un código inválido.", "error");
      showView("view-setup");
    }
  } else {
    showView("view-setup");
  }
}

// Ejecutar de forma segura tanto en carga como con DOM listo
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
