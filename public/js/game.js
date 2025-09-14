// Game room functionality
document.addEventListener('DOMContentLoaded', function() {
    const gameContainer = document.getElementById('game-container');
    const userSetupModal = document.getElementById('user-setup-modal');
    const setupUsernameInput = document.getElementById('setupUsernameInput');
    const setupAvatar = document.getElementById('setup-avatar');
    const setupConfirm = document.getElementById('setup-confirm');
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    const avatarModal = document.getElementById('avatar-modal');
    const avatarConfirm = document.getElementById('avatar-confirm');
    const avatarCancel = document.getElementById('avatar-cancel');

    // Game elements
    const roomLinkInput = document.getElementById('roomLinkInput');
    const copyLinkButton = document.getElementById('copyLinkButton');
    const hostOptions = document.getElementById('host-options');
    const scoreGoalSelect = document.getElementById('scoreGoalSelect');
    const turnDurationSelect = document.getElementById('turnDurationSelect');
    const scoreGoalDisplay = document.getElementById('score-goal-display');
    const turnDurationDisplay = document.getElementById('turn-duration-display');
    const startButton = document.getElementById('startButton');
    const resetScoreButton = document.getElementById('resetScoreButton');
    const letterSlotContainer = document.getElementById('letter-slot-container');
    const categorySlotContainer = document.getElementById('category-slot-container');
    const countdownEl = document.getElementById('countdown');
    const statusText = document.getElementById('status-text');
    const wordInputArea = document.getElementById('word-input-area');
    const wordInput = document.getElementById('wordInput');
    const wordForm = document.getElementById('word-form');
    const hostDecisionButtons = document.getElementById('host-decision-buttons');
    const addWordYesButton = document.getElementById('addWordYes');
    const addWordNoButton = document.getElementById('addWordNo');
    const scoreboardDiv = document.getElementById('scoreboard');
    const usedWordsList = document.getElementById('used-words-list');

    let socket = null;
    let currentUser = null;
    let currentRoom = null;
    let myDetails = null;
    let currentHostId = null;
    let currentPlayers = [];
    let gameStarted = false;
    let wordToAddInfo = null;
    let synth = null;
    let recognition = null;

    const alphabet = 'ABCÇDEFHIİJKLMNOÖPRSŞTUÜVYZ'.split('');
    const categories = ['İsim', 'Hayvan', 'Bitki/Meyve/Sebze', 'Ülke/Şehir/İlçe', 'Eşya', 'Meslek'];

    // Initialize audio
    function initializeAudio() {
        if (synth) return;
        if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
            Tone.context.resume();
        }
        if (typeof Tone !== 'undefined') {
            synth = new Tone.Synth().toDestination();
        }
    }

    // Initialize speech recognition
    function initializeSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognition = new SpeechRecognition();
            recognition.lang = 'tr-TR';
            recognition.continuous = false;
            
            recognition.onresult = (event) => {
                const word = event.results[0][0].transcript;
                submitWord(word);
            };
            
            recognition.onerror = (event) => {
                console.error('Ses tanıma hatası:', event.error);
            };
        }
    }

    // Initialize page
    function initializePage() {
        const pathParts = window.location.pathname.split('/');
        const roomId = pathParts[2]; // Should be room code
        
        if (!roomId || pathParts[1] !== 'room') {
            window.location.href = '/';
            return;
        }

        // Check if this is admin view
        const isAdminView = window.location.pathname.includes('/admin');
        window.isAdminView = isAdminView;
        
        if (isAdminView) {
            // For admin view, we need to handle admin access verification
            initializeAdminView(roomId);
        } else {
            // Normal room view
            initializeRoomView(roomId);
        }
    }
    
    function initializeAdminView(roomId) {
        currentUser = gameState.getCurrentUser();
        
        if (!currentUser || !currentUser.username) {
            // Redirect to profile creation for admin access
            window.location.href = `/?redirect=/room/${roomId}/admin`;
            return;
        }
        
        // Connect to room as admin
        socket = io();
        
        // Set up socket listeners for admin mode first
        setupSocketListeners();
        
        gameContainer.classList.remove('hidden');
        
        // Join the room first as a regular player  
        socket.emit('joinRoom', {
            name: currentUser.username,
            roomId: roomId,
            avatar: currentUser.avatar
        });
        
        // Enable admin mode after joining
        enableAdminMode();
        initializeAudio();
        initializeSpeechRecognition();
        
        // Set room link
        const roomLinkInput = document.getElementById('roomLinkInput');
        if (roomLinkInput) {
            roomLinkInput.value = `${window.location.origin}/join?room=${roomId}`;
        }
    }
    
    function initializeRoomView(roomId) {
        currentUser = gameState.getCurrentUser();
        currentRoom = gameState.getCurrentRoom();

        // Check if user needs setup
        if (!currentUser || !currentUser.username || currentUser.username === 'Misafir') {
            showUserSetup();
            return;
        }

        // Check if room data matches current URL
        if (currentRoom && currentRoom.roomId === roomId) {
            // Try to reconnect to existing room
            connectToRoom(roomId);
        } else {
            // New room connection
            connectToRoom(roomId);
        }
    }
    
    function enableAdminMode() {
        // Always show host options in admin mode
        if (hostOptions) {
            hostOptions.classList.remove('hidden');
        }

        // Always show game control buttons
        if (startButton) {
            startButton.classList.remove('hidden');
        }
        if (resetScoreButton) {
            resetScoreButton.classList.remove('hidden');
        }

        // Update title to show admin mode
        document.title = 'YETI Kelime Oyunu - Admin Panel';

        console.log('✅ Admin mode enabled');
    }

    function showUserSetup() {
        userSetupModal.classList.remove('hidden');
        
        if (currentUser) {
            setupUsernameInput.value = currentUser.username || '';
            updateAvatarDisplay('setup-avatar', currentUser.avatar || 1);
            selectedAvatarId = currentUser.avatar || 1;
        } else {
            updateAvatarDisplay('setup-avatar', 1);
            selectedAvatarId = 1;
        }
    }

    function connectToRoom(roomId) {
        userSetupModal.classList.add('hidden');
        gameContainer.classList.remove('hidden');

        // Initialize socket
        socket = gameState.initializeSocket();
        initializeAudio();
        initializeSpeechRecognition();

        // Set room link
        roomLinkInput.value = `${window.location.origin}/join?room=${roomId}`;

        // Attempt to join room
        if (currentRoom && currentRoom.roomId === roomId && currentRoom.playerDetails) {
            // Reconnection attempt
            socket.emit('joinRoom', {
                name: currentUser.username,
                roomId: roomId,
                avatar: currentUser.avatar
            });
        } else {
            // New connection
            socket.emit('joinRoom', {
                name: currentUser.username,
                roomId: roomId,
                avatar: currentUser.avatar
            });
        }

        setupSocketListeners();
    }

    function setupSocketListeners() {
        // Remove all existing listeners to prevent duplicates when setupSocketListeners is called multiple times
        if (socket) {
            socket.removeAllListeners();
        }
        socket.on('joined', ({ playerDetails, roomId }) => {
            myDetails = playerDetails;
            gameState.setCurrentRoom({
                roomId: roomId,
                playerDetails: playerDetails,
                isHost: playerDetails.id === currentHostId
            });

            gameContainer.classList.remove('hidden');
            updateHostControls();
            
            console.log(`✅ Joined room: ${roomId}, Player: ${playerDetails.name}, Admin mode: ${window.isAdminView || false}`);
        });

        socket.on('roomCreated', ({ roomId, playerDetails }) => {
            myDetails = playerDetails;
            currentHostId = playerDetails.id;
            
            gameState.setCurrentRoom({
                roomId: roomId,
                playerDetails: playerDetails,
                isHost: true
            });

            gameContainer.classList.remove('hidden');
            
            console.log(`✅ Room created: ${roomId}, Host: ${playerDetails.name}`);
            
            // Force show host controls for room creator with a slight delay
            setTimeout(() => {
                if (hostOptions) {
                    hostOptions.classList.remove('hidden');
                }
                if (startButton) {
                    startButton.classList.remove('hidden');
                }
                if (resetScoreButton) {
                    resetScoreButton.classList.remove('hidden');
                }
                updateHostControls();
            }, 100);
        });

        socket.on('lobbyUpdate', ({ players, gameHostId, settings, gameInProgress }) => {
            currentHostId = gameHostId;
            currentPlayers = players;
            gameStarted = gameInProgress;
            
            updatePlayerSlots(players);
            updateGameSettings(settings);
            updateHostControls();
            
            statusText.textContent = gameInProgress ? 
                'Oyun devam ediyor...' : 
                `${players.length} / 8 oyuncu bekleniyor...`;
                
            console.log(`Lobby update: ${players.length} players, host: ${gameHostId}, admin mode: ${window.isAdminView || false}`);
        });

        socket.on('scoreUpdate', ({ scores, isGameOver }) => {
            updateScoreboard(scores, isGameOver, currentPlayers);
        });

        socket.on('usedWordsUpdate', ({ usedWords }) => {
            updateUsedWords(usedWords);
        });

        socket.on('diceRolling', ({ finalLetterIndex, finalCategoryIndex }) => {
            handleDiceRolling(finalLetterIndex, finalCategoryIndex);
        });

        socket.on('gameStart', () => {
            statusText.textContent = '';
            document.querySelectorAll('.player-slot-circle').forEach(s => s.classList.remove('eliminated'));
            updateUsedWords([]);
        });

        socket.on('turnUpdate', ({ player, timeLeft, activePlayersCount, letter, category }) => {
            handleTurnUpdate(player, timeLeft, activePlayersCount, letter, category);
        });

        socket.on('countdown', (timeLeft) => {
            countdownEl.textContent = timeLeft >= 0 ? timeLeft : 0;
            if (timeLeft === 0) {
                countdownEl.classList.add('animate-pulse-white-to-red');
            } else {
                countdownEl.classList.remove('animate-pulse-white-to-red');
            }
        });

        socket.on('wordAccepted', ({ playerId }) => {
            if (synth) synth.triggerAttackRelease("C5", "8n");
            const correctSlot = document.querySelector(`#player-slot-${playerId}`);
            if (correctSlot) {
                correctSlot.classList.remove('current-turn');
                correctSlot.classList.add('correct-answer');
                setTimeout(() => {
                    correctSlot.classList.remove('correct-answer');
                }, 1500);
            }
        });

        socket.on('playerEliminated', ({ loserId, loserName, reason, word }) => {
            if (synth) synth.triggerAttackRelease("C3", "8n");
            const playerSlot = document.querySelector(`#player-slot-${loserId}`);
            if (playerSlot) {
                if (reason.includes('Yanlış') || reason.includes('tekrar')) {
                    playerSlot.classList.add('incorrect-answer');
                    setTimeout(() => {
                        playerSlot.classList.remove('incorrect-answer');
                        playerSlot.classList.add('eliminated');
                    }, 500);
                } else {
                    playerSlot.classList.add('eliminated');
                }
            }
            statusText.textContent = `${loserName}, "${reason}" nedeniyle elendi. ${word ? `(Söylenen: "${word}")` : ''}`;
            if (myDetails && myDetails.id === loserId) {
                wordInputArea.classList.add('hidden');
            }
        });

        socket.on('askHostAboutWord', (wordInfo) => {
            wordToAddInfo = wordInfo;
            statusText.textContent = `'${wordInfo.word}' kelimesi DB'ye eklensin mi?`;
            hostDecisionButtons.classList.remove('hidden');
            countdownEl.textContent = '';
        });

        socket.on('hostDecisionTimeout', ({ word }) => {
            statusText.textContent = `'${word}' kelimesi için karar verilmedi - oyun devam ediyor...`;
            hostDecisionButtons.classList.add('hidden');
        });

        socket.on('roundOver', ({ reason, winner }) => {
            handleRoundOver(reason, winner);
        });

        socket.on('roundEnded', () => {
            statusText.textContent = 'Tur bitti. Yeni tur için Başlat butonuna basın.';
            gameStarted = false;
            updateHostControls();
        });

        socket.on('finalWinner', ({ winner, scores }) => {
            handleFinalWinner(winner, scores);
        });

        socket.on('gameError', (message) => {
            if (message.includes('bulunamadı')) {
                window.location.href = '/join?error=room_not_found';
            } else {
                statusText.textContent = message;
            }
        });

        socket.on('gameReconnected', ({ letter, category, usedWords, isSpectator }) => {
            if (isSpectator) {
                statusText.textContent = 'Oyun devam ediyor - bir sonraki tura katılacaksınız.';
                wordInputArea.classList.add('hidden');
            } else {
                updateTaskDisplay(letter, category);
                updateUsedWords(usedWords);
            }
        });

        socket.on('spectatorMode', ({ letter, category, usedWords }) => {
            statusText.textContent = 'Oyun devam ediyor - bir sonraki tura katılacaksınız.';
            updateTaskDisplay(letter, category);
            updateUsedWords(usedWords);
            wordInputArea.classList.add('hidden');
        });
    }

    // Game functions
    function updatePlayerSlots(players = []) {
        const container = document.getElementById('circular-player-container');
        if (!container) return;
        
        container.innerHTML = '';
        const numPlayers = players.length;
        const slotsToRender = numPlayers > 0 ? players : Array(8).fill(null);
        
        slotsToRender.sort((a, b) => {
            if (a && b) return a.playerNumber - b.playerNumber;
            if (a) return -1;
            if (b) return 1;
            return 0;
        });
        
        slotsToRender.forEach((player, index) => {
            const slot = document.createElement('div');
            const floatDelay = `-${(Math.random() * 5).toFixed(2)}s`;

            if (player) {
                slot.className = 'player-slot-circle';
                slot.id = `player-slot-${player.id || `disconnected-${player.name}`}`;
                slot.setAttribute('data-avatar', player.avatar || 1);
                const avatarData = getAvatarData(player.avatar || 1);
                
                if (player.disconnected) {
                    slot.classList.add('disconnected');
                }
                
                slot.innerHTML = `
                   <div class="bubble-content animate-float" style="animation-delay: ${floatDelay};">
                        <div class="avatar small ${avatarData.class}">
                            ${avatarData.emoji}
                        </div>
                        <div class="font-bold text-sm text-center break-all">${player.name}${player.disconnected ? ' (Bağlantı kesildi)' : ''}</div>
                   </div>
                `;
                
                // Mouse interaction
                slot.addEventListener('mouseenter', () => {
                    slot.classList.add('is-hovering');
                    const bubbleContent = slot.querySelector('.bubble-content');
                    if (bubbleContent) bubbleContent.classList.remove('animate-float');
                });
                
                slot.addEventListener('mouseleave', () => {
                   slot.classList.remove('is-hovering');
                   slot.style.setProperty('--push-x', '0px');
                   slot.style.setProperty('--push-y', '0px');
                   const bubbleContent = slot.querySelector('.bubble-content');
                   if (bubbleContent) {
                       setTimeout(() => bubbleContent.classList.add('animate-float'), 100);
                   }
                });
                
                slot.addEventListener('mousemove', (e) => {
                    const rect = slot.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    const deltaX = e.clientX - centerX;
                    const deltaY = e.clientY - centerY;
                    const distance = Math.sqrt(deltaX*deltaX + deltaY*deltaY);
                    if (distance === 0) return;
                    const maxPush = 12;
                    const pushX = (-deltaX / distance) * maxPush;
                    const pushY = (-deltaY / distance) * maxPush;
                    slot.style.setProperty('--push-x', `${pushX}px`);
                    slot.style.setProperty('--push-y', `${pushY}px`);
                });
            } else {
                slot.className = 'player-slot-circle';
                slot.setAttribute('data-avatar', '0');
                slot.innerHTML = `<div class="bubble-content"><div class="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center mb-1 opacity-50"><span class="text-gray-400">?</span></div><div class="text-gray-500 text-sm">Boş</div></div>`;
                slot.style.zIndex = -1;
            }
            
            positionElement(slot, index, numPlayers > 0 ? numPlayers : 8, 42, !!player);
            container.appendChild(slot);
        });
    }

    function positionElement(element, index, total, radiusPercent, isPlayer) {
        let angle;
        if (!isPlayer && total > 0) {
             angle = -90 + (index * (360 / total));
        } else {
            if (total === 1) { angle = -90; } 
            else if (total === 2) { angle = (index === 0) ? 180 : 0; }
            else if (total === 3) { angle = -90 + (index * 120); }
            else { angle = -90 + (index * (360 / total)); }
        }
        const angleRad = angle * (Math.PI / 180);
        const x = 50 + (radiusPercent * 0.8) * Math.cos(angleRad);
        const y = 50 + (radiusPercent * 0.8) * Math.sin(angleRad);
        element.style.left = `${x}%`;
        element.style.top = `${y}%`;
    }

    function updateGameSettings(settings) {
        scoreGoalDisplay.textContent = settings.scoreGoal;
        scoreGoalSelect.value = settings.scoreGoal;
        turnDurationDisplay.textContent = settings.turnDuration;
        turnDurationSelect.value = settings.turnDuration;
    }

    function updateHostControls() {
        const isHost = myDetails && myDetails.id === currentHostId;
        const isAdminMode = window.isAdminView || false;

        // In admin mode, always show controls; otherwise only for host
        const showControls = isAdminMode || isHost;

        if (hostOptions) {
            hostOptions.classList.toggle('hidden', !showControls);
        }

        // Start button should always be visible for admins/hosts (not hidden during games)
        if (startButton) {
            startButton.classList.toggle('hidden', !showControls);
        }

        if (resetScoreButton) {
            resetScoreButton.classList.toggle('hidden', !showControls);
        }

        console.log(`updateHostControls: isHost=${isHost}, isAdminMode=${isAdminMode}, showControls=${showControls}`);
    }

    function updateScoreboard(scores = {}, isGameOver = false, players = []) {
        if (!scoreboardDiv) return;
        scoreboardDiv.innerHTML = '';
        const sortedScores = Object.entries(scores).sort(([,a],[,b]) => b-a);
        
        if (sortedScores.length === 0) {
            scoreboardDiv.innerHTML = '<p class="themed-text-muted text-center">Henüz puan yok.</p>';
        } else {
            sortedScores.forEach(([name, score], index) => {
                const rank = index + 1;
                let rankClass = '';
                if (isGameOver) {
                    if (rank === 1) rankClass = 'gold';
                    else if (rank === 2) rankClass = 'silver';
                }
                const player = players.find(p => p && p.name === name);
                const avatarId = player?.avatar || 1;
                const avatarData = getAvatarData(avatarId);
                const scoreEntry = document.createElement('div');
                scoreEntry.className = `flex justify-between items-center p-2 rounded-md border-2 border-transparent themed-bg-secondary ${rankClass}`;
                scoreEntry.innerHTML = `<div class="flex items-center gap-2"><span class="font-bold text-lg w-6 text-center score-rank">${rank}.</span><div class="avatar small ${avatarData.class}" style="margin-bottom: 0; width: 30px; height: 30px; font-size: 14px;">${avatarData.emoji}</div><span class="font-semibold score-name">${name || 'Bilinmeyen'}</span></div><span class="font-bold text-xl score-value">${score}</span>`;
                scoreboardDiv.appendChild(scoreEntry);
            });
        }
    }

    function updateUsedWords(usedWords = []) {
        if (!usedWordsList) return;
        if (usedWords.length === 0) {
            usedWordsList.innerHTML = `<p class="themed-text-muted text-sm text-center">Henüz kelime girilmedi</p>`;
        } else {
            usedWordsList.innerHTML = '';
            usedWords.forEach((word, index) => {
                const wordElement = document.createElement('div');
                wordElement.className = 'flex justify-between items-center py-1 px-2 mb-1 themed-bg-secondary rounded text-sm';
                wordElement.innerHTML = `<span class="themed-text font-medium">${word}</span><span class="text-green-400 text-xs">#${index + 1}</span>`;
                usedWordsList.appendChild(wordElement);
            });
            usedWordsList.scrollTop = usedWordsList.scrollHeight;
        }
    }

    function getSlotItemHeight() {
        const el = document.querySelector('.slot-item');
        if (!el) return 38;
        const h = parseFloat(getComputedStyle(el).height);
        return isNaN(h) ? 38 : Math.round(h);
    }

    function populateReel(reelContainer, items, itemHeight) {
        const reel = reelContainer.querySelector('.slot-reel');
        reel.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = `slot-item`;
                div.style.height = `${itemHeight}px`;
                div.textContent = item;
                reel.appendChild(div);
            });
        }
    }

    function spinReel(reelContainer, items, finalIndex, itemHeight) {
        const reel = reelContainer.querySelector('.slot-reel');
        const singleSetHeight = items.length * itemHeight;
        reel.style.transition = 'none';
        reel.style.top = `0px`;
        void reel.offsetHeight;
        const finalPosition = (4 * singleSetHeight) + (finalIndex * itemHeight);
        reel.style.transition = 'top 2.5s cubic-bezier(0.25, 1, 0.5, 1)';
        reel.style.top = `-${finalPosition}px`;
    }

    function updateTaskDisplay(letter, category) {
        const letterReel = letterSlotContainer.querySelector('.slot-reel');
        const categoryReel = categorySlotContainer.querySelector('.slot-reel');
        letterReel.style.transition = 'none';
        categoryReel.style.transition = 'none';

        const itemHeight = getSlotItemHeight();

        const letterIndex = alphabet.indexOf(letter);
        if (letterIndex > -1) letterReel.style.top = `-${letterIndex * itemHeight}px`;
        const categoryIndex = categories.indexOf(category);
        if (categoryIndex > -1) categoryReel.style.top = `-${categoryIndex * itemHeight}px`;
    }

    function handleDiceRolling(finalLetterIndex, finalCategoryIndex) {
        startButton.classList.add('hidden');
        statusText.textContent = 'Zar atılıyor...';
        const itemHeight = getSlotItemHeight();
        populateReel(letterSlotContainer, alphabet, itemHeight);
        populateReel(categorySlotContainer, categories, itemHeight);
        spinReel(letterSlotContainer, alphabet, finalLetterIndex, itemHeight);
        spinReel(categorySlotContainer, categories, finalCategoryIndex, itemHeight);
    }

    function handleTurnUpdate(player, timeLeft, activePlayersCount, letter, category) {
        updateTaskDisplay(letter, category);
        hostDecisionButtons.classList.add('hidden');
        
        if (activePlayersCount >= 3 && synth) {
            synth.triggerAttackRelease("G4", "16n");
        }
        
        statusText.textContent = '';
        countdownEl.textContent = timeLeft;
        countdownEl.classList.remove('animate-pulse-white-to-red');
        
        document.querySelectorAll('.player-slot-circle').forEach(s => {
            s.classList.remove('active', 'current-turn', 'correct-answer', 'incorrect-answer');
        });
        
        const activeSlot = document.querySelector(`#player-slot-${player.id}`);
        if (activeSlot) {
            activeSlot.classList.add('active', 'current-turn');
        }

        const isMyTurn = myDetails && myDetails.id === player.id;
        wordInputArea.classList.toggle('hidden', !isMyTurn);
        
        if (isMyTurn) {
            wordInput.focus();
            if (recognition) {
                try { 
                    recognition.start(); 
                } catch(e) { 
                    console.error("Ses tanıma başlatılamadı!", e); 
                }
            }
        } else {
            if (recognition) recognition.stop();
        }
    }

    function handleRoundOver(reason, winner) {
        wordInputArea.classList.add('hidden');
        hostDecisionButtons.classList.add('hidden');
        
        document.querySelectorAll('.player-slot-circle').forEach(s => {
            s.classList.remove('current-turn', 'correct-answer', 'incorrect-answer');
        });
        
        if (winner) {
            const winnerPlayer = currentPlayers.find(p => p.name === winner);
            if (winnerPlayer) {
                const winnerSlot = document.querySelector(`#player-slot-${winnerPlayer.id}`);
                if (winnerSlot) {
                    winnerSlot.classList.add('round-winner');
                    setTimeout(() => {
                        winnerSlot.classList.remove('round-winner');
                    }, 3000);
                }
            }
        }
        
        if (winner && synth) {
            const now = Tone.now();
            synth.triggerAttackRelease("C5", "16n", now);
            synth.triggerAttackRelease("E5", "16n", now + 0.1);
            synth.triggerAttackRelease("G5", "8n", now + 0.2);
        } else if (synth) {
            synth.triggerAttackRelease("E3", "8n");
        }
        
        if (recognition) recognition.stop();
        statusText.textContent = winner ? `${reason} | Turun galibi: ${winner}` : reason;
        countdownEl.textContent = '';
        document.querySelectorAll('.player-slot-circle').forEach(s => s.classList.remove('active', 'eliminated'));
        
        gameStarted = false;
        updateHostControls();
    }

    function handleFinalWinner(winner, scores) {
        wordInputArea.classList.add('hidden');
        if (recognition) recognition.stop();
        updateScoreboard(scores, true, currentPlayers);
        countdownEl.textContent = '';
        statusText.innerHTML = `<div class="text-3xl">🏆 Oyun Bitti! Kazanan: <span class="gold font-black p-2 rounded-md">${winner}</span> 🏆</div>`;
        
        gameStarted = false;
        updateHostControls();
        hostDecisionButtons.classList.add('hidden');
    }

    function submitWord(word) {
        if (word && word.trim()) {
            socket.emit('submitWord', word.trim());
            wordInput.value = '';
            wordInputArea.classList.add('hidden');
            if (recognition) recognition.stop();
        }
    }

    // Event listeners
    setupAvatar.addEventListener('click', () => {
        userSetupModal.classList.add('hidden');
        avatarModal.classList.remove('hidden');
        populateAvatarGrid();
        selectedAvatarId = currentUser?.avatar || 1;
    });

    avatarConfirm.addEventListener('click', () => {
        updateAvatarDisplay('setup-avatar', selectedAvatarId);
        avatarModal.classList.add('hidden');
        userSetupModal.classList.remove('hidden');
    });

    avatarCancel.addEventListener('click', () => {
        avatarModal.classList.add('hidden');
        userSetupModal.classList.remove('hidden');
    });

    setupConfirm.addEventListener('click', () => {
        const username = setupUsernameInput.value.trim();
        const validation = validateUsername(username);
        
        if (!validation.valid) {
            alert(validation.message);
            return;
        }

        currentUser = {
            username: username,
            avatar: selectedAvatarId || 1
        };
        
        gameState.setCurrentUser(currentUser);
        
        const roomId = window.location.pathname.split('/room/')[1];
        connectToRoom(roomId);
    });

    leaveRoomBtn.addEventListener('click', () => {
        // Show confirmation dialog before leaving
        const confirmLeave = confirm('Oyun lobisinden çıkmak istediğinizden emin misiniz? Lobiden tamamen çıkarılacaksınız.');
        
        if (confirmLeave) {
            if (socket) {
                socket.emit('leaveRoom');
            }
            gameState.clearCurrentRoom();
            window.location.href = '/';
        }
    });

    copyLinkButton.addEventListener('click', () => {
        roomLinkInput.select();
        document.execCommand('copy');
        copyLinkButton.textContent = 'Kopyalandı!';
        setTimeout(() => {
            copyLinkButton.textContent = 'Kopyala';
        }, 1500);
    });

    startButton.addEventListener('click', () => {
        gameStarted = true;
        socket.emit('startDiceRoll');
    });

    resetScoreButton.addEventListener('click', () => {
        if (confirm('Tüm skorları sıfırlamak istediğinizden emin misiniz?')) {
            socket.emit('resetScores');
        }
    });

    scoreGoalSelect.addEventListener('change', () => {
        const isHost = myDetails && myDetails.id === currentHostId;
        const isAdminMode = window.isAdminView || false;
        
        if (isHost || isAdminMode) {
            const scoreGoal = parseInt(scoreGoalSelect.value, 10);
            const turnDuration = parseInt(turnDurationSelect.value, 10);
            scoreGoalDisplay.textContent = scoreGoal;
            socket.emit('gameSettingsChanged', { scoreGoal, turnDuration });
        }
    });

    turnDurationSelect.addEventListener('change', () => {
        const isHost = myDetails && myDetails.id === currentHostId;
        const isAdminMode = window.isAdminView || false;
        
        if (isHost || isAdminMode) {
            const scoreGoal = parseInt(scoreGoalSelect.value, 10);
            const turnDuration = parseInt(turnDurationSelect.value, 10);
            turnDurationDisplay.textContent = turnDuration;
            socket.emit('gameSettingsChanged', { scoreGoal, turnDuration });
        }
    });

    addWordYesButton.addEventListener('click', () => {
        if (wordToAddInfo) {
            socket.emit('hostDecisionOnWord', { add: true, wordInfo: wordToAddInfo });
            hostDecisionButtons.classList.add('hidden');
        }
    });

    addWordNoButton.addEventListener('click', () => {
        if (wordToAddInfo) {
            socket.emit('hostDecisionOnWord', { add: false, wordInfo: wordToAddInfo });
            hostDecisionButtons.classList.add('hidden');
        }
    });

    wordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        submitWord(wordInput.value);
    });

    setupUsernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            setupConfirm.click();
        }
    });

    // Handle browser/tab close with confirmation
    window.addEventListener('beforeunload', (e) => {
        if (socket && socket.connected && myDetails) {
            // Show confirmation dialog to prevent accidental closing
            e.preventDefault();
            e.returnValue = 'Oyun lobisinden çıkmak istediğinizden emin misiniz? Oyundan çıkarsanız lobiden tamamen çıkarılacaksınız.';
            return e.returnValue;
        }
    });

    // Handle actual page unload (when user confirms they want to leave)
    window.addEventListener('unload', () => {
        if (socket && socket.connected && myDetails) {
            // Send leave room signal when page is actually unloading
            socket.emit('leaveRoom');
            gameState.clearCurrentRoom();
        }
    });

    // Initialize page
    initializePage();
});