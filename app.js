
"use strict";

// ======================================================
// TIC-TAC-TOE ULTIMATE ONLINE
// COMPLETE APPLICATION
// ======================================================

const SUPABASE_URL = "https://hykioljldierzlpdrjgo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SG0GV_0f3uD1a0IRvWCIpw_v4dQYNeA";

if (!window.supabase) {
    throw new Error("Supabase library is not loaded.");
}

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

const $ = id => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let currentRoom = null;
let roomChannel = null;
let roomPlayers = [];
let roomMoves = [];
let chessGame = null;
let selectedSquare = null;
let selectedChecker = null;
let activeChatUser = null;
let messageChannel = null;
let isProcessingMove = false;
let authMode = "login";

const GAME_NAMES = {
    chess: "Шахматы",
    checkers: "Шашки",
    tic_tac_toe: "Крестики-нолики",
    connect_four: "Четыре в ряд",
    battleship: "Морской бой",
    ludo: "Лудо",
    uno: "UNO"
};

const DEFAULT_BACKGROUND = "#101827";

// ======================================================
// HELPERS
// ======================================================

function showMessage(id, message, isError = false) {
    const element = $(id);
    if (!element) return;

    element.textContent = message;
    element.classList.toggle("error", isError);
    element.classList.toggle("success", !isError && !!message);
}

function showView(viewId) {
    document.querySelectorAll(".view").forEach(view => {
        view.classList.add("hidden");
    });

    $(viewId)?.classList.remove("hidden");
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function errorText(error) {
    return error?.message || "Неизвестная ошибка";
}

function setButtonLoading(button, loading, text = "Загрузка...") {
    if (!button) return;

    if (loading) {
        if (!button.dataset.oldText) {
            button.dataset.oldText = button.textContent;
        }
        button.disabled = true;
        button.textContent = text;
    } else {
        button.disabled = false;
        if (button.dataset.oldText) {
            button.textContent = button.dataset.oldText;
            delete button.dataset.oldText;
        }
    }
}

function requireLogin() {
    if (currentUser) return true;

    showView("authView");
    showMessage("authMessage", "Сначала войди в аккаунт.", true);
    return false;
}

function safeText(id, value) {
    if ($(id)) $(id).textContent = value ?? "";
}

// ======================================================
// AUTHENTICATION
// ======================================================

function setAuthMode(mode) {
    authMode = mode;

    $("loginTab")?.classList.toggle("active", mode === "login");
    $("registerTab")?.classList.toggle("active", mode === "register");

    $("usernameLabel")?.classList.toggle("hidden", mode !== "register");
    $("username")?.classList.toggle("hidden", mode !== "register");

    safeText("authSubmit",
        mode === "login" ? "Войти" : "Создать аккаунт"
    );

    showMessage("authMessage", "");
}

async function handleAuth() {
    const email = $("email")?.value.trim();
    const password = $("password")?.value || "";
    const username = $("username")?.value.trim();

    if (!email || !password) {
        showMessage("authMessage", "Введи email и пароль.", true);
        return;
    }

    if (password.length < 6) {
        showMessage("authMessage", "Пароль должен содержать минимум 6 символов.", true);
        return;
    }

    if (authMode === "register") {
        if (!username || username.length < 3 || username.length > 25) {
            showMessage("authMessage", "Имя должно содержать от 3 до 25 символов.", true);
            return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            showMessage("authMessage", "Используй латинские буквы, цифры и _.", true);
            return;
        }
    }

    const button = $("authSubmit");
    setButtonLoading(button, true);

    try {
        if (authMode === "register") {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: { username }
                }
            });

            if (error) throw error;

            if (data.user && data.session) {
                await createOrUpdateProfile(data.user, username);
                await loadApplication(data.user);
            } else {
                showMessage(
                    "authMessage",
                    "Аккаунт создан. Проверь почту для подтверждения."
                );
            }
        } else {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            await loadApplication(data.user);
        }
    } catch (error) {
        showMessage("authMessage", errorText(error), true);
    } finally {
        setButtonLoading(button, false);
    }
}

async function createOrUpdateProfile(user, username) {
    const name =
        username ||
        user.user_metadata?.username ||
        user.email?.split("@")[0] ||
        "Player";

    const { error } = await supabaseClient
        .from("profiles")
        .upsert({
            id: user.id,
            username: name
        }, { onConflict: "id" });

    if (error) throw error;
}

