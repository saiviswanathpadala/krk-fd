import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { personConversations, personMessages } from '../models/personChat';
import { users } from '../models/user';
import { eq, and, or, desc, lt, isNull } from 'drizzle-orm';
import { emitPersonMessage, emitMessageStatusUpdate } from '../services/socketService';

interface AuthRequest extends Request {
  user?: {
    userId: number;
    role?: string;
  };
}

const createConversationSchema = z.object({
  participantId: z.number(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  attachments: z.array(z.any()).optional(),
  meta: z.any().optional(),
});

const getMessagesSchema = z.object({
  limit: z.string().transform(val => Math.min(parseInt(val) || 30, 50)).optional(),
  cursor: z.string().optional(),
});

export const createOrGetConversation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role?.toLowerCase();
    const { participantId } = createConversationSchema.parse(req.body);

    // Get participant details
    const participant = await db.select().from(users).where(eq(users.id, participantId)).limit(1);
    
    if (participant.length === 0) {
      return res.status(404).json({ message: 'Participant not found' });
    }

    const participantRole = participant[0].role?.toLowerCase();

    // Determine admin and person
    let adminId: number, personId: number, personRole: string;
    
    if (userRole === 'admin') {
      if (participantRole === 'customer') {
        return res.status(403).json({ message: 'Admin-customer chats not allowed' });
      }
      adminId = userId;
      personId = participantId;
      personRole = participantRole!;
    } else if (userRole === 'agent' || userRole === 'employee') {
      if (participantRole !== 'admin') {
        return res.status(403).json({ message: 'Only admin chats allowed' });
      }
      adminId = participantId;
      personId = userId;
      personRole = userRole;
    } else {
      return res.status(403).json({ message: 'Invalid role for person chat' });
    }

    // Check if conversation exists
    const existing = await db.select()
      .from(personConversations)
      .where(and(
        eq(personConversations.adminId, adminId),
        eq(personConversations.personId, personId)
      ))
      .limit(1);

    if (existing.length > 0) {
      return res.json({ conversation: existing[0] });
    }

    // Create new conversation
    const newConversation = await db.insert(personConversations)
      .values({
        adminId,
        personId,
        personRole,
        participants: [adminId, personId],
        createdBy: userId,
        meta: { initiatedBy: userRole },
      })
      .returning();

    res.json({ conversation: newConversation[0] });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Create conversation error:', error);
    res.status(500).json({ message: 'Failed to create conversation' });
  }
};

export const getConversationMessages = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { conversationId } = req.params;
    const { limit = 30, cursor } = getMessagesSchema.parse(req.query);

    // Verify user is participant
    const conversation = await db.select()
      .from(personConversations)
      .where(eq(personConversations.id, conversationId))
      .limit(1);

    if (conversation.length === 0) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const participants = conversation[0].participants as number[];
    if (!participants.includes(userId)) {
      return res.status(403).json({ message: 'Not authorized to access this conversation' });
    }

    // Build query
    let whereConditions = [eq(personMessages.conversationId, conversationId)];
    if (cursor) {
      whereConditions.push(lt(personMessages.createdAt, new Date(cursor)));
    }

    const messages = await db.select()
      .from(personMessages)
      .where(and(...whereConditions))
      .orderBy(desc(personMessages.createdAt))
      .limit(limit + 1);

    const hasMore = messages.length > limit;
    const data = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? data[data.length - 1].createdAt?.toISOString() : null;

    // Mark undelivered messages as delivered
    const undeliveredIds = data
      .filter(msg => msg.recipientId === userId && !msg.deliveredAt)
      .map(msg => msg.id);

    if (undeliveredIds.length > 0) {
      await db.update(personMessages)
        .set({ 
          deliveredAt: new Date(),
          status: 'delivered'
        })
        .where(and(
          eq(personMessages.recipientId, userId),
          isNull(personMessages.deliveredAt)
        ));

      // Emit status updates
      data.forEach(msg => {
        if (msg.recipientId === userId && !msg.deliveredAt) {
          emitMessageStatusUpdate(conversationId, msg.senderId, {
            ...msg,
            deliveredAt: new Date(),
            status: 'delivered'
          });
        }
      });
    }

    res.json({ messages: data, nextCursor, hasMore });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { conversationId } = req.params;
    const { content, attachments, meta } = sendMessageSchema.parse(req.body);

    // Verify user is participant
    const conversation = await db.select()
      .from(personConversations)
      .where(eq(personConversations.id, conversationId))
      .limit(1);

    if (conversation.length === 0) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const participants = conversation[0].participants as number[];
    if (!participants.includes(userId)) {
      return res.status(403).json({ message: 'Not authorized to send messages' });
    }

    // Determine recipient
    const recipientId = participants.find(id => id !== userId)!;

    // Insert message
    const newMessage = await db.insert(personMessages)
      .values({
        conversationId,
        senderId: userId,
        recipientId,
        content,
        attachments,
        status: 'sent',
        meta,
      })
      .returning();

    // Update conversation last_message_at
    await db.update(personConversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(personConversations.id, conversationId));

    // Emit socket event
    emitPersonMessage(conversationId, recipientId, newMessage[0]);

    res.json({ message: newMessage[0] });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
};

export const updateMessageStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { conversationId, messageId } = req.params;
    const { status, deliveredAt, readAt } = req.body;

    // Verify message exists and user is recipient
    const message = await db.select()
      .from(personMessages)
      .where(and(
        eq(personMessages.id, messageId),
        eq(personMessages.conversationId, conversationId),
        eq(personMessages.recipientId, userId)
      ))
      .limit(1);

    if (message.length === 0) {
      return res.status(404).json({ message: 'Message not found or not authorized' });
    }

    // Update status
    const updateData: any = {};
    if (status) updateData.status = status;
    if (deliveredAt) updateData.deliveredAt = new Date(deliveredAt);
    if (readAt) updateData.readAt = new Date(readAt);

    const updated = await db.update(personMessages)
      .set(updateData)
      .where(eq(personMessages.id, messageId))
      .returning();

    // Emit status update
    emitMessageStatusUpdate(conversationId, message[0].senderId, updated[0]);

    res.json({ message: updated[0] });
  } catch (error) {
    console.error('Update message status error:', error);
    res.status(500).json({ message: 'Failed to update message status' });
  }
};

export const getUserConversations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const conversations = await db.select()
      .from(personConversations)
      .where(or(
        eq(personConversations.adminId, userId),
        eq(personConversations.personId, userId)
      ))
      .orderBy(desc(personConversations.lastMessageAt));

    res.json({ conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: 'Failed to fetch conversations' });
  }
};
