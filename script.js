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
const RECTANGLE_COUNT = 4000;      // Lowered slightly to ensure buttery 60 FPS animation
const AREA_FRACTION = 0.01;
const MAIN_BG_COLOR = '#808080';

// Animation & Physics Constants
const DRIFT_SPEED_MIN = 0.2;
const DRIFT_SPEED_MAX = 0.8;
const MORPH_SPEED = 0.02;          // Speed at which aspect ratios smoothly morph
const RATIO_EXP_MIN = -1.6;
const RATIO_EXP_MAX = 1.6;

// Noise & Mathematics
const TABLE_SIZE = 256;
const TABLE_MASK = 255;
const NOISE_OCTAVES = 5;
const NOISE_PERSISTENCE = 0.5;
const NOISE_LACUNARITY = 2.0;

// Cloud & Water Shape Configuration
const SCALE_X = 0.0015;
const SCALE_Y = 0.005;
const WARP_STRENGTH_X = 2.0;
const WARP_STRENGTH_Y = 1.0;
const WARP_OFFSET = 5.2;

// Landscape Configuration
const HORIZON_RATIO = 0.52;
const WATER_RIPPLE_SCALE = 1.8;
const WATER_DARKEN_FACTOR = 0.85;

// Rich Sunset Palette
const PALETTE = [
    { r: 25,  g: 30,  b: 95  }, // Deep Blue
    { r: 100, g: 30,  b: 110 }, // Purple / Violet
    { r: 210, g: 45,  b: 115 }, // Vibrant Hot Pink / Magenta
    { r: 220, g: 50,  b: 40  }, // Crimson Red
    { r: 255, g: 100, b: 10  }, // Vivid Orange
    { r: 255, g: 190, b: 0   }, // Bright Golden Yellow
    { r: 255, g: 240, b: 170 }  // Pale Yellow Glow at horizon
];
const PALETTE_OFFSET = 1;
const RGB_ALPHA_OPAQUE = 255;
const PIXEL_DATA_STEP = 4;

// Horizon Silhouette
const SILHOUETTE_COLOR = '#050308';
const SILHOUETTE_HEIGHT_RATIO = 0.05;
const SILHOUETTE_OCTAVES = 4;
const MOUNTAIN_STEP = 2;

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
    const horizonY = height * HORIZON_RATIO;
    
    for (let y = 0; y < height; y++) {
        const isWater = y > horizonY;
        const mappedY = isWater ? horizonY - (y - horizonY) : y;
        const normalizedY = mappedY / horizonY; 
        
        for (let x = 0; x < width; x++) {
            const waterStretch = isWater ? WATER_RIPPLE_SCALE : 1.0;
            
            const nx = (x + offsetX) * SCALE_X * waterStretch;
            const ny = (mappedY + offsetY) * SCALE_Y;
            
            const warp1 = fbm(nx, ny, NOISE_OCTAVES);
            const warp2 = fbm(nx + WARP_OFFSET, ny + WARP_OFFSET, NOISE_OCTAVES);
            
            const distortedX = nx + (warp1 * WARP_STRENGTH_X);
            const distortedY = ny + (warp2 * WARP_STRENGTH_Y);
            
            const noiseVal = fbm(distortedX, distortedY, NOISE_OCTAVES);
            
            const elevationFactor = Math.pow(normalizedY, 1.3);
            let finalValue = (noiseVal * 0.5) + (elevationFactor * 0.65);
            
            if (isWater) {
                finalValue *= WATER_DARKEN_FACTOR;
            }
            
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
    const horizonY = height * HORIZON_RATIO;
    const maxIslandHeight = height * SILHOUETTE_HEIGHT_RATIO;
    const mountainSeed = Math.random() * 1000;
    
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    
    for (let x = 0; x <= width; x += MOUNTAIN_STEP) {
        const nx = x * 0.004;
        const noiseVal = fbm(nx + mountainSeed, mountainSeed, SILHOUETTE_OCTAVES);
        const islandMask = Math.pow(noiseVal, 2.5); 
        
        const yOffset = islandMask * maxIslandHeight;
        const yPos = horizonY - yOffset;
        
        ctx.lineTo(x, yPos);
    }
    
    for (let x = width; x >= 0; x -= MOUNTAIN_STEP) {
        const nx = x * 0.004;
        const noiseVal = fbm(nx + mountainSeed, mountainSeed, SILHOUETTE_OCTAVES);
        
        const islandMask = Math.pow(noiseVal, 2.5);
        const yOffset = islandMask * maxIslandHeight * 0.6;
        const yPos = horizonY + yOffset;
        
        ctx.lineTo(x, yPos);
    }
    
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
    // Clear with background color
    ctx.fillStyle = MAIN_BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // 1. Morph Ratio smoothly towards target ratio (Shape-Shifter)
        p.currentRatioPower = lerp(p.currentRatioPower, p.targetRatioPower, MORPH_SPEED);
        
        // If close to target, pick a new random target ratio
        if (Math.abs(p.targetRatioPower - p.currentRatioPower) < 0.05) {
            p.targetRatioPower = getRandomFloat(RATIO_EXP_MIN, RATIO_EXP_MAX);
        }

        // 2. Float / Drift position (Floating Mosaic)
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around screen bounds seamlessly
        if (p.x < 0) p.x += width;
        if (p.x >= width) p.x -= width;
        if (p.y < 0) p.y += height;
        if (p.y >= height) p.y -= height;

        // 3. Calculate dimensions based on constant area
        const ratio = Math.pow(BASE_TEN, p.currentRatioPower);
        const rectWidth = Math.sqrt(p.area * ratio);
        const rectHeight = Math.sqrt(p.area / ratio);

        // 4. Sample color dynamically from the hidden offscreen sunset based on current center
        const sampleX = Math.floor(p.x);
        const sampleY = Math.floor(p.y);
        const pixelIndex = (sampleY * width + sampleX) * NUM_CHANNELS;

        const r = pixels[pixelIndex];
        const g = pixels[pixelIndex + 1];
        const b = pixels[pixelIndex + 2];

        // 5. Draw the rectangle
        const drawX = p.x - (rectWidth * MATH_HALF);
        const drawY = p.y - (rectHeight * MATH_HALF);

        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(drawX, drawY, rectWidth, rectHeight);
    }
};

const generateAnimatedSunset = () => {
    const canvas = document.getElementById(CANVAS_ID);
    const ctx = canvas.getContext(CTX_TYPE);
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    canvas.width = width;
    canvas.height = height;

    // Generate rich, mirrored landscape off-screen
    const sunsetData = createOffscreenSunset(width, height);
    const pixels = sunsetData.data;

    const targetArea = (width * height) * AREA_FRACTION;
    const particles = initCubistParticles(width, height, targetArea);

    // Animation Loop using requestAnimationFrame
    const animate = () => {
        updateAndDrawParticles(ctx, width, height, pixels, particles);
        requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
};

// ==========================================
// INITIALIZATION
// ==========================================

window.onload = () => {
    generateAnimatedSunset();
};
