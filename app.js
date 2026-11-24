
"use strict";

// ======================================================
// TIC-TAC-TOE ULTIMATE ONLINE
// Main application
// ======================================================

const SUPABASE_URL = "https://hykioljldierzlpdrjgo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SG0GV_0f3uD1a0IRvWCIpw_v4dQYNeA";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let currentRoom = null;
let roomChannel = null;
let roomPlayers = [];
let roomMoves = [];
let chessGame = null;
let selectedSquare = null;
let localTttBoard = Array(9).fill("");
let localTttTurn = "X";
let isProcessingMove = false;

const GAME_NAMES = {
    chess: "Шахматы",
    checkers: "Шашки",
    tic_tac_toe: "Крестики-нолики",
    connect_four: "Четыре в ряд",
    battleship: "Морской бой",
    ludo: "Лудо",
    uno: "UNO"
};

// ======================================================
// GENERAL HELPERS
// ======================================================

function showMessage(id, message, isError = false) {
    const element = $(id);
    if (!element) return;

    element.textContent = message;
    element.classList.toggle("error", isError);
    element.classList.toggle("success", !isError && Boolean(message));
}

function showView(viewId) {
    document.querySelectorAll(".view").forEach(view => {
        view.classList.add("hidden");
    });

    const view = $(viewId);
    if (view) view.classList.remove("hidden");
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

function getErrorMessage(error) {
    return error?.message || "Произошла неизвестная ошибка";
}

function setButtonLoading(button, loading, text = "Загрузка...") {
    if (!button) return;

    if (loading) {
        button.dataset.oldText = button.textContent;
        button.disabled = true;
        button.textContent = text;
    } else {
        button.disabled = false;
        button.textContent = button.dataset.oldText || button.textContent;
    }
}

function requireLogin() {
    if (!currentUser) {
        showView("authView");
        showMessage("authMessage", "Сначала войдите в аккаунт", true);
        return false;
    }
    return true;
}

// ======================================================
// AUTHENTICATION
// ======================================================

let authMode = "login";

function setAuthMode(mode) {
    authMode = mode;

    $("loginTab")?.classList.toggle("active", mode === "login");
    $("registerTab")?.classList.toggle("active", mode === "register");

    $("usernameLabel")?.classList.toggle("hidden", mode !== "register");
    $("username")?.classList.toggle("hidden", mode !== "register");

    if ($("authSubmit")) {
        $("authSubmit").textContent =
            mode === "login" ? "Войти" : "Создать аккаунт";
    }

    showMessage("authMessage", "");
}

async function handleAuth() {
    const email = $("email")?.value.trim();
    const password = $("password")?.value || "";
    const username = $("username")?.value.trim();

    if (!email || !password) {
        showMessage("authMessage", "Введите email и пароль", true);
        return;
    }

    if (password.length < 6) {
        showMessage("authMessage", "Пароль должен содержать минимум 6 символов", true);
        return;
    }

    const button = $("authSubmit");
    setButtonLoading(button, true);

    try {
        if (authMode === "register") {
            if (!username || username.length < 3 || username.length > 25) {
                throw new Error("Имя пользователя должно содержать от 3 до 25 символов");
            }

            if (!/^[a-zA-Z0-9_]+$/.test(username)) {
                throw new Error("Используй только латинские буквы, цифры и _");
            }

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
                    "Аккаунт создан. Проверь почту для подтверждения входа."
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
        showMessage("authMessage", getErrorMessage(error), true);
    } finally {
        setButtonLoading(button, false);
    }
}

async function createOrUpdateProfile(user, username) {
    const profileUsername =
        username ||
        user.user_metadata?.username ||
        user.email?.split("@")[0] ||
        "Player";

    const { error } = await supabaseClient
        .from("profiles")
        .upsert({
            id: user.id,
            username: profileUsername
        }, {
            onConflict: "id"
        });

    if (error) throw error;
}

async function logout() {
    await leaveCurrentRoom(false);

    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        alert(getErrorMessage(error));
        return;
    }

    currentUser = null;
    currentProfile = null;
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

    $("welcomeName").textContent =
        currentProfile?.username || user.email || "Игрок";

    showView("menuView");
}

async function checkSession() {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
        console.error(error);
        showView("authView");
        return;
    }

    if (data.session?.user) {
        await loadApplication(data.session.user);
    } else {
        showView("authView");
    }
}

