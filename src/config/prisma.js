import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { getContext } from '../utils/context.utils.js';

const prismaRaw = new PrismaClient({
  datasourceUrl: env.DATABASE_URL,
  log: env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

const prisma = prismaRaw.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const context = getContext();

        // 1. Bypass tenant filtering if there's no active request context (e.g. signup, login, health checks)
        if (!context || !context.tenantId) {
          return query(args);
        }

        // 2. Bypass tenant filtering if the user is a platform SUPER_ADMIN (allows querying across all tenants)
        if (context.role === 'SUPER_ADMIN') {
          return query(args);
        }

        // 3. Do not intercept findUnique. Log a warning and proceed without modifications.
        // findUnique only accepts unique identifier structures in "where" and will error if non-unique fields like tenantId are injected.
        // Developers are instructed to use findFirst instead for multi-tenant scoped lookups.
        if (operation === 'findUnique') {
          console.warn(`[Prisma Warning]: findUnique was called on model "${model}". It bypasses multi-tenant scoping. Use findFirst instead.`);
          return query(args);
        }

        // 4. Scoping for read operations: Inject tenantId filter into where clause
        if (['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy'].includes(operation)) {
          args.where = args.where || {};
          args.where.tenantId = context.tenantId;
        }

        // 5. Scoping for write/delete operations: Inject tenantId filter into where clause to restrict modification/deletion
        if (['update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
          args.where = args.where || {};
          args.where.tenantId = context.tenantId;
        }

        // 6. Scoping for create operations: Inject tenantId into data object to bind entity to the active tenant
        if (operation === 'create') {
          args.data = args.data || {};
          args.data.tenantId = context.tenantId;
        }

        // 7. Scoping for batch create operations: Inject tenantId into all item objects inside the data array
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

        // 8. Scoping for upsert operations: Inject tenantId into where filter, create payload, and update payload
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
