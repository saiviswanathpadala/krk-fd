import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { users } from '../models/user';
import { properties } from '../models/property';
import { eq, sql } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    phone: string;
  };
}

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  city: z.string().min(2, 'City must be at least 2 characters'),
  role: z.enum(['Customer', 'Agent'], { message: 'Role is required' }),
  profileImgUrl: z.string().url().optional(),
  profileCompleted: z.boolean().optional(),
  preferredCategories: z.array(z.string()).optional(),
  dateOfBirth: z.string().optional(),
  referredByAgentId: z.number().optional(),
});

export const getProfile = async (req: AuthRequest, res: Response) => {
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

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const profileData = profileSchema.parse(req.body);
    
    // Normalize role to lowercase for database consistency
    const normalizedRole = profileData.role.toLowerCase();
    
    // Prepare update data
    const updateData: any = {
      name: profileData.name,
      email: profileData.email,
      city: profileData.city,
      role: normalizedRole,
      profileCompleted: profileData.profileCompleted ?? true,
      updatedAt: new Date(),
    };
    
    // If profile image is provided, add it
    if (profileData.profileImgUrl) {
      updateData.profileImgUrl = profileData.profileImgUrl;
    }
    
    // If preferred categories are provided, add them
    if (profileData.preferredCategories) {
      updateData.preferredCategories = profileData.preferredCategories;
    }
    
    // If date of birth is provided, add it
    if (profileData.dateOfBirth) {
      updateData.dateOfBirth = new Date(profileData.dateOfBirth);
    }
    
    // If referred by agent is provided, add it
    if (profileData.referredByAgentId) {
      updateData.referredByAgentId = profileData.referredByAgentId;
    }
    
    // Check if user is changing role to 'agent' (requires admin approval)
    const currentUser = await db.select({ role: users.role, approved: users.approved })
      .from(users)
      .where(eq(users.id, parseInt(userId!)))
      .limit(1);
    
    if (currentUser.length > 0) {
      const wasAgent = currentUser[0].role === 'agent';
      const isBecomingAgent = normalizedRole === 'agent';
      
      // Only set approved to false if user is changing TO agent role, not if already an agent
      if (isBecomingAgent && !wasAgent) {
        updateData.approved = false;
      }
    }
    
    const updatedUser = await db.update(users)
      .set(updateData)
      .where(eq(users.id, parseInt(userId!)))
      .returning();
    
    if (updatedUser.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
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

export const getPropertyCategories = async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT DISTINCT jsonb_array_elements_text(categories) as category
      FROM properties
      WHERE deleted = false
      AND categories IS NOT NULL
      AND jsonb_array_length(categories) > 0
      ORDER BY category
    `);
    
    const categories = result.rows.map((row: any) => row.category);
    res.json({ categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
};

export const getApprovedAgents = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    
    let query = sql`
      SELECT id, name, city
      FROM users
      WHERE role = 'agent'
      AND approved = true
      AND deleted = false
      AND name IS NOT NULL
      AND city IS NOT NULL
    `;
    
    if (q) {
      query = sql`
        SELECT id, name, city
        FROM users
        WHERE role = 'agent'
        AND approved = true
        AND deleted = false
        AND name IS NOT NULL
        AND city IS NOT NULL
        AND (LOWER(name) LIKE LOWER(${'%' + q + '%'}) OR LOWER(city) LIKE LOWER(${'%' + q + '%'}))
      `;
    }
    
    query = sql`${query} ORDER BY name LIMIT 50`;
    
    const result = await db.execute(query);
    const agents = result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      city: row.city,
      displayName: `${row.name} - ${row.city}`
    }));
    
    res.json({ agents });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ message: 'Failed to fetch agents' });
  }
};

export const getAdmins = async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT id, name, email, profile_img_url as "profileImgUrl"
      FROM users
      WHERE role = 'admin'
      AND deleted = false
      ORDER BY id
      LIMIT 10
    `);
    
    res.json({ admins: result.rows });
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ message: 'Failed to fetch admins' });
  }
};

export const deleteAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    const user = await db.select({ role: users.role })
      .from(users)
      .where(eq(users.id, parseInt(userId!)))
      .limit(1);
    
    if (user.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user[0].role !== 'agent' && user[0].role !== 'customer') {
      return res.status(403).json({ message: 'Only agents and customers can delete their accounts' });
    }
    
    await db.update(users)
      .set({ 
        deleted: true, 
        deletedAt: new Date(),
        active: false,
        updatedAt: new Date()
      })
      .where(eq(users.id, parseInt(userId!)));
    
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
};