// ======================================================
// PROFILE AND STATISTICS
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

    if ($("profileName")) {
        $("profileName").textContent = data.username || "Player";
    }

    if ($("profileEmail")) {
        $("profileEmail").textContent = currentUser.email || "Email не указан";
    }

    if ($("wins")) $("wins").textContent = data.wins ?? 0;
    if ($("losses")) $("losses").textContent = data.losses ?? 0;
    if ($("draws")) $("draws").textContent = data.draws ?? 0;
    if ($("points")) $("points").textContent = data.points ?? 0;

    if ($("avatar")) {
        $("avatar").textContent =
            (data.username || "P").charAt(0).toUpperCase();
    }
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
        .select("wins, losses, draws, points")
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
    button.addEventListener("click", () => {
        const target = button.dataset.view;
        showView(target);

        if (target === "profileView") loadProfile();
        if (target === "leaderboardView") loadLeaderboard();
        if (target === "roomsView") loadPublicRooms();
    });
});

// ======================================================
// LEADERBOARD
// ======================================================

async function loadLeaderboard() {
    const container = $("leaderboard");
    if (!container) return;

    container.innerHTML = "<p>Загрузка рейтинга...</p>";

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("username, wins, points")
        .order("points", { ascending: false })
        .order("wins", { ascending: false })
        .limit(50);

    if (error) {
        container.textContent = getErrorMessage(error);
        return;
    }

    container.innerHTML = "";

    (data || []).forEach((player, index) => {
        const item = document.createElement("div");
        item.className = "leaderboard-item";
        item.innerHTML = `
            <span class="rank">#${index + 1}</span>
            <strong>${escapeHTML(player.username)}</strong>
            <span>${player.points || 0} очков</span>
            <span>${player.wins || 0} побед</span>
        `;
        container.appendChild(item);
    });

    if (!data?.length) {
        container.textContent = "Пока нет игроков в рейтинге";
    }
}

// ======================================================
// PUBLIC GAME ROOMS
// ======================================================

async function loadPublicRooms() {
    const container = $("publicRooms");
    if (!container) return;

    container.innerHTML = "<p>Загрузка комнат...</p>";

    const { data, error } = await supabaseClient
        .from("game_rooms")
        .select("id, code, game_type, access_type, max_players, status, created_at")
        .eq("access_type", "public")
        .eq("status", "waiting")
        .order("created_at", { ascending: false })
        .limit(30);

    if (error) {
        container.textContent = getErrorMessage(error);
        return;
    }

    container.innerHTML = "";

    for (const room of data || []) {
        const { count } = await supabaseClient
            .from("game_room_players")
            .select("*", { count: "exact", head: true })
            .eq("room_id", room.id);

        const card = document.createElement("div");
        card.className = "room-card";

        card.innerHTML = `
            <div>
                <strong>${escapeHTML(GAME_NAMES[room.game_type] || room.game_type)}</strong>
                <p>Код: ${escapeHTML(room.code)}</p>
                <small>${count || 0} / ${room.max_players} участников</small>
            </div>
            <button class="join-public-btn">Войти</button>
        `;

        card.querySelector("button").addEventListener("click", () => {
            joinRoomByCode(room.code);
        });

        container.appendChild(card);
    }

    if (!data?.length) {
        container.textContent = "Публичных комнат пока нет";
    }
}

// ======================================================
// CREATE GAME ROOM
// ======================================================

async function createGameRoom() {
    if (!requireLogin()) return;

    const gameType = $("roomGame")?.value || "chess";
    const accessType = $("roomAccess")?.value || "public";
    const maxPlayers = Number($("roomMaxPlayers")?.value || 12);
    const password = $("roomPassword")?.value || null;

    if (accessType === "password" && (!password || password.length < 4)) {
        showMessage("roomMessage", "Пароль должен содержать минимум 4 символа", true);
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
            throw new Error("Сервер не вернул данные комнаты");
        }

        await openRoom(room.room_id);
    } catch (error) {
        showMessage("roomMessage", getErrorMessage(error), true);
    } finally {
        setButtonLoading(button, false);
    }
}

