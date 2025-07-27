import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import axios from 'axios';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3001;

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

app.use(express.json());

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.CONNECTION_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected for chat service');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Chat and Message models (simplified for chat service)
const chatSchema = new mongoose.Schema({
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    maxlength: 2000
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  },
  attachments: [{
    url: String,
    type: String,
    name: String
  }],
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  sentAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

const Chat = mongoose.model('Chat', chatSchema);
const Message = mongoose.model('Message', messageSchema);

// JWT verification middleware
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.TOKEN_KEY);
  } catch (error) {
    return null;
  }
};

// Socket.IO connection handling
const userSocketMap = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 New socket connection: ${socket.id}`);

  // Authenticate socket connection
  socket.on('authenticate', async (data) => {
    try {
      const { token } = data;
      if (!token) {
        socket.emit('error', { message: 'Token required' });
        return;
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        socket.emit('error', { message: 'Invalid token' });
        return;
      }

      const userId = decoded.userId || decoded._id;
      socket.userId = userId;
      userSocketMap.set(userId, socket.id);

      console.log(`✅ User ${userId} authenticated with socket ${socket.id}`);
      socket.emit('authenticated', { userId });

      // Join user's personal room
      socket.join(`user:${userId}`);
    } catch (error) {
      console.error('❌ Socket authentication error:', error);
      socket.emit('error', { message: 'Authentication failed' });
    }
  });

  // Join chat room
  socket.on('join_chat', async (data) => {
    try {
      const { chatId, token } = data;
      
      if (!token) {
        socket.emit('error', { message: 'Token required' });
        return;
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        socket.emit('error', { message: 'Invalid token' });
        return;
      }

      const userId = decoded.userId || decoded._id;

      // Verify user belongs to this chat
      const chat = await Chat.findOne({
        _id: chatId,
        members: userId,
        isDeleted: { $ne: true }
      });

      if (!chat) {
        socket.emit('error', { message: 'Unauthorized to join this chat' });
        return;
      }

      // Join the chat room
      socket.join(`chat:${chatId}`);
      console.log(`👥 User ${userId} joined chat ${chatId}`);

      // Mark messages as read when joining chat
      await Message.updateMany(
        {
          chat: chatId,
          sender: { $ne: userId },
          isRead: false
        },
        { isRead: true, readAt: new Date() }
      );

      // Notify about read status
      io.to(`chat:${chatId}`).emit('messages_read', {
        chatId,
        readBy: userId
      });
    } catch (error) {
      console.error('❌ Error joining chat:', error);
      socket.emit('error', { message: 'Failed to join chat' });
    }
  });

  // Handle new message
  socket.on('send_message', async (data) => {
    try {
      const { chatId, content, messageType = 'text', attachments = [], token } = data;

      if (!token) {
        socket.emit('error', { message: 'Token required' });
        return;
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        socket.emit('error', { message: 'Invalid token' });
        return;
      }

      const senderId = decoded.userId || decoded._id;

      if (!chatId || (!content && attachments.length === 0)) {
        socket.emit('error', { message: 'Invalid message data' });
        return;
      }

      // Verify user belongs to this chat
      const chat = await Chat.findOne({
        _id: chatId,
        members: senderId,
        isDeleted: { $ne: true }
      });

      if (!chat) {
        socket.emit('error', { message: 'Unauthorized to send message to this chat' });
        return;
      }

      // Create new message
      const newMessage = await Message.create({
        chat: chatId,
        sender: senderId,
        content: content || '',
        messageType,
        attachments,
        sentAt: new Date()
      });

      // Update chat's last message
      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: newMessage._id,
        lastActivity: new Date()
      });

      // Populate sender info
      const populatedMessage = await Message.findById(newMessage._id)
        .populate('sender', 'displayName profileImage photoURL isVerified role')
        .lean();

      // Format message for client
      const formattedMessage = {
        _id: populatedMessage._id,
        content: populatedMessage.content,
        messageType: populatedMessage.messageType,
        isFromMe: true,
        sender: populatedMessage.sender,
        attachments: populatedMessage.attachments,
        isRead: populatedMessage.isRead,
        readAt: populatedMessage.readAt,
        sentAt: populatedMessage.sentAt,
        createdAt: populatedMessage.createdAt
      };

      // Emit to the chat room
      io.to(`chat:${chatId}`).emit('new_message', formattedMessage);

      // Send push notification to other chat members
      const otherMembers = chat.members.filter(memberId => 
        memberId.toString() !== senderId.toString()
      );

      for (const memberId of otherMembers) {
        const memberSocketId = userSocketMap.get(memberId.toString());
        if (!memberSocketId || !io.sockets.adapter.rooms.get(`chat:${chatId}`)?.has(memberSocketId)) {
          // Send push notification via main API
          try {
            await axios.post(`${process.env.MAIN_API_URL}/api/notifications/send-chat-notification`, {
              userId: memberId,
              chatId,
              senderId,
              message: content || 'رسالة جديدة'
            }, {
              headers: {
                'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`,
                'Content-Type': 'application/json'
              }
            });
          } catch (notificationError) {
            console.warn('Failed to send push notification:', notificationError.message);
          }
        }
      }

      console.log(`💬 Message sent in chat ${chatId} by user ${senderId}`);
    } catch (error) {
      console.error('❌ Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle typing indicators
  socket.on('typing', (data) => {
    const { chatId } = data;
    socket.to(`chat:${chatId}`).emit('user_typing', {
      chatId,
      userId: socket.userId
    });
  });

  socket.on('stop_typing', (data) => {
    const { chatId } = data;
    socket.to(`chat:${chatId}`).emit('user_stopped_typing', {
      chatId,
      userId: socket.userId
    });
  });

  // Handle read receipts
  socket.on('mark_read', async (data) => {
    try {
      const { chatId } = data;
      const userId = socket.userId;

      if (!userId) {
        socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      // Update messages as read
      await Message.updateMany(
        {
          chat: chatId,
          sender: { $ne: userId },
          isRead: false
        },
        { isRead: true, readAt: new Date() }
      );

      // Broadcast read status to the chat
      io.to(`chat:${chatId}`).emit('messages_read', {
        chatId,
        readBy: userId
      });

      console.log(`👁️ Messages marked as read in chat ${chatId} by user ${userId}`);
    } catch (error) {
      console.error('❌ Error marking messages as read:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (socket.userId) {
      userSocketMap.delete(socket.userId);
      console.log(`🔌 User ${socket.userId} disconnected`);
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'chat-service',
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount,
    activeUsers: userSocketMap.size
  });
});

// Chat API endpoints
app.get('/api/chat/status', (req, res) => {
  res.json({
    success: true,
    message: 'Chat service is running',
    data: {
      connections: io.engine.clientsCount,
      activeUsers: userSocketMap.size,
      uptime: process.uptime()
    }
  });
});

// Start server
const startServer = async () => {
  try {
    await connectDB();
    
    server.listen(port, () => {
      console.log(`🚀 Chat service running on port ${port}`);
      console.log(`📊 Health check: http://localhost:${port}/health`);
      console.log(`🔌 Socket.IO ready for connections`);
    });
  } catch (error) {
    console.error('❌ Failed to start chat service:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 ${signal} signal received: shutting down chat service`);

  // Close Socket.IO
  io.close(() => {
    console.log('✅ Socket.IO server closed');
  });

  // Close database connection
  try {
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error closing database:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer(); 