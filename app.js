
// ==========================================
// TIC-TAC-TOE ULTIMATE ONLINE
// APP.JS
// ==========================================

// ==========================================
// SUPABASE
// ==========================================

const SUPABASE_URL = "https://hykioljldierzlpdrjgo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SG0GV_0f3uD1a0IRvWCIpw_v4dQYNeA";

const configured =
    SUPABASE_URL.startsWith("https://") &&
    SUPABASE_ANON_KEY.startsWith("sb_publishable_");

const supabase = configured
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;


// ==========================================
// HELPERS
// ==========================================

const $ = id => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let authMode = "login";

function message(id, text) {
    const element = $(id);
    if (element) element.textContent = text;
}

function showView(viewId) {
    document.querySelectorAll(".view").forEach(view => {
        view.classList.add("hidden");
    });

    const target = $(viewId);

    if (target) {
        target.classList.remove("hidden");
    }
}

function safeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}


// ==========================================
// NAVIGATION
// ==========================================

const navigation = {
    playBtn: "roomsView",
    botBtn: "botView",
    roomsBtn: "roomsView",
    leaderboardBtn: "leaderboardView",
    profileBtn: "profileView",
    friendsBtn: "friendsView",
    achievementsBtn: "achievementsView",
    settingsBtn: "settingsView",
    botBackBtn: "menuView",
    roomsBackBtn: "menuView",
    leaderboardBackBtn: "menuView",
    profileBackBtn: "menuView",
    friendsBackBtn: "menuView",
    achievementsBackBtn: "menuView",
    settingsBackBtn: "menuView",
    profileAchievementsBtn: "achievementsView"
};

Object.entries(navigation).forEach(([buttonId, viewId]) => {
    const button = $(buttonId);

    if (button) {
        button.addEventListener("click", () => {
            showView(viewId);

            if (viewId === "leaderboardView") {
                loadLeaderboard();
            }

            if (viewId === "achievementsView") {
                renderAchievements();
            }
        });
    }
});


// ==========================================
// AUTH MODE
// ==========================================

function setAuthMode(mode) {
    authMode = mode;

    $("loginTab")?.classList.toggle("active", mode === "login");
    $("registerTab")?.classList.toggle("active", mode === "register");

    const username = $("username");

    if (username) {
        username.classList.toggle("hidden", mode !== "register");
    }

    const submit = $("authSubmit");

    if (submit) {
        submit.textContent = mode === "login" ? "Войти" : "Создать аккаунт";
    }

    message("authMessage", "");
}

$("loginTab")?.addEventListener("click", () => setAuthMode("login"));
$("registerTab")?.addEventListener("click", () => setAuthMode("register"));


// ==========================================
// AUTHENTICATION
// ==========================================

async function handleAuth() {
    if (!supabase) {
        message("authMessage", "Ошибка настройки Supabase.");
        return;
    }

    const email = $("email")?.value.trim();
    const password = $("password")?.value;
    const username = $("username")?.value.trim();

    if (!email || !password) {
        message("authMessage", "Заполни email и пароль.");
        return;
    }

    if (authMode === "register" && !username) {
        message("authMessage", "Введи имя пользователя.");
        return;
    }

    message("authMessage", "Подождите...");

    try {
        if (authMode === "register") {
            const { data, error } = await supabase.auth.signUp({
                email,
                password
            });

            if (error) throw error;

            if (data.user) {
                const { error: profileError } = await supabase
                    .from("profiles")
                    .upsert({
                        id: data.user.id,
                        username,
                        wins: 0,
                        losses: 0,
                        draws: 0,
                        points: 0,
                        achievements: []
                    });

                if (profileError) throw profileError;
            }

            message(
                "authMessage",
                "Регистрация выполнена. Если требуется подтверждение email, проверь почту."
            );

        } else {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            await loadCurrentUser();
        }

    } catch (error) {
        message("authMessage", error.message);
    }
}

$("authSubmit")?.addEventListener("click", handleAuth);


