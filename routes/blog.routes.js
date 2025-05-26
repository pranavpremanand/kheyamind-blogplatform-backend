const express = require("express");
const multer = require("multer"); // Explicitly import multer
const Blog = require("../models/blog.model");
const { authenticate, authorizeAdmin } = require("../utils/auth");
const { 
  upload, 
  generateWebPUrls, 
  getOptimizedTransformation,
  cloudinary 
} = require("../utils/upload");
const slugify = require("../utils/slugify");

const router = express.Router();

// @route   GET /api/blogs
// @desc    Get all blogs with pagination
// @access  Public
router.get("/", async (req, res) => {
  try {
    // Filter by status if specified
    const filter = req.query.status ? { status: req.query.status } : {};

    // Add search functionality - use text index instead of regex for better performance
    if (req.query.search) {
      // Use text index if available, otherwise fall back to regex
      if (req.query.search.length > 2) {
        filter.$text = { $search: req.query.search };
      } else {
        filter.$or = [
          { title: { $regex: req.query.search, $options: "i" } },
          { content: { $regex: req.query.search, $options: "i" } },
        ];
      }
    }

    // Create query with lean() for better performance
    let query = Blog.find(filter)
      .sort({ createdAt: -1 })
      .lean() // Use lean() to get plain JS objects instead of Mongoose documents (faster)
      .select('title slug excerpt imageUrl imageAlt tags publishDate status isFeatured createdAt categoryId authorId author imageMetadata') // Added imageMetadata
      .populate("categoryId", "name")
      .populate("authorId", "name")
      .populate("author", "name");

    // Apply pagination only if limit is specified
    if (req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit);
      const skip = (page - 1) * limit;

      query = query.skip(skip).limit(limit);
    } else {
      // If no limit specified, still limit to a reasonable number to prevent timeouts
      query = query.limit(100);
    }

    // Execute query with timeout option
    const blogs = await query.maxTimeMS(20000);

    // Get total count with a separate, simpler query
    // Use estimatedDocumentCount if no filters for better performance
    const totalCount =
      Object.keys(filter).length === 0
        ? await Blog.estimatedDocumentCount()
        : await Blog.countDocuments(filter).maxTimeMS(10000);

    // Prepare response
    const response = {
      success: true,
      blogs,
      totalCount,
    };

    // Add pagination info only if limit was specified
    if (req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit);
      response.currentPage = page;
      response.totalPages = Math.ceil(totalCount / limit);
    }

    res.json(response);
  } catch (error) {
    console.error(error);

    // Provide more specific error message for timeouts
    if (
      error.name === "MongooseError" &&
      error.message.includes("buffering timed out")
    ) {
      return res.status(500).json({
        success: false,
        message:
          "Query timed out. Try using pagination or narrowing your search criteria.",
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to fetch blogs",
      error: error.message,
    });
  }
});

// @route   GET /api/blogs/scheduled
// @desc    Get all scheduled blogs (published blogs with future publish dates)
// @access  Private (Admin only)
router.get("/scheduled", authenticate, authorizeAdmin, async (req, res) => {
  try {
    const currentDate = new Date();

    // Filter for published blogs with future publish dates
    const filter = {
      status: "published",
      publishDate: { $gt: currentDate },
    };

    // Create query
    let query = Blog.find(filter)
      .sort({ publishDate: 1 }) // Sort by publishDate in ascending order (earliest first)
      .populate("categoryId", "name")
      .populate("authorId", "name")
      .populate("author", "name");

    // Apply pagination if requested
    if (req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit);
      const skip = (page - 1) * limit;
      query = query.skip(skip).limit(limit);
    }

    // Execute query
    const blogs = await query;

    // Get total count
    const totalCount = await Blog.countDocuments(filter);

    // Prepare response
    const response = {
      success: true,
      blogs,
      totalCount,
    };

    // Add pagination info if requested
    if (req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit);
      response.currentPage = page;
      response.totalPages = Math.ceil(totalCount / limit);
    }

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch scheduled blogs",
      error: error.message,
    });
  }
});

