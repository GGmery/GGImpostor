const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');

app.use(express.static('public'));

// Cargar palabras
const palabras = JSON.parse(fs.readFileSync('./palabras.json', 'utf8'));

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
        
        // Asignar impostor aleatoriamente
        const jugadores = Object.values(salas[codigo].jugadores);
        const impostorIndex = Math.floor(Math.random() * jugadores.length);
        
        // Seleccionar palabra aleatoria
        const palabraSecreta = palabras[Math.floor(Math.random() * palabras.length)];
        
        // Desordenar el orden de turnos
        const ordenTurnos = [...jugadores].sort(() => Math.random() - 0.5);
        salas[codigo].ordenTurnos = ordenTurnos.map(j => j.id);
        salas[codigo].turnoActual = 0;
        salas[codigo].votos = {};
        
        // Enviar a cada jugador su información personal
        jugadores.forEach((jugador, index) => {
            const esImpostor = index === impostorIndex;
            jugador.esImpostor = esImpostor;
            
            io.to(jugador.id).emit('juegoIniciado', {
                tuInfo: {
                    nombre: jugador.nombre,
                    avatar: jugador.avatar,
                    esImpostor,
                    palabra: esImpostor ? null : palabraSecreta
                },
                todosJugadores: jugadores.map(j => ({
                    id: j.id,
                    nombre: j.nombre,
                    avatar: j.avatar
                }))
            });
        });
        
        io.to(codigo).emit('cambiarMusica', { track: 'partida' });
        
        // Iniciar primer turno
        setTimeout(() => iniciarSiguienteTurno(codigo), 2000);
    });

    // ENVIAR TEXTO
    socket.on('enviarTexto', (datos) => {
        const codigo = datos.codigo;
        if (!salas[codigo]) return;
        
        const jugador = salas[codigo].jugadores[socket.id];
        io.to(codigo).emit('textoRecibido', {
            jugadorId: socket.id,
            nombre: jugador.nombre,
            texto: datos.texto
        });
        
        // Cancelar el timeout del turno actual y pasar inmediatamente al siguiente
        if (salas[codigo].timeoutTurno) {
            clearTimeout(salas[codigo].timeoutTurno);
        }
        
        // Esperar un segundo para que se vea el mensaje y pasar al siguiente turno
        setTimeout(() => {
            salas[codigo].turnoActual++;
            
            if (salas[codigo].turnoActual >= salas[codigo].ordenTurnos.length) {
                // Todos jugaron, iniciar votación
                iniciarVotacion(codigo);
            } else {
                // Siguiente turno
                iniciarSiguienteTurno(codigo);
            }
        }, 1000);
    });

    // VOTAR
    socket.on('votar', (datos) => {
        const codigo = datos.codigo;
        if (!salas[codigo]) return;
        
        if (!salas[codigo].votos) salas[codigo].votos = {};
        
        // Registrar voto
        if (!salas[codigo].votos[datos.votadoId]) {
            salas[codigo].votos[datos.votadoId] = 0;
        }
        salas[codigo].votos[datos.votadoId]++;
        
        // Actualizar contador de votos para todos
        io.to(codigo).emit('actualizarVotos', salas[codigo].votos);
    });

    socket.on('disconnect', () => {
        console.log('Usuario desconectado');
    });
});

// --- FUNCIONES AUXILIARES ---

function iniciarSiguienteTurno(codigo) {
    if (!salas[codigo]) return;
    
    const sala = salas[codigo];
    const jugadorId = sala.ordenTurnos[sala.turnoActual];
    const jugador = sala.jugadores[jugadorId];
    
    if (!jugador) return;
    
    // Notificar a todos de quién es el turno
    Object.keys(sala.jugadores).forEach(id => {
        io.to(id).emit('nuevoTurno', {
            jugadorId,
            nombreJugador: jugador.nombre,
            esMiTurno: id === jugadorId
        });
    });
    
    // Después de 60 segundos, pasar al siguiente turno o iniciar votación
    sala.timeoutTurno = setTimeout(() => {
        sala.turnoActual++;
        
        if (sala.turnoActual >= sala.ordenTurnos.length) {
            // Todos jugaron, iniciar votación
            iniciarVotacion(codigo);
        } else {
            // Siguiente turno
            iniciarSiguienteTurno(codigo);
        }
    }, 60000); // 60 segundos
}

function iniciarVotacion(codigo) {
    if (!salas[codigo]) return;
    
    const sala = salas[codigo];
    sala.estado = 'VOTANDO';
    sala.votos = {};
    
    const jugadores = Object.values(sala.jugadores).map(j => ({
        id: j.id,
        nombre: j.nombre,
        avatar: j.avatar
    }));
    
    io.to(codigo).emit('faseVotacion', { jugadores });
    io.to(codigo).emit('cambiarMusica', { track: 'votando' });
    
    // Después de 60 segundos, contar votos
    setTimeout(() => {
        procesarResultadoVotacion(codigo);
    }, 60000);
}

function procesarResultadoVotacion(codigo) {
    if (!salas[codigo]) return;
    
    const sala = salas[codigo];
    const votos = sala.votos || {};
    
    // Encontrar al más votado
    let maxVotos = 0;
    let eliminadoId = null;
    let empate = false;
    
    Object.keys(votos).forEach(jugadorId => {
        if (votos[jugadorId] > maxVotos) {
            maxVotos = votos[jugadorId];
            eliminadoId = jugadorId;
            empate = false;
        } else if (votos[jugadorId] === maxVotos && maxVotos > 0) {
            empate = true;
        }
    });
    
    if (empate || !eliminadoId) {
        // Empate, nadie es eliminado
        io.to(codigo).emit('resultadoVotacion', {
            empate: true,
            juegoTerminado: false
        });
        
        io.to(codigo).emit('cambiarMusica', { track: 'partida' });
        
        // Reiniciar turnos
        setTimeout(() => {
            sala.turnoActual = 0;
            iniciarSiguienteTurno(codigo);
        }, 6000);
    } else {
        // Alguien fue eliminado
        const eliminado = sala.jugadores[eliminadoId];
        const impostorEliminado = eliminado.esImpostor;
        
        io.to(codigo).emit('resultadoVotacion', {
            empate: false,
            eliminado: {
                id: eliminado.id,
                nombre: eliminado.nombre,
                avatar: eliminado.avatar
            },
            impostorEliminado,
            juegoTerminado: impostorEliminado
        });
        
        if (impostorEliminado) {
            io.to(codigo).emit('cambiarMusica', { track: 'impostorPierde' });
            sala.estado = 'FINALIZADO';
        } else {
            io.to(codigo).emit('cambiarMusica', { track: 'partida' });
            
            // Eliminar jugador y continuar
            delete sala.jugadores[eliminadoId];
            sala.ordenTurnos = sala.ordenTurnos.filter(id => id !== eliminadoId);
            
            setTimeout(() => {
                sala.turnoActual = 0;
                iniciarSiguienteTurno(codigo);
            }, 6000);
        }
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor listo en puerto ${PORT}`);
});