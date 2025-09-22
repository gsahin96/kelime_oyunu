document.addEventListener('DOMContentLoaded', () => {
    const playerSetupScreen = document.getElementById('player-setup-screen');
    const gameScreen = document.getElementById('game-screen');
    const addPlayerBtn = document.getElementById('add-player-btn');
    const startGameBtn = document.getElementById('start-game-btn');
    const playersList = document.getElementById('players-list');

    const letterSlot = document.querySelector('#letter-slot-container .slot-reel');
    const categorySlot = document.querySelector('#category-slot-container .slot-reel');
    const countdownElement = document.getElementById('countdown');
    const wordInput = document.getElementById('wordInput');
    const wordForm = document.getElementById('word-form');
    const statusText = document.getElementById('status-text');
    const scoreboard = document.getElementById('scoreboard');
    const usedWordsList = document.getElementById('used-words-list');
    const startButton = document.getElementById('startButton');
    const wordInputArea = document.getElementById('word-input-area');

    const defaultLetterText = letterSlot ? letterSlot.textContent : '';
    const defaultCategoryText = categorySlot ? categorySlot.textContent : '';
    const defaultCountdownText = countdownElement ? countdownElement.textContent : '';

    const avatarThemes = [
        'player-theme-1',
        'player-theme-2',
        'player-theme-3',
        'player-theme-4',
        'player-theme-5',
        'player-theme-6',
        'player-theme-7',
        'player-theme-8'
    ];

    let players = ['Oyuncu 1'];
    let scores = {};
    let activePlayers = [];
    let currentPlayerIndex = 0;
    let currentLetterDisplay = '';
    let currentLetterKey = '';
    let currentCategory = '';
    let usedWords = [];
    let gameInProgress = false;
    let turnInProgress = false;
    let countdownInterval;
    let database = window.KELIME_DB || null;
    let categoryKeys = database ? Object.keys(database) : [];
    let eliminatedPlayers = [];
    let lastRoundWinner = null;
    let playerProfiles = [];

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    let audioContext = null;

    const ensureAudioContext = () => {
        if (!AudioContextClass) {
            return null;
        }
        if (!audioContext) {
            audioContext = new AudioContextClass();
        }
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().catch(() => {});
        }
        return audioContext;
    };

    const registerAudioUnlock = () => {
        const unlockHandler = () => {
            ensureAudioContext();
        };
        document.addEventListener('pointerdown', unlockHandler, { once: true });
        document.addEventListener('keydown', unlockHandler, { once: true });
    };

    if (AudioContextClass) {
        registerAudioUnlock();
    }

    const playTone = (frequency, duration, options = {}) => {
        const context = ensureAudioContext();
        if (!context) {
            return;
        }

        const {
            type = 'sine',
            volume = 0.25,
            attack = 0.02
        } = options;

        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        const safeDuration = Math.max(duration, 0.05);

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + attack);
        gain.gain.linearRampToValueAtTime(0.0001, now + safeDuration);

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start(now);
        oscillator.stop(now + safeDuration + 0.02);
    };

    const playSweep = (startFrequency, endFrequency, duration, options = {}) => {
        const context = ensureAudioContext();
        if (!context) {
            return;
        }

        const {
            type = 'sine',
            volume = 0.25,
            attack = 0.02
        } = options;

        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        const safeDuration = Math.max(duration, 0.05);

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(startFrequency, now);
        oscillator.frequency.linearRampToValueAtTime(endFrequency, now + safeDuration);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + attack);
        gain.gain.linearRampToValueAtTime(0.0001, now + safeDuration);

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start(now);
        oscillator.stop(now + safeDuration + 0.02);
    };

    const soundEngine = {
        playRoundStart: () => {
            playSweep(330, 560, 0.35, { type: 'triangle', volume: 0.28 });
        },
        playTurnStart: () => {
            playTone(660, 0.18, { type: 'sine', volume: 0.22 });
        },
        playSuccess: () => {
            playSweep(620, 920, 0.28, { type: 'sine', volume: 0.3 });
        },
        playElimination: () => {
            playSweep(420, 180, 0.4, { type: 'sawtooth', volume: 0.22 });
        },
        playRoundWin: () => {
            playTone(660, 0.18, { type: 'triangle', volume: 0.26 });
            setTimeout(() => {
                playTone(880, 0.2, { type: 'triangle', volume: 0.24 });
            }, 130);
        },
        playVictory: () => {
            playSweep(440, 880, 0.35, { type: 'triangle', volume: 0.3 });
            setTimeout(() => {
                playTone(1047, 0.28, { type: 'sine', volume: 0.26 });
            }, 220);
        },
        playCountdownTick: (timeLeft) => {
            const frequency = timeLeft === 1 ? 900 : 720;
            playTone(frequency, 0.12, { type: 'square', volume: 0.18 });
        }
    };

    const isFileProtocol = window.location.protocol === 'file:';

    const ensureDatabaseLoaded = () => {
        if (!database && window.KELIME_DB) {
            database = window.KELIME_DB;
        }
        if (database && !categoryKeys.length) {
            categoryKeys = Object.keys(database || {});
        }
        return !!database && categoryKeys.length > 0;
    };

    if (!database && !isFileProtocol) {
        fetch('./database.json')
            .then((response) => response.json())
            .then((data) => {
                if (!database) {
                    database = data;
                }
                categoryKeys = Object.keys(database || {});
            })
            .catch((error) => {
                console.error('Database load failed', error);
                if (!ensureDatabaseLoaded()) {
                    statusText.textContent = 'Veri yuklenemedi.';
                }
            });
    }

    const sanitizeName = (name, index) => {
        const trimmed = (name || '').trim();
        return trimmed.length ? trimmed : `Oyuncu ${index + 1}`;
    };

    const rebuildPlayerProfiles = (names) => {
        playerProfiles = names.map((name, index) => ({
            name,
            initial: name.charAt(0).toUpperCase(),
            themeClass: avatarThemes[index % avatarThemes.length]
        }));
    };

    const hashString = (value) => {
        let hash = 0;
        for (let i = 0; i < value.length; i += 1) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    };

    const getProfile = (name) => {
        const profile = playerProfiles.find((p) => p.name === name);
        if (profile) {
            return profile;
        }
        const index = Math.abs(hashString(name)) % avatarThemes.length;
        return {
            name,
            initial: name.charAt(0).toUpperCase(),
            themeClass: avatarThemes[index]
        };
    };

    const renderTurnRow = (options = {}) => {
        const container = document.getElementById('player-turn-row');
        if (!container) {
            return;
        }

        const list = options.players || (gameInProgress ? activePlayers : players);
        const highlightName = Object.prototype.hasOwnProperty.call(options, 'highlightName')
            ? options.highlightName
            : (gameInProgress && activePlayers.length ? activePlayers[currentPlayerIndex] : null);
        const state = options.state || (gameInProgress ? 'game' : (lastRoundWinner ? 'postround' : 'pregame'));

        container.innerHTML = '';

        if (!list.length) {
            container.innerHTML = '<p class="turn-placeholder">Oyuncu ekleyin</p>';
            return;
        }

        list.forEach((player, index) => {
            const name = sanitizeName(player, index);
            const profile = getProfile(name);
            const isActive = highlightName === name;
            const isEliminated = eliminatedPlayers.includes(name);
            const isWinner = !gameInProgress && lastRoundWinner === name;

            let statusLabel;
            if (state === 'pregame') {
                statusLabel = 'Haz?r';
            } else if (isWinner) {
                statusLabel = 'Tur ?ampiyonu';
            } else if (isEliminated) {
                statusLabel = 'Elendi';
            } else if (isActive) {
                statusLabel = 'S?rada';
            } else {
                statusLabel = 'Beklemede';
            }

            let classes = `turn-chip ${profile.themeClass}`;
            if (isActive && !isEliminated && !isWinner) {
                classes += ' active';
            }
            if (isEliminated && !isWinner) {
                classes += ' eliminated';
            }

            const chip = document.createElement('div');
            chip.className = classes;
            chip.innerHTML = `
                <div class="turn-avatar">${profile.initial}</div>
                <div class="turn-meta">
                    <span class="turn-name">${name}</span>
                    <span class="turn-status">${statusLabel}</span>
                </div>
            `;
            container.appendChild(chip);
        });
    };

    const updateScoreboard = () => {
        if (!scoreboard) {
            return;
        }
        scoreboard.innerHTML = '';

        players.forEach((player, index) => {
            const name = sanitizeName(player, index);
            const profile = getProfile(name);
            const isActive = gameInProgress && activePlayers[currentPlayerIndex] === name;
            const isEliminated = eliminatedPlayers.includes(name);
            const isWinner = !gameInProgress && lastRoundWinner === name;

            let statusLabel;
            if (isWinner) {
                statusLabel = 'Tur ?ampiyonu';
            } else if (isEliminated && gameInProgress) {
                statusLabel = 'Elendi';
            } else if (gameInProgress) {
                statusLabel = isActive ? 'S?rada' : 'Beklemede';
            } else if (isEliminated) {
                statusLabel = 'Elendi';
            } else {
                statusLabel = 'Haz?r';
            }

            let classes = `score-row ${profile.themeClass}`;
            if (isActive && !isEliminated) {
                classes += ' active';
            }
            if (isEliminated && !isWinner) {
                classes += ' eliminated';
            }

            const row = document.createElement('div');
            row.className = classes;
            row.innerHTML = `
                <div class="score-player">
                    <div class="score-avatar">${profile.initial}</div>
                    <div class="score-text">
                        <span class="score-name">${name}</span>
                        <span class="score-status">${statusLabel}</span>
                    </div>
                </div>
                <div class="score-value">${scores[name] || 0}</div>
            `;
            scoreboard.appendChild(row);
        });
    };

    const updateUsedWords = () => {
        usedWordsList.innerHTML = '';
        usedWords.forEach((word) => {
            const item = document.createElement('div');
            item.textContent = word;
            usedWordsList.appendChild(item);
        });
    };

    const attachStartHandler = (label = 'Turu Baslat') => {
        if (!startButton) {
            return;
        }
        startButton.removeEventListener('click', startGame);
        startButton.removeEventListener('click', handleRestartClick);
        startButton.textContent = label;
        startButton.disabled = false;
        startButton.addEventListener('click', startGame);
    };

    const renderPlayers = () => {
        players = players.map((name, index) => sanitizeName(name, index));
        playersList.innerHTML = '';

        players.forEach((player, index) => {
            const row = document.createElement('div');
            row.className = `player-setup-row ${avatarThemes[index % avatarThemes.length]}`;
            row.innerHTML = `
                <div class="setup-avatar">${player.charAt(0).toUpperCase()}</div>
                <input type="text" value="${player}" class="w-full p-2 rounded-lg themed-input" data-index="${index}">
                <button class="text-red-500 remove-player-btn" data-index="${index}">X</button>
            `;
            playersList.appendChild(row);
        });

        rebuildPlayerProfiles(players);
        updateScoreboard();
        renderTurnRow({ players, state: 'pregame', highlightName: null });
    };

    addPlayerBtn.addEventListener('click', () => {
        if (players.length >= 8) {
            return;
        }
        players.push(`Oyuncu ${players.length + 1}`);
        renderPlayers();
    });

    playersList.addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-player-btn')) {
            const index = parseInt(event.target.dataset.index, 10);
            players.splice(index, 1);
            if (!players.length) {
                players.push('Oyuncu 1');
            }
            renderPlayers();
        }
    });

    playersList.addEventListener('change', (event) => {
        if (event.target.tagName === 'INPUT') {
            const index = parseInt(event.target.dataset.index, 10);
            players[index] = sanitizeName(event.target.value, index);
            renderPlayers();
        }
    });

    const initializeGame = (playerNames) => {
        players = playerNames.map((name, index) => sanitizeName(name, index));
        scores = {};
        players.forEach((player) => {
            scores[player] = 0;
        });
        usedWords = [];
        eliminatedPlayers = [];
        lastRoundWinner = null;
        currentPlayerIndex = 0;
        rebuildPlayerProfiles(players);
        updateScoreboard();
        updateUsedWords();
        renderTurnRow({ players, state: 'pregame', highlightName: null });
        if (wordInputArea) {
            wordInputArea.classList.add('hidden');
        }
        statusText.classList.remove('status-active');
        statusText.textContent = 'Hazir oldugunuzda "Turu Baslat" butonuna basin.';
        attachStartHandler();
    };

    const startGame = () => {
        if (gameInProgress) {
            return;
        }
        ensureAudioContext();
        if (!ensureDatabaseLoaded()) {
            statusText.textContent = 'Veri yukleniyor. Lutfen tekrar deneyin.';
            return;
        }
        if (startButton) {
            startButton.disabled = true;
        }

        gameInProgress = true;
        turnInProgress = false;
        eliminatedPlayers = [];
        lastRoundWinner = null;
        activePlayers = players.filter((name) => name.trim().length > 0);

        if (!activePlayers.length) {
            statusText.textContent = 'En az bir oyuncu adi gerekir.';
            gameInProgress = false;
            attachStartHandler();
            return;
        }

        usedWords = [];
        updateUsedWords();
        updateScoreboard();
        renderTurnRow({ players: activePlayers, state: 'game', highlightName: null });

        currentCategory = '';
        currentLetterKey = '';
        currentLetterDisplay = '';

        let attempts = 0;
        const maxAttempts = 200;
        while (attempts < maxAttempts && !currentCategory) {
            attempts += 1;
            const categoryCandidate = categoryKeys[Math.floor(Math.random() * categoryKeys.length)];
            const letterKeys = Object.keys(database[categoryCandidate] || {});
            if (!letterKeys.length) {
                continue;
            }
            const letterCandidate = letterKeys[Math.floor(Math.random() * letterKeys.length)];
            const words = database[categoryCandidate]?.[letterCandidate];
            if (!words || !words.length) {
                continue;
            }
            currentCategory = categoryCandidate;
            currentLetterKey = letterCandidate.toLocaleLowerCase('tr-TR');
            currentLetterDisplay = letterCandidate.toLocaleUpperCase('tr-TR');
        }

        if (!currentCategory || !currentLetterKey) {
            statusText.textContent = 'Gecerli kategori ya da harf bulunamadi.';
            gameInProgress = false;
            attachStartHandler();
            return;
        }

        if (letterSlot) {
            letterSlot.textContent = currentLetterDisplay;
        }
        if (categorySlot) {
            categorySlot.textContent = currentCategory;
        }

        setTimeout(() => {
            currentPlayerIndex = Math.floor(Math.random() * activePlayers.length);
            soundEngine.playRoundStart();
            startTurn();
        }, 800);
    };

    const startTurn = () => {
        turnInProgress = true;
        const currentPlayer = activePlayers[currentPlayerIndex];
        statusText.classList.add('status-active');
        statusText.textContent = `${currentPlayer} sirada.`;
        wordInput.value = '';
        if (wordInputArea) {
            wordInputArea.classList.remove('hidden');
        }
        wordInput.focus();
        soundEngine.playTurnStart();

        let timeLeft = parseInt(document.getElementById('turnDurationSelect').value, 10);
        if (Number.isNaN(timeLeft) || timeLeft <= 0) {
            timeLeft = 5;
        }
        countdownElement.textContent = timeLeft;

        clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
            timeLeft -= 1;
            countdownElement.textContent = timeLeft;
            if (timeLeft > 0 && timeLeft <= 3) {
                soundEngine.playCountdownTick(timeLeft);
            }
            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                handlePlayerElimination(currentPlayer, 'Sure doldu');
            }
        }, 1000);

        renderTurnRow();
        updateScoreboard();
    };

    if (wordForm) {
        wordForm.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!turnInProgress) {
                return;
            }

            clearInterval(countdownInterval);
            const submittedWord = wordInput.value.trim();
            const currentPlayer = activePlayers[currentPlayerIndex];

            const normalizedSubmittedWord = submittedWord.toLocaleLowerCase('tr-TR');
            const dbWords = database[currentCategory]?.[currentLetterKey] || [];
            const normalizedDbWords = dbWords.map((word) => word.toLocaleLowerCase('tr-TR'));
            const normalizedUsedWords = usedWords.map((word) => word.toLocaleLowerCase('tr-TR'));

            if (
                normalizedSubmittedWord.startsWith(currentLetterKey) &&
                normalizedDbWords.includes(normalizedSubmittedWord) &&
                !normalizedUsedWords.includes(normalizedSubmittedWord)
            ) {
                usedWords.push(submittedWord);
                updateUsedWords();
                soundEngine.playSuccess();
                nextTurn();
            } else {
                handlePlayerElimination(currentPlayer, 'Yanlis veya tekrar eden kelime');
            }
        });
    }

    const nextTurn = () => {
        if (activePlayers.length <= 1) {
            handleRoundOver();
            return;
        }
        currentPlayerIndex = (currentPlayerIndex + 1) % activePlayers.length;
        startTurn();
    };

    const handlePlayerElimination = (player, reason) => {
        const playerIndex = activePlayers.indexOf(player);
        if (playerIndex > -1) {
            activePlayers.splice(playerIndex, 1);
        }
        if (!eliminatedPlayers.includes(player)) {
            eliminatedPlayers.push(player);
        }
        statusText.classList.remove('status-active');
        statusText.textContent = `${player} elendi. Sebep: ${reason}.`;
        turnInProgress = false;

        soundEngine.playElimination();

        updateScoreboard();
        renderTurnRow();

        if (activePlayers.length <= 1) {
            handleRoundOver();
        } else {
            if (currentPlayerIndex >= activePlayers.length) {
                currentPlayerIndex = 0;
            }
            setTimeout(startTurn, 1500);
        }
    };

    const handleRoundOver = () => {
        gameInProgress = false;
        turnInProgress = false;
        clearInterval(countdownInterval);
        if (wordInputArea) {
            wordInputArea.classList.add('hidden');
        }
        statusText.classList.remove('status-active');

        const promptNextRound = (message) => {
            statusText.textContent = message;
            attachStartHandler('Turu Baslat');
        };

        if (activePlayers.length === 1) {
            const winner = activePlayers[0];
            scores[winner] = (scores[winner] || 0) + 1;
            lastRoundWinner = winner;
            updateScoreboard();

            const scoreGoal = parseInt(document.getElementById('scoreGoalSelect').value, 10);
            if (scores[winner] >= scoreGoal) {
                statusText.textContent = `${winner} oyunu kazandi!`;
                soundEngine.playVictory();
                prepareForRestart();
            } else {
                promptNextRound(`Turu ${winner} kazandi. Yeni tur icin "Turu Baslat" butonuna basin.`);
                soundEngine.playRoundWin();
            }
        } else {
            lastRoundWinner = null;
            promptNextRound('Tur bitti, kazanan yok. Yeni tur icin "Turu Baslat" butonuna basin.');
        }

        renderTurnRow({ players, highlightName: lastRoundWinner, state: 'postround' });
    };

    const prepareForRestart = () => {
        if (!startButton) {
            return;
        }
        startButton.removeEventListener('click', startGame);
        startButton.removeEventListener('click', handleRestartClick);
        startButton.textContent = 'Yeniden Baslat';
        startButton.disabled = false;
        startButton.addEventListener('click', handleRestartClick);
    };

    function handleRestartClick() {
        resetMatchState();
    }

    const resetMatchState = () => {
        gameInProgress = false;
        turnInProgress = false;
        clearInterval(countdownInterval);
        activePlayers = [];
        currentPlayerIndex = 0;
        currentCategory = '';
        currentLetterKey = '';
        currentLetterDisplay = '';
        eliminatedPlayers = [];
        lastRoundWinner = null;
        usedWords = [];
        updateUsedWords();

        Object.keys(scores).forEach((player) => {
            scores[player] = 0;
        });
        updateScoreboard();

        if (letterSlot) {
            letterSlot.textContent = defaultLetterText;
        }
        if (categorySlot) {
            categorySlot.textContent = defaultCategoryText;
        }
        if (countdownElement) {
            countdownElement.textContent = defaultCountdownText;
        }

        wordInput.value = '';
        if (wordInputArea) {
            wordInputArea.classList.add('hidden');
        }
        statusText.classList.remove('status-active');
        statusText.textContent = 'Yeni bir mac icin "Turu Baslat" butonuna basin.';
        renderTurnRow({ players, state: 'pregame', highlightName: null });
        attachStartHandler();
    };

    startGameBtn.addEventListener('click', () => {
        playerSetupScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        initializeGame([...players]);
    });

    renderPlayers();
    updateUsedWords();
    updateScoreboard();
    renderTurnRow({ players, state: 'pregame', highlightName: null });
});




