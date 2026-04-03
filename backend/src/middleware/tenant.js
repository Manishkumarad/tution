function requireTenant(req, res, next) {
  if (!req.user || !req.user.coaching_id) {
    return res.status(401).json({ message: 'Tenant context missing' });
  }

  req.tenant = { coachingId: Number(req.user.coaching_id) };
  return next();
}

module.exports = { requireTenant };
