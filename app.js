/**
 * 霓虹贪吃蛇 - 主应用逻辑
 * 包含：用户登录、贪吃蛇游戏引擎、数据持久化
 */

// =========================================
//  常量与配置
// =========================================
const GRID_SIZE = 20;           // 网格格数（20×20）
const BASE_SPEED = 220;         // 基础速度（毫秒/帧），数值越大蛇越慢
const SPEED_INCREMENT = 2;      // 每吃一个食物加速的毫秒数
const MIN_SPEED = 90;           // 最快速度
const SCORE_PER_FOOD = 10;      // 每个食物的基础分值
const STORAGE_KEY = 'neon_snake_data';

// 方向映射
const DIR = {
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 },
};

// 颜色配置
const COLORS = {
  grid:       'rgba(148, 163, 184, 0.04)',
  gridLine:   'rgba(148, 163, 184, 0.06)',
  snakeHead:  '#22d3ee',
  snakeBody:  '#0891b2',
  snakeTail:  '#065f73',
  food:       '#d946ef',
  foodGlow:   'rgba(217, 70, 239, 0.4)',
  particle:   '#22d3ee',
};

// =========================================
//  DOM 引用
// =========================================
const $ = (sel) => document.querySelector(sel);
const dom = {
  // 页面
  loginPage:   $('#login-page'),
  gamePage:    $('#game-page'),
  // 登录
  usernameInput: $('#username-input'),
  loginBtn:      $('#login-btn'),
  guestBtn:      $('#guest-btn'),
  // 游戏画布
  canvas:      $('#game-canvas'),
  overlay:     $('#overlay'),
  overlayTitle:  $('#overlay-title'),
  overlayMsg:    $('#overlay-message'),
  overlayBtn:    $('#overlay-btn'),
  // 控制
  pauseBtn:    $('#pause-btn'),
  pauseIcon:   $('#pause-icon'),
  playIcon:    $('#play-icon'),
  restartBtn:  $('#restart-btn'),
  logoutBtn:   $('#logout-btn'),
  // 信息面板
  playerName:   $('#player-name'),
  loginTime:    $('#login-time'),
  currentScore: $('#current-score'),
  snakeLength:  $('#snake-length'),
  gameSpeed:    $('#game-speed'),
  bestScore:    $('#best-score'),
  totalGames:   $('#total-games'),
  totalFood:    $('#total-food'),
  // 排行榜
  leaderboard:  $('#leaderboard'),
  recentGames:  $('#recent-games'),
};

const ctx = dom.canvas.getContext('2d');
const CELL = dom.canvas.width / GRID_SIZE;  // 每格像素大小

// =========================================
//  应用状态
// =========================================
let currentUser = null;     // 当前登录用户名
let loginTimestamp = null;  // 登录时间戳

// 游戏状态
let gameState = 'idle';     // idle | playing | paused | gameover
let snake = [];             // 蛇身体 [{x, y}, ...]
let food = null;            // 食物位置 {x, y}
let direction = DIR.RIGHT;
let nextDirection = DIR.RIGHT;
let score = 0;
let speed = BASE_SPEED;
let gameLoop = null;
let particles = [];         // 粒子效果
let foodPulse = 0;          // 食物脉冲动画帧

// =========================================
//  数据持久化
// =========================================
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

function getUserData(username) {
  const data = loadData();
  if (!data.users[username]) {
    data.users[username] = {
      bestScore: 0,
      totalGames: 0,
      totalFood: 0,
      loginHistory: [],
      gameHistory: [],
    };
    saveData(data);
  }
  return data.users[username];
}

function updateUserData(username, updater) {
  const data = loadData();
  if (!data.users[username]) {
    data.users[username] = {
      bestScore: 0,
      totalGames: 0,
      totalFood: 0,
      loginHistory: [],
      gameHistory: [],
    };
  }
  updater(data.users[username]);
  saveData(data);
}

// =========================================
//  登录逻辑
// =========================================
dom.usernameInput.addEventListener('input', () => {
  const val = dom.usernameInput.value.trim();
  dom.loginBtn.disabled = val.length === 0;
});

dom.usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !dom.loginBtn.disabled) {
    handleLogin();
  }
});