async function logout() {
    await leaveCurrentRoom(false);

    if (messageChannel) {
        await supabaseClient.removeChannel(messageChannel);
        messageChannel = null;
    }

    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        alert(errorText(error));
        return;
    }

    currentUser = null;
    currentProfile = null;
    activeChatUser = null;

    showView("authView");
}

async function loadApplication(user) {
    currentUser = user;

    await createOrUpdateProfile(
        user,
        user.user_metadata?.username
    );

    await loadProfile();
    await loadLeaderboard();

    safeText(
        "welcomeName",
        currentProfile?.username || user.email || "Игрок"
    );

    showView("menuView");
}

async function checkSession() {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    if (data.session?.user) {
        await loadApplication(data.session.user);
    } else {
        showView("authView");
    }
}

// ======================================================
// PROFILE
// ======================================================

async function loadProfile() {
    if (!currentUser) return;

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single();

    if (error) {
        console.error("Profile:", error);
        return;
    }

    currentProfile = data;

    safeText("profileName", data.username || "Player");
    safeText("profileEmail", currentUser.email || "Email не указан");
    safeText("wins", data.wins ?? 0);
    safeText("losses", data.losses ?? 0);
    safeText("draws", data.draws ?? 0);
    safeText("points", data.points ?? 0);

    const avatar = $("avatar");
    if (avatar) {
        avatar.textContent = (data.username || "P")[0].toUpperCase();
    }

    safeText("accountBadge", data.username || "Игрок");
}

async function updateStatistics(result) {
    if (!currentUser) return;

    const column = {
        win: "wins",
        loss: "losses",
        draw: "draws"
    }[result];

    if (!column) return;

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("wins,losses,draws,points")
        .eq("id", currentUser.id)
        .single();

    if (error) {
        console.error(error);
        return;
    }

    const update = {
        [column]: (data[column] || 0) + 1
    };

    if (result === "win") {
        update.points = (data.points || 0) + 10;
    }

    const { error: updateError } = await supabaseClient
        .from("profiles")
        .update(update)
        .eq("id", currentUser.id);

    if (updateError) {
        console.error(updateError);
        return;
    }

    await loadProfile();
}

// ======================================================
// NAVIGATION
// ======================================================

document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", async () => {
        const target = button.dataset.view;
        showView(target);

        if (target === "profileView") await loadProfile();
        if (target === "leaderboardView") await loadLeaderboard();

        if (target === "roomsView") {
            await loadPublicRooms();
        }

        if (target === "friendsView") {
            await loadFriendRequests();
            await loadFriends();
        }
    });
});

// ======================================================
// LEADERBOARD
// ======================================================

async function loadLeaderboard() {
    const container = $("leaderboard");
    if (!container) return;

    container.textContent = "Загрузка рейтинга...";

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("username,wins,points")
        .order("points", { ascending: false })
        .order("wins", { ascending: false })
        .limit(50);

    if (error) {
        container.textContent = errorText(error);
        return;
    }

    container.innerHTML = "";

    (data || []).forEach((player, index) => {
        const item = document.createElement("div");
        item.className = "leaderboard-item";

        const rank = document.createElement("span");
        rank.textContent = "#" + (index + 1);

        const name = document.createElement("strong");
        name.textContent = player.username || "Player";

        const points = document.createElement("span");
        points.textContent = (player.points || 0) + " очков";

        const wins = document.createElement("span");
        wins.textContent = (player.wins || 0) + " побед";

        item.append(rank, name, points, wins);
        container.appendChild(item);
    });

    if (!data?.length) {
        container.textContent = "Пока нет игроков.";
    }
}

// ======================================================
// ROOMS
// ======================================================

async function loadPublicRooms() {
    const container = $("publicRooms");
    if (!container) return;

    container.textContent = "Загрузка комнат...";

    const { data, error } = await supabaseClient
        .from("game_rooms")
        .select("id,code,game_type,access_type,max_players,status,created_at")
        .eq("access_type", "public")
        .eq("status", "waiting")
        .order("created_at", { ascending: false })
        .limit(30);

    if (error) {
        container.textContent = errorText(error);
        return;
    }

    container.innerHTML = "";

    for (const room of data || []) {
        const { count, error: countError } = await supabaseClient
            .from("game_room_players")
            .select("*", { count: "exact", head: true })
            .eq("room_id", room.id);

        if (countError) console.warn(countError);

        const card = document.createElement("div");
        card.className = "room-card";

        const info = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = GAME_NAMES[room.game_type] || room.game_type;

        const code = document.createElement("p");
        code.textContent = "Код: " + room.code;

        const countText = document.createElement("small");
        countText.textContent =
            `${count || 0} / ${room.max_players} участников`;

        info.append(title, code, countText);

        const join = document.createElement("button");
        join.textContent = "Войти";
        join.addEventListener("click", () => joinRoomByCode(room.code));

        card.append(info, join);
        container.appendChild(card);
    }

    if (!data?.length) {
        container.textContent = "Публичных комнат пока нет.";
    }
}

