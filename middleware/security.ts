import { Request, Response, NextFunction } from "express";

// Enhanced security headers
export const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  // Existing headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Additional security headers
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'none'; style-src 'none'; img-src 'none';");
  
  // Remove server identification
  res.removeHeader('X-Powered-By');
  
  next();
};

// Request logging for security monitoring
export const securityLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const origin = req.get('origin') || 'no-origin';
  
  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\./,  // Path traversal
    /<script/i,  // XSS attempts
    /union.*select/i,  // SQL injection
    /javascript:/i,  // JavaScript injection
  ];
  
  const requestBody = JSON.stringify(req.body || {});
  const isSuspicious = suspiciousPatterns.some(pattern => 
    pattern.test(req.url) || pattern.test(requestBody)
  );
  
  if (isSuspicious) {
    console.warn(`[SECURITY] Suspicious request detected:`, {
      ip: clientIP,
      method: req.method,
      url: req.url,
      userAgent,
      origin,
      body: requestBody,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log all requests in production for monitoring
  if (process.env['NODE_ENV'] === 'production') {
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      console.log(`[ACCESS] ${clientIP} ${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
    });
  }
  
  next();
};

