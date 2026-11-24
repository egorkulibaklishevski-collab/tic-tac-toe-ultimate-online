const SUPABASE_URL = "https://hykioljldierzlpdrjgo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SG0GV_0f3uD1a0IRvWCIpw_v4dQYNeA";

const configured = SUPABASE_URL.startsWith("https://")
    && SUPABASE_ANON_KEY.startsWith("sb_publishable_");
function $(id) {
    return document.getElementById(id);
}

if (!window.supabase) {
    console.error("Supabase SDK не загружен! Проверь index.html");
}

const sb = configured && window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
const achievements = [
 ["first_win","Первая победа","Выиграй первый матч"],
 ["board_3","Маленькая победа","Победи на поле 3×3"],
 ["board_5","Тактик","Победи на поле 5×5"],
 ["board_10","Стратег","Победи на поле 10×10"],
 ["board_15","Гигантская победа","Победи на поле 15×15"],
 ["hard_win","Сложный вызов","Победи на Hard или выше"],
 ["top_50","TOP 50","Попади в мировой TOP 50"],
 ["champion","Чемпион","Займи первое место в рейтинге"],
 ["giga_champion","Гига чемпион","Победи на всех картах и всех сложностях робота"]
];
let unlocked = JSON.parse(localStorage.getItem("ttt_achievements") || "[]");
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
function show(id) {
 document.querySelectorAll("main section").forEach(s=>s.classList.add("hidden"));
 $(id).classList.remove("hidden");
}
function message(id,text){$(id).textContent=text||""}
function targetFor(n){return n===3?3:n===5?4:n===10?5:7}
function updateAccount(){
 $("accountBadge").textContent=user ? (profile?.username || user.email) : "Гость";
 $("welcomeName").textContent=profile?.username || "Игрок";
 $("avatar").textContent=(profile?.username||"T")[0].toUpperCase();
}
function guest(){user=null;profile=null;updateAccount();show("menuView")}
let authMode = "login";

function setAuthMode(mode) {
    authMode = mode;

    $("loginTab").classList.toggle("active", mode === "login");
    $("registerTab").classList.toggle("active", mode === "register");

    $("usernameLabel").classList.toggle("hidden", mode !== "register");

    $("authSubmit").textContent =
        mode === "login" ? "Войти" : "Создать аккаунт";

    message("authMessage", "");
}

$("loginTab").onclick = function() {
    setAuthMode("login");
};

$("registerTab").onclick = function() {
    setAuthMode("register");
};

setAuthMode("login");$("guestBtn").onclick=guest;

async function loadProfile(){
 if(!sb||!user)return;
 const {data,error}=await sb.from("profiles").select("*").eq("id",user.id).maybeSingle();
 if(error){console.error(error);return}
 profile=data;
 updateAccount();
 $("profileName").textContent=profile?.username||"Игрок";
 $("profileEmail").textContent=user.email||"";
 $("profileAvatar").textContent=(profile?.username||"T")[0].toUpperCase();
 $("wins").textContent=profile?.wins||0;
 $("losses").textContent=profile?.losses||0;
 $("draws").textContent=profile?.draws||0;
 $("points").textContent=profile?.points||0;
}
$("authSubmit").onclick=async()=>{
 if(!sb){message("authMessage","Сначала настрой Supabase по инструкции в README.");return}
 const email=$("email").value.trim(), password=$("password").value;
 if(!email||password.length<6){message("authMessage","Введи email и пароль минимум из 6 символов.");return}
 $("authSubmit").disabled=true;
 if(authMode==="register"){
  const username=$("username").value.trim();
  if(username.length<3){message("authMessage","Никнейм должен содержать минимум 3 символа.");$("authSubmit").disabled=false;return}
  const {error}=await sb.auth.signUp({email,password,options:{data:{username}}});
  message("authMessage",error?error.message:"Аккаунт создан! Если включено подтверждение email, проверь почту.");
 }else{
  const {error}=await sb.auth.signInWithPassword({email,password});
  message("authMessage",error?error.message:"Вход выполнен!");
 }
 $("authSubmit").disabled=false;
};
$("logoutBtn").onclick=async()=>{if(sb)await sb.auth.signOut();user=null;profile=null;updateAccount();show("authView")};

