import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export function setIo(socketIo: SocketIOServer) {
  io = socketIo;
}

export function getIo(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call setIo first.');
  }
  return io;
}

export default { setIo, getIo };
