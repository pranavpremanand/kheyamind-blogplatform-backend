const express = require("express");
const multer = require("multer"); // Explicitly import multer
const Blog = require("../models/blog.model");
const { authenticate, authorizeAdmin } = require("../utils/auth");
const upload = require("../utils/upload");
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
      .select('-content') // Exclude large content field initially for better performance
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
    const blogs = await query.maxTimeMS(20000); // Set 20 second timeout for this query

    // Get total count with a separate, simpler query
    // Use estimatedDocumentCount if no filters for better performance
    const totalCount = Object.keys(filter).length === 0 
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
    if (error.name === 'MongooseError' && error.message.includes('buffering timed out')) {
      return res.status(500).json({
        success: false,
        message: "Query timed out. Try using pagination or narrowing your search criteria.",
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
      .populate("author", "name")
      .populate("authorId", "name")
      .populate("categoryId", "name");

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
// @desc    Create a new blog with image upload
// @access  Private (Admin only)
router.post("/", authenticate, authorizeAdmin, (req, res) => {
  // Use upload middleware with improved error handling
  upload.single("image")(req, res, async (err) => {
    try {
      if (err) {
        if (err instanceof multer.MulterError) {
          // A Multer error occurred when uploading
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
              success: false,
              message: "File size too large. Max size is 2MB.",
            });
          }
          if (err.code === "LIMIT_FIELD_VALUE") {
            return res.status(400).json({
              message:
                "Field value too large. Maximum field size is 2MB. Try reducing content size.",
            });
          }
          return res
            .status(400)
            .json({ message: `Upload error: ${err.message}` });
        } else {
          // An unknown error occurred
          return res
            .status(500)
            .json({ message: `Server error: ${err.message}` });
        }
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
        slug,
      } = req.body;

      // Check if image was uploaded (required)
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Blog image is required",
        });
      }
      
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
      
      if (!tags || (Array.isArray(tags) && tags.length === 0) || 
          (typeof tags === 'string' && tags.trim() === '')) {
        return res.status(400).json({
          success: false,
          message: "At least one tag is required",
        });
      }
      
      // Ensure tags is properly formatted
      let formattedTags;
      if (Array.isArray(tags)) {
        // Filter out any empty tags
        formattedTags = tags.filter(tag => tag && tag.trim() !== '');
        if (formattedTags.length === 0) {
          return res.status(400).json({
            success: false,
            message: "At least one non-empty tag is required",
          });
        }
      } else if (typeof tags === 'string') {
        // Split by comma and filter out empty tags
        formattedTags = tags.split(',')
          .map(tag => tag.trim())
          .filter(tag => tag !== '');
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

      let imageUrl;

      if (req.file) {
        // Convert buffer to base64 string if file was uploaded
        imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString(
          "base64"
        )}`;
      } else if (req.body.imageUrl) {
        // Use the provided image URL
        imageUrl = req.body.imageUrl;
      } else {
        return res.status(400).json({
          success: false,
          message:
            "Blog image is required (either upload a file or provide an imageUrl)",
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
            message: "A blog with this slug already exists. Please use a different slug.",
          });
        }
      }

      // Create blog
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
        imageUrl,
        status: status || "published",
        authorId: authorId,
        categoryId: categoryId,
        tags: formattedTags,
        excerpt: excerpt,
        imageAlt: imageAlt,
        isFeatured: isFeatured === "true" || isFeatured === true,
        publishDate: publishDate ? new Date(publishDate) : new Date(),
        // Set custom slug if provided
        ...(customSlug && { slug: customSlug }),
      });

      await blog.save();
      await blog.populate("author", "name");
      if (blog.categoryId) await blog.populate("categoryId", "name");
      if (blog.authorId) await blog.populate("authorId", "name");

      res.status(201).json({
        success: true,
        blog,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Failed to create blog",
        error: error.message,
      });
    }
  });
});

// @route   PUT /api/blogs/:id
// @desc    Update a blog with image upload
// @access  Private (Admin only)
router.put("/:id", authenticate, authorizeAdmin, (req, res) => {
  // Use upload middleware with improved error handling
  upload.single("image")(req, res, async (err) => {
    try {
      if (err) {
        if (err instanceof multer.MulterError) {
          // A Multer error occurred when uploading
          if (err.code === "LIMIT_FILE_SIZE") {
            return res
              .status(400)
              .json({ message: "File size too large. Max size is 5MB." });
          }
          if (err.code === "LIMIT_FIELD_VALUE") {
            return res.status(400).json({
              message:
                "Field value too large. Maximum field size is 5MB. Try reducing content size.",
            });
          }
          return res
            .status(400)
            .json({ message: `Upload error: ${err.message}` });
        } else {
          // An unknown error occurred
          return res
            .status(500)
            .json({ message: `Server error: ${err.message}` });
        }
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

      console.log("Request body:", req.body);
      console.log("isFeatured value:", isFeatured, "type:", typeof isFeatured);

      const blog = await Blog.findById(req.params.id);

      if (!blog) {
        return res.status(404).json({
          success: false,
          message: "Blog not found",
        });
      }

      // Check if a custom slug was provided
      if (slug !== undefined) {
        // If slug is empty string, don't update it (keep the existing one)
        if (slug !== '') {
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
      if (title === '') {
        return res.status(400).json({
          success: false,
          message: "Title cannot be empty",
        });
      }
      
      if (content === '') {
        return res.status(400).json({
          success: false,
          message: "Content cannot be empty",
        });
      }
      
      if (excerpt === '') {
        return res.status(400).json({
          success: false,
          message: "Excerpt cannot be empty",
        });
      }
      
      if (imageAlt === '') {
        return res.status(400).json({
          success: false,
          message: "Image alt text cannot be empty",
        });
      }
      
      if (categoryId === null || categoryId === '') {
        return res.status(400).json({
          success: false,
          message: "Category is required",
        });
      }
      
      if (authorId === null || authorId === '') {
        return res.status(400).json({
          success: false,
          message: "Author is required",
        });
      }
      
      if (tags !== undefined && 
          ((Array.isArray(tags) && tags.length === 0) || 
           (typeof tags === 'string' && tags.trim() === ''))) {
        return res.status(400).json({
          success: false,
          message: "At least one tag is required",
        });
      }
      
      // Format tags if provided
      let formattedTags;
      if (tags !== undefined) {
        if (Array.isArray(tags)) {
          // Filter out any empty tags
          formattedTags = tags.filter(tag => tag && tag.trim() !== '');
          if (formattedTags.length === 0) {
            return res.status(400).json({
              success: false,
              message: "At least one non-empty tag is required",
            });
          }
        } else if (typeof tags === 'string') {
          // Split by comma and filter out empty tags
          formattedTags = tags.split(',')
            .map(tag => tag.trim())
            .filter(tag => tag !== '');
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
        // Convert string values to boolean
        if (isFeatured === "true" || isFeatured === true) {
          blog.isFeatured = true;
        } else if (isFeatured === "false" || isFeatured === false) {
          blog.isFeatured = false;
        }
      }

      // Update image if a new one was uploaded or URL provided
      if (req.file) {
        // Convert buffer to base64 string
        const imageBase64 = `data:${
          req.file.mimetype
        };base64,${req.file.buffer.toString("base64")}`;
        blog.imageUrl = imageBase64;
      } else if (req.body.imageUrl) {
        // Use the provided image URL
        blog.imageUrl = req.body.imageUrl;
      }

      blog.status = status || blog.status;

      // Update publishDate if provided
      if (publishDate) {
        blog.publishDate = new Date(publishDate);
      }

      // updatedAt will be handled by the pre-save hook

      await blog.save();
      await blog.populate("author", "name");
      if (blog.categoryId) await blog.populate("categoryId", "name");
      if (blog.authorId) await blog.populate("authorId", "name");

      res.json({
        success: true,
        blog,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Failed to update blog",
        error: error.message,
      });
    }
  });
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

    await blog.deleteOne();

    res.json({
      success: true,
      message: "Blog removed",
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

module.exports = router;