document.querySelectorAll("[data-home]").forEach(b=>b.onclick=()=>{if(onlineChannel){sb.removeChannel(onlineChannel);onlineChannel=null}show("menuView")});
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{show(b.dataset.view);if(b.dataset.view==="leaderboardView")loadLeaderboard();if(b.dataset.view==="achievementsView")renderAchievements()});

function makeBoard(n){return Array(n*n).fill("")}
function hasWin(board,n,symbol,target){
 const dirs=[[1,0],[0,1],[1,1],[1,-1]];
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  if(board[y*n+x]!==symbol)continue;
  for(const [dx,dy] of dirs){
   let count=0;
   for(let k=0;k<target;k++){
    const xx=x+dx*k,yy=y+dy*k;
    if(xx<0||yy<0||xx>=n||yy>=n||board[yy*n+xx]!==symbol)break;
    count++;
   }
   if(count>=target)return true;
  }
 }
 return false;
}
function renderBoard(container,board,n,clickable){
 container.style.gridTemplateColumns=`repeat(${n}, minmax(${n>10?22:34}px,1fr))`;
 container.innerHTML="";
 board.forEach((v,i)=>{
  const b=document.createElement("button");b.className="cell "+(v==="X"?"x":v==="O"?"o":"");
  b.textContent=v;b.disabled=!!v||!clickable;b.onclick=()=>clickable(i);
  container.appendChild(b);
 });
}
function botPick(board,n,target,difficulty){
 const empty=[];board.forEach((v,i)=>{if(!v)empty.push(i)});
 if(!empty.length)return -1;
 // Находим немедленную победу или блок.
 for(const mark of ["O","X"])for(const i of empty){
  board[i]=mark;const win=hasWin(board,n,mark,target);board[i]="";
  if(win)return i;
 }
 if(difficulty==="Easy"&&Math.random()<.65)return empty[Math.floor(Math.random()*empty.length)];
 let best=-Infinity, choices=[];
 for(const i of empty){
  const x=i%n,y=Math.floor(i/n);let score=0;
  for(let yy=Math.max(0,y-2);yy<=Math.min(n-1,y+2);yy++)
   for(let xx=Math.max(0,x-2);xx<=Math.min(n-1,x+2);xx++){
    const v=board[yy*n+xx];if(v==="O")score+=4;if(v==="X")score+=3;
   }
  const c=(n-1)/2;score-=((x-c)**2+(y-c)**2)*.025;
  const noise={Easy:8,Medium:4,Hard:1.5,"Very Hard":.6,Impossible:.2,"Mega Impossible":.05}[difficulty]??1;
  score+=Math.random()*noise;
  if(score>best){best=score;choices=[i]}else if(score===best)choices.push(i);
 }
 return choices[Math.floor(Math.random()*choices.length)];
}
function startBot(){
 currentSize=Number($("botSize").value);currentTarget=targetFor(currentSize);botDifficulty=$("botDifficulty").value;
 currentBoard=makeBoard(currentSize);
 $("gameTitle").textContent=`${currentSize}×${currentSize} · ${botDifficulty}`;
 $("gameStatus").textContent=`Ты — X · нужно ${currentTarget} в ряд`;
 show("gameView");renderBoard($("board"),currentBoard,currentSize,botClick);
}
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

    renderBoard($("board"), currentBoard, currentSize, botClick);
}

$("startBot").onclick = startBot;
$("restartBot").onclick = startBot;

