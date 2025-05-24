const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Debug environment variables (without exposing secrets)
console.log('🔧 Cloudinary Configuration Status:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Missing',
  api_key: process.env.CLOUDINARY_API_KEY ? 'Set' : 'Missing',
  api_secret: process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Missing'
});

// Verify Cloudinary credentials
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('❌ Missing Cloudinary credentials. Please check your .env file.');
  throw new Error('Missing Cloudinary credentials!');
}

// VERCEL-OPTIMIZED: Configure Cloudinary with extended timeout
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 90000, // 90 seconds timeout for Vercel
  secure: true
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

// VERCEL-OPTIMIZED: Storage configuration for KheyaMind AI Blog
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "blog-images",
    
    // WEBP-FIRST: Convert all images to WebP for optimal performance
    format: async (req, file) => {
      const originalFormat = file.mimetype.split('/')[1];
      console.log(`🔄 Converting ${originalFormat.toUpperCase()} → WebP`);
      return 'webp'; // Always convert to WebP
    },
    
    // VERCEL-OPTIMIZED: Smart transformation settings
    transformation: async (req, file) => {
      const originalFormat = file.mimetype.split('/')[1];
      const fileSize = file.size || 0;
      const fileSizeKB = Math.round(fileSize / 1024);
      
      if (originalFormat === 'gif') {
        console.log(`🎬 Processing GIF: ${fileSizeKB}KB - optimized for Vercel`);
        
        // VERCEL FIX: Optimized settings for GIFs to prevent timeout
        return [
          { format: "webp" },
          { quality: "auto:eco" }, // Lower quality for faster processing
          { flags: "animated" }, // Preserve animation
          { crop: "limit", width: 800, height: 600 } // Smaller dimensions for speed
        ];
      } else {
        // Static images optimization
        return [
          { format: "webp" },
          { quality: "auto:good" },
          { flags: "progressive" },
          { crop: "limit", width: 1200, height: 900 }
        ];
      }
    },
    
    // VERCEL FIX: Removed eager transformations to prevent timeout
    // eager: [], // Commented out - causes timeouts on Vercel
    
    public_id: (req, file) => {
      const originalFormat = file.mimetype.split('/')[1];
      const timestamp = Date.now();
      const fileSize = Math.round((file.size || 0) / 1024);
      
      if (originalFormat === 'gif') {
        return `blog_gif_${fileSize}kb_${timestamp}`;
      } else {
        return `blog_image_${timestamp}`;
      }
    },
    
    // VERCEL-OPTIMIZED: Streamlined options
    use_filename: false, // Disable to speed up processing
    unique_filename: true,
    overwrite: false,
    timeout: 60000 // 60 seconds timeout
  }
});

// VERCEL-OPTIMIZED: Multer configuration with enhanced limits
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
      const fileSizeKB = Math.round((file.size || 0) / 1024);
      console.log(`✅ Accepting ${file.mimetype}: ${file.originalname} (${fileSizeKB}KB → WebP)`);
      cb(null, true);
    } else {
      console.log(`❌ Rejecting ${file.mimetype}: ${file.originalname}`);
      cb(new Error(`❌ Unsupported file type: ${file.mimetype}. Supported: JPG, PNG, GIF, BMP, TIFF, WebP`), false);
    }
  },
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit for Vercel
    files: 1,
    fieldSize: 5 * 1024 * 1024, // 5MB field size
    parts: 10,
    headerPairs: 20
  }
});

// HELPER: Generate responsive WebP URLs for KheyaMind AI blog
const generateWebPUrls = (publicId, options = {}) => {
  try {
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
  } catch (error) {
    console.warn('⚠️ URL generation error:', error.message);
    return { 
      original: cloudinary.url(publicId, { format: 'webp' }),
      thumbnail: null,
      medium: null,
      large: null,
      mobile: null
    };
  }
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
    const mimeType = isGif ? 'image/gif' : 'image/jpeg';
    
    // Convert buffer to base64
    const base64Data = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    
    const uploadOptions = {
      folder: "blog-images",
      public_id: options.public_id || `webp_${Date.now()}`,
      
      // Force WebP format
      format: 'webp',
      
      // Smart quality based on content type
      quality: isGif ? 'auto:eco' : 'auto:good', // Lower quality for GIFs
      
      // Preserve animations for GIFs
      flags: isGif ? 'animated' : 'progressive',
      
      // Resource type
      resource_type: 'image',
      
      // Original filename for reference
      original_filename: filename,
      
      // Timeout for large files
      timeout: 60000,
      
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
