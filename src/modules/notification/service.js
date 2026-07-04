import { getContext } from '../../utils/context.utils.js';

class NotificationService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Stub method to send a notification (e.g. email, in-app alert).
   * Will integrate with WebSockets, SendGrid, or Kafka in future phases.
   */
  async sendNotification({ recipientId, message, type }) {
    const context = getContext();
    const tenantId = context ? context.tenantId : 'global';

    console.log(`[Notification STUB] Dispatching ${type} to User/Employee ${recipientId} under Tenant ${tenantId}: "${message}"`);
    
    // Simulate async dispatch success
    return {
      success: true,
      queuedAt: new Date(),
      recipientId,
      type,
    };
  }
}

export default NotificationService;