function botClick(i) {
    if (botBusy || botGameOver) return;
    if (currentBoard[i]) return;

    botBusy = true;

    currentBoard[i] = "X";

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

        if (move >= 0) {
            currentBoard[move] = "O";
        }

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
 currentBoard[i]="X";renderBoard($("board"),currentBoard,currentSize,botClick);
 if(hasWin(currentBoard,currentSize,"X",currentTarget)){finishBot("win");return}
 if(currentBoard.every(Boolean)){finishBot("draw");return}
 $("gameStatus").textContent="Бот думает…";
 setTimeout(()=>{
  const move=botPick(currentBoard,currentSize,currentTarget,botDifficulty);
  if(move>=0)currentBoard[move]="O";
  renderBoard($("board"),currentBoard,currentSize,botClick);
  if(hasWin(currentBoard,currentSize,"O",currentTarget)){finishBot("loss");return}
  if(currentBoard.every(Boolean)){finishBot("draw");return}
  $("gameStatus").textContent="Твой ход";
 },850);
}
async function finishBot(result){
 $("gameStatus").textContent=result==="win"?"🏆 Победа!":result==="loss"?"Бот победил!":"Ничья!";
 document.querySelectorAll("#board .cell").forEach(b=>b.disabled=true);
 if(result==="win"){
  const key={3:"board_3",5:"board_5",10:"board_10",15:"board_15"}[currentSize];
  unlock("first_win");unlock(key);
  if(["Hard","Very Hard","Impossible","Mega Impossible"].includes(botDifficulty))unlock("hard_win");
 }
 if(user&&sb){
  const field=result==="win"?"wins":result==="loss"?"losses":"draws";
  const newValue=(profile?.[field]||0)+1;
  const points=(profile?.points||0)+(result==="win"?10:result==="draw"?2:0);
  const {error}=await sb.from("profiles").update({[field]:newValue,points}).eq("id",user.id);
  if(!error)await loadProfile();
 }
}
function unlock(key){if(key&&!unlocked.includes(key)){unlocked.push(key);localStorage.setItem("ttt_achievements",JSON.stringify(unlocked))}}
function renderAchievements(){
 const box=$("achievements");box.innerHTML="";
 achievements.forEach(([id,title,desc])=>{
  const row=document.createElement("div");row.className="list-row";
  row.innerHTML=`<div><b>${unlocked.includes(id)?"🏅":"🔒"} ${title}</b><br><small>${desc}</small></div><span>${unlocked.includes(id)?"Получено":"Закрыто"}</span>`;
  box.appendChild(row);
 });
}

