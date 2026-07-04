import app from './app.js';
import { env } from './config/env.js';
import prisma from './config/prisma.js';
import redisClient from './config/redis.js';

const startServer = async () => {
  try {
    // 1. Establish connection to Redis
    console.log('Connecting to Redis Client...');
    await redisClient.connect();

    // 2. Verify Database Connection sanity via Prisma
    console.log(' Checking Database connection health...');
    let dbRetries = 5;
    while (dbRetries > 0) {
      try {
        await prisma.$connect();
        break;
      } catch (dbErr) {
        dbRetries -= 1;
        if (dbRetries === 0) throw dbErr;
        console.log(` Database connection failed (${dbErr.message}). Retrying in 2 seconds... (${dbRetries} attempts left)`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    console.log('PostgreSQL Database connection verified successfully');

    // 3. Start Express server listener
    const server = app.listen(env.PORT, () => {
      console.log(` HRMS Modular Monolith running in [${env.NODE_ENV}] mode on port ${env.PORT}`);
    });

    // Graceful Shutdown Handler
    const shutdown = async (signal) => {
      console.log(` \n Received ${signal}. Initiating graceful shutdown...`);

      server.close(async () => {
        console.log('HTTP server closed');

        // Close Prisma client connection
        try {
          await prisma.$disconnect();
          console.log('🔌 PostgreSQL connection disconnected');
        } catch (dbErr) {
          console.error('Error disconnecting PostgreSQL:', dbErr.message);
        }

        // Close Redis client connection
        try {
          if (redisClient.isReady) {
            await redisClient.disconnect();
            console.log(' Redis connection disconnected');
          }
        } catch (redisErr) {
          console.error('Error disconnecting Redis:', redisErr.message);
        }

        process.exit(0);
      });

      // Force exit after 10s if connections fail to close
      setTimeout(() => {
        console.error(' Forcefully exiting server after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error(' Failed to launch HRMS Backend Server:', error);
    process.exit(1);
  }
};

startServer();
