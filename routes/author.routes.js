
const express = require('express');
const Author = require('../models/author.model');
const Blog = require('../models/blog.model');
const { authenticate, authorizeAdmin } = require('../utils/auth');

const router = express.Router();

// @route   GET /api/authors
// @desc    Get all authors
// @access  Public
router.get('/', async (req, res) => {
  try {
    const authors = await Author.find().sort({ name: 1 });
    res.json({
      success: true,
      authors
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch authors',
      error: error.message
    });
  }
});

// @route   GET /api/authors/:id
// @desc    Get author by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const author = await Author.findById(req.params.id);
    
    if (!author) {
      return res.status(404).json({ 
        success: false,
        message: 'Author not found' 
      });
    }
    
    res.json({
      success: true,
      author
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch author',
      error: error.message
    });
  }
});

// @route   POST /api/authors
// @desc    Create a new author
// @access  Private (Admin only)
router.post('/', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        success: false,
        message: 'Author name is required' 
      });
    }
    
    // Check if author already exists
    const existingAuthor = await Author.findOne({ name: name.trim() });
    if (existingAuthor) {
      return res.status(400).json({ 
        success: false,
        message: 'Author already exists' 
      });
    }
    
    const author = new Author({ name: name.trim() });
    await author.save();
    
    res.status(201).json({
      success: true,
      author
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to create author',
      error: error.message
    });
  }
});

// @route   PUT /api/authors/:id
// @desc    Update an author
// @access  Private (Admin only)
router.put('/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        success: false,
        message: 'Author name is required' 
      });
    }
    
    // Check if another author with the same name already exists
    const existingAuthor = await Author.findOne({ 
      name: name.trim(),
      _id: { $ne: req.params.id }
    });
    
    if (existingAuthor) {
      return res.status(400).json({ 
        success: false,
        message: 'Another author with this name already exists' 
      });
    }
    
    const author = await Author.findByIdAndUpdate(
      req.params.id,
      { name: name.trim(), updatedAt: Date.now() },
      { new: true }
    );
    
    if (!author) {
      return res.status(404).json({ 
        success: false,
        message: 'Author not found' 
      });
    }
    
    res.json({
      success: true,
      author
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to update author',
      error: error.message
    });
  }
});

// @route   DELETE /api/authors/:id
// @desc    Delete an author
// @access  Private (Admin only)
router.delete('/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    // Check if any blogs are using this author
    const blogsWithAuthor = await Blog.countDocuments({ authorId: req.params.id });
    
    if (blogsWithAuthor > 0) {
      return res.status(400).json({ 
        success: false,
        message: `Cannot delete author. ${blogsWithAuthor} blog(s) are using this author.`
      });
    }
    
    const author = await Author.findByIdAndDelete(req.params.id);
    
    if (!author) {
      return res.status(404).json({ 
        success: false,
        message: 'Author not found' 
      });
    }
    
    res.json({ 
      success: true,
      message: 'Author removed' 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete author',
      error: error.message
    });
  }
});

module.exports = router;
