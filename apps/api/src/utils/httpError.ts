export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (msg: string, code = "BAD_REQUEST", details?: unknown) => new HttpError(400, code, msg, details);
export const unauthorized = (msg = "Authentification requise.", code = "UNAUTHORIZED") => new HttpError(401, code, msg);
export const forbidden = (msg = "Accès refusé.", code = "FORBIDDEN") => new HttpError(403, code, msg);
export const notFound = (msg = "Ressource introuvable.", code = "NOT_FOUND") => new HttpError(404, code, msg);
export const conflict = (msg: string, code = "CONFLICT") => new HttpError(409, code, msg);
export const unprocessable = (msg: string, code = "UNPROCESSABLE", details?: unknown) => new HttpError(422, code, msg, details);
