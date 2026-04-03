const GRID_SIZE = 20;
const BASE_SPEED = 220;
const SPEED_STEP = 6;
const MIN_SPEED = 92;
const SCORE_PER_FOOD = 10;
const STORAGE_KEY = "neon_snake_data";

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const COLORS = {
  background: "#04101e",
  gridLine: "rgba(159, 179, 200, 0.08)",
  snakeHead: "#58e6ff",
  snakeBody: "#12b5d5",
  snakeTail: "#0b6c84",
  food: "#ff5ec8",
  foodGlow: "rgba(255, 94, 200, 0.46)",
  particleA: "#58e6ff",
  particleB: "#4bf0bd",
};

const $ = (selector) => document.querySelector(selector);

const dom = {
  loginPage: $("#login-page"),
  gamePage: $("#game-page"),
  usernameInput: $("#username-input"),
  loginBtn: $("#login-btn"),
  guestBtn: $("#guest-btn"),
  playerAvatar: $("#player-avatar"),
  playerName: $("#player-name"),
  loginTime: $("#login-time"),
  hudBar: document.querySelector(".hud-bar"),
  currentScore: $("#current-score"),
  snakeLength: $("#snake-length"),
  gameSpeed: $("#game-speed"),
  bestScore: $("#best-score"),
  canvas: $("#game-canvas"),
  touchSurface: $("#touch-surface"),
  touchControls: document.querySelector(".touch-controls"),
  overlay: $("#overlay"),
  overlayTitle: $("#overlay-title"),
  overlayMessage: $("#overlay-message"),
  overlayBtn: $("#overlay-btn"),
  pauseBtn: $("#pause-btn"),
  pauseLabel: $("#pause-label"),
  restartBtn: $("#restart-btn"),
  logoutBtn: $("#logout-btn"),
  dpadButtons: Array.from(document.querySelectorAll(".dpad-btn")),
};

const ctx = dom.canvas.getContext("2d");

let currentUser = null;
let loginTimestamp = null;
let gameState = "idle";
let snake = [];
let food = null;
let score = 0;
let bestScoreValue = 0;
let speed = BASE_SPEED;
let gameLoop = null;
let particles = [];
let foodPulse = 0;
let currentDirection = "right";
let pendingDirection = null;
let turnLocked = false;
let boardSize = 480;
let cellSize = boardSize / GRID_SIZE;
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
let resizeFrame = null;
let animFrame = null;

