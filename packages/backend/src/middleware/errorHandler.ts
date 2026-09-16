import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import pino from 'pino';

const logger = pino();

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation error',
      errors: err.errors.map(e => ({ path: e.path, message: e.message }))
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }

  // Generic error handler
  res.status(500).json({ message: 'Internal Server Error' });
};
