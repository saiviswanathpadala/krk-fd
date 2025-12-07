import { Request, Response } from 'express';
import { db } from '../config/database';
import { users } from '../models/user';
import { eq, and, ilike } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: { userId: number; role?: string };
}

export const getEmployeeCustomerById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employeeId = req.user!.userId;
    const customerId = parseInt(id);

    if (isNaN(customerId)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }

    // Get customer
    const [customer] = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      city: users.city,
      profileImgUrl: users.profileImgUrl,
      createdAt: users.createdAt,
      referredByAgentId: users.referredByAgentId,
    }).from(users)
      .where(and(
        eq(users.id, customerId),
        ilike(users.role, 'customer'),
        eq(users.deleted, false)
      ))
      .limit(1);

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Verify the customer was referred by an agent assigned to this employee
    if (customer.referredByAgentId) {
      const [agent] = await db.select()
        .from(users)
        .where(and(
          eq(users.id, customer.referredByAgentId),
          eq(users.assignedEmployeeId, employeeId),
          eq(users.deleted, false)
        ))
        .limit(1);

      if (!agent) {
        return res.status(403).json({ message: 'You do not have access to this customer' });
      }
    } else {
      return res.status(403).json({ message: 'You do not have access to this customer' });
    }

    res.json(customer);
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ message: 'Failed to fetch customer' });
  }
};
