/**
 * World in Motion - Game Engine
 * Core logic for physics, rendering, and levels.
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const levelNumSpan = document.getElementById('level-num');
const timerSpan = document.getElementById('timer');
const gravityArrow = document.getElementById('gravity-arrow');

// Game State
let gameState = 'MENU'; // MENU, INITIALIZING, BRIEFING, PLAYING, WIN, GAMEOVER, PAUSED
let currentLevel = 0;
let startTime = 0;
let pauseTime = 0;
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
    },
    {
        // Maze-like precision level
        platforms: [
            { x: 0, y: 0, w: 800, h: 20 },
            { x: 0, y: 580, w: 800, h: 20 },
            { x: 0, y: 0, w: 20, h: 600 },
            { x: 780, y: 0, w: 20, h: 600 },
            { x: 200, y: 0, w: 20, h: 450 },
            { x: 400, y: 150, w: 20, h: 450 },
            { x: 600, y: 0, w: 20, h: 450 },
        ],
        goal: { x: 700, y: 530, r: 25 },
        start: { x: 100, y: 500 }
    }
];

// Dynamically generate levels 4 to 500 with increasing difficulty
for (let i = 3; i < 500; i++) {
    const difficulty = i / 500;
    const numObstacles = Math.floor(2 + difficulty * 15);
    const platforms = [
        { x: 0, y: 0, w: 800, h: 20 },
        { x: 0, y: 780, w: 800, h: 20 },
        { x: 0, y: 0, w: 20, h: 800 },
        { x: 780, y: 0, w: 20, h: 800 }
    ];

    for (let j = 0; j < numObstacles; j++) {
        const isVertical = Math.random() > 0.5;
        const w = isVertical ? (10 + Math.random() * 20) : (50 + Math.random() * 300);
        const h = isVertical ? (50 + Math.random() * 300) : (10 + Math.random() * 20);
        const x = 50 + Math.random() * (700 - w);
        const y = 50 + Math.random() * (700 - h);
        platforms.push({ x, y, w, h });
    }

    const goalR = Math.max(10, 25 - difficulty * 15);
    
    levels.push({
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
    });
}

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = PLAYER_RADIUS;
        this.trail = [];
    }

    update() {
        // Apply scaled gravity
        this.vx += gravity.x * scale;
        this.vy += gravity.y * scale;

        // Apply friction
        this.vx *= FRICTION;
        this.vy *= FRICTION;

        // Move
        this.x += this.vx;
        this.y += this.vy;

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
            this.checkCollision(sp);
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

    checkCollision(rect) {
        // Find the closest point to the circle within the rectangle
        let closestX = Math.max(rect.x, Math.min(this.x, rect.x + rect.w));
        let closestY = Math.max(rect.y, Math.min(this.y, rect.y + rect.h));

        // Calculate distance between the circle's center and this closest point
        let distanceX = this.x - closestX;
        let distanceY = this.y - closestY;

        let distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);

        if (distanceSquared < (this.radius * this.radius)) {
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
        // Draw trail
        this.trail.forEach((pos, index) => {
            const alpha = 1 - (index / this.trail.length);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, this.radius * alpha, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 242, 255, ${alpha * 0.3})`;
            ctx.fill();
        });

        // Draw player
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        
        // Neon Glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f2ff';
        ctx.fillStyle = '#00f2ff';
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

let player;

function initLevel(idx) {
    const level = levels[idx];
    player = new Player(level.start.x * scale, level.start.y * scale);
    levelNumSpan.innerText = idx + 1;
    startTime = Date.now();
}

function winLevel() {
    if (gameState !== 'PLAYING') return;
    gameState = 'WIN';
    createExplosion(player.x, player.y, '#39ff14', 50);
    
    // Generate Level Chart
    const chart = document.getElementById('level-chart');
    chart.innerHTML = '';
    
    levels.forEach((_, i) => {
        const node = document.createElement('div');
        node.className = 'level-node';
        node.innerText = i + 1;
        
        if (i < currentLevel) {
            node.classList.add('completed');
        } else if (i === currentLevel) {
            node.classList.add('completed'); // Current level just finished
        } else if (i === currentLevel + 1) {
            node.classList.add('unlocking'); // Next level unlocking animation
        } else {
            node.classList.add('locked');
        }
        
        chart.appendChild(node);
    });

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

// UI Buttons
document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('main-menu').classList.add('hidden');
    startInitialization();
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
    
    const interval = setInterval(() => {
        progress += Math.random() * 5;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            status.innerText = 'System Stabilized';
            status.classList.add('glitch');
            subtext.innerText = 'All Fields Synced.';
            enterBtn.classList.remove('hidden');
            createExplosion(canvas.width/2, canvas.height/2, '#00f2ff', 30);
        }
        bar.style.width = `${progress}%`;
        
        if (progress > 30 && progress < 60) status.innerText = 'Stabilizing Gravity Fields...';
        if (progress > 60 && progress < 90) status.innerText = 'Syncing Reality Grid...';
    }, 150);
}

document.getElementById('enter-btn').addEventListener('click', () => {
    document.getElementById('init-screen').classList.add('hidden');
    showBriefing();
});

function showBriefing() {
    gameState = 'BRIEFING';
    document.getElementById('briefing-screen').classList.remove('hidden');
    initAudio();
}

document.getElementById('final-start-btn').addEventListener('click', () => {
    document.getElementById('briefing-screen').classList.add('hidden');
    gameState = 'PLAYING';
    initLevel(0);
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
    initLevel(currentLevel);
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
    if (gameState === 'MENU' || gameState === 'BRIEFING') {
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
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
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
    ctx.fillStyle = '#1a1a2e';
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(188, 19, 254, 0.5)';
    level.platforms.forEach(p => {
        ctx.fillRect(p.x * scale, p.y * scale, p.w * scale, p.h * scale);
    });
    ctx.shadowBlur = 0;

    drawGoal(level.goal);

    if (player) player.draw();

    requestAnimationFrame(gameLoop);
}

gameLoop();
