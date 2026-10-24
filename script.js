'use strict';

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================

// System & Fixed Layout Resolution
const CANVAS_ID = 'main-canvas';
const CTX_TYPE = '2d';
const VIRTUAL_WIDTH = 2000;
const VIRTUAL_HEIGHT = 1000;
const NUM_CHANNELS = 4;
const MATH_HALF = 0.5;
const BASE_TEN = 10;
const CSS_FADE_CLASS = 'fade';

// Algorithm Configuration
const RECTANGLE_COUNT = 4000;
const AREA_FRACTION = 0.01;
const MAIN_BG_COLOR = '#808080';

// Animation & Physics Constants
const ANIMATION_SPEED_MULTIPLIER = 0.2;
const DRIFT_SPEED_MIN = 0.2 * ANIMATION_SPEED_MULTIPLIER;
const DRIFT_SPEED_MAX = 0.8 * ANIMATION_SPEED_MULTIPLIER;
const MORPH_SPEED = 0.02 * ANIMATION_SPEED_MULTIPLIER;
const RATIO_EXP_MIN = -1.6 * ANIMATION_SPEED_MULTIPLIER;
const RATIO_EXP_MAX = 1.6 * ANIMATION_SPEED_MULTIPLIER;
const TIME_SCALE = 0.001;

// Noise & Mathematics
const TABLE_SIZE = 256;
const TABLE_MASK = 255;
const NOISE_OCTAVES = 5;
const NOISE_PERSISTENCE = 0.5;
const NOISE_LACUNARITY = 2.0;

// Cloud Shape Configuration
const SCALE_X = 0.0015;
const SCALE_Y = 0.005;
const WARP_STRENGTH_X = 2.0;
const WARP_STRENGTH_Y = 1.0;
const WARP_OFFSET = 5.2;

// Landscape Configuration
const HORIZON_RATIO = 0.75; 

// Full Sunset Spectrum
const PALETTE = [
    { r: 20,  g: 15,  b: 50  }, // Deep Night Blue (Top)
    { r: 75,  g: 20,  b: 95  }, // Rich Purple
    { r: 180, g: 30,  b: 90  }, // Magenta / Hot Pink
    { r: 230, g: 45,  b: 25  }, // Red
    { r: 255, g: 110, b: 10  }, // Orange
    { r: 255, g: 195, b: 20  }  // Yellow-Orange
];
const PALETTE_OFFSET = 1;
const RGB_ALPHA_OPAQUE = 255;
const PIXEL_DATA_STEP = 4;

// Horizon Silhouette
const SILHOUETTE_COLOR = '#000000';
const SILHOUETTE_HEIGHT_RATIO = 0.15;
const SILHOUETTE_OCTAVES = 4;
const MOUNTAIN_STEP = 2;

// Resize Timing Constants
const RESIZE_DEBOUNCE_DELAY_MS = 300;

// Global runtime variables for synchronization and animation control
let currentAnimationId = null;
let isRegenerating = false;
let serverTimeOffsetMs = 0;
const GLOBAL_MASTER_SEED = 133799; // Universal constant seed for identical geometry layout everywhere

// ==========================================
// SEEDED PRNG (Mulberry32)
// ==========================================

