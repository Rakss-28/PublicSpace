class PublicSpaceApp {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user') || 'null');
        this.isLogin = true;
        
        this.initializeEventListeners();
        this.checkAuthState();
    }

    initializeEventListeners() {
        // Auth form listeners
        document.getElementById('authForm').addEventListener('submit', (e) => this.handleAuth(e));
        document.getElementById('authSwitchLink').addEventListener('click', (e) => this.toggleAuthMode(e));
        
        // App listeners
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        document.getElementById('postForm').addEventListener('submit', (e) => this.createPost(e));
        document.getElementById('addFriendBtn').addEventListener('click', () => this.addFriend());
    }

    checkAuthState() {
        if (this.token && this.user) {
            this.showApp();
            this.loadUserInfo();
            this.loadPosts();
        } else {
            this.showAuth();
        }
    }

    showAuth() {
        document.getElementById('authSection').style.display = 'flex';
        document.getElementById('appSection').style.display = 'none';
    }

    showApp() {
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('appSection').style.display = 'block';
        document.getElementById('userInfo').textContent = `Welcome, ${this.user.username}!`;
    }

    toggleAuthMode(e) {
        e.preventDefault();
        this.isLogin = !this.isLogin;
        
        if (this.isLogin) {
            document.getElementById('authTitle').textContent = 'Login to Public Space';
            document.getElementById('authButton').textContent = 'Login';
            document.getElementById('authSwitchText').textContent = "Don't have an account?";
            document.getElementById('authSwitchLink').textContent = 'Sign Up';
            document.getElementById('usernameField').style.display = 'none';
        } else {
            document.getElementById('authTitle').textContent = 'Join Public Space';
            document.getElementById('authButton').textContent = 'Sign Up';
            document.getElementById('authSwitchText').textContent = 'Already have an account?';
            document.getElementById('authSwitchLink').textContent = 'Login';
            document.getElementById('usernameField').style.display = 'block';
        }
    }

    async handleAuth(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const username = document.getElementById('username').value;
        
        const endpoint = this.isLogin ? '/api/login' : '/api/register';
        const data = this.isLogin ? { email, password } : { username, email, password };
        
        try {
            const response = await fetch(`http://localhost:3000${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            
            if (response.ok) {
                this.token = result.token;
                this.user = result.user;
                localStorage.setItem('token', this.token);
                localStorage.setItem('user', JSON.stringify(this.user));
                this.showApp();
                this.loadUserInfo();
                this.loadPosts();
                this.showMessage('Authentication successful!', 'success');
            } else {
                this.showMessage(result.error || 'Authentication failed', 'error');
            }
        } catch (error) {
            console.error('Auth error:', error);
            this.showMessage('Network error or server unavailable.', 'error');
        }
    }

    async loadUserInfo() {
        try {
            const response = await fetch('http://localhost:3000/api/user/info', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const statsInfo = document.getElementById('statsInfo');
                statsInfo.innerHTML = `
                    <p><strong>Friends:</strong> ${data.friendCount}</p>
                    <p><strong>Posts Today:</strong> ${data.postsToday}</p>
                    <p><strong>Daily Limit:</strong> ${data.maxPosts}</p>
                    <p><strong>Can Post:</strong> ${data.canPost ? 'Yes' : 'No'}</p>
                `;
            }
        } catch (error) {
            console.error('Error loading user info:', error);
        }
    }

    async createPost(e) {
        e.preventDefault();
        
        const content = document.getElementById('postContent').value;
        const mediaFile = document.getElementById('postMedia').files[0];
        
        if (!content.trim() && !mediaFile) {
            this.showMessage('Please add some content or media to your post.', 'error');
            return;
        }

        const formData = new FormData();
        if (content.trim()) formData.append('content', content);
        if (mediaFile) formData.append('media', mediaFile);

        try {
            const response = await fetch('http://localhost:3000/api/posts', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                body: formData
            });

            const result = await response.json();
            
            if (response.ok) {
                document.getElementById('postForm').reset();
                this.loadPosts();
                this.loadUserInfo();
                this.showMessage('Post created successfully!', 'success');
            } else {
                this.showMessage(result.error || 'Failed to create post', 'error');
            }
        } catch (error) {
            console.error('Error creating post:', error);
            this.showMessage('Error creating post', 'error');
        }
    }

    async loadPosts() {
        try {
            const response = await fetch('http://localhost:3000/api/posts', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const posts = await response.json();
                this.renderPosts(posts);
            }
        } catch (error) {
            console.error('Error loading posts:', error);
        }
    }

    renderPosts(posts) {
        const container = document.getElementById('postsContainer');
        
        if (posts.length === 0) {
            container.innerHTML = '<p>No posts yet. Be the first to share something!</p>';
            return;
        }

        container.innerHTML = posts.map(post => `
            <div class="post">
                <div class="post-header">
                    <div class="post-author">${post.username}</div>
                    <div class="post-date">${new Date(post.createdAt).toLocaleString()}</div>
                </div>
                <div class="post-content">
                    ${post.content ? `<p>${post.content}</p>` : ''}
                    ${post.mediaUrl ? (
                        post.mediaType === 'image' 
                            ? `<img src="http://localhost:3000${post.mediaUrl}" alt="Post media" class="post-media">`
                            : `<video src="http://localhost:3000${post.mediaUrl}" controls class="post-media"></video>`
                    ) : ''}
                </div>
                <div class="post-actions">
                    <button onclick="app.likePost('${post.id}')" class="${post.isLiked ? 'liked' : ''}">
                        ${post.isLiked ? 'Unlike' : 'Like'} (${post.likesCount})
                    </button>
                    <button onclick="app.toggleComments('${post.id}')">
                        Comments (${post.commentsCount})
                    </button>
                    <button onclick="app.sharePost('${post.id}')">
                        Share (${post.shares})
                    </button>
                </div>
                <div id="comments-${post.id}" class="comments-section" style="display: none;">
                    ${post.comments.map(comment => `
                        <div class="comment">
                            <span class="comment-author">${comment.username}:</span>
                            ${comment.comment}
                        </div>
                    `).join('')}
                    <div class="add-comment">
                        <input type="text" id="comment-input-${post.id}" placeholder="Add a comment...">
                        <button onclick="app.addComment('${post.id}')">Comment</button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    async likePost(postId) {
        try {
            const response = await fetch(`http://localhost:3000/api/posts/${postId}/like`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.loadPosts();
            }
        } catch (error) {
            console.error('Error liking post:', error);
        }
    }

    toggleComments(postId) {
        const commentsSection = document.getElementById(`comments-${postId}`);
        commentsSection.style.display = commentsSection.style.display === 'none' ? 'block' : 'none';
    }

    async addComment(postId) {
        const input = document.getElementById(`comment-input-${postId}`);
        const comment = input.value.trim();
        
        if (!comment) return;

        try {
            const response = await fetch(`http://localhost:3000/api/posts/${postId}/comment`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ comment })
            });

            if (response.ok) {
                input.value = '';
                this.loadPosts();
            }
        } catch (error) {
            console.error('Error adding comment:', error);
        }
    }

    async sharePost(postId) {
        try {
            const response = await fetch(`http://localhost:3000/api/posts/${postId}/share`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.loadPosts();
                this.showMessage('Post shared!', 'success');
            }
        } catch (error) {
            console.error('Error sharing post:', error);
        }
    }

    async addFriend() {
        const friendEmail = document.getElementById('friendEmail').value.trim();
        
        if (!friendEmail) {
            this.showMessage('Please enter a friend\'s email', 'error');
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/api/friends/add', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ friendEmail })
            });

            const result = await response.json();
            
            if (response.ok) {
                document.getElementById('friendEmail').value = '';
                this.loadUserInfo();
                this.showMessage('Friend added successfully!', 'success');
            } else {
                this.showMessage(result.error || 'Failed to add friend', 'error');
            }
        } catch (error) {
            console.error('Error adding friend:', error);
            this.showMessage('Error adding friend', 'error');
        }
    }

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.showAuth();
    }

    showMessage(message, type) {
        const existingMessage = document.querySelector('.error, .success');
        if (existingMessage) {
            existingMessage.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = type;
        messageDiv.textContent = message;
        
        const container = document.querySelector('#authSection .auth-form') || 
                         document.querySelector('.app-container');
        container.insertBefore(messageDiv, container.firstChild);
        
        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
    }
}

// Initialize the app
const app = new PublicSpaceApp();
