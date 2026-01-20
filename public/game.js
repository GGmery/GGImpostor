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
const audioPlayer = document.getElementById('gameMusic');

function playMusic(track) {
    if (currentMusic === track && !audioPlayer.paused) return; // Ya se está reproduciendo
    
    currentMusic = track;
    audioPlayer.src = musicTracks[track];
    audioPlayer.play().catch(err => console.log('Error reproduciendo música:', err));
}

function stopMusic() {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    currentMusic = null;
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
    
    // Iniciar música de inicio
    playMusic('inicio');
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

socket.on('juegoIniciado', () => {
    console.log('¡El juego ha comenzado!');
    // Aquí puedes añadir lógica adicional cuando inicie el juego
});

socket.on('faseVotacion', () => {
    console.log('Fase de votación iniciada');
    // Aquí puedes añadir lógica para mostrar la interfaz de votación
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
            <img src="assets/icon (${j.avatar}).png" style="display: inline-block; width: 30px; height: 30px; border-radius: 50%; vertical-align: middle; margin-right: 8px; object-fit: cover;" alt="Avatar">
            <b>${j.nombre}</b> ${j.esLider ? '<span style="color: var(--twitch-purple)">(Líder)</span>' : ''}
        </p>
    `).join('');

    const soyLider = jugadores.find(j => j.id === socket.id && j.esLider);
    document.getElementById('btnIniciar').style.display = soyLider ? 'block' : 'none';
    document.getElementById('esperandoTexto').style.display = soyLider ? 'none' : 'block';
}