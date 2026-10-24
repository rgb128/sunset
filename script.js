'use strict';

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================

// System
const CANVAS_ID = 'main-canvas';
const CTX_TYPE = '2d';
const NUM_CHANNELS = 4;
const MATH_HALF = 0.5;
const BASE_TEN = 10;

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

// Resize & Regeneration Timing Constants
const RESIZE_DEBOUNCE_DELAY_MS = 300;
const REGENERATE_SHOW_DELAY_MS = 2000;

// Global runtime variables for animation control
let currentAnimationId = null;
let isRegenerating = false;

// ==========================================
// UTILITIES & NOISE GENERATOR
// ==========================================

const getRandomFloat = (min, max) => {
    return Math.random() * (max - min) + min;
};

const getRandomInt = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const lerp = (a, b, t) => {
    return a + (b - a) * t;
};

const randomTable = new Float32Array(TABLE_SIZE * 2);
for (let i = 0; i < TABLE_SIZE * 2; i++) {
    randomTable[i] = Math.random();
}

const smoothstep = (t) => {
    return t * t * (3 - 2 * t);
};

const noise2D = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    
    const xf = x - xi;
    const yf = y - yi;
    
    const rx0 = xi & TABLE_MASK;
    const rx1 = (rx0 + 1) & TABLE_MASK;
    const ry0 = yi & TABLE_MASK;
    const ry1 = (ry0 + 1) & TABLE_MASK;
    
    const c00 = randomTable[rx0 + ry0];
    const c10 = randomTable[rx1 + ry0];
    const c01 = randomTable[rx0 + ry1];
    const c11 = randomTable[rx1 + ry1];
    
    const sx = smoothstep(xf);
    const sy = smoothstep(yf);
    
    const nx0 = lerp(c00, c10, sx);
    const nx1 = lerp(c01, c11, sx);
    
    return lerp(nx0, nx1, sy);
};