async function createGameRoom() {
    if (!requireLogin()) return;

    const gameType = $("roomGame")?.value || "chess";
    const accessType = $("roomAccess")?.value || "public";
    const maxPlayers = Number($("roomMaxPlayers")?.value || 12);
    const password = $("roomPassword")?.value || null;

    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 12) {
        showMessage("roomMessage", "Размер комнаты должен быть от 2 до 12.", true);
        return;
    }

    if (accessType === "password" && (!password || password.length < 4)) {
        showMessage("roomMessage", "Пароль должен содержать минимум 4 символа.", true);
        return;
    }

    const button = $("createRoomBtn");
    setButtonLoading(button, true);

    try {
        const { data, error } = await supabaseClient.rpc("create_game_room", {
            p_game_type: gameType,
            p_access_type: accessType,
            p_max_players: maxPlayers,
            p_password: accessType === "password" ? password : null
        });

        if (error) throw error;

        const room = Array.isArray(data) ? data[0] : data;

        if (!room?.room_id) {
            throw new Error("Сервер не вернул ID комнаты.");
        }

        await openRoom(room.room_id);
    } catch (error) {
        showMessage("roomMessage", errorText(error), true);
    } finally {
        setButtonLoading(button, false);
    }
}

async function joinRoomByCode(code) {
    if (!requireLogin()) return;

    const password = $("joinRoomPassword")?.value || null;

    try {
        const { data, error } = await supabaseClient.rpc("join_game_room", {
            p_code: code,
            p_password: password
        });

        if (error) throw error;

        const result = Array.isArray(data) ? data[0] : data;

        if (!result?.room_id) {
            throw new Error("Не удалось войти в комнату.");
        }

        await openRoom(result.room_id);
    } catch (error) {
        showMessage("roomMessage", errorText(error), true);
    }
}

async function joinRoomFromInput() {
    const code = $("joinRoomCode")?.value.trim().toUpperCase();

    if (!code) {
        showMessage("roomMessage", "Введи код комнаты.", true);
        return;
    }

    await joinRoomByCode(code);
}

// ======================================================
// OPEN ROOM AND REALTIME
// ======================================================

async function openRoom(roomId) {
    await leaveCurrentRoom(false);

    const { data, error } = await supabaseClient
        .from("game_rooms")
        .select("*")
        .eq("id", roomId)
        .single();

    if (error) throw error;

    currentRoom = data;

    await refreshRoomData();
    subscribeToRoom();
    showView("roomView");
    renderRoom();
}

async function refreshRoomData() {
    if (!currentRoom) return;

    const roomId = currentRoom.id;

    const [playersResult, movesResult, roomResult] = await Promise.all([
        supabaseClient
            .from("game_room_players")
            .select("user_id,role,seat,joined_at")
            .eq("room_id", roomId)
            .order("seat", { ascending: true }),

        supabaseClient
            .from("game_room_moves")
            .select("*")
            .eq("room_id", roomId)
            .order("move_number", { ascending: true }),

        supabaseClient
            .from("game_rooms")
            .select("*")
            .eq("id", roomId)
            .single()
    ]);

    if (playersResult.error) throw playersResult.error;
    if (movesResult.error) throw movesResult.error;
    if (roomResult.error) throw roomResult.error;

    roomPlayers = playersResult.data || [];
    roomMoves = movesResult.data || [];
    currentRoom = roomResult.data;

    renderRoom();
}

function subscribeToRoom() {
    if (!currentRoom) return;

    if (roomChannel) {
        supabaseClient.removeChannel(roomChannel);
    }

    const roomId = currentRoom.id;

    roomChannel = supabaseClient
        .channel("room-" + roomId)
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "game_rooms",
            filter: `id=eq.${roomId}`
        }, () => refreshRoomData().catch(console.error))
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "game_room_players",
            filter: `room_id=eq.${roomId}`
        }, () => refreshRoomData().catch(console.error))
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "game_room_moves",
            filter: `room_id=eq.${roomId}`
        }, () => refreshRoomData().catch(console.error))
        .subscribe();
}

// ======================================================
// ROOM UI
// ======================================================

function getMyRoomPlayer() {
    return roomPlayers.find(player => player.user_id === currentUser?.id);
}

