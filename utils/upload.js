
const multer = require('multer');

// Use memory storage instead of disk storage for Vercel compatibility
const storage = multer.memoryStorage();

// File filter to only accept image files
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Create the multer upload middleware
const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 2 * 1024 * 1024, // 2MB limit
    fieldSize: 2 * 1024 * 1024 // Field size limit for larger fields
  },
  fileFilter: fileFilter
});

module.exports = upload;
