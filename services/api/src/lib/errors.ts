/** Typed application errors mapped to HTTP status codes by the error handler. */

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (msg: string, code = "bad_request") => new AppError(400, code, msg);
export const unauthorized = (msg = "Unauthorized", code = "unauthorized") => new AppError(401, code, msg);
export const forbidden = (msg = "Forbidden", code = "forbidden") => new AppError(403, code, msg);
export const notFound = (msg = "Not found", code = "not_found") => new AppError(404, code, msg);
export const conflict = (msg: string, code = "conflict") => new AppError(409, code, msg);
export const paymentRequired = (msg: string, code = "upgrade_required") => new AppError(402, code, msg);
