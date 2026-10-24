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

// Algorithm Configuration (User Requested)
const RECTANGLE_COUNT = 18000;
const AREA_FRACTION = 0.01;
const MAIN_BG_COLOR = '#808080';

// Ratio Math (Logarithmic scale for ratios)
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
const HORIZON_RATIO = 0.52;        // Horizon line just below the middle
const WATER_RIPPLE_SCALE = 1.8;    // Stretches noise horizontally in the water
const WATER_DARKEN_FACTOR = 0.85;  // Makes the reflection slightly deeper than the sky

// Rich Sunset Palette (Based on Reference Photo)
// Sky top (Deep Blue) down to Horizon (Pale Yellow)
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

// Horizon Silhouette (Islands/Trees)
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

const randomTable = new Float32Array(TABLE_SIZE * 2);
for (let i = 0; i < TABLE_SIZE * 2; i++) {
    randomTable[i] = Math.random();
}

const smoothstep = (t) => {
    return t * t * (3 - 2 * t);
};

const lerp = (a, b, t) => {
    return a + (b - a) * t;
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
        
        // Mirror the Y coordinate if we are below the horizon
        const mappedY = isWater ? horizonY - (y - horizonY) : y;
        
        // 0.0 at top of sky, 1.0 at horizon line
        const normalizedY = mappedY / horizonY; 
        
        for (let x = 0; x < width; x++) {
            // Stretch the horizontal noise slightly more in the water to simulate perspective/ripples
            const waterStretch = isWater ? WATER_RIPPLE_SCALE : 1.0;
            
            const nx = (x + offsetX) * SCALE_X * waterStretch;
            const ny = (mappedY + offsetY) * SCALE_Y;
            
            const warp1 = fbm(nx, ny, NOISE_OCTAVES);
            const warp2 = fbm(nx + WARP_OFFSET, ny + WARP_OFFSET, NOISE_OCTAVES);
            
            const distortedX = nx + (warp1 * WARP_STRENGTH_X);
            const distortedY = ny + (warp2 * WARP_STRENGTH_Y);
            
            const noiseVal = fbm(distortedX, distortedY, NOISE_OCTAVES);
            
            // Push colors harder towards the bottom (horizon)
            const elevationFactor = Math.pow(normalizedY, 1.3);
            let finalValue = (noiseVal * 0.5) + (elevationFactor * 0.65);
            
            if (isWater) {
                finalValue *= WATER_DARKEN_FACTOR; // Water is slightly darker than sky
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
    // Start at the left edge, on the horizon
    ctx.moveTo(0, horizonY);
    
    // Draw the jagged top edge of the islands/trees
    for (let x = 0; x <= width; x += MOUNTAIN_STEP) {
        const nx = x * 0.004;
        // Use high-frequency noise for a tree-line/island look
        const noiseVal = fbm(nx + mountainSeed, mountainSeed, SILHOUETTE_OCTAVES);
        
        // Islands sporadically emerge (pow lowers the low values)
        const islandMask = Math.pow(noiseVal, 2.5); 
        
        const yOffset = islandMask * maxIslandHeight;
        const yPos = horizonY - yOffset;
        
        ctx.lineTo(x, yPos);
    }
    
    // Draw the reflection (bottom edge of the islands in the water)
    for (let x = width; x >= 0; x -= MOUNTAIN_STEP) {
        const nx = x * 0.004;
        const noiseVal = fbm(nx + mountainSeed, mountainSeed, SILHOUETTE_OCTAVES);
        
        const islandMask = Math.pow(noiseVal, 2.5);
        const yOffset = islandMask * maxIslandHeight * 0.6; // Reflection is a bit shorter
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
// MAIN ALGORITHM
// ==========================================

const generateAlgorithmicSunset = () => {
    const canvas = document.getElementById(CANVAS_ID);
    const ctx = canvas.getContext(CTX_TYPE);
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    canvas.width = width;
    canvas.height = height;

    // Step 1: Generate rich, mirrored landscape in memory
    const sunsetData = createOffscreenSunset(width, height);
    const pixels = sunsetData.data;

    // Step 2: Fill canvas with requested background color
    ctx.fillStyle = MAIN_BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    const targetArea = (width * height) * AREA_FRACTION;

    // Step 5: Scatter N rectangles
    for (let i = 0; i < RECTANGLE_COUNT; i++) {
        // Step 3: Randomly choose a pixel
        const px = getRandomInt(0, width - 1);
        const py = getRandomInt(0, height - 1);

        const pixelIndex = (py * width + px) * NUM_CHANNELS;
        const r = pixels[pixelIndex];
        const g = pixels[pixelIndex + 1];
        const b = pixels[pixelIndex + 2];
        
        // Step 6: Constant area, wild ratios
        const ratioPower = getRandomFloat(RATIO_EXP_MIN, RATIO_EXP_MAX);
        const ratio = Math.pow(BASE_TEN, ratioPower);
        
        const rectWidth = Math.sqrt(targetArea * ratio);
        const rectHeight = Math.sqrt(targetArea / ratio);

        // Step 4: Place rectangle centered on pixel's coordinates
        const drawX = px - (rectWidth * MATH_HALF);
        const drawY = py - (rectHeight * MATH_HALF);

        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(drawX, drawY, rectWidth, rectHeight);
    }
};

// ==========================================
// INITIALIZATION
// ==========================================

window.onload = () => {
    generateAlgorithmicSunset();
};