function renderRoom() {
    if (!currentRoom) return;

    const me = getMyRoomPlayer();

    safeText(
        "roomTitle",
        GAME_NAMES[currentRoom.game_type] || currentRoom.game_type
    );

    safeText("roomCodeDisplay", currentRoom.code);

    safeText("roomStatus", ({
        waiting: "Ожидание игроков",
        playing: "Игра идёт",
        finished: "Игра завершена"
    })[currentRoom.status] || currentRoom.status);

    safeText(
        "myRoomRole",
        me ? (me.role === "player" ? `Игрок, место ${me.seat}` : "Зритель")
            : "Не участник"
    );

    $("startRoomBtn")?.classList.toggle(
        "hidden",
        currentRoom.host_id !== currentUser?.id ||
        currentRoom.status !== "waiting"
    );

    renderRoomPlayers();
    renderCurrentGame();
}

function renderRoomPlayers() {
    const container = $("roomPlayers");
    if (!container) return;

    container.innerHTML = "";

    roomPlayers.forEach(player => {
        const item = document.createElement("div");
        item.className = "player-item";

        const label = document.createElement("span");
        label.textContent = player.role === "player"
            ? `Игрок ${player.seat}`
            : "Зритель";

        const name = document.createElement("small");
        name.textContent = player.user_id === currentUser.id
            ? "Вы"
            : player.user_id.slice(0, 8);

        item.append(label, name);
        container.appendChild(item);
    });
}

async function startRoom() {
    if (!currentRoom) return;

    try {
        const { error } = await supabaseClient.rpc("start_game_room", {
            p_room_id: currentRoom.id
        });

        if (error) throw error;

        await refreshRoomData();
    } catch (error) {
        alert(errorText(error));
    }
}

async function leaveCurrentRoom(showMenu = true) {
    if (roomChannel) {
        await supabaseClient.removeChannel(roomChannel);
        roomChannel = null;
    }

    if (currentRoom && currentUser) {
        const roomId = currentRoom.id;

        currentRoom = null;
        roomPlayers = [];
        roomMoves = [];
        selectedSquare = null;
        selectedChecker = null;

        const { error } = await supabaseClient.rpc("leave_game_room", {
            p_room_id: roomId
        });

        if (error) console.error("Leave room:", error);
    } else {
        currentRoom = null;
    }

    if (showMenu) showView("menuView");
}

// ======================================================
// GAME HELPERS
// ======================================================

function canMakeMove() {
    if (!currentRoom || currentRoom.status !== "playing") return false;

    const me = getMyRoomPlayer();

    return !!me &&
        me.role === "player" &&
        currentRoom.current_turn_user === currentUser.id;
}

async function sendMove(moveData, nextTurnUser) {
    if (!currentRoom || isProcessingMove) return;

    isProcessingMove = true;

    try {
        const { error } = await supabaseClient.rpc("submit_game_move", {
            p_room_id: currentRoom.id,
            p_move_data: moveData,
            p_next_turn_user: nextTurnUser
        });

        if (error) throw error;

        await refreshRoomData();
    } catch (error) {
        alert(errorText(error));
        await refreshRoomData();
    } finally {
        isProcessingMove = false;
    }
}

function renderCurrentGame() {
    if (!currentRoom) return;

    const game = currentRoom.game_type;

    $("chessGame")?.classList.toggle("hidden", game !== "chess");
    $("checkersGame")?.classList.toggle("hidden", game !== "checkers");

    $("otherGame")?.classList.toggle(
        "hidden",
        ![
            "tic_tac_toe",
            "connect_four",
            "battleship",
            "ludo",
            "uno"
        ].includes(game)
    );

    if (game === "chess") renderChess();
    else if (game === "checkers") renderCheckers();
    else renderOtherGame();
}

// ======================================================
// CHESS
// ======================================================

function createChessInstance() {
    if (!window.Chess) {
        showMessage("chessStatus", "Не загружена шахматная библиотека.");
        return null;
    }

    const game = new window.Chess();

    for (const row of roomMoves) {
        const fen = row.move_data?.fen;
        if (!fen) continue;

        try {
            game.load(fen);
        } catch (error) {
            console.warn("Invalid FEN:", error);
        }
    }

    return game;
}

function chessPieceSymbol(piece) {
    const symbols = {
        wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
        bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟"
    };

    return symbols[piece.color + piece.type] || "";
}

