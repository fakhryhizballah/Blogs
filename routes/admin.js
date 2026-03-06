const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Article = require('../models/Article');
const { isAuthenticated, isGuest } = require('../middleware/auth');
const { setTokenCookie, clearTokenCookie } = require('../config/jwt');
const slugify = require('slugify');

// ─── AUTH ────────────────────────────────────────────────────────────────────

// GET /admin/login
router.get('/login', isGuest, (req, res) => {
  res.render('admin/login', {
      metaDescription: 'Buat akun admin untuk mengelola artikel dan komentar',
    title: 'Admin Login',
  });
});

// POST /admin/login
router.post('/login', isGuest, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [{ username }, { email: username }] });

    if (!user || !(await user.comparePassword(password))) {
      return res.redirect('/admin/login?error=Username+atau+password+salah');
    }

    // Buat JWT dan set sebagai HttpOnly cookie
    setTokenCookie(res, user);

    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/login?error=Terjadi+kesalahan%2C+coba+lagi');
  }
});

// GET /admin/logout
router.get('/logout', (req, res) => {
  clearTokenCookie(res);
  res.redirect('/?success=Berhasil+logout');
});

// GET /admin/register
router.get('/register', isGuest, (req, res) => {
  res.render('admin/register', { 
      metaDescription : 'Buat akun admin untuk mengelola artikel dan komentar',
    title: 'Buat Akun Admin' });
});

// POST /admin/register
router.post('/register', isGuest, async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.redirect('/admin/register?error=Username+atau+email+sudah+digunakan');
    }
    const user = new User({ username, email, password, displayName, role: 'admin' });
    await user.save();
    res.redirect('/admin/login?success=Akun+berhasil+dibuat%2C+silakan+login');
  } catch (err) {
    res.redirect('/admin/register?error=' + encodeURIComponent(err.message));
  }
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

router.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const articles = await Article.find({ author: req.user.id }).sort({ createdAt: -1 });
    const stats = {
      total: articles.length,
      published: articles.filter(a => a.status === 'published').length,
      draft: articles.filter(a => a.status === 'draft').length,
      private: articles.filter(a => a.status === 'private').length,
      totalViews: articles.reduce((sum, a) => sum + a.views, 0),
      totalComments: articles.reduce((sum, a) => sum + a.comments.length, 0),
    };
    res.render('admin/dashboard', {
        metaDescription: 'Dashboard admin untuk mengelola artikel dan komentar',
      title: 'Dashboard',
      user,
      articles: articles.slice(0, 10),
      stats,
      currentPage: 'dashboard',
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/login');
  }
});

// ─── PROFILE ─────────────────────────────────────────────────────────────────

router.get('/profile', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.render('admin/profile', {
    title: 'Edit Profil',
    user,
    currentPage: 'profile',
  });
});

router.post('/profile', isAuthenticated, async (req, res) => {
  try {
    const { displayName, bio, avatar } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { displayName, bio, avatar },
      { new: true }
    );
    // Refresh JWT cookie dengan data terbaru
    setTokenCookie(res, user);
    res.redirect('/admin/profile?success=Profil+berhasil+diperbarui');
  } catch (err) {
    res.redirect('/admin/profile?error=Gagal+memperbarui+profil');
  }
});

router.post('/profile/password', isAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!(await user.comparePassword(currentPassword))) {
      return res.redirect('/admin/profile?error=Password+lama+tidak+sesuai');
    }
    user.password = newPassword;
    await user.save();
    // Logout setelah ganti password untuk keamanan
    clearTokenCookie(res);
    res.redirect('/admin/login?success=Password+berhasil+diubah%2C+silakan+login+kembali');
  } catch (err) {
    res.redirect('/admin/profile?error=Gagal+mengubah+password');
  }
});

// ─── ARTICLES ────────────────────────────────────────────────────────────────

