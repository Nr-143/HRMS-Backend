import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { getContext } from '../utils/context.utils.js';

const prismaRaw = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

const prisma = prismaRaw.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const context = getContext();

        // 1. If there's no active user session, bypass the filter
        if (!context || !context.tenantId) {
          return query(args);
        }

        // 2. If the user is a platform SUPER_ADMIN, bypass the filter
        if (context.role === 'SUPER_ADMIN') {
          return query(args);
        }

        // 3. For reading operations, inject tenantId filter
        if (['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy'].includes(operation)) {
          args.where = args.where || {};
          args.where.tenantId = context.tenantId;
        }

        // 4. For writing/deleting operations, inject tenantId filter
        if (['update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
          args.where = args.where || {};
          args.where.tenantId = context.tenantId;
        }

        // 5. For creation operations, inject tenantId field
        if (operation === 'create') {
          args.data = args.data || {};
          args.data.tenantId = context.tenantId;
        }

        if (operation === 'createMany') {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((item) => ({
              ...item,
              tenantId: context.tenantId,
            }));
          } else if (args.data) {
            args.data.tenantId = context.tenantId;
          }
        }

        // 6. For upsert operations, inject tenantId field
        if (operation === 'upsert') {
          args.where = args.where || {};
          args.where.tenantId = context.tenantId;
          args.create = args.create || {};
          args.create.tenantId = context.tenantId;
          args.update = args.update || {};
          args.update.tenantId = context.tenantId;
        }

        return query(args);
      },
    },
  },
});

export default prisma;
