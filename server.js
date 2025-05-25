const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");

// Import routes
const authRoutes = require("./routes/auth.routes");
const blogRoutes = require("./routes/blog.routes");
const userRoutes = require("./routes/user.routes");
const categoryRoutes = require("./routes/category.routes");
const authorRoutes = require("./routes/author.routes");

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const app = express();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://kheyamind-blogplatform-backend.vercel.app', 'https://www.kheyamind.ai'] 
    : ['http://localhost:3000', 'http://localhost:5000'],
  credentials: true
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan("dev"));
}

// SERVERLESS-OPTIMIZED: MongoDB Connection Management
let isConnected = false;

const connectDB = async () => {
  // If already connected, reuse the connection
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }

  try {
    // Close any existing connections
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    // Create fresh connection for serverless
    await mongoose.connect(process.env.MONGODB_URI, {
      // SERVERLESS-OPTIMIZED: Minimal connection pool
      maxPoolSize: 1, // Single connection for serverless
      minPoolSize: 0,
      maxIdleTimeMS: 30000, // Close connections after 30 seconds
      serverSelectionTimeoutMS: 5000, // 5 second timeout
      socketTimeoutMS: 45000,
      bufferCommands: false, // Disable mongoose buffering
      bufferMaxEntries: 0,
      
      // Connection options
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    isConnected = true;
    console.log("✅ MongoDB connected successfully");

  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    isConnected = false;
    throw error;
  }
};

// SERVERLESS-OPTIMIZED: Connect before each request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection middleware error:", error);
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
    status: "active",
    timestamp: new Date().toISOString()
  });
});

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    connectionState: mongoose.connection.readyState
  });
});

// ENHANCED: Database connection test route
app.get("/test-db", async (req, res) => {
  try {
    // Force fresh connection test
    const db = mongoose.connection.db;
    const admin = db.admin();
    await admin.ping();
    
    // List collections to verify access
    const collections = await db.listCollections().toArray();
    
    res.json({
      success: true,
      message: "MongoDB connection successful!",
      database: db.databaseName,
      collections: collections.map(c => c.name),
      connectionState: mongoose.connection.readyState,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Database test failed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      name: error.name,
      timestamp: new Date().toISOString()
    });
  }
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/authors", authorRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  
  // Handle MongoDB connection errors
  if (err.name === 'MongooseError' || err.name === 'MongoError') {
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
      message: "Request timeout",
      error: "Function timeout"
    });
  }
  
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
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

// SERVERLESS-OPTIMIZED: Graceful connection cleanup
process.on('SIGINT', async () => {
  if (isConnected) {
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
  }
  process.exit(0);
});
// test
module.exports = app;
