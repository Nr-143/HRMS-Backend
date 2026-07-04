# Multi-Tenancy Strategy: Shared Database with Row-Level Isolation

This document outlines the multi-tenancy strategy implemented in the HRMS backend. It details how the tenant context (`tenantId` / `companyId`) is isolated at the database, middleware, query wrapper, and caching layers to prevent cross-tenant data leaks, while still accommodating administrative access.

---

## 1. Schema Design & Query Separation

In a **shared schema, row-level isolation** model, all tenant data resides in the same database tables. To segregate this data, every model representing tenant-specific resources contains a `tenantId` column referencing the `Tenant` table.

### Prisma Schema Definition (`prisma/schema.prisma` snippet)

```prisma
model Tenant {
  id          String       @id @default(uuid())
  name        String
  domain      String?      @unique
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  users       User[]
  employees   Employee[]
  attendances Attendance[]
  leaves      Leave[]

  @@map("tenants")
}

model Employee {
  id          String       @id @default(uuid())
  firstName   String
  lastName    String
  department  String?
  userId      String?      @unique
  user        User?        @relation(fields: [userId], references: [id], onDelete: SetNull)
  tenantId    String
  tenant      Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  attendances Attendance[]
  leaves      Leave[]

  @@map("employees")
}
```

Every query executed against tenant-isolated models MUST include a `where: { tenantId }` clause. 

Instead of relying on developers to manually write this filter (which is error-prone and leads to leaks), we automate this scoping at the Prisma client level using context propagation and query interception.

---

## 2. JWT Middleware & Context Propagation (`AsyncLocalStorage`)

To decouple controllers and services from having to know or pass around the `tenantId`, we extract it from the JWT payload during authentication and store it in an active execution context using Node.js's built-in **`AsyncLocalStorage`**.

### Execution Context Utility (`src/utils/context.utils.js`)

```javascript
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Singleton instance of AsyncLocalStorage to track request-scoped context
 * (such as tenantId, userId, and role) across asynchronous execution flows.
 * @type {AsyncLocalStorage<{ tenantId: string, userId: string, role: string }>}
 */
export const contextStorage = new AsyncLocalStorage();

/**
 * Retrieves the current request context from the active store.
 *
 * @returns {{ tenantId: string, userId: string, role: string }|null} The current store context object, or null if called outside an active execution context.
 */
export const getContext = () => {
  return contextStorage.getStore() || null;
};

/**
 * Wraps execution of a function in a new asynchronous context.
 *
 * @param {{ tenantId: string, userId: string, role: string }} context - The context object to store.
 * @param {Function} fn - The callback function to execute within the context.
 * @returns {*} The return value of the executed callback function.
 */
export const runWithContext = (context, fn) => {
  return contextStorage.run(context, fn);
};

/**
 * Shortcut helper to retrieve the tenant ID from the current context.
 *
 * @returns {string|null} The tenant ID string, or null if called outside a context or if tenantId is missing.
 */
export const getTenantId = () => {
  return getContext()?.tenantId ?? null;
};

/**
 * Shortcut helper to retrieve the user's role from the current context.
 *
 * @returns {string|null} The user's role string, or null if called outside a context or if role is missing.
 */
export const getRole = () => {
  return getContext()?.role ?? null;
};
```

### Authentication Middleware (`src/middleware/auth.middleware.js`)

The middleware verifies the incoming JWT, extracts tenant and user properties, and runs downstream route operations within the storage execution context using the `runWithContext` helper.

```javascript
import { authService } from '../modules/auth/index.js';
import { UnauthorizedError } from '../utils/error.utils.js';
import { runWithContext } from '../utils/context.utils.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token is missing or malformed');
    }

    const token = authHeader.split(' ')[1];
    const userPayload = await authService.verifySession(token);

    // Bind authentication data to the request object
    req.user = userPayload;

    // Optional cross-check: If client supplied a tenant header, ensure it matches the token claim
    if (req.tenantId && req.tenantId !== userPayload.tenantId) {
      throw new UnauthorizedError('Cross-tenant data access is forbidden');
    }

    // Run subsequent request steps (controllers, services, queries) inside AsyncLocalStorage context
    runWithContext({
      id: userPayload.sub,
      userId: userPayload.sub,
      tenantId: userPayload.tenantId,
      role: userPayload.role,
    }, () => {
      next();
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Access token has expired or is invalid'));
    }
    next(error);
  }
};
```

---

## 3. Reusable Prisma Query Wrapper (Prisma Client Extension)

