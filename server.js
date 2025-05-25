const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

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
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
  console.log("Connected to MongoDB");
})
.catch((err) => {
  console.error("Could not connect to MongoDB", err);
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

module.exports = app;
