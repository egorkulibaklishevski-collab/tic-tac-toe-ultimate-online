
"use strict";

// ==========================================
// SUPABASE
// ==========================================

const SUPABASE_URL = "https://hykioljldierzlpdrjgo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SG0GV_0f3uD1a0IRvWCIpw_v4dQYNeA";

const $ = id => document.getElementById(id);

const sb = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

if (!sb) {
    console.error("Supabase SDK не загружен.");
}

// ==========================================
// GLOBAL STATE
// ==========================================

let user = null;
let profile = null;

let currentSize = 3;
let currentTarget = 3;
let currentBoard = [];
let botDifficulty = "Easy";

let botBusy = false;
let botGameOver = false;

let onlineChannel = null;
let onlineParty = null;
let mySymbol = null;

let selectedFriend = null;
let chatRefreshTimer = null;

// ==========================================
// ACHIEVEMENTS
// ==========================================

const achievements = [
    ["first_win", "Первая победа", "Выиграй первый матч"],
    ["board_3", "Маленькая победа", "Победи на 3×3"],
    ["board_5", "Тактик", "Победи на 5×5"],
    ["board_10", "Стратег", "Победи на 10×10"],
    ["board_15", "Гигантская победа", "Победи на 15×15"],
    ["board_20", "Мастер поля", "Победи на 20×20"],
    ["board_25", "Легенда поля", "Победи на 25×25"],
    ["board_30", "Повелитель поля", "Победи на 30×30"],
    ["hard_win", "Сложный вызов", "Победи на Hard или выше"],
    ["impossible_win", "Невозможное возможно", "Победи на Impossible"],
    ["mega_win", "За гранью возможного", "Победи на Mega Impossible"],
    ["mega_15", "Мега-гигант", "Победи на 15×15 на Mega Impossible"],
    ["wins_5", "Первые пять", "Выиграй 5 матчей"],
    ["wins_10", "Десять побед", "Выиграй 10 матчей"],
    ["wins_25", "Опытный игрок", "Выиграй 25 матчей"],
    ["wins_50", "Полсотни побед", "Выиграй 50 матчей"],
    ["wins_100", "Сотня побед", "Выиграй 100 матчей"],
    ["streak_3", "Серия", "Выиграй 3 матча подряд"],
    ["streak_5", "Непобедимый", "Выиграй 5 матчей подряд"],
    ["top_50", "TOP 50", "Попади в мировой TOP 50"],
    ["champion", "Чемпион", "Займи первое место"],
    ["giga_champion", "Гига чемпион", "Победи на всех размерах и сложностях"]
];

function readArray(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

function readObject(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || "{}");
        return value && typeof value === "object" ? value : {};
    } catch {
        return {};
    }
}

let unlocked = readArray("ttt_achievements");
let gigaProgress = readObject("giga_champion_progress");

let winStreak = Number(localStorage.getItem("ttt_win_streak") || 0);

const gigaSizes = [3, 5, 10, 15];
const gigaDifficulties = [
    "Easy",
    "Medium",
    "Hard",
    "Very Hard",
    "Impossible",
    "Mega Impossible"
];

const boardAchievement = {
    3: "board_3",
    5: "board_5",
    10: "board_10",
    15: "board_15",
    20: "board_20",
    25: "board_25",
    30: "board_30"
};

function saveLocalAchievements() {
    localStorage.setItem("ttt_achievements", JSON.stringify(unlocked));
}

async function unlock(key) {
    if (!key || unlocked.includes(key)) return;

    unlocked.push(key);
    saveLocalAchievements();

    renderAchievements();
    await saveAchievementsCloud();
}

async function saveAchievementsCloud() {
    if (!sb || !user) return;

    const { error } = await sb
        .from("profiles")
        .update({ achievements: unlocked })
        .eq("id", user.id);

    if (error) {
        console.error("Ошибка сохранения достижений:", error.message);
    }
}

function calculateGigaProgress() {
    let total = 0;

    gigaSizes.forEach(size => {
        gigaDifficulties.forEach(difficulty => {
            if (gigaProgress[`${size}x${size}_${difficulty}`]) {
                total++;
            }
        });
    });

    return total;
}

