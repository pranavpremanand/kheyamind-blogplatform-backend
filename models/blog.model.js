
const mongoose = require('mongoose');
const slugify = require('../utils/slugify');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    unique: true
  },
  content: {
    type: String,
    required: true
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Author'
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  },
  tags: [{
    type: String,
    trim: true
  }],
  excerpt: {
    type: String,
    trim: true
  },
  imageAlt: {
    type: String,
    trim: true,
    default: ''
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  metaDescription: {
    type: String,
    trim: true
  },
  metaKeywords: [{
    type: String,
    trim: true
  }],
  imageUrl: {
    type: String
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'published'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Create slug from title before saving
blogSchema.pre('save', async function(next) {
  // Only update slug if title is modified or slug is not set
  if (!this.slug || this.isModified('title')) {
    // Basic slug from title
    let baseSlug = slugify(this.title);
    
    // Check if slug exists
    let slugExists = await mongoose.models.Blog.exists({ slug: baseSlug });
    
    // If slug exists, add a unique timestamp suffix
    if (slugExists && (!this.slug || this.slug !== baseSlug)) {
      const timestamp = Math.floor(Date.now() / 1000).toString().slice(-6);
      this.slug = `${baseSlug}-${timestamp}`;
    } else {
      this.slug = baseSlug;
    }
  }
  
  // Always update the updatedAt field if anything changed
  if (this.isModified()) {
    this.updatedAt = Date.now();
  }
  
  next();
});

const Blog = mongoose.model('Blog', blogSchema);

module.exports = Blog;
