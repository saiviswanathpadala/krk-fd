import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../config/database';
import { users } from '../models/user';
import { eq } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: {
    userId: number;
    phone: string;
    role?: string;
    active?: boolean;
    approved?: boolean;
    deleted?: boolean;
  };
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  console.log(`\n🔒 [AUTH] ${req.method} ${req.path}`);
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    console.log(`✅ Token decoded - User: ${decoded.userId}, Role: ${decoded.role}, Active: ${decoded.active}`);
    
    // Check if user still exists in database
    const user = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
    
    if (user.length === 0) {
      console.log('❌ User not found in database');
      return res.status(401).json({ message: 'User not found' });
    }
    
    req.user = decoded;
    console.log('✅ Authentication successful\n');
    next();
  } catch (error) {
    console.log('❌ Token verification failed:', error);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

export const validateToken = async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ valid: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    // Check if user still exists in database
    const user = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
    
    if (user.length === 0) {
      return res.status(401).json({ valid: false, message: 'User not found' });
    }
    
    res.json({ 
      valid: true, 
      user: user[0],
      message: 'Token is valid' 
    });
  } catch (error) {
    res.status(401).json({ valid: false, message: 'Invalid or expired token' });
  }
};

export const ensureAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  console.log('👑 [ADMIN CHECK] Verifying admin role...');
  if (!req.user) {
    console.log('❌ No user in request');
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    console.log(`❌ User is not admin: ${req.user.role}`);
    return res.status(403).json({ message: 'Admin access required' });
  }

  console.log('✅ Admin check passed\n');
  next();
};

export const ensureApproved = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (req.user.approved === false) {
    return res.status(403).json({ message: 'Account pending approval' });
  }

  next();
};

export const ensureEmployee = async (req: AuthRequest, res: Response, next: NextFunction) => {
  console.log('👔 [EMPLOYEE CHECK] Verifying employee role and active status...');
  if (!req.user) {
    console.log('❌ No user in request');
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (req.user.role !== 'employee') {
    console.log(`❌ User is not employee: ${req.user.role}`);
    return res.status(403).json({ message: 'Employee access required' });
  }

  if (req.user.deleted === true) {
    console.log('❌ Employee account has been deleted');
    return res.status(403).json({ message: 'account_deleted' });
  }

  if (req.user.active === false) {
    console.log('❌ Employee account is inactive');
    return res.status(403).json({ message: 'account_inactive' });
  }

  console.log('✅ Employee check passed\n');
  next();
};

export const ensureFinanceDepartment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  console.log('💰 [FINANCE CHECK] Verifying finance department access...');
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const [user] = await db.select().from(users).where(eq(users.id, req.user.userId)).limit(1);
  
  if (!user || user.role !== 'employee' || user.department?.toLowerCase() !== 'finance') {
    return res.status(403).json({ message: 'Finance department access required' });
  }

  if (user.deleted || !user.active) {
    return res.status(403).json({ message: 'Account inactive or deleted' });
  }

  console.log('✅ Finance department access granted\n');
  next();
};