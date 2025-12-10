import { Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { db } from '../config/database';
import { users } from '../models/user';
import { eq } from 'drizzle-orm';
import { msg91Service } from '../services/msg91Service';
import { auditService } from '../services/auditService';
import { invalidateDashboardCache } from '../controllers/dashboardController';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    phone: string;
    role?: string;
    active?: boolean;
    approved?: boolean;
  };
}

// Session storage for 2Factor.in
const sessionStore = new Map<string, { sessionId: string; expires: number }>();

// Rate limiting for OTP requests
const otpRateLimit = new Map<string, { count: number; resetTime: number }>();
const MAX_OTP_REQUESTS = 500;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;

const phoneSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number'),
});

const otpSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number'),
  otp: z.string().length(4, 'OTP must be 4 digits'),
});



export const sendOTP = async (req: Request, res: Response) => {
  console.log('\n📞 [OTP REQUEST] Incoming request to send OTP');
  console.log('Request body:', req.body);
  
  try {
    const { phone } = phoneSchema.parse(req.body);
    console.log(`✅ Phone validated: ${phone}`);
    
    // Check rate limiting
    console.log('🔍 Checking rate limit...');
    const now = Date.now();
    const rateData = otpRateLimit.get(phone);
    
    if (rateData) {
      if (now > rateData.resetTime) {
        console.log('⏰ Rate limit window expired, resetting counter');
        otpRateLimit.set(phone, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
      } else if (rateData.count >= MAX_OTP_REQUESTS) {
        const remainingTime = Math.ceil((rateData.resetTime - now) / (60 * 1000));
        console.log(`❌ Rate limit exceeded for ${phone}`);
        return res.status(429).json({ 
          message: `Too many OTP requests. Please try again in ${remainingTime} minutes.` 
        });
      } else {
        console.log(`📊 Rate limit count: ${rateData.count + 1}/${MAX_OTP_REQUESTS}`);
        rateData.count++;
      }
    } else {
      console.log('✅ First OTP request for this phone');
      otpRateLimit.set(phone, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    }
    
    // Send OTP via MSG91
    console.log('📤 Sending OTP via MSG91...');
    const result = await msg91Service.sendOTP(phone);
    
    if (!result.success) {
      console.log(`❌ OTP send failed: ${result.message}`);
      return res.status(400).json({ message: result.message });
    }
    
    console.log('✅ OTP sent successfully');
    
    // Store session ID
    const expires = Date.now() + 10 * 60 * 1000;
    sessionStore.set(phone, { sessionId: result.sessionId!, expires });
    console.log(`💾 Session stored for ${phone}`);
    console.log('✅ [OTP REQUEST] Completed successfully\n');
    
    res.json({ 
      success: true, 
      message: result.message
    });
  } catch (error: any) {
    console.error('❌ [OTP REQUEST] Error:', error);
    if (error instanceof z.ZodError) {
      console.log('Validation error:', error.issues[0].message);
      return res.status(400).json({ message: error.issues[0].message });
    }
    res.status(500).json({ message: 'Failed to send OTP' });
  }
};

export const getMe = async (req: AuthRequest, res: Response) => {
  console.log('\n👤 [GET ME] Fetching user data');
  console.log('User ID from token:', req.user?.userId);
  
  try {
    if (!req.user) {
      console.log('❌ No user in request');
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await db.select().from(users).where(eq(users.id, parseInt(req.user.userId))).limit(1);
    
    if (user.length === 0) {
      console.log('❌ User not found in database');
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`✅ User found - Role: ${user[0].role}, Active: ${user[0].active}`);
    console.log('✅ [GET ME] Completed successfully\n');

    res.json({
      user: {
        id: user[0].id,
        phone: user[0].phone,
        name: user[0].name,
        email: user[0].email,
        role: user[0].role,
        active: user[0].active,
        approved: user[0].approved,
        profileCompleted: user[0].profileCompleted,
        lastLogin: user[0].lastLogin,
      }
    });
  } catch (error) {
    console.error('❌ [GET ME] Error:', error);
    res.status(500).json({ message: 'Failed to fetch user data' });
  }
};

export const verifyOTP = async (req: Request, res: Response) => {
  console.log('\n🔐 [OTP VERIFY] Incoming request to verify OTP');
  console.log('Request body:', req.body);
  
  try {
    const { phone, otp } = otpSchema.parse(req.body);
    console.log(`✅ Data validated - Phone: ${phone}, OTP: ${otp}`);
    
    // Check if session exists
    const session = sessionStore.get(phone);
    
    if (!session) {
      console.log(`❌ No session found for phone: ${phone}`);
      return res.status(400).json({ message: 'OTP session not found. Please request a new OTP.' });
    }
    
    if (Date.now() > session.expires) {
      console.log(`⏰ Session expired for phone: ${phone}`);
      sessionStore.delete(phone);
      return res.status(400).json({ message: 'OTP expired. Please request a new OTP.' });
    }
    
    console.log(`📞 Calling MSG91 verify with sessionId: ${session.sessionId}`);
    
    // Verify OTP with MSG91
    const result = await msg91Service.verifyOTP(session.sessionId, otp);
    
    console.log(`📋 MSG91 result:`, result);
    
    if (!result.success) {
      console.log(`❌ OTP verification failed: ${result.message}`);
      return res.status(400).json({ message: result.message });
    }
    
    console.log(`✅ OTP verified successfully for phone: ${phone}`);
    
    // OTP is valid, remove session
    sessionStore.delete(phone);
    console.log('🗑️  Session removed');

    // Upsert user
    console.log('🔍 Checking if user exists...');
    let user = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    
    if (user.length === 0) {
      console.log('👤 New user - creating account...');
      const newUser = await db.insert(users).values({
        phone,
        profileCompleted: false,
        role: 'customer',
        approved: true,
      }).returning();
      user = newUser;
      console.log(`✅ User created with ID: ${user[0].id}, Role: ${user[0].role}`);
      invalidateDashboardCache();
    } else {
      console.log(`👤 Existing user found - ID: ${user[0].id}, Role: ${user[0].role}, Active: ${user[0].active}`);
      await db.update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.phone, phone));
      console.log('✅ Last login updated');
    }

    // Check if user is deleted
    if (user[0].deleted) {
      console.log('❌ User account has been deleted');
      return res.status(403).json({ 
        message: 'account_deleted',
        details: 'Your account is no longer active. Please contact support for assistance.' 
      });
    }

    // Generate JWT with role, active, and approved
    console.log('🔑 Generating JWT token...');
    const token = jwt.sign(
      { 
        userId: user[0].id, 
        phone: user[0].phone,
        role: user[0].role,
        active: user[0].active,
        approved: user[0].approved,
        deleted: user[0].deleted
      },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );

    // Log admin/employee login
    if (user[0].role === 'admin') {
      console.log('👑 Admin login - logging to audit...');
      await auditService.log(user[0].id, 'admin_login', 'user', user[0].id, { phone });
    } else if (user[0].role === 'employee') {
      console.log('👔 Employee login - logging to audit...');
      try {
        await auditService.log(user[0].id, 'employee_login', 'user', user[0].id, { phone });
      } catch (err) {
        console.log('⚠️  Audit log skipped');
      }
    }

    console.log('✅ [OTP VERIFY] Completed successfully');
    console.log('Response:', { role: user[0].role, active: user[0].active, approved: user[0].approved });
    console.log('');

    res.json({
      token,
      user: user[0],
      profileCompleted: user[0].profileCompleted,
      role: user[0].role,
      active: user[0].active,
      approved: user[0].approved,
    });
  } catch (error: any) {
    console.error('❌ Error in verifyOTP:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    res.status(500).json({ message: 'Verification failed' });
  }
};
