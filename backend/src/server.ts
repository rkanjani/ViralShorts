import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { auth } from './config/firebase.js';
import { setSocketIO } from './services/soraService.js';
import { setIo } from './websocket/index.js';

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.frontendUrl,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Pass Socket.IO to services that need it
setSocketIO(io);
setIo(io);

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    next(new Error('Authentication required'));
    return;
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    socket.data.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };
    next();
  } catch (error) {
    logger.error({ error }, 'Socket authentication failed');
    next(new Error('Authentication failed'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  const userId = socket.data.user?.uid;
  logger.info({ userId, socketId: socket.id }, 'Client connected');

  // Join user to their personal room
  socket.join(`user:${userId}`);

  // Join project room
  socket.on('join:project', ({ projectId }) => {
    socket.join(`project:${projectId}`);
    logger.debug({ userId, projectId }, 'Joined project room');
  });

  // Leave project room
  socket.on('leave:project', ({ projectId }) => {
    socket.leave(`project:${projectId}`);
    logger.debug({ userId, projectId }, 'Left project room');
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    logger.info({ userId, socketId: socket.id }, 'Client disconnected');
  });
});

// Export io for use in other modules
export { io };

// Start server
httpServer.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