function renderChess() {
    chessGame = createChessInstance();
    if (!chessGame) return;

    const board = $("chessBoard");
    if (!board) return;

    board.innerHTML = "";

    const files = "abcdefgh";
    const ranks = "87654321";
    const position = chessGame.board();

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const squareName = files[col] + ranks[row];
            const button = document.createElement("button");

            button.className =
                "chess-square " + ((row + col) % 2 ? "dark" : "light");

            button.dataset.square = squareName;

            const piece = position[row][col];

            if (piece) {
                button.textContent = chessPieceSymbol(piece);
            }

            if (selectedSquare === squareName) {
                button.classList.add("selected");
            }

            button.addEventListener("click", () => {
                handleChessSquare(squareName);
            });

            board.appendChild(button);
        }
    }

    if (chessGame.isCheckmate()) {
        safeText("chessStatus", "Мат! Игра завершена.");
    } else if (chessGame.isDraw()) {
        safeText("chessStatus", "Ничья.");
    } else if (chessGame.in_check()) {
        safeText("chessStatus", "Шах!");
    } else {
        safeText(
            "chessStatus",
            canMakeMove() ? "Ваш ход" : "Ожидание хода соперника"
        );
    }
}

async function handleChessSquare(square) {
    if (!canMakeMove() || isProcessingMove || !chessGame) return;

    if (!selectedSquare) {
        const piece = chessGame.get(square);
        const me = getMyRoomPlayer();
        const myColor = me?.seat === 1 ? "w" : "b";

        if (!piece || piece.color !== myColor) return;

        selectedSquare = square;
        renderChess();
        return;
    }

    if (selectedSquare === square) {
        selectedSquare = null;
        renderChess();
        return;
    }

    const game = chessGame;

    let move;

    try {
        move = game.move({
            from: selectedSquare,
            to: square,
            promotion: "q"
        });
    } catch {
        move = null;
    }

    if (!move) {
        selectedSquare = null;
        renderChess();
        return;
    }

    selectedSquare = null;

    const nextPlayer = roomPlayers.find(player =>
        player.role === "player" &&
        player.user_id !== currentUser.id
    );

    if (!nextPlayer) {
        renderChess();
        return;
    }

    const isOver = game.isGameOver();

    await sendMove({
        san: move.san,
        from: move.from,
        to: move.to,
        fen: game.fen()
    }, nextPlayer.user_id);

    if (isOver) await finishCurrentGame();
}

// ======================================================
// CHECKERS
// ======================================================

const CHECKERS_INITIAL = [
    "b.b.b.b.",
    ".b.b.b.b",
    "b.b.b.b.",
    "........",
    "........",
    ".w.w.w.w",
    "w.w.w.w.",
    ".w.w.w.w"
];

function getCheckersBoard() {
    let board = CHECKERS_INITIAL.map(row => row.split(""));

    for (const move of roomMoves) {
        if (Array.isArray(move.move_data?.board)) {
            board = move.move_data.board.map(row => row.split(""));
        }
    }

    return board;
}

function renderCheckers() {
    const element = $("checkersBoard");
    if (!element) return;

    const board = getCheckersBoard();
    element.innerHTML = "";

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const button = document.createElement("button");

            button.className =
                "checkers-square " + ((row + col) % 2 ? "dark" : "light");

            const piece = board[row][col];

            if (piece === "w") button.textContent = "⚪";
            if (piece === "b") button.textContent = "⚫";

            if (selectedChecker?.row === row &&
                selectedChecker?.col === col) {
                button.classList.add("selected");
            }

            button.addEventListener("click", () => {
                handleCheckersSquare(row, col);
            });

            element.appendChild(button);
        }
    }

    safeText(
        "checkersStatus",
        canMakeMove() ? "Ваш ход" : "Ожидание соперника"
    );
}

async function handleCheckersSquare(row, col) {
    if (!canMakeMove() || isProcessingMove) return;

    const board = getCheckersBoard();
    const me = getMyRoomPlayer();
    const myPiece = me?.seat === 1 ? "w" : "b";

    if (!selectedChecker) {
        if (board[row][col] !== myPiece) return;

        selectedChecker = { row, col };
        renderCheckers();
        safeText("checkersStatus", "Выбери клетку назначения.");
        return;
    }

    const from = selectedChecker;
    selectedChecker = null;

    const dr = row - from.row;
    const dc = col - from.col;

    if (Math.abs(dr) !== 1 || Math.abs(dc) !== 1) {
        renderCheckers();
        return;
    }

    if (board[row][col] !== ".") {
        renderCheckers();
        return;
    }

    const direction = myPiece === "w" ? -1 : 1;

    if (dr !== direction) {
        renderCheckers();
        return;
    }

    board[row][col] = board[from.row][from.col];
    board[from.row][from.col] = ".";

    const nextPlayer = roomPlayers.find(player =>
        player.role === "player" &&
        player.user_id !== currentUser.id
    );

    if (!nextPlayer) return;

    await sendMove({
        board: board.map(line => line.join("")),
        from,
        to: { row, col }
    }, nextPlayer.user_id);
}

