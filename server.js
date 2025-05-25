const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const path = require("path");

// Import routes
const authRoutes = require("./routes/auth.routes");
const blogRoutes = require("./routes/blog.routes");
const userRoutes = require("./routes/user.routes");
const categoryRoutes = require("./routes/category.routes");
const authorRoutes = require("./routes/author.routes");

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());

// Increased JSON payload size limit to 50MB
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(morgan("dev"));

// No longer serving uploaded files from filesystem as we're using base64 images

// Connect to MongoDB with improved options
mongoose
  .connect(process.env.MONGODB_URI, {
    // Increase timeout values
    serverSelectionTimeoutMS: 30000, // 30 seconds
    socketTimeoutMS: 45000, // 45 seconds
    // Performance and reliability options
    maxPoolSize: 50, // Increase connection pool size
    minPoolSize: 5, // Minimum connections to maintain
    connectTimeoutMS: 30000, // Connection timeout
    // Enable unified topology
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");

    // Set global configuration for all queries
    mongoose.set('maxTimeMS', 30000); // 30 second timeout for all queries

    // Add a global timeout handler for all MongoDB operations
    const originalExec = mongoose.Query.prototype.exec;
    mongoose.Query.prototype.exec = function(...args) {
      // Set a default timeout if not already set
      if (!this.options.maxTimeMS) {
        this.options.maxTimeMS = 30000; // 30 seconds default timeout
      }
      
      // Add better error handling for timeouts
      return originalExec.apply(this, args).catch(err => {
        if (err.message && err.message.includes('buffering timed out')) {
          console.error(`MongoDB query timeout: ${this.getQuery()}`);
          err.message = 'Query timed out. Try using pagination or narrowing your search criteria.';
        }
        throw err;
      });
    };

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Could not connect to MongoDB", err);
    // Log more detailed error information
    if (err.name === "MongoServerSelectionError") {
      console.error(
        "MongoDB Server Selection Error. Please check your connection string and network."
      );
    }
  });

// Test route
app.get("/", (req, res) => {
  res.send("Hello World");
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/authors", authorRoutes);

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Special handling for MongoDB timeout errors
  if (err.name === 'MongooseError' && err.message.includes('buffering timed out')) {
    return res.status(504).json({
      success: false,
      message: "Database query timed out. Try using pagination or narrowing your search criteria.",
      error: err.message,
      solution: "Try adding pagination parameters (limit and page) or use more specific search terms."
    });
  }
  
  // Handle other MongoDB errors
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    return res.status(500).json({
      success: false,
      message: "Database error occurred",
      error: process.env.NODE_ENV === "development" ? err.message : "Database operation failed",
    });
  }
  
  // Default error handler
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : {},
  });
});

module.exports = app;
