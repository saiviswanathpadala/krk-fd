import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { loanRequests } from '../models/loanRequest';
import { users } from '../models/user';
import { eq, and, desc, gte, lte, isNull } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    phone: string;
  };
}

const loanRequestSchema = z.object({
  loanType: z.enum(['Home Loan', 'Plot Loan', 'Construction Loan', 'Home Improvement Loan', 'Balance Transfer', 'Top-Up Loan']),
  propertyCategory: z.string().min(1, 'Property category is required'),
  propertyValue: z.number().positive('Property value must be greater than 0'),
  loanAmountNeeded: z.number().positive('Loan amount must be greater than 0'),
  employmentType: z.enum(['Salaried', 'Self-Employed', 'Business Owner', 'Freelancer']),
  monthlyIncome: z.number().positive('Monthly income must be greater than 0'),
  preferredTenure: z.enum(['5 Years', '10 Years', '15 Years', '20 Years', '25 Years', '30 Years']),
  existingLoans: z.boolean(),
  existingLoanDetails: z.string().optional(),
  preferredContactTime: z.enum(['Morning (9–12)', 'Afternoon (12–4)', 'Evening (4–7)']),
  additionalNotes: z.string().max(1000, 'Additional notes cannot exceed 1000 characters').optional(),
}).refine(
  (data) => data.loanAmountNeeded <= data.propertyValue,
  { message: 'Loan amount cannot exceed property value', path: ['loanAmountNeeded'] }
).refine(
  (data) => !data.existingLoans || (data.existingLoans && data.existingLoanDetails && data.existingLoanDetails.trim().length > 0),
  { message: 'Existing loan details are required when you have existing loans', path: ['existingLoanDetails'] }
);

const rateLimitMap = new Map<number, { count: number; resetAt: number }>();

const checkRateLimit = (userId: number): boolean => {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);
  
  if (!userLimit || now > userLimit.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    return true;
  }
  
  if (userLimit.count >= 15) {
    return false;
  }
  
  userLimit.count++;
  return true;
};

export const createLoanRequest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.user!.userId);
    
    if (!checkRateLimit(userId)) {
      return res.status(429).json({ message: 'Rate limit exceeded. Maximum 5 loan requests per day.' });
    }
    
    const validatedData = loanRequestSchema.parse(req.body);
    
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const slaDueAt = new Date();
    slaDueAt.setHours(slaDueAt.getHours() + 24);

    const [loanRequest] = await db.insert(loanRequests).values({
      userId,
      userName: user.name || 'Unknown',
      userEmail: user.email || user.phone,
      userPhone: user.phone,
      userLocation: user.city || null,
      userPreferredCategories: user.preferredCategories || [],
      loanType: validatedData.loanType,
      propertyCategory: validatedData.propertyCategory,
      propertyValue: validatedData.propertyValue,
      loanAmountNeeded: validatedData.loanAmountNeeded,
      employmentType: validatedData.employmentType,
      monthlyIncome: validatedData.monthlyIncome,
      preferredTenure: validatedData.preferredTenure,
      existingLoans: validatedData.existingLoans,
      existingLoanDetails: validatedData.existingLoanDetails || null,
      preferredContactTime: validatedData.preferredContactTime,
      additionalNotes: validatedData.additionalNotes || null,
      status: 'received',
      slaDueAt,
      lastActivityAt: new Date(),
    }).returning();
    
    console.log(`📋 Loan request created: ID=${loanRequest.id}, User=${user.name}, Type=${validatedData.loanType}, Amount=${validatedData.loanAmountNeeded}`);
    
    const financeEmployees = await db.select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.department, 'finance'), eq(users.active, true), eq(users.deleted, false)));
    
    console.log(`📧 Notifying ${financeEmployees.length} finance employees about loan request ${loanRequest.id}`);
    
    res.status(201).json({ 
      success: true, 
      id: loanRequest.id,
      status: loanRequest.status,
      message: 'Loan request received successfully. Our finance team will contact you soon.' 
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: error.issues[0].message,
        errors: error.issues 
      });
    }
    console.error('Create loan request error:', error);
    res.status(500).json({ message: 'Failed to submit loan request. Please try again.' });
  }
};

export const getAdminLoanRequests = async (req: AuthRequest, res: Response) => {
  try {
    const { status, startDate, endDate, limit = '20', cursor } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    
    let whereConditions = [isNull(loanRequests.deletedAt)];
    
    if (status && typeof status === 'string') {
      whereConditions.push(eq(loanRequests.status, status));
    }
    
    if (startDate && typeof startDate === 'string') {
      whereConditions.push(gte(loanRequests.createdAt, new Date(startDate)));
    }
    
    if (endDate && typeof endDate === 'string') {
      whereConditions.push(lte(loanRequests.createdAt, new Date(endDate)));
    }
    
    const results = await db.select()
      .from(loanRequests)
      .where(and(...whereConditions))
      .orderBy(desc(loanRequests.createdAt))
      .limit(limitNum + 1);
    
    const hasMore = results.length > limitNum;
    const data = hasMore ? results.slice(0, limitNum) : results;
    const nextCursor = hasMore ? data[data.length - 1].id : null;
    
    res.json({ data, nextCursor, hasMore });
  } catch (error) {
    console.error('Get loan requests error:', error);
    res.status(500).json({ message: 'Failed to fetch loan requests' });
  }
};

// Finance employee operations imported from financeLoanRequestController
export { 
  getFinanceLoanRequests,
  getFinanceLoanRequestById,
  takeLoanRequest,
  updateLoanRequestStatus,
  addLoanRequestComment,
  getFinanceLoanRequestStats
} from './financeLoanRequestController';
