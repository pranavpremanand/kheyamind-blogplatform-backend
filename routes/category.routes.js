
const express = require('express');
const Category = require('../models/category.model');
const Blog = require('../models/blog.model');
const { authenticate, authorizeAdmin } = require('../utils/auth');

const router = express.Router();

// @route   GET /api/categories
// @desc    Get all categories
// @access  Public
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json({
      success: true,
      categories
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
});

// @route   GET /api/categories/:id
// @desc    Get category by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    
    if (!category) {
      return res.status(404).json({ 
        success: false,
        message: 'Category not found' 
      });
    }
    
    res.json({
      success: true,
      category
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category',
      error: error.message
    });
  }
});

// @route   POST /api/categories
// @desc    Create a new category
// @access  Private (Admin only)
router.post('/', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    // Check if category with this name already exists
    const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existingCategory) {
      return res.status(400).json({ 
        success: false,
        message: 'Category with this name already exists' 
      });
    }
    
    const category = new Category({
      name,
      description
    });
    
    await category.save();
    res.status(201).json({
      success: true,
      category
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category',
      error: error.message
    });
  }
});

// @route   PUT /api/categories/:id
// @desc    Update a category
// @access  Private (Admin only)
router.put('/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    const category = await Category.findById(req.params.id);
    
    if (!category) {
      return res.status(404).json({ 
        success: false,
        message: 'Category not found' 
      });
    }
    
    // Check if another category with this name already exists
    if (name !== category.name) {
      const existingCategory = await Category.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: req.params.id }
      });
      
      if (existingCategory) {
        return res.status(400).json({ 
          success: false,
          message: 'Another category with this name already exists' 
        });
      }
    }
    
    category.name = name || category.name;
    category.description = description !== undefined ? description : category.description;
    
    await category.save();
    res.json({
      success: true,
      category
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to update category',
      error: error.message
    });
  }
});

// @route   DELETE /api/categories/:id
// @desc    Delete a category
// @access  Private (Admin only)
router.delete('/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    // Check if any blog uses this category
    const blogsWithCategory = await Blog.countDocuments({ categoryId: req.params.id });
    
    if (blogsWithCategory > 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Cannot delete category because it is used in blog posts',
        blogsCount: blogsWithCategory
      });
    }
    
    const category = await Category.findById(req.params.id);
    
    if (!category) {
      return res.status(404).json({ 
        success: false,
        message: 'Category not found' 
      });
    }
    
    await category.deleteOne();
    
    res.json({ 
      success: true,
      message: 'Category removed successfully' 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete category',
      error: error.message
    });
  }
});

module.exports = router;