// ======================================================
// JOIN ROOM
// ======================================================

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
            throw new Error("Не удалось войти в комнату");
        }

        await openRoom(result.room_id);
    } catch (error) {
        showMessage("roomMessage", getErrorMessage(error), true);
    }
}

async function joinRoomFromInput() {
    const code = $("joinRoomCode")?.value.trim().toUpperCase();

    if (!code) {
        showMessage("roomMessage", "Введи код комнаты", true);
        return;
    }

    await joinRoomByCode(code);
}

// ======================================================
// OPEN ROOM
// ======================================================

async function openRoom(roomId) {
    await leaveCurrentRoom(false);

    const { data: room, error } = await supabaseClient
        .from("game_rooms")
        .select("*")
        .eq("id", roomId)
        .single();

    if (error) throw error;

    currentRoom = room;

    await refreshRoomData();
    subscribeToRoom();

    showView("roomView");
    renderRoom();
}

async function refreshRoomData() {
    if (!currentRoom) return;

    const [playersResult, movesResult, roomResult] = await Promise.all([
        supabaseClient
            .from("game_room_players")
            .select("user_id, role, seat, joined_at")
            .eq("room_id", currentRoom.id)
            .order("seat", { ascending: true }),

        supabaseClient
            .from("game_room_moves")
            .select("*")
            .eq("room_id", currentRoom.id)
            .order("move_number", { ascending: true }),

        supabaseClient
            .from("game_rooms")
            .select("*")
            .eq("id", currentRoom.id)
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

    roomChannel = supabaseClient
        .channel("room-" + currentRoom.id)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "game_rooms",
                filter: `id=eq.${currentRoom.id}`
            },
            async () => {
                await refreshRoomData();
            }
        )
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "game_room_players",
                filter: `room_id=eq.${currentRoom.id}`
            },
            async () => {
                await refreshRoomData();
            }
        )
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "game_room_moves",
                filter: `room_id=eq.${currentRoom.id}`
            },
            async () => {
                await refreshRoomData();
            }
        )
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

    const myPlayer = getMyRoomPlayer();

    $("roomTitle").textContent =
        GAME_NAMES[currentRoom.game_type] || currentRoom.game_type;

    $("roomCodeDisplay").textContent = currentRoom.code;

    $("roomStatus").textContent = {
        waiting: "Ожидание игроков",
        playing: "Игра идёт",
        finished: "Игра завершена"
    }[currentRoom.status] || currentRoom.status;

    $("myRoomRole").textContent = myPlayer
        ? myPlayer.role === "player"
            ? `Игрок, место ${myPlayer.seat}`
            : "Зритель"
        : "Не участник";

    $("startRoomBtn").classList.toggle(
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

        const label = player.role === "player"
            ? `Игрок ${player.seat}`
            : "Зритель";

        item.innerHTML = `
            <span>${escapeHTML(label)}</span>
            <small>${player.user_id === currentUser.id ? "Вы" : player.user_id.slice(0, 8)}</small>
        `;

        container.appendChild(item);
    });
}

// ======================================================
// START ROOM
// ======================================================

async function startRoom() {
    if (!currentRoom) return;

    try {
        const { error } = await supabaseClient.rpc("start_game_room", {
            p_room_id: currentRoom.id
        });

        if (error) throw error;

        await refreshRoomData();
    } catch (error) {
        alert(getErrorMessage(error));
    }
}

// ======================================================
// LEAVE ROOM
// ======================================================

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
// GAME STATE HELPERS
// ======================================================

function getGameMoveData() {
    if (!currentRoom) return null;

    if (currentRoom.game_type === "chess") {
        return { fen: chessGame?.fen() || null };
    }

    return {};
}

function getNextPlayer() {
    const players = roomPlayers
        .filter(player => player.role === "player")
        .sort((a, b) => a.seat - b.seat);

    if (players.length < 2) return null;

    const currentIndex = players.findIndex(
        player => player.user_id === currentUser.id
    );

    return players.find(player => player.user_id !== currentUser.id)?.user_id || null;
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
        alert(getErrorMessage(error));
        await refreshRoomData();
    } finally {
        isProcessingMove = false;
    }
}