async function loadLeaderboard(){
 const box=$("leaderboard");box.innerHTML="<p class='muted'>Загрузка рейтинга…</p>";
 if(!sb){box.textContent="Подключи Supabase, чтобы увидеть мировой рейтинг.";return}
 const {data,error}=await sb.from("profiles").select("username,wins,points").order("points",{ascending:false}).order("wins",{ascending:false}).limit(50);
 if(error){box.textContent=error.message;return}
 box.innerHTML="";
 (data||[]).forEach((p,i)=>{
  const row=document.createElement("div");row.className="list-row";
  row.innerHTML=`<b>#${i+1} ${escapeHtml(p.username)}</b><span>${p.points||0} очков · ${p.wins||0} побед</span>`;
  box.appendChild(row);
 });
 if(user&&data?.[0]?.id===user.id)unlock("champion");
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

async function createParty(){
 if(!sb||!user){message("onlineMessage","Для онлайн-игры настрой Supabase и войди в аккаунт.");return}
 message("onlineMessage","Создаём комнату…");
 const n=Number($("partySize").value);
 const {data,error}=await sb.rpc("create_party",{p_size:n});
 if(error){message("onlineMessage",error.message);return}
 await openParty(data);
}
async function joinParty(){
 if(!sb||!user){message("onlineMessage","Сначала войди в аккаунт.");return}
 const code=$("partyCode").value.trim().toUpperCase();
 if(!code){message("onlineMessage","Введи код комнаты.");return}
 message("onlineMessage","Подключаемся…");
 const {data,error}=await sb.rpc("join_party",{p_code:code});
 if(error){message("onlineMessage",error.message);return}
 await openParty(data);
}
$("createParty").onclick=createParty;
$("joinParty").onclick=joinParty;

async function openParty(partyId){
 const {data,error}=await sb.from("parties").select("*").eq("id",partyId).single();
 if(error){message("onlineMessage",error.message);return}
 onlineParty=data;
 const {data:members}=await sb.from("party_members").select("*").eq("party_id",partyId).order("joined_at");
 mySymbol=members?.find(m=>m.user_id===user.id)?.symbol||null;
 $("roomCodeLabel").textContent=data.code;
 show("onlineGameView");
 await refreshParty();
 if(onlineChannel)sb.removeChannel(onlineChannel);
 onlineChannel=sb.channel("party-"+partyId).on("postgres_changes",{event:"UPDATE",schema:"public",table:"parties",filter:"id=eq."+partyId},payload=>{
  onlineParty=payload.new;refreshParty();
 }).subscribe();
}
async function refreshParty(){
 if(!onlineParty)return;
 const {data:members}=await sb.from("party_members").select("*").eq("party_id",onlineParty.id);
 const names=members?.map(m=>m.symbol+" · "+m.user_id.slice(0,6)).join("  |  ")||"";
 $("onlineStatus").textContent=onlineParty.status==="waiting"?"Ожидание второго игрока…":onlineParty.status==="finished"?(onlineParty.winner_id===user.id?"Ты победил!":"Матч завершён"):`Ты ${mySymbol||"?"} · ${onlineParty.current_turn===user.id?"Твой ход":"Ход соперника"} · ${names}`;
 const n=onlineParty.board_size;
 const board=Array.isArray(onlineParty.board)?onlineParty.board:Array(n*n).fill("");
 renderBoard($("onlineBoard"),board,n,onlineParty.status==="playing"&&onlineParty.current_turn===user.id?onlineClick:null);
}
async function onlineClick(index){
 const {error}=await sb.rpc("make_party_move",{p_party:onlineParty.id,p_index:index});
 if(error)message("onlineStatus",error.message);
}
if(configured){
 sb.auth.getSession().then(async({data})=>{
  if(data.session){user=data.session.user;await loadProfile();updateAccount();show("menuView")}
 });
 sb.auth.onAuthStateChange(async(event,session)=>{
  user=session?.user||null;
  if(user){await loadProfile();updateAccount();show("menuView")}
  else if(event==="SIGNED_OUT"){profile=null;updateAccount();show("authView")}
 });
}else{
 setAuthMode("login");
}

const savedColor=localStorage.getItem("ttt_bg")||"#111827";
document.body.style.background=savedColor;$("bgColor").value=savedColor;
$("bgColor").oninput=e=>{document.body.style.background=e.target.value;localStorage.setItem("ttt_bg",e.target.value);$("noBackground").checked=false};
$("noBackground").onchange=e=>{document.body.style.background=e.target.checked?"#000000":(localStorage.getItem("ttt_bg")||"#111827")};
$("bgPhoto").onchange=e=>{
 const file=e.target.files[0];if(!file)return;
 const reader=new FileReader();reader.onload=()=>{document.body.style.backgroundImage=`url(${reader.result})`;document.body.style.backgroundSize="cover";localStorage.setItem("ttt_photo",reader.result)};reader.readAsDataURL(file);
};
$("resetBackground").onclick=()=>{document.body.style.background="#111827";document.body.style.backgroundImage="";localStorage.removeItem("ttt_bg");localStorage.removeItem("ttt_photo");$("bgColor").value="#111827";$("noBackground").checked=false};
const savedPhoto=localStorage.getItem("ttt_photo");if(savedPhoto)document.body.style.backgroundImage=`url(${savedPhoto})`,document.body.style.backgroundSize="cover";
