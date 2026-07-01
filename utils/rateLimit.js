import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later',
  standardHeaders: false,
  skip: (req) => {
    return req.url === '/' || req.url.startsWith('/assets/') || req.url.endsWith('.html');
  }
});

export async function rateLimitMiddleware(request, reply) {
  return new Promise((resolve, reject) => {
    limiter(request.raw, reply.raw, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