// @route   GET /api/blogs/published
// @desc    Get all published blogs up to the current date
// @access  Public
router.get("/published", async (req, res) => {
  try {
    const currentDate = new Date();

    // Filter for published blogs with publishDate less than or equal to current date
    const filter = {
      status: "published",
      $or: [
        { publishDate: { $lte: currentDate } },
        { publishDate: { $exists: false } }, // For backward compatibility with old posts
      ],
    };

    // Add search functionality
    if (req.query.search) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { title: { $regex: req.query.search, $options: "i" } },
          { content: { $regex: req.query.search, $options: "i" } },
        ],
      });
    }

    // Create query
    let query = Blog.find(filter)
      .sort({ publishDate: -1 }) // Sort by publishDate in descending order (newest first)
      .populate("categoryId", "name")
      .populate("authorId", "name")
      .populate("author", "name");

    // Apply pagination if requested
    if (req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit);
      const skip = (page - 1) * limit;
      query = query.skip(skip).limit(limit);
    }

    // Execute query
    const blogs = await query;

    // Get total count
    const totalCount = await Blog.countDocuments(filter);

    // Prepare response
    const response = {
      success: true,
      blogs,
      totalCount,
    };

    // Add pagination info if requested
    if (req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit);
      response.currentPage = page;
      response.totalPages = Math.ceil(totalCount / limit);
    }

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch published blogs",
      error: error.message,
    });
  }
});

// @route   GET /api/blogs/featured
// @desc    Get featured blogs with optional pagination
// @access  Public
router.get("/featured", async (req, res) => {
  try {
    // Create filter for featured blogs
    const filter = {
      isFeatured: true,
      // Also include status filter if specified
      ...(req.query.status
        ? { status: req.query.status }
        : { status: "published" }),
    };

    // Filter for published blogs with publishDate in the past or equal to current date
    const currentDate = new Date();
    if (filter.status === "published") {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { publishDate: { $lte: currentDate } },
          { publishDate: { $exists: false } }, // For backward compatibility with old posts
        ],
      });
    }

    // Create query
    let query = Blog.find(filter)
      .sort({ publishDate: -1 }) // Sort by publishDate instead of createdAt
      .populate("categoryId", "name")
      .populate("authorId", "name")
      .populate("author", "name");

    // Apply pagination only if limit is specified
    if (req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit);
      const skip = (page - 1) * limit;

      query = query.skip(skip).limit(limit);
    }

    // Execute query
    const blogs = await query;

    // Get total count
    const totalCount = await Blog.countDocuments(filter);

    // Prepare response
    const response = {
      success: true,
      blogs,
      totalCount,
    };

    // Add pagination info only if limit was specified
    if (req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit);
      response.currentPage = page;
      response.totalPages = Math.ceil(totalCount / limit);
    }

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch featured blogs",
      error: error.message,
    });
  }
});

// @route   GET /api/blogs/:id
// @desc    Get blog by ID
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .lean()
      .populate("authorId", "name")
      .populate("categoryId", "name")
      .populate("author", "name");

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    res.json({
      success: true,
      blog,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch blog",
      error: error.message,
    });
  }
});

// @route   GET /api/blogs/slug/:slug
// @desc    Get blog by slug
// @access  Public
router.get("/slug/:slug", async (req, res) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug })
      .lean()
      .populate("author", "name")
      .populate("authorId", "name")
      .populate("categoryId", "name");

    const currentDate = new Date();
    // Check if the blog is published and the publish date is in the past
    if (blog && blog.status === "published" && blog.publishDate > currentDate) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    res.json({
      success: true,
      blog,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch blog",
      error: error.message,
    });
  }
});

