// Join room functionality
document.addEventListener('DOMContentLoaded', function() {
    const roomCodeInput = document.getElementById('roomCodeInput');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const errorMessage = document.getElementById('error-message');
    const usernameDisplay = document.getElementById('username-display');
    const userAvatar = document.getElementById('user-avatar');
    const changeUserBtn = document.getElementById('change-user-btn');
    const usernameModal = document.getElementById('username-modal');
    const usernameInput = document.getElementById('usernameInput');
    const usernameConfirm = document.getElementById('username-confirm');
    const usernameCancel = document.getElementById('username-cancel');
    const selectedAvatar = document.getElementById('selected-avatar');
    const avatarModal = document.getElementById('avatar-modal');
    const avatarConfirm = document.getElementById('avatar-confirm');
    const avatarCancel = document.getElementById('avatar-cancel');

    let currentUser = null;
    // Use global selectedAvatarId from common.js
    // let selectedAvatarId = 1; // Remove local variable

    // Initialize page
    function initializePage() {
        currentUser = gameState.getCurrentUser();
        updateUserDisplay();
        
        // Initialize selectedAvatarId from current user or default to 1
        selectedAvatarId = currentUser?.avatar || 1;
        
        // Check URL parameters for room code
        const urlParams = getUrlParams();
        if (urlParams.roomId) {
            roomCodeInput.value = urlParams.roomId.toUpperCase();
        }
        
        // Check for error messages
        if (urlParams.error) {
            showError(getErrorMessage(urlParams.error));
        }
    }

    function updateUserDisplay() {
        if (currentUser && currentUser.username) {
            usernameDisplay.textContent = currentUser.username;
            updateAvatarDisplay('user-avatar', currentUser.avatar || 1);
        } else {
            usernameDisplay.textContent = 'Misafir';
            updateAvatarDisplay('user-avatar', 1);
        }
    }

    function showError(message) {
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.classList.remove('hidden');
            setTimeout(() => {
                errorMessage.classList.add('hidden');
            }, 5000);
        }
    }

    function getErrorMessage(error) {
        switch (error) {
            case 'room_not_found':
                return 'Oda bulunamadı. Lütfen oda kodunu kontrol edin.';
            case 'room_full':
                return 'Oda dolu. Lütfen daha sonra tekrar deneyin.';
            case 'invalid_room':
                return 'Geçersiz oda kodu. Lütfen doğru kodu girin.';
            default:
                return 'Bir hata oluştu. Lütfen tekrar deneyin.';
        }
    }

    function joinRoom() {
        const roomCode = roomCodeInput.value.trim().toUpperCase();
        
        if (!roomCode) {
            showError('Lütfen oda kodunu girin.');
            return;
        }

        if (roomCode.length !== 6) {
            showError('Oda kodu 6 karakter olmalıdır.');
            return;
        }

        if (!currentUser || !currentUser.username || currentUser.username === 'Misafir') {
            showError('Lütfen önce kullanıcı bilgilerinizi girin.');
            return;
        }

        // Redirect to room
        window.location.href = `/room/${roomCode}`;
    }

    function showUsernameModal() {
        if (currentUser) {
            usernameInput.value = currentUser.username || '';
            selectedAvatarId = currentUser.avatar || 1;
        } else {
            usernameInput.value = '';
            selectedAvatarId = 1;
        }
        updateAvatarDisplay('selected-avatar', selectedAvatarId);
        usernameModal.classList.remove('hidden');
        usernameInput.focus();
    }

    function hideUsernameModal() {
        usernameModal.classList.add('hidden');
    }

    function saveUserInfo() {
        const username = usernameInput.value.trim();
        const validation = validateUsername(username);
        
        if (!validation.valid) {
            showError(validation.message);
            return;
        }

        currentUser = {
            username: username,
            avatar: selectedAvatarId
        };
        
        gameState.setCurrentUser(currentUser);
        updateUserDisplay();
        hideUsernameModal();
    }

    function showAvatarModal() {
        hideUsernameModal();
        avatarModal.classList.remove('hidden');
        populateAvatarGrid();
        // Ensure the correct avatar is highlighted
        setTimeout(() => {
            const selectedOption = document.querySelector(`.avatar-option[data-avatar-id="${selectedAvatarId}"]`);
            if (selectedOption) {
                document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
                selectedOption.classList.add('selected');
            }
        }, 100);
    }

    // Event listeners
    joinRoomBtn.addEventListener('click', joinRoom);
    
    roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinRoom();
        }
    });

    roomCodeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });

    changeUserBtn.addEventListener('click', showUsernameModal);
    
    usernameConfirm.addEventListener('click', saveUserInfo);
    usernameCancel.addEventListener('click', hideUsernameModal);
    
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveUserInfo();
        }
    });

    selectedAvatar.addEventListener('click', showAvatarModal);

    avatarConfirm.addEventListener('click', () => {
        updateAvatarDisplay('selected-avatar', selectedAvatarId);
        avatarModal.classList.add('hidden');
        usernameModal.classList.remove('hidden');
    });

    avatarCancel.addEventListener('click', () => {
        avatarModal.classList.add('hidden');
        usernameModal.classList.remove('hidden');
    });

    // Initialize page
    initializePage();
});
