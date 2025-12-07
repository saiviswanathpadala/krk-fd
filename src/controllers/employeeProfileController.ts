import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { users } from '../models/user';
import { eq } from 'drizzle-orm';
import { auditService } from '../services/auditService';
import { emitProfileUpdated } from '../services/socketService';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    phone: string;
    role?: string;
  };
}

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().max(100).optional(),
  profileImgUrl: z.string().url().max(500).optional(),
  dateOfBirth: z.string().datetime().optional(),
});

export const updateEmployeeProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userId = parseInt(req.user.userId);
    const data = updateProfileSchema.parse(req.body);

    // Get current user data for audit
    const currentUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (currentUser.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check email uniqueness if changed
    if (data.email && data.email !== currentUser[0].email) {
      const existingUser = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
      if (existingUser.length > 0 && existingUser[0].id !== userId) {
        return res.status(409).json({ message: 'Email already in use' });
      }
    }

    // Prepare update data with proper type conversion
    const updateData: any = {
      updatedAt: new Date(),
    };
    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;
    if (data.profileImgUrl) updateData.profileImgUrl = data.profileImgUrl;
    if (data.dateOfBirth) updateData.dateOfBirth = new Date(data.dateOfBirth);

    // Update user
    const updated = await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    // Audit log
    await auditService.log(userId, 'update_profile', 'user', userId, {
      before: { name: currentUser[0].name, email: currentUser[0].email, profileImgUrl: currentUser[0].profileImgUrl, dateOfBirth: currentUser[0].dateOfBirth },
      after: data,
    });

    // Emit socket event
    emitProfileUpdated(userId, updated[0]);

    res.json({
      user: {
        id: updated[0].id,
        phone: updated[0].phone,
        name: updated[0].name,
        email: updated[0].email,
        role: updated[0].role,
        department: updated[0].department,
        profileImgUrl: updated[0].profileImgUrl,
        dateOfBirth: updated[0].dateOfBirth,
        lastLogin: updated[0].lastLogin,
        createdAt: updated[0].createdAt,
        updatedAt: updated[0].updatedAt,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userId = parseInt(req.user.userId);

    // Audit log
    await auditService.log(userId, 'logout', 'user', userId, {
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to logout' });
  }
};
