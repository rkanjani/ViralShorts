import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { isDev } from '../config/index.js';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Zod validation errors
  if (err instanceof ZodError) {
    const errors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    res.status(400).json({
      success: false,
      error: 'Validation error',
      details: errors,
    });
    return;
  }

  // Firebase auth errors
  if (err.message?.includes('Firebase')) {
    res.status(401).json({
      success: false,
      error: 'Authentication error',
    });
    return;
  }

  // OpenAI errors
  if (err.message?.includes('OpenAI')) {
    res.status(502).json({
      success: false,
      error: 'AI service error. Please try again.',
    });
    return;
  }

  // Known operational errors
  if (err.isOperational) {
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Unknown errors
  res.status(500).json({
    success: false,
    error: isDev ? err.message : 'Internal server error',
    ...(isDev && { stack: err.stack }),
  });
};

export class OperationalError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const NotFoundError = (resource: string) =>
  new OperationalError(`${resource} not found`, 404);

export const UnauthorizedError = (message = 'Unauthorized') =>
  new OperationalError(message, 401);

export const ForbiddenError = (message = 'Forbidden') =>
  new OperationalError(message, 403);

export const BadRequestError = (message: string) =>
  new OperationalError(message, 400);
