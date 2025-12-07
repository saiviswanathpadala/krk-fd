import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { contactMessages, faqs } from '../models/contact';
import { users } from '../models/user';
import { asc, eq } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    phone: string;
  };
}

const contactSchema = z.object({
  subject: z.string().min(3, 'Subject must be at least 3 characters'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

export const submitContact = async (req: AuthRequest, res: Response) => {
  try {
    const { subject, message } = contactSchema.parse(req.body);
    const userId = req.user?.userId;
    
    // Get user info from database
    let name = 'Anonymous';
    let email = 'no-email@example.com';
    
    if (userId) {
      const user = await db.select().from(users).where(eq(users.id, parseInt(userId))).limit(1);
      if (user.length > 0) {
        name = user[0].name || 'User';
        email = user[0].email || user[0].phone;
      }
    }
    
    await db.insert(contactMessages).values({
      name,
      email,
      subject,
      message
    });
    
    res.json({ 
      success: true, 
      message: 'Your message has been sent successfully. We will get back to you soon!' 
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Contact submission error:', error);
    res.status(500).json({ message: 'Failed to send message. Please try again.' });
  }
};

export const getFAQs = async (req: Request, res: Response) => {
  try {
    const faqList = await db.select().from(faqs).orderBy(asc(faqs.orderIndex));
    res.json(faqList);
  } catch (error: any) {
    console.error('FAQ fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch FAQs' });
  }
};