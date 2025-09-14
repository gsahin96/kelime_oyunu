// Home page functionality
document.addEventListener('DOMContentLoaded', function() {
    const authScreen = document.getElementById('auth-screen');
    const initialScreen = document.getElementById('initial-screen');
    const entryUsername = document.getElementById('entryUsername');
    const startGameButton = document.getElementById('startGameButton');
    const entryAvatar = document.getElementById('entry-avatar');
    const welcomeUsername = document.getElementById('welcomeUsername');
    const userAvatar = document.getElementById('user-avatar');
    const createRoomButton = document.getElementById('createRoomButton');
    const showJoinFormButton = document.getElementById('showJoinFormButton');
    const showStatsButton = document.getElementById('showStatsButton');
    const chooseAvatarBtn = document.getElementById('choose-avatar-btn');
    const editUsernameBtn = document.getElementById('edit-username-btn');
    const avatarModal = document.getElementById('avatar-modal');
    const avatarConfirm = document.getElementById('avatar-confirm');
    const avatarCancel = document.getElementById('avatar-cancel');

    let socket = null;

    // Initialize page based on user state
    function initializePage() {
        // Load user from localStorage if available
        const storedUser = localStorage.getItem('currentUser');
        let currentUser = null;
        
        if (storedUser) {
            try {
                currentUser = JSON.parse(storedUser);
                gameState.setCurrentUser(currentUser);
            } catch (e) {
                console.error('Failed to parse stored user data:', e);
                localStorage.removeItem('currentUser');
            }
        }
        
        if (currentUser) {
            showMainMenu(currentUser);
        } else {
            // Only redirect if we're not already on the home page
            if (window.location.pathname !== '/') {
                window.location.href = '/';
            }
        }
    }

    function showEntryScreen() {
        authScreen.classList.remove('hidden');
        initialScreen.classList.add('hidden');
        
        // Reset form
        entryUsername.value = '';
        selectedAvatarId = 1;
        updateEntryAvatar();
    }

    function showMainMenu(user) {
        authScreen.classList.add('hidden');
        initialScreen.classList.remove('hidden');
        
        // Update user display
        welcomeUsername.textContent = user.username;
        updateAvatarDisplay('user-avatar', user.avatar || 1);
        
        // Setup username edit
        setupUsernameEdit();
    }

    function updateEntryAvatar() {
        updateAvatarDisplay('entry-avatar', selectedAvatarId);
    }

    function setupUsernameEdit() {
        editUsernameBtn.addEventListener('click', () => {
            const currentUser = gameState.getCurrentUser();
            const newUsername = prompt('Yeni kullanıcı adını girin:', currentUser.username);
            
            if (newUsername && newUsername.trim()) {
                const validation = validateUsername(newUsername.trim());
                if (validation.valid) {
                    currentUser.username = newUsername.trim();
                    gameState.setCurrentUser(currentUser);
                    welcomeUsername.textContent = currentUser.username;
                    showMessage('entryMessage', `İsim "${currentUser.username}" olarak değiştirildi!`, false);
                } else {
                    showMessage('entryMessage', validation.message, true);
                }
            }
        });
    }

    // Entry avatar click handler
    entryAvatar.addEventListener('click', () => {
        avatarModal.classList.remove('hidden');
        populateAvatarGrid();
        
        // Select current entry avatar
        document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
        const currentOption = document.querySelector(`[data-avatar-id="${selectedAvatarId}"]`);
        if (currentOption) {
            currentOption.classList.add('selected');
        }
    });

    // Choose avatar button (main menu)
    chooseAvatarBtn.addEventListener('click', () => {
        avatarModal.classList.remove('hidden');
        populateAvatarGrid();
        
        const currentUser = gameState.getCurrentUser();
        selectedAvatarId = currentUser.avatar || 1;
    });

    // Avatar modal handlers
    avatarConfirm.addEventListener('click', () => {
        const currentUser = gameState.getCurrentUser();
        
        if (currentUser) {
            // Update existing user
            currentUser.avatar = selectedAvatarId;
            gameState.setCurrentUser(currentUser);
            updateAvatarDisplay('user-avatar', selectedAvatarId);
            // Also update entry avatar in case we're still on auth screen
            updateEntryAvatar();
        } else {
            // Update entry avatar
            updateEntryAvatar();
        }
        
        avatarModal.classList.add('hidden');
    });

    avatarCancel.addEventListener('click', () => {
        avatarModal.classList.add('hidden');
    });

    // Start game button
    startGameButton.addEventListener('click', () => {
        const username = entryUsername.value.trim();
        const validation = validateUsername(username);
        
        if (!validation.valid) {
            showMessage('entryMessage', validation.message, true);
            return;
        }

        // Create user object
        const user = {
            username: username,
            avatar: selectedAvatarId
        };

        gameState.setCurrentUser(user);
        showMainMenu(user);
        showMessage('entryMessage', `Hoş geldin ${username}!`, false);
    });

    // Username input enter key
    entryUsername.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            startGameButton.click();
        }
    });

    // Room actions
    createRoomButton.addEventListener('click', () => {
        const currentUser = gameState.getCurrentUser();
        
        if (!currentUser) {
            showMessage('entryMessage', 'Kullanıcı bilgisi bulunamadı!', true);
            return;
        }

        // Initialize socket connection
        socket = gameState.initializeSocket();

        socket.emit('createRoom', {
            name: currentUser.username,
            avatar: currentUser.avatar
        });

        socket.on('roomCreated', ({ roomId, playerDetails }) => {
            gameState.setCurrentRoom({
                roomId: roomId,
                playerDetails: playerDetails,
                isHost: true
            });
            // Always redirect to admin view for room creators
            window.location.href = `/room/${roomId}/admin`;
        });

        socket.on('gameError', (message) => {
            showMessage('entryMessage', message, true);
        });
    });

    // Join form button
    showJoinFormButton.addEventListener('click', () => {
        gameState.goToJoin();
    });
    showStatsButton.addEventListener('click', () => {
        const currentUser = gameState.getCurrentUser();
        if (!currentUser) {
            showMessage('entryMessage', 'İstatistikleri görmek için oyuna giriş yapın!', true);
            return;
        }
        
        gameState.goToProfile();
    });

    // Initialize page
    initializePage();
});