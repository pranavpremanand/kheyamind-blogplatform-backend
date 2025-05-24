const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// VERCEL FIX: Only load dotenv in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// VERCEL FIX: Simplified configuration without debug logs that can cause issues
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// VERCEL FIX: Removed async connection test that can block deployment
// Connection will be tested during actual upload operations

// VERCEL-OPTIMIZED: Simplified storage configuration
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "blog-images",
    
    // SIMPLIFIED: Basic WebP conversion without complex async operations
    format: 'webp',
    
    // VERCEL-OPTIMIZED: Static transformation settings to avoid async complexity
    transformation: [
      { format: "webp" },
      { quality: "auto:good" },
      { flags: "progressive" },
      { crop: "limit", width: 1200, height: 900 }
    ],
    
    public_id: (req, file) => {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      return `kheyamind_blog_${timestamp}_${random}`;
    },
    
    use_filename: false,
    unique_filename: true,
    overwrite: false
  }
});

// VERCEL-OPTIMIZED: Simplified multer configuration
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for Vercel serverless
    files: 1
  }
});

// SIMPLIFIED: Basic responsive URL generation
const generateWebPUrls = (publicId) => {
  try {
    const baseUrl = cloudinary.url(publicId, {
      format: 'webp',
      quality: 'auto:good'
    });
    
    return {
      original: baseUrl,
      thumbnail: cloudinary.url(publicId, {
        format: 'webp',
        quality: 'auto:good',
        width: 400,
        height: 300,
        crop: 'fill'
      }),
      medium: cloudinary.url(publicId, {
        format: 'webp',
        quality: 'auto:good',
        width: 800,
        height: 600,
        crop: 'limit'
      })
    };
  } catch (error) {
    return { 
      original: cloudinary.url(publicId, { format: 'webp' }),
      thumbnail: null,
      medium: null
    };
  }
};

// SIMPLIFIED: Basic WebP upload function
const uploadToWebP = async (fileBuffer, filename, options = {}) => {
  try {
    const base64Data = `data:image/jpeg;base64,${fileBuffer.toString('base64')}`;
    
    const uploadOptions = {
      folder: "blog-images",
      public_id: options.public_id || `webp_${Date.now()}`,
      format: 'webp',
      quality: 'auto:good',
      resource_type: 'image',
      ...options
    };
    
    const result = await cloudinary.uploader.upload(base64Data, uploadOptions);
    return result;
    
  } catch (error) {
    console.error('WebP upload failed:', error.message);
    throw error;
  }
};

// VERCEL FIX: Check environment variables only when needed
const checkCloudinaryConfig = () => {
  const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing Cloudinary credentials: ${missing.join(', ')}`);
  }
  
  return true;
};

// Export utilities for KheyaMind AI blog
module.exports = { 
  upload,
  uploadToWebP,
  generateWebPUrls,
  checkCloudinaryConfig,
  cloudinary
};
