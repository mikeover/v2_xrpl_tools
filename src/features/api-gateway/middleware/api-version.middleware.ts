import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ApiVersionMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Add API version to request object
    const versionMatch = req.path.match(/^\/api\/v(\d+)/);
    if (versionMatch && versionMatch[1]) {
      (req as any).apiVersion = parseInt(versionMatch[1], 10);
    } else {
      // Default to v1 if no version specified
      (req as any).apiVersion = 1;
    }

    // Add version header to response
    res.setHeader('X-API-Version', (req as any).apiVersion);

    next();
  }
}