// ======================================================
// CURRENT GAME
// ======================================================

function renderCurrentGame() {
    if (!currentRoom) return;

    const game = currentRoom.game_type;

    $("chessGame").classList.toggle("hidden", game !== "chess");
    $("checkersGame").classList.toggle("hidden", game !== "checkers");
    $("otherGame").classList.toggle(
        "hidden",
        !["tic_tac_toe", "connect_four", "battleship", "ludo", "uno"].includes(game)
    );

    if (game === "chess") {
        renderChess();
    } else if (game === "checkers") {
        renderCheckers();
    } else {
        renderOtherGame();
    }
}

function canMakeMove() {
    if (!currentRoom || currentRoom.status !== "playing") return false;

    const me = getMyRoomPlayer();
    if (!me || me.role !== "player") return false;

    return currentRoom.current_turn_user === currentUser.id;
}

// ======================================================
// CHESS
// ======================================================

function createChessInstance() {
    if (!window.Chess) {
        alert("Не загрузилась шахматная библиотека. Проверь подключение к интернету.");
        return null;
    }

    const game = new window.Chess();

    for (const row of roomMoves) {
        const fen = row.move_data?.fen;

        if (fen) {
            try {
                game.load(fen);
            } catch (error) {
                console.warn("Invalid chess FEN:", error);
            }
        }
    }

    return game;
}

function renderChess() {
    chessGame = createChessInstance();
    if (!chessGame) return;

    const board = $("chessBoard");
    board.innerHTML = "";

    const files = "abcdefgh";
    const ranks = "87654321";

    const fenBoard = chessGame.board();

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement("button");
            const squareName = files[col] + ranks[row];

            square.className =
                "chess-square " + ((row + col) % 2 ? "dark" : "light");

            square.dataset.square = squareName;

            const piece = fenBoard[row][col];

            if (piece) {
                square.textContent = chessPieceSymbol(piece);
            }

            if (selectedSquare === squareName) {
                square.classList.add("selected");
            }

            square.addEventListener("click", () => {
                handleChessSquare(squareName);
            });

            board.appendChild(square);
        }
    }

    const status = $("chessStatus");

    if (chessGame.isCheckmate()) {
        status.textContent = "Мат! Игра завершена.";
    } else if (chessGame.isDraw()) {
        status.textContent = "Ничья.";
    } else if (chessGame.in_check()) {
        status.textContent = "Шах!";
    } else {
        status.textContent = canMakeMove()
            ? "Ваш ход"
            : "Ожидание хода соперника";
    }
}

function chessPieceSymbol(piece) {
    const symbols = {
        wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
        bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟"
    };

    return symbols[piece.color + piece.type] || "";
}

async function handleChessSquare(square) {
    if (!canMakeMove() || isProcessingMove) return;

    if (!selectedSquare) {
        const piece = chessGame.get(square);

        if (!piece) return;

        const myColor = roomPlayers
            .find(player => player.user_id === currentUser.id)?.seat === 1
            ? "w" : "b";

        if (piece.color !== myColor) return;

        selectedSquare = square;
        renderChess();
        return;
    }

    if (selectedSquare === square) {
        selectedSquare = null;
        renderChess();
        return;
    }

    try {
        const move = chessGame.move({
            from: selectedSquare,
            to: square,
            promotion: "q"
        });

        selectedSquare = null;

        if (!move) {
            renderChess();
            return;
        }

        const nextPlayer = roomPlayers.find(
            player =>
                player.role === "player" &&
                player.user_id !== currentUser.id
        );

        if (!nextPlayer) {
            renderChess();
            return;
        }

        await sendMove(
            {
                san: move.san,
                from: move.from,
                to: move.to,
                fen: chessGame.fen()
            },
            nextPlayer.user_id
        );

        if (chessGame.isGameOver()) {
            await finishCurrentGame();
        }
    } catch (error) {
        console.error(error);
        selectedSquare = null;
        renderChess();
    }
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
        if (move.move_data?.board) {
            board = move.move_data.board.map(row => row.split(""));
        }
    }

    return board;
}

