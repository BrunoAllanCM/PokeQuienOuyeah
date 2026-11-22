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
      const totalCards = state.boardPokemonData.length || state.boardPokemonIds.length || (state.roomGameMode === "starters" ? 27 : 30);
      const restantes = totalCards - state.discardedIds.size;
      redP2P.enviarAccionJuego("DESCARTE", { restantes });

      // Configurar turno inicial: Por defecto el anfitrión empieza, salvo que ya haya cedido el turno
      state.turnoActual = state.primerTurnoCedido ? 2 : 1;
      state.numeroTurno = 1;
      state.esMiTurno = redP2P.esAnfitrion ? !state.primerTurnoCedido : Boolean(state.primerTurnoCedido);
      if (typeof saveTurnToSession === "function") saveTurnToSession();

      // Si el anfitrión ya había cedido el turno al rival antes de la conexión, notificárselo
      if (redP2P.esAnfitrion && state.primerTurnoCedido) {
        redP2P.enviarAccionJuego("CEDER_PRIMER_TURNO", { primerTurnoPara: 2 });
      }

      // Si ya estábamos listos antes de la conexión, avisar al rival con compromiso
      if (state.isPlayerReady) {
        if (state.secretHash) {
          redP2P.enviarAccionJuego("COMPROMISO_HASH", { hash: state.secretHash, listo: true });
        } else {
          redP2P.enviarAccionJuego("LISTO", { listo: true });
        }
      }

      if (typeof syncReadyUI === "function") syncReadyUI();
      if (typeof actualizarUITurno === "function") actualizarUITurno();
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
    // Rival descartó cartas: actualiza su contador
    if (tipoAccion === "DESCARTE" && typeof vistaChat !== "undefined") {
      vistaChat.actualizarRivalRestantes(datos.restantes);
      vistaChat.agregarBurbuja({
        texto: `El rival tiene ${datos.restantes} Pokémon restantes en su tablero.`,
        tipo: "system"
      });
    // Rival reinició sus descartes
    } else if (tipoAccion === "REINICIO" && typeof vistaChat !== "undefined") {
      const totalCards = datos.restantes || state.boardPokemonData.length || (state.roomGameMode === "starters" ? 27 : 30);
      vistaChat.actualizarRivalRestantes(totalCards);
      vistaChat.agregarBurbuja({
        texto: `El rival ha reiniciado todos sus descartes (${totalCards} restantes).`,
        tipo: "system"
      });
    } else if (tipoAccion === "CEDER_PRIMER_TURNO") {
      state.primerTurnoCedido = true;
      state.primerTurnoPara = 2;
      state.turnoActual = 2;
      state.esMiTurno = true; // El rival comenzará jugando cuando ambos den Listo
      if (typeof saveTurnToSession === "function") saveTurnToSession();

      if (typeof sounds !== "undefined" && sounds.playTurnStart) {
        sounds.playTurnStart();
      }

      showToast("👑 ¡El anfitrión te ha cedido el primer turno de la partida!", "info", 5000);

      if (typeof vistaChat !== "undefined") {
        vistaChat.agregarBurbuja({
          texto: "👑 ¡El anfitrión te ha cedido el primer turno de la partida! Comenzarás jugando cuando ambos confirmen ¡Listo!.",
          tipo: "system"
        });
      }

      if (typeof actualizarUITurno === "function") {
        actualizarUITurno();
      }
    // Rival confirmó su Pokémon secreto (y su hash)
    } else if ((tipoAccion === "LISTO" || tipoAccion === "COMPROMISO_HASH") && typeof vistaChat !== "undefined") {
      state.isRivalReady = true;
      if (datos.hash) {
        state.rivalSecretHash = datos.hash;
      }

      // Regla: La partida solo arranca si AMBOS están conectados y listos
      const estanConectados = typeof redP2P !== "undefined" && redP2P.conectado;
      if (estanConectados && state.isPlayerReady) {
        state.isGameStarted = true;
        if (typeof saveReadyToSession === "function") saveReadyToSession();
      }

      if (typeof syncReadyUI === "function") {
        syncReadyUI();
      }
      if (typeof actualizarUITurno === "function") {
        actualizarUITurno();
      }

      const hashCorto = datos.hash ? ` (Hash SHA-256: ${datos.hash.substring(0, 8)}...)` : "";
      vistaChat.agregarBurbuja({
        texto: `🛡️ Tu rival ha confirmado su Pokémon secreto y está ¡Listo!${hashCorto}`,
        tipo: "system"
      });

      if (state.isGameStarted) {
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

      // Si el rival envió los datos de su Pokémon elegido, guardarlo en el estado
      if (datos.guesserPokemon) {
        state.secretPokemonRival = datos.guesserPokemon;
      }

      if (acierto) {
        state.isGameOver = true;
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

        // Mostrar al rival perdedor el Pokémon que eligió el rival ganador
        const pokemonElegidoPorRival = datos.guesserPokemon || state.secretPokemonRival;

        if (typeof showGameResultModal === "function") {
          showGameResultModal({
            titulo: "💀 ¡DERROTA! TU RIVAL HA ADIVINADO",
            subtitulo: `Tu rival adivinó correctamente que tu Pokémon era ${state.secretPokemon.name}. ¡Ha ganado la partida!`,
            esTrampa: false,
            pokemonRival: pokemonElegidoPorRival,
            etiquetaPokemon: "Pokémon que eligió tu rival:"
          });
        }
      } else {
        const guessedPoke = state.boardPokemonData.find(p => p.id === guessedId);
        const guessedName = guessedPoke ? guessedPoke.name : "un Pokémon";

        state.fallosAdivinanzaRival = (state.fallosAdivinanzaRival || 0) + 1;
        const esSegundoFallo = state.fallosAdivinanzaRival >= 2;

        redP2P.enviarAccionJuego("RESPUESTA_ADIVINAR", {
          acierto: false,
          guessedPokemonId: guessedId,
          esSegundoFallo,
          rivalPokemon: esSegundoFallo ? {
            id: state.secretPokemon.id,
            name: state.secretPokemon.name,
            image: state.secretPokemon.image,
            animatedImage: state.secretPokemon.animatedImage,
            types: state.secretPokemon.types
          } : null,
          salt: esSegundoFallo ? state.secretSalt : null
        });

        if (esSegundoFallo) {
          state.isGameOver = true;
          // ¡Segundo fallo del rival! Este jugador gana automáticamente y se muestran los Pokémon elegidos
          const pokemonElegidoPorRival = datos.guesserPokemon || state.secretPokemonRival;
          if (typeof showGameResultModal === "function") {
            showGameResultModal({
              titulo: "🏆 ¡VICTORIA! EL RIVAL AGOTÓ SUS INTENTOS",
              subtitulo: `Tu rival intentó adivinar "${guessedName}" y falló por segunda vez. ¡Has ganado la partida automáticamente!`,
              esTrampa: false,
              pokemonRival: pokemonElegidoPorRival,
              etiquetaPokemon: "Pokémon que eligió tu rival:",
              tipoResultado: "victory"
            });
          }
          if (typeof vistaChat !== "undefined") {
            vistaChat.agregarBurbuja({
              texto: `🏆 ¡VICTORIA! Tu rival falló por 2da vez al intentar adivinar y ha quedado eliminado. ¡Has ganado la partida!`,
              tipo: "system"
            });
          }
        } else {
          // Primer fallo del rival: el turno pasa AHORA a este jugador
          state.turnoActual = redP2P.esAnfitrion ? 1 : 2;
          state.numeroTurno++;
          state.esMiTurno = true;
          if (typeof saveTurnToSession === "function") saveTurnToSession();
          if (typeof actualizarUITurno === "function") actualizarUITurno();
          if (state.soundEnabled && sounds.playTurnStart) sounds.playTurnStart();

          if (typeof vistaChat !== "undefined") {
            vistaChat.agregarBurbuja({
              texto: `🎯 Tu rival intentó adivinar "${guessedName}", ¡pero falló! Pierde el turno. ¡Es tu turno!`,
              tipo: "system"
            });
          }
          showToast(`Tu rival intentó adivinar (${guessedName}) y falló. ¡Es tu turno!`, "info", 4500);
        }
      }
    // Rival terminó su turno: ahora juega este jugador
    } else if (tipoAccion === "PASAR_TURNO") {
      state.turnoActual = datos.nuevoTurno;
      state.numeroTurno = datos.numeroTurno || (state.numeroTurno + 1);
      state.esMiTurno = true;
      if (typeof saveTurnToSession === "function") saveTurnToSession();
      if (typeof actualizarUITurno === "function") actualizarUITurno();
      if (state.soundEnabled && sounds.playTurnStart) sounds.playTurnStart();

      if (datos.porFallo) {
        showToast("❌ ¡Tu rival falló al intentar adivinar! Pierde su turno. ¡Es tu turno!", "info", 4500);
        if (typeof vistaChat !== "undefined") {
          vistaChat.agregarBurbuja({
            texto: "❌ Tu rival falló al intentar adivinar. Ha perdido su turno. ¡Ahora es tu turno!",
            tipo: "system"
          });
        }
      } else {
        showToast("🔔 ¡Es tu turno! Haz tus preguntas y descarta Pokémon.", "success", 4000);
        if (typeof vistaChat !== "undefined") {
          vistaChat.agregarBurbuja({
            texto: `🔔 ¡Tu rival terminó su turno! Es tu turno (#${state.numeroTurno}).`,
            tipo: "system"
          });
        }
      }
    } else if (tipoAccion === "RESPUESTA_ADIVINAR") {
      // El rival respondió a nuestro intento de adivinanza
      if (datos.acierto) {
        state.isGameOver = true;
        let esLimpio = true;
        if (typeof seguridadAntiTrampas !== "undefined" && state.rivalSecretHash) {
          esLimpio = await seguridadAntiTrampas.verificarHashPokemon(
            datos.pokemon.id,
            datos.salt,
            state.roomCode,
            state.rivalSecretHash
          );
        }

        // Enviar nuestro Pokémon al rival para asegurar que el rival sepa cuál habíamos elegido
        if (state.secretPokemon) {
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

        if (esLimpio) {
          if (typeof showGameResultModal === "function") {
            showGameResultModal({
              titulo: "🏆 ¡VICTORIA! ¡ADIVINASTE!",
              subtitulo: `¡Adivinaste correctamente! El Pokémon secreto de tu rival era ${datos.pokemon.name}.`,
              esTrampa: false,
              pokemonRival: datos.pokemon,
              etiquetaPokemon: "Pokémon que eligió tu rival:",
              tipoResultado: "victory"
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
              pokemonRival: datos.pokemon,
              etiquetaPokemon: "Pokémon que eligió tu rival:"
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
        state.fallosAdivinanza = (state.fallosAdivinanza || 0) + 1;
        const esSegundoFallo = Boolean(datos.esSegundoFallo || state.fallosAdivinanza >= 2);

        if (esSegundoFallo) {
          // ¡Segundo fallo! El jugador pierde y el rival gana automáticamente. Se muestra el Pokémon del rival.

          // Enviar también nuestro Pokémon para que el rival pueda ver el nuestro
          if (state.secretPokemon) {
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

          const rivalPoke = datos.rivalPokemon;
          const rivalName = rivalPoke ? rivalPoke.name : "el del rival";

          if (typeof showGameResultModal === "function") {
            showGameResultModal({
              titulo: "💀 ¡DERROTA! AGOTASTE TUS INTENTOS",
              subtitulo: `Has fallado tu segundo intento de adivinanza. Tu rival ha ganado la partida automáticamente. Su Pokémon secreto era ${rivalName}.`,
              esTrampa: false,
              pokemonRival: rivalPoke
            });
          }

          if (typeof vistaChat !== "undefined") {
            vistaChat.agregarBurbuja({
              texto: `💀 Has fallado tus 2 oportunidades de adivinanza y has quedado eliminado. Tu rival gana la partida automáticamente. Su Pokémon era ${rivalName}.`,
              tipo: "system"
            });
          }
        } else {
          // Primer fallo: NO se avisa que le queda una oportunidad más (según la instrucción del usuario)
          showToast("❌ ¡Fallaste! Ese no es el Pokémon secreto de tu rival.", "error", 4000);
          if (typeof sounds !== "undefined" && sounds.playFail) sounds.playFail();
          if (typeof vistaChat !== "undefined") {
            vistaChat.agregarBurbuja({
              texto: "❌ Tu intento de adivinanza fue incorrecto. ¡Has perdido tu turno!",
              tipo: "system"
            });
          }
          if (typeof terminarTurno === "function") {
            terminarTurno({ porFallo: true });
          }
        }
      }
    // Fin de partida: se revelan los Pokémon y se verifica el hash
    } else if (tipoAccion === "REVELAR_FINAL") {
      state.isGameOver = true;
      if (datos.pokemon) {
        state.secretPokemonRival = datos.pokemon;
      }

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
            ? (state.secretPokemon
                ? `El Pokémon que eligió tu rival era ${datos.pokemon.name}. Partida 100% limpia y verificada.`
                : `El Pokémon secreto del rival era ${datos.pokemon.name}.`)
            : `El rival intentó alterar su Pokémon secreto. El hash SHA-256 no coincide.`,
          esTrampa: !esLimpio,
          pokemonRival: datos.pokemon,
          etiquetaPokemon: "Pokémon que eligió tu rival:"
        });
      }
    } else if (tipoAccion === "SOLICITAR_REINICIO") {
      // El rival solicita reiniciar la partida con los mismos Pokémon
      if (state.solicitudReinicioEnviada) {
        if (typeof aceptarReinicioPartida === "function") {
          aceptarReinicioPartida();
        }
      } else {
        if (typeof mostrarModalSolicitudReinicioRecibida === "function") {
          mostrarModalSolicitudReinicioRecibida();
        }
      }
    } else if (tipoAccion === "ACEPTAR_REINICIO") {
      // El rival aceptó nuestra solicitud de reinicio
      if (typeof reiniciarPartidaMismosPokemon === "function") {
        reiniciarPartidaMismosPokemon();
      }
    } else if (tipoAccion === "RECHAZAR_REINICIO") {
      // El rival rechazó la solicitud de revancha
      state.solicitudReinicioEnviada = false;
      if (typeof cerrarModalReinicio === "function") {
        cerrarModalReinicio();
      }
      showToast("❌ Tu rival ha rechazado la solicitud de reinicio.", "warning", 4500);
      if (typeof vistaChat !== "undefined") {
        vistaChat.agregarBurbuja({
          texto: "Tu rival ha rechazado reiniciar la partida.",
          tipo: "system"
        });
      }
    } else if (tipoAccion === "CANCELAR_REINICIO") {
      // El rival canceló la solicitud mientras esperábamos
      state.solicitudReinicioRecibida = false;
      if (typeof cerrarModalReinicio === "function") {
        cerrarModalReinicio();
      }
      showToast("El rival ha cancelado su solicitud de reinicio.", "info", 3000);
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

// Arranca la app: vista inicial, eventos, tema, sonido, pantalla completa y ruta por URL
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
    try {
      if (esAnfitrion) {
        sessionStorage.setItem(`poke_host_${roomCode}`, "true");
      } else {
        sessionStorage.removeItem(`poke_host_${roomCode}`);
      }
    } catch (e) {}
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

    // Indica si el navegador está en pantalla completa
    function isFullscreenActive() {
      return Boolean(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
    }

    // Ajusta iconos y título del botón según la pantalla completa
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
      let eraAnfitrion = false;
      try {
        eraAnfitrion = sessionStorage.getItem(`poke_host_${parsed.code}`) === "true";
      } catch (e) {}
      loadRoom(parsed.code);
      // Conserva rol de anfitrión si recargó la página; si entra por enlace compartido, se une como invitado
      iniciarPartidaP2P(parsed.code, eraAnfitrion);
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
