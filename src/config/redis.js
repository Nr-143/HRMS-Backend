import { createClient } from 'redis';
import { env } from './env.js';

const redisClient = createClient({
  url: env.REDIS_URL,
});

redisClient.on('error', (err) => {
  console.error(' Redis Client Error:', err.message);
});

redisClient.on('connect', () => {
  console.log(' Connecting to Redis...');
});

redisClient.on('ready', () => {
  console.log(' Redis Client Ready');
});

export default redisClient;