function renderCheckers() {
    const boardElement = $("checkersBoard");
    const board = getCheckersBoard();

    boardElement.innerHTML = "";

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const cell = document.createElement("button");
            cell.className =
                "checkers-square " + ((row + col) % 2 ? "dark" : "light");

            const piece = board[row][col];

            if (piece === "w") cell.textContent = "⚪";
            if (piece === "b") cell.textContent = "⚫";

            cell.addEventListener("click", () => {
                handleCheckersSquare(row, col);
            });

            boardElement.appendChild(cell);
        }
    }

    $("checkersStatus").textContent = canMakeMove()
        ? "Ваш ход"
        : "Ожидание соперника";
}

let selectedChecker = null;

async function handleCheckersSquare(row, col) {
    if (!canMakeMove() || isProcessingMove) return;

    const board = getCheckersBoard();
    const me = getMyRoomPlayer();
    const myPiece = me.seat === 1 ? "w" : "b";

    if (!selectedChecker) {
        if (board[row][col] !== myPiece) return;

        selectedChecker = { row, col };
        $("checkersStatus").textContent = "Выбрана шашка. Выбери клетку назначения.";
        return;
    }

    const from = selectedChecker;
    selectedChecker = null;

    const dr = row - from.row;
    const dc = col - from.col;

    if (Math.abs(dc) !== 1 || Math.abs(dr) !== 1) {
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

    const nextPlayer = roomPlayers.find(
        player => player.role === "player" && player.user_id !== currentUser.id
    );

    if (!nextPlayer) return;

    await sendMove(
        {
            board: board.map(row => row.join("")),
            from,
            to: { row, col }
        },
        nextPlayer.user_id
    );
}

// ======================================================
// OTHER GAME PLACEHOLDERS
// ======================================================

function renderOtherGame() {
    const title = $("otherGameTitle");
    const description = $("otherGameDescription");

    const names = {
        tic_tac_toe: ["Крестики-нолики", "Игровое поле появится в следующем обновлении."],
        connect_four: ["Четыре в ряд", "Игровое поле появится в следующем обновлении."],
        battleship: ["Морской бой", "Игровое поле появится в следующем обновлении."],
        ludo: ["Лудо", "Игровое поле появится в следующем обновлении."],
        uno: ["UNO", "Игровое поле появится в следующем обновлении."]
    };

    const info = names[currentRoom.game_type] || ["Игра", "Скоро."];
    title.textContent = info[0];
    description.textContent = info[1];
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
        showMessage("roomMessage", "Не удалось скопировать код", true);
    }
}

// ======================================================
// FRIENDS
// Uses the SQL functions from the user's latest schema.
// ======================================================

async function searchFriend() {
    if (!requireLogin()) return;

    const username = $("friendSearch")?.value.trim();

    if (!username) {
        showMessage("friendMessage", "Введи имя пользователя", true);
        return;
    }

    const container = $("friendSearchResults");
    container.innerHTML = "<p>Поиск...</p>";

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("id, username")
        .ilike("username", `%${username}%`)
        .limit(10);

    if (error) {
        container.textContent = getErrorMessage(error);
        return;
    }

    container.innerHTML = "";

    (data || [])
        .filter(user => user.id !== currentUser.id)
        .forEach(user => {
            const item = document.createElement("div");
            item.className = "friend-item";

            item.innerHTML = `
                <strong>${escapeHTML(user.username)}</strong>
                <button>Добавить</button>
            `;

            item.querySelector("button").addEventListener("click", async () => {
                const { error: requestError } = await supabaseClient.rpc(
                    "send_friend_request",
                    { p_username: user.username }
                );

                if (requestError) {
                    showMessage("friendMessage", getErrorMessage(requestError), true);
                } else {
                    showMessage("friendMessage", "Запрос отправлен");
                    loadFriendRequests();
                }
            });

            container.appendChild(item);
        });

    if (!container.children.length) {
        container.textContent = "Пользователи не найдены";
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
        container.textContent = getErrorMessage(error);
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

        item.innerHTML = `
            <strong>${escapeHTML(profile?.username || "Игрок")}</strong>
            <button class="accept">Принять</button>
            <button class="reject secondary">Отклонить</button>
        `;

        item.querySelector(".accept").addEventListener("click", () =>
            respondFriendRequest(request.id, true)
        );

        item.querySelector(".reject").addEventListener("click", () =>
            respondFriendRequest(request.id, false)
        );

        container.appendChild(item);
    }

    if (!data?.length) {
        container.textContent = "Новых запросов нет";
    }
}