// @route   POST /api/blogs
// @desc    Create a new blog with WebP image upload
// @access  Private (Admin only)
router.post("/", authenticate, authorizeAdmin, upload.single('image'), async (req, res) => {
  try {
    // Log request body for debugging
    console.log('🎯 KheyaMind AI Blog Creation Request:', req.body);
    console.log('📁 Uploaded file:', req.file);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Blog image is required",
      });
    }

    // ENHANCED: Get WebP optimization details
    const originalFormat = req.file.mimetype.split('/')[1];
    const isAnimated = req.file.originalname.toLowerCase().endsWith('.gif');
    
    console.log(`🚀 KheyaMind AI Blog: Processing ${originalFormat.toUpperCase()} → WebP`);
    console.log('📸 Cloudinary WebP URL:', req.file.path);

    const {
      title,
      content,
      metaDescription,
      metaKeywords,
      status,
      authorId,
      categoryId,
      tags,
      excerpt,
      imageAlt,
      isFeatured,
      publishDate,
      slug,
    } = req.body;

    // ENHANCED: Image URL is now WebP from Cloudinary
    const imageUrl = req.file.path; // This is now WebP format
    
    // ADDED: Generate responsive WebP URLs for the blog
    const responsiveUrls = generateWebPUrls(req.file.filename);
    
    // ADDED: Get optimized URL for blog post display
    const blogPostUrl = cloudinary.url(req.file.filename, getOptimizedTransformation('blog'));

    // Validate required fields
    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Title is required",
      });
    }

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Content is required",
      });
    }

    if (!excerpt) {
      return res.status(400).json({
        success: false,
        message: "Excerpt is required",
      });
    }

    if (!imageAlt) {
      return res.status(400).json({
        success: false,
        message: "Image alt text is required",
      });
    }

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: "Category is required",
      });
    }

    if (!authorId) {
      return res.status(400).json({
        success: false,
        message: "Author is required",
      });
    }

    if (
      !tags ||
      (Array.isArray(tags) && tags.length === 0) ||
      (typeof tags === "string" && tags.trim() === "")
    ) {
      return res.status(400).json({
        success: false,
        message: "At least one tag is required",
      });
    }

    // Ensure tags is properly formatted
    let formattedTags;
    if (Array.isArray(tags)) {
      // Filter out any empty tags
      formattedTags = tags.filter((tag) => tag && tag.trim() !== "");
      if (formattedTags.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one non-empty tag is required",
        });
      }
    } else if (typeof tags === "string") {
      // Split by comma and filter out empty tags
      formattedTags = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== "");
      if (formattedTags.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one non-empty tag is required",
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Tags must be provided as a string or array",
      });
    }

    // Process custom slug if provided
    let customSlug = null;
    if (slug) {
      customSlug = slugify(slug);
      // Check if the slug already exists
      const slugExists = await Blog.findOne({ slug: customSlug });
      if (slugExists) {
        return res.status(400).json({
          success: false,
          message:
            "A blog with this slug already exists. Please use a different slug.",
        });
      }
    }

    // ENHANCED: Create blog with WebP image URL and additional metadata
    const blog = new Blog({
      title,
      content,
      author: req.user._id,
      metaDescription,
      metaKeywords: metaKeywords
        ? Array.isArray(metaKeywords)
          ? metaKeywords
          : metaKeywords.split(",").map((kw) => kw.trim())
        : [],
      imageUrl, // This is now WebP format
      status: status || "published",
      authorId: authorId,
      categoryId: categoryId,
      tags: formattedTags,
      excerpt: excerpt,
      imageAlt: imageAlt,
      isFeatured: isFeatured === "true" || isFeatured === true,
      publishDate: publishDate ? new Date(publishDate) : new Date(),
      ...(customSlug && { slug: customSlug }),
      
      // ADDED: Store WebP optimization metadata
      imageMetadata: {
        format: 'webp',
        originalFormat: originalFormat,
        isAnimated: isAnimated,
        cloudinaryPublicId: req.file.filename,
        responsiveUrls: responsiveUrls,
        blogPostUrl: blogPostUrl
      }
    });

    await blog.save();
    await blog.populate("author", "name");
    if (blog.categoryId) await blog.populate("categoryId", "name");
    if (blog.authorId) await blog.populate("authorId", "name");

    // ENHANCED: Get final optimization stats
    let optimizationStats = null;
    try {
      const imageDetails = await cloudinary.api.resource(req.file.filename);
      optimizationStats = {
        finalSize: Math.round(imageDetails.bytes / 1024),
        format: imageDetails.format,
        dimensions: {
          width: imageDetails.width,
          height: imageDetails.height
        }
      };
      console.log(`✅ KheyaMind AI Blog created with WebP image: ${optimizationStats.finalSize}KB`);
    } catch (error) {
      console.warn('Could not fetch image optimization stats:', error.message);
    }

    // ENHANCED: Return response with WebP optimization info
    res.status(201).json({
      success: true,
      blog,
      message: `Blog created successfully with ${originalFormat.toUpperCase()} → WebP optimization${isAnimated ? ' (animation preserved)' : ''}`,
      
      // ADDED: WebP optimization details for admin dashboard
      optimization: optimizationStats && {
        format: 'webp',
        originalFormat: originalFormat,
        isAnimated: isAnimated,
        finalSize: optimizationStats.finalSize,
        dimensions: optimizationStats.dimensions,
        responsiveUrls: responsiveUrls
      }
    });
    
  } catch (error) {
    // Enhanced error logging
    console.error('❌ KheyaMind AI Blog creation error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      fullError: error
    });

    res.status(500).json({
      success: false,
      message: error.message || "Failed to create blog",
      error: {
        name: error.name,
        details: error.message
      }
    });
  }
});

