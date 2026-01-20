const socket = io();

let personajeSeleccionado = '1'; // Personaje por defecto

// --- SISTEMA DE MÚSICA ---
const musicTracks = {
    inicio: 'assets/music/inicio.mp3',
    partida: 'assets/music/en partida.mp3',
    votando: 'assets/music/votando.mp3',
    impostorGana: 'assets/music/impostor gana.mp3',
    impostorPierde: 'assets/music/impostor pierde.mp3'
};

let currentMusic = null;
let audioPlayer = null;
let userInteracted = false;

function playMusic(track) {
    if (!audioPlayer) {
        audioPlayer = document.getElementById('gameMusic');
    }
    
    if (currentMusic === track && !audioPlayer.paused) return; // Ya se está reproduciendo
    
    currentMusic = track;
    audioPlayer.src = musicTracks[track];
    
    // Intentar reproducir
    const playPromise = audioPlayer.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            userInteracted = true;
            console.log('Reproduciendo:', track);
        }).catch(err => {
            console.log('Se necesita interacción del usuario para reproducir música');
        });
    }
}

function stopMusic() {
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        currentMusic = null;
    }
}

// --- TEMA ---
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Cargar tema guardado
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const toggle = document.getElementById('toggleTheme');
    
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        toggle.checked = true;
    }
    
    // Event listener para el toggle
    toggle.addEventListener('change', toggleTheme);
    
    // Seleccionar primer personaje por defecto
    seleccionarPersonaje('1');
    
    // Inicializar el audioPlayer
    audioPlayer = document.getElementById('gameMusic');
    
    // Control de volumen
    const volumeSlider = document.getElementById('volumeSlider');
    const volumePercentage = document.querySelector('.volume-percentage');
    const savedVolume = localStorage.getItem('musicVolume') || 50;
    
    volumeSlider.value = savedVolume;
    audioPlayer.volume = savedVolume / 100;
    volumePercentage.textContent = savedVolume + '%';
    updateVolumeGradient(savedVolume);
    
    volumeSlider.addEventListener('input', (e) => {
        const volume = e.target.value;
        audioPlayer.volume = volume / 100;
        volumePercentage.textContent = volume + '%';
        localStorage.setItem('musicVolume', volume);
        updateVolumeGradient(volume);
    });
    
    // Iniciar música con la primera interacción del usuario
    const startMusic = () => {
        if (!userInteracted) {
            playMusic('inicio');
            // Remover listeners después de la primera interacción
            document.removeEventListener('click', startMusic);
            document.removeEventListener('keydown', startMusic);
        }
    };
    
    document.addEventListener('click', startMusic);
    document.addEventListener('keydown', startMusic);
});

function updateVolumeGradient(value) {
    const slider = document.getElementById('volumeSlider');
    const percentage = value;
    slider.style.background = `linear-gradient(to right, var(--twitch-purple) 0%, var(--twitch-purple) ${percentage}%, var(--border-color) ${percentage}%, var(--border-color) 100%)`;
}

// --- SELECCIÓN DE PERSONAJE ---
function seleccionarPersonaje(iconId) {
    personajeSeleccionado = iconId;
    
    // Remover selección anterior y efectos
    document.querySelectorAll('.personaje').forEach(p => {
        p.classList.remove('selected');
        const img = p.querySelector('.personaje-avatar');
        if (img) img.style.boxShadow = '';
    });
    
    // Agregar selección al nuevo
    const personaje = document.querySelector(`[data-icon="${iconId}"]`);
    if (personaje) {
        personaje.classList.add('selected');
        const color = personaje.getAttribute('data-color');
        const img = personaje.querySelector('.personaje-avatar');
        if (img && color) {
            img.style.boxShadow = `0 0 20px 5px ${color}, 0 0 30px 8px ${color}`;
        }
    }
}

function crearPartida() {
    const nombre = document.getElementById('nombreInput').value;
    if (!nombre) return alert("Ponte un nombre de Streamer");
    
    socket.emit('crearSala', { nombre, avatar: personajeSeleccionado });
}

function unirsePartida() {
    const nombre = document.getElementById('nombreInput').value;
    const codigo = document.getElementById('codigoInput').value.trim().toUpperCase();
    
    if (!nombre) return alert("Ponte un nombre primero");
    if (!codigo) return alert("Escribe el código de la sala de tu amigo");
    
    console.log('Intentando unirse a sala:', codigo);
    socket.emit('unirseASala', { nombre, codigo, avatar: personajeSeleccionado });
}

function iniciarJuego() {
    const codigo = document.getElementById('mostrarCodigo').innerText;
    socket.emit('iniciarJuego', { codigo });
}

// --- ESCUCHAS ---

socket.on('salaCreada', (datos) => {
    entrarALaSala(datos.codigo);
    actualizarListaUI(datos.jugadores);
});

