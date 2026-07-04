# Multi-Tenancy & Role Architecture

This document explains exactly how tenant isolation, account ownership, and role-based access control work in the HRMS backend after the two-layer identity upgrade.

---

## 1. Core Principle: Shared Database, Row-Level Isolation

All tenants share a single PostgreSQL database. Every tenant-scoped table (employees, users, leaves, attendances, departments, designations) contains a `tenantId` foreign key pointing to the `tenants` table. No query ever crosses tenant boundaries unless the caller is a platform-level `SUPER_ADMIN`.

### How isolation is enforced

- A **Prisma Client Extension** intercepts every database operation at the query level.
- It reads the active `tenantId` from Node.js `AsyncLocalStorage` (set by the authentication middleware when a JWT is verified).
- For read operations (`findMany`, `findFirst`, `count`, etc.), it injects `where: { tenantId }` automatically.
- For write operations (`create`, `update`, `delete`), it injects or validates `tenantId` in the data/where clause.
- For `findUnique`, it logs a warning — developers must use `findFirst` for tenant-scoped lookups because `findUnique` only accepts unique identifier fields and cannot accept `tenantId` injection.

This means **no controller or service ever needs to manually pass `tenantId`**. The query wrapper handles it invisibly.

---

## 2. Two-Layer Identity Model

The system separates **account ownership** (who owns and pays for the tenant) from **HR permissions** (what the user can do inside the HR system). This follows the pattern used by BambooHR, Zoho People, and greytHR.

### Layer 1: Ownership (`isOwner` flag on User)

The `isOwner` field is a boolean on the User table. It is set to `true` only for the very first user who registers a tenant. This flag **never changes** — even if the user's role is later changed to HR or EMPLOYEE, `isOwner` remains `true`.

What `isOwner` controls:

- Access to billing and subscription management
- Ability to delete the entire company account
- Ability to transfer ownership to another user
- Cannot be deleted or demoted by anyone — not even by another ADMIN

What `isOwner` does NOT control:

- Day-to-day HR permissions (those come from the role)

The `isOwner` flag is never set via any API endpoint. It is only assigned internally during the registration transaction.

### Layer 2: HR Role (`role` field on User)

The `role` field determines what the user can do inside the HR system. The available roles, in order of authority:

| Role | Description |
|------|-------------|
| **SUPER_ADMIN** | Platform-level administrator. Can query across all tenants. Not tied to any single company. |
| **OWNER_ADMIN** | The account owner. Has all ADMIN permissions plus billing, account deletion, and ownership transfer. Cannot be deleted by anyone. |
| **ADMIN** | Full HR administrative access within the tenant. Can manage all employees, departments, designations, leaves, and payroll. Can be deleted by the owner. |
| **HR** | Can read and write employee data, approve leaves, and manage departments/designations. Cannot delete employees or access payroll writes. |
| **MANAGER** | Can only read data for their direct reports (team scope). Can approve leaves for their team. No access to payroll. |
| **EMPLOYEE** | Can only read and write their own records (self scope). No access to other employees' data. |

---

## 3. What Happens at Registration

When a new company registers, the system creates **six records** inside a single atomic database transaction. If any step fails, the entire registration is rolled back — no partial data is ever left behind.

### Transaction sequence

1. **Tenant** — The company record is created with a TRIAL subscription status, FREE plan, a 14-day trial expiration date, and a default limit of 5 employees.

2. **Department ("Management")** — A default department named "Management" is auto-created for the tenant. The owner can rename this later. This follows the greytHR pattern to ensure the first user is never a "zombie" without a department.

3. **Designation ("Administrator")** — A default designation named "Administrator" is auto-created for the tenant. The owner can rename this later.

4. **User** — The first user is created with role `OWNER_ADMIN` and `isOwner: true`. Their password is hashed with bcrypt (10 salt rounds) before the transaction starts, never inside it.

