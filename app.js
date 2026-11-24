// ===============================
// SUPABASE
// ===============================

const SUPABASE_URL = "https://hykioljldierzlpdrjgo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SG0GV_0f3uD1a0IRvWCIpw_v4dQYNeA";

const configured =
    SUPABASE_URL.startsWith("https://") &&
    SUPABASE_ANON_KEY.startsWith("sb_publishable_");

function $(id) {
    return document.getElementById(id);
}

if (!window.supabase) {
    console.error("Supabase SDK не загружен! Проверь index.html");
}

const sb = configured && window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// ===============================
// GLOBAL VARIABLES
// ===============================

let user = null;
let profile = null;

let currentSize = 3;
let currentTarget = 3;
let currentBoard = [];
let botDifficulty = "Easy";

let onlineChannel = null;
let onlineParty = null;
let mySymbol = null;

// ===============================
// ACHIEVEMENTS
// ===============================

const achievements = [
    ["first_win", "Первая победа", "Выиграй первый матч"],
    ["board_3", "Маленькая победа", "Победи на поле 3×3"],
    ["board_5", "Тактик", "Победи на поле 5×5"],
    ["board_10", "Стратег", "Победи на поле 10×10"],
    ["board_15", "Гигантская победа", "Победи на поле 15×15"],
    ["hard_win", "Сложный вызов", "Победи на Hard или выше"],
    ["top_50", "TOP 50", "Попади в мировой TOP 50"],
    ["champion", "Чемпион", "Займи первое место в рейтинге"],
    ["giga_champion", "Гига чемпион", "Победи на всех картах и всех сложностях робота"]
];

let unlocked = JSON.parse(
    localStorage.getItem("ttt_achievements") || "[]"
);

const gigaSizes = [3, 5, 10, 15];

const gigaDifficulties = [
    "Easy",
    "Medium",
    "Hard",
    "Very Hard",
    "Impossible",
    "Mega Impossible"
];

let gigaProgress = JSON.parse(
    localStorage.getItem("giga_champion_progress") || "{}"
);

function recordGigaProgress(size, difficulty) {
    const key = `${size}x${size}_${difficulty}`;

    gigaProgress[key] = true;

    localStorage.setItem(
        "giga_champion_progress",
        JSON.stringify(gigaProgress)
    );

    let total = 0;

    gigaSizes.forEach(size => {
        gigaDifficulties.forEach(difficulty => {
            if (gigaProgress[`${size}x${size}_${difficulty}`]) {
                total++;
            }
        });
    });

    if (total >= 24) {
        unlock("giga_champion");
    }
}

// ===============================
// NAVIGATION
// ===============================

function show(id) {
    document.querySelectorAll("main section").forEach(section => {
        section.classList.add("hidden");
    });

    const element = $(id);

    if (element) {
        element.classList.remove("hidden");
    }
}

function message(id, text) {
    const element = $(id);
    if (element) element.textContent = text || "";
}

function targetFor(n) {
    return n === 3 ? 3 : n === 5 ? 4 : n === 10 ? 5 : 7;
}

// ===============================
// ACCOUNT
// ===============================

function updateAccount() {
    $("accountBadge").textContent =
        user ? (profile?.username || user.email) : "Гость";

    $("welcomeName").textContent =
        profile?.username || "Игрок";

    $("avatar").textContent =
        (profile?.username || "T")[0].toUpperCase();
}

function guest() {
    user = null;
    profile = null;

    updateAccount();
    show("menuView");
}

let authMode = "login";

function setAuthMode(mode) {
    authMode = mode;

    $("loginTab").classList.toggle("active", mode === "login");
    $("registerTab").classList.toggle("active", mode === "register");

    $("usernameLabel").classList.toggle(
        "hidden",
        mode !== "register"
    );

    $("authSubmit").textContent =
        mode === "login" ? "Войти" : "Создать аккаунт";

    message("authMessage", "");
}

$("loginTab").onclick = () => setAuthMode("login");
$("registerTab").onclick = () => setAuthMode("register");

setAuthMode("login");

$("guestBtn").onclick = guest;