socket.on('unionExitosa', (datos) => {
    entrarALaSala(datos.codigo);
});

socket.on('actualizarListaJugadores', (jugadores) => {
    actualizarListaUI(jugadores);
});

socket.on('errorUnion', (msg) => alert(msg));

// --- EVENTOS DE MÚSICA ---
socket.on('cambiarMusica', (datos) => {
    playMusic(datos.track);
});

// --- EVENTOS DEL JUEGO ---
let miDatosJuego = null;
let turnoActual = null;
let timerInterval = null;
let soyLider = false;

socket.on('juegoIniciado', (datos) => {
    console.log('¡El juego ha comenzado!', datos);
    console.log('Tu palabra:', datos.tuInfo.palabra);
    miDatosJuego = datos.tuInfo;
    
    // Ocultar sala de espera y mostrar pantalla de juego
    document.getElementById('sala-espera').style.display = 'none';
    document.getElementById('pantalla-juego').style.display = 'block';
    
    // Limpiar historial de mensajes
    document.getElementById('listaMensajes').innerHTML = '';
    
    // Mostrar tu personaje y rol
    document.getElementById('tuAvatar').src = `assets/icon (${miDatosJuego.avatar}).png`;
    document.getElementById('tuNombre').textContent = miDatosJuego.nombre;
    
    const rolBadge = document.getElementById('tuRol');
    if (miDatosJuego.esImpostor) {
        rolBadge.innerHTML = '🔪 IMPOSTOR<br><small style="font-size: 0.8rem; font-weight: normal;">Vaya, haz todo lo posible por no ser pillado</small>';
        rolBadge.className = 'rol-badge impostor';
        // Animación roja
        document.body.style.animation = 'flash-red 1s ease-in-out';
    } else {
        const palabra = miDatosJuego.palabra || 'ERROR';
        rolBadge.innerHTML = `✅ CIVIL<br><small style="font-size: 0.8rem; font-weight: normal;">Tu palabra: <strong>${palabra}</strong></small>`;
        rolBadge.className = 'rol-badge civil';
        // Animación verde
        document.body.style.animation = 'flash-green 1s ease-in-out';
    }
    
    // Remover animación después de 1 segundo
    setTimeout(() => {
        document.body.style.animation = '';
    }, 1000);
    
    // Mostrar lista de jugadores
    actualizarListaJugadoresJuego(datos.todosJugadores);
});

socket.on('nuevoTurno', (datos) => {
    console.log('🔄 Nuevo turno recibido:', datos);
    turnoActual = datos;
    
    // Actualizar UI del turno
    document.getElementById('jugadorActual').textContent = datos.nombreJugador;
    document.getElementById('timerLabel').textContent = datos.esMiTurno ? 'Tu turno:' : 'Turno de:';
    
    // Habilitar/deshabilitar textarea
    const textarea = document.getElementById('textoJugador');
    const btnEnviar = document.getElementById('btnEnviarTexto');
    
    if (datos.esMiTurno) {
        textarea.disabled = false;
        textarea.value = '';
        textarea.placeholder = 'Escribe tu mensaje aquí...';
        btnEnviar.style.display = 'block';
        textarea.focus();
    } else {
        textarea.disabled = true;
        textarea.value = '';
        textarea.placeholder = `Esperando a ${datos.nombreJugador}...`;
        btnEnviar.style.display = 'none';
    }
    
    // Iniciar timer
    console.log('⏱️ Iniciando timer de 60 segundos');
    iniciarTimer(60, 'timer');
    
    // Marcar jugador activo
    actualizarJugadorActivo(datos.jugadorId);
});

socket.on('textoRecibido', (datos) => {
    console.log(`${datos.nombre} escribió: ${datos.texto}`);
    
    // Agregar mensaje al historial
    const listaMensajes = document.getElementById('listaMensajes');
    const mensajeDiv = document.createElement('div');
    mensajeDiv.className = 'mensaje-item';
    mensajeDiv.innerHTML = `
        <div class="mensaje-autor">${datos.nombre}</div>
        <div class="mensaje-texto">${datos.texto}</div>
    `;
    listaMensajes.appendChild(mensajeDiv);
    
    // Scroll automático al último mensaje
    const historial = document.getElementById('historialMensajes');
    historial.scrollTop = historial.scrollHeight;
    
    marcarJugadorCompletado(datos.jugadorId);
});

socket.on('faseVotacion', (datos) => {
    console.log('Fase de votación iniciada');
    
    // Ocultar pantalla de juego y mostrar votación
    document.getElementById('pantalla-juego').style.display = 'none';
    document.getElementById('pantalla-votacion').style.display = 'block';
    
    // Mostrar opciones de voto
    mostrarOpcionesVoto(datos.jugadores);
    
    // Iniciar timer de votación
    iniciarTimer(60, 'timerVotacion');
});