async function recordGigaProgress(size, difficulty) {
    if (!gigaSizes.includes(size)) return;
    if (!gigaDifficulties.includes(difficulty)) return;

    gigaProgress[`${size}x${size}_${difficulty}`] = true;

    localStorage.setItem(
        "giga_champion_progress",
        JSON.stringify(gigaProgress)
    );

    if (calculateGigaProgress() >= 24) {
        await unlock("giga_champion");
    }

    renderAchievements();
}

// ==========================================
// NAVIGATION
// ==========================================

function show(id) {
    document.querySelectorAll("main section").forEach(section => {
        section.classList.add("hidden");
    });

    const element = $(id);
    if (element) element.classList.remove("hidden");
}

function message(id, text) {
    const element = $(id);
    if (element) element.textContent = text || "";
}

document.querySelectorAll("[data-home]").forEach(button => {
    button.addEventListener("click", () => {
        show("menuView");

        if (onlineChannel && sb) {
            sb.removeChannel(onlineChannel);
            onlineChannel = null;
        }
    });
});

document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", async () => {
        const view = button.dataset.view;
        show(view);

        if (view === "leaderboardView") await loadLeaderboard();
        if (view === "achievementsView") renderAchievements();
        if (view === "profileView") await loadProfile();
        if (view === "friendsView") await loadSocialData();
    });
});

// ==========================================
// ACCOUNT
// ==========================================

let authMode = "login";

function updateAccount() {
    if ($("accountBadge")) {
        $("accountBadge").textContent =
            user ? (profile?.username || user.email) : "Гость";
    }

    if ($("welcomeName")) {
        $("welcomeName").textContent =
            profile?.username || "Игрок";
    }

    if ($("avatar")) {
        $("avatar").textContent =
            (profile?.username || "T")[0].toUpperCase();
    }
}

function guest() {
    user = null;
    profile = null;
    updateAccount();
    show("menuView");
}

function setAuthMode(mode) {
    authMode = mode;

    $("loginTab").classList.toggle("active", mode === "login");
    $("registerTab").classList.toggle("active", mode === "register");

    $("usernameLabel").classList.toggle("hidden", mode !== "register");

    $("authSubmit").textContent =
        mode === "login" ? "Войти" : "Создать аккаунт";

    message("authMessage", "");
}

$("loginTab").onclick = () => setAuthMode("login");
$("registerTab").onclick = () => setAuthMode("register");
$("guestBtn").onclick = guest;

setAuthMode("login");

$("authSubmit").onclick = async () => {
    if (!sb) {
        message("authMessage", "Supabase не подключён.");
        return;
    }

    const email = $("email").value.trim();
    const password = $("password").value;

    if (!email || password.length < 6) {
        message("authMessage", "Проверь email и пароль.");
        return;
    }

    $("authSubmit").disabled = true;

    try {
        if (authMode === "register") {
            const username = $("username").value.trim();

            if (username.length < 3) {
                message("authMessage", "Никнейм должен быть не короче 3 символов.");
                return;
            }

            const { error } = await sb.auth.signUp({
                email,
                password,
                options: { data: { username } }
            });

            message(
                "authMessage",
                error ? error.message : "Аккаунт создан! Проверь почту."
            );
        } else {
            const { error } = await sb.auth.signInWithPassword({
                email,
                password
            });

            message(
                "authMessage",
                error ? error.message : "Вход выполнен!"
            );
        }
    } catch (error) {
        message("authMessage", error.message);
    } finally {
        $("authSubmit").disabled = false;
    }
};

$("logoutBtn").onclick = async () => {
    if (sb) await sb.auth.signOut();

    user = null;
    profile = null;
    selectedFriend = null;

    updateAccount();
    show("authView");
};

// ==========================================
// PROFILE
// ==========================================

