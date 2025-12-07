import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { conversations, messages } from '../models/chat';
import { eq, and, desc, inArray } from 'drizzle-orm';
import crypto from 'crypto';

const createConversationSchema = z.object({
  title: z.string().optional(),
  context: z.object({
    propertyId: z.string().optional(),
    fromScreen: z.string().optional(),
  }).optional(),
}).optional();

const sendMessageSchema = z.object({
  content: z.string().min(1),
  meta: z.object({
    propertyId: z.string().optional(),
    fromScreen: z.string().optional(),
  }).optional(),
});

export const createConversation = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const body = createConversationSchema.parse(req.body || {});
    const { title, context } = body || {};

    const [conversation] = await db.insert(conversations).values({
      userId,
      title: title || 'New Chat',
      context: context as any,
    }).returning();

    res.json(conversation);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    res.status(500).json({ message: 'Failed to create conversation' });
  }
};

export const getConversations = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get conversation IDs that have messages
    const conversationIds = await db
      .selectDistinct({ id: messages.conversationId })
      .from(messages);

    const ids = conversationIds.map(c => c.id);

    if (ids.length === 0) {
      return res.json({ conversations: [], limit, offset });
    }

    const userConversations = await db
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.userId, userId),
        eq(conversations.deleted, false),
        inArray(conversations.id, ids)
      ))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(limit)
      .offset(offset);

    res.json({ conversations: userConversations, limit, offset });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch conversations' });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { cid } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, cid), eq(conversations.userId, userId)));

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const conversationMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, cid))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ messages: conversationMessages.reverse(), limit, offset });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { cid } = req.params;
    const { content, meta } = sendMessageSchema.parse(req.body);

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, cid), eq(conversations.userId, userId)));

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const [message] = await db.insert(messages).values({
      conversationId: cid,
      sender: 'user',
      content,
      status: 'sent',
      meta: meta as any,
    }).returning();

    // Auto-generate title from first message
    if (conversation.title === 'New Chat') {
      const title = content.length > 30 ? content.substring(0, 30) + '...' : content;
      await db
        .update(conversations)
        .set({ title, lastMessageAt: new Date() })
        .where(eq(conversations.id, cid));
    } else {
      await db
        .update(conversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(conversations.id, cid));
    }

    // Forward to n8n
    forwardToN8n(message.id, cid, userId, content, meta).catch(console.error);

    res.json(message);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    res.status(500).json({ message: 'Failed to send message' });
  }
};

export const deleteConversation = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { cid } = req.params;

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, cid), eq(conversations.userId, userId)));

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    await db
      .update(conversations)
      .set({ deleted: true })
      .where(eq(conversations.id, cid));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete conversation' });
  }
};

export const n8nWebhook = async (req: Request, res: Response) => {
  try {
    // Skip signature validation for now - can be enabled later
    // const signature = req.headers['x-n8n-signature'] as string;
    // const secret = process.env.N8N_WEBHOOK_SECRET || 'your-secret-key';
    // const hmac = crypto.createHmac('sha256', secret);
    // hmac.update(JSON.stringify(req.body));
    // const expectedSignature = hmac.digest('hex');
    // if (signature !== expectedSignature) {
    //   return res.status(401).json({ message: 'Invalid signature' });
    // }

    let conversationId, content, messageId, trace;

    // Handle N8N array format: [{"output": "...", "conversationId": "..."}]
    if (Array.isArray(req.body) && req.body[0]) {
      const data = req.body[0];
      conversationId = data.conversationId;
      content = data.output || data.aiResponse;
      messageId = data.messageId;
      trace = data.trace;
    } else {
      // Handle object format: {"conversationId": "...", "aiResponse": "..."}
      conversationId = req.body.conversationId;
      content = req.body.aiResponse || req.body.output;
      messageId = req.body.messageId;
      trace = req.body.trace;
    }

    if (!conversationId || !content) {
      return res.status(400).json({ message: 'Missing conversationId or content' });
    }

    const [aiMessage] = await db.insert(messages).values({
      conversationId,
      sender: 'ai',
      content,
      status: 'delivered',
      receivedAt: new Date(),
      externalId: trace,
    }).returning();

    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, conversationId));

    res.json({ success: true, messageId: aiMessage.id });
  } catch (error) {
    console.error('n8n webhook error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
};

async function forwardToN8n(messageId: string, conversationId: string, userId: string, content: string, meta?: any) {
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  if (!n8nUrl) return;

  const payload = { messageId, conversationId, userId, content, meta };
  const secret = process.env.N8N_WEBHOOK_SECRET || 'your-secret-key';
  
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const signature = hmac.digest('hex');

  await fetch(n8nUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-Signature': signature,
    },
    body: JSON.stringify(payload),
  });
}