socket.on('actualizarVotos', (votos) => {
    actualizarContadorVotos(votos);
});

socket.on('resultadoVotacion', (datos) => {
    mostrarResultadoVotacion(datos);
});

socket.on('errorVoto', (msg) => {
    alert(msg);
    miVoto = null; // Permitir votar de nuevo
    
    // Restaurar UI para permitir votar de nuevo
    document.querySelectorAll('.opcion-voto').forEach(op => {
        op.style.pointerEvents = 'auto';
        op.style.opacity = '1';
        op.classList.remove('votado');
    });
});

socket.on('volverASala', (datos) => {
    // Ocultar todas las pantallas
    document.getElementById('pantalla-juego').style.display = 'none';
    document.getElementById('pantalla-votacion').style.display = 'none';
    
    // Mostrar sala de espera
    document.getElementById('sala-espera').style.display = 'block';
    document.getElementById('mostrarCodigo').innerText = datos.codigo;
    
    // Actualizar lista de jugadores
    actualizarListaUI(datos.jugadores);
    
    // Reproducir música de inicio
    playMusic('inicio');
    
    // Resetear variables
    miVoto = null;
    miDatosJuego = null;
});

// --- UTILIDADES ---

function entrarALaSala(codigo) {
    document.getElementById('menu-inicio').style.display = 'none';
    document.getElementById('sala-espera').style.display = 'block';
    document.getElementById('mostrarCodigo').innerText = codigo;
    playMusic('inicio'); // Mantener música de inicio en sala de espera
}

function actualizarListaUI(jugadores) {
    const lista = document.getElementById('lista-jugadores');
    lista.innerHTML = jugadores.map(j => `
        <p>
            <img src="assets/icon (${j.avatar}).png" style="display: inline-block; width: 30px; height: 30px; border-radius: 8px; vertical-align: middle; margin-right: 8px; object-fit: cover;" alt="Avatar">
            <b>${j.nombre}</b> ${j.esLider ? '<span style="color: var(--twitch-purple)">(Líder)</span>' : ''}
        </p>
    `).join('');

    soyLider = jugadores.find(j => j.id === socket.id && j.esLider) ? true : false;
    document.getElementById('btnIniciar').style.display = soyLider ? 'block' : 'none';
    document.getElementById('esperandoTexto').style.display = soyLider ? 'none' : 'block';
}

// --- FUNCIONES DEL JUEGO ---

function actualizarListaJugadoresJuego(jugadores) {
    const mesa = document.getElementById('mesaJugadores');
    
    mesa.innerHTML = jugadores.map((j) => {
        return `
            <div class="jugador-mesa" data-jugador-id="${j.id}">
                <img src="assets/icon (${j.avatar}).png" alt="${j.nombre}" class="jugador-mesa-avatar">
                <span class="jugador-mesa-nombre">${j.nombre}</span>
            </div>
        `;
    }).join('');
}

function actualizarJugadorActivo(jugadorId) {
    document.querySelectorAll('.jugador-mesa').forEach(card => {
        card.classList.remove('activo');
    });
    const cardActiva = document.querySelector(`.jugador-mesa[data-jugador-id="${jugadorId}"]`);
    if (cardActiva) cardActiva.classList.add('activo');
}

function marcarJugadorCompletado(jugadorId) {
    const card = document.querySelector(`.jugador-mesa[data-jugador-id="${jugadorId}"]`);
    if (card) card.classList.add('completado');
}