async function loadProfile() {
    if (!sb || !user) return;

    const id = user.id;

    try {
        let { data, error } = await sb
            .from("profiles")
            .select("*")
            .eq("id", id)
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            const { data: created, error: createError } = await sb
                .from("profiles")
                .insert({
                    id,
                    username: user.user_metadata?.username || "Игрок",
                    wins: 0,
                    losses: 0,
                    draws: 0,
                    points: 0,
                    achievements: []
                })
                .select()
                .single();

            if (createError) throw createError;
            data = created;
        }

        if (!user || user.id !== id) return;

        profile = data;

        if (!Array.isArray(profile.achievements)) {
            profile.achievements = [];
        }

        unlocked = [...new Set([...unlocked, ...profile.achievements])];
        saveLocalAchievements();

        updateAccount();

        $("profileName").textContent = profile.username || "Игрок";
        $("profileEmail").textContent = user.email || "";
        $("profileAvatar").textContent =
            (profile.username || "T")[0].toUpperCase();

        $("wins").textContent = Number(profile.wins || 0);
        $("losses").textContent = Number(profile.losses || 0);
        $("draws").textContent = Number(profile.draws || 0);
        $("points").textContent = Number(profile.points || 0);

        await saveAchievementsCloud();
    } catch (error) {
        console.error("Ошибка профиля:", error);
    }
}

// ==========================================
// GAME BOARD
// ==========================================

function targetFor(size) {
    if (size === 3) return 3;
    if (size === 5) return 4;
    if (size === 10) return 5;
    return 7;
}

function makeBoard(size) {
    return Array(size * size).fill("");
}

function hasWin(board, size, symbol, target) {
    const directions = [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1]
    ];

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (board[y * size + x] !== symbol) continue;

            for (const [dx, dy] of directions) {
                let count = 0;

                for (let k = 0; k < target; k++) {
                    const xx = x + dx * k;
                    const yy = y + dy * k;

                    if (
                        xx < 0 || yy < 0 ||
                        xx >= size || yy >= size ||
                        board[yy * size + xx] !== symbol
                    ) break;

                    count++;
                }

                if (count >= target) return true;
            }
        }
    }

    return false;
}

function renderBoard(container, board, size, callback) {
    container.style.gridTemplateColumns =
        `repeat(${size}, minmax(${size > 10 ? 20 : 28}px,1fr))`;

    container.innerHTML = "";

    board.forEach((value, index) => {
        const button = document.createElement("button");

        button.className =
            "cell " + (value === "X" ? "x" : value === "O" ? "o" : "");

        button.textContent = value;
        button.disabled = !!value || !callback;

        button.addEventListener("click", () => {
            if (callback) callback(index);
        });

        container.appendChild(button);
    });
}

// ==========================================
// BOT AI
// ==========================================

function botPick(board, size, target, difficulty) {
    const empty = [];

    board.forEach((value, index) => {
        if (!value) empty.push(index);
    });

    if (!empty.length) return -1;

    // Победа или блокировка немедленной победы
    for (const symbol of ["O", "X"]) {
        for (const index of empty) {
            board[index] = symbol;
            const winning = hasWin(board, size, symbol, target);
            board[index] = "";

            if (winning) return index;
        }
    }

    if (difficulty === "Easy" && Math.random() < 0.65) {
        return empty[Math.floor(Math.random() * empty.length)];
    }

    let best = -Infinity;
    let choices = [];

    const noise = {
        Easy: 8,
        Medium: 4,
        Hard: 1.5,
        "Very Hard": 0.6,
        Impossible: 0.2,
        "Mega Impossible": 0.05
    }[difficulty] ?? 1;

    for (const index of empty) {
        const x = index % size;
        const y = Math.floor(index / size);

        let score = 0;

        for (
            let yy = Math.max(0, y - 2);
            yy <= Math.min(size - 1, y + 2);
            yy++
        ) {
            for (
                let xx = Math.max(0, x - 2);
                xx <= Math.min(size - 1, x + 2);
                xx++
            ) {
                const value = board[yy * size + xx];

                if (value === "O") score += 4;
                if (value === "X") score += 3;
            }
        }

        const center = (size - 1) / 2;

        score -= (
            (x - center) ** 2 +
            (y - center) ** 2
        ) * 0.025;

        score += Math.random() * noise;

        if (score > best) {
            best = score;
            choices = [index];
        } else if (score === best) {
            choices.push(index);
        }
    }

    return choices[Math.floor(Math.random() * choices.length)];
}

