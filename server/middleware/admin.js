export function requireAdmin(req, res, next) {
  // Prefer role-based check: if the authenticated user's JWT includes a roles array
  // and it contains 'admin', allow. This is deny-by-default for production safety.
  const user = req.user || {};
  const roles = Array.isArray(user.roles) ? user.roles.map(r => String(r).toLowerCase()) : [];
  if (roles.includes('admin')) return next();

  // Backwards-compatible: allow explicit ADMIN_EMAILS for deployments that haven't
  // migrated to role claims yet. If ADMIN_EMAILS is set, only those emails are allowed.
  const adminEnv = process.env.ADMIN_EMAILS || '';
  const admins = adminEnv.split(',').map(s => s.trim()).filter(Boolean);
  if (admins.length > 0) {
    const email = user.email;
    if (email && admins.includes(email)) return next();
  }

  // Deny by default (safer). If you need a permissive dev mode, set ADMIN_EMAILS.
  return res.status(403).json({ error: 'Forbidden' });
}
