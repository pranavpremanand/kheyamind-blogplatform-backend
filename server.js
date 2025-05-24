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
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://kheyamind-blogplatform-backend.vercel.app', 'https://www.kheyamind.ai'] 
    : ['http://localhost:3000', 'http://localhost:5000'],
  credentials: true
}));

// Increased JSON payload size limit to 50MB
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Only use morgan in development to reduce serverless function overhead
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan("dev"));
}

// MongoDB Connection - Optimized for Vercel serverless
let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      // Optimized for serverless functions
      serverSelectionTimeoutMS: 5000, // Reduced timeout for serverless
      socketTimeoutMS: 10000, // Reduced socket timeout
      maxPoolSize: 10, // Reduced pool size for serverless
      minPoolSize: 1,
      connectTimeoutMS: 10000,
      bufferCommands: false, // Disable mongoose buffering
      bufferMaxEntries: 0, // Disable mongoose buffering
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    isConnected = true;
    console.log("Connected to MongoDB");

    // Set global configuration for all queries
    mongoose.set('maxTimeMS', 10000); // Reduced timeout for serverless

  } catch (err) {
    console.error("Could not connect to MongoDB", err);
    throw err;
  }
};

// Middleware to ensure DB connection
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection failed:", error);
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: process.env.NODE_ENV === "development" ? error.message : "Database unavailable"
    });
  }
});

// Test route
app.get("/", (req, res) => {
  res.json({ 
    message: "KheyaMind Blog Platform API",
    version: "1.0.0",
    status: "active"
  });
});

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/authors", authorRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  
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

  // Handle Vercel timeout errors
  if (err.code === 'FUNCTION_INVOCATION_TIMEOUT') {
    return res.status(504).json({
      success: false,
      message: "Request timeout - the operation took too long to complete",
      error: "Function timeout"
    });
  }
  
  // Default error handler
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
  });
});

// Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl
  });
});

// For Vercel serverless deployment
module.exports = app;

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
