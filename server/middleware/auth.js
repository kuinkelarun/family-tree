import jwt from 'jsonwebtoken';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is required in production');
    }
    // In non-production, keep a predictable dev secret to avoid breaking local setups.
    return 'dev-secret';
  }
  return secret;
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function signToken(user) {
  // Include roles in the token so role-based checks (e.g. requireAdmin) work
  const payload = { id: user._id, email: user.email, roles: Array.isArray(user.roles) ? user.roles : [] };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}