// ==========================================
// BOT GAME
// ==========================================

function startBot() {
    currentSize = Number($("botSize").value);
    currentTarget = targetFor(currentSize);
    botDifficulty = $("botDifficulty").value;

    currentBoard = makeBoard(currentSize);

    botBusy = false;
    botGameOver = false;

    $("gameTitle").textContent =
        `${currentSize}×${currentSize} · ${botDifficulty}`;

    $("gameStatus").textContent =
        `Ты — X · нужно ${currentTarget} в ряд`;

    show("gameView");

    renderBoard($("board"), currentBoard, currentSize, botClick);
}

$("startBot").onclick = startBot;
$("restartBot").onclick = startBot;

function botClick(index) {
    if (botBusy || botGameOver || currentBoard[index]) return;

    botBusy = true;
    currentBoard[index] = "X";

    renderBoard($("board"), currentBoard, currentSize, botClick);

    if (hasWin(currentBoard, currentSize, "X", currentTarget)) {
        finishBot("win");
        return;
    }

    if (currentBoard.every(Boolean)) {
        finishBot("draw");
        return;
    }

    $("gameStatus").textContent = "Бот думает…";

    setTimeout(() => {
        if (botGameOver) return;

        const move = botPick(
            currentBoard,
            currentSize,
            currentTarget,
            botDifficulty
        );

        if (move >= 0) currentBoard[move] = "O";

        renderBoard($("board"), currentBoard, currentSize, botClick);

        if (hasWin(currentBoard, currentSize, "O", currentTarget)) {
            finishBot("loss");
            return;
        }

        if (currentBoard.every(Boolean)) {
            finishBot("draw");
            return;
        }

        $("gameStatus").textContent = "Твой ход";
        botBusy = false;
    }, 850);
}

// ==========================================
// FINISH MATCH AND SAVE STATS
// ==========================================

async function finishBot(result) {
    if (botGameOver) return;

    botGameOver = true;
    botBusy = true;

    $("gameStatus").textContent =
        result === "win" ? "🏆 Победа!" :
        result === "loss" ? "Бот победил!" : "Ничья!";

    document.querySelectorAll("#board .cell").forEach(cell => {
        cell.disabled = true;
    });

    if (result === "win") {
        await unlock("first_win");

        await unlock(boardAchievement[currentSize]);

        if (
            ["Hard", "Very Hard", "Impossible", "Mega Impossible"]
                .includes(botDifficulty)
        ) {
            await unlock("hard_win");
        }

        if (botDifficulty === "Impossible") {
            await unlock("impossible_win");
        }

        if (botDifficulty === "Mega Impossible") {
            await unlock("mega_win");

            if (currentSize === 15) {
                await unlock("mega_15");
            }
        }

        winStreak++;
        localStorage.setItem("ttt_win_streak", String(winStreak));

        if (winStreak >= 3) await unlock("streak_3");
        if (winStreak >= 5) await unlock("streak_5");

        await recordGigaProgress(currentSize, botDifficulty);
    } else if (result === "loss") {
        winStreak = 0;
        localStorage.setItem("ttt_win_streak", "0");
    }

    if (!sb || !user) {
        $("gameStatus").textContent += " Войди в аккаунт для сохранения статистики.";
        renderAchievements();
        return;
    }

    try {
        const { data: currentProfile, error: readError } = await sb
            .from("profiles")
            .select("id,wins,losses,draws,points")
            .eq("id", user.id)
            .maybeSingle();

        if (readError) throw readError;
        if (!currentProfile) throw new Error("Профиль не найден.");

        const field =
            result === "win" ? "wins" :
            result === "loss" ? "losses" : "draws";

        const updated = {
            [field]: Number(currentProfile[field] || 0) + 1,
            points: Number(currentProfile.points || 0) +
                (result === "win" ? 10 : result === "draw" ? 2 : 0)
        };

        const { data, error } = await sb
            .from("profiles")
            .update(updated)
            .eq("id", user.id)
            .select()
            .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("База не обновила профиль.");

        profile = data;

        $("wins").textContent = data.wins || 0;
        $("losses").textContent = data.losses || 0;
        $("draws").textContent = data.draws || 0;
        $("points").textContent = data.points || 0;

        if (Number(data.wins) >= 5) await unlock("wins_5");
        if (Number(data.wins) >= 10) await unlock("wins_10");
        if (Number(data.wins) >= 25) await unlock("wins_25");
        if (Number(data.wins) >= 50) await unlock("wins_50");
        if (Number(data.wins) >= 100) await unlock("wins_100");

        updateAccount();

        $("gameStatus").textContent += " Статистика сохранена!";
    } catch (error) {
        console.error("Ошибка сохранения:", error);
        $("gameStatus").textContent += " Ошибка сохранения: " + error.message;
    }

    renderAchievements();
}

