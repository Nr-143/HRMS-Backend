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
import quoteRoutes from './modules/quote/routes.js';
import roleRoutes from './modules/role/routes.js';
import controlPanelRoutes from './modules/control-panel/routes.js';

import { env } from './config/env.js';

const app = express();

// Global Middlewares
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      const allowed = env.CORS_ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8081',
        'http://localhost:8080',
      ];
      if (allowed.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS origin forbidden'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Requested-With'],
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
app.use('/api/v1/quotes', quoteRoutes);
app.use('/api/v1/roles', roleRoutes);
app.use('/api/v1/users', roleRoutes);
app.use('/api/v1/control-panel', controlPanelRoutes);

// Catch 404 and forward to error handler
app.use((req, res, next) => {
  const error = new Error(`Cannot find requested route ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

// Centralized Error-Handling Middleware
app.use(errorHandler);

export default app;