5. **Employee Code Generation** — The system counts existing employees for this tenant (always 0 for a new company), extracts the first two uppercase letters from the company name (e.g., "Acme Corporation" → "AC"), and generates a serial code like `AC-001`. This count happens inside the transaction, making it safe under concurrent requests because PostgreSQL serializes transaction reads.

6. **Employee** — A complete employee profile is created for the registering user, linked to the User record, the Tenant, the default Department, and the default Designation. The employee has no manager (`managerId: null`) since they are the first person in the organization.

### After the transaction

- An **access token** (JWT) is signed containing: `userId`, `tenantId`, `role` (OWNER_ADMIN), `employeeId`, `subscriptionStatus`, `plan`, and `trialEndsAt`.
- A **refresh token** is signed with just the `userId`.
- The refresh token is stored in Redis under the key `refresh:{userId}` with a 7-day TTL.

---

## 4. How the Role System Works at Runtime

### Authentication flow (every request)

1. The client sends a Bearer token in the Authorization header.
2. The authentication middleware verifies the JWT and extracts the payload (`userId`, `tenantId`, `role`, `employeeId`).
3. These values are stored in `AsyncLocalStorage` so they are available to every function in the request chain without being explicitly passed.
4. The Prisma query wrapper reads `tenantId` from this storage and auto-scopes every query.

### Authorization flow (protected routes)

1. The `authorize` middleware checks if the user's role has permission for the requested resource and action.
2. It looks up the **abilities map** — a matrix that maps each role to each resource (employee, leave, attendance, payroll, department, designation) and each action (read, write, delete, approve).
3. Each entry resolves to a **scope level**:
   - `all` — Access all records within the tenant (empty filter)
   - `team` — Access only records of direct reports (filter by `managerId`)
   - `self` — Access only the user's own records (filter by `employeeId`)
   - `none` — Access denied (returns 403 Forbidden)
4. The resolved scope filter is attached to `req.scopeFilter` and passed to the service layer, which applies it as an additional Prisma `where` clause.

### Role capabilities matrix

| Role | Read Employees | Write Employees | Delete Employees | Approve Leaves | Read Payroll | Write Payroll | Manage Departments |
|------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **OWNER_ADMIN** | all | all | all | all | all | all | all |
| **ADMIN** | all | all | all | all | all | all | all |
| **HR** | all | all | ✗ | all | all | ✗ | all |
| **MANAGER** | team | ✗ | ✗ | team | ✗ | ✗ | read only |
| **EMPLOYEE** | self | self | ✗ | ✗ | self | ✗ | read only |

The key difference between `OWNER_ADMIN` and `ADMIN` is not in day-to-day HR operations — both have full access. The difference is in **destructive and billing operations**: only `OWNER_ADMIN` can delete the company account, manage billing, transfer ownership, and delete leave/attendance/payroll records. An `ADMIN` can never be promoted to `OWNER_ADMIN` through any API call — only ownership transfer (by the current owner) can do this.

---

## 5. Protection Against Owner Deletion and Demotion

The service layer enforces a critical guard: before any delete or role-change operation on a user or employee, the system checks whether the target user has `isOwner: true`. If they do, the operation is rejected with a 403 Forbidden error regardless of who is requesting it.

This means:

- An ADMIN cannot delete the owner's employee record
- An ADMIN cannot change the owner's role to EMPLOYEE
- The owner cannot accidentally delete themselves
- Only the owner can initiate an ownership transfer, which is a dedicated endpoint that atomically sets `isOwner: false` on the current owner and `isOwner: true` + `role: OWNER_ADMIN` on the target user

---

## 6. Preventing Cross-Tenant Data Leaks

### Database level

The Prisma Client Extension intercepts every query and injects `tenantId` automatically. Even if a malicious user guesses a UUID from another tenant and sends it in a request, the query will include `AND tenantId = 'their-own-tenant'`, which will return no results.

### Cache level

Redis cache keys are automatically prefixed with the tenant ID. When Tenant A caches `employees:list`, the actual Redis key becomes `tenant:{tenantA-uuid}:employees:list`. When Tenant B requests the same data, it looks up `tenant:{tenantB-uuid}:employees:list` — a completely different key. No cross-contamination is possible.

