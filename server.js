const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// AQUÍ SE GUARDAN LAS SALAS
let salas = {};

io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    // ESCUCHA PARA CREAR SALA
    socket.on('crearSala', (datos) => {
        const codigo = Math.random().toString(36).substring(2, 6).toUpperCase();
        socket.join(codigo);
        
        salas[codigo] = {
            estado: 'LOBBY',
            jugadores: {}
        };

        salas[codigo].jugadores[socket.id] = {
            id: socket.id,
            nombre: datos.nombre,
            avatar: datos.avatar,
            esLider: true
        };

        console.log(`Sala creada: ${codigo} por ${datos.nombre}`);
        socket.emit('salaCreada', { codigo, jugadores: Object.values(salas[codigo].jugadores) });
    });

    // ESCUCHA PARA UNIRSE
    socket.on('unirseASala', (datos) => {
        const codigo = datos.codigo;
        if (!salas[codigo]) {
            socket.emit('errorUnion', 'La sala no existe');
            return;
        }
        
        const cantidadJugadores = Object.keys(salas[codigo].jugadores).length;
        if (cantidadJugadores >= 8) {
            socket.emit('errorUnion', 'La sala está llena (máximo 8 jugadores)');
            return;
        }
        
        socket.join(codigo);
        salas[codigo].jugadores[socket.id] = {
            id: socket.id,
            nombre: datos.nombre,
            avatar: datos.avatar,
            esLider: false
        };
        io.to(codigo).emit('actualizarListaJugadores', Object.values(salas[codigo].jugadores));
        socket.emit('unionExitosa', { codigo });
    });

    socket.on('disconnect', () => {
        console.log('Usuario desconectado');
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor listo en puerto ${PORT}`);
});