router.get('/articles', isAuthenticated, async (req, res) => {
  try {
    const { status, tag, search } = req.query;
    let query = { author: req.user.id };
    if (status && status !== 'all') query.status = status;
    if (tag) query.tags = tag;
    if (search) query.title = { $regex: search, $options: 'i' };

    const articles = await Article.find(query).sort({ createdAt: -1 });
    const allTags = await Article.distinct('tags', { author: req.user.id });
    const user = await User.findById(req.user.id);

    res.render('admin/articles', {
      title: 'Kelola Artikel',
      articles,
      allTags,
      user,
      filters: { status, tag, search },
      currentPage: 'articles',
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
});

router.get('/articles/new', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.render('admin/article-editor', {
      metaDescription: 'articles admin untuk mengelola artikel dan komentar',
    title: 'Tulis Artikel Baru',
    article: null,
    user,
    currentPage: 'articles',
  });
});

router.post('/articles', isAuthenticated, async (req, res) => {
  try {
    const { title, content, tags, status, coverImage, mediaFiles, metaDescription, excerpt } = req.body;
    
    // Validasi konten dan judul
    if (!title || !title.trim()) {
      return res.redirect('/admin/articles/new?error=Judul+artikel+diperlukan');
    }
    if (!content || !content.trim()) {
      return res.redirect('/admin/articles/new?error=Konten+artikel+diperlukan');
    }

    const tagsArray = tags ? tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
    const mediaArray = mediaFiles ? JSON.parse(mediaFiles) : [];
    const slug = slugify(title, { lower: true, strict: true }) + '-' + Date.now();

    const article = new Article({
      title, content, tags: tagsArray, status, coverImage, slug,
      mediaFiles: mediaArray, author: req.user.id,
      metaDescription, excerpt,
    });
    await article.save();
    res.redirect('/admin/articles?success=Artikel+berhasil+disimpan');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/articles/new?error=' + encodeURIComponent('Gagal menyimpan: ' + err.message));
  }
});

router.get('/articles/:id/edit', isAuthenticated, async (req, res) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, author: req.user.id });
    if (!article) return res.redirect('/admin/articles');
    const user = await User.findById(req.user.id);
    res.render('admin/article-editor', {
      title: 'Edit Artikel',
      article,
      user,
      currentPage: 'articles',
    });
  } catch (err) {
    res.redirect('/admin/articles');
  }
});

router.post('/articles/:id/update', isAuthenticated, async (req, res) => {
  try {
    const { title, content, tags, status, coverImage, mediaFiles, metaDescription, excerpt } = req.body;
    
    // Validasi konten dan judul
    if (!title || !title.trim()) {
      return res.redirect('/admin/articles/' + req.params.id + '/edit?error=Judul+artikel+diperlukan');
    }
    if (!content || !content.trim()) {
      return res.redirect('/admin/articles/' + req.params.id + '/edit?error=Konten+artikel+diperlukan');
    }

    const tagsArray = tags ? tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
    const mediaArray = mediaFiles ? JSON.parse(mediaFiles) : [];

    const article = await Article.findOne({ _id: req.params.id, author: req.user.id });
    if (!article) return res.redirect('/admin/articles');

    Object.assign(article, {
      title, content, tags: tagsArray, status, coverImage,
      mediaFiles: mediaArray, metaDescription, excerpt, updatedAt: new Date(),
    });
    if (status === 'published' && !article.publishedAt) {
      article.publishedAt = new Date();
    }
    await article.save();
    res.redirect('/admin/articles?success=Artikel+berhasil+diperbarui');
  } catch (err) {
    res.redirect('/admin/articles/' + req.params.id + '/edit?error=' + encodeURIComponent(err.message));
  }
});

router.post('/articles/:id/delete', isAuthenticated, async (req, res) => {
  await Article.findOneAndDelete({ _id: req.params.id, author: req.user.id });
  res.redirect('/admin/articles?success=Artikel+berhasil+dihapus');
});

// ─── COMMENTS (admin delete) ──────────────────────────────────────────────────

router.post('/articles/:id/comments/:commentId/delete', isAuthenticated, async (req, res) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, author: req.user.id });
    if (!article) return res.json({ success: false });
    article.comments = article.comments.filter(c => c._id.toString() !== req.params.commentId);
    await article.save();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

router.get('/comments', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const articles = await Article.find({
      author: req.user.id,
      'comments.0': { $exists: true },
    }).select('title slug comments').sort({ updatedAt: -1 });

    res.render('admin/comments', {
      title: 'Kelola Komentar',
      articles,
      user,
      currentPage: 'comments',
    });
  } catch (err) {
    res.redirect('/admin/dashboard');
  }
});

module.exports = router;