// ===============================
// PROFILE
// ===============================

async function loadProfile() {
    if (!sb || !user) return;

    const { data, error } = await sb
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

    if (error) {
        console.error(error);
        return;
    }

    profile = data;

    updateAccount();

    $("profileName").textContent =
        profile?.username || "Игрок";

    $("profileEmail").textContent =
        user.email || "";

    $("profileAvatar").textContent =
        (profile?.username || "T")[0].toUpperCase();

    $("wins").textContent = profile?.wins || 0;
    $("losses").textContent = profile?.losses || 0;
    $("draws").textContent = profile?.draws || 0;
    $("points").textContent = profile?.points || 0;
}

// ===============================
// LOGIN / REGISTER
// ===============================

$("authSubmit").onclick = async () => {
    if (!sb) {
        message("authMessage", "Проверь настройки Supabase.");
        return;
    }

    const email = $("email").value.trim();
    const password = $("password").value;

    if (!email || password.length < 6) {
        message("authMessage", "Введи email и пароль минимум из 6 символов.");
        return;
    }

    $("authSubmit").disabled = true;

    try {
        if (authMode === "register") {
            const username = $("username").value.trim();

            if (username.length < 3) {
                message("authMessage", "Никнейм должен содержать минимум 3 символа.");
                return;
            }

            const { error } = await sb.auth.signUp({
                email,
                password,
                options: {
                    data: { username }
                }
            });

            message(
                "authMessage",
                error
                    ? error.message
                    : "Аккаунт создан! Проверь почту, если требуется подтверждение."
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

    updateAccount();
    show("authView");
};

// ===============================
// NAVIGATION BUTTONS
// ===============================

document.querySelectorAll("[data-home]").forEach(button => {
    button.onclick = () => {
        if (onlineChannel && sb) {
            sb.removeChannel(onlineChannel);
            onlineChannel = null;
        }

        show("menuView");
    };
});

document.querySelectorAll("[data-view]").forEach(button => {
    button.onclick = () => {
        show(button.dataset.view);

        if (button.dataset.view === "leaderboardView") {
            loadLeaderboard();
        }

        if (button.dataset.view === "achievementsView") {
            renderAchievements();
        }
    };
});

// ===============================
// GAME BOARD
// ===============================

function makeBoard(n) {
    return Array(n * n).fill("");
}

function hasWin(board, n, symbol, target) {
    const dirs = [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1]
    ];

    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (board[y * n + x] !== symbol) continue;

            for (const [dx, dy] of dirs) {
                let count = 0;

                for (let k = 0; k < target; k++) {
                    const xx = x + dx * k;
                    const yy = y + dy * k;

                    if (
                        xx < 0 ||
                        yy < 0 ||
                        xx >= n ||
                        yy >= n ||
                        board[yy * n + xx] !== symbol
                    ) {
                        break;
                    }

                    count++;
                }

                if (count >= target) return true;
            }
        }
    }

    return false;
}

function renderBoard(container, board, n, clickable) {
    container.style.gridTemplateColumns =
        `repeat(${n}, minmax(${n > 10 ? 22 : 34}px,1fr))`;

    container.innerHTML = "";

    board.forEach((value, index) => {
        const button = document.createElement("button");

        button.className =
            "cell " +
            (value === "X" ? "x" : value === "O" ? "o" : "");

        button.textContent = value;
        button.disabled = !!value || !clickable;

        button.onclick = () => {
            if (clickable) clickable(index);
        };

        container.appendChild(button);
    });
}

// ===============================
// BOT AI
// ===============================

