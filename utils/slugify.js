
/**
 * Convert a string to a URL-friendly slug
 * @param {String} text - The text to convert to a slug
 * @returns {String} - A URL-friendly slug
 */
function slugify(text) {
  const slug = text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')        // Replace spaces with -
    .replace(/&/g, '-and-')      // Replace & with 'and'
    .replace(/[^\w\-]+/g, '')    // Remove all non-word characters
    .replace(/\-\-+/g, '-')      // Replace multiple - with single -
    .replace(/^-+/, '')          // Trim - from start of text
    .replace(/-+$/, '');         // Trim - from end of text
    
  return slug;
}

module.exports = slugify;
