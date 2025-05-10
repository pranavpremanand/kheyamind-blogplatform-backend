
# Blog Platform Backend

This is the backend for the Blog Platform application built with Node.js, Express, and MongoDB.

## Setup Instructions

1. Install dependencies:
```
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/blog-platform
JWT_SECRET=your_jwt_secret_key
CORS_ORIGIN=http://localhost:5173
```

3. Start the server:
```
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register a new user
- `POST /api/auth/login` - Login and get authentication token

### Blogs
- `GET /api/blogs` - Get all blogs with pagination
- `GET /api/blogs/:id` - Get blog by ID
- `GET /api/blogs/slug/:slug` - Get blog by slug
- `POST /api/blogs` - Create a new blog (admin only)
- `PUT /api/blogs/:id` - Update a blog (admin only)
- `DELETE /api/blogs/:id` - Delete a blog (admin only)

### Users
- `GET /api/users/profile` - Get current user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users` - Get all users (admin only)
- `DELETE /api/users/:id` - Delete a user (admin only)

## Running in Production
For production, make sure to:
1. Set `NODE_ENV=production`
2. Use a secure JWT secret
3. Configure a production MongoDB URI
4. Set appropriate CORS settings
