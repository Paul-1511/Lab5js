document.addEventListener('DOMContentLoaded', function () {
    const apiUrl = 'http://awita.site:3000';
    let posts = [];
    let commentPollingInterval;

    // Cache DOM elements we'll use repeatedly
    const DOM = {
        body: document.body,
        postsContainer: null
    };

    // Create reusable DOM element factory
    const createElement = (tag, attributes = {}, children = []) => {
        const element = document.createElement(tag);
        
        // Apply attributes
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'style' && typeof value === 'object') {
                Object.assign(element.style, value);
            } else if (key === 'events' && typeof value === 'object') {
                Object.entries(value).forEach(([event, handler]) => {
                    element.addEventListener(event, handler);
                });
            } else if (key === 'html') {
                element.innerHTML = value;
            } else {
                element[key] = value;
            }
        });
        
        // Append children
        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                element.appendChild(child);
            }
        });
        
        return element;
    };

    // Utility functions
    const utils = {
        isValidURL: (str) => {
            if (!str) return false;
            try {
                new URL(str);
                return true;
            } catch (e) {
                // Try with http:// prefix if missing protocol
                if (!str.startsWith('http')) {
                    try {
                        new URL(`http://${str}`);
                        return true;
                    } catch (e) {
                        return false;
                    }
                }
                return false;
            }
        },
        
        getDomainFromURL: (url) => {
            try {
                // Make sure we have a valid URL with protocol
                if (!url.startsWith('http')) {
                    url = `http://${url}`;
                }
                const urlObj = new URL(url);
                return urlObj.hostname.replace('www.', '');
            } catch (e) {
                return 'External Link';
            }
        },
        
        debounce: (func, wait = 300) => {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        },
        
        // New helper function to extract URLs from text
        extractURLs: (text) => {
            const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?(?:\/[^\s]*)?)/g;
            return text.match(urlRegex) || [];
        },
        
        // New helper to determine if a URL is an image
        isImageURL: (url) => {
            // Check if URL ends with common image extensions
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
            return imageExtensions.some(ext => url.toLowerCase().endsWith(ext));
        }
    };

    // API service
    const api = {
        async fetchPosts() {
            try {
                console.log('Fetching posts from API...');
                const response = await fetch(`${apiUrl}/posts`, {
                    headers: {
                        'Accept': 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                const data = await response.json();
                console.log('Data fetched successfully');
                return data.posts;
            } catch (error) {
                console.error('Error fetching posts:', error);
                return [];
            }
        },

        async fetchComments(postId) {
            try {
                console.log(`Fetching comments for post ${postId}...`);
                const response = await fetch(`${apiUrl}/comments/${postId}`);

                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                const comments = await response.json();
                console.log('Comments fetched successfully');
                return comments;
            } catch (error) {
                console.error('Error fetching comments:', error);
                return [];
            }
        },

        async addComment(postId, commentText) {
            try {
                console.log(`Adding comment to post ${postId}`);
                const response = await fetch(`${apiUrl}/comment`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        post_id: postId,
                        username: 'Anonymous',
                        comentario: commentText,
                    }),
                });

                return response.ok;
            } catch (error) {
                console.error('Error adding comment:', error);
                return false;
            }
        }
    };

    // Data handler service - NEW
    const dataHandler = {
        processCommentText(text) {
            // Check if the text contains a URL
            const urls = utils.extractURLs(text);
            if (urls.length === 0) {
                return { type: 'text', content: text };
            }
            
            // If the text is just a URL, return it as a URL type
            if (text.trim() === urls[0].trim()) {
                const url = urls[0];
                // Check if it's an image URL
                if (utils.isImageURL(url)) {
                    return { type: 'image', content: url };
                } else {
                    return { type: 'link', content: url };
                }
            }
            
            // If text contains URLs but is not just a URL, return as text with URLs
            return { type: 'text-with-urls', content: text, urls: urls };
        }
    };

    // Media handler service - improved
    const mediaHandler = {
        handleMediaDisplay(url, alt) {
            if (!url) return createElement('div', { className: 'empty-media' });
            
            // Ensure URL has a protocol
            if (!url.startsWith('http')) {
                url = `http://${url}`;
            }
            
            // Handle different types of media URLs
            if (url.includes('reddit.com/media') || url.includes('redd.it')) {
                return this.createRedditMedia(url, alt);
            } else if (utils.isImageURL(url)) {
                return this.createImagePreview(url, alt);
            } else if (this.isNewsArticle(url)) {
                return this.createArticlePreview(url);
            } else {
                return this.createGenericMedia(url, alt);
            }
        },
        
        isNewsArticle(url) {
            const newsKeywords = ['theguardian.com', 'nytimes.com', 'cnn.com', 'bbc.com', 'reuters.com', 'news', 'article'];
            return newsKeywords.some(keyword => url.includes(keyword));
        },
        
        createRedditMedia(url, alt) {
            // Extract direct image URL if available
            let directImageUrl = url;
            if (url.includes('url=')) {
                try {
                    const urlParam = url.split('url=')[1].split('&')[0];
                    directImageUrl = decodeURIComponent(urlParam);
                } catch (e) {
                    console.error('Failed to decode URL parameter:', e);
                }
            }
            
            return this.createImagePreview(directImageUrl, alt);
        },
        
        createImagePreview(url, alt) {
            const imgElement = createElement('img', {
                src: url,
                alt: alt || 'Image preview',
                style: {
                    maxWidth: '100%',
                    maxHeight: '200px',
                    objectFit: 'contain'
                },
                events: {
                    error: function() {
                        this.onerror = null;
                        
                        // Replace with link preview
                        const parent = this.parentNode;
                        if (parent) {
                            const linkPreview = createElement('div', 
                                { 
                                    className: 'link-preview',
                                    style: { cursor: 'pointer' },
                                    events: {
                                        click: (e) => {
                                            e.stopPropagation();
                                            window.open(url, '_blank');
                                        }
                                    }
                                },
                                [
                                    createElement('div', { 
                                        className: 'link-thumbnail',
                                        style: { 
                                            backgroundImage: "url('https://via.placeholder.com/100')",
                                            width: '50px',
                                            height: '50px'
                                        }
                                    }),
                                    createElement('div', { className: 'link-title' }, ['View Image'])
                                ]
                            );
                            
                            parent.innerHTML = '';
                            parent.appendChild(linkPreview);
                        }
                    }
                }
            });
            
            return createElement('div', { 
                className: 'media-preview',
                events: {
                    click: (e) => {
                        e.stopPropagation();
                        window.open(url, '_blank');
                    }
                }
            }, [imgElement]);
        },
        
        createArticlePreview(url) {
            const domain = utils.getDomainFromURL(url);
            
            return createElement('div', 
                { 
                    className: 'article-preview',
                    style: { cursor: 'pointer' },
                    events: {
                        click: (e) => {
                            e.stopPropagation();
                            window.open(url, '_blank');
                        }
                    }
                },
                [
                    createElement('div', { 
                        className: 'article-thumbnail',
                        style: {
                            backgroundImage: "url('https://via.placeholder.com/100')",
                            width: '50px',
                            height: '50px'
                        }
                    }),
                    createElement('div', { className: 'article-title' }, [`View on ${domain}`])
                ]
            );
        },
        
        createGenericMedia(url, alt) {
            const domain = utils.getDomainFromURL(url);
            
            return createElement('div', 
                { 
                    className: 'external-link',
                    style: { cursor: 'pointer' },
                    events: {
                        click: (e) => {
                            e.stopPropagation();
                            window.open(url, '_blank');
                        }
                    }
                },
                [
                    createElement('div', { 
                        className: 'link-icon',
                        style: { fontSize: '24px' },
                        html: '🔗'
                    }),
                    createElement('div', { className: 'link-text' }, [`${domain}`])
                ]
            );
        }
    };

    // UI controller - improved
    const ui = {
        init() {
            this.applyStyles();
            this.addSearchBar();
            this.createPostsContainer();
        },
        
        applyStyles() {
            const style = createElement('style', {
                textContent: `
                    body { 
                        font-family: Arial, sans-serif; 
                        padding-top: 50px;
                        margin: 0;
                        padding-bottom: 100px;
                    }
                    #search-bar { 
                        width: 100%; 
                        padding: 10px; 
                        font-size: 16px;
                        position: fixed;
                        top: 0;
                        left: 0;
                        z-index: 1000;
                        box-sizing: border-box;
                        border: none;
                        border-bottom: 1px solid #ccc;
                        background: white;
                    }
                    #posts-container {
                        margin-top: 10px;
                    }
                    .post-card { 
                        border: 1px solid #ccc; 
                        padding: 15px; 
                        margin: 15px; 
                        cursor: pointer;
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        transition: box-shadow 0.3s ease;
                    }
                    .post-card:hover {
                        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                    }
                    .post-content {
                        display: flex;
                        flex-direction: column;
                    }
                    .post-image-container {
                        margin-bottom: 10px;
                        display: flex;
                        justify-content: center;
                    }
                    .comment { 
                        background-color: #f1f1f1; 
                        padding: 10px; 
                        margin: 8px 0; 
                        border-radius: 5px;
                        word-break: break-word;
                    }
                    #post-detail { 
                        margin: 20px; 
                        padding-bottom: 100px;
                    }
                    #back-button { 
                        margin-top: 15px;
                        margin-bottom: 15px;
                        padding: 8px 16px;
                        background-color: #f1f1f1;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                    }
                    #back-button:hover {
                        background-color: #e1e1e1;
                    }
                    #comments-section { 
                        max-height: 400px; 
                        overflow-y: auto;
                        margin: 15px 0;
                        padding: 10px;
                        border: 1px solid #eee;
                        border-radius: 8px;
                    }
                    .comment-form {
                        position: fixed;
                        bottom: 0;
                        left: 0;
                        width: 100%;
                        background: white;
                        padding: 10px;
                        box-sizing: border-box;
                        border-top: 1px solid #ccc;
                        display: flex;
                        z-index: 1000;
                    }
                    #comment-input {
                        flex: 1;
                        padding: 10px;
                        font-size: 16px;
                        border: 1px solid #ccc;
                        border-radius: 4px;
                        margin-right: 10px;
                    }
                    #comment-submit {
                        padding: 10px 15px;
                        background-color: #4CAF50;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                    }
                    #comment-submit:hover {
                        background-color: #45a049;
                    }
                    
                    /* Media preview styles */
                    .media-preview { 
                        display: flex; 
                        align-items: center;
                        justify-content: center;
                        max-width: 100%;
                        margin: 10px 0;
                        cursor: pointer;
                    }
                    .link-preview, .article-preview { 
                        display: flex; 
                        align-items: center; 
                        background-color: #f8f8f8;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        padding: 8px;
                        max-width: 100%;
                        margin: 5px 0;
                    }
                    .link-thumbnail, .article-thumbnail { 
                        width: 50px; 
                        height: 50px; 
                        background-size: cover;
                        background-position: center;
                        margin-right: 10px;
                        border-radius: 4px;
                    }
                    .link-title, .article-title, .link-text { 
                        font-size: 14px;
                        color: #0066cc;
                    }
                    .external-link {
                        display: flex;
                        align-items: center;
                        background-color: #f8f8f8;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        padding: 8px;
                        margin: 5px 0;
                    }
                    .link-icon {
                        margin-right: 8px;
                    }
                    .comment-media {
                        margin-top: 5px;
                    }
                    .url-preview {
                        margin-top: 8px;
                        padding: 8px;
                        background-color: #f8f8f8;
                        border-radius: 4px;
                    }
                    .empty-media {
                        display: none;
                    }
                    
                    /* Responsive design */
                    @media (max-width: 600px) {
                        .post-card {
                            margin: 10px;
                            padding: 10px;
                        }
                        #post-detail {
                            margin: 10px;
                        }
                    }
                `
            });
            
            document.head.appendChild(style);
        },
        
        addSearchBar() {
            const searchBar = createElement('input', {
                type: 'text',
                placeholder: 'Search posts...',
                id: 'search-bar',
                events: {
                    input: utils.debounce(function() {
                        const searchTerm = this.value.toLowerCase();
                        const filteredPosts = posts.filter(post =>
                            post.titulo.toLowerCase().includes(searchTerm) ||
                            post.descripcion.toLowerCase().includes(searchTerm)
                        );
                        ui.displayPosts(filteredPosts);
                    }, 300)
                }
            });
            
            DOM.body.appendChild(searchBar);
        },
        
        createPostsContainer() {
            DOM.postsContainer = document.getElementById('posts-container') || 
                createElement('div', { id: 'posts-container' });
                
            if (!document.getElementById('posts-container')) {
                DOM.body.appendChild(DOM.postsContainer);
            }
        },
        
        displayPosts(postsToDisplay) {
            console.log('Displaying posts');
            
            if (!DOM.postsContainer) {
                this.createPostsContainer();
            }
            
            // Use DocumentFragment for better performance
            const fragment = document.createDocumentFragment();
            
            postsToDisplay.forEach(post => {
                const postElement = createElement('div', {
                    className: 'post-card',
                    events: {
                        click: () => this.showPostDetail(post.id)
                    }
                });
                
                const contentWrapper = createElement('div', { className: 'post-content' });
                
                const imageContainer = createElement('div', { className: 'post-image-container' });
                
                if (utils.isValidURL(post.imagen)) {
                    imageContainer.appendChild(mediaHandler.handleMediaDisplay(post.imagen, post.titulo));
                } else if (post.imagen) {
                    const imgElement = createElement('img', {
                        src: post.imagen,
                        alt: post.titulo,
                        style: { maxWidth: '100px', height: 'auto' },
                        events: {
                            error: function() {
                                this.onerror = null;
                                this.src = 'https://via.placeholder.com/100';
                            }
                        }
                    });
                    imageContainer.appendChild(imgElement);
                }
                
                contentWrapper.appendChild(imageContainer);
                contentWrapper.appendChild(createElement('h2', {}, [post.titulo]));
                contentWrapper.appendChild(createElement('p', {}, [post.descripcion]));
                
                postElement.appendChild(contentWrapper);
                fragment.appendChild(postElement);
            });
            
            // Clear and append all at once
            DOM.postsContainer.innerHTML = '';
            DOM.postsContainer.appendChild(fragment);
        },
        
        async showPostDetail(postId) {
            console.log('Showing post details for post ID:', postId);
            const post = posts.find(p => p.id === postId);
            
            if (!post) return;
            
            // Hide posts container
            if (DOM.postsContainer) {
                DOM.postsContainer.style.display = 'none';
            }
            
            // Hide search bar
            const searchBar = document.getElementById('search-bar');
            if (searchBar) {
                searchBar.style.display = 'none';
            }
            
            // Create detail view
            const detailView = createElement('div', { id: 'post-detail' });
            
            // Add back button at the top
            const backButton = createElement('button', {
                id: 'back-button',
                textContent: 'Back to Posts',
                events: {
                    click: () => {
                        this.closePostDetail(detailView);
                    }
                }
            });
            detailView.appendChild(backButton);
            
            const imageContainer = createElement('div', { className: 'post-image-detail' });
            
            if (utils.isValidURL(post.imagen)) {
                imageContainer.appendChild(mediaHandler.handleMediaDisplay(post.imagen, post.titulo));
            } else if (post.imagen) {
                const imgElement = createElement('img', {
                    src: post.imagen,
                    alt: post.titulo,
                    style: { maxWidth: '100%' },
                    events: {
                        error: function() {
                            this.onerror = null;
                            this.src = 'https://via.placeholder.com/100';
                        }
                    }
                });
                imageContainer.appendChild(imgElement);
            }
            
            detailView.appendChild(imageContainer);
            detailView.appendChild(createElement('h2', {}, [post.titulo]));
            detailView.appendChild(createElement('p', {}, [post.descripcion]));
            
            const commentsSection = createElement('div', { id: 'comments-section' });
            detailView.appendChild(commentsSection);
            
            // Create comment form with input and button
            const commentForm = createElement('div', { className: 'comment-form' });
            
            const commentInput = createElement('input', {
                type: 'text',
                id: 'comment-input',
                placeholder: 'Add a comment...',
                maxLength: 140
            });
            
            const commentSubmit = createElement('button', {
                id: 'comment-submit',
                textContent: 'Post',
                events: {
                    click: async () => {
                        const commentText = commentInput.value.trim();
                        if (commentText !== '') {
                            const success = await api.addComment(postId, commentText);
                            if (success) {
                                commentInput.value = '';
                                const comments = await api.fetchComments(postId);
                                this.displayComments(comments);
                            }
                        }
                    }
                }
            });
            
            commentForm.appendChild(commentInput);
            commentForm.appendChild(commentSubmit);
            
            // Add event listener for Enter key on comment input
            commentInput.addEventListener('keypress', async function(e) {
                if (e.key === 'Enter' && this.value.trim() !== '') {
                    const success = await api.addComment(postId, this.value);
                    if (success) {
                        this.value = '';
                        const comments = await api.fetchComments(postId);
                        ui.displayComments(comments);
                    }
                }
            });
            
            detailView.appendChild(commentForm);
            
            DOM.body.appendChild(detailView);
            
            // Start comments system
            const comments = await api.fetchComments(postId);
            this.displayComments(comments);
            this.startCommentPolling(postId);
        },
        
        displayComments(comments) {
            console.log('Displaying comments');
            const commentsSection = document.getElementById('comments-section');
            if (!commentsSection) return;
        
            const scrollPosition = commentsSection.scrollTop;
        
            // Use DocumentFragment for better performance
            const fragment = document.createDocumentFragment();
        
            comments.forEach(comment => {
                const commentElement = createElement('div', { className: 'comment' });
        
                // Check if the comment is a URL
                if (utils.isValidURL(comment.comentario)) {
                    const url = comment.comentario;
        
                    // Check if the URL is an image
                    if (url.match(/\.(jpeg|jpg|gif|png)$/) !== null) {
                        // Display image preview
                        const imgElement = createElement('img', {
                            src: url,
                            alt: 'Image preview',
                            style: {
                                maxWidth: '100%',
                                height: 'auto',
                                borderRadius: '4px'
                            },
                            events: {
                                error: function() {
                                    this.onerror = null;
                                    this.src = 'https://via.placeholder.com/100';
                                }
                            }
                        });
                        commentElement.appendChild(imgElement);
                    } else {
                        // Display web page preview
                        const linkPreview = createElement('div', 
                            { 
                                className: 'link-preview',
                                style: { cursor: 'pointer' },
                                events: {
                                    click: (e) => {
                                        e.stopPropagation();
                                        window.open(url, '_blank');
                                    }
                                }
                            },
                            [
                                createElement('div', { 
                                    className: 'link-thumbnail',
                                    style: { backgroundImage: "url('https://via.placeholder.com/100')" }
                                }),
                                createElement('div', { className: 'link-title' }, [`View on ${utils.getDomainFromURL(url)}`])
                            ]
                        );
                        commentElement.appendChild(linkPreview);
                    }
                } else {
                    // Regular text comment
                    commentElement.textContent = comment.comentario;
                }
        
                fragment.appendChild(commentElement);
            });
        
            commentsSection.innerHTML = '';
            commentsSection.appendChild(fragment);
            commentsSection.scrollTop = scrollPosition;
        },
        
        startCommentPolling(postId) {
            stopCommentPolling(); // Clear any existing interval
            
            commentPollingInterval = setInterval(async () => {
                const comments = await api.fetchComments(postId);
                this.displayComments(comments);
            }, 5000);
        },
        
        closePostDetail(detailView) {
            stopCommentPolling();
            DOM.body.removeChild(detailView);
            
            // Show search bar again
            const searchBar = document.getElementById('search-bar');
            if (searchBar) {
                searchBar.style.display = 'block';
            }
            
            if (DOM.postsContainer) {
                DOM.postsContainer.style.display = 'block';
            }
        }
    };

    // Stop comment polling helper
    function stopCommentPolling() {
        if (commentPollingInterval) {
            clearInterval(commentPollingInterval);
            commentPollingInterval = null;
        }
    }

    // Initialize the application
    async function init() {
        ui.init();
        posts = await api.fetchPosts();
        ui.displayPosts(posts);
    }

    // Start the application
    init();
});