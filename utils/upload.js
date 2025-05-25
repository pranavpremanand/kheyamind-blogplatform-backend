const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Debug environment variables (without exposing secrets)
console.log('Cloudinary Configuration Status:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Missing',
  api_key: process.env.CLOUDINARY_API_KEY ? 'Set' : 'Missing',
  api_secret: process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Missing'
});

// Verify Cloudinary credentials
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('Missing Cloudinary credentials. Please check your .env file.');
  throw new Error('Missing Cloudinary credentials!');
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
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      {
        folder: "blog-images",
        public_id: "test-connection",
        format: "webp"
      }
    );
    console.log('✅ Cloudinary WebP connection successful!');
    // Clean up test image
    await cloudinary.uploader.destroy(result.public_id);
  } catch (error) {
    console.error('❌ Cloudinary connection failed:', error.message);
  }
};

testConnection();

// WEBP-OPTIMIZED: Storage configuration for KheyaMind AI Blog
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "blog-images",
    
    // WEBP-FIRST: Convert all images to WebP for optimal performance
    format: async (req, file) => {
      const originalFormat = file.mimetype.split('/')[1];
      
      // Handle different input formats - all convert to WebP
      if (originalFormat === 'gif') {
        // Animated GIFs become animated WebP
        return 'webp';
      } else if (['png', 'jpg', 'jpeg', 'bmp', 'tiff', 'webp'].includes(originalFormat)) {
        // All static images become WebP
        return 'webp';
      } else {
        // Fallback for other formats
        return 'webp';
      }
    },
    
    // OPTIMIZED: Smart quality and transformation settings
    transformation: async (req, file) => {
      const originalFormat = file.mimetype.split('/')[1];
      
      if (originalFormat === 'gif') {
        // Special handling for animated GIFs
        return [
          { format: "webp" },
          { quality: "auto:good" }, // Good quality for animations
          { flags: "animated" }, // Preserve animation
          { crop: "limit", width: 1200, height: 1200 } // Limit size for performance
        ];
      } else {
        // Static images optimization for KheyaMind AI blog
        return [
          { format: "webp" },
          { quality: "auto:good" }, // Excellent quality with good compression
          { flags: "progressive" }, // Progressive loading
          { crop: "limit", width: 1920, height: 1920 } // Limit max dimensions
        ];
      }
    },
    
    // Pre-generate multiple sizes for responsive KheyaMind AI blog
    eager: [
      // Blog thumbnail (400px width)
      {
        width: 400,
        height: 300,
        crop: "fill",
        gravity: "auto",
        format: "webp",
        quality: "auto:good"
      },
      // Blog medium (800px width)
      {
        width: 800,
        height: 600,
        crop: "limit",
        format: "webp",
        quality: "auto:good"
      },
      // Blog large (1200px width)
      {
        width: 1200,
        height: 900,
        crop: "limit",
        format: "webp",
        quality: "auto:best"
      }
    ],
    
    public_id: (req, file) => {
      const originalFormat = file.mimetype.split('/')[1];
      const timestamp = Date.now();
      
      if (originalFormat === 'gif') {
        return `blog_animated_${timestamp}`;
      } else {
        return `blog_image_${timestamp}`;
      }
    },
    
    // Metadata and optimization
    use_filename: true,
    unique_filename: false,
    overwrite: false
  }
});

// Configure multer with enhanced file handling for KheyaMind AI
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept all common image formats (will be converted to WebP)
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/bmp',
      'image/tiff',
      'image/webp'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      console.log(`✅ Accepting ${file.mimetype} file: ${file.originalname} (will convert to WebP)`);
      cb(null, true);
    } else {
      cb(new Error(`❌ Unsupported file type: ${file.mimetype}. Supported: JPG, PNG, GIF, BMP, TIFF, WebP`), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit (increased for GIFs)
    files: 1 // Only allow 1 file per request
  }
});

