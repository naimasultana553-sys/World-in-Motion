/**
 * World in Motion - Game Engine
 * Core logic for physics, rendering, and levels.
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const levelNumSpan = document.getElementById('level-num');
const timerSpan = document.getElementById('timer');
const retriesSpan = document.getElementById('retries');
const gravityArrow = document.getElementById('gravity-arrow');

// Game State
let gameState = 'LOGIN'; // LOGIN, MENU, INITIALIZING, BRIEFING, PLAYING, WIN, GAMEOVER, PAUSED
let currentEmail = null;
let isGuest = false;
let currentLevel = 0;
let startTime = 0;
let pauseTime = 0;
let retries = 3;

// Mock Database
let usersDB = {};
try {
    const data = localStorage.getItem('worldInMotion_usersDB');
    usersDB = data ? JSON.parse(data) : {};
} catch(e) { usersDB = {}; }

function saveProgress() {
    if (isGuest) {
        localStorage.setItem('worldInMotion_guest_level', currentLevel);
        localStorage.setItem('worldInMotion_guest_retries', retries);
    } else if (currentEmail && usersDB[currentEmail]) {
        usersDB[currentEmail].level = currentLevel;
        usersDB[currentEmail].retries = retries;
        localStorage.setItem('worldInMotion_usersDB', JSON.stringify(usersDB));
    }
}

function loadProgress() {
    if (isGuest) {
        const savedLevel = localStorage.getItem('worldInMotion_guest_level');
        const savedRetries = localStorage.getItem('worldInMotion_guest_retries');
        currentLevel = savedLevel !== null ? parseInt(savedLevel) : 0;
        retries = savedRetries !== null ? parseInt(savedRetries) : 3;
    } else if (currentEmail && usersDB[currentEmail]) {
        currentLevel = usersDB[currentEmail].level || 0;
        retries = usersDB[currentEmail].retries || 3;
    }
}
let gravity = { x: 0, y: 0.5 };
let mousePos = { x: 0, y: 0 };
let particles = [];
let stars = [];
let galaxyStars = [];
let initObjects = [];
let audioCtx = null;
let musicNode = null;

const settings = {
    music: true,
    sfx: true,
    shake: true
};

// Create stars for background
for (let i = 0; i < 200; i++) {
    stars.push({
        x: Math.random() * 2000,
        y: Math.random() * 2000,
        size: Math.random() * 2,
        speed: Math.random() * 0.5,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.02 + Math.random() * 0.05,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2
    });
}

// Create galaxy stars for menu
for (let i = 0; i < 400; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 400 + 50;
    galaxyStars.push({
        angle: angle,
        distance: distance,
        speed: (Math.random() * 0.005) + 0.002,
        size: Math.random() * 2 + 1,
        color: Math.random() > 0.5 ? '#00f2ff' : '#bc13fe'
    });
}

// Create objects for initialization simulation
function createInitObjects() {
    initObjects = [];
    for (let i = 0; i < 30; i++) {
        initObjects.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            size: Math.random() * 15 + 5,
            color: Math.random() > 0.5 ? '#00f2ff' : '#bc13fe',
            type: Math.random() > 0.5 ? 'circle' : 'rect'
        });
    }
}

// Constants
const PLAYER_RADIUS = 10;
const FRICTION = 0.98;
const GRAVITY_STRENGTH = 0.4;
const BOUNCE = 0.4;

// Resize handling
const REF_WIDTH = 800;
const REF_HEIGHT = 800;
let scale = 1;

function resize() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    // Calculate scale relative to reference resolution
    scale = Math.min(window.innerWidth / REF_WIDTH, window.innerHeight / REF_HEIGHT);
}
window.addEventListener('resize', resize);
resize();

// Level Definitions
const levels = [
    {
        platforms: [
            { x: 0, y: 700, w: 800, h: 50 }, // Ground
            { x: 200, y: 500, w: 400, h: 20 }, // Step
        ],
        goal: { x: 700, y: 650, r: 25 },
        start: { x: 100, y: 100 }
    },
    {
        platforms: [
            { x: 100, y: 200, w: 100, h: 400 },
            { x: 300, y: 0, w: 100, h: 400 },
            { x: 500, y: 200, w: 100, h: 400 },
            { x: 0, y: 0, w: 10, h: 1000 }, // Walls
            { x: 790, y: 0, w: 10, h: 1000 },
            { x: 0, y: 0, w: 1000, h: 10 },
            { x: 0, y: 790, w: 1000, h: 10 },
        ],
        goal: { x: 700, y: 400, r: 25 },
        start: { x: 50, y: 50 }
    }
];

// Pre-fill up to 500 levels
for (let i = 2; i < 500; i++) {
    levels.push(null);
}

function getDifficultyParams(level) {
    let L = level;
    let difficulty = L / 500;
    let variation = (L % 5) * 0.05; // 0% to 20% variation
    
    // Base parameters
    let ball_speed = 2.0 + (difficulty * 5.0) + variation;
    let player_speed = 5.0 - (difficulty * 1.5); // Responsiveness decreases
    
    // Boss Levels every 25
    let isBoss = L % 25 === 0 && L > 0;
    if (isBoss) {
        ball_speed *= 1.5;
    }
    
    // Movement Pattern (cycles every few levels)
    const patterns = ['straight', 'zigzag', 'curve', 'random'];
    let ball_pattern = patterns[Math.floor(L / 3) % patterns.length];
    
    // Obstacle count increases every 20 levels
    let obstacle_count = 3 + Math.floor(L / 20) + (isBoss ? 5 : 0);
    
    // Gap size decreases
    let gap_size = Math.max(40, 180 - (difficulty * 140));
    
    // Obstacle Type Rotation
    // 0: Moving walls, 1: Rotating bars, 2: Narrow gates, 3: Spikes, 4: Disappearing platforms, 5: Moving enemy blocks
    let obstacle_type_idx = L % 6;
    
    // Special Mechanics Unlocks
    let special_mechanics = [];
    if (L >= 100) special_mechanics.push('reverse_controls');
    if (L >= 150) special_mechanics.push('invisible_ball');
    if (L >= 200) special_mechanics.push('multiple_balls');
    if (L >= 300) special_mechanics.push('fake_balls');
    if (L >= 400) special_mechanics.push('teleporting_ball');
    
    // Combination Rule: 0-2 mechanics
    let active_mechanics = [];
    if (L >= 400) {
        active_mechanics = ['multiple_balls', 'fake_balls', 'teleporting_ball'];
    } else if (isBoss) {
        active_mechanics = special_mechanics.sort(() => 0.5 - Math.random()).slice(0, 2);
    } else if (special_mechanics.length > 0) {
        let num = Math.random() > 0.7 ? 1 : 0;
        active_mechanics = special_mechanics.sort(() => 0.5 - Math.random()).slice(0, num);
    }
    
    return {
        ball_speed,
        player_speed,
        ball_pattern,
        obstacle_count,
        obstacle_type_idx,
        gap_size,
        active_mechanics,
        isBoss,
        difficulty
    };
}

function getLevelTheme(level) {
    const themes = [
        { main: '#00f2ff', accent: '#bc13fe', bg: '#05050a' }, // Neon Cyber
        { main: '#ff0055', accent: '#ffaa00', bg: '#100005' }, // Magma
        { main: '#39ff14', accent: '#00ffcc', bg: '#000a05' }, // Matrix/Bio
        { main: '#ffffff', accent: '#555555', bg: '#000000' }, // Monochrome
        { main: '#ffcc00', accent: '#ff00ff', bg: '#050010' }, // Synthwave
        { main: '#00aaff', accent: '#ffffff', bg: '#000510' }  // Deep Sea
    ];
    return themes[Math.floor((level-1) / 20) % themes.length];
}

function generateRandomLevel(idx) {
    const L = idx + 1;
    const params = getDifficultyParams(L);
    const theme = getLevelTheme(L);
    
    const platforms = [
        { x: 0, y: 0, w: 800, h: 20, type: 'wall' },
        { x: 0, y: 780, w: 800, h: 20, type: 'wall' },
        { x: 0, y: 0, w: 20, h: 800, type: 'wall' },
        { x: 780, y: 0, w: 20, h: 800, type: 'wall' }
    ];

    const types = ['moving', 'rotating', 'gate', 'spike', 'disappearing', 'enemy'];
    const currentType = types[params.obstacle_type_idx];

    for (let j = 0; j < params.obstacle_count; j++) {
        const isVertical = Math.random() > 0.5;
        let w, h, x, y, vx = 0, vy = 0, rotation = 0, rotationSpeed = 0, state = 'visible';
        
        if (currentType === 'gate') {
            w = isVertical ? 20 : 150;
            h = isVertical ? 150 : 20;
            x = 100 + Math.random() * 600;
            y = 100 + Math.random() * 600;
        } else {
            w = isVertical ? (20 + Math.random() * 20) : (60 + Math.random() * 200);
            h = isVertical ? (60 + Math.random() * 200) : (20 + Math.random() * 20);
            x = 50 + Math.random() * (700 - w);
            y = 50 + Math.random() * (700 - h);
        }

        if (currentType === 'moving' || currentType === 'enemy') {
            const s = (0.5 + Math.random()) * (params.difficulty * 5 + 1);
            if (isVertical) vy = Math.random() > 0.5 ? s : -s;
            else vx = Math.random() > 0.5 ? s : -s;
        } else if (currentType === 'rotating') {
            rotationSpeed = (Math.random() - 0.5) * 0.1;
        }

        platforms.push({ 
            x, y, w, h, vx, vy, 
            type: currentType, 
            rotation, rotationSpeed, 
            baseW: w, baseH: h,
            state, timer: Math.random() * 2
        });
    }

    const goalR = Math.max(10, 25 - (params.difficulty * 15));
    
    return {
        params: params,
        theme: theme,
        platforms: platforms,
        goal: { 
            x: 100 + Math.random() * 600, 
            y: 100 + Math.random() * 600, 
            r: goalR 
        },
        start: { 
            x: 100 + Math.random() * 600, 
            y: 100 + Math.random() * 600 
        }
    };
}

// Utility for laser collision
function distSq(v, w) { return (v.x - w.x) ** 2 + (v.y - w.y) ** 2 }
function distToSegment(p, v, w) {
    var l2 = distSq(v, w);
    if (l2 == 0) return Math.sqrt(distSq(p, v));
    var t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(distSq(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) }));
}

class Player {
    constructor(x, y, params) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = PLAYER_RADIUS;
        this.trail = [];
        this.params = params || { ball_speed: 1, ball_pattern: 'straight', active_mechanics: [] };
        this.creationTime = Date.now();
    }

    update() {
        let L = currentLevel + 1;
        const time = (Date.now() - this.creationTime) / 1000;
        
        // Difficulty Scaling from Params
        let speedMult = this.params.ball_speed / 2.0; // Normalized against base speed 2.0
        let ctrlMult = this.params.player_speed / 5.0; // Normalized against base player speed 5.0
        
        // Reverse Controls Mechanic
        let finalGravity = { x: gravity.x, y: gravity.y };
        if (this.params.active_mechanics.includes('reverse_controls')) {
            finalGravity.x *= -1;
            finalGravity.y *= -1;
        }

        // Apply scaled gravity
        this.vx += finalGravity.x * scale * speedMult * ctrlMult;
        this.vy += finalGravity.y * scale * speedMult * ctrlMult;

        // Movement Patterns
        if (this.params.ball_pattern === 'zigzag') {
            this.vx += Math.sin(time * 5) * 0.5;
        } else if (this.params.ball_pattern === 'curve') {
            this.vx += Math.cos(time * 2) * 0.8;
            this.vy += Math.sin(time * 2) * 0.8;
        } else if (this.params.ball_pattern === 'random') {
            if (Math.random() > 0.95) {
                this.vx += (Math.random() - 0.5) * 5;
                this.vy += (Math.random() - 0.5) * 5;
            }
        }

        // Gravity Shift Mechanic (frequent heavy/light feel)
        if (this.params.active_mechanics.includes('gravity_shift')) {
            let shift = 1 + Math.sin(time * 3) * 0.5;
            this.vx *= shift;
            this.vy *= shift;
        }

        // Apply friction
        this.vx *= FRICTION;
        this.vy *= FRICTION;

        // Move
        this.x += this.vx;
        this.y += this.vy;

        // Teleport Mechanic (for pattern or specific mechanic)
        if (this.params.ball_pattern === 'teleport' || this.params.active_mechanics.includes('teleporting_ball')) {
            if (Math.random() > 0.99) {
                this.x = Math.random() * canvas.width / window.devicePixelRatio;
                this.y = Math.random() * canvas.height / window.devicePixelRatio;
                createExplosion(this.x, this.y, '#bc13fe', 10);
            }
        }

        // Trail
        this.trail.unshift({ x: this.x, y: this.y });
        if (this.trail.length > 20) this.trail.pop();

        // Collision with walls/platforms
        const level = levels[currentLevel];
        level.platforms.forEach(p => {
            // Apply scale to platform collision check
            const sp = {
                x: p.x * scale,
                y: p.y * scale,
                w: p.w * scale,
                h: p.h * scale
            };
            this.checkCollision(sp, p.type);
        });

        // Screen boundaries
        if (this.x < this.radius) { this.x = this.radius; this.vx *= -BOUNCE; }
        if (this.x > canvas.width/window.devicePixelRatio - this.radius) { this.x = canvas.width/window.devicePixelRatio - this.radius; this.vx *= -BOUNCE; }
        if (this.y < this.radius) { this.y = this.radius; this.vy *= -BOUNCE; }
        if (this.y > canvas.height/window.devicePixelRatio - this.radius) { this.y = canvas.height/window.devicePixelRatio - this.radius; this.vy *= -BOUNCE; }

        // Goal check
        const dist = Math.hypot(this.x - level.goal.x * scale, this.y - level.goal.y * scale);
        if (dist < this.radius + level.goal.r * scale) {
            winLevel();
        }
    }

    checkCollision(rect, type) {
        // Find the closest point to the circle within the rectangle
        let closestX = Math.max(rect.x, Math.min(this.x, rect.x + rect.w));
        let closestY = Math.max(rect.y, Math.min(this.y, rect.y + rect.h));

        // Calculate distance between the circle's center and this closest point
        let distanceX = this.x - closestX;
        let distanceY = this.y - closestY;

        let distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);

        if (distanceSquared < (this.radius * this.radius)) {
            if (type === 'enemy') {
                loseLevel();
                return;
            }
            // Collision occurred!
            let distance = Math.sqrt(distanceSquared);
            let overlap = this.radius - distance;

            // Trigger particles on impact
            if (Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1) {
                createExplosion(closestX, closestY, '#bc13fe', 5);
            }

            // Simple resolution: push player back
            if (distance === 0) {
                // If perfectly centered, push up
                this.y -= this.radius;
                this.vy = 0;
            } else {
                this.x += (distanceX / distance) * overlap;
                this.y += (distanceY / distance) * overlap;
                
                // Reflect velocity
                if (Math.abs(distanceX) > Math.abs(distanceY)) {
                    this.vx *= -BOUNCE;
                } else {
                    this.vy *= -BOUNCE;
                }
            }
        }
    }

    draw() {
        const level = levels[currentLevel];
        const theme = (level && level.theme) ? level.theme : { main: '#00f2ff', accent: '#bc13fe', bg: '#05050a' };

        // Invisible Ball Mechanic
        let alpha = 1;
        if (this.params.active_mechanics.includes('invisible_ball')) {
            alpha = (Math.sin(Date.now() / 500) > 0) ? 1 : 0.1;
        }

        // Draw trail
        this.trail.forEach((pos, index) => {
            const trailAlpha = (1 - (index / this.trail.length)) * alpha;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, this.radius * trailAlpha, 0, Math.PI * 2);
            ctx.fillStyle = theme.main;
            ctx.globalAlpha = trailAlpha * 0.3;
            ctx.fill();
            ctx.globalAlpha = 1;
        });

        // Draw player
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        
        // Neon Glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = theme.main;
        ctx.fillStyle = theme.main;
        ctx.fill();
        ctx.restore();
        ctx.shadowBlur = 0;

        // Draw Fake Balls (Decoys)
        if (this.params.active_mechanics.includes('fake_balls')) {
            const time = Date.now() / 1000;
            for (let i = 0; i < 3; i++) {
                const fx = this.x + Math.cos(time + i * 2) * 100;
                const fy = this.y + Math.sin(time + i * 2) * 100;
                ctx.beginPath();
                ctx.arc(fx, fy, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 242, 255, 0.2)';
                ctx.strokeStyle = 'rgba(0, 242, 255, 0.5)';
                ctx.stroke();
            }
        }
    }
}

let player;

function initLevel(idx) {
    if (idx > 1 && !levels[idx]) {
        levels[idx] = generateRandomLevel(idx);
    }
    const level = levels[idx];
    
    // Default params for hardcoded levels if missing
    if (!level.params) {
        level.params = getDifficultyParams(idx + 1);
    }

    player = new Player(level.start.x * scale, level.start.y * scale, level.params);
    
    // Boss Indicator
    const bossInd = document.getElementById('boss-indicator');
    if (level.params.isBoss) {
        bossInd.classList.remove('hidden');
    } else {
        bossInd.classList.add('hidden');
    }

    levelNumSpan.innerText = idx + 1;
    if(retriesSpan) retriesSpan.innerText = retries;
    startTime = Date.now();

    // Show Level Splash
    const splash = document.getElementById('level-splash');
    const splashText = document.getElementById('splash-text');
    splashText.innerText = `LEVEL ${idx + 1}`;
    splash.classList.remove('hidden');
    setTimeout(() => {
        splash.classList.add('hidden');
    }, 1500);
}

function loseLevel() {
    if (gameState !== 'PLAYING') return;
    gameState = 'GAMEOVER';
    createExplosion(player.x, player.y, '#ff3333', 50);
    
    retries--;
    if(retriesSpan) retriesSpan.innerText = retries;
    saveProgress();
    
    const msg = document.querySelector('#game-over p');
    const btn = document.getElementById('retry-btn');
    if (retries > 0) {
        msg.innerText = `Orb structural integrity compromised. Retries left: ${retries}`;
        btn.innerText = 'Retry Level';
    } else {
        msg.innerText = 'Critical Failure. Reality reset to Level 1.';
        btn.innerText = 'Restart from Level 1';
    }
    
    document.getElementById('game-over').classList.remove('hidden');
}

function winLevel() {
    if (gameState !== 'PLAYING') return;
    gameState = 'WIN';
    createExplosion(player.x, player.y, '#39ff14', 50);
    
    // Generate Level Chart
    const chart = document.getElementById('level-chart');
    if (chart) {
        chart.innerHTML = '';
        // Show only nearby levels for win screen
        const start = Math.max(0, currentLevel - 2);
        const end = Math.min(499, currentLevel + 7);
        for (let i = start; i <= end; i++) {
            const node = document.createElement('div');
            node.className = 'level-node';
            node.innerText = i + 1;
            if (i <= currentLevel) node.classList.add('completed');
            if (i === currentLevel + 1) node.classList.add('current');
            chart.appendChild(node);
        }
    }

    saveProgress();
    document.getElementById('level-complete').classList.remove('hidden');
}

function createExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1.0,
            color: color,
            size: Math.random() * 3 + 1
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles() {
    particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;
}

// Input Handling
function handlePointer(x, y) {
    mousePos.x = x;
    mousePos.y = y;

    if (gameState === 'PLAYING' || gameState === 'INITIALIZING') {
        const dx = mousePos.x - window.innerWidth / 2;
        const dy = mousePos.y - window.innerHeight / 2;
        const angle = Math.atan2(dy, dx);
        
        gravity.x = Math.cos(angle) * GRAVITY_STRENGTH;
        gravity.y = Math.sin(angle) * GRAVITY_STRENGTH;

        // Update UI Arrow
        gravityArrow.style.transform = `rotate(${angle + Math.PI/2}rad)`;
    }
}

window.addEventListener('mousemove', (e) => handlePointer(e.clientX, e.clientY));
window.addEventListener('touchmove', (e) => {
    handlePointer(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
}, { passive: false });
window.addEventListener('touchstart', (e) => {
    handlePointer(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

// UI Initialization
document.addEventListener('DOMContentLoaded', () => {
    const authScreen = document.getElementById('auth-screen');
    const authEmail = document.getElementById('auth-email');
    const authPass = document.getElementById('auth-pass');
    const authError = document.getElementById('auth-error');
    const togglePass = document.getElementById('toggle-pass');

    togglePass.addEventListener('click', () => {
        const isPass = authPass.type === 'password';
        authPass.type = isPass ? 'text' : 'password';
        togglePass.innerText = isPass ? 'HIDE' : 'SHOW';
    });

    const enterMainMenu = (msg) => {
        authScreen.classList.add('hidden');
        document.getElementById('main-menu').classList.remove('hidden');
        document.querySelector('#main-menu p').innerText = msg;
        gameState = 'MENU';
    };

    document.getElementById('do-signup-btn').addEventListener('click', () => {
        const email = authEmail.value.trim();
        const pass = authPass.value.trim();
        if (!email || !pass) { authError.innerText = "Email and Password required"; return; }
        if (usersDB[email]) { authError.innerText = "Email already exists"; return; }
        
        usersDB[email] = { password: pass, level: 0, retries: 3 };
        localStorage.setItem('worldInMotion_usersDB', JSON.stringify(usersDB));
        currentEmail = email;
        isGuest = false;
        enterMainMenu("Account created successfully!");
    });

    document.getElementById('do-login-btn').addEventListener('click', () => {
        const email = authEmail.value.trim();
        const pass = authPass.value.trim();
        if (!email || !pass) { authError.innerText = "Email and Password required"; return; }
        
        const userData = usersDB[email];
        if (!userData) { authError.innerText = "User not found"; return; }
        if (userData.password !== pass) { authError.innerText = "Incorrect email or password"; return; }
        
        currentEmail = email;
        isGuest = false;
        loadProgress();
        enterMainMenu(`Welcome back, ${email}`);
    });

    document.getElementById('guest-btn').addEventListener('click', () => {
        isGuest = true;
        currentEmail = null;
        loadProgress();
        enterMainMenu("Guest Mode: Progress saved locally.");
    });

    document.getElementById('start-btn').addEventListener('click', () => {
        document.getElementById('main-menu').classList.add('hidden');
        startInitialization();
    });

    document.getElementById('back-to-menu').addEventListener('click', () => {
        document.getElementById('level-select').classList.add('hidden');
        document.getElementById('main-menu').classList.remove('hidden');
    });

    function showLevelSelect() {
        const selectScreen = document.getElementById('level-select');
        const grid = document.getElementById('level-select-chart');
        grid.innerHTML = '';
        
        const savedLevel = parseInt(localStorage.getItem('worldInMotion_save_level') || '0');

        // Show all 500 levels
        for (let i = 0; i < 500; i++) {
            const node = document.createElement('div');
            node.className = 'level-node';
            node.innerText = i + 1;
            
            if (i < savedLevel) {
                node.classList.add('completed');
            } else if (i === savedLevel) {
                node.classList.add('current');
            } else {
                node.classList.add('locked');
                node.style.opacity = '0.3';
                node.style.cursor = 'not-allowed';
            }
            
            node.addEventListener('click', () => {
                if (i <= savedLevel) {
                    currentLevel = i;
                    selectScreen.classList.add('hidden');
                    showBriefing();
                }
            });
            grid.appendChild(node);
        }
        selectScreen.classList.remove('hidden');
    }
});

function startInitialization() {
    gameState = 'INITIALIZING';
    document.getElementById('init-screen').classList.remove('hidden');
    createInitObjects();
    
    let progress = 0;
    const bar = document.getElementById('progress-bar');
    const status = document.getElementById('init-status');
    const subtext = document.getElementById('init-subtext');
    const enterBtn = document.getElementById('enter-btn');
    
    // Faster initialization
    const interval = setInterval(() => {
        progress += Math.random() * 15; // Increased speed
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            status.innerText = 'System Stabilized';
            subtext.innerText = 'Field Ready.';
            enterBtn.classList.remove('hidden');
            createExplosion(canvas.width/2, canvas.height/2, '#00f2ff', 30);
        }
        bar.style.width = `${progress}%`;
    }, 50);
}

document.getElementById('enter-btn').addEventListener('click', () => {
    document.getElementById('init-screen').classList.add('hidden');
    showLevelSelectGlobal();
});

function showLevelSelectGlobal() {
    // Re-use the logic from the DOMContentLoaded block
    // We'll expose a global version of this function
    const selectScreen = document.getElementById('level-select');
    const grid = document.getElementById('level-select-chart');
    grid.innerHTML = '';
    
    const savedLevel = parseInt(localStorage.getItem('worldInMotion_save_level') || '0');

    for (let i = 0; i < 500; i++) {
        const node = document.createElement('div');
        node.className = 'level-node';
        node.innerText = i + 1;
        
        if (i < savedLevel) {
            node.classList.add('completed');
        } else if (i === savedLevel) {
            node.classList.add('current');
        } else {
            node.classList.add('locked');
            node.style.opacity = '0.3';
            node.style.cursor = 'not-allowed';
        }
        
        node.addEventListener('click', () => {
            if (i <= savedLevel) {
                currentLevel = i;
                selectScreen.classList.add('hidden');
                showBriefing();
            }
        });
        grid.appendChild(node);
    }
    selectScreen.classList.remove('hidden');
}

function showBriefing() {
    gameState = 'BRIEFING';
    document.getElementById('briefing-screen').classList.remove('hidden');
    initAudio();
}

document.getElementById('final-start-btn').addEventListener('click', () => {
    document.getElementById('briefing-screen').classList.add('hidden');
    gameState = 'PLAYING';
    loadProgress();
    initLevel(currentLevel);
});

// Audio System
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Master Gain
    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.08, audioCtx.currentTime); // Lowered for refreshing feel
    masterGain.connect(audioCtx.destination);
    musicNode = masterGain;

    // Mind Refreshing Sine Pulse
    const createRefreshingSynth = (freq, delay) => {
        const osc = audioCtx.createOscillator();
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        
        // Soft LFO for pulsing effect
        lfo.frequency.setValueAtTime(0.5, audioCtx.currentTime);
        lfoGain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, audioCtx.currentTime);
        
        osc.connect(filter);
        filter.connect(masterGain);
        
        lfo.start();
        osc.start();
    };

    createRefreshingSynth(440, 0); // A4
    createRefreshingSynth(554.37, 0.5); // C#5
    createRefreshingSynth(329.63, 1.0); // E4

    updateAudioState();
}

// HUD Button Listeners
document.getElementById('pause-btn').addEventListener('click', () => {
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        pauseTime = Date.now();
        document.getElementById('pause-screen').classList.remove('hidden');
    }
});

document.getElementById('resume-btn').addEventListener('click', () => {
    gameState = 'PLAYING';
    startTime += (Date.now() - pauseTime); // Adjust timer
    document.getElementById('pause-screen').classList.add('hidden');
});

document.getElementById('mute-btn').addEventListener('click', () => {
    settings.music = !settings.music;
    updateAudioState();
});

document.getElementById('exit-btn').addEventListener('click', () => {
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
    gameState = 'MENU';
});

// Also add listener for the briefing screen toggle
document.getElementById('music-toggle').addEventListener('change', (e) => {
    settings.music = e.target.checked;
    updateAudioState();
});

function updateAudioState() {
    const muteBtn = document.getElementById('mute-btn');
    const musicToggle = document.getElementById('music-toggle');
    
    muteBtn.innerText = settings.music ? 'MUTE' : 'UNMUTE';
    if (musicToggle) musicToggle.checked = settings.music;
    
    if (musicNode) {
        musicNode.gain.setTargetAtTime(settings.music ? 0.08 : 0, audioCtx.currentTime, 0.2);
    }
}

document.getElementById('sfx-toggle').addEventListener('change', (e) => {
    settings.sfx = e.target.checked;
});

document.getElementById('shake-toggle').addEventListener('change', (e) => {
    settings.shake = e.target.checked;
});

document.getElementById('next-btn').addEventListener('click', () => {
    document.getElementById('level-complete').classList.add('hidden');
    currentLevel++;
    if (currentLevel >= levels.length) currentLevel = 0; // Loop levels
    gameState = 'PLAYING';
    initLevel(currentLevel);
});

document.getElementById('retry-btn').addEventListener('click', () => {
    document.getElementById('game-over').classList.add('hidden');
    gameState = 'PLAYING';
    if (retries > 0) {
        initLevel(currentLevel);
    } else {
        retries = 3;
        currentLevel = 0;
        saveProgress();
        initLevel(currentLevel);
    }
});

function drawGoal(goal) {
    // Pulsing neon green goal
    const pulse = Math.sin(Date.now() / 200) * 5;
    const gx = goal.x * scale;
    const gy = goal.y * scale;
    const gr = goal.r * scale;

    ctx.beginPath();
    ctx.arc(gx, gy, gr + pulse, 0, Math.PI * 2);
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#39ff14';
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Core
    ctx.beginPath();
    ctx.arc(gx, gy, gr * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(57, 255, 20, 0.3)';
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawBackground() {
    const level = levels[currentLevel];
    const theme = (level && level.theme) ? level.theme : { main: '#00f2ff', accent: '#bc13fe', bg: '#05050a' };
    
    // Background color based on theme
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Twinkling & Moving Starfield
    stars.forEach(star => {
        // Move stars slightly
        star.x += star.vx;
        star.y += star.vy;
        
        // Wrap around
        if (star.x < 0) star.x = canvas.width;
        if (star.x > canvas.width) star.x = 0;
        if (star.y < 0) star.y = canvas.height;
        if (star.y > canvas.height) star.y = 0;

        // Twinkle effect
        star.twinkle += star.twinkleSpeed;
        const opacity = 0.3 + (Math.sin(star.twinkle) + 1) * 0.35;
        
        const sx = (star.x - (mousePos.x * star.speed)) % canvas.width;
        const sy = (star.y - (mousePos.y * star.speed)) % canvas.height;
        
        ctx.beginPath();
        ctx.arc(sx < 0 ? sx + canvas.width : sx, sy < 0 ? sy + canvas.height : sy, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        
        // Add glow to brightest stars
        if (opacity > 0.8) {
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#ffffff';
        }
        
        ctx.fill();
        ctx.shadowBlur = 0;
    });

    // Initialization Simulation
    if (gameState === 'INITIALIZING') {
        const dx = mousePos.x - canvas.width / 2;
        const dy = mousePos.y - canvas.height / 2;
        const angle = Math.atan2(dy, dx);
        const gx = Math.cos(angle) * GRAVITY_STRENGTH;
        const gy = Math.sin(angle) * GRAVITY_STRENGTH;

        initObjects.forEach(o => {
            o.vx += gx;
            o.vy += gy;
            o.vx *= FRICTION;
            o.vy *= FRICTION;
            o.x += o.vx;
            o.y += o.vy;

            // Bounce
            if (o.x < 0 || o.x > canvas.width) o.vx *= -1;
            if (o.y < 0 || o.y > canvas.height) o.vy *= -1;

            ctx.beginPath();
            if (o.type === 'circle') {
                ctx.arc(o.x, o.y, o.size, 0, Math.PI * 2);
            } else {
                ctx.rect(o.x - o.size/2, o.y - o.size/2, o.size, o.size);
            }
            ctx.strokeStyle = o.color;
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Subtle glow
            ctx.shadowBlur = 10;
            ctx.shadowColor = o.color;
            ctx.globalAlpha = 0.5;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 0;
        });
    }

    // Main Menu Galaxy Animation
    if (gameState === 'MENU' || gameState === 'BRIEFING' || gameState === 'LOGIN') {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        galaxyStars.forEach(s => {
            s.angle += s.speed;
            // Add a spiral effect
            const r = s.distance + Math.sin(s.angle * 2) * 20;
            const x = cx + Math.cos(s.angle) * r;
            const y = cy + Math.sin(s.angle) * r;
            
            ctx.beginPath();
            ctx.arc(x, y, s.size, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = s.color;
            ctx.fill();
        });

        // Floating geometric shapes for "Logo Page"
        const time = Date.now() * 0.001;
        for (let i = 0; i < 5; i++) {
            const angle = time + (i * Math.PI * 2 / 5);
            const x = cx + Math.cos(angle) * 250;
            const y = cy + Math.sin(angle * 1.5) * 100;
            
            ctx.strokeStyle = i % 2 === 0 ? '#00f2ff' : '#bc13fe';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(x - 15, y - 15, 30, 30);
            ctx.stroke();
            
            // Connecting lines to center
            ctx.globalAlpha = 0.2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
        ctx.restore();
    }

    // Subtle shifting grid
    const spacing = 150;
    const shiftX = (mousePos.x / canvas.width) * 20;
    const shiftY = (mousePos.y / canvas.height) * 20;

    ctx.strokeStyle = 'rgba(188, 19, 254, 0.1)';
    ctx.lineWidth = 1;

    for (let x = -spacing; x < canvas.width + spacing; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x + shiftX, 0);
        ctx.lineTo(x + shiftX, canvas.height);
        ctx.stroke();
    }
    for (let y = -spacing; y < canvas.height + spacing; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y + shiftY);
        ctx.lineTo(canvas.width, y + shiftY);
        ctx.stroke();
    }
}

function updateTimer() {
    if (gameState !== 'PLAYING') return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const timeLimit = 45; // 45 seconds to finish
    const timeLeft = timeLimit - elapsed;
    
    if (timeLeft <= 0) {
        loseLevel();
        return;
    }
    
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    timerSpan.innerText = `${m}:${s}`;
}

function gameLoop() {
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();

    if (gameState === 'PLAYING') {
        player.update();
        updateTimer();
    } else if (gameState === 'PAUSED') {
        // Just draw everything as it was, but don't update
    }
    
    updateParticles();
    drawParticles();

    // Draw platforms
    const level = levels[currentLevel];
    const theme = level.theme || { main: '#00f2ff', accent: '#bc13fe', bg: '#05050a' };
    
    ctx.shadowBlur = 10;
    const time = Date.now() / 1000;

    level.platforms.forEach(p => {
        ctx.save();
        
        // Behavior Updates
        if (p.type === 'moving' || p.type === 'enemy') {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 20 || p.x + p.w > 780) p.vx *= -1;
            if (p.y < 20 || p.y + p.h > 780) p.vy *= -1;
        } else if (p.type === 'rotating') {
            p.rotation += p.rotationSpeed;
        } else if (p.type === 'disappearing') {
            p.timer += 0.016;
            if (p.timer > 2) {
                p.state = p.state === 'visible' ? 'hidden' : 'visible';
                p.timer = 0;
            }
            if (p.state === 'hidden') {
                ctx.restore();
                return;
            }
        }

        // Color/Style
        if (p.type === 'wall') {
            ctx.fillStyle = '#1a1a2e';
            ctx.shadowColor = 'rgba(188, 19, 254, 0.5)';
        } else if (p.type === 'spike') {
            ctx.fillStyle = '#ff3333';
            ctx.shadowColor = '#ff3333';
        } else if (p.type === 'enemy') {
            ctx.fillStyle = '#ffaa00';
            ctx.shadowColor = '#ffaa00';
        } else {
            ctx.fillStyle = theme.main;
            ctx.shadowColor = theme.accent;
        }

        ctx.shadowBlur = 10;

        // Draw with rotation support
        const cx = (p.x + p.w/2) * scale;
        const cy = (p.y + p.h/2) * scale;
        ctx.translate(cx, cy);
        ctx.rotate(p.rotation || 0);
        
        if (p.type === 'spike') {
            // Draw triangles
            ctx.beginPath();
            ctx.moveTo(-p.w/2 * scale, p.h/2 * scale);
            ctx.lineTo(0, -p.h/2 * scale);
            ctx.lineTo(p.w/2 * scale, p.h/2 * scale);
            ctx.fill();
            
            // Spike Collision
            if (gameState === 'PLAYING') {
                const playerX = player.x;
                const playerY = player.y;
                const dist = Math.hypot(playerX - cx, playerY - cy);
                if (dist < player.radius + 15 * scale) loseLevel();
            }
        } else {
            ctx.fillRect(-p.w/2 * scale, -p.h/2 * scale, p.w * scale, p.h * scale);
        }
        
        ctx.restore();
    });
    ctx.shadowBlur = 0;

    drawGoal(level.goal);

    if (player) player.draw();

    requestAnimationFrame(gameLoop);
}

gameLoop();