const getSeededRandom = (seedValue) => {
    let t = seedValue += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

const getSeededFloat = (seedValue, min, max) => {
    return getSeededRandom(seedValue) * (max - min) + min;
};

// ==========================================
// HIGH-PRECISION TIME SYNCHRONIZATION (time.now API)
// ==========================================

const fetchHighPrecisionTimeOffset = async () => {
    const startLocalMs = performance.now();
    try {
        const response = await fetch('https://time.now/developer/api/time', { cache: 'no-store' });
        const data = await response.json();
        
        if (data && data.datetime) {
            const serverTimeMs = new Date(data.datetime).getTime();
            const endLocalMs = performance.now();
            const networkLatency = (endLocalMs - startLocalMs) / 2;
            
            const currentLocalMs = Date.now();
            serverTimeOffsetMs = (serverTimeMs + networkLatency) - currentLocalMs;
            return;
        }
    } catch (error) {
        // Fallback gracefully if API is blocked or offline
    }

    try {
        const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
        const dateHeader = response.headers.get('Date');
        if (dateHeader) {
            const serverTimeMs = new Date(dateHeader).getTime();
            serverTimeOffsetMs = serverTimeMs - Date.now();
        }
    } catch (error) {
        serverTimeOffsetMs = 0;
    }
};

const getSynchronizedTimeMs = () => {
    return Date.now() + serverTimeOffsetMs;
};

// ==========================================
// UTILITIES & DETERMINISTIC NOISE
// ==========================================

const lerp = (a, b, t) => {
    return a + (b - a) * t;
};

const smoothstep = (t) => {
    return t * t * (3 - 2 * t);
};

const noise2D = (x, y, seed) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    
    const xf = x - xi;
    const yf = y - yi;
    
    const hash = (px, py) => {
        let s = Math.imul(px, 374761393) + Math.imul(py, 668265261) + Math.imul(seed, 14469 );
        return getSeededRandom(s);
    };

    const c00 = hash(xi, yi);
    const c10 = hash(xi + 1, yi);
    const c01 = hash(xi, yi + 1);
    const c11 = hash(xi + 1, yi + 1);
    
    const sx = smoothstep(xf);
    const sy = smoothstep(yf);
    
    const nx0 = lerp(c00, c10, sx);
    const nx1 = lerp(c01, c11, sx);
    
    return lerp(nx0, nx1, sy);
};

const fbm = (x, y, octaves, seed) => {
    let total = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
        total += noise2D(x * frequency, y * frequency, seed + i) * amplitude;
        maxValue += amplitude;
        amplitude *= NOISE_PERSISTENCE;
        frequency *= NOISE_LACUNARITY;
    }
    
    return total / maxValue;
};

const getColorForValue = (value) => {
    const clamped = Math.max(0, Math.min(1, value));
    
    const maxIndex = PALETTE.length - PALETTE_OFFSET;
    const scaledValue = clamped * maxIndex;
    
    const index1 = Math.floor(scaledValue);
    const index2 = Math.min(index1 + PALETTE_OFFSET, maxIndex);
    
    const blend = scaledValue - index1;
    
    const c1 = PALETTE[index1];
    const c2 = PALETTE[index2];
    
    return {
        r: lerp(c1.r, c2.r, blend),
        g: lerp(c1.g, c2.g, blend),
        b: lerp(c1.b, c2.b, blend)
    };
};

// ==========================================
// OFFSCREEN SUNSET GENERATION
// ==========================================