// HELPER: Generate responsive WebP URLs for KheyaMind AI blog
const generateWebPUrls = (publicId, options = {}) => {
  const baseUrl = cloudinary.url(publicId, {
    format: 'webp',
    quality: 'auto:good',
    ...options
  });
  
  return {
    // Original WebP
    original: baseUrl,
    
    // Responsive sizes for KheyaMind AI blog
    thumbnail: cloudinary.url(publicId, {
      format: 'webp',
      quality: 'auto:good',
      width: 400,
      height: 300,
      crop: 'fill',
      gravity: 'auto'
    }),
    
    medium: cloudinary.url(publicId, {
      format: 'webp',
      quality: 'auto:good',
      width: 800,
      height: 600,
      crop: 'limit'
    }),
    
    large: cloudinary.url(publicId, {
      format: 'webp',
      quality: 'auto:best',
      width: 1200,
      height: 900,
      crop: 'limit'
    }),
    
    // Mobile-optimized for KheyaMind AI's global audience
    mobile: cloudinary.url(publicId, {
      format: 'webp',
      quality: 'auto:eco',
      width: 480,
      height: 360,
      crop: 'fill',
      gravity: 'auto'
    })
  };
};

// HELPER: Check if file is animated (for GIFs)
const isAnimatedImage = (filename) => {
  return filename.toLowerCase().endsWith('.gif');
};

// HELPER: Get optimized transformation based on KheyaMind AI blog use case
const getOptimizedTransformation = (useCase = 'blog') => {
  const transformations = {
    // Blog post images (default)
    blog: {
      format: 'webp',
      quality: 'auto:good',
      flags: 'progressive',
      crop: 'limit',
      width: 1200
    },
    
    // Blog thumbnails
    thumbnail: {
      format: 'webp',
      quality: 'auto:good',
      width: 400,
      height: 300,
      crop: 'fill',
      gravity: 'auto'
    },
    
    // Hero images for KheyaMind AI
    hero: {
      format: 'webp',
      quality: 'auto:best',
      width: 1920,
      height: 1080,
      crop: 'fill',
      gravity: 'center'
    },
    
    // Social media sharing
    social: {
      format: 'webp',
      quality: 'auto:good',
      width: 1200,
      height: 630,
      crop: 'fill',
      gravity: 'center'
    },
    
    // Mobile optimized
    mobile: {
      format: 'webp',
      quality: 'auto:eco',
      width: 480,
      crop: 'limit'
    }
  };
  
  return transformations[useCase] || transformations.blog;
};

// ENHANCED: Smart WebP upload function with format detection
const uploadToWebP = async (fileBuffer, filename, options = {}) => {
  try {
    // Detect file type from buffer
    const isGif = filename.toLowerCase().endsWith('.gif');
    const mimeType = isGif ? 'image/gif' : 'image/jpeg'; // Default assumption
    
    // Convert buffer to base64
    const base64Data = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    
    const uploadOptions = {
      folder: "blog-images",
      public_id: options.public_id || `webp_${Date.now()}`,
      
      // Force WebP format
      format: 'webp',
      
      // Smart quality based on content type
      quality: isGif ? 'auto:good' : 'auto:best',
      
      // Preserve animations for GIFs
      flags: isGif ? 'animated' : 'progressive',
      
      // Resource type
      resource_type: 'image',
      
      // Responsive breakpoints (auto-generate multiple sizes)
      responsive_breakpoints: [
        {
          create_derived: true,
          bytes_step: 20000,
          min_width: 200,
          max_width: 1200,
          transformation: {
            crop: 'scale',
            format: 'webp',
            quality: 'auto:good'
          }
        }
      ],
      
      // Original filename for reference
      original_filename: filename,
      
      // Additional options
      ...options
    };
    
    const result = await cloudinary.uploader.upload(base64Data, uploadOptions);
    
    console.log(`✅ ${isGif ? 'Animated GIF' : 'Image'} converted to WebP successfully:`);
    console.log(`📁 URL: ${result.secure_url}`);
    console.log(`📊 Format: ${result.format}`);
    console.log(`💾 Size: ${Math.round(result.bytes / 1024)}KB`);
    
    return result;
    
  } catch (error) {
    console.error('❌ WebP upload failed:', error);
    throw error;
  }
};

// Export all utilities for KheyaMind AI blog
module.exports = { 
  upload,
  uploadToWebP,
  generateWebPUrls,
  isAnimatedImage,
  getOptimizedTransformation,
  cloudinary
};