dom.loginBtn.addEventListener('click', handleLogin);

// 游客模式按钮
dom.guestBtn.addEventListener('click', handleGuestLogin);

function handleGuestLogin() {
  // 生成随机游客ID
  const guestId = '游客_' + Math.random().toString(36).substring(2, 6).toUpperCase();
  dom.usernameInput.value = guestId;
  handleLogin();
}

function handleLogin() {
  const username = dom.usernameInput.value.trim();
  if (!username) return;

  currentUser = username;
  loginTimestamp = Date.now();

  // 记录登录历史
  updateUserData(username, (u) => {
    u.loginHistory.push({
      time: new Date(loginTimestamp).toISOString(),
      timestamp: loginTimestamp,
    });
    // 只保留最近 50 条登录记录
    if (u.loginHistory.length > 50) {
      u.loginHistory = u.loginHistory.slice(-50);
    }
  });

  // 切换到游戏页面
  dom.loginPage.classList.remove('active');
  dom.gamePage.classList.add('active');

  // 更新界面
  dom.playerName.textContent = username;
  dom.loginTime.textContent = '登录于 ' + formatTime(loginTimestamp);

  refreshStats();
  refreshLeaderboard();
  refreshRecentGames();
  resetGame();
  showOverlay('准备就绪', '按 <kbd>空格键</kbd> 或点击下方按钮开始', '开始游戏');
}

// =========================================
//  退出登录
// =========================================
dom.logoutBtn.addEventListener('click', () => {
  if (gameState === 'playing') {
    pauseGame();
  }
  // 结束当前游戏
  if (gameLoop) {
    clearInterval(gameLoop);
    gameLoop = null;
  }
  gameState = 'idle';
  currentUser = null;
  loginTimestamp = null;

  // 切换到登录页
  dom.gamePage.classList.remove('active');
  dom.loginPage.classList.add('active');
  dom.usernameInput.value = '';
  dom.loginBtn.disabled = true;
  dom.usernameInput.focus();
});

// =========================================
//  游戏核心逻辑
// =========================================
function resetGame() {
  // 清除旧循环
  if (gameLoop) {
    clearInterval(gameLoop);
    gameLoop = null;
  }

  // 初始化蛇：从中间偏左开始，长度3
  const startX = Math.floor(GRID_SIZE / 2) - 1;
  const startY = Math.floor(GRID_SIZE / 2);
  snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY },
  ];

  direction = DIR.RIGHT;
  nextDirection = DIR.RIGHT;
  score = 0;
  speed = BASE_SPEED;
  particles = [];
  foodPulse = 0;
  gameState = 'idle';

  spawnFood();
  updateScoreUI();
  render();
}

function spawnFood() {
  // 在空白区域随机生成食物
  const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
  const free = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (!occupied.has(`${x},${y}`)) {
        free.push({ x, y });
      }
    }
  }
  if (free.length === 0) {
    // 蛇填满整个画布，获胜！
    endGame(true);
    return;
  }
  food = free[Math.floor(Math.random() * free.length)];
}

function startGame() {
  if (gameState === 'playing') return;

  gameState = 'playing';
  hideOverlay();
  updatePauseIcon();

  gameLoop = setInterval(gameTick, speed);
}

function pauseGame() {
  if (gameState !== 'playing') return;
  gameState = 'paused';
  clearInterval(gameLoop);
  gameLoop = null;
  updatePauseIcon();
  showOverlay('暂停中', '按 <kbd>空格键</kbd> 或点击按钮继续', '继续游戏');
}

function resumeGame() {
  if (gameState !== 'paused') return;
  gameState = 'playing';
  hideOverlay();
  updatePauseIcon();
  gameLoop = setInterval(gameTick, speed);
}