// ==========================================
// ACHIEVEMENT DISPLAY
// ==========================================

function renderAchievements() {
    const box = $("achievements");
    if (!box) return;

    box.innerHTML = "";

    achievements.forEach(([id, title, desc]) => {
        const row = document.createElement("div");
        row.className = "list-row";

        const left = document.createElement("div");

        const heading = document.createElement("b");
        heading.textContent =
            `${unlocked.includes(id) ? "🏅" : "🔒"} ${title}`;

        const description = document.createElement("small");
        description.textContent = desc;

        left.append(heading, document.createElement("br"), description);

        if (id === "giga_champion") {
            const progress = document.createElement("small");
            progress.textContent =
                `Прогресс: ${calculateGigaProgress()}/24 побед`;
            left.append(document.createElement("br"), progress);
        }

        const status = document.createElement("span");
        status.textContent = unlocked.includes(id) ? "Получено" : "Закрыто";

        row.append(left, status);
        box.appendChild(row);
    });
}

// ==========================================
// LEADERBOARD
// ==========================================

async function loadLeaderboard() {
    const box = $("leaderboard");
    box.textContent = "Загрузка рейтинга…";

    if (!sb) {
        box.textContent = "Supabase не подключён.";
        return;
    }

    const { data, error } = await sb
        .from("profiles")
        .select("id,username,wins,points")
        .order("points", { ascending: false })
        .order("wins", { ascending: false })
        .limit(50);

    if (error) {
        box.textContent = "Ошибка: " + error.message;
        return;
    }

    box.innerHTML = "";

    (data || []).forEach((player, index) => {
        const row = document.createElement("div");
        row.className = "list-row";

        const name = document.createElement("b");
        name.textContent = `#${index + 1} ${player.username}`;

        const stats = document.createElement("span");
        stats.textContent =
            `${player.points || 0} очков · ${player.wins || 0} побед`;

        row.append(name, stats);
        box.appendChild(row);
    });

    if (!data?.length) box.textContent = "Игроков пока нет.";

    if (user && data?.[0]?.id === user.id) {
        await unlock("champion");
    }

    if (user && data?.some(player => player.id === user.id)) {
        await unlock("top_50");
    }

    renderAchievements();
}

// ==========================================
// HTML ESCAPING
// ==========================================

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

// ==========================================
// FRIENDS: SEARCH
// ==========================================

async function searchFriends() {
    if (!user) {
        message("friendSearchResults", "Войди в аккаунт.");
        return;
    }

    const query = $("friendSearch").value.trim();

    if (query.length < 3) {
        message("friendSearchResults", "Введи минимум 3 символа.");
        return;
    }

    const box = $("friendSearchResults");
    box.textContent = "Поиск…";

    const { data, error } = await sb
        .from("profiles")
        .select("id,username")
        .ilike("username", `%${query}%`)
        .limit(10);

    if (error) {
        box.textContent = error.message;
        return;
    }

    box.innerHTML = "";

    const results = (data || []).filter(player => player.id !== user.id);

    if (!results.length) {
        box.textContent = "Игроки не найдены.";
        return;
    }

    results.forEach(player => {
        const row = document.createElement("div");
        row.className = "list-row";

        const name = document.createElement("b");
        name.textContent = player.username;

        const button = document.createElement("button");
        button.className = "primary";
        button.textContent = "Добавить";

        button.onclick = () => sendFriendRequest(player.id);

        row.append(name, button);
        box.appendChild(row);
    });
}