function iniciarTimer(segundos, elementId) {
    if (timerInterval) clearInterval(timerInterval);
    
    let tiempoRestante = segundos;
    const timerElement = document.getElementById(elementId);
    
    const actualizarDisplay = () => {
        const minutos = Math.floor(tiempoRestante / 60);
        const segs = tiempoRestante % 60;
        timerElement.textContent = `${minutos}:${segs.toString().padStart(2, '0')}`;
        
        if (tiempoRestante <= 10) {
            timerElement.classList.add('urgente');
        } else {
            timerElement.classList.remove('urgente');
        }
    };
    
    actualizarDisplay();
    
    timerInterval = setInterval(() => {
        tiempoRestante--;
        actualizarDisplay();
        
        if (tiempoRestante <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);
}

function enviarTexto() {
    const texto = document.getElementById('textoJugador').value.trim();
    if (!texto) return alert('Escribe algo primero');
    
    const codigo = document.getElementById('mostrarCodigo').innerText;
    socket.emit('enviarTexto', { codigo, texto });
    
    document.getElementById('textoJugador').disabled = true;
    document.getElementById('btnEnviarTexto').style.display = 'none';
    
    // Detener el timer ya que se envió el mensaje
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function mostrarOpcionesVoto(jugadores) {
    const container = document.getElementById('opcionesVoto');
    container.innerHTML = jugadores.map(j => `
        <div class="opcion-voto" onclick="votar('${j.id}')">
            <img src="assets/icon (${j.avatar}).png" alt="${j.nombre}">
            <p>${j.nombre}</p>
            <p class="votos-count" data-jugador-id="${j.id}">0 votos</p>
        </div>
    `).join('');
}

let miVoto = null;

function votar(jugadorId) {
    // No permitir votarse a sí mismo
    if (jugadorId === socket.id) {
        alert('No puedes votarte a ti mismo');
        return;
    }
    
    // Si ya votó por esta misma persona, no hacer nada
    if (miVoto === jugadorId) return;
    
    // Si ya votó por otra persona, permitir cambiar el voto
    if (miVoto) {
        // Restaurar visualmente el voto anterior
        document.querySelectorAll('.opcion-voto').forEach(op => {
            op.classList.remove('votado');
            op.style.opacity = '1';
        });
    }
    
    miVoto = jugadorId;
    const codigo = document.getElementById('mostrarCodigo').innerText;
    socket.emit('votar', { codigo, votadoId: jugadorId });
    
    // Marcar visualmente el nuevo voto
    document.querySelectorAll('.opcion-voto').forEach(op => {
        op.classList.remove('votado');
        op.style.opacity = '0.5';
    });
    
    const opcionVotada = document.querySelector(`.opcion-voto[onclick="votar('${jugadorId}')"]`);
    if (opcionVotada) {
        opcionVotada.classList.add('votado');
        opcionVotada.style.opacity = '1';
    }
}

function actualizarContadorVotos(votos) {
    Object.keys(votos).forEach(jugadorId => {
        const counter = document.querySelector(`[data-jugador-id="${jugadorId}"]`);
        if (counter) {
            counter.textContent = `${votos[jugadorId]} voto${votos[jugadorId] !== 1 ? 's' : ''}`;
        }
    });
}

function mostrarResultadoVotacion(datos) {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    const resultadosDiv = document.getElementById('resultadosVotacion');
    resultadosDiv.style.display = 'block';
    
    let contenidoHTML = '';
    
    if (datos.empate) {
        contenidoHTML = `
            <h3>¡EMPATE!</h3>
            <p>Nadie fue eliminado. El juego continúa...</p>
        `;
    } else {
        const eliminado = datos.eliminado;
        
        if (datos.impostorEliminado) {
            contenidoHTML = `
                <h3>${eliminado.nombre} fue eliminado</h3>
                <img src="assets/icon (${eliminado.avatar}).png" style="width: 100px; height: 100px; border-radius: 15px; margin: 15px 0;">
                <p style="font-size: 1.2rem; font-weight: bold;">
                    ✅ ¡Era el IMPOSTOR! Los civiles ganan
                </p>
            `;
        } else if (datos.impostorGano) {
            contenidoHTML = `
                <h3>${eliminado.nombre} fue eliminado</h3>
                <img src="assets/icon (${eliminado.avatar}).png" style="width: 100px; height: 100px; border-radius: 15px; margin: 15px 0;">
                <p style="font-size: 1.2rem; font-weight: bold;">
                    🔪 ¡El IMPOSTOR GANÓ! Solo quedan 2 jugadores
                </p>
            `;
        } else {
            contenidoHTML = `
                <h3>${eliminado.nombre} fue eliminado</h3>
                <img src="assets/icon (${eliminado.avatar}).png" style="width: 100px; height: 100px; border-radius: 15px; margin: 15px 0;">
                <p style="font-size: 1.2rem; font-weight: bold;">
                    ❌ Era un CIVIL. El impostor sigue suelto
                </p>
            `;
        }
    }
    
    resultadosDiv.innerHTML = contenidoHTML;
    
    // Mostrar botón de reiniciar solo al líder si el juego terminó
    if (datos.juegoTerminado) {
        const btnReiniciar = document.getElementById('btnReiniciar');
        if (soyLider) {
            btnReiniciar.style.display = 'block';
            resultadosDiv.appendChild(btnReiniciar);
        }
    } else {
        // Volver al juego después de 5 segundos
        setTimeout(() => {
            miVoto = null;
            document.getElementById('pantalla-votacion').style.display = 'none';
            document.getElementById('pantalla-juego').style.display = 'block';
        }, 5000);
    }
}

function reiniciarPartida() {
    const codigo = document.getElementById('mostrarCodigo').innerText;
    socket.emit('reiniciarPartida', { codigo });
}

// --- MODAL DE AYUDA ---
function mostrarAyuda() {
    document.getElementById('modalAyuda').style.display = 'block';
}

function cerrarAyuda(event) {
    const modal = document.getElementById('modalAyuda');
    if (!event || event.target === modal) {
        modal.style.display = 'none';
    }
}

// Cerrar modal con tecla Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cerrarAyuda();
    }
});
