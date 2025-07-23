const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const JWT_SECRET = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.KMUFsIDTnFmyG3nMiGM6H9FNFUROf3wh7SmqJp-QV30';

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|mkv/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only images and videos are allowed!'));
        }
    }
});

// In-memory data storage (replace with database in production)
let users = [];
let posts = [];
let friendships = [];

// Helper functions
const findUserByEmail = (email) => users.find(user => user.email === email);
const findUserById = (id) => users.find(user => user.id === id);
const getUserFriends = (userId) => {
    return friendships.filter(f => f.user1 === userId || f.user2 === userId).length;
};
const getUserPostsToday = (userId) => {
    const today = new Date().toDateString();
    return posts.filter(p => p.userId === userId && new Date(p.createdAt).toDateString() === today).length;
};

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// User registration
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (findUserByEmail(email)) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = {
            id: Date.now().toString(),
            username,
            email,
            password: hashedPassword,
            createdAt: new Date()
        };

        users.push(user);
        
        const token = jwt.sign(
            { id: user.id, email: user.email, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Registration successful',
            token,
            user: { id: user.id, username: user.username, email: user.email }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error during registration' });
    }
});

// User login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = findUserByEmail(email);
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, username: user.username, email: user.email }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Create post
app.post('/api/posts', authenticateToken, upload.single('media'), (req, res) => {
    try {
        const { content } = req.body;
        const userId = req.user.id;
        
        const friendCount = getUserFriends(userId);
        const postsToday = getUserPostsToday(userId);
        
        let maxPosts = 0;
        if (friendCount === 0) {
            maxPosts = 0;
        } else if (friendCount < 2) {
            maxPosts = 1;
        } else if (friendCount >= 2 && friendCount < 10) {
            maxPosts = 2;
        } else {
            maxPosts = Infinity;
        }
        
        if (postsToday >= maxPosts) {
            return res.status(403).json({ 
                error: `You have reached your daily post limit. Friends: ${friendCount}, Posts today: ${postsToday}` 
            });
        }

        const post = {
            id: Date.now().toString(),
            userId,
            username: req.user.username,
            content: content || '',
            mediaUrl: req.file ? `/uploads/${req.file.filename}` : null,
            mediaType: req.file ? (req.file.mimetype.startsWith('image/') ? 'image' : 'video') : null,
            likes: [],
            comments: [],
            shares: 0,
            createdAt: new Date()
        };

        posts.unshift(post);
        res.json({ message: 'Post created successfully', post });
    } catch (error) {
        res.status(500).json({ error: 'Error creating post' });
    }
});

// Get all posts
app.get('/api/posts', authenticateToken, (req, res) => {
    const postsWithUserInfo = posts.map(post => ({
        ...post,
        isLiked: post.likes.includes(req.user.id),
        likesCount: post.likes.length,
        commentsCount: post.comments.length
    }));
    
    res.json(postsWithUserInfo);
});

// Like/unlike post
app.post('/api/posts/:postId/like', authenticateToken, (req, res) => {
    const postId = req.params.postId;
    const userId = req.user.id;
    
    const post = posts.find(p => p.id === postId);
    if (!post) {
        return res.status(404).json({ error: 'Post not found' });
    }
    
    const likeIndex = post.likes.indexOf(userId);
    if (likeIndex > -1) {
        post.likes.splice(likeIndex, 1);
        res.json({ message: 'Post unliked', liked: false, likesCount: post.likes.length });
    } else {
        post.likes.push(userId);
        res.json({ message: 'Post liked', liked: true, likesCount: post.likes.length });
    }
});

// Add comment
app.post('/api/posts/:postId/comment', authenticateToken, (req, res) => {
    const postId = req.params.postId;
    const { comment } = req.body;
    
    if (!comment) {
        return res.status(400).json({ error: 'Comment is required' });
    }
    
    const post = posts.find(p => p.id === postId);
    if (!post) {
        return res.status(404).json({ error: 'Post not found' });
    }
    
    const newComment = {
        id: Date.now().toString(),
        userId: req.user.id,
        username: req.user.username,
        comment,
        createdAt: new Date()
    };
    
    post.comments.push(newComment);
    res.json({ message: 'Comment added', comment: newComment });
});

// Share post
app.post('/api/posts/:postId/share', authenticateToken, (req, res) => {
    const postId = req.params.postId;
    
    const post = posts.find(p => p.id === postId);
    if (!post) {
        return res.status(404).json({ error: 'Post not found' });
    }
    
    post.shares += 1;
    res.json({ message: 'Post shared', shares: post.shares });
});

// Add friend
app.post('/api/friends/add', authenticateToken, (req, res) => {
    const { friendEmail } = req.body;
    const userId = req.user.id;
    
    const friend = findUserByEmail(friendEmail);
    if (!friend) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (friend.id === userId) {
        return res.status(400).json({ error: 'Cannot add yourself as friend' });
    }
    
    const existingFriendship = friendships.find(f => 
        (f.user1 === userId && f.user2 === friend.id) ||
        (f.user1 === friend.id && f.user2 === userId)
    );
    
    if (existingFriendship) {
        return res.status(400).json({ error: 'Already friends' });
    }
    
    friendships.push({
        id: Date.now().toString(),
        user1: userId,
        user2: friend.id,
        createdAt: new Date()
    });
    
    res.json({ message: 'Friend added successfully' });
});

// Get user info
app.get('/api/user/info', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const friendCount = getUserFriends(userId);
    const postsToday = getUserPostsToday(userId);
    
    let maxPosts = 0;
    if (friendCount === 0) {
        maxPosts = 0;
    } else if (friendCount < 2) {
        maxPosts = 1;
    } else if (friendCount >= 2 && friendCount < 10) {
        maxPosts = 2;
    } else {
        maxPosts = Infinity;
    }
    
    res.json({
        user: req.user,
        friendCount,
        postsToday,
        maxPosts: maxPosts === Infinity ? 'Unlimited' : maxPosts,
        canPost: postsToday < maxPosts
    });
});

// 🌐 Serve frontend build in production
if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(__dirname, "../client/build")));
    app.get("*", (req, res) => {
        res.sendFile(path.join(__dirname, "../client/build/index.html"));
    });
}

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    res.status(500).json({ error: error.message || 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
    console.log(`Network access: http://0.0.0.0:${PORT}`);
});
