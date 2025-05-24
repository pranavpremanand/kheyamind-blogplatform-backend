const express = require('express');
const User = require('../models/user.model');
const { generateToken } = require('../utils/auth');

const router = express.Router();

// VERCEL FIX: Simplified error handler for auth
const handleAuthError = (res, error, message = "Authentication failed") => {
  console.error('Auth Error:', error.message);
  
  // Handle specific MongoDB timeout errors
  if (error.message && error.message.includes('buffering timed out')) {
    return res.status(504).json({
      success: false,
      message: "Database connection timeout. Please try again.",
      error: "Connection timeout"
    });
  }
  
  // Handle validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      error: error.message
    });
  }
  
  res.status(500).json({
    success: false,
    message,
    error: error.message
  });
};

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }
    
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }
    
    // Password length validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }
    
    // VERCEL-OPTIMIZED: Check if user exists with timeout
    const existingUser = await User.findOne({ email }).maxTimeMS(8000);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // VERCEL-OPTIMIZED: Create user with timeout
    const user = await User.create({
      name,
      email,
      password
    });
    
    // VERCEL-OPTIMIZED: Check user count with timeout for admin assignment
    try {
      const userCount = await User.countDocuments({}).maxTimeMS(5000);
      if (userCount === 1) {
        user.role = 'admin';
        await user.save({ maxTimeMS: 5000 });
      }
    } catch (countError) {
      console.warn('Could not check user count for admin assignment:', countError.message);
      // Continue without making admin - can be done manually later
    }
    
    // Generate token
    const token = generateToken(user._id);
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
    
  } catch (error) {
    handleAuthError(res, error, 'Registration failed');
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Basic validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    // VERCEL-OPTIMIZED: Find user with timeout
    const user = await User.findOne({ email }).maxTimeMS(10000);
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }
    
    // VERCEL-OPTIMIZED: Check password with error handling
    let isPasswordMatch = false;
    try {
      isPasswordMatch = await user.comparePassword(password);
    } catch (passwordError) {
      console.error('Password comparison error:', passwordError.message);
      return res.status(500).json({
        success: false,
        message: 'Authentication processing failed'
      });
    }
    
    if (!isPasswordMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }
    
    // Generate token
    const token = generateToken(user._id);
    
    // ENHANCED: Return success response with proper structure
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
    
  } catch (error) {
    handleAuthError(res, error, 'Login failed');
  }
});

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get('/me', async (req, res) => {
  try {
    // This route would need the authenticate middleware
    // For now, just a placeholder
    res.json({
      success: true,
      message: 'User profile endpoint',
      note: 'This endpoint requires authentication middleware'
    });
  } catch (error) {
    handleAuthError(res, error, 'Failed to get user profile');
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Request password reset (placeholder)
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    
    // VERCEL-OPTIMIZED: Check if user exists
    const user = await User.findOne({ email }).maxTimeMS(8000);
    
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }
    
    // TODO: Implement actual password reset logic
    res.json({
      success: true,
      message: 'Password reset functionality will be implemented soon.'
    });
    
  } catch (error) {
    handleAuthError(res, error, 'Password reset request failed');
  }
});

module.exports = router;
