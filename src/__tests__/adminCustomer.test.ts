import request from 'supertest';
import app from '../app';
import { db } from '../config/database';
import { users } from '../models/user';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

describe('Admin Customer Management', () => {
  let adminToken: string;
  let customerIds: number[] = [];

  beforeAll(async () => {
    // Create admin user for testing
    const adminUser = await db.insert(users).values({
      phone: '+919999999999',
      name: 'Test Admin',
      email: 'admin@test.com',
      role: 'admin',
      profileCompleted: true,
      approved: true,
    }).returning();

    adminToken = jwt.sign(
      { 
        userId: adminUser[0].id, 
        phone: adminUser[0].phone,
        role: adminUser[0].role,
        approved: adminUser[0].approved 
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );

    // Create test customers
    const customers = await db.insert(users).values([
      {
        phone: '+919876543210',
        name: 'John Doe',
        email: 'john@test.com',
        city: 'Mumbai',
        role: 'customer',
        profileCompleted: true,
      },
      {
        phone: '+919876543211',
        name: 'Jane Smith',
        email: 'jane@test.com',
        city: 'Delhi',
        role: 'customer',
        profileCompleted: true,
      },
    ]).returning();

    customerIds = customers.map(c => c.id);
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(users).where(eq(users.role, 'admin'));
    await db.delete(users).where(eq(users.role, 'customer'));
  });

  describe('GET /api/admin/customers', () => {
    it('should return paginated customers for admin', async () => {
      const response = await request(app)
        .get('/api/admin/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body).toHaveProperty('nextCursor');
      expect(response.body).toHaveProperty('hasMore');
    });

    it('should filter customers by search query', async () => {
      const response = await request(app)
        .get('/api/admin/customers?q=john')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toBeInstanceOf(Array);
      if (response.body.data.length > 0) {
        expect(response.body.data[0].name.toLowerCase()).toContain('john');
      }
    });

    it('should require admin role', async () => {
      const customerToken = jwt.sign(
        { userId: customerIds[0], role: 'customer' },
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
      );

      await request(app)
        .get('/api/admin/customers')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });
  });

  describe('GET /api/admin/customers/:id', () => {
    it('should return customer details for admin', async () => {
      const response = await request(app)
        .get(`/api/admin/customers/${customerIds[0]}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', customerIds[0]);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('email');
    });

    it('should return 404 for non-existent customer', async () => {
      await request(app)
        .get('/api/admin/customers/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('DELETE /api/admin/customers/:id', () => {
    it('should soft delete customer', async () => {
      const response = await request(app)
        .delete(`/api/admin/customers/${customerIds[0]}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify customer is soft deleted
      const deletedCustomer = await db.select()
        .from(users)
        .where(eq(users.id, customerIds[0]))
        .limit(1);

      expect(deletedCustomer[0].deleted).toBe(true);
      expect(deletedCustomer[0].deletedAt).toBeTruthy();
    });
  });

  describe('DELETE /api/admin/customers (bulk)', () => {
    it('should bulk delete customers', async () => {
      const response = await request(app)
        .delete('/api/admin/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [customerIds[1]] })
        .expect(200);

      expect(response.body).toHaveProperty('deleted');
      expect(response.body).toHaveProperty('failed');
      expect(response.body.deleted).toContain(customerIds[1]);
    });

    it('should validate bulk delete limit', async () => {
      const tooManyIds = Array.from({ length: 101 }, (_, i) => i + 1);
      
      await request(app)
        .delete('/api/admin/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: tooManyIds })
        .expect(400);
    });
  });
});