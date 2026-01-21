const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.static('public'));

// Cargar palabras
try {
    const palabrasPath = path.join(__dirname, 'palabras.json');
    console.log('Intentando cargar palabras desde:', palabrasPath);
    console.log('¿Archivo existe?', fs.existsSync(palabrasPath));
    
    const palabrasData = JSON.parse(fs.readFileSync(palabrasPath, 'utf8'));
    console.log('Datos del archivo:', palabrasData);
    
    var palabras = palabrasData.palabras;
    
    if (!palabras || !Array.isArray(palabras)) {
        throw new Error('El formato de palabras.json es incorrecto');
    }
    
    console.log(`✅ Palabras cargadas: ${palabras.length} palabras disponibles`);
} catch (error) {
    console.error('❌ Error al cargar palabras:', error.message);
    console.error('Stack:', error.stack);
    // Usar palabras por defecto como fallback
    var palabras = ['Streamer', 'Chat', 'Twitch', 'YouTube', 'Video', 'Gaming'];
    console.log('⚠️ Usando palabras por defecto');
}

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
                    avatar: j.avatar,
                    eliminado: j.eliminado || false
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
        
        // No permitir que jugadores eliminados escriban
        if (jugador.eliminado) {
            socket.emit('errorTexto', 'Has sido eliminado y no puedes participar');
            return;
        }
        
        console.log('Texto recibido de:', socket.id, 'Turno actual antes:', salas[codigo].turnoActual);
        
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
            console.log('Turno actual después:', salas[codigo].turnoActual, 'Total turnos:', salas[codigo].ordenTurnos.length);
            
            if (salas[codigo].turnoActual >= salas[codigo].ordenTurnos.length) {
                // Todos jugaron, iniciar votación de decisión
                console.log('Todos jugaron, iniciando votación de decisión');
                iniciarVotacionDecision(codigo);
            } else {
                // Siguiente turno
                console.log('Siguiente turno');
                iniciarSiguienteTurno(codigo);
            }
        }, 1000);
    });

    // VOTAR DECISIÓN (Otra ronda o votar impostor)
    socket.on('votarDecision', (datos) => {
        const codigo = datos.codigo;
        if (!salas[codigo]) return;
        
        const jugador = salas[codigo].jugadores[socket.id];
        
        // No permitir que jugadores eliminados voten
        if (jugador.eliminado) {
            socket.emit('errorVoto', 'Has sido eliminado y no puedes votar');
            return;
        }
        
        if (!salas[codigo].votosDecision) salas[codigo].votosDecision = { 'otra-ronda': 0, 'votar-impostor': 0 };
        if (!salas[codigo].votantesDecision) salas[codigo].votantesDecision = new Set();
        if (!salas[codigo].votoAnteriorDecision) salas[codigo].votoAnteriorDecision = {};
        
        // Si ya había votado, restar el voto anterior
        if (salas[codigo].votoAnteriorDecision[socket.id]) {
            const votoAnterior = salas[codigo].votoAnteriorDecision[socket.id];
            salas[codigo].votosDecision[votoAnterior]--;
        }
        
        // Registrar nuevo voto
        salas[codigo].votosDecision[datos.decision]++;
        salas[codigo].votantesDecision.add(socket.id);
        salas[codigo].votoAnteriorDecision[socket.id] = datos.decision;
        
        // Si todos los jugadores VIVOS han votado, procesar resultado
        const jugadoresVivos = Object.values(salas[codigo].jugadores).filter(j => !j.eliminado);
        if (salas[codigo].votantesDecision.size === jugadoresVivos.length) {
            if (salas[codigo].timeoutDecision) {
                clearTimeout(salas[codigo].timeoutDecision);
            }
            setTimeout(() => procesarResultadoDecision(codigo), 2000);
        }
    });

    // VOTAR
    socket.on('votar', (datos) => {
        const codigo = datos.codigo;
        if (!salas[codigo]) return;
        
        const jugador = salas[codigo].jugadores[socket.id];
        
        // No permitir que jugadores eliminados voten
        if (jugador.eliminado) {
            socket.emit('errorVoto', 'Has sido eliminado y no puedes votar');
            return;
        }
        
        // No permitir votarse a sí mismo
        if (datos.votadoId === socket.id) {
            socket.emit('errorVoto', 'No puedes votarte a ti mismo');
            return;
        }
        
        if (!salas[codigo].votos) salas[codigo].votos = {};
        if (!salas[codigo].votantes) salas[codigo].votantes = new Set();
        if (!salas[codigo].votoAnterior) salas[codigo].votoAnterior = {};
        
        // Si ya había votado, restar el voto anterior
        if (salas[codigo].votoAnterior[socket.id]) {
            const votoAnteriorId = salas[codigo].votoAnterior[socket.id];
            if (salas[codigo].votos[votoAnteriorId]) {
                salas[codigo].votos[votoAnteriorId]--;
                if (salas[codigo].votos[votoAnteriorId] === 0) {
                    delete salas[codigo].votos[votoAnteriorId];
                }
            }
        }
        
        // Registrar nuevo voto
        if (!salas[codigo].votos[datos.votadoId]) {
            salas[codigo].votos[datos.votadoId] = 0;
        }
        salas[codigo].votos[datos.votadoId]++;
        salas[codigo].votantes.add(socket.id);
        salas[codigo].votoAnterior[socket.id] = datos.votadoId;
        
        // Si todos los jugadores VIVOS han votado, procesar resultado
        const jugadoresVivos = Object.values(salas[codigo].jugadores).filter(j => !j.eliminado);
        if (salas[codigo].votantes.size === jugadoresVivos.length) {
            if (salas[codigo].timeoutVotacion) {
                clearTimeout(salas[codigo].timeoutVotacion);
            }
            setTimeout(() => procesarResultadoVotacion(codigo), 2000);
        }
    });

    // REINICIAR PARTIDA
    socket.on('reiniciarPartida', (datos) => {
        const codigo = datos.codigo;
        if (!salas[codigo]) return;
        
        const jugador = salas[codigo].jugadores[socket.id];
        if (!jugador || !jugador.esLider) return;
        
        // Resetear estado de la sala
        salas[codigo].estado = 'LOBBY';
        
        // Resetear estado de todos los jugadores (quitar eliminados, impostores, etc)
        Object.keys(salas[codigo].jugadores).forEach(id => {
            delete salas[codigo].jugadores[id].eliminado;
            delete salas[codigo].jugadores[id].esImpostor;
        });
        
        // Limpiar datos de la partida
        delete salas[codigo].ordenTurnos;
        delete salas[codigo].turnoActual;
        delete salas[codigo].votos;
        delete salas[codigo].votantes;
        delete salas[codigo].votoAnterior;
        
        // Enviar a todos de vuelta a la sala de espera
        io.to(codigo).emit('volverASala', {
            codigo,
            jugadores: Object.values(salas[codigo].jugadores)
        });
        
        io.to(codigo).emit('cambiarMusica', { track: 'inicio' });
    });

    socket.on('disconnect', () => {
        console.log('Usuario desconectado');
    });
});

