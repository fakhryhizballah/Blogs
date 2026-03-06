const express  = require('express');
const router   = express.Router();
const { marked } = require('marked');
const User     = require('../models/User');
const Article  = require('../models/Article');
const { isAuthenticated, isGuest } = require('../middleware/auth');
const { setTokenCookie, clearTokenCookie } = require('../config/jwt');
const slugify  = require('slugify');

/* ── Konfigurasi marked ───────────────────────────────────────────── */
marked.setOptions({
  breaks : true,   // \n → <br>
  gfm    : true,   // GitHub Flavored Markdown
});

// Fungsi konversi Markdown ke HTML aman
function mdToHtml(markdown) {
  if (!markdown) return '';
  return marked.parse(markdown);
}

/* ═══════════════════════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════════════════════ */
router.get('/login', isGuest, (req, res) => {
  res.render('admin/login', { title: 'Admin Login' });
});

router.post('/login', isGuest, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [{ username }, { email: username }] });
    if (!user || !(await user.comparePassword(password))) {
      return res.redirect('/admin/login?error=Username+atau+password+salah');
    }
    setTokenCookie(res, user);
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/login?error=Terjadi+kesalahan%2C+coba+lagi');
  }
});

router.get('/logout', (req, res) => {
  clearTokenCookie(res);
  res.redirect('/?success=Berhasil+logout');
});

router.get('/register', isGuest, (req, res) => {
  res.render('admin/register', { title: 'Buat Akun Admin' });
});

router.post('/register', isGuest, async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;
    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) return res.redirect('/admin/register?error=Username+atau+email+sudah+digunakan');
    const user = new User({ username, email, password, displayName, role: 'admin' });
    await user.save();
    res.redirect('/admin/login?success=Akun+berhasil+dibuat%2C+silakan+login');
  } catch (err) {
    res.redirect('/admin/register?error=' + encodeURIComponent(err.message));
  }
});

/* ═══════════════════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════════════════ */
router.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const user     = await User.findById(req.user.id);
    const articles = await Article.find({ author: req.user.id }).sort({ createdAt: -1 });
    const stats = {
      total        : articles.length,
      published    : articles.filter(a => a.status === 'published').length,
      draft        : articles.filter(a => a.status === 'draft').length,
      private      : articles.filter(a => a.status === 'private').length,
      totalViews   : articles.reduce((s, a) => s + a.views, 0),
      totalComments: articles.reduce((s, a) => s + a.comments.length, 0),
    };
    res.render('admin/dashboard', {
      title: 'Dashboard', user, articles: articles.slice(0, 10), stats, currentPage: 'dashboard',
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/login');
  }
});

/* ═══════════════════════════════════════════════════════════════════
   PROFILE
═══════════════════════════════════════════════════════════════════ */
router.get('/profile', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.render('admin/profile', { title: 'Edit Profil', user, currentPage: 'profile' });
});

router.post('/profile', isAuthenticated, async (req, res) => {
  try {
    const { displayName, bio, avatar } = req.body;
    const user = await User.findByIdAndUpdate(req.user.id, { displayName, bio, avatar }, { new: true });
    setTokenCookie(res, user);
    res.redirect('/admin/profile?success=Profil+berhasil+diperbarui');
  } catch {
    res.redirect('/admin/profile?error=Gagal+memperbarui+profil');
  }
});

router.post('/profile/password', isAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!(await user.comparePassword(currentPassword)))
      return res.redirect('/admin/profile?error=Password+lama+tidak+sesuai');
    user.password = newPassword;
    await user.save();
    clearTokenCookie(res);
    res.redirect('/admin/login?success=Password+berhasil+diubah%2C+silakan+login+kembali');
  } catch {
    res.redirect('/admin/profile?error=Gagal+mengubah+password');
  }
});

