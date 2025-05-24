const express = require("express");
const multer = require('multer');
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

// VERCEL FIX: Simplified error handler
const handleError = (res, error, message = "Operation failed") => {
  console.error('Error:', error.message);
  
  if (error.message && error.message.includes('buffering timed out')) {
    return res.status(504).json({
      success: false,
      message: "Query timed out. Try using pagination.",
      error: error.message
    });
  }
  
  res.status(500).json({
    success: false,
    message,
    error: error.message
  });
};

// @route   GET /api/blogs
// @desc    Get all blogs with pagination
// @access  Public
router.get("/", async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};

    // Simplified search
    if (req.query.search && req.query.search.length > 2) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { content: { $regex: req.query.search, $options: "i" } }
      ];
    }

    // Basic query with timeout
    let query = Blog.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .select('title slug excerpt imageUrl imageAlt tags publishDate status isFeatured createdAt categoryId authorId')
      .populate("categoryId", "name")
      .populate("authorId", "name")
      .maxTimeMS(20000);

    // Simple pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    query = query.skip(skip).limit(limit);

    const blogs = await query;
    const totalCount = await Blog.countDocuments(filter).maxTimeMS(10000);

    res.json({
      success: true,
      blogs,
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch blogs");
  }
});

// @route   GET /api/blogs/published
// @desc    Get published blogs
// @access  Public
router.get("/published", async (req, res) => {
  try {
    const currentDate = new Date();
    const filter = {
      status: "published",
      $or: [
        { publishDate: { $lte: currentDate } },
        { publishDate: { $exists: false } }
      ]
    };

    // Simple search
    if (req.query.search) {
      filter.$and = [{
        $or: [
          { title: { $regex: req.query.search, $options: "i" } },
          { content: { $regex: req.query.search, $options: "i" } }
        ]
      }];
    }

    let query = Blog.find(filter)
      .sort({ publishDate: -1 })
      .populate("categoryId", "name")
      .populate("authorId", "name")
      .maxTimeMS(20000);

    // Pagination
    if (req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit);
      const skip = (page - 1) * limit;
      query = query.skip(skip).limit(limit);
    }

    const blogs = await query;
    const totalCount = await Blog.countDocuments(filter).maxTimeMS(10000);

    const response = {
      success: true,
      blogs,
      totalCount
    };

    if (req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit);
      response.currentPage = page;
      response.totalPages = Math.ceil(totalCount / limit);
    }

    res.json(response);
  } catch (error) {
    handleError(res, error, "Failed to fetch published blogs");
  }
});

// @route   GET /api/blogs/featured
// @desc    Get featured blogs
// @access  Public
router.get("/featured", async (req, res) => {
  try {
    const currentDate = new Date();
    const filter = {
      isFeatured: true,
      status: "published",
      $or: [
        { publishDate: { $lte: currentDate } },
        { publishDate: { $exists: false } }
      ]
    };

    let query = Blog.find(filter)
      .sort({ publishDate: -1 })
      .populate("categoryId", "name")
      .populate("authorId", "name")
      .maxTimeMS(15000);

    if (req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit);
      const skip = (page - 1) * limit;
      query = query.skip(skip).limit(limit);
    }

    const blogs = await query;
    const totalCount = await Blog.countDocuments(filter).maxTimeMS(8000);

    const response = {
      success: true,
      blogs,
      totalCount
    };

    if (req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit);
      response.currentPage = page;
      response.totalPages = Math.ceil(totalCount / limit);
    }

    res.json(response);
  } catch (error) {
    handleError(res, error, "Failed to fetch featured blogs");
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
      .maxTimeMS(10000);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found"
      });
    }

    res.json({
      success: true,
      blog
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch blog");
  }
});

// @route   GET /api/blogs/slug/:slug
// @desc    Get blog by slug
// @access  Public
router.get("/slug/:slug", async (req, res) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug })
      .lean()
      .populate("authorId", "name")
      .populate("categoryId", "name")
      .maxTimeMS(10000);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found"
      });
    }

    // Check if published and not future-dated
    const currentDate = new Date();
    if (blog.status === "published" && blog.publishDate > currentDate) {
      return res.status(404).json({
        success: false,
        message: "Blog not found"
      });
    }

    res.json({
      success: true,
      blog
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch blog");
  }
});

