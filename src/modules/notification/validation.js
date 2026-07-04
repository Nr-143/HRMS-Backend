import { z } from 'zod';

export const sendNotificationSchema = z.object({
  body: z.object({
    recipientId: z.string().uuid('Invalid Recipient ID'),
    message: z.string().min(1, 'Message content cannot be blank'),
    type: z.string().default('IN_APP'), // e.g., EMAIL, SMS, IN_APP
  }),
});