// @route   PUT /api/blogs/:id
// @desc    Update a blog with WebP image upload
// @access  Private (Admin only)
router.put("/:id", authenticate, authorizeAdmin, upload.single("image"), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    const {
      title,
      content,
      metaDescription,
      metaKeywords,
      status,
      authorId,
      categoryId,
      tags,
      excerpt,
      imageAlt,
      isFeatured,
      slug,
      publishDate,
    } = req.body;

    // ENHANCED: Handle WebP image updates
    let imageUpdateInfo = null;
    if (req.file) {
      const originalFormat = req.file.mimetype.split('/')[1];
      const isAnimated = req.file.originalname.toLowerCase().endsWith('.gif');
      
      console.log(`🔄 KheyaMind AI Blog Update: Processing ${originalFormat.toUpperCase()} → WebP`);
      console.log('📁 New Cloudinary WebP URL:', req.file.path);
      
      // Generate responsive URLs for the new image
      const responsiveUrls = generateWebPUrls(req.file.filename);
      const blogPostUrl = cloudinary.url(req.file.filename, getOptimizedTransformation('blog'));
      
      imageUpdateInfo = {
        format: 'webp',
        originalFormat: originalFormat,
        isAnimated: isAnimated,
        cloudinaryPublicId: req.file.filename,
        responsiveUrls: responsiveUrls,
        blogPostUrl: blogPostUrl
      };
    }

    // Check if a custom slug was provided
    if (slug !== undefined) {
      // If slug is empty string, don't update it (keep the existing one)
      if (slug !== "") {
        const customSlug = slugify(slug);
        // Only check for duplicates if the slug is actually changing
        if (customSlug !== blog.slug) {
          // Check if the new slug already exists in another blog
          const slugExists = await Blog.findOne({
            slug: customSlug,
            _id: { $ne: req.params.id }, // Exclude current blog
          });

          if (slugExists) {
            return res.status(400).json({
              success: false,
              message:
                "A blog with this slug already exists. Please use a different slug.",
            });
          }

          // Set the new slug
          blog.slug = customSlug;
        }
      }
    }

    // Validate required fields
    if (title === "") {
      return res.status(400).json({
        success: false,
        message: "Title cannot be empty",
      });
    }

    if (content === "") {
      return res.status(400).json({
        success: false,
        message: "Content cannot be empty",
      });
    }

    if (excerpt === "") {
      return res.status(400).json({
        success: false,
        message: "Excerpt cannot be empty",
      });
    }

    if (imageAlt === "") {
      return res.status(400).json({
        success: false,
        message: "Image alt text cannot be empty",
      });
    }

    if (categoryId === null || categoryId === "") {
      return res.status(400).json({
        success: false,
        message: "Category is required",
      });
    }

    if (authorId === null || authorId === "") {
      return res.status(400).json({
        success: false,
        message: "Author is required",
      });
    }

    // Format tags if provided
    let formattedTags;
    if (tags !== undefined) {
      if (Array.isArray(tags)) {
        formattedTags = tags.filter((tag) => tag && tag.trim() !== "");
        if (formattedTags.length === 0) {
          return res.status(400).json({
            success: false,
            message: "At least one non-empty tag is required",
          });
        }
      } else if (typeof tags === "string") {
        formattedTags = tags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag !== "");
        if (formattedTags.length === 0) {
          return res.status(400).json({
            success: false,
            message: "At least one non-empty tag is required",
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: "Tags must be provided as a string or array",
        });
      }
    }

    // Update blog fields
    blog.title = title || blog.title;
    blog.content = content || blog.content;
    blog.metaDescription =
      metaDescription !== undefined ? metaDescription : blog.metaDescription;
    blog.metaKeywords = metaKeywords
      ? Array.isArray(metaKeywords)
        ? metaKeywords
        : metaKeywords.split(",").map((kw) => kw.trim())
      : blog.metaKeywords;
    blog.authorId = authorId !== undefined ? authorId : blog.authorId;
    blog.categoryId = categoryId !== undefined ? categoryId : blog.categoryId;
    blog.tags = formattedTags !== undefined ? formattedTags : blog.tags;
    blog.excerpt = excerpt !== undefined ? excerpt : blog.excerpt;
    blog.imageAlt = imageAlt !== undefined ? imageAlt : blog.imageAlt;

    // Handle isFeatured properly for both true and false values
    if (isFeatured !== undefined) {
      blog.isFeatured = isFeatured === "true" || isFeatured === true;
    }

    // ENHANCED: Update image with WebP optimization
    if (req.file) {
      // Use the new Cloudinary WebP URL
      blog.imageUrl = req.file.path;
      
      // ADDED: Update image metadata with WebP info
      blog.imageMetadata = imageUpdateInfo;
      
    } else if (req.body.imageUrl) {
      // Use the provided image URL (fallback)
      blog.imageUrl = req.body.imageUrl;
    }

    blog.status = status || blog.status;

    // Update publishDate if provided
    if (publishDate) {
      blog.publishDate = new Date(publishDate);
    }

    await blog.save();
    await blog.populate("author", "name");
    if (blog.categoryId) await blog.populate("categoryId", "name");
    if (blog.authorId) await blog.populate("authorId", "name");

    // ENHANCED: Get optimization stats for updated image
    let optimizationStats = null;
    if (req.file) {
      try {
        const imageDetails = await cloudinary.api.resource(req.file.filename);
        optimizationStats = {
          finalSize: Math.round(imageDetails.bytes / 1024),
          format: imageDetails.format,
          dimensions: {
            width: imageDetails.width,
            height: imageDetails.height
          }
        };
        console.log(`✅ KheyaMind AI Blog updated with WebP image: ${optimizationStats.finalSize}KB`);
      } catch (error) {
        console.warn('Could not fetch image optimization stats:', error.message);
      }
    }

    // ENHANCED: Return response with WebP info
    res.json({
      success: true,
      blog,
      message: imageUpdateInfo 
        ? `Blog updated with ${imageUpdateInfo.originalFormat.toUpperCase()} → WebP optimization${imageUpdateInfo.isAnimated ? ' (animation preserved)' : ''}`
        : "Blog updated successfully",
      
      // ADDED: WebP optimization details if image was updated
      optimization: optimizationStats && {
        format: 'webp',
        originalFormat: imageUpdateInfo?.originalFormat,
        isAnimated: imageUpdateInfo?.isAnimated,
        finalSize: optimizationStats.finalSize,
        dimensions: optimizationStats.dimensions,
        responsiveUrls: imageUpdateInfo?.responsiveUrls
      }
    });
    
  } catch (error) {
    console.error('❌ KheyaMind AI Blog update error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to update blog",
      error: error.message,
    });
  }
});

