import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

// Middleware imports
import { errorHandler } from './middleware/error.middleware.js';
import { rateLimiter } from './middleware/rate-limiter.middleware.js';

// Route imports
import authRoutes from './modules/auth/routes.js';
import employeeRoutes from './modules/employee/routes.js';
import attendanceRoutes from './modules/attendance/routes.js';
import leaveRoutes from './modules/leave/routes.js';
import notificationRoutes from './modules/notification/routes.js';
import departmentRoutes from './modules/department/routes.js';
import designationRoutes from './modules/designation/routes.js';
import dashboardRoutes from './modules/dashboard/routes.js';

import { env } from './config/env.js';

const app = express();

// Global Middlewares
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
    credentials: true,
    maxAge: 86400,
  })
);
app.use(express.json({ limit: '16kb' }));

// Log HTTP requests in development mode
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Global rate limiting
app.use(rateLimiter);

// Public Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'HRMS backend is operational',
    timestamp: new Date(),
  });
});

// Register Module Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/employees', employeeRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/leaves', leaveRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/departments', departmentRoutes);
app.use('/api/v1/designations', designationRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

// Catch 404 and forward to error handler
app.use((req, res, next) => {
  const error = new Error(`Cannot find requested route ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

// Centralized Error-Handling Middleware
app.use(errorHandler);

export default app;
