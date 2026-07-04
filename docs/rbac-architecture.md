# RBAC Architecture — Policy-based Authorization

## 1. Overview
In a multi-tenant environment, securing access to records based on user roles and data ownership boundaries is critical for security and compliance. This document details the **Policy-based Role-Based Access Control (RBAC)** architecture designed to isolate access control configuration from core business logic in the HRMS backend. The architecture avoids hardcoding role checks, delegating query filtering parameters directly to the routing layer. By resolving permissions into dynamic database filters, the system guarantees that data visibility rules are enforced cleanly at database boundary entry points.

## 2. Why not hardcode role checks in services
Hardcoding logic like check statements checking if a user has a specific role inside service layer methods creates a severe maintenance burden. First, access control rules become scattered across dozens of business files, making security audits difficult. Second, changing a role's capability requires code refactoring in multiple services rather than editing a single configuration mapping, introducing risks of regression. Finally, it makes services rigid and tightly coupled to the organization's current structure, rendering it impossible to expose reuse-focused service functions to multiple routes or roles safely without repeating security checks.

## 3. Core concepts
* **Resource**: A business domain entity being managed, specifically employee, leave, attendance, payroll, department, and designation.
* **Action**: An operations class performed on a resource, categorized as read, write, delete, or approve.
* **Scope**: A visibility boundary that translates into a query filter, defining whether a user can see all records in the tenant, direct reports only, their own records only, or none.
* **Policy**: The mapping of role plus resource plus action to a specific scope level.
* **scopeFilter**: A database query filter object generated dynamically based on the policy, attached to the request, and applied directly to the database query operations.

## 4. Architecture — how the 4 files work together
* `abilities.js`: Contains the permissions matrix defining how roles map to resources and action scopes, serving as the single source of truth for access control policies.
* `policy.engine.js`: The evaluation engine that reads user context, resource, and action to generate the correct database query filter or throw a 403 error.
* `authorize.middleware.js`: Express middleware that executes the policy engine and attaches the resolved database filter to the request object.
* `index.js`: Exposes the system through a single interface, reducing path coupling and keeping imports tidy.

Client Request -> `auth.middleware.js` -> `authorize.middleware.js` -> `policy.engine.js` -> `abilities.js` -> Controller -> Service -> Database

## 5. Permission matrix
| Role | Resource | Read | Write | Delete | Approve |
|---|---|---|---|---|---|
| **ADMIN** | employee | ✓ all | ✓ all | ✓ all | ✗ |
| **ADMIN** | leave | ✓ all | ✓ all | ✗ | ✓ all |
| **ADMIN** | attendance | ✓ all | ✓ all | ✗ | ✗ |
| **ADMIN** | payroll | ✓ all | ✓ all | ✗ | ✗ |
| **ADMIN** | department | ✓ all | ✓ all | ✓ all | ✗ |
| **ADMIN** | designation | ✓ all | ✓ all | ✓ all | ✗ |
| **HR** | employee | ✓ all | ✓ all | ✗ | ✗ |
| **HR** | leave | ✓ all | ✓ all | ✗ | ✓ all |
| **HR** | attendance | ✓ all | ✗ | ✗ | ✗ |
| **HR** | payroll | ✓ all | ✗ | ✗ | ✗ |
| **HR** | department | ✓ all | ✓ all | ✗ | ✗ |
| **HR** | designation | ✓ all | ✓ all | ✗ | ✗ |
| **MANAGER** | employee | ✓ team | ✗ | ✗ | ✗ |
| **MANAGER** | leave | ✓ team | ✗ | ✗ | ✓ team |
| **MANAGER** | attendance | ✓ team | ✗ | ✗ | ✗ |
| **MANAGER** | payroll | ✗ | ✗ | ✗ | ✗ |
| **MANAGER** | department | ✓ all | ✗ | ✗ | ✗ |
| **MANAGER** | designation | ✓ all | ✗ | ✗ | ✗ |
| **EMPLOYEE** | employee | ✓ self | ✓ self | ✗ | ✗ |
| **EMPLOYEE** | leave | ✓ self | ✓ self | ✗ | ✗ |
| **EMPLOYEE** | attendance | ✓ self | ✓ self | ✗ | ✗ |
| **EMPLOYEE** | payroll | ✓ self | ✗ | ✗ | ✗ |
| **EMPLOYEE** | department | ✓ all | ✗ | ✗ | ✗ |
| **EMPLOYEE** | designation | ✓ all | ✗ | ✗ | ✗ |

