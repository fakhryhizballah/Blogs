const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-this';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const COOKIE_NAME = 'blog_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 hari dalam ms

/**
 * Generate JWT token dari data user
 */
const signToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Verify JWT token, kembalikan payload atau null
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};

/**
 * Set JWT sebagai HttpOnly cookie di response
 */
const setTokenCookie = (res, user) => {
  const payload = {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    role: user.role,
  };
  const token = signToken(payload);

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,      // Tidak bisa diakses JS di browser (aman dari XSS)
    secure: process.env.NODE_ENV === 'production', // HTTPS only di production
    sameSite: 'lax',    // Proteksi CSRF
    maxAge: COOKIE_MAX_AGE,
  });

  return token;
};

/**
 * Hapus cookie JWT (logout)
 */
const clearTokenCookie = (res) => {
  res.clearCookie(COOKIE_NAME);
};

/**
 * Ekstrak token dari request (cookie atau Authorization header)
 */
const extractToken = (req) => {
  // Prioritas 1: HttpOnly cookie
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }
  // Prioritas 2: Authorization Bearer header (untuk API client)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
};

module.exports = { signToken, verifyToken, setTokenCookie, clearTokenCookie, extractToken };