// ==========================================
// CURRENT USER
// ==========================================

async function loadCurrentUser() {
    if (!supabase) return;

    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
        showView("authView");
        return;
    }

    currentUser = data.user;

    await loadProfile();

    showView("menuView");
}

async function loadProfile() {
    if (!currentUser) return;

    const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (error) {
        console.error("Profile error:", error);
        return;
    }

    currentProfile = data;

    if (!currentProfile) {
        const { data: created, error: createError } = await supabase
            .from("profiles")
            .insert({
                id: currentUser.id,
                username: currentUser.email?.split("@")[0] || "Игрок",
                wins: 0,
                losses: 0,
                draws: 0,
                points: 0,
                achievements: []
            })
            .select()
            .single();

        if (createError) {
            console.error(createError);
            return;
        }

        currentProfile = created;
    }

    updateProfileUI();
}


// ==========================================
// PROFILE UI
// ==========================================

function updateProfileUI() {
    if (!currentProfile) return;

    const username =
        currentProfile.username ||
        currentUser?.email?.split("@")[0] ||
        "Игрок";

    if ($("welcomeName")) $("welcomeName").textContent = username;
    if ($("profileName")) $("profileName").textContent = username;

    if ($("profileWins")) $("profileWins").textContent = currentProfile.wins ?? 0;
    if ($("profileLosses")) $("profileLosses").textContent = currentProfile.losses ?? 0;
    if ($("profileDraws")) $("profileDraws").textContent = currentProfile.draws ?? 0;
    if ($("profilePoints")) $("profilePoints").textContent = currentProfile.points ?? 0;

    renderAchievements();
}


// ==========================================
// LEADERBOARD
// ==========================================

async function loadLeaderboard() {
    const body = $("leaderboardBody");

    if (!body) return;

    body.innerHTML = `
        <tr>
            <td colspan="7">Загрузка...</td>
        </tr>
    `;

    if (!supabase) {
        body.innerHTML = `
            <tr><td colspan="7">Supabase не настроен</td></tr>
        `;
        return;
    }

    const { data, error } = await supabase
        .from("profiles")
        .select("id, username, wins, points, achievements")
        .order("points", { ascending: false })
        .order("wins", { ascending: false })
        .limit(50);

    if (error) {
        console.error(error);

        body.innerHTML = `
            <tr><td colspan="7">Не удалось загрузить рейтинг</td></tr>
        `;
        return;
    }

    body.innerHTML = "";

    if (!data || data.length === 0) {
        body.innerHTML = `
            <tr><td colspan="7">Пока нет игроков</td></tr>
        `;
        return;
    }

    data.forEach((player, index) => {
        const achievements = Array.isArray(player.achievements)
            ? player.achievements
            : [];

        const bestAchievement = achievements.length
            ? achievements[0]
            : "Пока нет";

        const row = document.createElement("tr");

        const values = [
            index + 1,
            player.username || "Игрок",
            player.wins ?? 0,
            player.points ?? 0,
            bestAchievement,
            "—",
            "—"
        ];

        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        body.appendChild(row);
    });
}


// ==========================================
// ACHIEVEMENTS
// ==========================================

const ACHIEVEMENTS = [
    {
        id: "first_win",
        icon: "🏆",
        name: "Первая победа",
        description: "Одержи первую победу.",
        check: profile => (profile.wins || 0) >= 1
    },
    {
        id: "five_wins",
        icon: "🔥",
        name: "Пять побед",
        description: "Одержи пять побед.",
        check: profile => (profile.wins || 0) >= 5
    },
    {
        id: "ten_wins",
        icon: "⭐",
        name: "Опытный игрок",
        description: "Одержи десять побед.",
        check: profile => (profile.wins || 0) >= 10
    },
    {
        id: "twenty_five_wins",
        icon: "👑",
        name: "Чемпион",
        description: "Одержи двадцать пять побед.",
        check: profile => (profile.wins || 0) >= 25
    },
    {
        id: "hundred_points",
        icon: "💎",
        name: "Сотня очков",
        description: "Набери сто очков.",
        check: profile => (profile.points || 0) >= 100
    },
    {
        id: "ten_draws",
        icon: "🤝",
        name: "Мирный игрок",
        description: "Сыграй десять ничьих.",
        check: profile => (profile.draws || 0) >= 10
    }
];

