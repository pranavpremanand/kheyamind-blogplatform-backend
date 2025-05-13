
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
    ref: 'Author',
    required: true,
    index: true // Add index for faster queries
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
    index: true // Add index for faster queries
  },
  tags: [{
    type: String,
    trim: true,
    required: true
  }],
  excerpt: {
    type: String,
    trim: true,
    required: true
  },
  imageAlt: {
    type: String,
    trim: true,
    required: true
  },
  isFeatured: {
    type: Boolean,
    default: false,
    index: true // Add index for faster featured blog queries
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // Add index for faster queries
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
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'published',
    index: true // Add index for faster status filtering
  },
  publishDate: {
    type: Date,
    default: Date.now,
    index: true // Add index for faster date-based queries
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true // Add index for sorting by creation date
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Create compound indexes for common query patterns
blogSchema.index({ status: 1, publishDate: 1 }); // For published blogs with date filtering
blogSchema.index({ status: 1, isFeatured: 1 }); // For featured published blogs
blogSchema.index({ title: 'text', content: 'text' }); // For text search

// Create slug from title before saving
blogSchema.pre('save', async function(next) {
  // Only update slug if slug is not set (new blog without custom slug)
  // or if title is modified AND slug was auto-generated from title before
  if (!this.slug) {
    // No slug provided, generate from title
    let baseSlug = slugify(this.title);
    
    // Check if slug exists
    let slugExists = await mongoose.models.Blog.exists({ slug: baseSlug });
    
    // If slug exists, add a unique timestamp suffix
    if (slugExists) {
      const timestamp = Math.floor(Date.now() / 1000).toString().slice(-6);
      this.slug = `${baseSlug}-${timestamp}`;
    } else {
      this.slug = baseSlug;
    }
  }
  
  // Validate that tags array is not empty
  if (this.tags.length === 0) {
    const err = new Error('At least one tag is required');
    return next(err);
  }
  
  // Always update the updatedAt field if anything changed
  if (this.isModified()) {
    this.updatedAt = Date.now();
  }
  
  next();
});

const Blog = mongoose.model('Blog', blogSchema);

module.exports = Blog;
