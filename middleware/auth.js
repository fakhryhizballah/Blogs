const { verifyToken, extractToken } = require('../config/jwt');

/**
 * Middleware: wajib login (JWT valid)
 * Jika tidak valid → redirect ke login dengan flash message via query
 */
const isAuthenticated = (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.redirect('/admin/login?error=Silakan+login+terlebih+dahulu');
  }

  const payload = verifyToken(token);

  if (!payload) {
    res.clearCookie('blog_token');
    return res.redirect('/admin/login?error=Sesi+habis%2C+silakan+login+kembali');
  }

  req.user = payload;
  next();
};

/**
 * Middleware: hanya untuk tamu (belum login)
 */
const isGuest = (req, res, next) => {
  const token = extractToken(req);
  if (token && verifyToken(token)) {
    return res.redirect('/admin/dashboard');
  }
  next();
};

/**
 * Middleware global: inject user ke semua view
 */
const injectUser = (req, res, next) => {
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    res.locals.sessionUser = payload || null;
    req.user = payload || null;
  } else {
    res.locals.sessionUser = null;
    req.user = null;
  }
  next();
};

module.exports = { isAuthenticated, isGuest, injectUser };
