const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

// Load environment variables before any other code
dotenv.config();

// Debug MongoDB URI (without exposing sensitive information)
const mongoURIDebug = process.env.MONGODB_URI 
  ? process.env.MONGODB_URI.replace(/:([^@]+)@/, ':****@')
  : 'Not found';
console.log('MongoDB URI Debug:', mongoURIDebug);

// Import routes
const authRoutes = require("./routes/auth.routes");
const blogRoutes = require("./routes/blog.routes");
const userRoutes = require("./routes/user.routes");
const categoryRoutes = require("./routes/category.routes");
const authorRoutes = require("./routes/author.routes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Connect to MongoDB with simple connection
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not defined in environment variables');
  process.exit(1);
}

console.log('Attempting to connect to MongoDB...');

// MongoDB connection options
const mongooseOptions = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  dbName: 'blog-platform', // Specify your database name here
  authSource: 'admin',     // Specify the authentication database
  retryWrites: true,
  w: 'majority'
};

mongoose.connect(process.env.MONGODB_URI, mongooseOptions)
.then(() => {
  console.log("Successfully connected to MongoDB");
})
.catch((err) => {
  console.error("MongoDB Connection Error Details:", {
    message: err.message,
    code: err.code,
    codeName: err.codeName,
    name: err.name
  });
  
  // More specific error handling
  if (err.message.includes('bad auth')) {
    console.error("Authentication failed. Common causes:");
    console.error("1. Username or password is incorrect");
    console.error("2. User doesn't have access to the database");
    console.error("3. Auth database might be incorrect (try authSource=admin)");
  } else if (err.message.includes('getaddrinfo')) {
    console.error("Could not reach MongoDB server. Check your connection and cluster status.");
  }
  
  process.exit(1);
});

// Test route
app.get("/", (req, res) => {
  res.json({ 
    message: "KheyaMind Blog Platform API",
    status: "active",
    mongoUri: process.env.MONGODB_URI ? 'Present' : 'Missing'
  });
});

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok",
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
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : {},
  });
});
// test
module.exports = app;