function renderAchievements() {
    const container = $("achievementsList");

    if (!container || !currentProfile) return;

    const earned = Array.isArray(currentProfile.achievements)
        ? currentProfile.achievements
        : [];

    const completed = ACHIEVEMENTS.filter(achievement =>
        earned.includes(achievement.id) ||
        achievement.check(currentProfile)
    );

    if ($("achievementsStats")) {
        $("achievementsStats").textContent =
            `Открыто достижений: ${completed.length} / ${ACHIEVEMENTS.length}`;
    }

    container.innerHTML = "";

    ACHIEVEMENTS.forEach(achievement => {
        const unlocked =
            earned.includes(achievement.id) ||
            achievement.check(currentProfile);

        const card = document.createElement("div");

        card.className = unlocked
            ? "achievement-card unlocked"
            : "achievement-card locked";

        card.innerHTML = `
            <span>${achievement.icon}</span>
            <h3>${safeText(achievement.name)}</h3>
            <p>${safeText(achievement.description)}</p>
            <strong>${unlocked ? "Получено ✓" : "Не получено 🔒"}</strong>
        `;

        container.appendChild(card);
    });
}


// ==========================================
// SAVE ACHIEVEMENTS
// ==========================================

async function checkAchievements() {
    if (!currentProfile || !currentUser) return;

    const previous = Array.isArray(currentProfile.achievements)
        ? currentProfile.achievements
        : [];

    const unlocked = ACHIEVEMENTS
        .filter(achievement => achievement.check(currentProfile))
        .map(achievement => achievement.id);

    const combined = [...new Set([...previous, ...unlocked])];

    if (combined.length === previous.length) return;

    const { error } = await supabase
        .from("profiles")
        .update({ achievements: combined })
        .eq("id", currentUser.id);

    if (error) {
        console.error("Achievement save error:", error);
        return;
    }

    currentProfile.achievements = combined;
    renderAchievements();
}


// ==========================================
// BACKGROUND LIBRARY
// ==========================================

const BACKGROUNDS = {
    gradient1: "linear-gradient(135deg, #080b2b, #38246b, #101827)",
    gradient2: "linear-gradient(135deg, #071c24, #00a6a6, #15213d)",
    gradient3: "linear-gradient(135deg, #001d3d, #005f8f, #101827)",
    gradient4: "linear-gradient(135deg, #4b1942, #d65a31, #17152d)",
    gradient5: "linear-gradient(135deg, #101827, #080b12, #202b40)"
};

function applyBackground(value, isPhoto = false) {
    if (isPhoto) {
        document.body.style.background = "";
        document.body.style.backgroundImage = `url("${value}")`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
        document.body.style.backgroundRepeat = "no-repeat";
        document.body.style.backgroundAttachment = "fixed";
    } else {
        document.body.style.backgroundImage = value;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundAttachment = "fixed";
    }
}

function saveBackground(type, value) {
    localStorage.setItem("backgroundType", type);
    localStorage.setItem("backgroundValue", value);
}

function restoreBackground() {
    const type = localStorage.getItem("backgroundType");
    const value = localStorage.getItem("backgroundValue");

    if (!type || !value) return;

    if (type === "photo") {
        applyBackground(value, true);
    } else if (type === "gradient" && BACKGROUNDS[value]) {
        applyBackground(BACKGROUNDS[value]);
    } else if (type === "color") {
        document.body.style.backgroundImage = "";
        document.body.style.background = value;
    }
}


// ==========================================
// BACKGROUND LIBRARY BUTTONS
// ==========================================