We leverage **Prisma Client Extensions** (`$extends`) to intercept all model operations. The extension automatically extracts the active `tenantId` from `AsyncLocalStorage` and overrides the query arguments before execution.

This is set up globally in the Prisma config.

### Extended Prisma Client (`src/config/prisma.js`)

```javascript
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
```

---

## 4. Preventing Cross-Tenant Data Leaks

### The Leak Vulnerability (Without Query Wrapper)

Consider a scenario where the application updates employee information by parsing the ID from the route params:

```javascript
// VULNERABLE CODE: Controller parses ID, Service updates directly
async updateEmployee(employeeId, updatedData) {
  // If employeeId is a random UUID from another tenant, Prisma executes the write!
  // Any authenticated user can modify other companies' employees by guessing/harvesting UUIDs.
  return await prisma.employee.update({
    where: { id: employeeId },
    data: updatedData
  });
}
```

Similarly, fetching a single record:

```javascript
// VULNERABLE CODE: Fetching by unique ID
async getEmployeeById(employeeId) {
  // Returns employee data even if it belongs to tenant B and current user is in tenant A!
  return await prisma.employee.findUnique({
    where: { id: employeeId }
  });
}
```

### The Automatic Fix (With Query Wrapper)

When the Prisma Client extension is active:
1. `prisma.employee.findFirst({ where: { id: employeeId } })` intercepts the call.
2. It rewrites the query parameters under the hood:
   ```javascript
   args.where = {
     id: employeeId,
     tenantId: "active-tenant-uuid-from-context"
   }
   ```
3. If `employeeId` belongs to another tenant, the query returns `null` or throws a `NotFoundError` rather than accessing cross-tenant data.

For write/delete actions, `prisma.employee.update({ where: { id: employeeId }, data })` is rewritten to filter by `tenantId` in the `where` block, ensuring no update occurs if the ID belongs to another tenant.

---

## 5. Caching and Multi-Tenancy

When introducing performance caching via Redis, data leaks can still happen if key naming is not isolated. If Tenant A caches `employees:list`, and Tenant B requests the list and hits the cache, they will receive Tenant A's data.

To resolve this, cache keys are automatically prefix-scoped based on context:

```javascript
// src/utils/cache.utils.js snippet
export const cache = {
  getScopedKey(key) {
    const context = getContext();
    const tenantId = context?.tenantId;
    if (!tenantId) {
      return `global:${key}`;
    }
    return `tenant:${tenantId}:${key}`; // E.g. tenant:uuid-1234:employees:list
  }
};
```

---

## 6. Super Admin Operations

There are times when platform administrators (`SUPER_ADMIN` role) need to query across multiple companies (e.g. system dashboards, global reporting, onboarding new tenants).

The Prisma Extension addresses this elegantly:

```javascript
// If user is a SUPER_ADMIN, we return the query raw, bypassing filter injection
if (context.role === 'SUPER_ADMIN') {
  return query(args);
}
```

This allows a platform-wide admin to execute global queries, while ordinary tenant admins, managers, and employees remain strictly isolated within their own rows.

---

## 7. Flow Walkthrough: GET /employees

Here is how a request traverses the backend, from the Express route to the scoped database response:

### 1. Express Router Setup (`src/modules/employee/routes.js`)

```javascript
import { Router } from 'express';
import { getAllEmployees } from './controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';

const router = Router();

// Apply security and tenant separation middleware
router.get('/', authenticate, tenantResolver, getAllEmployees);

export default router;
```

### 2. Controller Layer (`src/modules/employee/controller.js`)

```javascript
import { employeeService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';

export const getAllEmployees = async (req, res, next) => {
  try {
    // Controllers have no awareness of tenantId, keeping code clean and simple.
    const result = await employeeService.getAllEmployees();
    sendSuccess(res, result, 'Employees listed successfully', 200);
  } catch (error) {
    next(error);
  }
};
```

### 3. Service Layer (`src/modules/employee/service.js`)

```javascript
import { cache } from '../../utils/cache.utils.js';

class EmployeeService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  async getAllEmployees() {
    const cacheKey = 'employees:list';

    // 1. Checks tenant-scoped Redis key: e.g. "tenant:tenant-uuid-123:employees:list"
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    // 2. Client extension intercepts findMany and appends `{ tenantId: activeTenantId }`
    const employees = await this.prisma.employee.findMany({
      orderBy: { lastName: 'asc' },
    });

    // 3. Cache the scoped result
    await cache.set(cacheKey, employees, 300);
    return employees;
  }
}
```
