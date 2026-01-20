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
        console.log(`Intento de unirse a sala ${codigo}`);
        console.log('Salas disponibles:', Object.keys(salas));
        
        if (!salas[codigo]) {
            console.log(`Sala ${codigo} no encontrada`);
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
        console.log(`${datos.nombre} se unió a la sala ${codigo}`);
        io.to(codigo).emit('actualizarListaJugadores', Object.values(salas[codigo].jugadores));
        socket.emit('unionExitosa', { codigo });
    });

    // INICIAR JUEGO
    socket.on('iniciarJuego', (datos) => {
        const codigo = datos.codigo;
        if (!salas[codigo]) return;
        
        salas[codigo].estado = 'JUGANDO';
        io.to(codigo).emit('juegoIniciado');
        io.to(codigo).emit('cambiarMusica', { track: 'partida' });
    });

    // FASE DE VOTACIÓN
    socket.on('iniciarVotacion', (datos) => {
        const codigo = datos.codigo;
        if (!salas[codigo]) return;
        
        salas[codigo].estado = 'VOTANDO';
        io.to(codigo).emit('faseVotacion');
        io.to(codigo).emit('cambiarMusica', { track: 'votando' });
    });

    // RESULTADO DE VOTACIÓN
    socket.on('resultadoVotacion', (datos) => {
        const codigo = datos.codigo;
        if (!salas[codigo]) return;
        
        if (datos.impostorEliminado) {
            // Si eliminaron al impostor, inocentes ganan
            salas[codigo].estado = 'FINALIZADO';
            io.to(codigo).emit('cambiarMusica', { track: 'impostorPierde' });
        } else {
            // Continuar jugando
            salas[codigo].estado = 'JUGANDO';
            io.to(codigo).emit('cambiarMusica', { track: 'partida' });
        }
    });

    // IMPOSTOR GANA
    socket.on('impostorGana', (datos) => {
        const codigo = datos.codigo;
        if (!salas[codigo]) return;
        
        salas[codigo].estado = 'FINALIZADO';
        io.to(codigo).emit('cambiarMusica', { track: 'impostorGana' });
    });

    // IMPOSTOR PIERDE
    socket.on('impostorPierde', (datos) => {
        const codigo = datos.codigo;
        if (!salas[codigo]) return;
        
        salas[codigo].estado = 'FINALIZADO';
        io.to(codigo).emit('cambiarMusica', { track: 'impostorPierde' });
    });

    socket.on('disconnect', () => {
        console.log('Usuario desconectado');
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor listo en puerto ${PORT}`);
});