$("searchFriend").onclick = searchFriends;

async function sendFriendRequest(receiverId) {
    const { error } = await sb
        .from("friend_requests")
        .insert({
            sender_id: user.id,
            receiver_id: receiverId
        });

    if (error) {
        message("friendSearchResults", error.message);
        return;
    }

    message("friendSearchResults", "Заявка отправлена!");
}

// ==========================================
// FRIEND REQUESTS
// ==========================================

async function loadFriendRequests() {
    const box = $("friendRequests");
    box.innerHTML = "";

    const { data, error } = await sb
        .from("friend_requests")
        .select("id,sender_id,status")
        .eq("receiver_id", user.id)
        .eq("status", "pending");

    if (error) {
        box.textContent = error.message;
        return;
    }

    if (!data?.length) {
        box.textContent = "Новых заявок нет.";
        return;
    }

    for (const request of data) {
        const { data: sender } = await sb
            .from("profiles")
            .select("username")
            .eq("id", request.sender_id)
            .maybeSingle();

        const row = document.createElement("div");
        row.className = "list-row";

        const name = document.createElement("b");
        name.textContent = sender?.username || "Игрок";

        const accept = document.createElement("button");
        accept.className = "primary";
        accept.textContent = "Принять";

        accept.onclick = async () => {
            const { error } = await sb.rpc(
                "accept_friend_request",
                { p_request: request.id }
            );

            if (error) {
                message("friendRequests", error.message);
                return;
            }

            await loadSocialData();
        };

        const reject = document.createElement("button");
        reject.className = "ghost";
        reject.textContent = "Отклонить";

        reject.onclick = async () => {
            const { error } = await sb
                .from("friend_requests")
                .update({ status: "rejected" })
                .eq("id", request.id);

            if (error) {
                message("friendRequests", error.message);
                return;
            }

            await loadFriendRequests();
        };

        row.append(name, accept, reject);
        box.appendChild(row);
    }
}

// ==========================================
// FRIEND LIST
// ==========================================

async function loadFriends() {
    const box = $("friendsList");
    box.innerHTML = "";

    const { data, error } = await sb
        .from("friendships")
        .select("user1_id,user2_id")
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

    if (error) {
        box.textContent = error.message;
        return;
    }

    if (!data?.length) {
        box.textContent = "Пока нет друзей.";
        return;
    }

    for (const friendship of data) {
        const friendId =
            friendship.user1_id === user.id
                ? friendship.user2_id
                : friendship.user1_id;

        const { data: friend } = await sb
            .from("profiles")
            .select("username")
            .eq("id", friendId)
            .maybeSingle();

        const row = document.createElement("div");
        row.className = "list-row";

        const name = document.createElement("b");
        name.textContent = friend?.username || "Игрок";

        const chat = document.createElement("button");
        chat.className = "primary";
        chat.textContent = "Написать";

        chat.onclick = () => openChat(friendId, friend?.username || "Игрок");

        const remove = document.createElement("button");
        remove.className = "ghost";
        remove.textContent = "Удалить";

        remove.onclick = async () => {
            if (!confirm("Удалить этого друга?")) return;

            const { error } = await sb.rpc(
                "remove_friend",
                { p_friend: friendId }
            );

            if (error) {
                message("friendsList", error.message);
                return;
            }

            if (selectedFriend === friendId) {
                selectedFriend = null;
                $("chatPartner").textContent = "Выбери друга.";
                $("chatMessages").innerHTML = "";
            }

            await loadFriends();
        };

        row.append(name, chat, remove);
        box.appendChild(row);
    }
}

async function loadSocialData() {
    if (!sb || !user) {
        message("friendSearchResults", "Войди в аккаунт для использования друзей.");
        return;
    }

    await loadFriendRequests();
    await loadFriends();
}

// ==========================================
// CHAT AND MESSAGE FILTER
// ==========================================

// Это базовый фильтр. Для полноценной модерации нужна
// дополнительная серверная проверка.

const blockedWords = [
    "блядь", "блять", "сука", "хуй", "пизда",
    "ебать", "еблан", "мудак", "нахуй", "пиздец",
    "fuck", "shit", "bitch", "asshole"
];