// @route   POST /api/blogs
// @desc    Create a new blog with WebP image upload
// @access  Private (Admin only)
router.post("/", authenticate, authorizeAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Blog image is required"
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
      publishDate,
      slug
    } = req.body;

    // Basic validation
    if (!title || !content || !excerpt || !imageAlt || !categoryId || !authorId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // Process tags
    let formattedTags;
    if (Array.isArray(tags)) {
      formattedTags = tags.filter(tag => tag && tag.trim() !== "");
    } else if (typeof tags === "string") {
      formattedTags = tags.split(",").map(tag => tag.trim()).filter(tag => tag !== "");
    }

    if (!formattedTags || formattedTags.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one tag is required"
      });
    }

    // Handle custom slug
    let customSlug = null;
    if (slug) {
      customSlug = slugify(slug);
      const slugExists = await Blog.findOne({ slug: customSlug }).maxTimeMS(8000);
      if (slugExists) {
        return res.status(400).json({
          success: false,
          message: "Slug already exists"
        });
      }
    }

    // Process image metadata
    const originalFormat = req.file.mimetype.split('/')[1];
    const isAnimated = req.file.originalname.toLowerCase().endsWith('.gif');
    const fileSizeKB = Math.round((req.file.size || 0) / 1024);

    // Generate responsive URLs
    let responsiveUrls = { original: req.file.path };
    try {
      responsiveUrls = generateWebPUrls(req.file.filename);
    } catch (error) {
      console.warn('Could not generate responsive URLs:', error.message);
    }

    // Create blog
    const blog = new Blog({
      title,
      content,
      author: req.user._id,
      metaDescription,
      metaKeywords: metaKeywords ? 
        (Array.isArray(metaKeywords) ? metaKeywords : metaKeywords.split(",").map(kw => kw.trim())) : [],
      imageUrl: req.file.path,
      status: status || "published",
      authorId,
      categoryId,
      tags: formattedTags,
      excerpt,
      imageAlt,
      isFeatured: isFeatured === "true" || isFeatured === true,
      publishDate: publishDate ? new Date(publishDate) : new Date(),
      ...(customSlug && { slug: customSlug }),
      imageMetadata: {
        format: 'webp',
        originalFormat,
        isAnimated,
        originalSize: fileSizeKB,
        cloudinaryPublicId: req.file.filename,
        responsiveUrls,
        uploadedAt: new Date()
      }
    });

    await blog.save({ maxTimeMS: 15000 });

    // Populate fields
    await blog.populate("authorId", "name");
    if (blog.categoryId) await blog.populate("categoryId", "name");

    res.status(201).json({
      success: true,
      blog,
      message: `Blog created successfully! ${originalFormat.toUpperCase()} → WebP${isAnimated ? ' (animation preserved)' : ''}`
    });

  } catch (error) {
    handleError(res, error, "Failed to create blog");
  }
});