function botPick(board, n, target, difficulty) {
    const empty = [];

    board.forEach((value, index) => {
        if (!value) empty.push(index);
    });

    if (!empty.length) return -1;

    // Победа или блокировка
    for (const mark of ["O", "X"]) {
        for (const index of empty) {
            board[index] = mark;

            const win = hasWin(board, n, mark, target);

            board[index] = "";

            if (win) return index;
        }
    }

    if (
        difficulty === "Easy" &&
        Math.random() < 0.65
    ) {
        return empty[Math.floor(Math.random() * empty.length)];
    }

    let best = -Infinity;
    let choices = [];

    for (const index of empty) {
        const x = index % n;
        const y = Math.floor(index / n);

        let score = 0;

        for (
            let yy = Math.max(0, y - 2);
            yy <= Math.min(n - 1, y + 2);
            yy++
        ) {
            for (
                let xx = Math.max(0, x - 2);
                xx <= Math.min(n - 1, x + 2);
                xx++
            ) {
                const value = board[yy * n + xx];

                if (value === "O") score += 4;
                if (value === "X") score += 3;
            }
        }

        const center = (n - 1) / 2;

        score -= (
            (x - center) ** 2 +
            (y - center) ** 2
        ) * 0.025;

        const noise = {
            Easy: 8,
            Medium: 4,
            Hard: 1.5,
            "Very Hard": 0.6,
            Impossible: 0.2,
            "Mega Impossible": 0.05
        }[difficulty] ?? 1;

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

// ===============================
// BOT GAME
// ===============================

let botBusy = false;
let botGameOver = false;

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

    renderBoard(
        $("board"),
        currentBoard,
        currentSize,
        botClick
    );
}

$("startBot").onclick = startBot;
$("restartBot").onclick = startBot;

function botClick(index) {
    if (botBusy || botGameOver) return;
    if (currentBoard[index]) return;

    botBusy = true;

    currentBoard[index] = "X";

    renderBoard(
        $("board"),
        currentBoard,
        currentSize,
        botClick
    );

    if (
        hasWin(
            currentBoard,
            currentSize,
            "X",
            currentTarget
        )
    ) {
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

        if (move >= 0) {
            currentBoard[move] = "O";
        }

        renderBoard(
            $("board"),
            currentBoard,
            currentSize,
            botClick
        );

        if (
            hasWin(
                currentBoard,
                currentSize,
                "O",
                currentTarget
            )
        ) {
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

// ===============================
// FINISH BOT GAME
// ===============================

async function finishBot(result) {
    if (botGameOver) return;

    botGameOver = true;
    botBusy = true;

    $("gameStatus").textContent =
        result === "win"
            ? "🏆 Победа!"
            : result === "loss"
                ? "Бот победил!"
                : "Ничья!";

    document.querySelectorAll("#board .cell").forEach(button => {
        button.disabled = true;
    });

    if (result === "win") {
        const key = {
            3: "board_3",
            5: "board_5",
            10: "board_10",
            15: "board_15"
        }[currentSize];

        unlock("first_win");
        unlock(key);

        if (
            [
                "Hard",
                "Very Hard",
                "Impossible",
                "Mega Impossible"
            ].includes(botDifficulty)
        ) {
            unlock("hard_win");
        }

        recordGigaProgress(currentSize, botDifficulty);

        renderAchievements();
    }

    if (user && sb) {
        const field =
            result === "win"
                ? "wins"
                : result === "loss"
                    ? "losses"
                    : "draws";

        const newValue = (profile?.[field] || 0) + 1;

        const points =
            (profile?.points || 0) +
            (result === "win" ? 10 : result === "draw" ? 2 : 0);

        const { error } = await sb
            .from("profiles")
            .update({
                [field]: newValue,
                points
            })
            .eq("id", user.id);

        if (error) {
            console.error("Ошибка обновления профиля:", error);
        } else {
            await loadProfile();
        }
    }
}

// ===============================
// UNLOCK ACHIEVEMENTS
// ===============================

function unlock(key) {
    if (!key || unlocked.includes(key)) return;

    unlocked.push(key);

    localStorage.setItem(
        "ttt_achievements",
        JSON.stringify(unlocked)
    );
}

function renderAchievements() {
    const box = $("achievements");

    box.innerHTML = "";

    achievements.forEach(([id, title, desc]) => {
        const row = document.createElement("div");

        row.className = "list-row";

        let extra = "";

        if (id === "giga_champion") {
            let total = 0;

            gigaSizes.forEach(size => {
                gigaDifficulties.forEach(difficulty => {
                    if (
                        gigaProgress[
                            `${size}x${size}_${difficulty}`
                        ]
                    ) {
                        total++;
                    }
                });
            });

            extra = `<br><small>Прогресс: ${total}/24 побед</small>`;
        }

        row.innerHTML = `
            <div>
                <b>
                    ${unlocked.includes(id) ? "🏅" : "🔒"}
                    ${title}
                </b>
                <br>
                <small>${desc}</small>
                ${extra}
            </div>

            <span>
                ${unlocked.includes(id) ? "Получено" : "Закрыто"}
            </span>
        `;

        box.appendChild(row);
    });
}

// ===============================
// LEADERBOARD
// ===============================

async function loadLeaderboard() {
    const box = $("leaderboard");

    box.innerHTML =
        "<p class='muted'>Загрузка рейтинга…</p>";

    if (!sb) {
        box.textContent =
            "Подключи Supabase, чтобы увидеть мировой рейтинг.";
        return;
    }

    const { data, error } = await sb
        .from("profiles")
        .select("id,username,wins,points")
        .order("points", { ascending: false })
        .order("wins", { ascending: false })
        .limit(50);

    if (error) {
        box.textContent = error.message;
        return;
    }

    box.innerHTML = "";

    (data || []).forEach((player, index) => {
        const row = document.createElement("div");

        row.className = "list-row";

        row.innerHTML = `
            <b>#${index + 1} ${escapeHtml(player.username)}</b>
            <span>
                ${player.points || 0} очков ·
                ${player.wins || 0} побед
            </span>
        `;

        box.appendChild(row);
    });

    if (user && data?.[0]?.id === user.id) {
        unlock("champion");
    }

    renderAchievements();
}

function escapeHtml(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]
    );
}

// ===============================
// ONLINE PARTIES
// ===============================

async function createParty() {
    if (!sb || !user) {
        message(
            "onlineMessage",
            "Для онлайн-игры настрой Supabase и войди в аккаунт."
        );
        return;
    }

    message("onlineMessage", "Создаём комнату…");

    const n = Number($("partySize").value);

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

    message("onlineMessage", "Подключаемся…");

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

    // В исходной настройке базы использовалась party_players.
    const { data: members, error: membersError } = await sb
        .from("party_players")
        .select("*")
        .eq("party_id", partyId)
        .order("joined_at");

    if (membersError) {
        message("onlineMessage", membersError.message);
        return;
    }

    mySymbol =
        members?.find(member => member.user_id === user.id)?.symbol || null;

    $("roomCodeLabel").textContent = data.code;

    show("onlineGameView");

    await refreshParty();

    if (onlineChannel) {
        sb.removeChannel(onlineChannel);
    }

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

    const names = members
        ?.map(member =>
            member.symbol + " · " + member.user_id.slice(0, 6)
        )
        .join("  |  ") || "";

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

    const { error } = await sb.rpc(
        "make_party_move",
        {
            p_party: onlineParty.id,
            p_index: index
        }
    );

    if (error) {
        message("onlineStatus", error.message);
    }
}

// ===============================
// AUTH SESSION
// ===============================

if (configured && sb) {
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
        }
    });

    sb.auth.onAuthStateChange(async (event, session) => {
        user = session?.user || null;

        if (user) {
            await loadProfile();

            updateAccount();
            show("menuView");

        } else if (event === "SIGNED_OUT") {
            profile = null;

            updateAccount();
            show("authView");
        }
    });

} else {
    setAuthMode("login");
}

// ===============================
// BACKGROUND SETTINGS
// ===============================

const savedColor =
    localStorage.getItem("ttt_bg") || "#111827";

document.body.style.background = savedColor;
$("bgColor").value = savedColor;

$("bgColor").oninput = event => {
    document.body.style.background = event.target.value;

    localStorage.setItem(
        "ttt_bg",
        event.target.value
    );

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
        document.body.style.backgroundImage =
            `url(${reader.result})`;

        document.body.style.backgroundSize = "cover";

        localStorage.setItem(
            "ttt_photo",
            reader.result
        );
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
    document.body.style.backgroundImage =
        `url(${savedPhoto})`;

    document.body.style.backgroundSize = "cover";
}