async function respondFriendRequest(requestId, accept) {
    const { error } = await supabaseClient.rpc("respond_friend_request", {
        p_request_id: requestId,
        p_accept: accept
    });

    if (error) {
        showMessage("friendMessage", getErrorMessage(error), true);
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
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`);

    if (error) {
        container.textContent = getErrorMessage(error);
        return;
    }

    container.innerHTML = "";

    const friendIds = (data || []).map(row =>
        row.requester_id === currentUser.id
            ? row.addressee_id
            : row.requester_id
    );

    if (!friendIds.length) {
        container.textContent = "Пока нет друзей";
        return;
    }

    const { data: profiles } = await supabaseClient
        .from("profiles")
        .select("id, username")
        .in("id", friendIds);

    (profiles || []).forEach(friend => {
        const item = document.createElement("div");
        item.className = "friend-item";
        item.innerHTML = `<strong>${escapeHTML(friend.username)}</strong>`;
        container.appendChild(item);
    });
}

// ======================================================
// DIRECT MESSAGES
// ======================================================

let activeChatUser = null;
let messageChannel = null;

async function openChat(friendId, friendName) {
    if (!requireLogin()) return;

    activeChatUser = friendId;
    $("chatPartner").textContent = friendName;

    await loadMessages();

    if (messageChannel) {
        await supabaseClient.removeChannel(messageChannel);
    }

    messageChannel = supabaseClient
        .channel("messages-" + currentUser.id)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "direct_messages"
            },
            payload => {
                const message = payload.new;

                if (
                    message.sender_id === activeChatUser ||
                    message.receiver_id === activeChatUser
                ) {
                    loadMessages();
                }
            }
        )
        .subscribe();
}

async function loadMessages() {
    if (!activeChatUser || !currentUser) return;

    const container = $("chatMessages");

    const { data, error } = await supabaseClient
        .from("direct_messages")
        .select("*")
        .or(
            `and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatUser}),and(sender_id.eq.${activeChatUser},receiver_id.eq.${currentUser.id})`
        )
        .order("created_at", { ascending: true })
        .limit(100);

    if (error) {
        container.textContent = getErrorMessage(error);
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
        showMessage("chatStatus", "Сначала выбери друга", true);
        return;
    }

    const body = $("chatInput")?.value.trim();

    if (!body) return;

    const { error } = await supabaseClient.rpc("send_direct_message", {
        p_friend_id: activeChatUser,
        p_body: body
    });

    if (error) {
        showMessage("chatStatus", getErrorMessage(error), true);
        return;
    }

    $("chatInput").value = "";
    await loadMessages();
}

// ======================================================
// SETTINGS
// ======================================================

function loadSettings() {
    const savedColor = localStorage.getItem("siteBackgroundColor");

    if (savedColor) {
        document.body.style.background = savedColor;
        if ($("bgColor")) $("bgColor").value = savedColor;
    }
}

function saveBackgroundColor() {
    const color = $("bgColor")?.value || "#101827";

    document.body.style.background = color;
    localStorage.setItem("siteBackgroundColor", color);
}

function resetBackground() {
    document.body.style.background = "";
    localStorage.removeItem("siteBackgroundColor");

    if ($("bgColor")) $("bgColor").value = "#101827";
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
$("resetBackground")?.addEventListener("click", resetBackground);

$("roomAccess")?.addEventListener("change", () => {
    const isPassword = $("roomAccess").value === "password";
    $("roomPasswordWrap")?.classList.toggle("hidden", !isPassword);
});

// Enter key support.
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
        console.error(error);
        showView("authView");
    }
});