// @route   PUT /api/blogs/:id
// @desc    Update a blog
// @access  Private (Admin only)
router.put("/:id", authenticate, authorizeAdmin, upload.single("image"), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found"
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
      publishDate
    } = req.body;

    // Handle image update
    if (req.file) {
      const originalFormat = req.file.mimetype.split('/')[1];
      const isAnimated = req.file.originalname.toLowerCase().endsWith('.gif');
      const fileSizeKB = Math.round((req.file.size || 0) / 1024);
      
      let responsiveUrls = { original: req.file.path };
      try {
        responsiveUrls = generateWebPUrls(req.file.filename);
      } catch (error) {
        console.warn('Could not generate responsive URLs:', error.message);
      }

      blog.imageUrl = req.file.path;
      blog.imageMetadata = {
        format: 'webp',
        originalFormat,
        isAnimated,
        originalSize: fileSizeKB,
        cloudinaryPublicId: req.file.filename,
        responsiveUrls,
        uploadedAt: new Date()
      };
    }

    // Handle slug update
    if (slug !== undefined && slug !== "") {
      const customSlug = slugify(slug);
      if (customSlug !== blog.slug) {
        const slugExists = await Blog.findOne({
          slug: customSlug,
          _id: { $ne: req.params.id }
        }).maxTimeMS(8000);

        if (slugExists) {
          return res.status(400).json({
            success: false,
            message: "Slug already exists"
          });
        }
        blog.slug = customSlug;
      }
    }

    // Basic validation
    if (title === "" || content === "" || excerpt === "" || imageAlt === "") {
      return res.status(400).json({
        success: false,
        message: "Required fields cannot be empty"
      });
    }

    // Format tags
    if (tags !== undefined) {
      let formattedTags;
      if (Array.isArray(tags)) {
        formattedTags = tags.filter(tag => tag && tag.trim() !== "");
      } else if (typeof tags === "string") {
        formattedTags = tags.split(",").map(tag => tag.trim()).filter(tag => tag !== "");
      }

      if (formattedTags && formattedTags.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one tag is required"
        });
      }
      blog.tags = formattedTags;
    }

    // Update fields
    if (title !== undefined) blog.title = title;
    if (content !== undefined) blog.content = content;
    if (metaDescription !== undefined) blog.metaDescription = metaDescription;
    if (metaKeywords !== undefined) {
      blog.metaKeywords = Array.isArray(metaKeywords) ? 
        metaKeywords : metaKeywords.split(",").map(kw => kw.trim());
    }
    if (authorId !== undefined) blog.authorId = authorId;
    if (categoryId !== undefined) blog.categoryId = categoryId;
    if (excerpt !== undefined) blog.excerpt = excerpt;
    if (imageAlt !== undefined) blog.imageAlt = imageAlt;
    if (isFeatured !== undefined) blog.isFeatured = isFeatured === "true" || isFeatured === true;
    if (status !== undefined) blog.status = status;
    if (publishDate !== undefined) blog.publishDate = new Date(publishDate);

    await blog.save({ maxTimeMS: 15000 });

    // Populate fields
    await blog.populate("authorId", "name");
    if (blog.categoryId) await blog.populate("categoryId", "name");

    res.json({
      success: true,
      blog,
      message: req.file ? "Blog updated with new WebP image" : "Blog updated successfully"
    });

  } catch (error) {
    handleError(res, error, "Failed to update blog");
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
        message: "Blog not found"
      });
    }

    // Delete from Cloudinary if exists
    if (blog.imageMetadata && blog.imageMetadata.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(blog.imageMetadata.cloudinaryPublicId);
      } catch (error) {
        console.warn('Could not delete Cloudinary image:', error.message);
      }
    }

    await blog.deleteOne();

    res.json({
      success: true,
      message: "Blog deleted successfully"
    });
  } catch (error) {
    handleError(res, error, "Failed to delete blog");
  }
});

// @route   GET /api/blogs/stats/optimization
// @desc    Get WebP optimization statistics
// @access  Private (Admin only)
router.get("/stats/optimization", authenticate, authorizeAdmin, async (req, res) => {
  try {
    const blogs = await Blog.find({
      imageMetadata: { $exists: true }
    }).select('imageMetadata').lean().maxTimeMS(15000);

    const stats = blogs.reduce((acc, blog) => {
      acc.totalBlogs++;
      if (blog.imageMetadata && blog.imageMetadata.format === 'webp') {
        acc.webpBlogs++;
        if (blog.imageMetadata.isAnimated) acc.animatedWebp++;
        
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

    const webpAdoption = stats.totalBlogs > 0 ? 
      Math.round((stats.webpBlogs / stats.totalBlogs) * 100) : 0;

    res.json({
      success: true,
      data: {
        summary: {
          totalBlogs: stats.totalBlogs,
          webpBlogs: stats.webpBlogs,
          animatedWebp: stats.animatedWebp,
          webpAdoption,
          originalFormats: stats.originalFormats
        },
        message: `KheyaMind AI Blog: ${webpAdoption}% WebP adoption rate`
      }
    });

  } catch (error) {
    handleError(res, error, "Failed to fetch optimization statistics");
  }
});

module.exports = router;
