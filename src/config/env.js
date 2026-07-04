import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid Redis connection string').default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters long').default('hrms-super-secret-key-change-me-in-production'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  SESSION_TTL: z.coerce.number().default(86400), // Session time-to-live in Redis (seconds)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables Configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