### JWT level

The authentication middleware performs a cross-tenant safety check: if a `tenantId` has already been resolved on the request (e.g., from a URL parameter), it must match the `tenantId` in the JWT payload. If they don't match, the request is rejected immediately.

---

## 7. SUPER_ADMIN: Platform-Level Access

The `SUPER_ADMIN` role is a platform-level administrator who is not tied to any single tenant. When the Prisma query wrapper detects that the context role is `SUPER_ADMIN`, it skips tenant filtering entirely, allowing global queries across all companies.

This role is used for:

- System dashboards and global reporting
- Onboarding new tenants manually
- Debugging cross-tenant issues
- Platform-wide analytics

`SUPER_ADMIN` users are never created through the registration flow. They are seeded directly into the database by the platform engineering team.

---

## 8. Request Lifecycle: Complete Walkthrough

Here is the complete journey of a `GET /api/employees` request from the HTTP layer to the database response:

1. **Express Router** — The request hits the route, which is protected by `authenticate` and `authorize` middleware.

2. **Authentication Middleware** — Verifies the JWT, extracts `userId`, `tenantId`, `role`, and `employeeId`. Stores them in `AsyncLocalStorage`. Attaches the payload to `req.user`.

3. **Authorization Middleware** — Looks up the user's role in the abilities map for the `employee:read` action. Resolves the scope (`all`, `team`, or `self`) and attaches the corresponding Prisma filter to `req.scopeFilter`.

4. **Controller** — Calls the service method, passing `req.scopeFilter` as a parameter. The controller has zero knowledge of `tenantId` or role logic.

5. **Service** — Checks Redis cache first (using a tenant-scoped key). If cache miss, calls `prisma.employee.findMany()` with the scope filter from the controller.

6. **Prisma Client Extension** — Intercepts the `findMany` call. Reads `tenantId` from `AsyncLocalStorage`. Injects `where: { tenantId }` into the query arguments. Executes the modified query.

7. **PostgreSQL** — Returns only rows matching both the scope filter and the tenant filter.

8. **Response** — The service caches the result in Redis (under a tenant-scoped key) and returns it to the controller, which sends it as a JSON response.

At no point in this chain does any developer need to manually write `where: { tenantId }`. The system enforces it automatically at every layer.

---

## 9. Subscription & Plan Context

The JWT access token contains subscription metadata: `subscriptionStatus`, `plan`, and `trialEndsAt`. This allows middleware to enforce plan-level restrictions (e.g., blocking features on the FREE plan, showing trial expiration warnings) without additional database lookups on every request.

| Plan | Max Employees | Features |
|------|:-:|---|
| **FREE** | 5 | Core HR, basic attendance, leaves |
| **STARTER** | 25 | + Payroll, advanced reporting |
| **PRO** | Unlimited | + API access, custom integrations |

When a tenant's trial expires (14 days after registration), the `subscriptionStatus` transitions from `TRIAL` to `EXPIRED` unless they upgrade to a paid plan. Expired tenants can still log in and view data, but write operations are blocked by subscription middleware.

---

## 10. User Flows: Auth API Endpoints

The auth module exposes four endpoints under `/api/v1/auth`. Two are public (no token required), and two require a valid Bearer token.

---

### Flow 1: Register a New Company — `POST /api/v1/auth/register-tenant`

**Who can call it:** Anyone (public endpoint, no authentication required).

**What the client sends:**

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| companyName | string | ✓ | 2–100 characters |
| domain | string | ✗ | Optional, unique across all tenants |
| firstName | string | ✓ | 1–50 characters |
| lastName | string | ✓ | 1–50 characters |
| email | string | ✓ | Must be a valid email, unique globally |
| password | string | ✓ | Min 8 chars, must contain uppercase, number, and special character |

**What the system does (inside a single atomic transaction):**

