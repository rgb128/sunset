'use strict';

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================

// System & Fixed Canvas Resolution (3000x1000)
const CANVAS_ID = 'main-canvas';
const CTX_TYPE = '2d';
const CANVAS_BASE_WIDTH = 3000;
const CANVAS_BASE_HEIGHT = 1000;
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

// Global runtime variables for synchronization and animation control
let currentAnimationId = null;
let isRegenerating = false;
let serverTimeOffsetMs = 0;
let dailyMasterSeed = 133799; // Fallback seed
const UNIVERSAL_RECTANGLE_SEED = 999999; // Always identical for everyone worldwide

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

const fetchTimeAndBuildDailySeed = async () => {
    try {
        const startLocalMs = performance.now();
        const response = await fetch('https://time.now/developer/api/time', { cache: 'no-store' });
        const data = await response.json();
        
        if (data && data.datetime) {
            const serverTimeMs = new Date(data.datetime).getTime();
            const endLocalMs = performance.now();
            const networkLatency = (endLocalMs - startLocalMs) / 2;
            
            const currentLocalMs = Date.now();
            serverTimeOffsetMs = (serverTimeMs + networkLatency) - currentLocalMs;

            // Extract YYYYMMDD from datetime string (e.g., "2026-10-24T...")
            const dateStr = data.datetime.substring(0, 10).replace(/-/g, '');
            dailyMasterSeed = parseInt(dateStr, 10);
            return;
        }
    } catch (error) {
        // Fallback gracefully if API is blocked or offline
    }

    try {
        const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
        const dateHeader = response.headers.get('Date');
        if (dateHeader) {
            const serverDate = new Date(dateHeader);
            serverTimeOffsetMs = serverDate.getTime() - Date.now();
            
            const yyyy = serverDate.getUTCFullYear();
            const mm = String(serverDate.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(serverDate.getUTCDate()).padStart(2, '0');
            dailyMasterSeed = parseInt(`${yyyy}${mm}${dd}`, 10);
            return;
        }
    } catch (error) {
        serverTimeOffsetMs = 0;
    }

    // Ultimate fallback if everything fails
    const fallbackDate = new Date();
    const yyyy = fallbackDate.getUTCFullYear();
    const mm = String(fallbackDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(fallbackDate.getUTCDate()).padStart(2, '0');
    dailyMasterSeed = parseInt(`${yyyy}${mm}${dd}`, 10);
};

const getSynchronizedTimeMs = () => {
    return Date.now() + serverTimeOffsetMs;
};

const startBackgroundTimeResync = () => {
    setInterval(async () => {
        await fetchTimeAndBuildDailySeed();
    }, 10000);
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
// OFFSCREEN SUNSET GENERATION (Daily Master Seed)
// ==========================================

const drawLandscape = (ctx, width, height, seed) => {
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    
    const offsetX = getSeededFloat(seed + 1, 0, 1000);
    const offsetY = getSeededFloat(seed + 2, 0, 1000);
    
    for (let y = 0; y < height; y++) {
        const normalizedY = y / height;
        
        for (let x = 0; x < width; x++) {
            const nx = (x + offsetX) * SCALE_X;
            const ny = (y + offsetY) * SCALE_Y;
            
            const warp1 = fbm(nx, ny, NOISE_OCTAVES, seed + 10);
            const warp2 = fbm(nx + WARP_OFFSET, ny + WARP_OFFSET, NOISE_OCTAVES, seed + 20);
            
            const distortedX = nx + (warp1 * WARP_STRENGTH_X);
            const distortedY = ny + (warp2 * WARP_STRENGTH_Y);
            
            const noiseVal = fbm(distortedX, distortedY, NOISE_OCTAVES, seed + 30);
            
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

const drawHorizonSilhouette = (ctx, width, height, seed) => {
    const maxMountainHeight = height * SILHOUETTE_HEIGHT_RATIO;
    const mountainSeed = getSeededFloat(seed + 40, 0, 1000);
    
    ctx.beginPath();
    ctx.moveTo(0, height);
    
    for (let x = 0; x <= width; x += MOUNTAIN_STEP) {
        const nx = x * 0.005;
        const noiseVal = fbm(nx + mountainSeed, mountainSeed, SILHOUETTE_OCTAVES, seed + 50);
        
        const yOffset = noiseVal * maxMountainHeight;
        const yPos = height - yOffset;
        
        ctx.lineTo(x, yPos);
    }
    
    ctx.lineTo(width, height);
    ctx.closePath();
    
    ctx.fillStyle = SILHOUETTE_COLOR;
    ctx.fill();
};

const createOffscreenSunset = (width, height, seed) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext(CTX_TYPE);

    drawLandscape(ctx, width, height, seed);
    drawHorizonSilhouette(ctx, width, height, seed);

    return ctx.getImageData(0, 0, width, height);
};

// ==========================================
// UNIVERSALLY DETERMINISTIC PARTICLE SYSTEM
// ==========================================

const initCubistParticles = (targetArea) => {
    const particles = [];

    for (let i = 0; i < RECTANGLE_COUNT; i++) {
        // Uses UNIVERSAL_RECTANGLE_SEED so rectangles are 100% identical for everyone worldwide
        const particleSeed = UNIVERSAL_RECTANGLE_SEED + i * 7;
        
        particles.push({
            id: i,
            baseX: getSeededFloat(particleSeed + 1, 0, CANVAS_BASE_WIDTH),
            baseY: getSeededFloat(particleSeed + 2, 0, CANVAS_BASE_HEIGHT),
            vx: getSeededFloat(particleSeed + 3, DRIFT_SPEED_MIN, DRIFT_SPEED_MAX) * (getSeededRandom(particleSeed + 4) < 0.5 ? 1 : -1),
            vy: getSeededFloat(particleSeed + 5, DRIFT_SPEED_MIN, DRIFT_SPEED_MAX) * (getSeededRandom(particleSeed + 6) < 0.5 ? 1 : -1),
            ratioSeed: getSeededFloat(particleSeed + 7, 0, 100),
            area: targetArea
        });
    }

    return particles;
};

const updateAndDrawParticles = (ctx, width, height, pixels, particles, timeMs) => {
    ctx.fillStyle = MAIN_BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    const t = timeMs * TIME_SCALE;

    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        let vx = (p.baseX + (p.vx * t * 50)) % width;
        let vy = (p.baseY + (p.vy * t * 50)) % height;

        if (vx < 0) vx += width;
        if (vy < 0) vy += height;

        const ratioWave = Math.sin(t * MORPH_SPEED * 10 + p.ratioSeed);
        const currentRatioPower = lerp(RATIO_EXP_MIN, RATIO_EXP_MAX, (ratioWave + 1) * MATH_HALF);

        const ratio = Math.pow(BASE_TEN, currentRatioPower);
        const rectWidth = Math.sqrt(p.area * ratio);
        const rectHeight = Math.sqrt(p.area / ratio);

        const sampleX = Math.floor(vx);
        const sampleY = Math.floor(vy);
        const pixelIndex = (sampleY * width + sampleX) * NUM_CHANNELS;

        const r = pixels[pixelIndex];
        const g = pixels[pixelIndex + 1];
        const b = pixels[pixelIndex + 2];

        const drawX = vx - (rectWidth * MATH_HALF);
        const drawY = vy - (rectHeight * MATH_HALF);

        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(drawX, drawY, rectWidth, rectHeight);
    }
};

// ==========================================
// SCALING & COVER HEIGHT LAYOUT HANDLER
// ==========================================

const updateCanvasHeightCoverScaling = (canvas) => {
    const viewport = canvas.parentElement;
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;

    const scale = viewportHeight / CANVAS_BASE_HEIGHT;

    const scaledWidth = CANVAS_BASE_WIDTH * scale;
    const scaledHeight = CANVAS_BASE_HEIGHT * scale;

    canvas.style.width = scaledWidth + 'px';
    canvas.style.height = scaledHeight + 'px';
    canvas.style.left = ((viewportWidth - scaledWidth) * MATH_HALF) + 'px';
    canvas.style.top = '0px';
};

// ==========================================
// SYNCHRONIZED EXECUTION
// ==========================================

const generateAnimatedSunset = async (isManualClick = false) => {
    if (isRegenerating) {
        return;
    }
    isRegenerating = true;

    await fetchTimeAndBuildDailySeed();

    const canvas = document.getElementById(CANVAS_ID);
    const ctx = canvas.getContext(CTX_TYPE);
    
    canvas.width = CANVAS_BASE_WIDTH;
    canvas.height = CANVAS_BASE_HEIGHT;

    updateCanvasHeightCoverScaling(canvas);

    // If clicked manually, generate a random seed for testing purposes, otherwise use daily seed
    const activeSeed = isManualClick ? Math.floor(Math.random() * 100000000) : dailyMasterSeed;

    const sunsetData = createOffscreenSunset(CANVAS_BASE_WIDTH, CANVAS_BASE_HEIGHT, activeSeed);
    const pixels = sunsetData.data;

    const targetArea = (CANVAS_BASE_WIDTH * CANVAS_BASE_HEIGHT) * AREA_FRACTION;
    const particles = initCubistParticles(targetArea);

    if (currentAnimationId) {
        cancelAnimationFrame(currentAnimationId);
    }

    const animate = () => {
        const syncTimeMs = getSynchronizedTimeMs();
        // const syncTimeMs = isManualClick ? performance.now() : getSynchronizedTimeMs();
        updateAndDrawParticles(ctx, CANVAS_BASE_WIDTH, CANVAS_BASE_HEIGHT, pixels, particles, syncTimeMs);
        currentAnimationId = requestAnimationFrame(animate);
    };

    currentAnimationId = requestAnimationFrame(animate);
    isRegenerating = false;
};

// ==========================================
// INITIALIZATION
// ==========================================

window.onload = async () => {
    const canvas = document.getElementById(CANVAS_ID);
    
    canvas.addEventListener('click', () => {
        if (!isRegenerating) {
            generateAnimatedSunset(true); // true triggers local random mode on click
        }
    });
    
    await generateAnimatedSunset(false); // false triggers daily synchronized mode on load
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            canvas.classList.remove(CSS_FADE_CLASS);
        });
    });

    window.addEventListener('resize', () => {
        updateCanvasHeightCoverScaling(canvas);
    });

    startBackgroundTimeResync();
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
            const width = CANVAS_BASE_WIDTH;
            const height = CANVAS_BASE_HEIGHT;
            
            const sunsetImageData = createOffscreenSunset(width, height, dailyMasterSeed);
            
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
            debugCanvas.style.objectFit = 'cover';
            
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
