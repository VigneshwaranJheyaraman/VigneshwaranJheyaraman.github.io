// Daughter Face Reveal Application
// Loads WASM module, manages grid display, and handles date-based reveal
// Only loads image chunks, never loads the full image before reveal date

class DaughterRevealApp {
    constructor() {
        this.wasmModule = null;
        this.imageWidth = 0;
        this.imageHeight = 0;
        this.gridSize = 128;
        this.maxRevealBlocksNum = 12;
        this.currentBlocks = [];  // Array of 6 blocks
        this.targetDate = new Date(2026, 8, 3, 12, 30, 0); // September 3, 2026 8:30AM
        this.cupidElement = null;
        this.cupidAnimationId = null;
        this.init();
    }

    async init() {
        try {
            // Initialize cupid animation
            this.initializeCupid();

            // Load WASM module
            await this.loadWasm();

            // Load only image metadata (dimensions)
            await this.loadImageMetadata();

            // Check if reveal date has arrived
            if (this.isRevealDate()) {
                this.showFullReveal();
            } else {
                this.initializeGrid();
                this.updateCountdown();
                setInterval(() => this.updateCountdown(), 1000);
            }
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to initialize the application');
        }
    }

    async loadWasm() {
        try {
            // Wait for WASM module to be loaded (polls every second)
            await this.waitForWasmModule();

            this.wasmModule = window;
            console.log('WASM module loaded successfully');

            // Initialize the image loader
            const initResult = this.wasmModule._load_image_into_mem();
            if (initResult) {
                console.log('Image loaded into WASM memory');
            } else {
                console.warn('Could not load image into WASM');
            }
        } catch (error) {
            console.warn('Could not load WASM:', error);
            throw error;
        }
    }

    waitForWasmModule() {
        return new Promise((resolve) => {
            const pollInterval = setInterval(() => {
                if (typeof window !== 'undefined' && window._load_image_into_mem) {
                    clearInterval(pollInterval);
                    resolve();
                }
            }, 1000);
        });
    }

