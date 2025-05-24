const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

// Import Routes
const authRoutes = require("./routes/auth.routes");
const blogRoutes = require("./routes/blog.routes");
const userRoutes = require("./routes/user.routes");
const categoryRoutes = require("./routes/category.routes");

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());

// ENHANCED: Increased payload limits for file uploads (MINIMAL CHANGE)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ 
  limit: '15mb', 
  extended: true
}));

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    // Increase timeout values
    serverSelectionTimeoutMS: 30000, // 30 seconds
    socketTimeoutMS: 45000, // 45 seconds
    maxPoolSize: 10, // Maintain up to 10 socket connections
    serverApi: { version: '1', strict: true, deprecationErrors: true }
  })
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch((err) => {
    console.error("❌ Could not connect to MongoDB", err);
    // Log more detailed error information
    if (err.name === "MongooseServerSelectionError" && err.message.includes("buffering timed out")) {
      console.error("❌ MongoDB Server Selection Error: Please check your connection string and network.");
    }
    console.error("❌ Full MongoDB Error details:", err.message);
  });

// Test route
app.get("/", (req, res) => {
  console.log("🎯 Root endpoint accessed");
  res.json({ message: "KheyaMind AI Blog Platform Backend API is running!" });
});

// Set global configuration for all queries
mongoose.Query.prototype.setOptions({
  maxTimeMS: 30000, // 30 seconds timeout
});

// Handle MongoDB timeout errors
mongoose.connection.on('error', (err) => {
  if (err.name === "MongooseServerSelectionError" && err.message.includes("buffering timed out")) {
    console.error("❌ MongoDB Server Selection Error: Please check your connection string and network.");
  }
  console.error("❌ Database operation failed:", err.message);
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "✅ Server is running",
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected"
  });
});

// Default error handler
app.use((error, req, res, next) => {
  console.error("❌ Unhandled Error:", error);
  
  // Handle different types of errors
  if (error.name === "MongooseError" && error.message.includes("buffering timed out")) {
    return res.status(500).json({
      success: false,
      message: "Database query timed out. Try using pagination or narrowing your search criteria.",
      error: error.message,
    });
  }
  
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: "File too large. Maximum size is 15MB.",
      error: "File size limit exceeded"
    });
  }
  
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
  });
});

// Handle 404s
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 KheyaMind AI Blog Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
});

module.exports = app;
