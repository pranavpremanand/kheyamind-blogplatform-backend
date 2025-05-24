const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Debug environment variables (without exposing secrets)
console.log('Cloudinary Configuration Status:', {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Missing',
  apiKey: process.env.CLOUDINARY_API_KEY ? 'Set' : 'Missing',
  apiSecret: process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Missing'
});

// Verify Cloudinary credentials
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('Missing Cloudinary credentials. Please check your .env file');
  console.error('Required variables:', {
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ? 'Present' : 'Missing',
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ? 'Present' : 'Missing',
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ? 'Present' : 'Missing'
  });
  throw new Error('Missing Cloudinary credentials');
}

// Configure Cloudinary with timeout and error handling
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 60000 // 60 seconds timeout
});

// Test Cloudinary connection
const testConnection = async () => {
  try {
    const result = await cloudinary.uploader.upload(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      {
        folder: "blog-images",
        public_id: "test-connection"
      }
    );
    console.log('Cloudinary connection successful');
    // Clean up test image
    await cloudinary.uploader.destroy(result.public_id);
  } catch (error) {
    console.error('Cloudinary connection failed:', error);
    throw new Error('Failed to connect to Cloudinary: ' + error.message);
  }
};

// Run the connection test
testConnection().catch(console.error);

// Configure storage with error handling
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'blog-images',
    allowed_formats: ['jpg', 'jpeg', 'webp', 'avif', 'tiff', 'bmp', 'gif', 'png'], 
    transformation: [
      { width: 800, height: 800, crop: "limit" }, // Limit image size
      { quality: "auto" }, // Automatic quality optimization
      { fetch_format: "auto" }, // Automatic format optimization
    ],
    // Enable eager transformation to pre-generate optimized versions
    eager: [
      { width: 400, height: 400, crop: "limit" }, // Thumbnail
      { width: 800, height: 800, crop: "limit" }  // Full size
    ]
  }
});

// Configure multer with optimized settings
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1 // Only allow 1 file per request
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false);
    }

    // Block PNG and GIF formats
    if (file.mimetype === 'image/png' || file.mimetype === 'image/gif') {
      return cb(new Error('PNG and GIF formats are not allowed. Please use JPG, JPEG, WebP, AVIF, TIFF, or BMP formats.'), false);
    }
    
    // Log file details for debugging
    console.log('Processing file:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    cb(null, true);
  }
});

// Export the multer middleware directly
module.exports = upload;
