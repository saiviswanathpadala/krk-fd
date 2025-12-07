import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';

interface AuthenticatedSocket extends Socket {
  userId?: number;
  userRole?: string;
}

let io: SocketIOServer;

export const initializeSocket = (server: HTTPServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User ${socket.userId} connected`);
    
    // Join user-specific room
    socket.join(`user:${socket.userId}`);
    
    // Join role-specific room
    if (socket.userRole === 'employee') {
      socket.join(`employee:${socket.userId}`);
    } else if (socket.userRole === 'agent' || socket.userRole === 'Agent') {
      socket.join(`agent:${socket.userId}`);
    }

    // Join conversation rooms
    socket.on('join_conversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('typing', ({ conversationId, isTyping }) => {
      emitTypingIndicator(conversationId, socket.userId!, isTyping);
    });

    socket.on('disconnect', () => {
      console.log(`User ${socket.userId} disconnected`);
    });
  });

  return io;
};

export const getSocketIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

export const emitToEmployee = (employeeId: number, event: string, data: any) => {
  if (io) {
    io.to(`employee:${employeeId}`).emit(event, data);
  }
};

export const emitPendingChangeUpdate = (employeeId: number, type: 'property' | 'banner', delta: { underReviewChange: number }) => {
  emitToEmployee(employeeId, 'pending_change_updated', {
    type,
    delta,
    timestamp: new Date().toISOString()
  });
};

export const emitAssignmentUpdate = (userId: number, type: 'property' | 'agent', delta: { totalAssignedChange: number }) => {
  if (io) {
    io.to(`employee:${userId}`).to(`agent:${userId}`).emit('assignment_updated', {
      type,
      delta,
      timestamp: new Date().toISOString()
    });
  }
};

export const emitProfileUpdated = (userId: number, data: any) => {
  if (io) {
    io.to(`user:${userId}`).emit('profile_updated', {
      data,
      timestamp: new Date().toISOString()
    });
  }
};

export const emitActivityCreated = (userId: number, activity: any) => {
  if (io) {
    io.to(`employee:${userId}`).emit('activity_created', {
      activity,
      timestamp: new Date().toISOString()
    });
  }
};

export const emitPersonMessage = (conversationId: string, recipientId: number, message: any) => {
  if (io) {
    io.to(`conversation:${conversationId}`).to(`user:${recipientId}`).emit('new_message', {
      message,
      timestamp: new Date().toISOString()
    });
  }
};

export const emitMessageStatusUpdate = (conversationId: string, senderId: number, message: any) => {
  if (io) {
    io.to(`conversation:${conversationId}`).to(`user:${senderId}`).emit('message_status_update', {
      messageId: message.id,
      status: message.status,
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
      timestamp: new Date().toISOString()
    });
  }
};

export const emitTypingIndicator = (conversationId: string, userId: number, isTyping: boolean) => {
  if (io) {
    io.to(`conversation:${conversationId}`).emit('typing', {
      conversationId,
      userId,
      isTyping,
      timestamp: new Date().toISOString()
    });
  }
};