const fbm = (x, y, octaves) => {
    let total = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
        total += noise2D(x * frequency, y * frequency) * amplitude;
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
    
    const offsetX = Math.random() * 1000;
    const offsetY = Math.random() * 1000;
    
    for (let y = 0; y < height; y++) {
        const normalizedY = y / height;
        
        for (let x = 0; x < width; x++) {
            const nx = (x + offsetX) * SCALE_X;
            const ny = (y + offsetY) * SCALE_Y;
            
            const warp1 = fbm(nx, ny, NOISE_OCTAVES);
            const warp2 = fbm(nx + WARP_OFFSET, ny + WARP_OFFSET, NOISE_OCTAVES);
            
            const distortedX = nx + (warp1 * WARP_STRENGTH_X);
            const distortedY = ny + (warp2 * WARP_STRENGTH_Y);
            
            const noiseVal = fbm(distortedX, distortedY, NOISE_OCTAVES);
            
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
    const mountainSeed = Math.random() * 1000;
    
    ctx.beginPath();
    ctx.moveTo(0, height);
    
    for (let x = 0; x <= width; x += MOUNTAIN_STEP) {
        const nx = x * 0.005;
        const noiseVal = fbm(nx + mountainSeed, mountainSeed, SILHOUETTE_OCTAVES);
        
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
// ANIMATED CUBIST MOSAIC SYSTEM
// ==========================================

const initCubistParticles = (width, height, targetArea) => {
    const particles = [];

    for (let i = 0; i < RECTANGLE_COUNT; i++) {
        const initialPower = getRandomFloat(RATIO_EXP_MIN, RATIO_EXP_MAX);
        const targetPower = getRandomFloat(RATIO_EXP_MIN, RATIO_EXP_MAX);

        particles.push({
            x: getRandomInt(0, width - 1),
            y: getRandomInt(0, height - 1),
            vx: getRandomFloat(DRIFT_SPEED_MIN, DRIFT_SPEED_MAX) * (Math.random() < 0.5 ? 1 : -1),
            vy: getRandomFloat(DRIFT_SPEED_MIN, DRIFT_SPEED_MAX) * (Math.random() < 0.5 ? 1 : -1),
            currentRatioPower: initialPower,
            targetRatioPower: targetPower,
            area: targetArea
        });
    }

    return particles;
};

const updateAndDrawParticles = (ctx, width, height, pixels, particles) => {
    ctx.fillStyle = MAIN_BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        p.currentRatioPower = lerp(p.currentRatioPower, p.targetRatioPower, MORPH_SPEED);
        
        if (Math.abs(p.targetRatioPower - p.currentRatioPower) < 0.05) {
            p.targetRatioPower = getRandomFloat(RATIO_EXP_MIN, RATIO_EXP_MAX);
        }

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x += width;
        if (p.x >= width) p.x -= width;
        if (p.y < 0) p.y += height;
        if (p.y >= height) p.y -= height;

        const ratio = Math.pow(BASE_TEN, p.currentRatioPower);
        const rectWidth = Math.sqrt(p.area * ratio);
        const rectHeight = Math.sqrt(p.area / ratio);

        const sampleX = Math.floor(p.x);
        const sampleY = Math.floor(p.y);
        const pixelIndex = (sampleY * width + sampleX) * NUM_CHANNELS;

        const r = pixels[pixelIndex];
        const g = pixels[pixelIndex + 1];
        const b = pixels[pixelIndex + 2];

        const drawX = p.x - (rectWidth * MATH_HALF);
        const drawY = p.y - (rectHeight * MATH_HALF);

        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(drawX, drawY, rectWidth, rectHeight);
    }
};

// ==========================================
// OVERLAY & RESIZE HANDLING
// ==========================================

const ensureOverlayElement = () => {
    let overlay = document.getElementById('regeneration-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'regeneration-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0px';
        overlay.style.left = '0px';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = '#000000';
        overlay.style.color = '#808080';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.fontSize = '24px';
        overlay.style.fontWeight = 'bold';
        overlay.style.fontFamily = 'sans-serif';
        overlay.style.zIndex = '999999';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.5s ease-in-out';
        overlay.style.pointerEvents = 'none';
        overlay.textContent = 'regenerating...';
        document.body.appendChild(overlay);
    }
    return overlay;
};

const setOverlayVisible = (visible) => {
    const overlay = ensureOverlayElement();
    if (visible) {
        overlay.style.pointerEvents = 'auto';
        overlay.style.opacity = '1';
    } else {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.pointerEvents = 'none';
        }, 500);
    }
};

const generateAnimatedSunset = () => {
    const canvas = document.getElementById(CANVAS_ID);
    const ctx = canvas.getContext(CTX_TYPE);
    
    // Fixed high-res base dimensions so stretching always looks clean and sharp
    const baseWidth = 2000;
    const baseHeight = 1000;
    
    canvas.width = baseWidth;
    canvas.height = baseHeight;

    const sunsetData = createOffscreenSunset(baseWidth, baseHeight);
    const pixels = sunsetData.data;

    const targetArea = (baseWidth * baseHeight) * AREA_FRACTION;
    const particles = initCubistParticles(baseWidth, baseHeight, targetArea);

    if (currentAnimationId) {
        cancelAnimationFrame(currentAnimationId);
    }

    const animate = () => {
        updateAndDropParticlesSafe(ctx, baseWidth, baseHeight, pixels, particles);
        currentAnimationId = requestAnimationFrame(animate);
    };

    const updateAndDropParticlesSafe = (c, w, h, pix, parts) => {
        if (!isRegenerating) {
            updateAndDrawParticles(c, w, h, pix, parts);
        }
    };

    currentAnimationId = requestAnimationFrame(animate);
};

const setupResizeHandler = () => {
    let resizeTimer = null;

    window.addEventListener('resize', () => {
        if (isRegenerating) {
            return;
        }

        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            isRegenerating = true;
            setOverlayVisible(true);

            setTimeout(() => {
                generateAnimatedSunset();
                isRegenerating = false;
                setOverlayVisible(false);
            }, REGENERATE_SHOW_DELAY_MS);

        }, RESIZE_DEBOUNCE_DELAY_MS);
    });
};

// ==========================================
// INITIALIZATION
// ==========================================

window.onload = () => {
    generateAnimatedSunset();
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
