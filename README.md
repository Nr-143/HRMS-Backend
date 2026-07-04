# HRMS Backend

This is the backend service for the HRMS (Human Resource Management System) built with a modular monolith architecture using Node.js, Express, Prisma, PostgreSQL, and Redis.

## Getting Started

### 1. Prerequisites
- **Node.js** (v18 or higher recommended)
- **PostgreSQL** instance running
- **Redis** instance running

### 2. Environment Setup
Copy the `.env.example` file to `.env` and fill in your connection credentials:
```bash
cp .env.example .env
```

### 3. Installation
Install the project dependencies:
```bash
npm install
```

### 4. Database Setup & Migrations
Synchronize your schema with PostgreSQL using Prisma:
```bash
# Validate Prisma schema
npx prisma validate

# Generate Prisma Client classes
npm run prisma:generate

# Generate and execute migrations
npm run prisma:migrate
```

### 5. Running the Application
To run the server in development mode with automatic restarts on code changes:
```bash
npm run dev
```

To run the server in production mode:
```bash
npm start
```

---

## Architectural Guidelines

This project strictly adheres to a **Modular Monolith** pattern. Developers must follow these guidelines:

1. **Domain Boundary Isolation**: Each domain module (e.g. `auth`, `employee`, `attendance`, `leave`, `notification`) must be isolated. No cross-module imports are allowed except through the public facade at `src/modules/<module-name>/index.js`.
2. **Class Usage Boundary**: ES6 classes are allowed **only** in the Service Layer (`service.js`). Controllers, middlewares, and routers are functional.
3. **No DI Container Frameworks**: Dependency injection is handled manually within each module's `index.js` facade by passing singletons to the constructor (e.g. `new AuthService(prisma, redis)`).
4. **Prisma & DB Boundaries**: Only the service layer (`service.js`) is allowed to import or interact with the database (Prisma) or Cache (Redis) clients.
5. **API Responses**: Controllers must return responses formatted via `src/utils/response.utils.js` (using `sendSuccess` or bubbling errors to `next(error)`).