function gameTick() {
  // 应用方向
  direction = nextDirection;

  // 计算新头部
  const head = snake[0];
  const newHead = {
    x: head.x + direction.x,
    y: head.y + direction.y,
  };

  // 碰撞检测：墙壁
  if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
    endGame(false);
    return;
  }

  // 碰撞检测：自身（不检查尾巴，因为尾巴会移开）
  for (let i = 0; i < snake.length - 1; i++) {
    if (snake[i].x === newHead.x && snake[i].y === newHead.y) {
      endGame(false);
      return;
    }
  }

  // 移动蛇
  snake.unshift(newHead);

  // 检测是否吃到食物
  if (food && newHead.x === food.x && newHead.y === food.y) {
    // 吃到食物，不移除尾巴
    score += SCORE_PER_FOOD;

    // 创建粒子特效
    createParticles(food.x, food.y);

    // 显示得分弹出
    showScorePopup(food.x, food.y, `+${SCORE_PER_FOOD}`);

    // 加速
    speed = Math.max(MIN_SPEED, speed - SPEED_INCREMENT);
    clearInterval(gameLoop);
    gameLoop = setInterval(gameTick, speed);

    // 生成新食物
    spawnFood();

    updateScoreUI();
  } else {
    // 没吃到食物，移除尾巴
    snake.pop();
  }

  render();
}

function endGame(isWin) {
  gameState = 'gameover';
  clearInterval(gameLoop);
  gameLoop = null;

  // 保存游戏记录
  updateUserData(currentUser, (u) => {
    u.totalGames++;
    u.totalFood += Math.floor(score / SCORE_PER_FOOD);
    if (score > u.bestScore) {
      u.bestScore = score;
    }
    u.gameHistory.push({
      score: score,
      length: snake.length,
      time: new Date().toISOString(),
      timestamp: Date.now(),
    });
    // 只保留最近 100 条游戏记录
    if (u.gameHistory.length > 100) {
      u.gameHistory = u.gameHistory.slice(-100);
    }
  });

  refreshStats();
  refreshLeaderboard();
  refreshRecentGames();

  const title = isWin ? '🎉 通关！' : '💀 游戏结束';
  const msg = `最终得分：<strong style="color:var(--cyan)">${score}</strong> 分 &nbsp;|&nbsp; 蛇身长度：${snake.length}`;
  showOverlay(title, msg, '再来一局');
}

// =========================================
//  渲染引擎
// =========================================
function render() {
  const w = dom.canvas.width;
  const h = dom.canvas.height;

  // 清除画布
  ctx.fillStyle = '#0c1222';
  ctx.fillRect(0, 0, w, h);

  // 绘制网格
  drawGrid();

  // 更新并绘制粒子
  updateParticles();
  drawParticles();

  // 绘制食物
  drawFood();

  // 绘制蛇
  drawSnake();

  foodPulse += 0.06;
}

function drawGrid() {
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 0.5;

  for (let i = 0; i <= GRID_SIZE; i++) {
    const pos = i * CELL;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, dom.canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(dom.canvas.width, pos);
    ctx.stroke();
  }
}

function drawSnake() {
  const len = snake.length;

  snake.forEach((seg, i) => {
    const x = seg.x * CELL;
    const y = seg.y * CELL;
    const pad = 1;

    // 颜色渐变：头部最亮，尾部最暗
    const ratio = i / Math.max(len - 1, 1);

    if (i === 0) {
      // 蛇头 - 发光效果
      ctx.shadowColor = COLORS.snakeHead;
      ctx.shadowBlur = 12;
      ctx.fillStyle = COLORS.snakeHead;
      roundRect(ctx, x + pad, y + pad, CELL - pad * 2, CELL - pad * 2, 5);
      ctx.fill();
      ctx.shadowBlur = 0;

      // 蛇眼
      drawEyes(seg);
    } else {
      // 蛇身渐变
      const r = lerp(8, 6, ratio);
      const g = lerp(145, 95, ratio);
      const b = lerp(178, 115, ratio);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      roundRect(ctx, x + pad + 0.5, y + pad + 0.5, CELL - (pad + 0.5) * 2, CELL - (pad + 0.5) * 2, 4);
      ctx.fill();
    }
  });
}

