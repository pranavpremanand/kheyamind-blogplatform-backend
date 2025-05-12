/**
 * Utility functions to optimize MongoDB queries
 */

/**
 * Optimizes a MongoDB query to prevent timeouts
 * @param {Object} query - Mongoose query object
 * @param {Object} options - Options for optimization
 * @param {Boolean} options.lean - Whether to use lean() for better performance
 * @param {Number} options.timeout - Timeout in milliseconds
 * @param {Boolean} options.excludeContent - Whether to exclude content field
 * @param {Number} options.defaultLimit - Default limit if none specified
 * @returns {Object} - Optimized query
 */
const optimizeQuery = (query, options = {}) => {
  const {
    lean = true,
    timeout = 20000,
    excludeContent = true,
    defaultLimit = 100
  } = options;

  // Apply lean() for better performance
  if (lean) {
    query = query.lean();
  }

  // Exclude content field for better performance
  if (excludeContent) {
    query = query.select('-content');
  }

  // Set a default limit if none specified
  if (defaultLimit && !query.options.limit) {
    query = query.limit(defaultLimit);
  }

  // Set a timeout
  if (timeout) {
    query = query.maxTimeMS(timeout);
  }

  return query;
};

/**
 * Optimizes search filters for MongoDB
 * @param {Object} filter - MongoDB filter object
 * @param {String} searchTerm - Search term
 * @param {Array} searchFields - Fields to search in
 * @returns {Object} - Optimized filter
 */
const optimizeSearchFilter = (filter, searchTerm, searchFields = ['title', 'content']) => {
  if (!searchTerm) return filter;

  // Use text index for searches with terms longer than 2 characters
  if (searchTerm.length > 2) {
    filter.$text = { $search: searchTerm };
  } else {
    // Fall back to regex for short terms
    const searchConditions = searchFields.map(field => ({
      [field]: { $regex: searchTerm, $options: 'i' }
    }));
    
    filter.$and = filter.$and || [];
    filter.$and.push({ $or: searchConditions });
  }

  return filter;
};

module.exports = {
  optimizeQuery,
  optimizeSearchFilter
};