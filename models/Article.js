const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  guestName: { type: String, required: true },
  guestId  : { type: String, required: true },
  content  : { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const ArticleSchema = new mongoose.Schema({
  title      : { type: String, required: true, trim: true },
  slug       : { type: String, unique: true, lowercase: true },
  content    : { type: String, required: true },   // HTML (untuk ditampilkan)
  contentRaw : { type: String, default: '' },       // Markdown asli (untuk diedit)
  excerpt    : { type: String, default: '' },
  coverImage : { type: String, default: '' },
  mediaFiles : [{
    type: { type: String, enum: ['image', 'video', 'pdf'] },
    url : String,
    name: String,
  }],
  tags   : [{ type: String, trim: true, lowercase: true }],
  author : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status : { type: String, enum: ['draft', 'published', 'private'], default: 'draft' },
  views  : { type: Number, default: 0 },
  likes  : [{ type: String }],
  dislikes: [{ type: String }],
  comments: [CommentSchema],
  publishedAt : { type: Date },
  createdAt   : { type: Date, default: Date.now },
  updatedAt   : { type: Date, default: Date.now },
  readTime    : { type: Number, default: 0 },
  metaDescription: { type: String, default: '' },
});

ArticleSchema.pre('save', function (next) {
  // Auto slug
  if (!this.slug) {
    const slugify = require('slugify');
    this.slug = slugify(this.title, { lower: true, strict: true }) + '-' + Date.now();
  }
  // Read time dari HTML (strip tag)
  const wordCount = this.content.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
  this.readTime = Math.max(1, Math.ceil(wordCount / 200));
  // Auto excerpt dari HTML jika kosong
  if (!this.excerpt) {
    this.excerpt = this.content.replace(/<[^>]*>/g, '').trim().substring(0, 160) + '…';
  }
  // Set publishedAt
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Article', ArticleSchema);
