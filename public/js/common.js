// Common functionality shared across all pages
class GameState {
    constructor() {
        this.currentUser = this.loadCurrentUser();
        this.currentRoom = this.loadCurrentRoom();
        this.socket = null;
    }

    // User Management
    setCurrentUser(user) {
        this.currentUser = user;
        localStorage.setItem('kelime_oyunu_user', JSON.stringify(user));
    }

    getCurrentUser() {
        return this.currentUser || this.loadCurrentUser();
    }

    loadCurrentUser() {
        try {
            const saved = localStorage.getItem('kelime_oyunu_user');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    }

    clearCurrentUser() {
        this.currentUser = null;
        localStorage.removeItem('kelime_oyunu_user');
    }

    // Room Management
    setCurrentRoom(roomData) {
        this.currentRoom = roomData;
        localStorage.setItem('kelime_oyunu_room', JSON.stringify(roomData));
    }

    getCurrentRoom() {
        return this.currentRoom || this.loadCurrentRoom();
    }

    loadCurrentRoom() {
        try {
            const saved = localStorage.getItem('kelime_oyunu_room');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    }

    clearCurrentRoom() {
        this.currentRoom = null;
        localStorage.removeItem('kelime_oyunu_room');
    }

    // Navigation helpers
    goToHome() {
        window.location.href = '/';
    }

    goToJoin() {
        window.location.href = '/join';
    }

    goToProfile() {
        window.location.href = '/profile';
    }

    goToRoom(roomId) {
        window.location.href = `/room/${roomId}`;
    }

    // Socket connection
    initializeSocket() {
        if (!this.socket) {
            this.socket = io();
        }
        return this.socket;
    }

    disconnectSocket() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}

// Global game state instance
const gameState = new GameState();

// Avatar system
const avatarEmojis = ['🎮', '🚀', '⭐', '🌟', '🎯', '🎲', '🏆', '💎', '🔥', '⚡', '🎪', '🎭', '🎨', '🎵', '🌈', '💫'];
let selectedAvatarId = 1;

function getAvatarData(avatarId) {
    return { 
        emoji: avatarEmojis[avatarId - 1] || '🎮', 
        class: `avatar-${avatarId}` 
    };
}

function populateAvatarGrid() {
    const avatarGrid = document.getElementById('avatar-grid');
    if (!avatarGrid) return;
    
    avatarGrid.innerHTML = '';
    
    // Get current avatar ID
    let currentAvatarId = selectedAvatarId;
    const user = gameState.getCurrentUser();
    if (user && user.avatar) {
        currentAvatarId = user.avatar;
    }
    
    for (let i = 1; i <= 16; i++) {
        const avatarOption = document.createElement('div');
        const avatarData = getAvatarData(i);
        avatarOption.className = `avatar avatar-option ${avatarData.class}`;
        avatarOption.textContent = avatarData.emoji;
        avatarOption.dataset.avatarId = i;
        
        // Pre-select current avatar
        if (i === currentAvatarId) {
            avatarOption.classList.add('selected');
            selectedAvatarId = i;
        }
        
        avatarOption.addEventListener('click', () => {
            document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
            avatarOption.classList.add('selected');
            selectedAvatarId = i;
        });
        
        avatarGrid.appendChild(avatarOption);
    }
    
    // Fallback if no avatar was pre-selected
    if (!selectedAvatarId && avatarGrid.children[0]) {
        avatarGrid.children[0].classList.add('selected');
        selectedAvatarId = 1;
    }
}

function updateAvatarDisplay(elementId, avatarId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const avatarData = getAvatarData(avatarId);
    element.className = element.className.replace(/avatar-\d+/g, '') + ` ${avatarData.class}`;
    element.textContent = avatarData.emoji;
}

// Theme system
function changeTheme(theme) {
    const body = document.body;
    const themeBtns = document.querySelectorAll('.theme-btn');
    
    // Remove all theme classes
    body.classList.remove('theme-void', 'theme-dark', 'theme-light');
    
    // Add new theme class
    body.classList.add(`theme-${theme}`);
    
    // Update active button
    themeBtns.forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.querySelector(`.theme-btn-${theme}`);
    if (targetBtn) targetBtn.classList.add('active');
    
    // Update animated background
    const animatedBg = document.getElementById('animated-background');
    if (animatedBg) {
        animatedBg.className = 'animated-bg';
    }
    
    localStorage.setItem('selectedTheme', theme);
}

// Initialize theme on page load
function initializeTheme() {
    const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
    changeTheme(savedTheme);
}

// How to play panel functionality
function initializeHowToPlay() {
    const toggleHowtoBtn = document.getElementById('toggle-howto');
    const howtoPanel = document.getElementById('howto-panel');
    const closeHowto = document.getElementById('close-howto');
    
    if (toggleHowtoBtn && howtoPanel) {
        toggleHowtoBtn.addEventListener('click', () => {
            howtoPanel.classList.toggle('hidden');
        });
    }
    
    if (closeHowto && howtoPanel) {
        closeHowto.addEventListener('click', () => {
            howtoPanel.classList.add('hidden');
        });
    }
}

// Utility functions
function showMessage(elementId, message, isError = false) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.textContent = message;
    element.className = `mt-4 p-3 rounded-lg text-center text-sm ${isError ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`;
    element.classList.remove('hidden');
    
    setTimeout(() => element.classList.add('hidden'), 3000);
}

function validateUsername(username) {
    if (!username || username.length < 2) {
        return { valid: false, message: 'Kullanıcı adı en az 2 karakter olmalı!' };
    }
    if (username.length > 20) {
        return { valid: false, message: 'Kullanıcı adı en fazla 20 karakter olabilir!' };
    }
    if (!/^[a-zA-Z0-9_çğıöşüÇĞIİÖŞÜ\s]+$/.test(username)) {
        return { valid: false, message: 'Kullanıcı adı sadece harf, rakam ve _ içerebilir!' };
    }
    return { valid: true };
}

// URL parameter helpers
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        roomId: params.get('room') || params.get('oda'),
        error: params.get('error')
    };
}

function setUrlParam(key, value) {
    const url = new URL(window.location);
    if (value) {
        url.searchParams.set(key, value);
    } else {
        url.searchParams.delete(key);
    }
    window.history.replaceState({}, '', url);
}

// Initialize common functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeTheme();
    initializeHowToPlay();
    
    // Check for room reconnection on game pages
    const roomData = gameState.getCurrentRoom();
    if (roomData && window.location.pathname.startsWith('/room/')) {
        const currentRoomId = window.location.pathname.split('/room/')[1];
        if (roomData.roomId !== currentRoomId) {
            // Clear stale room data
            gameState.clearCurrentRoom();
        }
    }
});

// Export for use in other scripts
window.gameState = gameState;
window.getAvatarData = getAvatarData;
window.populateAvatarGrid = populateAvatarGrid;
window.updateAvatarDisplay = updateAvatarDisplay;
window.changeTheme = changeTheme;
window.showMessage = showMessage;
window.validateUsername = validateUsername;
window.getUrlParams = getUrlParams;
window.setUrlParam = setUrlParam;