const dpadFlashTimers = new WeakMap();

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { users: {} };
  } catch {
    return { users: {} };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function ensureUserRecord(data, username) {
  if (!data.users[username]) {
    data.users[username] = {
      bestScore: 0,
      totalGames: 0,
      totalFood: 0,
      loginHistory: [],
      gameHistory: [],
    };
  }

  return data.users[username];
}

function getUserData(username) {
  const data = loadData();
  const userData = ensureUserRecord(data, username);
  saveData(data);
  return userData;
}

function updateUserData(username, updater) {
  const data = loadData();
  const userData = ensureUserRecord(data, username);
  updater(userData);
  saveData(data);
}

function avatarTextFor(name) {
  const value = (name || "").trim();
  return value ? value.slice(0, 1).toUpperCase() : "S";
}

function handleGuestLogin() {
  const guestId = `游客${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  dom.usernameInput.value = guestId;
  dom.loginBtn.disabled = false;
  handleLogin();
}

function handleLogin() {
  const username = dom.usernameInput.value.trim();
  if (!username) {
    return;
  }

  currentUser = username;
  loginTimestamp = Date.now();

  updateUserData(username, (userData) => {
    userData.loginHistory.push({
      timestamp: loginTimestamp,
      iso: new Date(loginTimestamp).toISOString(),
    });

    if (userData.loginHistory.length > 50) {
      userData.loginHistory = userData.loginHistory.slice(-50);
    }
  });

  dom.loginPage.classList.remove("active");
  dom.gamePage.classList.add("active");
  dom.playerName.textContent = username;
  dom.playerAvatar.textContent = avatarTextFor(username);
  dom.loginTime.textContent = `登录于 ${formatTime(loginTimestamp)}`;

  refreshStats();
  resetGame();
  showReadyOverlay();

  requestAnimationFrame(() => {
    resizeCanvas();
    render();
  });
}

function handleLogout() {
  stopGameLoop();
  gameState = "idle";
  currentUser = null;
  loginTimestamp = null;
  snake = [];
  food = null;
  particles = [];
  pendingDirection = null;
  turnLocked = false;
  bestScoreValue = 0;

  dom.gamePage.classList.remove("active");
  dom.loginPage.classList.add("active");
  dom.usernameInput.value = "";
  dom.loginBtn.disabled = true;
  dom.usernameInput.focus();
}

function showOverlay(title, message, buttonText) {
  dom.overlayTitle.textContent = title;
  dom.overlayMessage.innerHTML = message;
  dom.overlayBtn.querySelector("span").textContent = buttonText;
  dom.overlay.classList.add("active");
}

function hideOverlay() {
  dom.overlay.classList.remove("active");
}

function showReadyOverlay() {
  showOverlay(
    "准备开玩",
    "手机端使用下方按键操作。桌面端也支持键盘方向键和 WASD。",
    "开始游戏",
  );
}

function resetGame() {
  stopGameLoop();

  const startX = Math.floor(GRID_SIZE / 2) - 1;
  const startY = Math.floor(GRID_SIZE / 2);

  snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY },
  ];

  score = 0;
  speed = BASE_SPEED;
  particles = [];
  foodPulse = 0;
  currentDirection = "right";
  pendingDirection = null;
  turnLocked = false;
  gameState = "idle";

  spawnFood();
  updateHud();
  resizeCanvas();
  render();
}

function startGame() {
  if (!currentUser) {
    return;
  }

  if (gameState === "playing") {
    return;
  }

  gameState = "playing";
  hideOverlay();
  updateHud();
  restartGameLoop();
}

function pauseGame() {
  if (gameState !== "playing") {
    return;
  }

  gameState = "paused";
  stopGameLoop();
  updateHud();
  showOverlay(
    "已暂停",
    "点击继续按钮，或按空格键恢复。",
    "继续游戏",
  );
}

function resumeGame() {
  if (gameState !== "paused") {
    return;
  }

  gameState = "playing";
  hideOverlay();
  updateHud();
  restartGameLoop();
}

function restartGameLoop() {
  stopGameLoop();
  gameLoop = window.setInterval(gameTick, speed);
}

function stopGameLoop() {
  if (gameLoop) {
    window.clearInterval(gameLoop);
    gameLoop = null;
  }
}

function spawnFood() {
  const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
  const freeCells = [];

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (!occupied.has(`${x},${y}`)) {
        freeCells.push({ x, y });
      }
    }
  }

  if (freeCells.length === 0) {
    endGame(true);
    return;
  }

  food = freeCells[Math.floor(Math.random() * freeCells.length)];
}

function requestDirection(nextKey) {
  if (!DIRECTIONS[nextKey] || gameState !== "playing") {
    return false;
  }

  if (nextKey === currentDirection || OPPOSITE[currentDirection] === nextKey) {
    return false;
  }

  if (turnLocked) {
    return false;
  }

  pendingDirection = nextKey;
  turnLocked = true;
  flashDirectionButton(nextKey);
  return true;
}

function gameTick() {
  if (pendingDirection) {
    currentDirection = pendingDirection;
    pendingDirection = null;
  }

  turnLocked = false;

  const vector = DIRECTIONS[currentDirection];
  const head = snake[0];
  const nextHead = {
    x: head.x + vector.x,
    y: head.y + vector.y,
  };

  if (
    nextHead.x < 0 ||
    nextHead.x >= GRID_SIZE ||
    nextHead.y < 0 ||
    nextHead.y >= GRID_SIZE
  ) {
    endGame(false);
    return;
  }

  const willEat = Boolean(food) && nextHead.x === food.x && nextHead.y === food.y;
  const collisionLimit = willEat ? snake.length : snake.length - 1;

  for (let index = 0; index < collisionLimit; index += 1) {
    const segment = snake[index];
    if (segment.x === nextHead.x && segment.y === nextHead.y) {
      endGame(false);
      return;
    }
  }

  snake.unshift(nextHead);

  if (willEat) {
    score += SCORE_PER_FOOD;
    createParticles(food.x, food.y);
    showScorePopup(food.x, food.y, `+${SCORE_PER_FOOD}`);
    speed = Math.max(MIN_SPEED, speed - SPEED_STEP);
    spawnFood();
    if (gameState === "playing") {
      restartGameLoop();
    }
  } else {
    snake.pop();
  }

  updateHud();
  render();
}

function endGame(isWin) {
  gameState = "gameover";
  stopGameLoop();

  if (currentUser) {
    updateUserData(currentUser, (userData) => {
      userData.totalGames += 1;
      userData.totalFood += Math.floor(score / SCORE_PER_FOOD);
      userData.bestScore = Math.max(userData.bestScore, score);
      userData.gameHistory.push({
        score,
        length: snake.length,
        timestamp: Date.now(),
      });

      if (userData.gameHistory.length > 100) {
        userData.gameHistory = userData.gameHistory.slice(-100);
      }
    });
  }

  refreshStats();
  bestScoreValue = Math.max(bestScoreValue, score);
  updateHud();

  const title = isWin ? "满屏通关" : "撞上了";
  const message = isWin
    ? `你已经吃满整个棋盘，最终得分 <strong>${score}</strong>。`
    : `本局得分 <strong>${score}</strong>，蛇身长度 <strong>${snake.length}</strong>。`;

  showOverlay(title, message, "再来一局");
}

function updateHud() {
  dom.currentScore.textContent = String(score);
  dom.snakeLength.textContent = String(snake.length);

  const speedLevel = Math.round((BASE_SPEED - speed) / SPEED_STEP) + 1;
  dom.gameSpeed.textContent = `${speedLevel}x`;
  dom.bestScore.textContent = String(Math.max(bestScoreValue, score));
  dom.pauseLabel.textContent = gameState === "playing" ? "暂停" : "继续";
}

function refreshStats() {
  if (!currentUser) {
    dom.bestScore.textContent = "0";
    bestScoreValue = 0;
    return;
  }

  const userData = getUserData(currentUser);
  bestScoreValue = userData.bestScore || 0;
  dom.bestScore.textContent = String(bestScoreValue);
}

function resizeCanvas() {
  if (window.innerWidth <= 640) {
    const shellPadding = 16;
    const availableWidth = Math.min(
      (dom.touchSurface.parentElement?.clientWidth || window.innerWidth) - shellPadding,
      720,
    );
    const headerHeight = dom.hudBar?.getBoundingClientRect().height || 0;
    const controlsHeight = dom.touchControls?.getBoundingClientRect().height || 0;
    const viewportBudget = window.innerHeight - headerHeight - controlsHeight - 20;
    const mobileSize = Math.min(availableWidth, Math.max(260, Math.floor(viewportBudget)));
    dom.touchSurface.style.width = `${mobileSize}px`;
  } else {
    dom.touchSurface.style.width = "";
  }

  const rect = dom.canvas.getBoundingClientRect();
  const nextSize = Math.max(260, Math.floor(Math.min(rect.width || 480, rect.height || rect.width || 480)));
  const nextRatio = Math.min(window.devicePixelRatio || 1, 2);

  if (nextSize === boardSize && nextRatio === pixelRatio) {
    return;
  }

  boardSize = nextSize;
  cellSize = boardSize / GRID_SIZE;
  pixelRatio = nextRatio;

  dom.canvas.width = Math.round(boardSize * pixelRatio);
  dom.canvas.height = Math.round(boardSize * pixelRatio);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  render();
}

function scheduleResize() {
  if (resizeFrame) {
    cancelAnimationFrame(resizeFrame);
  }

  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    resizeCanvas();
  });
}

function render() {
  ctx.clearRect(0, 0, boardSize, boardSize);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, boardSize, boardSize);

  drawGrid();
  updateParticles();
  drawParticles();
  drawFood();
  drawSnake();

  foodPulse += 0.08;
}

function drawGrid() {
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;

  for (let index = 0; index <= GRID_SIZE; index += 1) {
    const position = Math.round(index * cellSize);

    ctx.beginPath();
    ctx.moveTo(position, 0);
    ctx.lineTo(position, boardSize);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, position);
    ctx.lineTo(boardSize, position);
    ctx.stroke();
  }
}

function drawSnake() {
  snake.forEach((segment, index) => {
    const x = segment.x * cellSize;
    const y = segment.y * cellSize;
    const inset = Math.max(1.2, cellSize * 0.08);
    const size = cellSize - inset * 2;
    const radius = Math.max(4, cellSize * 0.22);

    if (index === 0) {
      ctx.shadowColor = COLORS.snakeHead;
      ctx.shadowBlur = cellSize * 0.7;
      ctx.fillStyle = COLORS.snakeHead;
      roundRect(ctx, x + inset, y + inset, size, size, radius);
      ctx.fill();
      ctx.shadowBlur = 0;
      drawEyes(segment);
      return;
    }

    const mix = index / Math.max(snake.length - 1, 1);
    const fill = mixColor(COLORS.snakeBody, COLORS.snakeTail, mix);
    ctx.fillStyle = fill;
    roundRect(ctx, x + inset, y + inset, size, size, Math.max(3, radius - 1));
    ctx.fill();
  });
}

function drawEyes(head) {
  const centerX = head.x * cellSize + cellSize / 2;
  const centerY = head.y * cellSize + cellSize / 2;
  const offset = cellSize * 0.18;
  const eyeSize = Math.max(2.1, cellSize * 0.11);

  let firstEye;
  let secondEye;

  if (currentDirection === "right") {
    firstEye = { x: centerX + offset, y: centerY - offset };
    secondEye = { x: centerX + offset, y: centerY + offset };
  } else if (currentDirection === "left") {
    firstEye = { x: centerX - offset, y: centerY - offset };
    secondEye = { x: centerX - offset, y: centerY + offset };
  } else if (currentDirection === "up") {
    firstEye = { x: centerX - offset, y: centerY - offset };
    secondEye = { x: centerX + offset, y: centerY - offset };
  } else {
    firstEye = { x: centerX - offset, y: centerY + offset };
    secondEye = { x: centerX + offset, y: centerY + offset };
  }

  ctx.fillStyle = "#03131f";
  ctx.beginPath();
  ctx.arc(firstEye.x, firstEye.y, eyeSize, 0, Math.PI * 2);
  ctx.arc(secondEye.x, secondEye.y, eyeSize, 0, Math.PI * 2);
  ctx.fill();
}

function drawFood() {
  if (!food) {
    return;
  }

  const centerX = food.x * cellSize + cellSize / 2;
  const centerY = food.y * cellSize + cellSize / 2;
  const pulse = Math.sin(foodPulse) * (cellSize * 0.06);
  const radius = cellSize * 0.28 + pulse;

  ctx.shadowColor = COLORS.foodGlow;
  ctx.shadowBlur = cellSize * 0.9;
  ctx.fillStyle = COLORS.food;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  const highlight = ctx.createRadialGradient(
    centerX - radius * 0.4,
    centerY - radius * 0.5,
    1,
    centerX,
    centerY,
    radius,
  );
  highlight.addColorStop(0, "rgba(255,255,255,0.4)");
  highlight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = highlight;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
}

function createParticles(gridX, gridY) {
  const centerX = gridX * cellSize + cellSize / 2;
  const centerY = gridY * cellSize + cellSize / 2;

  for (let index = 0; index < 14; index += 1) {
    const angle = (Math.PI * 2 * index) / 14 + Math.random() * 0.25;
    const velocity = 1.2 + Math.random() * 2.4;
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: 1,
      decay: 0.028 + Math.random() * 0.02,
      size: 2 + Math.random() * 2.5,
      color: Math.random() > 0.45 ? COLORS.particleA : COLORS.particleB,
    });
  }
}

function updateParticles() {
  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index];
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vx *= 0.97;
    particle.vy *= 0.97;
    particle.life -= particle.decay;

    if (particle.life <= 0) {
      particles.splice(index, 1);
    }
  }
}

function drawParticles() {
  particles.forEach((particle) => {
    ctx.globalAlpha = particle.life;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function showScorePopup(gridX, gridY, text) {
  const popup = document.createElement("div");
  popup.className = "score-popup";
  popup.textContent = text;

  const canvasRect = dom.canvas.getBoundingClientRect();
  const surfaceRect = dom.touchSurface.getBoundingClientRect();
  const popupX = (gridX * cellSize + cellSize / 2) * (canvasRect.width / boardSize);
  const popupY = gridY * cellSize * (canvasRect.height / boardSize);

  popup.style.left = `${popupX + canvasRect.left - surfaceRect.left}px`;
  popup.style.top = `${popupY + canvasRect.top - surfaceRect.top}px`;

  dom.touchSurface.appendChild(popup);
  popup.addEventListener("animationend", () => popup.remove(), { once: true });
}

function flashDirectionButton(directionKey) {
  const button = dom.dpadButtons.find((item) => item.dataset.dir === directionKey);
  if (!button) {
    return;
  }

  button.classList.add("is-pressed");
  const activeTimer = dpadFlashTimers.get(button);
  if (activeTimer) {
    clearTimeout(activeTimer);
  }

  const timer = window.setTimeout(() => {
    button.classList.remove("is-pressed");
  }, 110);

  dpadFlashTimers.set(button, timer);
}

function handleKeydown(event) {
  const isLoginScreen = dom.loginPage.classList.contains("active");

  if (isLoginScreen) {
    if (event.key === "Enter" && !dom.loginBtn.disabled) {
      handleLogin();
    }
    return;
  }

  const code = event.code ? event.code.toLowerCase() : "";
  const key = event.key ? event.key.toLowerCase() : "";

  if (key === " " || code === "space") {
    event.preventDefault();

    if (gameState === "idle" || gameState === "gameover") {
      resetGame();
      startGame();
    } else if (gameState === "playing") {
      pauseGame();
    } else if (gameState === "paused") {
      resumeGame();
    }

    return;
  }

  let directionKey = null;

  if (code === "arrowup" || key === "arrowup" || code === "keyw" || key === "w") {
    directionKey = "up";
  } else if (code === "arrowdown" || key === "arrowdown" || code === "keys" || key === "s") {
    directionKey = "down";
  } else if (code === "arrowleft" || key === "arrowleft" || code === "keya" || key === "a") {
    directionKey = "left";
  } else if (code === "arrowright" || key === "arrowright" || code === "keyd" || key === "d") {
    directionKey = "right";
  }

  if (directionKey) {
    event.preventDefault();
    requestDirection(directionKey);
  }
}

function handleOverlayAction() {
  if (gameState === "paused") {
    resumeGame();
    return;
  }

  resetGame();
  startGame();
}

function handlePauseAction() {
  if (gameState === "playing") {
    pauseGame();
  } else if (gameState === "paused") {
    resumeGame();
  }
}

function handleRestartAction() {
  resetGame();
  showReadyOverlay();
}

function handleDpadPress(event) {
  event.preventDefault();
  const directionKey = event.currentTarget.dataset.dir;

  if (gameState === "idle" || gameState === "gameover") {
    resetGame();
    startGame();
  }

  requestDirection(directionKey);
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function mixColor(fromColor, toColor, progress) {
  const from = hexToRgb(fromColor);
  const to = hexToRgb(toColor);
  const red = Math.round(from.r + (to.r - from.r) * progress);
  const green = Math.round(from.g + (to.g - from.g) * progress);
  const blue = Math.round(from.b + (to.b - from.b) * progress);
  return `rgb(${red}, ${green}, ${blue})`;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function idleRender() {
  if (gameState !== "playing") {
    render();
  }

  animFrame = requestAnimationFrame(idleRender);
}

dom.usernameInput.addEventListener("input", () => {
  dom.loginBtn.disabled = dom.usernameInput.value.trim().length === 0;
});

dom.loginBtn.addEventListener("click", handleLogin);
dom.guestBtn.addEventListener("click", handleGuestLogin);
dom.overlayBtn.addEventListener("click", handleOverlayAction);
dom.pauseBtn.addEventListener("click", handlePauseAction);
dom.restartBtn.addEventListener("click", handleRestartAction);
dom.logoutBtn.addEventListener("click", handleLogout);

dom.dpadButtons.forEach((button) => {
  button.addEventListener("pointerdown", handleDpadPress);
});

document.addEventListener("keydown", handleKeydown, { passive: false });
window.addEventListener("resize", scheduleResize);
window.addEventListener("orientationchange", scheduleResize);

window.__snakeDebug = {
  login(name = "AUTO") {
    if (!currentUser) {
      dom.usernameInput.value = name;
      dom.loginBtn.disabled = false;
      handleLogin();
    }
  },
  start(name = "AUTO") {
    if (!currentUser) {
      this.login(name);
    }
    resetGame();
    startGame();
  },
  pause: pauseGame,
  resume: resumeGame,
  requestDirection,
  getState() {
    return {
      gameState,
      currentUser,
      score,
      speed,
      direction: currentDirection,
      snake: snake.map((segment) => ({ ...segment })),
      food: food ? { ...food } : null,
    };
  },
};

resizeCanvas();
updateHud();
render();
idleRender();
dom.usernameInput.focus();
