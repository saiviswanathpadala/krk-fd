import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { users } from '../models/user';
import { eq, and, or, ilike, desc, lt, isNull } from 'drizzle-orm';
import { auditService } from '../services/auditService';

interface AuthRequest extends Request {
  user?: {
    userId: number;
    role?: string;
  };
}

const listQuerySchema = z.object({
  limit: z.string().transform(val => Math.min(parseInt(val) || 20, 100)),
  cursor: z.string().optional(),
  q: z.string().optional(),
  city: z.string().optional(),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.number()).max(100, 'Cannot delete more than 100 customers at once'),
});

export const getCustomers = async (req: AuthRequest, res: Response) => {
  try {
    const { limit, cursor, q, city } = listQuerySchema.parse(req.query);
    
    let whereConditions = [
      ilike(users.role, 'customer'),
      eq(users.deleted, false)
    ];

    // Add search conditions
    if (q) {
      const searchTerm = `%${q.toLowerCase()}%`;
      whereConditions.push(
        or(
          ilike(users.name, searchTerm),
          ilike(users.email, searchTerm),
          ilike(users.phone, searchTerm)
        )!
      );
    }

    if (city) {
      whereConditions.push(ilike(users.city, `%${city}%`));
    }

    // Add cursor condition
    if (cursor) {
      whereConditions.push(lt(users.id, parseInt(cursor)));
    }

    const results = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      city: users.city,
      profileImgUrl: users.profileImgUrl,
      lastLogin: users.lastLogin,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(...whereConditions))
    .orderBy(desc(users.id))
    .limit(limit + 1);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? results[limit - 1].id.toString() : null;

    res.json({
      data,
      nextCursor,
      hasMore
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Get customers error:', error);
    res.status(500).json({ message: 'Failed to fetch customers' });
  }
};

export const getCustomerById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const customerId = parseInt(id);

    if (isNaN(customerId)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }

    const customer = await db.select()
      .from(users)
      .where(and(
        eq(users.id, customerId),
        ilike(users.role, 'customer'),
        eq(users.deleted, false)
      ))
      .limit(1);

    if (customer.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Remove sensitive fields
    const { ...customerData } = customer[0];
    
    res.json(customerData);
  } catch (error) {
    console.error('Get customer by ID error:', error);
    res.status(500).json({ message: 'Failed to fetch customer details' });
  }
};

export const deleteCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const customerId = parseInt(id);
    const adminId = req.user!.userId;

    if (isNaN(customerId)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }

    // Check if customer exists and is not already deleted
    const customer = await db.select()
      .from(users)
      .where(and(
        eq(users.id, customerId),
        ilike(users.role, 'customer'),
        eq(users.deleted, false)
      ))
      .limit(1);

    if (customer.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Soft delete the customer
    await db.update(users)
      .set({
        deleted: true,
        deletedAt: new Date(),
        deletedByAdminId: adminId,
      })
      .where(eq(users.id, customerId));

    // Log the deletion
    await auditService.log(
      adminId,
      'delete_customer',
      'user',
      customerId,
      {
        customerName: customer[0].name,
        customerEmail: customer[0].email,
        customerPhone: customer[0].phone,
      }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ message: 'Failed to delete customer' });
  }
};

export const bulkDeleteCustomers = async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = bulkDeleteSchema.parse(req.body);
    const adminId = req.user!.userId;

    if (ids.length === 0) {
      return res.status(400).json({ message: 'No customer IDs provided' });
    }

    // Get customers to delete
    const customersToDelete = await db.select()
      .from(users)
      .where(and(
        ilike(users.role, 'customer'),
        eq(users.deleted, false)
      ));

    const validIds = customersToDelete
      .filter(customer => ids.includes(customer.id))
      .map(customer => customer.id);

    const deleted: number[] = [];
    const failed: Array<{ id: number; reason: string }> = [];

    // Process deletions
    for (const id of ids) {
      try {
        if (!validIds.includes(id)) {
          failed.push({ id, reason: 'Customer not found or already deleted' });
          continue;
        }

        const customer = customersToDelete.find(c => c.id === id);
        
        await db.update(users)
          .set({
            deleted: true,
            deletedAt: new Date(),
            deletedByAdminId: adminId,
          })
          .where(eq(users.id, id));

        // Log the deletion
        await auditService.log(
          adminId,
          'bulk_delete_customer',
          'user',
          id,
          {
            customerName: customer?.name,
            customerEmail: customer?.email,
            customerPhone: customer?.phone,
            bulkOperation: true,
          }
        );

        deleted.push(id);
      } catch (error) {
        failed.push({ id, reason: 'Database error during deletion' });
      }
    }

    res.json({ deleted, failed });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Bulk delete customers error:', error);
    res.status(500).json({ message: 'Failed to delete customers' });
  }
};