const drawLandscape = (ctx, width, height) => {
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    
    const offsetX = getSeededFloat(GLOBAL_MASTER_SEED + 1, 0, 1000);
    const offsetY = getSeededFloat(GLOBAL_MASTER_SEED + 2, 0, 1000);
    
    for (let y = 0; y < height; y++) {
        const normalizedY = y / height;
        
        for (let x = 0; x < width; x++) {
            const nx = (x + offsetX) * SCALE_X;
            const ny = (y + offsetY) * SCALE_Y;
            
            const warp1 = fbm(nx, ny, NOISE_OCTAVES, GLOBAL_MASTER_SEED + 10);
            const warp2 = fbm(nx + WARP_OFFSET, ny + WARP_OFFSET, NOISE_OCTAVES, GLOBAL_MASTER_SEED + 20);
            
            const distortedX = nx + (warp1 * WARP_STRENGTH_X);
            const distortedY = ny + (warp2 * WARP_STRENGTH_Y);
            
            const noiseVal = fbm(distortedX, distortedY, NOISE_OCTAVES, GLOBAL_MASTER_SEED + 30);
            
            const finalValue = (noiseVal * 0.4) + (normalizedY * 0.6);
            
            const color = getColorForValue(finalValue);
            
            const pixelIndex = (y * width + x) * PIXEL_DATA_STEP;
            data[pixelIndex] = color.r;
            data[pixelIndex + 1] = color.g;
            data[pixelIndex + 2] = color.b;
            data[pixelIndex + 3] = RGB_ALPHA_OPAQUE;
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
};

const drawHorizonSilhouette = (ctx, width, height) => {
    const maxMountainHeight = height * SILHOUETTE_HEIGHT_RATIO;
    const mountainSeed = getSeededFloat(GLOBAL_MASTER_SEED + 40, 0, 1000);
    
    ctx.beginPath();
    ctx.moveTo(0, height);
    
    for (let x = 0; x <= width; x += MOUNTAIN_STEP) {
        const nx = x * 0.005;
        const noiseVal = fbm(nx + mountainSeed, mountainSeed, SILHOUETTE_OCTAVES, GLOBAL_MASTER_SEED + 50);
        
        const yOffset = noiseVal * maxMountainHeight;
        const yPos = height - yOffset;
        
        ctx.lineTo(x, yPos);
    }
    
    ctx.lineTo(width, height);
    ctx.closePath();
    
    ctx.fillStyle = SILHOUETTE_COLOR;
    ctx.fill();
};

const createOffscreenSunset = (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext(CTX_TYPE);

    drawLandscape(ctx, width, height);
    drawHorizonSilhouette(ctx, width, height);

    return ctx.getImageData(0, 0, width, height);
};

// ==========================================
// UNIVERSALLY DETERMINISTIC PARTICLE SYSTEM
// ==========================================

const initCubistParticles = (targetArea) => {
    const particles = [];

    for (let i = 0; i < RECTANGLE_COUNT; i++) {
        const particleSeed = GLOBAL_MASTER_SEED + i * 7;
        
        particles.push({
            id: i,
            baseX: getSeededFloat(particleSeed + 1, 0, VIRTUAL_WIDTH),
            baseY: getSeededFloat(particleSeed + 2, 0, VIRTUAL_HEIGHT),
            vx: getSeededFloat(particleSeed + 3, DRIFT_SPEED_MIN, DRIFT_SPEED_MAX) * (getSeededRandom(particleSeed + 4) < 0.5 ? 1 : -1),
            vy: getSeededFloat(particleSeed + 5, DRIFT_SPEED_MIN, DRIFT_SPEED_MAX) * (getSeededRandom(particleSeed + 6) < 0.5 ? 1 : -1),
            ratioSeed: getSeededFloat(particleSeed + 7, 0, 100),
            virtualArea: targetArea
        });
    }

    return particles;
};

const updateAndDrawParticles = (ctx, screenWidth, screenHeight, localPixels, particles, timeMs) => {
    ctx.fillStyle = MAIN_BG_COLOR;
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    const t = timeMs * TIME_SCALE;

    const scaleX = screenWidth / VIRTUAL_WIDTH;
    const scaleY = screenHeight / VIRTUAL_HEIGHT;

    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        let vx = (p.baseX + (p.vx * t * 50)) % VIRTUAL_WIDTH;
        let vy = (p.baseY + (p.vy * t * 50)) % VIRTUAL_HEIGHT;

        if (vx < 0) vx += VIRTUAL_WIDTH;
        if (vy < 0) vy += VIRTUAL_HEIGHT;

        const ratioWave = Math.sin(t * MORPH_SPEED * 10 + p.ratioSeed);
        const currentRatioPower = lerp(RATIO_EXP_MIN, RATIO_EXP_MAX, (ratioWave + 1) * MATH_HALF);

        const ratio = Math.pow(BASE_TEN, currentRatioPower);
        const virtualRectWidth = Math.sqrt(p.virtualArea * ratio);
        const virtualRectHeight = Math.sqrt(p.virtualArea / ratio);

        const screenPx = vx * scaleX;
        const screenPy = vy * scaleY;
        const screenRectWidth = virtualRectWidth * scaleX;
        const screenRectHeight = virtualRectHeight * scaleY;

        const sampleX = Math.floor(screenPx);
        const sampleY = Math.floor(screenPy);
        const clampedSampleX = Math.max(0, Math.min(screenWidth - 1, sampleX));
        const clampedSampleY = Math.max(0, Math.min(screenHeight - 1, sampleY));
        const pixelIndex = (clampedSampleY * screenWidth + clampedSampleX) * NUM_CHANNELS;

        const r = localPixels[pixelIndex];
        const g = localPixels[pixelIndex + 1];
        const b = localPixels[pixelIndex + 2];

        const drawX = screenPx - (screenRectWidth * MATH_HALF);
        const drawY = screenPy - (screenRectHeight * MATH_HALF);

        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(drawX, drawY, screenRectWidth, screenRectHeight);
    }
};

// ==========================================
// RESIZE & SYNCHRONIZED EXECUTION
// ==========================================

const generateAnimatedSunset = async () => {
    if (isRegenerating) {
        return;
    }
    isRegenerating = true;

    await fetchHighPrecisionTimeOffset();

    const canvas = document.getElementById(CANVAS_ID);
    const ctx = canvas.getContext(CTX_TYPE);
    
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    canvas.width = screenWidth;
    canvas.height = screenHeight;
    canvas.style.width = screenWidth + 'px';
    canvas.style.height = screenHeight + 'px';

    const localSunsetData = createOffscreenSunset(screenWidth, screenHeight);
    const localPixels = localSunsetData.data;

    const targetArea = (VIRTUAL_WIDTH * VIRTUAL_HEIGHT) * AREA_FRACTION;
    const particles = initCubistParticles(targetArea);

    if (currentAnimationId) {
        cancelAnimationFrame(currentAnimationId);
    }

    const animate = () => {
        const syncTimeMs = getSynchronizedTimeMs();
        updateAndDrawParticles(ctx, screenWidth, screenHeight, localPixels, particles, syncTimeMs);
        currentAnimationId = requestAnimationFrame(animate);
    };

    currentAnimationId = requestAnimationFrame(animate);
    isRegenerating = false;
};

const setupResizeHandler = () => {
    let resizeTimer = null;

    window.addEventListener('resize', () => {
        if (isRegenerating) {
            return;
        }

        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            generateAnimatedSunset();
        }, RESIZE_DEBOUNCE_DELAY_MS);
    });
};

