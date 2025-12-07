import { db } from '../config/database';
import { adminAuditLogs } from '../models/user';

export const auditService = {
  async log(
    adminId: number,
    actionType: string,
    targetType?: string,
    targetId?: number,
    details?: any
  ) {
    try {
      await db.insert(adminAuditLogs).values({
        adminId,
        actionType,
        targetType,
        targetId,
        details: details ? JSON.parse(JSON.stringify(details)) : null,
      });
    } catch (error) {
      console.error('Audit log failed:', error);
    }
  },
};