1. Creates the **Tenant** record with TRIAL subscription, FREE plan, 14-day trial window, and a 5-employee limit.
2. Creates a default **Department** named "Management" for the tenant.
3. Creates a default **Designation** named "Administrator" for the tenant.
4. Creates the **User** with role `OWNER_ADMIN` and `isOwner: true`. Password is bcrypt-hashed before the transaction starts.
5. Generates a serial **employee code** by counting existing employees for this tenant (always 0 for a new company), extracting company initials (first two uppercase letters of the company name), and formatting as `XX-001`.
6. Creates a complete **Employee** profile linked to the User, Tenant, Management department, and Administrator designation. No manager is set since this is the first person.

**What the system returns after the transaction:**

- `accessToken` — JWT containing userId, tenantId, role (OWNER_ADMIN), employeeId, subscriptionStatus, plan, and trialEndsAt. Expires per `JWT_ACCESS_EXPIRES` env variable (default 15 minutes).
- `refreshToken` — JWT containing only userId. Expires per `JWT_REFRESH_EXPIRES` env variable (default 7 days). Stored in Redis under `refresh:{userId}`.
- `tenant` — id, name, domain, subscriptionStatus, plan, trialEndsAt.
- `user` — id, email, role.
- `employee` — id, firstName, lastName, employeeCode.

**Error scenarios:**

| Condition | Status | Code |
|-----------|:------:|------|
| Email already registered | 409 | `EMAIL_EXISTS` |
| Domain already taken | 409 | `DOMAIN_EXISTS` |
| Validation fails (weak password, missing fields) | 400 | Zod validation errors |
| Any other database error | 500 | `REGISTRATION_FAILED` |

---

### Flow 2: Login — `POST /api/v1/auth/login`

**Who can call it:** Anyone (public endpoint, no authentication required).

**What the client sends:**

| Field | Type | Required |
|-------|------|:--------:|
| email | string | ✓ |
| password | string | ✓ |

**What the system does:**

1. Looks up the User by email. If not found, returns 401.
2. Compares the provided password against the bcrypt hash stored in the database. If mismatch, returns 401.
3. Queries the Employee table to find the associated employee profile for this user. Extracts the `employeeId` (or null if no employee record exists).
4. Signs a JWT access token containing userId, tenantId, role, and employeeId.
5. Caches the token in Redis under `sess:{userId}` with the configured session TTL for session validation on subsequent requests.

**What the system returns:**

- `token` — The signed JWT access token.
- `user` — id, email, role, tenantId, employeeId.

**Error scenarios:**

| Condition | Status | Message |
|-----------|:------:|---------|
| Email not found | 401 | Invalid email or password |
| Wrong password | 401 | Invalid email or password |

The system deliberately uses the same error message for both cases to prevent email enumeration attacks.

---

### Flow 3: Get Profile — `GET /api/v1/auth/me`

**Who can call it:** Any authenticated user (requires Bearer token in Authorization header).

**What the system does:**

1. The authentication middleware verifies the JWT, confirms the session still exists in Redis, and attaches the decoded payload to `req.user`.
2. The controller calls `authService.getProfile(userId)` which performs a single database query with nested includes.
3. The query fetches the User record along with the related Employee (including department, designation, and manager), and the Tenant.

**What the system returns:**

- `user` — id, email, role, isOwner, isActive, createdAt.
- `employee` — id, firstName, lastName, employeeCode, phone, dateOfJoining, isActive, plus nested department (id, name), designation (id, name), and manager (id, firstName, lastName, employeeCode). Returns `null` if no employee profile is linked.
- `tenant` — id, name, domain, subscriptionStatus, plan, trialEndsAt, maxEmployees.

This endpoint is designed for the frontend to hydrate the user's session on app load — it provides everything the UI needs in a single call: who the user is, what company they belong to, their employee details, their department, their designation, and their reporting manager.

**Error scenarios:**

| Condition | Status | Message |
|-----------|:------:|---------|
| Token missing or malformed | 401 | Access token is missing or malformed |
| Token expired or invalid | 401 | Access token has expired or is invalid |
| Session not in Redis (logged out) | 401 | Session has expired or is logged out |
| User record deleted after token was issued | 401 | User not found |