## 6. Request lifecycle — step by step
1. The client request containing the authorization header arrives at the server.
2. The authentication middleware validates the JWT and attaches the verified user payload containing role and employee ID properties to the request object.
3. The authorization middleware executes the policy engine using the request's user payload to resolve the target scope level.
4. The policy engine matches the user's role against the resource abilities configuration to construct the correct query scope filter.
5. The controller intercepts the request, receives the scope filter, and passes it directly to the service layer without any role checks.
6. The service layer receives the scope filter and spreads it into the database query to restrict returned data rows.

## 7. How scopeFilter works per role
* **ADMIN**: When retrieving leaves, the administrator context resolves to an empty filter, allowing them to view all leaves in the active tenant. The database filter built is empty, which bypasses any scoping constraints. They will get a 403 Forbidden error only on operations explicitly marked as none, such as attempting to delete leave records.
* **HR**: When calling leaves, the human resources role resolves to an empty filter, granting full read access to all tenant records. The database filter built is empty, which enables cross-employee viewing. They will receive a 403 Forbidden error on operations like deleting payroll or leaves, where the ability matrix restricts their role to none.
* **MANAGER**: When fetching leaves, the manager role resolves to direct reports only, preventing them from viewing leaves of employees outside their hierarchy. The database filter built is a nested employee relation checking that the manager ID matches the manager's employee ID. They will get a 403 Forbidden error when trying to read or write payroll data, which is completely blocked for their role.
* **EMPLOYEE**: When calling leaves, the standard employee role resolves to their own records only, protecting sensitive peer data. The database filter built is a flat employee ID comparison matching the employee's ID. They will receive a 403 Forbidden error on operations like deleting leaves or approving any records, which are restricted to none.

## 8. Adding a new role — how to do it
To add a new role, you only need to modify `abilities.js`.
1. Open `abilities.js`.
2. Add a new key for the role to the abilities object.
3. Map every system resource to its action scopes (all, team, self, none).
Because the policy engine dynamically reads keys directly from this matrix at runtime, the new role becomes immediately active across all middlewares and routes without further code changes.

## 9. Adding a new resource — how to do it
To add a new resource:
1. Open `abilities.js`.
2. Add the new resource name key under every role's capability object.
3. Define the actions (read, write, delete, approve) and their corresponding scope levels (all, team, self, none) for each role.
Once mapped, you can protect new endpoints by declaring the authorization middleware in the routes file.

## 10. What does NOT belong in the RBAC layer
The RBAC layer is strictly limited to authorization scoping and should not take on other logic responsibilities. Business validation rules, such as checking if an employee has enough leave balance before applying, belong in the service layer. Data existence checks, which verify if a specific record ID actually exists in the database, and duplicate prevention checks must also remain in the service layer. Keeping these separate ensures the authorization middleware is fast, stateless, and focused.

## 11. Monolith → Microservices compatibility
The authorization middleware works identically in both monolithic and microservices phases because it reads user properties exclusively from `req.user`. In the monolithic phase, the user payload is validated and attached by `auth.middleware.js` via the JWT claims. In the microservices phase, the API Gateway verifies the JWT and passes user properties in headers, which are parsed and attached to `req.user` by `tenant.middleware.js`, keeping the routing layer unchanged.

## 12. Interview talking points
* We designed a policy-based authorization system that decouples access control from business logic, ensuring service files contain zero role checks.
* By translating user roles into dynamic database query filters at the middleware level, we eliminated the risk of SQL-based cross-tenant data leaks.
* The authorization middleware relies entirely on standard request context properties, making it compatible for future microservice extraction without modification.

The policy-based RBAC system resolves user roles into dynamic database filters at the middleware boundary, decoupling security from business logic.
