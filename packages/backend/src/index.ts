import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { PORT, CORS_ORIGIN, NODE_ENV } from './config';
import authRoutes from './routes/auth';
import electionRoutes from './routes/elections';
import voteRoutes from './routes/votes';
import adminRoutes from './routes/admin';
import statsRoutes from './routes/stats';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Logger setup
const logger = pino({
  level: NODE_ENV === 'production' ? 'info' : 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

app.use(pinoHttp({ logger }));

// Security Middleware
app.use(helmet());

// CORS Configuration
app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request Body Parsing
app.use(express.json());

// Request Logging (for non-pino-http)
if (NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/elections', electionRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stats', statsRoutes);

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Not Found Handler
app.use((_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({ message: 'Not Found' });
});

// Error Handling Middleware
app.use(errorHandler);

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${NODE_ENV} mode`);
  logger.info(`CORS enabled for origin: ${CORS_ORIGIN}`);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  server.close(() => {
    process.exit(1);
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  server.close(() => {
    process.exit(1);
  });
});