function drawEyes(head) {
  const cx = head.x * CELL + CELL / 2;
  const cy = head.y * CELL + CELL / 2;
  const eyeSize = 3;
  const eyeOffset = 5;

  let eye1, eye2;

  if (direction === DIR.RIGHT) {
    eye1 = { x: cx + eyeOffset, y: cy - 4 };
    eye2 = { x: cx + eyeOffset, y: cy + 4 };
  } else if (direction === DIR.LEFT) {
    eye1 = { x: cx - eyeOffset, y: cy - 4 };
    eye2 = { x: cx - eyeOffset, y: cy + 4 };
  } else if (direction === DIR.UP) {
    eye1 = { x: cx - 4, y: cy - eyeOffset };
    eye2 = { x: cx + 4, y: cy - eyeOffset };
  } else {
    eye1 = { x: cx - 4, y: cy + eyeOffset };
    eye2 = { x: cx + 4, y: cy + eyeOffset };
  }

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(eye1.x, eye1.y, eyeSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eye2.x, eye2.y, eyeSize, 0, Math.PI * 2);
  ctx.fill();
}

function drawFood() {
  if (!food) return;

  const cx = food.x * CELL + CELL / 2;
  const cy = food.y * CELL + CELL / 2;
  const pulse = Math.sin(foodPulse) * 2;
  const radius = CELL / 2 - 3 + pulse;

  // 发光光环
  ctx.shadowColor = COLORS.foodGlow;
  ctx.shadowBlur = 18 + pulse * 2;
  ctx.fillStyle = COLORS.food;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // 内部高光
  const grad = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, radius);
  grad.addColorStop(0, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

// =========================================
//  粒子系统
// =========================================
function createParticles(gx, gy) {
  const cx = gx * CELL + CELL / 2;
  const cy = gy * CELL + CELL / 2;

  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
    const spd = 1.5 + Math.random() * 3;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: 1,
      decay: 0.02 + Math.random() * 0.03,
      size: 2 + Math.random() * 3,
      color: Math.random() > 0.5 ? COLORS.particle : COLORS.food,
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= p.decay;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// =========================================
//  得分弹出效果
// =========================================
function showScorePopup(gx, gy, text) {
  const wrapper = document.querySelector('.canvas-wrapper');
  const popup = document.createElement('div');
  popup.className = 'score-popup';
  popup.textContent = text;

  // 计算相对于 canvas wrapper 的位置
  const rect = dom.canvas.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  const px = (gx * CELL + CELL / 2) * (rect.width / dom.canvas.width) + (rect.left - wrapperRect.left);
  const py = (gy * CELL) * (rect.height / dom.canvas.height) + (rect.top - wrapperRect.top);

  popup.style.left = px + 'px';
  popup.style.top = py + 'px';
  wrapper.appendChild(popup);

  popup.addEventListener('animationend', () => popup.remove());
}

// =========================================
//  覆盖层控制
// =========================================
function showOverlay(title, message, btnText) {
  dom.overlayTitle.innerHTML = title;
  dom.overlayMsg.innerHTML = message;
  dom.overlayBtn.querySelector('span').textContent = btnText;
  dom.overlay.classList.add('active');
}

function hideOverlay() {
  dom.overlay.classList.remove('active');
}

dom.overlayBtn.addEventListener('click', () => {
  if (gameState === 'gameover' || gameState === 'idle') {
    resetGame();
    startGame();
  } else if (gameState === 'paused') {
    resumeGame();
  }
});

// =========================================
//  控制按钮
// =========================================
dom.pauseBtn.addEventListener('click', () => {
  if (gameState === 'playing') {
    pauseGame();
  } else if (gameState === 'paused') {
    resumeGame();
  }
});

dom.restartBtn.addEventListener('click', () => {
  if (gameState === 'playing' || gameState === 'paused') {
    // 当前游戏视为放弃，不记分
    clearInterval(gameLoop);
    gameLoop = null;
  }
  resetGame();
  showOverlay('准备就绪', '按 <kbd>空格键</kbd> 或点击下方按钮开始', '开始游戏');
});

function updatePauseIcon() {
  if (gameState === 'playing') {
    dom.pauseIcon.style.display = '';
    dom.playIcon.style.display = 'none';
  } else {
    dom.pauseIcon.style.display = 'none';
    dom.playIcon.style.display = '';
  }
}

// =========================================
//  键盘控制
// =========================================
document.addEventListener('keydown', (e) => {
  // 登录页面回车
  if (dom.loginPage.classList.contains('active')) return;

  const code = e.code ? e.code.toLowerCase() : '';
  const key = e.key ? e.key.toLowerCase() : '';

  // 空格键：开始/暂停
  if (key === ' ' || code === 'space') {
    e.preventDefault();
    if (gameState === 'idle' || gameState === 'gameover') {
      resetGame();
      startGame();
    } else if (gameState === 'playing') {
      pauseGame();
    } else if (gameState === 'paused') {
      resumeGame();
    }
    return;
  }

  // 方向键
  if (gameState !== 'playing') return;

  let dir = null;
  
  if (code === 'arrowup' || key === 'arrowup' || code === 'keyw' || key === 'w') {
    dir = DIR.UP;
  } else if (code === 'arrowdown' || key === 'arrowdown' || code === 'keys' || key === 's') {
    dir = DIR.DOWN;
  } else if (code === 'arrowleft' || key === 'arrowleft' || code === 'keya' || key === 'a') {
    dir = DIR.LEFT;
  } else if (code === 'arrowright' || key === 'arrowright' || code === 'keyd' || key === 'd') {
    dir = DIR.RIGHT;
  }

  if (dir) {
    e.preventDefault();
    // 只阻止180度掉头（用坐标加法判断：反向向量之和为零）
    const isReverse = (dir.x + nextDirection.x === 0 && dir.y + nextDirection.y === 0);
    if (!isReverse) {
      nextDirection = dir;
    }
  }
});

// =========================================
//  UI 更新
// =========================================
function updateScoreUI() {
  dom.currentScore.textContent = score;
  dom.snakeLength.textContent = snake.length;

  // 速度级别
  const level = Math.round((BASE_SPEED - speed) / SPEED_INCREMENT) + 1;
  dom.gameSpeed.textContent = level + 'x';
}

function refreshStats() {
  if (!currentUser) return;
  const u = getUserData(currentUser);
  dom.bestScore.textContent = u.bestScore;
  dom.totalGames.textContent = u.totalGames;
  dom.totalFood.textContent = u.totalFood;
}

function refreshLeaderboard() {
  const data = loadData();
  const entries = [];

  // 收集所有用户最高分
  for (const [name, userData] of Object.entries(data.users)) {
    if (userData.bestScore > 0) {
      entries.push({ name, score: userData.bestScore });
    }
  }

  // 按分数降序排序
  entries.sort((a, b) => b.score - a.score);

  // 取前 10 名
  const top = entries.slice(0, 10);

  if (top.length === 0) {
    dom.leaderboard.innerHTML = '<p class="empty-text">暂无记录</p>';
    return;
  }

  dom.leaderboard.innerHTML = top.map((e, i) => `
    <div class="lb-item">
      <span class="lb-rank">${i + 1}</span>
      <span class="lb-name">${escHtml(e.name)}</span>
      <span class="lb-score">${e.score}</span>
    </div>
  `).join('');
}

function refreshRecentGames() {
  if (!currentUser) return;
  const u = getUserData(currentUser);
  const recent = u.gameHistory.slice(-8).reverse();

  if (recent.length === 0) {
    dom.recentGames.innerHTML = '<p class="empty-text">暂无记录</p>';
    return;
  }

  dom.recentGames.innerHTML = recent.map(g => `
    <div class="rg-item">
      <div class="rg-top">
        <span class="rg-score">${g.score} 分</span>
        <span>长度 ${g.length}</span>
      </div>
      <div class="rg-time">${formatDateTime(g.timestamp)}</div>
    </div>
  `).join('');
}

// =========================================
//  工具函数
// =========================================

/** 线性插值 */
function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/** 圆角矩形 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** HTML 转义 */
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** 格式化时间 (HH:MM:SS) */
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** 格式化日期时间 */
function formatDateTime(ts) {
  const d = new Date(ts);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return `${month}/${day} ${time}`;
}

// =========================================
//  动画循环（用于非游戏时的持续渲染）
// =========================================
let animFrame = null;

function idleRender() {
  if (gameState !== 'playing') {
    foodPulse += 0.04;
    render();
  }
  animFrame = requestAnimationFrame(idleRender);
}

// 启动空闲渲染循环
idleRender();

// 页面加载完成后自动聚焦输入框
dom.usernameInput.focus();