// @route   DELETE /api/blogs/:id
// @desc    Delete a blog
// @access  Private (Admin only)
router.delete("/:id", authenticate, authorizeAdmin, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    // ENHANCED: Also delete image from Cloudinary if it exists
    if (blog.imageMetadata && blog.imageMetadata.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(blog.imageMetadata.cloudinaryPublicId);
        console.log(`🗑️ Deleted Cloudinary image: ${blog.imageMetadata.cloudinaryPublicId}`);
      } catch (error) {
        console.warn('Could not delete Cloudinary image:', error.message);
      }
    }

    await blog.deleteOne();

    res.json({
      success: true,
      message: "Blog and associated images removed successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to delete blog",
      error: error.message,
    });
  }
});

// ADDED: New route to get WebP optimization stats
// @route   GET /api/blogs/stats/optimization
// @desc    Get WebP optimization statistics for KheyaMind AI blog
// @access  Private (Admin only)
router.get("/stats/optimization", authenticate, authorizeAdmin, async (req, res) => {
  try {
    // Get all blogs with image metadata
    const blogs = await Blog.find({
      imageMetadata: { $exists: true }
    }).select('imageMetadata createdAt').lean();

    // Calculate optimization statistics
    const stats = blogs.reduce((acc, blog) => {
      acc.totalBlogs++;
      
      if (blog.imageMetadata && blog.imageMetadata.format === 'webp') {
        acc.webpBlogs++;
        
        if (blog.imageMetadata.isAnimated) {
          acc.animatedWebp++;
        }
        
        // Track original formats
        const originalFormat = blog.imageMetadata.originalFormat;
        acc.originalFormats[originalFormat] = (acc.originalFormats[originalFormat] || 0) + 1;
      }
      
      return acc;
    }, {
      totalBlogs: 0,
      webpBlogs: 0,
      animatedWebp: 0,
      originalFormats: {}
    });

    // Calculate adoption rate
    const webpAdoption = stats.totalBlogs > 0 
      ? Math.round((stats.webpBlogs / stats.totalBlogs) * 100) 
      : 0;

    res.json({
      success: true,
      data: {
        summary: {
          totalBlogs: stats.totalBlogs,
          webpBlogs: stats.webpBlogs,
          animatedWebp: stats.animatedWebp,
          webpAdoption: webpAdoption,
          originalFormats: stats.originalFormats
        },
        message: `KheyaMind AI Blog: ${webpAdoption}% WebP adoption rate`,
        recommendations: webpAdoption < 100 ? [
          "Consider updating older blog images to WebP format for better performance",
          "WebP images load 3x faster and improve SEO rankings",
          "All new uploads are automatically optimized to WebP"
        ] : [
          "Excellent! All blog images are WebP optimized",
          "Your blog is delivering maximum performance to users worldwide"
        ]
      }
    });
    
  } catch (error) {
    console.error('Error fetching optimization stats:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch optimization statistics",
      error: error.message,
    });
  }
});

