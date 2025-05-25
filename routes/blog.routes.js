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
const dbConnect = require("../lib/dbConnect");

const router = express.Router();

const handleError = (res, error, message = "Operation failed") => {
  console.error('Error:', error.message);
  if (error.message && error.message.includes('buffering timed out')) {
    return res.status(504).json({ success: false, message: "Query timed out. Try using pagination.", error: error.message });
  }
  res.status(500).json({ success: false, message, error: error.message });
};

router.get("/", async (req, res) => {
  try {
    await dbConnect();
    const filter = req.query.status ? { status: req.query.status } : {};
    if (req.query.search && req.query.search.length > 2) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { content: { $regex: req.query.search, $options: "i" } }
      ];
    }
    let query = Blog.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .select('title slug excerpt imageUrl imageAlt tags publishDate status isFeatured createdAt categoryId authorId')
      .populate("categoryId", "name")
      .populate("authorId", "name")
      .maxTimeMS(20000);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    query = query.skip(skip).limit(limit);
    const blogs = await query;
    const totalCount = await Blog.countDocuments(filter).maxTimeMS(10000);
    res.json({ success: true, blogs, totalCount, currentPage: page, totalPages: Math.ceil(totalCount / limit) });
  } catch (error) {
    handleError(res, error, "Failed to fetch blogs");
  }
});

router.get("/published", async (req, res) => {
  try {
    await dbConnect();
    const currentDate = new Date();
    const filter = {
      status: "published",
      $or: [
        { publishDate: { $lte: currentDate } },
        { publishDate: { $exists: false } }
      ]
    };
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
    if (req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit);
      const skip = (page - 1) * limit;
      query = query.skip(skip).limit(limit);
    }
    const blogs = await query;
    const totalCount = await Blog.countDocuments(filter).maxTimeMS(10000);
    const response = { success: true, blogs, totalCount };
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

router.get("/featured", async (req, res) => {
  try {
    await dbConnect();
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
    const response = { success: true, blogs, totalCount };
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

router.get("/slug/:slug", async (req, res) => {
  try {
    await dbConnect();
    const blog = await Blog.findOne({ slug: req.params.slug })
      .lean()
      .populate("authorId", "name")
      .populate("categoryId", "name")
      .maxTimeMS(10000);
    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }
    const currentDate = new Date();
    if (blog.status === "published" && blog.publishDate > currentDate) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }
    res.json({ success: true, blog });
  } catch (error) {
    handleError(res, error, "Failed to fetch blog");
  }
});
