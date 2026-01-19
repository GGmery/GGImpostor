const socket = io();

let personajeSeleccionado = 'red'; // Personaje por defecto

// --- TEMA ---
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    
    const toggleBtn = document.getElementById('toggleTheme');
    toggleBtn.textContent = newTheme === 'light' ? '☀️' : '🌙';
    
    localStorage.setItem('theme', newTheme);
}

// Cargar tema guardado
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        document.getElementById('toggleTheme').textContent = '☀️';
    }
    
    // Seleccionar primer personaje por defecto
    seleccionarPersonaje('red');
});

// --- SELECCIÓN DE PERSONAJE ---
function seleccionarPersonaje(color) {
    personajeSeleccionado = color;
    
    // Remover selección anterior
    document.querySelectorAll('.personaje').forEach(p => p.classList.remove('selected'));
    
    // Agregar selección al nuevo
    const personaje = document.querySelector(`[data-color="${color}"]`);
    if (personaje) personaje.classList.add('selected');
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

// --- UTILIDADES ---

function entrarALaSala(codigo) {
    document.getElementById('menu-inicio').style.display = 'none';
    document.getElementById('sala-espera').style.display = 'block';
    document.getElementById('mostrarCodigo').innerText = codigo;
}

function actualizarListaUI(jugadores) {
    const colores = {
        red: '#ff4444', blue: '#4444ff', green: '#44ff44',
        yellow: '#ffff44', purple: '#bb44ff', orange: '#ff8844'
    };
    
    const lista = document.getElementById('lista-jugadores');
    lista.innerHTML = jugadores.map(j => `
        <p>
            <span style="display: inline-block; width: 20px; height: 20px; background-color: ${colores[j.avatar] || '#999'}; border-radius: 50%; vertical-align: middle; margin-right: 8px;"></span>
            <b>${j.nombre}</b> ${j.esLider ? '<span style="color: var(--twitch-purple)">(Líder)</span>' : ''}
        </p>
    `).join('');

    const soyLider = jugadores.find(j => j.id === socket.id && j.esLider);
    document.getElementById('btnIniciar').style.display = soyLider ? 'block' : 'none';
    document.getElementById('esperandoTexto').style.display = soyLider ? 'none' : 'block';
}