// ADDED: New route to get responsive URLs for existing images
// @route   GET /api/blogs/:id/responsive-urls
// @desc    Get responsive WebP URLs for a specific blog image
// @access  Public
router.get("/:id/responsive-urls", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).select('imageMetadata imageUrl').lean();

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    // Generate responsive URLs if we have the Cloudinary public ID
    let responsiveUrls = null;
    if (blog.imageMetadata && blog.imageMetadata.cloudinaryPublicId) {
      responsiveUrls = generateWebPUrls(blog.imageMetadata.cloudinaryPublicId);
    } else if (blog.imageUrl) {
      // For backward compatibility, try to extract public ID from URL
      const urlParts = blog.imageUrl.split('/');
      const publicIdWithExt = urlParts[urlParts.length - 1];
      const publicId = publicIdWithExt.split('.')[0];
      responsiveUrls = generateWebPUrls(publicId);
    }

    res.json({
      success: true,
      data: {
        originalUrl: blog.imageUrl,
        responsiveUrls: responsiveUrls,
        isWebP: blog.imageMetadata ? blog.imageMetadata.format === 'webp' : false,
        metadata: blog.imageMetadata || null
      }
    });
    
  } catch (error) {
    console.error('Error generating responsive URLs:', error);
    res.status(500).json({
      success: false,
      message: "Failed to generate responsive URLs",
      error: error.message,
    });
  }
});

module.exports = router;