    loadImageMetadata() {
        return new Promise((resolve, reject) => {
            try {
                // Get image dimensions from WASM
                const imageWidth = this.wasmModule._get_image_width();
                const imageHeight = this.wasmModule._get_image_height();

                if (imageWidth <= 0 || imageHeight <= 0) {
                    throw new Error('Invalid image dimensions from WASM');
                }

                this.imageWidth = imageWidth;
                this.imageHeight = imageHeight;

                // Calculate grid dimensions
                this.gridCols = Math.ceil(this.imageWidth / this.gridSize);
                this.gridRows = Math.ceil(this.imageHeight / this.gridSize);

                console.log(`Image dimensions: ${this.imageWidth}x${this.imageHeight}`);
                console.log(`Grid dimensions: ${this.gridCols}x${this.gridRows}`);

                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    initializeGrid() {
        const loadingState = document.getElementById('loadingState');
        const gridDisplay = document.getElementById('gridDisplay');

        loadingState.classList.add('hidden');
        gridDisplay.classList.remove('hidden');

        // Get or generate today's 6 random blocks
        const todayBlocks = this.getTodayBlocks();
        this.currentBlocks = todayBlocks;

        // Render the grid
        this.renderGrid();

        // Update info
        document.getElementById('blockCount').textContent =
            `6x6 Grid (36 blocks) - Revealing 6 random blocks today`;
        document.getElementById('currentBlock').textContent =
            `Blocks: ${todayBlocks.map(b => b.blockIndex).join(', ')}`;
    }

    getTodayBlocks() {
        const today = new Date().toDateString();
        const storageKey = 'daughterReveal_todayBlocks';
        const storedData = localStorage.getItem(storageKey);

        let blocks;

        if (storedData) {
            const stored = JSON.parse(storedData);
            if (stored.date === today) {
                // Same day, return stored blocks
                blocks = stored.blocks;
            } else {
                // New day, generate 2 new random blocks
                blocks = this.generateRandomBlocks();
                this.saveBlocksToStorage(today, blocks);
            }
        } else {
            // First time, generate 2 blocks
            blocks = this.generateRandomBlocks();
            this.saveBlocksToStorage(today, blocks);
        }

        return blocks;
    }

    generateRandomBlocks() {
        // Generate 6 unique random block indices from 6x6 grid (0-35)
        // Exclude blocks 14-17 and 20-23
        const excludedBlocks = new Set([13, 14, 15, 16, 19, 20, 21, 22]);
        const selectedIndices = new Set();

        while (selectedIndices.size < this.maxRevealBlocksNum) {
            const randomBlock = Math.floor(Math.random() * 36);
            // Only add if not excluded
            if (!excludedBlocks.has(randomBlock)) {
                selectedIndices.add(randomBlock);
            }
        }

        // Get coordinates for all 6 blocks from WASM
        const blocks = Array.from(selectedIndices).map(blockIndex =>
            this.getBlockCoordinates(blockIndex)
        );

        return blocks;
    }

    getBlockCoordinates(blockIndex) {
        // Get chunk coordinates from WASM for 6x6 grid
        const coordsPtr = this.wasmModule._malloc(16); // 4 ints * 4 bytes
        this.wasmModule._get_chunk_coords_6x6(blockIndex, coordsPtr);

        const coordsArray = new Int32Array(this.wasmModule.HEAPU8.buffer, coordsPtr, 4);
        const pixelX = coordsArray[0];
        const pixelY = coordsArray[1];
        const blockWidth = coordsArray[2];
        const blockHeight = coordsArray[3];

        this.wasmModule._free(coordsPtr);

        return {
            blockIndex,
            pixelX,
            pixelY,
            blockWidth,
            blockHeight,
            timestamp: Date.now()
        };
    }

    saveBlocksToStorage(date, blocks) {
        localStorage.setItem('daughterReveal_todayBlocks', JSON.stringify({
            date,
            blocks
        }));
    }

    renderGrid() {
        const container = document.getElementById('gridContainer');
        container.innerHTML = '';

        // 6x6 grid (36 blocks total)
        for (let blockIndex = 0; blockIndex < 36; blockIndex++) {
            const isRevealedBlock = this.currentBlocks.some(b => b.blockIndex === blockIndex);

            const block = document.createElement('div');
            block.className = 'grid-block';

            if (isRevealedBlock) {
                // Load and render this chunk
                const blockData = this.currentBlocks.find(b => b.blockIndex === blockIndex);
                this.renderChunkBlock(block, blockData);
                block.classList.add('reveal-animation');
                block.style.borderColor = 'rgba(255, 215, 0, 0.8)';
            } else {
                // Mystery block
                block.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3))';
                block.style.backdropFilter = 'blur(10px)';
                block.innerHTML = '🎁';
                block.style.display = 'flex';
                block.style.alignItems = 'center';
                block.style.justifyContent = 'center';
                block.style.fontSize = '2rem';
            }

            container.appendChild(block);
        }
    }

    renderChunkBlock(block, blockData) {
        // Get chunk coordinates from blockData
        const pixelX = blockData.pixelX;
        const pixelY = blockData.pixelY;
        const chunkWidth = blockData.blockWidth;
        const chunkHeight = blockData.blockHeight;

        try {
            // Get image buffer from WASM (compressed format)
            const imagePtr = this.wasmModule._get_png_data();
            const imageSize = this.wasmModule._get_png_data_size();

            if (!imagePtr || imageSize <= 0) {
                throw new Error('No image data available');
            }

            // Copy image buffer from WASM memory
            const wasmMemory = this.wasmModule.HEAPU8;
            const imageBuffer = new Uint8Array(imageSize);
            imageBuffer.set(wasmMemory.subarray(imagePtr, imagePtr + imageSize));

            // Decode and render chunk
            this.decodeAndRenderChunk(imageBuffer, pixelX, pixelY, chunkWidth, chunkHeight, block);
        } catch (error) {
            console.error('Error rendering chunk block:', error);
            // Fallback to mystery block
            block.style.background = 'linear-gradient(135deg, rgba(200,150,255,0.3), rgba(255,200,200,0.3))';
            block.style.backdropFilter = 'blur(8px)';
            block.innerHTML = '✨';
            block.style.display = 'flex';
            block.style.alignItems = 'center';
            block.style.justifyContent = 'center';
            block.style.fontSize = '2.5rem';
        }
    }

    decodeAndRenderChunk(imageBuffer, pixelX, pixelY, chunkWidth, chunkHeight, block) {
        // Create a blob and use createImageBitmap (native, no Image API)
        const blob = new Blob([imageBuffer]);

        // Use createImageBitmap to decode image without Image element
        createImageBitmap(blob).then((imageBitmap) => {
            // Create canvas for chunk extraction
            const canvas = document.createElement('canvas');
            canvas.width = chunkWidth;
            canvas.height = chunkHeight;
            const ctx = canvas.getContext('2d');

            // Draw only the chunk region from imageBitmap
            ctx.drawImage(
                imageBitmap,
                pixelX, pixelY, chunkWidth, chunkHeight,
                0, 0, chunkWidth, chunkHeight
            );

            // Convert canvas to base64 and set as background
            const chunkDataUrl = canvas.toDataURL('image/png');
            block.style.backgroundImage = `url(${chunkDataUrl})`;
            block.style.backgroundSize = 'cover';
            block.style.backgroundPosition = 'center';
            block.innerHTML = '';

            console.log(`Rendered chunk: ${chunkWidth}x${chunkHeight} from (${pixelX}, ${pixelY})`);
        }).catch((error) => {
            console.error('Error creating image bitmap:', error);
            // Fallback
            block.style.background = 'linear-gradient(135deg, rgba(200,150,255,0.3), rgba(255,200,200,0.3))';
            block.style.backdropFilter = 'blur(8px)';
            block.innerHTML = '✨';
        });
    }

    isRevealDate() {
        const today = new Date();

        const target = new Date(this.targetDate);

        return today.getTime() >= target.getTime();
    }

    updateCountdown() {
        const now = new Date();
        const diff = this.targetDate - now;

        if (diff <= 0) {
            this.showFullReveal();
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const countdownEl = document.getElementById('countdown');
        if (countdownEl) {
            countdownEl.textContent =
                `⏳ ${days}d ${hours}h ${minutes}m ${seconds}s until the big reveal!`;
        }
    }

    showFullReveal() {
        const gridDisplay = document.getElementById('gridDisplay');
        const fullImageDisplay = document.getElementById('fullImageDisplay');
        const loadingState = document.getElementById('loadingState');

        gridDisplay.classList.add('hidden');
        loadingState.classList.add('hidden');
        fullImageDisplay.classList.remove('hidden');
        fullImageDisplay.classList.add('confetti-trigger');

        // Load and display full image on reveal date
        try {
            const imagePtr = this.wasmModule._get_png_data();
            const imageSize = this.wasmModule._get_png_data_size();

            if (!imagePtr || imageSize <= 0) {
                throw new Error('No image data available');
            }

            const wasmMemory = this.wasmModule.HEAPU8;
            const imageBuffer = new Uint8Array(imageSize);
            imageBuffer.set(wasmMemory.subarray(imagePtr, imagePtr + imageSize));

            // Use createImageBitmap to decode image without Image element
            const blob = new Blob([imageBuffer]);
            createImageBitmap(blob).then((imageBitmap) => {
                // Create canvas for full image
                const canvas = document.createElement('canvas');
                canvas.width = this.imageWidth;
                canvas.height = this.imageHeight;
                const ctx = canvas.getContext('2d');

                // Draw full image
                ctx.drawImage(imageBitmap, 0, 0);

                // Set as image source
                const fullImageEl = document.getElementById('fullImage');
                fullImageEl.onload = () => {
                    this.triggerConfetti();
                };
                fullImageEl.src = canvas.toDataURL('image/png');
            }).catch((error) => {
                console.error('Error creating image bitmap:', error);
            });
        } catch (error) {
            console.error('Error displaying full image:', error);
        }

        // Stop countdown timer
        const countdownEl = document.getElementById('countdown');
        if (countdownEl) {
            countdownEl.textContent = '🎉 It\'s Reveal Day! 🎉';
        }
    }

    triggerConfetti() {
        if (typeof confetti !== 'undefined') {
            // Multiple confetti bursts
            const defaults = {
                origin: { y: 0.5 }
            };

            function fire(particleRatio, opts) {
                confetti(Object.assign({}, defaults, opts, {
                    particleCount: Math.floor(200 * particleRatio)
                }));
            }

            fire(0.25, {
                spread: 26,
                startVelocity: 55,
            });
            fire(0.2, {
                spread: 60,
            });
            fire(0.35, {
                spread: 100,
                decay: 0.91,
                scalar: 0.8
            });
            fire(0.1, {
                spread: 120,
                startVelocity: 25,
                decay: 0.92,
                scalar: 1.2
            });
            fire(0.1, {
                spread: 120,
                startVelocity: 45,
            });
        }
    }

    initializeCupid() {
        this.cupidElement = document.querySelector('.cupid-float');
        if (this.cupidElement) {
            this.startCupidAnimation();
        }
    }

    startCupidAnimation() {
        const duration = 12000; // 12 seconds per cycle
        const startTime = Date.now();
        const path = this.generateCupidPath();

        const animate = () => {
            const elapsed = (Date.now() - startTime) % duration;
            const progress = elapsed / duration;
            const position = this.interpolatePosition(path, progress);

            this.cupidElement.style.left = position.x + 'px';
            this.cupidElement.style.top = position.y + 'px';

            this.cupidAnimationId = requestAnimationFrame(animate);
        };

        animate();
    }

    generateCupidPath() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const cupidSize = 48; // approximate size

        // Create a smooth path across the screen
        return [
            { x: 50, y: 50 },                           // Start top-left
            { x: vw - cupidSize - 50, y: 100 },        // Move to top-right
            { x: vw - cupidSize - 100, y: vh / 2 },    // Move down center-right
            { x: vw - cupidSize - 50, y: vh - 150 },   // Move to bottom-right
            { x: vw / 2, y: vh - 100 },                // Move to bottom-center
            { x: 50, y: vh - 150 },                    // Move to bottom-left
            { x: 100, y: vh / 2 },                     // Move up center-left
            { x: 50, y: 50 }                           // Return to start
        ];
    }

    interpolatePosition(path, progress) {
        const pathLength = path.length;
        const adjustedProgress = progress * pathLength;
        const currentSegment = Math.floor(adjustedProgress) % pathLength;
        const nextSegment = (currentSegment + 1) % pathLength;
        const segmentProgress = adjustedProgress - Math.floor(adjustedProgress);

        const current = path[currentSegment];
        const next = path[nextSegment];

        // Smooth cubic easing for interpolation
        const t = this.easeInOutCubic(segmentProgress);

        return {
            x: current.x + (next.x - current.x) * t,
            y: current.y + (next.y - current.y) * t
        };
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    showError(message) {
        document.getElementById('loadingState').innerHTML =
            `<div class="text-center text-red-600"><p>${message}</p></div>`;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new DaughterRevealApp();
});