document.querySelectorAll(".background-option").forEach(button => {
    button.addEventListener("click", () => {
        const name = button.dataset.background;

        if (!BACKGROUNDS[name]) return;

        applyBackground(BACKGROUNDS[name]);
        saveBackground("gradient", name);
    });
});


// ==========================================
// CUSTOM BACKGROUND PHOTO
// ==========================================

const bgPhotoInput = $("bgPhoto");
const removeBgPhotoButton = $("removeBgPhoto");

if (bgPhotoInput) {
    bgPhotoInput.addEventListener("change", () => {
        const file = bgPhotoInput.files?.[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Выбери изображение!");
            return;
        }

        if (file.size > 3 * 1024 * 1024) {
            alert("Фото слишком большое. Максимальный размер — 3 МБ.");
            bgPhotoInput.value = "";
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            const photo = reader.result;

            try {
                localStorage.setItem("backgroundPhoto", photo);
                saveBackground("photo", photo);
                applyBackground(photo, true);

                const preview = $("backgroundPreview");

                if (preview) {
                    preview.style.backgroundImage = `url("${photo}")`;
                    preview.style.backgroundSize = "cover";
                    preview.textContent = "";
                }

            } catch (error) {
                alert("Не удалось сохранить фото. Попробуй изображение поменьше.");
            }
        };

        reader.readAsDataURL(file);
    });
}


// ==========================================
// REMOVE BACKGROUND PHOTO
// ==========================================

if (removeBgPhotoButton) {
    removeBgPhotoButton.addEventListener("click", () => {
        localStorage.removeItem("backgroundPhoto");
        localStorage.removeItem("backgroundType");
        localStorage.removeItem("backgroundValue");

        document.body.style.backgroundImage = "";
        document.body.style.backgroundColor = "#101827";

        const preview = $("backgroundPreview");

        if (preview) {
            preview.style.backgroundImage = "";
            preview.textContent = "Предпросмотр фона";
        }
    });
}


// ==========================================
// BACKGROUND COLOR
// ==========================================

$("saveBackgroundColor")?.addEventListener("click", () => {
    const color = $("backgroundColor")?.value;

    if (!color) return;

    document.body.style.backgroundImage = "";
    document.body.style.background = color;

    saveBackground("color", color);
});

$("resetBackground")?.addEventListener("click", () => {
    localStorage.removeItem("backgroundPhoto");
    localStorage.removeItem("backgroundType");
    localStorage.removeItem("backgroundValue");

    document.body.style.backgroundImage = "";
    document.body.style.backgroundColor = "#101827";

    if ($("backgroundColor")) {
        $("backgroundColor").value = "#101827";
    }

    if ($("backgroundPreview")) {
        $("backgroundPreview").style.backgroundImage = "";
        $("backgroundPreview").textContent = "Предпросмотр фона";
    }
});


// ==========================================
// SIMPLE BOT PLACEHOLDER
// ==========================================

$("startBot")?.addEventListener("click", () => {
    const game = $("botGame");

    if (!game) return;

    game.innerHTML = `
        <h2>Крестики-нолики</h2>
        <p>Игровая логика бота пока не подключена.</p>
    `;
});


// ==========================================
// SIGN OUT
// ==========================================

async function signOut() {
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();

    if (error) {
        alert(error.message);
        return;
    }

    currentUser = null;
    currentProfile = null;

    showView("authView");
}


// ==========================================
// AUTH STATE
// ==========================================

async function initializeApp() {
    restoreBackground();

    if (!supabase) {
        showView("authView");
        message("authMessage", "Проверь настройки Supabase.");
        return;
    }

    const { data } = await supabase.auth.getSession();

    if (data.session) {
        await loadCurrentUser();
    } else {
        showView("authView");
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_IN" && session) {
            currentUser = session.user;
            await loadProfile();
            showView("menuView");
        }

        if (event === "SIGNED_OUT") {
            currentUser = null;
            currentProfile = null;
            showView("authView");
        }
    });
}


// ==========================================
// START
// ==========================================

initializeApp();
