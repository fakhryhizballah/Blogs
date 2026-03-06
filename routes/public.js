const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const User = require('../models/User');

// GET / - Homepage
router.get('/', async (req, res) => {
  try {
    const latestArticles = await Article.find({ status: 'published' })
      .populate('author', 'displayName avatar username')
      .sort({ publishedAt: -1 })
      .limit(6);

    // Get all tags with count
    const tagAggregation = await Article.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    const featuredArticle = latestArticles[0] || null;
    const otherArticles = latestArticles.slice(1);

    res.render('index', {
      title: 'Blog Pribadi - Dokumentasi & Berbagi Pengetahuan',
      metaDescription: 'Blog pribadi untuk berbagi pengetahuan, tutorial, dan dokumentasi',
      latestArticles,
      featuredArticle,
      otherArticles,
      tags: tagAggregation,
      currentTag: null
    });
  } catch (err) {
    console.error(err);
    res.render('error', { message: 'Terjadi kesalahan server' });
  }
});

// GET /topics/:tag
router.get('/topics/:tag', async (req, res) => {
  try {
    const tag = req.params.tag.toLowerCase();
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const total = await Article.countDocuments({ status: 'published', tags: tag });
    const articles = await Article.find({ status: 'published', tags: tag })
      .populate('author', 'displayName avatar username')
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit);

    const tagAggregation = await Article.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    res.render('topics', {
      title: `Topik: #${tag} - Blog Pribadi`,
      metaDescription: `Semua artikel tentang ${tag}`,
      articles,
      tags: tagAggregation,
      currentTag: tag,
      pagination: { page, totalPages: Math.ceil(total / limit), total }
    });
  } catch (err) {
    res.render('error', { message: 'Topik tidak ditemukan' });
  }
});

// GET /articles/:slug - Single article
router.get('/articles/:slug', async (req, res) => {
  try {
    const article = await Article.findOne({ slug: req.params.slug, status: 'published' })
      .populate('author', 'displayName avatar username bio');

    if (!article) return res.status(404).render('404', { title: 'Artikel Tidak Ditemukan' });

    // Increment views
    await Article.findByIdAndUpdate(article._id, { $inc: { views: 1 } });
    article.views += 1;

    // Related articles by tag
    const relatedArticles = await Article.find({
      status: 'published',
      tags: { $in: article.tags },
      _id: { $ne: article._id }
    }).populate('author', 'displayName avatar').limit(3);

    const tagAggregation = await Article.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 }
    ]);

    res.render('article', {
      title: article.title + ' - Blog Pribadi',
      metaDescription: article.metaDescription || article.excerpt,
      metaImage: article.coverImage,
      article,
      relatedArticles,
      tags: tagAggregation,
      canonicalUrl: `/articles/${article.slug}`
    });
  } catch (err) {
    console.error(err);
    res.status(404).render('404', { title: 'Halaman Tidak Ditemukan' });
  }
});

// POST /articles/:id/comment
router.post('/articles/:id/comment', async (req, res) => {
  try {
    const { guestName, guestId, content } = req.body;
    if (!guestName || !guestId || !content) {
      return res.json({ success: false, message: 'Data tidak lengkap' });
    }
    const article = await Article.findById(req.params.id);
    if (!article || article.status !== 'published') {
      return res.json({ success: false, message: 'Artikel tidak ditemukan' });
    }
    const comment = { guestName, guestId, content, createdAt: new Date() };
    article.comments.push(comment);
    await article.save();
    const savedComment = article.comments[article.comments.length - 1];
    res.json({ success: true, comment: savedComment });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// DELETE /articles/:id/comment/:commentId
router.delete('/articles/:id/comment/:commentId', async (req, res) => {
  try {
    const { guestId } = req.body;
    const article = await Article.findById(req.params.id);
    if (!article) return res.json({ success: false });

    const comment = article.comments.id(req.params.commentId);
    if (!comment || comment.guestId !== guestId) {
      return res.json({ success: false, message: 'Tidak diizinkan' });
    }
    article.comments = article.comments.filter(c => c._id.toString() !== req.params.commentId);
    await article.save();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

// POST /articles/:id/react
router.post('/articles/:id/react', async (req, res) => {
  try {
    const { guestId, type } = req.body; // type: 'like' or 'dislike'
    const article = await Article.findById(req.params.id);
    if (!article) return res.json({ success: false });

    if (type === 'like') {
      if (article.likes.includes(guestId)) {
        article.likes = article.likes.filter(id => id !== guestId);
      } else {
        article.likes.push(guestId);
        article.dislikes = article.dislikes.filter(id => id !== guestId);
      }
    } else if (type === 'dislike') {
      if (article.dislikes.includes(guestId)) {
        article.dislikes = article.dislikes.filter(id => id !== guestId);
      } else {
        article.dislikes.push(guestId);
        article.likes = article.likes.filter(id => id !== guestId);
      }
    }

    await article.save();
    res.json({ success: true, likes: article.likes.length, dislikes: article.dislikes.length });
  } catch (err) {
    res.json({ success: false });
  }
});

// GET /search
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    let articles = [];
    if (q) {
      articles = await Article.find({
        status: 'published',
        $or: [
          { title: { $regex: q, $options: 'i' } },
          { content: { $regex: q, $options: 'i' } },
          { tags: { $regex: q, $options: 'i' } }
        ]
      }).populate('author', 'displayName avatar').sort({ publishedAt: -1 }).limit(20);
    }
    res.render('search', {
      title: `Pencarian: ${q || ''} - Blog Pribadi`,
      articles,
      query: q,
      tags: []
    });
  } catch (err) {
    res.render('search', { articles: [], query: '', tags: [] });
  }
});

module.exports = router;
