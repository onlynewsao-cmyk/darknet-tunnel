function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireOwner(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'owner') {
    return res.status(403).render('403', { title: 'Acesso negado' });
  }
  next();
}

function requireApiAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
  next();
}

function requireApiOwner(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
  if (req.session.user.role !== 'owner') return res.status(403).json({ error: 'Acesso negado' });
  next();
}

module.exports = { requireLogin, requireOwner, requireApiAuth, requireApiOwner };
