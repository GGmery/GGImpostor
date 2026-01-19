const socket = io();

function crearPartida() {
    const nombre = document.getElementById('nombreInput').value;
    if (!nombre) return alert("Ponte un nombre de Streamer");
    
    // Al crear, el servidor generará el código por nosotros
    socket.emit('crearSala', { nombre, avatar: 'avatar_default.png' });
}

function unirsePartida() {
    const nombre = document.getElementById('nombreInput').value;
    const codigo = document.getElementById('codigoInput').value.trim().toUpperCase();
    
    if (!nombre) return alert("Ponte un nombre primero");
    if (!codigo) return alert("Escribe el código de la sala de tu amigo");
    
    socket.emit('unirseASala', { nombre, codigo, avatar: 'avatar_default.png' });
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
    const lista = document.getElementById('lista-jugadores');
    lista.innerHTML = jugadores.map(j => `
        <p>🎮 <b>${j.nombre}</b> ${j.esLider ? '<span style="color: #9147ff">(Líder)</span>' : ''}</p>
    `).join('');

    const soyLider = jugadores.find(j => j.id === socket.id && j.esLider);
    document.getElementById('btnIniciar').style.display = soyLider ? 'block' : 'none';
    document.getElementById('esperandoTexto').style.display = soyLider ? 'none' : 'block';
}