// --- FUNCIONES AUXILIARES ---

function iniciarSiguienteTurno(codigo) {
    if (!salas[codigo]) {
        console.log('ERROR: Sala no existe:', codigo);
        return;
    }
    
    const sala = salas[codigo];
    const jugadorId = sala.ordenTurnos[sala.turnoActual];
    const jugador = sala.jugadores[jugadorId];
    
    console.log('Iniciando turno:', sala.turnoActual, 'JugadorID:', jugadorId, 'Existe jugador:', !!jugador);
    
    if (!jugador) {
        console.log('ERROR: Jugador no encontrado. OrdenTurnos:', sala.ordenTurnos, 'Jugadores:', Object.keys(sala.jugadores));
        return;
    }
    
    // Notificar a todos de quién es el turno
    Object.keys(sala.jugadores).forEach(id => {
        io.to(id).emit('nuevoTurno', {
            jugadorId,
            nombreJugador: jugador.nombre,
            esMiTurno: id === jugadorId
        });
    });
    
    // Después de 60 segundos, pasar al siguiente turno o iniciar votación de decisión
    sala.timeoutTurno = setTimeout(() => {
        sala.turnoActual++;
        
        if (sala.turnoActual >= sala.ordenTurnos.length) {
            // Todos jugaron, iniciar votación de decisión
            iniciarVotacionDecision(codigo);
        } else {
            // Siguiente turno
            iniciarSiguienteTurno(codigo);
        }
    }, 60000); // 60 segundos
}

function iniciarVotacionDecision(codigo) {
    if (!salas[codigo]) return;
    
    const sala = salas[codigo];
    sala.estado = 'VOTANDO_DECISION';
    sala.votosDecision = { 'otra-ronda': 0, 'votar-impostor': 0 };
    sala.votantesDecision = new Set();
    sala.votoAnteriorDecision = {};
    
    io.to(codigo).emit('faseDecision');
    
    // Después de 30 segundos, contar votos
    sala.timeoutDecision = setTimeout(() => {
        procesarResultadoDecision(codigo);
    }, 30000); // 30 segundos
}