function filterBadWords(text) {
    let result = String(text || "");

    for (const word of blockedWords) {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const pattern = new RegExp(escaped, "giu");

        result = result.replace(pattern, match => "*".repeat(match.length));
    }

    return result;
}

async function openChat(friendId, friendName) {
    selectedFriend = friendId;

    $("chatPartner").textContent = "Переписка с " + friendName;

    await loadMessages();

    if (chatRefreshTimer) {
        clearInterval(chatRefreshTimer);
    }

    chatRefreshTimer = setInterval(() => {
        if (selectedFriend) loadMessages();
    }, 5000);
}

async function loadMessages() {
    if (!user || !selectedFriend) return;

    const { data, error } = await sb
        .from("messages")
        .select("id,sender_id,receiver_id,body,created_at")
        .or(
            `and(sender_id.eq.${user.id},receiver_id.eq.${selectedFriend}),and(sender_id.eq.${selectedFriend},receiver_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true })
        .limit(100);

    const box = $("chatMessages");

    if (error) {
        box.textContent = error.message;
        return;
    }

    box.innerHTML = "";

    (data || []).forEach(item => {
        const row = document.createElement("div");

        row.className =
            "chat-message " +
            (item.sender_id === user.id ? "mine" : "");

        const body = document.createElement("span");
        body.textContent = filterBadWords(item.body);

        const date = document.createElement("small");
        date.textContent = new Date(item.created_at).toLocaleString("ru-RU");

        row.append(body, date);
        box.appendChild(row);
    });

    box.scrollTop = box.scrollHeight;
}

async function sendChatMessage() {
    if (!user || !selectedFriend) {
        message("chatStatus", "Сначала выбери друга.");
        return;
    }

    const raw = $("chatInput").value.trim();

    if (!raw) return;

    if (raw.length > 500) {
        message("chatStatus", "Максимум 500 символов.");
        return;
    }

    const safeText = filterBadWords(raw);

    const { error } = await sb
        .from("messages")
        .insert({
            sender_id: user.id,
            receiver_id: selectedFriend,
            body: safeText
        });

    if (error) {
        message("chatStatus", "Не удалось отправить: " + error.message);
        return;
    }

    $("chatInput").value = "";
    message("chatStatus", "Сообщение отправлено.");

    await loadMessages();
}

$("sendMessage").onclick = sendChatMessage;

// ==========================================
// ONLINE PARTIES
// ==========================================

async function createParty() {
    if (!sb || !user) {
        message("onlineMessage", "Сначала войди в аккаунт.");
        return;
    }

    const n = Number($("partySize").value);

    message("onlineMessage", "Создаём комнату…");

    const { data, error } = await sb.rpc(
        "create_party",
        { p_size: n }
    );

    if (error) {
        message("onlineMessage", error.message);
        return;
    }

    await openParty(data);
}

async function joinParty() {
    if (!sb || !user) {
        message("onlineMessage", "Сначала войди в аккаунт.");
        return;
    }

    const code = $("partyCode").value.trim().toUpperCase();

    if (!code) {
        message("onlineMessage", "Введи код комнаты.");
        return;
    }

    const { data, error } = await sb.rpc(
        "join_party",
        { p_code: code }
    );

    if (error) {
        message("onlineMessage", error.message);
        return;
    }

    await openParty(data);
}

$("createParty").onclick = createParty;
$("joinParty").onclick = joinParty;

async function openParty(partyId) {
    const { data, error } = await sb
        .from("parties")
        .select("*")
        .eq("id", partyId)
        .single();

    if (error) {
        message("onlineMessage", error.message);
        return;
    }

    onlineParty = data;

    const { data: members, error: memberError } = await sb
        .from("party_players")
        .select("*")
        .eq("party_id", partyId)
        .order("joined_at");

    if (memberError) {
        message("onlineMessage", memberError.message);
        return;
    }

    mySymbol =
        members?.find(member => member.user_id === user.id)?.symbol || null;

    $("roomCodeLabel").textContent = data.code;
    show("onlineGameView");

    await refreshParty();

    if (onlineChannel) sb.removeChannel(onlineChannel);

    onlineChannel = sb
        .channel("party-" + partyId)
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "parties",
                filter: "id=eq." + partyId
            },
            payload => {
                onlineParty = payload.new;
                refreshParty();
            }
        )
        .subscribe();
}

async function refreshParty() {
    if (!onlineParty) return;

    const { data: members, error } = await sb
        .from("party_players")
        .select("*")
        .eq("party_id", onlineParty.id);

    if (error) {
        console.error(error);
        return;
    }

    const names = members?.map(member =>
        member.symbol + " · " + member.user_id.slice(0, 6)
    ).join(" | ") || "";

    $("onlineStatus").textContent =
        onlineParty.status === "waiting"
            ? "Ожидание второго игрока…"
            : onlineParty.status === "finished"
                ? (
                    onlineParty.winner_id === user.id
                        ? "Ты победил!"
                        : "Матч завершён"
                )
                : `Ты ${mySymbol || "?"} · ${
                    onlineParty.current_turn === user.id
                        ? "Твой ход"
                        : "Ход соперника"
                } · ${names}`;

    const n = onlineParty.board_size;

    const board = Array.isArray(onlineParty.board)
        ? onlineParty.board
        : Array(n * n).fill("");

    renderBoard(
        $("onlineBoard"),
        board,
        n,
        onlineParty.status === "playing" &&
        onlineParty.current_turn === user.id
            ? onlineClick
            : null
    );
}

async function onlineClick(index) {
    if (!sb || !onlineParty) return;

    const { error } = await sb.rpc("make_party_move", {
        p_party: onlineParty.id,
        p_index: index
    });

    if (error) message("onlineStatus", error.message);
}

// ==========================================
// BACKGROUND SETTINGS
// ==========================================

const savedColor = localStorage.getItem("ttt_bg") || "#111827";

document.body.style.background = savedColor;

$("bgColor").value = savedColor;

$("bgColor").oninput = event => {
    document.body.style.background = event.target.value;
    localStorage.setItem("ttt_bg", event.target.value);
    $("noBackground").checked = false;
};

$("noBackground").onchange = event => {
    document.body.style.background =
        event.target.checked
            ? "#000000"
            : (localStorage.getItem("ttt_bg") || "#111827");
};

$("bgPhoto").onchange = event => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
        document.body.style.backgroundImage = `url(${reader.result})`;
        document.body.style.backgroundSize = "cover";

        localStorage.setItem("ttt_photo", reader.result);
    };

    reader.readAsDataURL(file);
};

$("resetBackground").onclick = () => {
    document.body.style.background = "#111827";
    document.body.style.backgroundImage = "";

    localStorage.removeItem("ttt_bg");
    localStorage.removeItem("ttt_photo");

    $("bgColor").value = "#111827";
    $("noBackground").checked = false;
};

const savedPhoto = localStorage.getItem("ttt_photo");

if (savedPhoto) {
    document.body.style.backgroundImage = `url(${savedPhoto})`;
    document.body.style.backgroundSize = "cover";
}

// ==========================================
// AUTH SESSION
// ==========================================

if (sb) {
    sb.auth.getSession().then(async ({ data, error }) => {
        if (error) {
            console.error(error);
            return;
        }

        if (data.session) {
            user = data.session.user;
            await loadProfile();
            updateAccount();
            show("menuView");
        } else {
            show("authView");
        }
    });

    sb.auth.onAuthStateChange((event, session) => {
        user = session?.user || null;

        if (user) {
            const sessionId = user.id;

            setTimeout(async () => {
                if (!user || user.id !== sessionId) return;

                await loadProfile();
                updateAccount();
                show("menuView");
            }, 0);
        } else if (event === "SIGNED_OUT") {
            profile = null;
            selectedFriend = null;

            if (chatRefreshTimer) {
                clearInterval(chatRefreshTimer);
                chatRefreshTimer = null;
            }

            updateAccount();
            show("authView");
        }
    });
} else {
    show("authView");
}

// ==========================================
// INITIAL UI
// ==========================================

updateAccount();
renderAchievements();