// ==========================================
// INITIALIZATION
// ==========================================

window.onload = async () => {
    const canvas = document.getElementById(CANVAS_ID);
    
    canvas.addEventListener('click', () => {
        if (!isRegenerating) {
            generateAnimatedSunset();
        }
    });
    
    await generateAnimatedSunset();
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            canvas.classList.remove(CSS_FADE_CLASS);
        });
    });

    setupResizeHandler();
};

// ==========================================
// DEBUGGING FUNCTION (Fullscreen Toggle)
// ==========================================

const toggleDebugOriginalSunset = (enable) => {
    const CANVAS_DOM_ID = 'main-canvas';
    const DEBUG_ELEMENT_ID = 'debug-original-sunset-view';
    const canvas = document.getElementById(CANVAS_DOM_ID);
    
    if (!canvas) {
        return;
    }

    let debugCanvas = document.getElementById(DEBUG_ELEMENT_ID);

    if (enable) {
        if (!debugCanvas) {
            const width = window.innerWidth;
            const height = window.innerHeight;
            
            const sunsetImageData = createOffscreenSunset(width, height);
            
            debugCanvas = document.createElement('canvas');
            debugCanvas.id = DEBUG_ELEMENT_ID;
            debugCanvas.width = width;
            debugCanvas.height = height;
            
            debugCanvas.style.position = 'fixed';
            debugCanvas.style.top = '0px';
            debugCanvas.style.left = '0px';
            debugCanvas.style.width = '100vw';
            debugCanvas.style.height = '100vh';
            debugCanvas.style.zIndex = '99999';
            debugCanvas.style.display = 'block';
            debugCanvas.style.objectFit = 'fill';
            
            const debugCtx = debugCanvas.getContext('2d');
            debugCtx.putImageData(sunsetImageData, 0, 0);
            
            document.body.appendChild(debugCanvas);
        } else {
            debugCanvas.style.display = 'block';
        }
    } else {
        if (debugCanvas) {
            debugCanvas.style.display = 'none';
        }
    }
};