// ======================================================
// OTHER GAMES — PLACEHOLDERS
// ======================================================

function renderOtherGame() {
    const names = {
        tic_tac_toe: [
            "Крестики-нолики",
            "Игровое поле будет добавлено отдельно."
        ],
        connect_four: [
            "Четыре в ряд",
            "Игровое поле будет добавлено отдельно."
        ],
        battleship: [
            "Морской бой",
            "Игровое поле будет добавлено отдельно."
        ],
        ludo: [
            "Лудо",
            "Игровое поле будет добавлено отдельно."
        ],
        uno: [
            "UNO",
            "Игровое поле будет добавлено отдельно."
        ]
    };

    const info = names[currentRoom?.game_type] || ["Игра", "Скоро."];

    safeText("otherGameTitle", info[0]);
    safeText("otherGameDescription", info[1]);
}

// ======================================================
// FINISH GAME
// ======================================================

async function finishCurrentGame() {
    if (!currentRoom) return;

    try {
        const { error } = await supabaseClient.rpc("finish_game_room", {
            p_room_id: currentRoom.id,
            p_final_state: {
                reason: "finished",
                game: currentRoom.game_type
            }
        });

        if (error) throw error;

        await refreshRoomData();
    } catch (error) {
        console.error(error);
    }
}

// ======================================================
// COPY ROOM CODE
// ======================================================

async function copyRoomCode() {
    if (!currentRoom) return;

    try {
        await navigator.clipboard.writeText(currentRoom.code);
        showMessage("roomMessage", "Код комнаты скопирован!");
    } catch {
        showMessage("roomMessage", "Не удалось скопировать код.", true);
    }
}

// ======================================================
// FRIENDS
// ======================================================

async function searchFriend() {
    if (!requireLogin()) return;

    const username = $("friendSearch")?.value.trim();

    if (!username) {
        showMessage("friendMessage", "Введи имя пользователя.", true);
        return;
    }

    const container = $("friendSearchResults");
    if (!container) return;

    container.textContent = "Поиск...";

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("id,username")
        .ilike("username", `%${username}%`)
        .limit(10);

    if (error) {
        container.textContent = errorText(error);
        return;
    }

    container.innerHTML = "";

    for (const user of (data || []).filter(u => u.id !== currentUser.id)) {
        const item = document.createElement("div");
        item.className = "friend-item";

        const name = document.createElement("strong");
        name.textContent = user.username;

        const button = document.createElement("button");
        button.textContent = "Добавить";

        button.addEventListener("click", async () => {
            const { error: requestError } = await supabaseClient.rpc(
                "send_friend_request",
                { p_username: user.username }
            );

            if (requestError) {
                showMessage("friendMessage", errorText(requestError), true);
            } else {
                showMessage("friendMessage", "Запрос отправлен.");
                await loadFriendRequests();
            }
        });

        item.append(name, button);
        container.appendChild(item);
    }

    if (!container.children.length) {
        container.textContent = "Пользователи не найдены.";
    }
}

async function loadFriendRequests() {
    if (!currentUser) return;

    const container = $("friendRequests");
    if (!container) return;

    const { data, error } = await supabaseClient
        .from("friend_requests")
        .select("*")
        .eq("addressee_id", currentUser.id)
        .eq("status", "pending");

    if (error) {
        container.textContent = errorText(error);
        return;
    }

    container.innerHTML = "";

    for (const request of data || []) {
        const { data: profile } = await supabaseClient
            .from("profiles")
            .select("username")
            .eq("id", request.requester_id)
            .maybeSingle();

        const item = document.createElement("div");
        item.className = "friend-item";

        const name = document.createElement("strong");
        name.textContent = profile?.username || "Игрок";

        const accept = document.createElement("button");
        accept.textContent = "Принять";
        accept.addEventListener("click", () =>
            respondFriendRequest(request.id, true)
        );

        const reject = document.createElement("button");
        reject.textContent = "Отклонить";
        reject.className = "secondary";
        reject.addEventListener("click", () =>
            respondFriendRequest(request.id, false)
        );

        item.append(name, accept, reject);
        container.appendChild(item);
    }

    if (!data?.length) {
        container.textContent = "Новых запросов нет.";
    }
}

