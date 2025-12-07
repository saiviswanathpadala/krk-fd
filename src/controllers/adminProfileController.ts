import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { users, adminAuditLogs } from '../models/user';
import { eq } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    phone: string;
    role?: string;
  };
}

const adminProfileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  city: z.string().min(2).optional(),
  department: z.string().optional(),
  profileImgUrl: z.string().url().optional(),
  dateOfBirth: z.string().optional(),
});

export const getAdminProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    const user = await db.select().from(users).where(eq(users.id, parseInt(userId!))).limit(1);
    
    if (user.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ user: user[0] });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
};

export const updateAdminProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.user?.userId!);
    const profileData = adminProfileSchema.parse(req.body);
    
    // Get current user data for audit log
    const currentUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (currentUser.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const before = {
      name: currentUser[0].name,
      email: currentUser[0].email,
      city: currentUser[0].city,
      department: currentUser[0].department,
      profileImgUrl: currentUser[0].profileImgUrl,
    };
    
    // Update profile
    const updateData: any = {};
    
    if (profileData.name !== undefined) updateData.name = profileData.name;
    if (profileData.email !== undefined) updateData.email = profileData.email;
    if (profileData.city !== undefined) updateData.city = profileData.city;
    if (profileData.department !== undefined) updateData.department = profileData.department;
    if (profileData.profileImgUrl !== undefined) updateData.profileImgUrl = profileData.profileImgUrl;
    if (profileData.dateOfBirth !== undefined) updateData.dateOfBirth = new Date(profileData.dateOfBirth);
    
    updateData.updatedAt = new Date();
    
    const updatedUser = await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    
    const after = {
      name: updatedUser[0].name,
      email: updatedUser[0].email,
      city: updatedUser[0].city,
      department: updatedUser[0].department,
      profileImgUrl: updatedUser[0].profileImgUrl,
    };

    // Write audit log
    await db.insert(adminAuditLogs).values({
      adminId: userId,
      actionType: 'update_profile',
      targetType: 'user',
      targetId: userId,
      details: { before, after },
    });
    
    res.json({ 
      message: 'Profile updated successfully',
      user: updatedUser[0] 
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
    const userId = parseInt(req.user?.userId!);
    
    // Write audit log
    await db.insert(adminAuditLogs).values({
      adminId: userId,
      actionType: 'logout',
      targetType: 'user',
      targetId: userId,
      details: { timestamp: new Date().toISOString() },
    });
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to logout' });
  }
};
