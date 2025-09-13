// Admin panel functionality
document.addEventListener('DOMContentLoaded', function() {
    const adminContainer = document.getElementById('admin-container');
    const adminLoading = document.getElementById('admin-loading');
    const adminError = document.getElementById('admin-error');
    const backToRoomBtn = document.getElementById('back-to-room-btn');
    
    // Room info elements
    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    const inviteLink = document.getElementById('inviteLink');
    const copyRoomCode = document.getElementById('copyRoomCode');
    const copyInviteLink = document.getElementById('copyInviteLink');
    
    // Settings elements
    const adminScoreGoal = document.getElementById('adminScoreGoal');
    const adminTurnDuration = document.getElementById('adminTurnDuration');
    const saveSettings = document.getElementById('saveSettings');
    
    // Game control elements
    const adminStartGame = document.getElementById('adminStartGame');
    const adminNewGame = document.getElementById('adminNewGame');
    const adminResetScores = document.getElementById('adminResetScores');
    
    // Status elements
    const adminPlayersList = document.getElementById('adminPlayersList');
    const gameStatus = document.getElementById('gameStatus');
    const activePlayerCount = document.getElementById('activePlayerCount');
    const adminScoreboard = document.getElementById('adminScoreboard');
    
    // Confirmation modal
    const confirmModal = document.getElementById('confirmModal');
    const confirmMessage = document.getElementById('confirmMessage');
    const confirmYes = document.getElementById('confirmYes');
    const confirmNo = document.getElementById('confirmNo');
    
    let socket = null;
    let currentUser = null;
    let roomId = null;
    let isAuthorized = false;
    let currentPlayers = [];
    let currentScores = {};
    let gameInProgress = false;
    let pendingConfirmAction = null;

    // Initialize admin panel
    function initializeAdminPanel() {
        // Get room ID from URL
        const pathParts = window.location.pathname.split('/');
        roomId = pathParts[2]; // /room/ABC123/admin -> ABC123
        
        if (!roomId) {
            showError('Geçersiz oda kodu');
            return;
        }
        
        // Get current user
        currentUser = gameState.getCurrentUser();
        if (!currentUser) {
            showError('Kullanıcı bilgisi bulunamadı');
            return;
        }
        
        // Set room info
        roomCodeDisplay.value = roomId;
        inviteLink.value = `${window.location.origin}/join?room=${roomId}`;
        
        // Set back to room button
        backToRoomBtn.onclick = () => {
            window.location.href = `/room/${roomId}`;
        };
        
        // Initialize socket and verify admin access
        initializeSocket();
    }
    
    function initializeSocket() {
        socket = gameState.initializeSocket();
        
        // Request admin verification
        socket.emit('requestAdminAccess', {
            roomId: roomId,
            username: currentUser.username
        });
        
        setupSocketListeners();
    }
    
    function setupSocketListeners() {
        socket.on('adminAccessGranted', ({ playerDetails, roomData }) => {
            isAuthorized = true;
            showAdminPanel();
            updateRoomData(roomData);
        });
        
        socket.on('adminAccessDenied', (reason) => {
            showError(reason || 'Admin erişimi reddedildi');
        });
        
        socket.on('lobbyUpdate', ({ players, gameHostId, settings, gameInProgress: inProgress }) => {
            if (!isAuthorized) return;
            
            currentPlayers = players;
            gameInProgress = inProgress;
            
            updatePlayersList(players);
            updateGameSettings(settings);
            updateGameStatus(inProgress, players.length);
            updateControls(inProgress);
        });
        
        socket.on('scoreUpdate', ({ scores, isGameOver }) => {
            if (!isAuthorized) return;
            
            currentScores = scores;
            updateAdminScoreboard(scores, isGameOver);
        });
        
        socket.on('gameError', (message) => {
            showMessage(message, true);
        });
        
        socket.on('disconnect', () => {
            showMessage('Bağlantı kesildi', true);
        });
        
        socket.on('connect', () => {
            if (isAuthorized) {
                showMessage('Bağlantı yeniden kuruldu', false);
            }
        });
    }
    
    function showAdminPanel() {
        adminLoading.classList.add('hidden');
        adminError.classList.add('hidden');
        adminContainer.classList.remove('hidden');
    }
    
    function showError(message) {
        adminLoading.classList.add('hidden');
        adminContainer.classList.add('hidden');
        adminError.classList.remove('hidden');
        
        // Update error message if needed
        const errorText = adminError.querySelector('p');
        if (errorText && message) {
            errorText.textContent = message;
        }
    }
    
    function updateRoomData(roomData) {
        if (roomData.settings) {
            adminScoreGoal.value = roomData.settings.scoreGoal || 10;
            adminTurnDuration.value = roomData.settings.turnDuration || 5;
        }
        
        if (roomData.players) {
            updatePlayersList(roomData.players);
        }
        
        if (roomData.scores) {
            updateAdminScoreboard(roomData.scores);
        }
        
        updateGameStatus(roomData.gameInProgress || false, roomData.players?.length || 0);
    }
    
    function updatePlayersList(players) {
        adminPlayersList.innerHTML = '';
        
        if (players.length === 0) {
            adminPlayersList.innerHTML = '<p class="text-gray-500 text-center py-4">Henüz oyuncu yok</p>';
            return;
        }
        
        players.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'flex items-center justify-between p-3 bg-gray-700 rounded-lg';
            
            const avatarData = getAvatarData(player.avatar || 1);
            const isHost = player.id === socket.id; // Check if this is the admin
            
            playerDiv.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="avatar small ${avatarData.class}" style="margin-bottom: 0; width: 30px; height: 30px; font-size: 14px;">
                        ${avatarData.emoji}
                    </div>
                    <div>
                        <span class="font-bold">${player.name}</span>
                        ${isHost ? '<span class="ml-2 text-xs bg-yellow-600 px-2 py-1 rounded">ADMIN</span>' : ''}
                        ${player.disconnected ? '<span class="ml-2 text-xs bg-red-600 px-2 py-1 rounded">BAĞLANTI KESİK</span>' : ''}
                    </div>
                </div>
                <div class="text-sm text-gray-400">
                    Sıra: ${index + 1}
                </div>
            `;
            
            adminPlayersList.appendChild(playerDiv);
        });
    }
    
    function updateGameSettings(settings) {
        if (settings) {
            adminScoreGoal.value = settings.scoreGoal || 10;
            adminTurnDuration.value = settings.turnDuration || 5;
        }
    }
    
    function updateGameStatus(inProgress, playerCount) {
        gameStatus.textContent = inProgress ? 'Oyun Devam Ediyor' : 'Bekleniyor';
        gameStatus.className = `p-3 rounded-lg font-bold text-center ${
            inProgress ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
        }`;
        
        activePlayerCount.textContent = playerCount.toString();
        activePlayerCount.className = `p-3 rounded-lg font-bold text-center ${
            playerCount > 0 ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
        }`;
    }
    
    function updateControls(inProgress) {
        adminStartGame.disabled = inProgress || currentPlayers.length < 1;
        adminStartGame.className = `font-bold py-3 px-4 rounded-lg transition ${
            adminStartGame.disabled 
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-700 text-white cursor-pointer'
        }`;
        
        adminNewGame.disabled = !inProgress;
        adminNewGame.className = `font-bold py-3 px-4 rounded-lg transition ${
            adminNewGame.disabled 
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                : 'bg-yellow-600 hover:bg-yellow-700 text-white cursor-pointer'
        }`;
    }
    
    function updateAdminScoreboard(scores, isGameOver = false) {
        adminScoreboard.innerHTML = '';
        
        const sortedScores = Object.entries(scores).sort(([,a], [,b]) => b - a);
        
        if (sortedScores.length === 0) {
            adminScoreboard.innerHTML = '<p class="text-gray-500 text-center py-4">Henüz skor yok</p>';
            return;
        }
        
        sortedScores.forEach(([playerName, score], index) => {
            const rank = index + 1;
            const player = currentPlayers.find(p => p.name === playerName);
            const avatarData = getAvatarData(player?.avatar || 1);
            
            let rankClass = '';
            if (isGameOver) {
                if (rank === 1) rankClass = 'border-yellow-500 bg-yellow-500/20';
                else if (rank === 2) rankClass = 'border-gray-400 bg-gray-400/20';
                else if (rank === 3) rankClass = 'border-amber-600 bg-amber-600/20';
            }
            
            const scoreDiv = document.createElement('div');
            scoreDiv.className = `flex items-center justify-between p-3 bg-gray-700 rounded-lg border-2 border-transparent ${rankClass}`;
            
            scoreDiv.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="font-bold text-lg w-8 text-center">${rank}.</span>
                    <div class="avatar small ${avatarData.class}" style="margin-bottom: 0; width: 30px; height: 30px; font-size: 14px;">
                        ${avatarData.emoji}
                    </div>
                    <span class="font-bold">${playerName}</span>
                </div>
                <div class="font-bold text-xl ${isGameOver && rank === 1 ? 'text-yellow-400' : 'text-white'}">
                    ${score}
                </div>
            `;
            
            adminScoreboard.appendChild(scoreDiv);
        });
    }
    
    function showMessage(message, isError = false) {
        // Create a simple toast message
        const toast = document.createElement('div');
        toast.className = `fixed top-4 right-4 z-50 p-4 rounded-lg text-white font-bold transition-opacity duration-300 ${
            isError ? 'bg-red-600' : 'bg-green-600'
        }`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }
    
    function showConfirmDialog(message, onConfirm) {
        confirmMessage.textContent = message;
        pendingConfirmAction = onConfirm;
        confirmModal.classList.remove('hidden');
    }
    
    // Event Listeners
    copyRoomCode.addEventListener('click', () => {
        roomCodeDisplay.select();
        document.execCommand('copy');
        showMessage('Oda kodu kopyalandı!', false);
    });
    
    copyInviteLink.addEventListener('click', () => {
        inviteLink.select();
        document.execCommand('copy');
        showMessage('Davet bağlantısı kopyalandı!', false);
    });
    
    saveSettings.addEventListener('click', () => {
        const scoreGoal = parseInt(adminScoreGoal.value);
        const turnDuration = parseInt(adminTurnDuration.value);
        
        socket.emit('gameSettingsChanged', {
            scoreGoal: scoreGoal,
            turnDuration: turnDuration
        });
        
        showMessage('Ayarlar kaydedildi!', false);
    });
    
    adminStartGame.addEventListener('click', () => {
        if (!adminStartGame.disabled) {
            socket.emit('startDiceRoll');
            showMessage('Oyun başlatılıyor...', false);
        }
    });
    
    adminNewGame.addEventListener('click', () => {
        if (!adminNewGame.disabled) {
            showConfirmDialog('Yeni oyun başlatmak istediğinizden emin misiniz?', () => {
                socket.emit('newGame');
                showMessage('Yeni oyun başlatılıyor...', false);
            });
        }
    });
    
    adminResetScores.addEventListener('click', () => {
        showConfirmDialog('Tüm skorları sıfırlamak istediğinizden emin misiniz? Bu işlem geri alınamaz.', () => {
            socket.emit('resetScores');
            showMessage('Skorlar sıfırlandı!', false);
        });
    });
    
    confirmYes.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        if (pendingConfirmAction) {
            pendingConfirmAction();
            pendingConfirmAction = null;
        }
    });
    
    confirmNo.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        pendingConfirmAction = null;
    });
    
    // Close modal on outside click
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            confirmModal.classList.add('hidden');
            pendingConfirmAction = null;
        }
    });
    
    // Settings change handlers
    adminScoreGoal.addEventListener('change', () => {
        // Auto-save setting (optional)
        // saveSettings.click();
    });
    
    adminTurnDuration.addEventListener('change', () => {
        // Auto-save setting (optional)
        // saveSettings.click();
    });
    
    // Initialize the admin panel
    initializeAdminPanel();
});