async function respondFriendRequest(requestId, accept) {
    const { error } = await supabaseClient.rpc("respond_friend_request", {
        p_request_id: requestId,
        p_accept: accept
    });

    if (error) {
        showMessage("friendMessage", errorText(error), true);
        return;
    }

    await loadFriendRequests();
    await loadFriends();
}

async function loadFriends() {
    if (!currentUser) return;

    const container = $("friendsList");
    if (!container) return;

    const { data, error } = await supabaseClient
        .from("friend_requests")
        .select("requester_id,addressee_id")
        .eq("status", "accepted")
        .or(
            `requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`
        );

    if (error) {
        container.textContent = errorText(error);
        return;
    }

    const ids = (data || []).map(row =>
        row.requester_id === currentUser.id
            ? row.addressee_id
            : row.requester_id
    );

    container.innerHTML = "";

    if (!ids.length) {
        container.textContent = "Пока нет друзей.";
        return;
    }

    const { data: profiles, error: profileError } = await supabaseClient
        .from("profiles")
        .select("id,username")
        .in("id", ids);

    if (profileError) {
        container.textContent = errorText(profileError);
        return;
    }

    (profiles || []).forEach(friend => {
        const item = document.createElement("div");
        item.className = "friend-item";

        const name = document.createElement("strong");
        name.textContent = friend.username;

        const chat = document.createElement("button");
        chat.textContent = "Написать";
        chat.addEventListener("click", () => {
            showView("friendsView");
            openChat(friend.id, friend.username);
        });

        item.append(name, chat);
        container.appendChild(item);
    });
}

// ======================================================
// DIRECT MESSAGES
// ======================================================

async function openChat(friendId, friendName) {
    if (!requireLogin()) return;

    activeChatUser = friendId;
    safeText("chatPartner", friendName);

    await loadMessages();

    if (messageChannel) {
        await supabaseClient.removeChannel(messageChannel);
    }

    messageChannel = supabaseClient
        .channel("messages-" + currentUser.id)
        .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "direct_messages"
        }, payload => {
            const message = payload.new;

            if (
                message.sender_id === activeChatUser ||
                message.receiver_id === activeChatUser
            ) {
                loadMessages();
            }
        })
        .subscribe();
}

async function loadMessages() {
    if (!activeChatUser || !currentUser) return;

    const container = $("chatMessages");
    if (!container) return;

    const { data, error } = await supabaseClient
        .from("direct_messages")
        .select("*")
        .or(
            `and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatUser}),and(sender_id.eq.${activeChatUser},receiver_id.eq.${currentUser.id})`
        )
        .order("created_at", { ascending: true })
        .limit(100);

    if (error) {
        container.textContent = errorText(error);
        return;
    }

    container.innerHTML = "";

    (data || []).forEach(message => {
        const item = document.createElement("div");

        item.className = message.sender_id === currentUser.id
            ? "message own"
            : "message";

        item.textContent = message.body;
        container.appendChild(item);
    });

    container.scrollTop = container.scrollHeight;
}

async function sendDirectMessage() {
    if (!activeChatUser) {
        showMessage("chatStatus", "Сначала выбери друга.", true);
        return;
    }

    const input = $("chatInput");
    const body = input?.value.trim();

    if (!body) return;

    const { error } = await supabaseClient.rpc("send_direct_message", {
        p_friend_id: activeChatUser,
        p_body: body
    });

    if (error) {
        showMessage("chatStatus", errorText(error), true);
        return;
    }

    input.value = "";
    showMessage("chatStatus", "");
    await loadMessages();
}

// ======================================================
// BACKGROUND SETTINGS
// ======================================================
<h3>Фон сайта</h3>

<label for="bgPhoto">Выбрать фотографию фона:</label>
<input type="file" id="bgPhoto" accept="image/*">

<button id="removeBgPhoto" type="button">
    Убрать фотографию
</button>
function applyBackground() {
    const mode = localStorage.getItem("siteBackgroundMode");
    const image = localStorage.getItem("siteBackgroundImage");
    const color = localStorage.getItem("siteBackgroundColor");

    if (mode === "image" && image) {
        document.body.style.backgroundImage = `url("${image}")`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
        document.body.style.backgroundAttachment = "fixed";
        document.body.style.backgroundRepeat = "no-repeat";
        document.body.style.backgroundColor = "transparent";
    } else {
        document.body.style.backgroundImage = "none";
        document.body.style.backgroundColor = color || DEFAULT_BACKGROUND;
    }
}