---

### Flow 4: Logout — `POST /api/v1/auth/logout`

**Who can call it:** Any authenticated user (requires Bearer token in Authorization header).

**What the system does:**

1. The authentication middleware verifies the JWT and extracts userId from the payload.
2. The controller calls `authService.logout(userId)` which deletes the session key `sess:{userId}` from Redis.
3. Any subsequent request using the same token will fail at the session validation step (Redis lookup returns null), effectively invalidating the token server-side even though the JWT itself hasn't expired.

**What the system returns:**

- `null` data with message "Logged out successfully".

This is a server-side session invalidation approach. The JWT itself remains cryptographically valid until it expires, but the Redis session check blocks it from being used.

---

### Flow 5: Forgot Password (Request OTP) — `POST /api/v1/auth/forgot-password`

**Who can call it:** Anyone (public endpoint, no authentication required).

**What the client sends:**

| Field | Type | Required |
|-------|------|:--------:|
| email | string | ✓ |

**What the system does:**

1. Validates input formatting and checks if a user account is registered with the email.
2. Generates a cryptographically strong, 6-digit numeric OTP code.
3. Saves the OTP in Redis under the key `otp:forget-password:${email}` with a 5-minute (300-second) TTL.
4. Dispatches an email notification containing the OTP to the user's address. (Fallback mock log generated in dev environments).

**What the system returns:**

- `email` — The destination email address.

---

### Flow 6: Reset Password with OTP — `POST /api/v1/auth/reset-password`

**Who can call it:** Anyone (public endpoint, no authentication required).

**What the client sends:**

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| email | string | ✓ | Must be a valid email |
| otp | string | ✓ | Exactly 6 numeric digits |
| newPassword | string | ✓ | Min 8 chars, must contain uppercase, number, and special character |

**What the system does:**

1. Fetches the OTP code associated with the email from Redis.
2. Compares the submitted code with the cached value. If they do not match or if the OTP has expired (over 5 minutes), rejects with `401 Unauthorized`.
3. Bcrypt-hashes the new password (10 salt rounds) and updates the User record in the database.
4. Deletes the OTP code from Redis immediately upon success to prevent replay attacks.
5. Invalidates any cached session token in Redis to force the user to re-authenticate using their new credentials across all devices.

**What the system returns:**

- `null` data with message "Password reset successfully".

---

### Flow 7: Change Password (Authenticated) — `POST /api/v1/auth/change-password`

**Who can call it:** Any authenticated user (requires Bearer token in Authorization header).

**What the client sends:**

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| currentPassword | string | ✓ | Must match the active password |
| newPassword | string | ✓ | Min 8 chars, must contain uppercase, number, and special character |

**What the system does:**

1. Fetches the authenticated user profile using the `userId` in `AsyncLocalStorage` context.
2. Compares `currentPassword` with the stored bcrypt password hash. If mismatch, rejects with `401 Unauthorized`.
3. Hashes the `newPassword` and saves it to the database.
4. Evicts the user's active session from the Redis cache (`sess:${userId}`), forcing all existing client instances to prompt for re-authentication.

**What the system returns:**

- `null` data with message "Password changed successfully".

---

## 11. Context Storage: What Flows Through Every Request

After authentication, the middleware stores the following fields in `AsyncLocalStorage`, making them available to every function in the async call chain without explicit parameter passing:

| Field | Source | Used By |
|-------|--------|---------|
| `id` / `userId` | JWT `sub` claim | Service layer for user-specific operations |
| `tenantId` | JWT `tenantId` claim | Prisma query wrapper for automatic row-level isolation |
| `role` | JWT `role` claim | RBAC abilities map for scope resolution |
| `employeeId` | JWT `employeeId` claim | Scope filters for team/self access patterns |

This context is the backbone of the entire multi-tenancy and RBAC system. Every database query, every cache key, and every authorization decision flows from these four values.