function procesarResultadoDecision(codigo) {
    if (!salas[codigo]) return;
    
    const sala = salas[codigo];
    const votosOtraRonda = sala.votosDecision['otra-ronda'] || 0;
    const votosVotarImpostor = sala.votosDecision['votar-impostor'] || 0;
    
    let decision;
    if (votosOtraRonda > votosVotarImpostor) {
        decision = 'otra-ronda';
    } else if (votosVotarImpostor > votosOtraRonda) {
        decision = 'votar-impostor';
    } else {
        // En caso de empate, por defecto otra ronda
        decision = 'otra-ronda';
    }
    
    io.to(codigo).emit('resultadoDecision', { decision, votosOtraRonda, votosVotarImpostor });
    
    setTimeout(() => {
        if (decision === 'otra-ronda') {
            // Reiniciar turnos para otra ronda
            sala.turnoActual = 0;
            sala.estado = 'JUGANDO';
            delete sala.votosDecision;
            delete sala.votantesDecision;
            delete sala.votoAnteriorDecision;
            
            io.to(codigo).emit('cambiarMusica', { track: 'partida' });
            iniciarSiguienteTurno(codigo);
        } else {
            // Ir a votación del impostor
            delete sala.votosDecision;
            delete sala.votantesDecision;
            delete sala.votoAnteriorDecision;
            
            iniciarVotacion(codigo);
        }
    }, 4000); // 4 segundos para ver el resultado
}

function iniciarVotacion(codigo) {
    if (!salas[codigo]) return;
    
    const sala = salas[codigo];
    sala.estado = 'VOTANDO';
    sala.votos = {};
    sala.votantes = new Set();
    
    // Solo incluir jugadores vivos en las opciones de votación
    const jugadoresVivos = Object.values(sala.jugadores).filter(j => !j.eliminado).map(j => ({
        id: j.id,
        nombre: j.nombre,
        avatar: j.avatar,
        eliminado: false
    }));
    
    // También enviar todos los jugadores (incluyendo eliminados) para mostrarlos en la UI
    const todosJugadores = Object.values(sala.jugadores).map(j => ({
        id: j.id,
        nombre: j.nombre,
        avatar: j.avatar,
        eliminado: j.eliminado || false
    }));
    
    io.to(codigo).emit('faseVotacion', { 
        jugadores: jugadoresVivos,  // Solo vivos para votar
        todosJugadores: todosJugadores  // Todos para mostrar
    });
    io.to(codigo).emit('cambiarMusica', { track: 'votando' });
    
    // Después de 60 segundos, contar votos
    sala.timeoutVotacion = setTimeout(() => {
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
            // Marcar jugador como eliminado (no borrarlo para que siga viendo)
            sala.jugadores[eliminadoId].eliminado = true;
            sala.ordenTurnos = sala.ordenTurnos.filter(id => id !== eliminadoId);
            
            // Contar jugadores vivos
            const jugadoresVivos = Object.values(sala.jugadores).filter(j => !j.eliminado);
            
            // Verificar si el impostor ganó (solo quedan 2 jugadores vivos o menos)
            if (jugadoresVivos.length <= 2) {
                // El impostor ganó
                io.to(codigo).emit('cambiarMusica', { track: 'impostorGana' });
                
                // Re-emitir el resultado indicando que el juego terminó
                io.to(codigo).emit('resultadoVotacion', {
                    empate: false,
                    eliminado: {
                        id: eliminado.id,
                        nombre: eliminado.nombre,
                        avatar: eliminado.avatar
                    },
                    impostorEliminado: false,
                    juegoTerminado: true,
                    impostorGano: true,
                    mensajeExtra: '🔪 ¡El impostor ha ganado! Solo quedan 2 jugadores.'
                });
                
                sala.estado = 'FINALIZADO';
            } else {
                // Continuar jugando - mensaje diferente según cantidad de jugadores
                io.to(codigo).emit('cambiarMusica', { track: 'partida' });
                
                // Mensaje gracioso cuando echan a un inocente
                const mensajeInocente = '¿Pero y estas formas de juzgar? ¡Habéis echado a un inocente! Venga, otra ronda más, a ver si estáis más espabilados 🤦';
                
                // Re-emitir con mensaje adicional
                setTimeout(() => {
                    io.to(codigo).emit('mensajeInocente', { mensaje: mensajeInocente });
                }, 2000);
                
                setTimeout(() => {
                    sala.turnoActual = 0;
                    iniciarSiguienteTurno(codigo);
                }, 6000);
            }
        }
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor listo en puerto ${PORT}`);
});