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
    required: true,
    validate: {
      validator: function(v) {
        // Basic URL validation
        return /^(http|https):\/\/[^ "]+$/.test(v);
      },
      message: props => `${props.value} is not a valid URL!`
    }
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
blogSchema.index({ status: 1, publishDate: 1 });
blogSchema.index({ status: 1, isFeatured: 1 });
blogSchema.index({ slug: 1 }, { unique: true });

// Add text index for better search performance
blogSchema.index({ title: 'text', content: 'text', excerpt: 'text' });

// Pre-save middleware to generate slug if not provided
blogSchema.pre('save', function(next) {
  if (!this.slug) {
    this.slug = slugify(this.title);
  }
  this.updatedAt = new Date();
  next();
});

const Blog = mongoose.model('Blog', blogSchema);

module.exports = Blog;