function loadSettings() {
    const color = localStorage.getItem("siteBackgroundColor");

    if ($("bgColor")) {
        $("bgColor").value = color || DEFAULT_BACKGROUND;
    }

    applyBackground();

    const image = localStorage.getItem("siteBackgroundImage");

    if (image && $("backgroundPreview")) {
        $("backgroundPreview").src = image;
        $("backgroundPreview").classList.remove("hidden");
    }
}

function saveBackgroundColor() {
    const color = $("bgColor")?.value || DEFAULT_BACKGROUND;

    localStorage.setItem("siteBackgroundColor", color);
    localStorage.setItem("siteBackgroundMode", "color");

    applyBackground();
}

function saveBackgroundImage(file) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        alert("Выбери изображение.");
        return;
    }

    if (file.size > 4 * 1024 * 1024) {
        alert("Размер изображения не должен превышать 4 МБ.");
        return;
    }

    const reader = new FileReader();

    reader.onload = () => {
        try {
            localStorage.setItem("siteBackgroundImage", reader.result);
            localStorage.setItem("siteBackgroundMode", "image");

            applyBackground();

            const preview = $("backgroundPreview");

            if (preview) {
                preview.src = reader.result;
                preview.classList.remove("hidden");
            }

            showMessage("backgroundMessage", "Фон сохранён!");
        } catch {
            showMessage(
                "backgroundMessage",
                "Не удалось сохранить изображение. Попробуй файл поменьше.",
                true
            );
        }
    };

    reader.onerror = () => {
        showMessage("backgroundMessage", "Ошибка чтения файла.", true);
    };

    reader.readAsDataURL(file);
}

function removeBackgroundImage() {
    localStorage.removeItem("siteBackgroundImage");
    localStorage.setItem("siteBackgroundMode", "color");

    applyBackground();

    if ($("backgroundPreview")) {
        $("backgroundPreview").src = "";
        $("backgroundPreview").classList.add("hidden");
    }

    showMessage("backgroundMessage", "Изображение убрано.");
}

function resetBackground() {
    localStorage.removeItem("siteBackgroundImage");
    localStorage.removeItem("siteBackgroundColor");
    localStorage.removeItem("siteBackgroundMode");

    if ($("bgColor")) {
        $("bgColor").value = DEFAULT_BACKGROUND;
    }

    applyBackground();

    if ($("backgroundPreview")) {
        $("backgroundPreview").src = "";
        $("backgroundPreview").classList.add("hidden");
    }

    showMessage("backgroundMessage", "Фон сброшен.");
}

// ======================================================
// EVENT LISTENERS
// ======================================================

$("loginTab")?.addEventListener("click", () => setAuthMode("login"));
$("registerTab")?.addEventListener("click", () => setAuthMode("register"));
$("authSubmit")?.addEventListener("click", handleAuth);
$("logoutBtn")?.addEventListener("click", logout);

$("createRoomBtn")?.addEventListener("click", createGameRoom);
$("joinRoomBtn")?.addEventListener("click", joinRoomFromInput);
$("refreshRoomsBtn")?.addEventListener("click", loadPublicRooms);
$("startRoomBtn")?.addEventListener("click", startRoom);
$("leaveRoomBtn")?.addEventListener("click", () => leaveCurrentRoom(true));
$("copyRoomCodeBtn")?.addEventListener("click", copyRoomCode);

$("searchFriend")?.addEventListener("click", searchFriend);
$("sendMessage")?.addEventListener("click", sendDirectMessage);

$("bgColor")?.addEventListener("input", saveBackgroundColor);

$("bgPhoto")?.addEventListener("change", event => {
    saveBackgroundImage(event.target.files?.[0]);
});

$("removeBackground")?.addEventListener("click", removeBackgroundImage);
$("resetBackground")?.addEventListener("click", resetBackground);

$("roomAccess")?.addEventListener("change", () => {
    const isPassword = $("roomAccess").value === "password";
    $("roomPasswordWrap")?.classList.toggle("hidden", !isPassword);
});

$("password")?.addEventListener("keydown", event => {
    if (event.key === "Enter") handleAuth();
});

$("joinRoomCode")?.addEventListener("keydown", event => {
    if (event.key === "Enter") joinRoomFromInput();
});

$("chatInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") sendDirectMessage();
});

// ======================================================
// INITIALIZATION
// ======================================================

document.addEventListener("DOMContentLoaded", async () => {
    loadSettings();
    setAuthMode("login");

    try {
        await checkSession();
    } catch (error) {
        console.error("Initialization:", error);
        showView("authView");
        showMessage("authMessage", errorText(error), true);
    }
});

