import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";

/**
 * Global error handling middleware
 * Provides consistent error responses across the application
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle known application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
    });
    return;
  }

  // Log unexpected errors for debugging
  console.error("Unexpected error:", err);

  // Return generic error message for unexpected errors
  res.status(500).json({
    error: "Internal server error",
  });
}