/* ═══════════════════════════════════════════════════════════════════
   ARTICLES
═══════════════════════════════════════════════════════════════════ */
router.get('/articles', isAuthenticated, async (req, res) => {
  try {
    const { status, tag, search } = req.query;
    let query = { author: req.user.id };
    if (status && status !== 'all') query.status = status;
    if (tag)    query.tags  = tag;
    if (search) query.title = { $regex: search, $options: 'i' };

    const articles = await Article.find(query).sort({ createdAt: -1 });
    const allTags  = await Article.distinct('tags', { author: req.user.id });
    const user     = await User.findById(req.user.id);

    res.render('admin/articles', {
      title: 'Kelola Artikel', articles, allTags, user,
      filters: { status, tag, search }, currentPage: 'articles',
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
});

router.get('/articles/new', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.render('admin/article-editor', {
    title: 'Tulis Artikel Baru', article: null, user, currentPage: 'articles',
  });
});

router.post('/articles', isAuthenticated, async (req, res) => {
  try {
    const { title, contentRaw, tags, status, coverImage, mediaFiles, metaDescription, excerpt } = req.body;

    // Konversi Markdown → HTML
    const contentHtml = mdToHtml(contentRaw);
    const tagsArray   = tags ? tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
    const mediaArray  = mediaFiles ? JSON.parse(mediaFiles) : [];
    const slug        = slugify(title, { lower: true, strict: true }) + '-' + Date.now();

    const article = new Article({
      title,
      content   : contentHtml,   // HTML tersimpan di DB
      contentRaw: contentRaw,    // Markdown asli tersimpan untuk diedit ulang
      tags      : tagsArray,
      status, coverImage, slug,
      mediaFiles: mediaArray,
      author    : req.user.id,
      metaDescription, excerpt,
    });
    await article.save();
    res.redirect('/admin/articles?success=Artikel+berhasil+disimpan');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/articles/new?error=' + encodeURIComponent('Gagal: ' + err.message));
  }
});

router.get('/articles/:id/edit', isAuthenticated, async (req, res) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, author: req.user.id });
    if (!article) return res.redirect('/admin/articles');
    const user = await User.findById(req.user.id);
    res.render('admin/article-editor', {
      title: 'Edit Artikel', article, user, currentPage: 'articles',
    });
  } catch {
    res.redirect('/admin/articles');
  }
});

router.post('/articles/:id/update', isAuthenticated, async (req, res) => {
  try {
    const { title, contentRaw, tags, status, coverImage, mediaFiles, metaDescription, excerpt } = req.body;

    const contentHtml = mdToHtml(contentRaw);
    const tagsArray   = tags ? tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
    const mediaArray  = mediaFiles ? JSON.parse(mediaFiles) : [];

    const article = await Article.findOne({ _id: req.params.id, author: req.user.id });
    if (!article) return res.redirect('/admin/articles');

    Object.assign(article, {
      title,
      content   : contentHtml,
      contentRaw: contentRaw,
      tags      : tagsArray,
      status, coverImage,
      mediaFiles: mediaArray,
      metaDescription, excerpt,
      updatedAt : new Date(),
    });
    if (status === 'published' && !article.publishedAt) article.publishedAt = new Date();
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

/* ═══════════════════════════════════════════════════════════════════
   COMMENTS (admin)
═══════════════════════════════════════════════════════════════════ */
router.post('/articles/:id/comments/:commentId/delete', isAuthenticated, async (req, res) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, author: req.user.id });
    if (!article) return res.json({ success: false });
    article.comments = article.comments.filter(c => c._id.toString() !== req.params.commentId);
    await article.save();
    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

router.get('/comments', isAuthenticated, async (req, res) => {
  try {
    const user     = await User.findById(req.user.id);
    const articles = await Article.find({
      author: req.user.id, 'comments.0': { $exists: true },
    }).select('title slug comments').sort({ updatedAt: -1 });
    res.render('admin/comments', { title: 'Kelola Komentar', articles, user, currentPage: 'comments' });
  } catch {
    res.redirect('/admin/dashboard');
  }
});

module.exports = router;
