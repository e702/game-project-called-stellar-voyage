// planetExploration.js
// Planet level generation and management
// Handles switching between main space level and planetary exploration
// TODO LIST: add static ship object, add terrain modification/manipulation, add resource harvesting, add factory/buildings, make sure planet data saves

console.log("Planet exploration system loaded!");

// Global variables for planet exploration
let planetExplorationActive = false;
let currentPlanetExploration = null;
let mainGamePaused = false;

// Planet exploration class
class PlanetExploration {
    constructor(planet, ship) {
        this.planet = planet;
        this.ship = ship;
        this.isActive = false;
        this.explorationCanvas = null;
        this.explorationCtx = null;
        this.playerPosition = { x: 400, y: 200 }; // Player screen position (fixed)
        this.playerVelocity = { x: 0, y: 0 };
        this.camera = { x: 0, y: 0 };
        
        // Use actual planet properties
        this.planetRadius = planet.radius * 10; // Scale radius for exploration view
        this.gravity = -(planet.mass / 40); // Scale gravity based on mass
        this.onSurface = true;
        this.onIce = false; // Whether player is standing on frozen water
        this.jumpPower = 50;
        this.evaFuel = 100; // EVA fuel level
        this.playerRadius = 24; // Player size for collision detection
        
        // Camera-centered planet exploration properties
        this.playerWorldAngle = 0; // Player's angle around the planet (in radians)
        this.playerHeight = 24; // Player's distance from planet surface
        this.planetCenter = { x: 540, y: 400 }; // Fixed planet center on screen (centered in 1080x720)
        
        // Calculate move speed inversely proportional to planet radius for consistent linear speed
        // Base linear speed in pixels per frame, adjust this value to control overall movement speed
        const baseLinearSpeed = 2.5; // Reduced for smoother movement
        this.moveSpeed = Math.max(0.005, baseLinearSpeed / this.planetRadius); // Minimum angular speed for small planets
        
        // Add movement smoothing properties
        this.targetAngle = 0; // Target angle for smooth interpolation
        this.angleVelocity = 0; // Current angular velocity
        this.maxAngularAcceleration = 0.001; // How quickly movement can change
        this.angleDamping = 0.85; // Damping factor for smooth stops
        
        this.surfaceHeight = 12; // Height when "on surface"
        
        // Player character animation properties
        this.playerSprites = {
            front: document.getElementById('hauyneFront'),
            left: document.getElementById('hauyneLeft'),
            leftStep0: document.getElementById('hauyneLeftStep0'),
            leftStep1: document.getElementById('hauyneLeftStep1'),
            right: document.getElementById('hauyneRight'),
            rightStep0: document.getElementById('hauyneRightStep0'),
            rightStep1: document.getElementById('hauyneRightStep1')
        };
        
        // Animation state
        this.playerAnimationState = 'front'; // 'front', 'left', 'right'
        this.animationFrame = 0; // Current frame in walk cycle
        this.animationTimer = 0; // Timer for animation
        this.animationSpeed = 0.1; // Speed of walk animation (lower = faster)
        this.isWalking = false; // Whether player is currently moving
        
        // Get planet visual characteristics
        this.planetColors = this.getPlanetColors(planet.Image);
        
        // Set up water system based on planet type
        this.setupWaterSystem();
        
        // Generate terrain for this planet
        this.generateTerrain();
        
        // Calculate terrain-based water levels after terrain generation
        this.calculateTerrainBasedWaterLevels();
        
        // Calculate optimal terrain resolution for rendering based on terrain points
        this.calculateTerrainResolution();
        
        // Calculate maximum height for player movement (1000 pixels above highest terrain)
        this.calculateMaxPlayerHeight();
        
        // Store main game state when entering planet
        this.savedMainGameState = null;
    }
    
    // Get appropriate colors based on planet image
    getPlanetColors(planetImage) {
        // Map planet images to color schemes
        const imageColorMap = {
            // Giants - usually larger, gas-like colors
            'amberPlanet': { main: '#FFB347', surface: '#FF8C00', features: '#B8860B' },
            'bandsPlanet': { main: '#8B4513', surface: '#CD853F', features: '#D2691E' },
            'bloodPlanet': { main: '#8B0000', surface: '#DC143C', features: '#B22222' },
            'brownPlanet': { main: '#A0522D', surface: '#8B4513', features: '#CD853F' },
            'cataractPlanet': { main: '#4682B4', surface: '#5F9EA0', features: '#708090' },
            'greenPlanet': { main: '#228B22', surface: '#32CD32', features: '#006400' },
            'jaundicePlanet': { main: '#FFFF00', surface: '#FFD700', features: '#DAA520' },
            'lightningPlanet': { main: '#483D8B', surface: '#6A5ACD', features: '#9370DB' },
            'pastelPlanet': { main: '#DDA0DD', surface: '#DA70D6', features: '#BA55D3' },
            
            // Terrestrials - rocky, earth-like colors
            'bluePlanet': { main: '#4169E1', surface: '#1E90FF', features: '#0000CD' },
            'boilingPlanet': { main: '#FF4500', surface: '#FF6347', features: '#DC143C' },
            'deadPlanet': { main: '#696969', surface: '#A9A9A9', features: '#2F4F4F' },
            'dyingPlanet': { main: '#800080', surface: '#9932CC', features: '#4B0082' },
            'harshPlanet': { main: '#CD853F', surface: '#F4A460', features: '#D2691E' },
            'icePlanet': { main: '#E0FFFF', surface: '#B0E0E6', features: '#87CEEB' },
            'islandsPlanet': { main: '#20B2AA', surface: '#48D1CC', features: '#008B8B' },
            'oceanPlanet': { main: '#006994', surface: '#4682B4', features: '#191970' },
            'orangePlanet': { main: '#FF8C00', surface: '#FFA500', features: '#FF7F50' },
            'redPlanet': { main: '#CD5C5C', surface: '#F08080', features: '#8B0000' },
            'veilPlanet': { main: '#9370DB', surface: '#BA55D3', features: '#8A2BE2' },
            
            // Moons - smaller, darker colors
            'cratersPlanet': { main: '#708090', surface: '#A9A9A9', features: '#2F4F4F' },
            'crevassePlanet': { main: '#556B2F', surface: '#6B8E23', features: '#8FBC8F' },
            'grayPlanet': { main: '#808080', surface: '#C0C0C0', features: '#696969' },
            'methanePlanet': { main: '#FF69B4', surface: '#FFB6C1', features: '#FF1493' },
            'oxidePlanet': { main: '#B22222', surface: '#CD5C5C', features: '#8B0000' },
            'rustPlanet': { main: '#A0522D', surface: '#CD853F', features: '#8B4513' },
            'toxicPlanet': { main: '#ADFF2F', surface: '#7FFF00', features: '#32CD32' },
            'weirdPlanet': { main: '#FF00FF', surface: '#FF69B4', features: '#DA70D6' }
        };
        
        // Extract image name from the Image element
        let imageName = 'bluePlanet'; // Default fallback
        if (planetImage && planetImage.id) {
            imageName = planetImage.id;
        }
        
        // Return colors or fallback to blue planet
        return imageColorMap[imageName] || imageColorMap['bluePlanet'];
    }
    
    // Setup water system based on planet type and characteristics
    setupWaterSystem() {
        // Extract image name for planet-specific water settings
        let imageName = 'bluePlanet';
        if (this.planet.Image && this.planet.Image.id) {
            imageName = this.planet.Image.id;
        }
        
        // Default water settings
        this.hasWater = false;
        this.waterLevel = 0; // Height above terrain base where water starts
        this.waterColor = '#4169E1'; // Default water color
        this.waterOpacity = 0.7;
        this.waterType = 'none'; // 'none', 'ocean', 'frozen'
        
        // Planet-specific water configurations (will be refined by terrain analysis)
        const waterConfigs = {
            // Gas Giants - now water-heavy oceans
            'amberPlanet': { hasWater: true, waterColor: '#FFD700', waterOpacity: 0.6 },
            'bandsPlanet': { hasWater: true, waterColor: '#CD853F', waterOpacity: 0.7 },
            'bloodPlanet': { hasWater: false }, // No water on blood planet
            'brownPlanet': { hasWater: true, waterColor: '#8B7355', waterOpacity: 0.7 },
            'cataractPlanet': { hasWater: true, waterColor: '#87CEEB', waterOpacity: 0.8 },
            'greenPlanet': { hasWater: true, waterColor: '#98FB98', waterOpacity: 0.7 },
            'jaundicePlanet': { hasWater: true, waterColor: '#F0E68C', waterOpacity: 0.6 },
            'lightningPlanet': { hasWater: true, waterColor: '#9370DB', waterOpacity: 0.8 },
            'pastelPlanet': { hasWater: true, waterColor: '#E6E6FA', waterOpacity: 0.6 },
            
            // Terrestrial Planets - varied water systems
            'bluePlanet': { hasWater: true, waterColor: '#4169E1', waterOpacity: 0.8 },
            'boilingPlanet': { hasWater: true, waterColor: '#FF6347', waterOpacity: 0.9 },
            'deadPlanet': { hasWater: false }, // No water on dead planet
            'dyingPlanet': { hasWater: true, waterColor: '#8B008B', waterOpacity: 0.6 },
            'harshPlanet': { hasWater: true, waterColor: '#DAA520', waterOpacity: 0.7 },
            'icePlanet': { hasWater: true, waterColor: '#B0E0E6', waterOpacity: 0.9 },
            'islandsPlanet': { hasWater: true, waterColor: '#20B2AA', waterOpacity: 0.8 },
            'oceanPlanet': { hasWater: true, waterColor: '#006994', waterOpacity: 0.9 },
            'orangePlanet': { hasWater: true, waterColor: '#FF7F50', waterOpacity: 0.7 },
            'redPlanet': { hasWater: true, waterColor: '#8B0000', waterOpacity: 0.8 },
            'veilPlanet': { hasWater: true, waterColor: '#DA70D6', waterOpacity: 0.6 },
            
            // Moons - limited water systems
            'cratersPlanet': { hasWater: false },
            'crevassePlanet': { hasWater: true, waterColor: '#708090', waterOpacity: 0.8 },
            'grayPlanet': { hasWater: false },
            'methanePlanet': { hasWater: true, waterColor: '#FF69B4', waterOpacity: 0.7 },
            'oxidePlanet': { hasWater: false },
            'rustPlanet': { hasWater: false },
            'toxicPlanet': { hasWater: true, waterColor: '#32CD32', waterOpacity: 0.6 },
            'weirdPlanet': { hasWater: false }
        };
        
        // Apply basic water configuration (water level will be calculated after terrain generation)
        const config = waterConfigs[imageName];
        if (config) {
            this.hasWater = config.hasWater || false;
            this.waterLevel = 0; // Will be calculated based on terrain
            this.waterColor = config.waterColor || '#4169E1';
            this.waterOpacity = config.waterOpacity || 0.7;
            this.waterType = 'none'; // Will be set based on terrain analysis
        }
        
        console.log(`Planet ${imageName} water setup: ${this.hasWater ? this.waterType : 'no water'}, level: ${this.waterLevel}`);
    }
    
    // Calculate water levels based on actual terrain analysis
    calculateTerrainBasedWaterLevels() {
        if (!this.hasWater) return;
        
        // Analyze terrain to find min and max heights
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        
        for (const terrainPoint of this.terrain) {
            minHeight = Math.min(minHeight, terrainPoint.height);
            maxHeight = Math.max(maxHeight, terrainPoint.height);
        }
        
        const terrainRange = maxHeight - minHeight;
        const averageHeight = (minHeight + maxHeight) / 2;
        
        // Extract image name for planet-specific water depth multipliers
        let imageName = 'bluePlanet';
        if (this.planet.Image && this.planet.Image.id) {
            imageName = this.planet.Image.id;
        }
        
        // Planet-specific water depth multipliers
        const waterDepthConfigs = {
            // Gas Giants - now water-heavy instead of atmospheric
            'amberPlanet': { depthMultiplier: 1.3, waterType: 'ocean' },
            'bandsPlanet': { depthMultiplier: 1.2, waterType: 'ocean' },
            'brownPlanet': { depthMultiplier: 1.3, waterType: 'ocean' },
            'cataractPlanet': { depthMultiplier: 1.3, waterType: 'ocean' },
            'greenPlanet': { depthMultiplier: 1.3, waterType: 'ocean' },
            'jaundicePlanet': { depthMultiplier: 1.2, waterType: 'ocean' },
            'lightningPlanet': { depthMultiplier: 1.4, waterType: 'ocean' },
            'pastelPlanet': { depthMultiplier: 1.2, waterType: 'ocean' },
            
            // Terrestrial Planets - varied water systems based on terrain
            'bluePlanet': { depthMultiplier: 1, waterType: 'ocean' },
            'boilingPlanet': { depthMultiplier: 0.8, waterType: 'ocean' },
            'dyingPlanet': { depthMultiplier: 0.9, waterType: 'ocean' },
            'harshPlanet': { depthMultiplier: 0.9, waterType: 'ocean' },
            'icePlanet': { depthMultiplier: 1.1, waterType: 'frozen' },
            'islandsPlanet': { depthMultiplier: 1, waterType: 'ocean' },
            'oceanPlanet': { depthMultiplier: 1.4, waterType: 'ocean' },
            'orangePlanet': { depthMultiplier: 0.8, waterType: 'ocean' },
            'redPlanet': { depthMultiplier: 0.9, waterType: 'ocean' },
            'veilPlanet': { depthMultiplier: 1.5, waterType: 'ocean' },
            
            // Moons - limited water systems
            'crevassePlanet': { depthMultiplier: 0.8, waterType: 'ocean' },
            'methanePlanet': { depthMultiplier: 0.9, waterType: 'ocean' },
            'toxicPlanet': { depthMultiplier: 0.1, waterType: 'ocean' }
        };
        
        const depthConfig = waterDepthConfigs[imageName];
        if (depthConfig) {
            // Calculate water level based on terrain analysis
            // Water level = average terrain height + (terrain range * depth multiplier)
            const waterDepth = terrainRange * depthConfig.depthMultiplier;
            this.waterLevel = Math.floor((averageHeight - this.terrainBaseHeight) + waterDepth);
            
            // Update water type for gas giants
            this.waterType = depthConfig.waterType;
            
            // Ensure water level is reasonable (not below minimum terrain)
            this.waterLevel = Math.max(this.waterLevel, (minHeight - this.terrainBaseHeight) + terrainRange * 0.1);
            
            console.log(`Planet ${imageName} terrain-based water: min=${minHeight.toFixed(1)}, max=${maxHeight.toFixed(1)}, avg=${averageHeight.toFixed(1)}, range=${terrainRange.toFixed(1)}, water=${this.waterLevel.toFixed(1)} (${this.waterType})`);
        }
    }
    
    // Calculate maximum height for player movement based on terrain
    calculateMaxPlayerHeight() {
        // Find the highest terrain point
        let maxTerrainHeight = -Infinity;
        
        for (const terrainPoint of this.terrain) {
            maxTerrainHeight = Math.max(maxTerrainHeight, terrainPoint.height);
        }
        
        // Set max player height to be 1000 pixels above the highest terrain point
        // This ensures player can always fly above any terrain feature
        this.maxPlayerHeight = maxTerrainHeight + 1000;
        
        console.log(`Max terrain height: ${maxTerrainHeight.toFixed(1)}, Max player height: ${this.maxPlayerHeight.toFixed(1)}`);
    }
    
    // Calculate optimal terrain resolution for rendering and collision detection
    calculateTerrainResolution() {
        // Base the resolution on the number of terrain points to maintain consistent visual quality
        // Fewer terrain points = lower resolution to avoid gaps
        // More terrain points = higher resolution for performance
        if (this.terrain.length <= 240) {
            this.terrainResolution = 2; // Very detailed for small planets
        } else if (this.terrain.length <= 480) {
            this.terrainResolution = 3; // Moderate detail for medium planets
        } else if (this.terrain.length <= 720) {
            this.terrainResolution = 4; // Standard detail for large planets
        } else {
            this.terrainResolution = Math.max(4, Math.floor(this.terrain.length / 180)); // Scale up for very large planets
        }
        
        console.log(`Terrain points: ${this.terrain.length}, resolution: ${this.terrainResolution}`);
    }
    
    // Perlin noise implementation for natural terrain generation
    generatePerlinNoise(seededRandom) {
        // Create permutation table for Perlin noise
        const permutationSize = 256;
        const permutation = [];
        
        // Fill with numbers 0-255
        for (let i = 0; i < permutationSize; i++) {
            permutation[i] = i;
        }
        
        // Shuffle using seeded random
        for (let i = permutationSize - 1; i > 0; i--) {
            const j = Math.floor(seededRandom(i + 1000) * (i + 1));
            [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
        }
        
        // Double the permutation to avoid overflow
        for (let i = 0; i < permutationSize; i++) {
            permutation[permutationSize + i] = permutation[i];
        }
        
        // Fade function for smooth interpolation
        const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
        
        // Linear interpolation
        const lerp = (a, b, t) => a + t * (b - a);
        
        // Gradient function
        const grad = (hash, x) => {
            const h = hash & 15;
            const gradValue = 1 + (h & 7); // Gradient value 1-8
            if (h & 8) return -gradValue * x; // Random sign
            return gradValue * x;
        };
        
        // Main Perlin noise function (1D version for circular terrain)
        const noise = (x) => {
            // Find unit square that contains point
            const X = Math.floor(x) & 255;
            
            // Find relative x of point in square
            x -= Math.floor(x);
            
            // Compute fade curve for x
            const u = fade(x);
            
            // Hash coordinates of square corners
            const A = permutation[X];
            const B = permutation[X + 1];
            
            // Blend results from corners
            return lerp(
                grad(permutation[A], x),
                grad(permutation[B], x - 1),
                u
            );
        };
        
        return { noise, fade, lerp, grad };
    }
    
    // Generate multi-octave Perlin noise for more complex terrain
    perlinOctaveNoise(x, octaves, persistence, scale, perlinNoise) {
        let value = 0;
        let amplitude = 1;
        let frequency = scale;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            value += perlinNoise.noise(x * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }
        
        return value / maxValue; // Normalize to [-1, 1]
    }
    
    // Get noise levels based on planet characteristics
    getNoiselevels(seededRandom, terrainIndex) {
        const baseNoiseLevels = [];
        
        // Add planet-specific frequency and amplitude variations
        const planetMassVariation = (this.planet.mass - 50) * 0.01; // Scale variation based on mass
        const planetRadiusVariation = (this.planet.radius - 75) * 0.005; // Scale variation based on radius
        
        if (this.planet.radius > 120) {
            // Gas giants - smooth atmospheric layers with mass-based variations
            baseNoiseLevels.push(
                { frequency: 1.2 + planetMassVariation, amplitude: 0.8 + planetRadiusVariation, phase: seededRandom(terrainIndex) * 10 },        // Large atmospheric bands
                { frequency: 3 + planetMassVariation * 0.5, amplitude: 0.5 + planetRadiusVariation * 0.5, phase: seededRandom(terrainIndex + 50) * 10 },     // Storm systems
                { frequency: 6 + planetMassVariation * 0.3, amplitude: 0.2 + planetRadiusVariation * 0.3, phase: seededRandom(terrainIndex + 100) * 10 },    // Cloud details
                { frequency: 10 + planetMassVariation * 0.2, amplitude: 0.08 + planetRadiusVariation * 0.1, phase: seededRandom(terrainIndex + 150) * 10 }   // Fine atmospheric texture
            );
        } else if (this.planet.radius > 50) {
            // Terrestrial planets - gentler geological features with planet-specific variations
            baseNoiseLevels.push(
                { frequency: 1.5 + planetMassVariation, amplitude: 0.7 + planetRadiusVariation, phase: seededRandom(terrainIndex) * 10 },        // Continental features
                { frequency: 4 + planetMassVariation * 0.7, amplitude: 0.45 + planetRadiusVariation * 0.7, phase: seededRandom(terrainIndex + 50) * 10 },    // Mountain ranges
                { frequency: 8 + planetMassVariation * 0.5, amplitude: 0.25 + planetRadiusVariation * 0.5, phase: seededRandom(terrainIndex + 100) * 10 },   // Hills and valleys
                { frequency: 16 + planetMassVariation * 0.3, amplitude: 0.12 + planetRadiusVariation * 0.3, phase: seededRandom(terrainIndex + 150) * 10 },  // Surface details
                { frequency: 25 + planetMassVariation * 0.2, amplitude: 0.05 + planetRadiusVariation * 0.2, phase: seededRandom(terrainIndex + 200) * 10 }   // Fine surface texture
            );
        } else {
            // Moons - smoother crater features with mass-based crater density variations
            baseNoiseLevels.push(
                { frequency: 2 + planetMassVariation, amplitude: 0.6 + planetRadiusVariation, phase: seededRandom(terrainIndex) * 10 },          // Large crater rims
                { frequency: 5 + planetMassVariation * 0.6, amplitude: 0.35 + planetRadiusVariation * 0.6, phase: seededRandom(terrainIndex + 50) * 10 },    // Medium craters
                { frequency: 12 + planetMassVariation * 0.4, amplitude: 0.15 + planetRadiusVariation * 0.4, phase: seededRandom(terrainIndex + 100) * 10 },  // Small impact features
                { frequency: 20 + planetMassVariation * 0.3, amplitude: 0.06 + planetRadiusVariation * 0.3, phase: seededRandom(terrainIndex + 150) * 10 }   // Surface roughness
            );
        }
        
        return baseNoiseLevels;
    }
    
    // Generate procedural terrain for the planet
    generateTerrain() {
        this.terrain = [];
        this.terrainBaseHeight = this.planetRadius * 0.5; // Distance from core where terrain starts

        // Number of terrain points around the planet - scale with planet size
        // Larger planets get more detail, smaller planets stay smooth
        // Add planet-specific variation to ensure unique terrain even for similar-sized planets
        const planetSeed = this.planet.mass + this.planet.radius;
        const planetVariation = (Math.sin(planetSeed * 7.3) + Math.cos(planetSeed * 11.7)) * 0.15; // ±15% variation
        
        let baseTerrainPoints;
        if (this.planet.radius > 120) {
            // Gas giants - high detail for atmospheric features
            baseTerrainPoints = Math.floor(this.planet.radius * 6);
        } else if (this.planet.radius > 50) {
            // Terrestrial planets - moderate detail for geological features
            baseTerrainPoints = Math.floor(this.planet.radius * 8);
        } else {
            // Moons - lower detail to prevent jaggedness on small surfaces
            baseTerrainPoints = Math.floor(this.planet.radius * 6);
        }
        
        // Apply planet-specific variation to make each planet unique
        const terrainPoints = Math.floor(baseTerrainPoints * (1 + planetVariation));
        
        // Apply bounds based on planet type
        let finalTerrainPoints;
        if (this.planet.radius > 120) {
            finalTerrainPoints = Math.max(480, Math.min(1080, terrainPoints));
        } else if (this.planet.radius > 50) {
            finalTerrainPoints = Math.max(360, Math.min(720, terrainPoints));
        } else {
            finalTerrainPoints = Math.max(180, Math.min(360, terrainPoints));
        }
        
        console.log(`Planet radius: ${this.planet.radius}, mass: ${this.planet.mass.toFixed(2)}, base points: ${baseTerrainPoints}, variation: ${(planetVariation*100).toFixed(1)}%, final points: ${finalTerrainPoints}`);
        
        // Terrain generation parameters based on planet type
        let terrainVariation, roughness, featureCount;
        
        if (this.planet.radius > 120) {
            // Gas giants
            terrainVariation = 10;
            roughness = 0.1;
            featureCount = 6;
        } else if (this.planet.radius > 50) {
            // Terrestrial planets
            terrainVariation = 25;
            roughness = 0.3;
            featureCount = 10;
        } else {
            // Moons
            terrainVariation = 35;
            roughness = 0.4;
            featureCount = 5;
        }
        
        // Use planet properties as seed for consistent terrain
        // Include mass, radius, and planet type for unique terrain generation
        let imageSeed = 0;
        if (this.planet.Image && this.planet.Image.id) {
            // Convert planet image name to a numeric seed
            const imageName = this.planet.Image.id;
            for (let i = 0; i < imageName.length; i++) {
                imageSeed += imageName.charCodeAt(i) * (i + 1);
            }
        }
        
        const seed = this.planet.mass * 1000 + this.planet.radius * 100 + imageSeed;
        const seededRandom = (index) => {
            const x = Math.sin(seed + index) * 10000;
            return x - Math.floor(x);
        };
        
        // Generate Perlin noise generator with planet-specific seed
        const perlinNoise = this.generatePerlinNoise(seededRandom);
        
        // Get noise levels for this planet type
        const noiseLevels = this.getNoiselevels(seededRandom, 0);
        
        // Generate base terrain using the sophisticated noise levels system
        for (let i = 0; i < finalTerrainPoints; i++) {
            const angle = (i / finalTerrainPoints) * Math.PI * 2;
            
            // Convert angle to position for noise generation
            // Use circumference position to ensure seamless wrapping
            const circumferencePos = (i / finalTerrainPoints) * 100; // Scale for good noise detail
            
            // Start with base height
            let height = this.terrainBaseHeight;
            
            // Apply each noise level from getNoiselevels
            for (const noiseLevel of noiseLevels) {
                const noiseValue = Math.sin(
                    circumferencePos * noiseLevel.frequency + noiseLevel.phase
                ) * noiseLevel.amplitude;
                height += noiseValue * terrainVariation;
            }
            
            // Add Perlin noise for natural texture
            const perlinValue = perlinNoise.noise(circumferencePos * 0.1);
            height += perlinValue * terrainVariation * 0.3;
            
            // Add planet-specific characteristics
            if (this.planet.radius > 120) {
                // Gas giants - add band-like structures
                const bandNoise = Math.sin(circumferencePos * 0.5) * 0.3;
                height += bandNoise * terrainVariation * 0.4;
            } else if (this.planet.radius <= 50) {
                // Moons - add crater-like depressions
                const craterNoise = Math.max(0, -perlinNoise.noise(circumferencePos * 0.15));
                height -= craterNoise * terrainVariation * 0.4;
            }
            
            // Add small amount of random variation for natural irregularity
            height += (seededRandom(i + 300) - 0.5) * roughness * terrainVariation * 0.02;
            
            // Ensure minimum height
            height = Math.max(height, this.terrainBaseHeight * 0.3);
            
            this.terrain.push({
                angle: angle,
                height: height,
                type: this.getTerrainType(height, seededRandom(i + 400))
            });
        }
        
        // Add special terrain features
        this.addTerrainFeatures(featureCount, seededRandom);
        
        // Apply smoothing pass to reduce jaggedness
        this.smoothTerrain(2); // Apply 2 passes of smoothing
    }
    
    // Smooth terrain to reduce jaggedness while preserving overall shape
    smoothTerrain(passes = 1) {
        for (let pass = 0; pass < passes; pass++) {
            const smoothedHeights = [];
            
            for (let i = 0; i < this.terrain.length; i++) {
                // Get neighboring points (wrapping around for circular terrain)
                const prevIndex = (i - 1 + this.terrain.length) % this.terrain.length;
                const nextIndex = (i + 1) % this.terrain.length;
                
                // Average with neighbors, giving more weight to current point
                const currentHeight = this.terrain[i].height;
                const prevHeight = this.terrain[prevIndex].height;
                const nextHeight = this.terrain[nextIndex].height;
                
                // Weighted average: 50% current, 25% each neighbor
                const smoothedHeight = currentHeight * 0.5 + prevHeight * 0.25 + nextHeight * 0.25;
                
                // Ensure we don't go below minimum height
                smoothedHeights[i] = Math.max(smoothedHeight, this.terrainBaseHeight * 0.5);
            }
            
            // Apply smoothed heights
            for (let i = 0; i < this.terrain.length; i++) {
                this.terrain[i].height = smoothedHeights[i];
            }
        }
    }
    
    // Determine terrain type based on height and planet characteristics
    getTerrainType(height, random) {
        const relative = (height - this.terrainBaseHeight) / (this.terrainBaseHeight * 0.5);
        
        if (this.planet.radius > 120) {
            // Gas giants - atmospheric layers
            return relative > 0.7 ? 'storm' : relative > 0.3 ? 'cloud' : 'atmosphere';
        } else if (this.planet.radius > 50) {
            // Terrestrial - varied surface types
            if (relative > 0.8) return 'mountain';
            else if (relative > 0.4) return 'hill';
            else if (random < 0.3) return 'crater';
            else return 'plain';
        } else {
            // Moons - mostly rocky
            if (relative > 0.6) return 'peak';
            else if (random < 0.4) return 'crater';
            else return 'rock';
        }
    }
    
    // Add special terrain features
    addTerrainFeatures(count, seededRandom) {
        for (let i = 0; i < count; i++) {
            const featureAngle = seededRandom(i + 500) * Math.PI * 2;
            const featureIndex = Math.floor((featureAngle / (Math.PI * 2)) * this.terrain.length);
            const featureSize = Math.floor(seededRandom(i + 600) * 20) + 5;
            
            // Create feature (crater, mountain, etc.)
            for (let j = -featureSize; j <= featureSize; j++) {
                const targetIndex = (featureIndex + j + this.terrain.length) % this.terrain.length;
                const distance = Math.abs(j);
                const impact = Math.max(0, 1 - distance / featureSize);
                
                if (seededRandom(i + 700) > 0.5) {
                    // Mountain/hill - reduced impact for smoother features
                    this.terrain[targetIndex].height += impact * this.terrainBaseHeight * 0.5;
                    this.terrain[targetIndex].type = this.planet.radius > 50 ? 'mountain' : 'peak';
                } else {
                    // Crater - gentler craters
                    this.terrain[targetIndex].height -= impact * this.terrainBaseHeight * 0.3;
                    this.terrain[targetIndex].height = Math.max(this.terrain[targetIndex].height, this.terrainBaseHeight * 0.3);
                    this.terrain[targetIndex].type = 'crater';
                }
            }
        }
    }
    
    // Get terrain height using the exact same method as rendering
    getRenderedTerrainHeightAtAngle(angle) {
        // Normalize angle to 0-2π
        const normalizedAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        
        // Use the calculated terrain resolution instead of hardcoded value
        const terrainResolution = this.terrainResolution || 4; // Fallback to 4 if not calculated yet
        
        // Find the closest rendered terrain point
        let closestIndex = 0;
        let closestDistance = Infinity;
        
        // Check all the terrain points that are actually rendered
        for (let i = 0; i < this.terrain.length; i += terrainResolution) {
            const terrainPoint = this.terrain[i];
            let angleDiff = Math.abs(terrainPoint.angle - normalizedAngle);
            
            // Handle wrapping around 0/2π
            if (angleDiff > Math.PI) {
                angleDiff = Math.PI * 2 - angleDiff;
            }
            
            if (angleDiff < closestDistance) {
                closestDistance = angleDiff;
                closestIndex = i;
            }
        }
        
        return this.terrain[closestIndex].height;
    }
    
    // Get terrain height at a specific angle around the planet
    // This method now matches exactly how terrain is rendered
    getTerrainHeightAtAngle(angle) {
        // For better collision accuracy, let's use the rendered terrain method
        return this.getRenderedTerrainHeightAtAngle(angle);
    }
    
    // Get current player sprite based on animation state
    getCurrentPlayerSprite() {
        if (!this.isWalking) {
            return this.playerSprites.front;
        }
        
        // Walk cycle: base -> step0 -> base -> step1
        const walkCycle = [
            this.playerAnimationState, // base (left/right)
            `${this.playerAnimationState}Step0`, // step0
            this.playerAnimationState, // base again
            `${this.playerAnimationState}Step1`  // step1
        ];
        
        const spriteKey = walkCycle[this.animationFrame];
        return this.playerSprites[spriteKey] || this.playerSprites.front;
    }
    
    // Check if ship can land on planet (called from main game)
    static canLandOnPlanet(ship, planet) {
        const distance = Math.hypot(ship.worldX - planet.x, ship.worldY - planet.y);
        const relativeVelocityX = ship.velocityX - planet.velocityX;
        const relativeVelocityY = ship.velocityY - planet.velocityY;
        const relativeVelocity = Math.hypot(relativeVelocityX, relativeVelocityY);
        
        const landingDistance = planet.radius + 80; // Reasonable landing distance
        const maxLandingVelocity = 4.0; // Reasonable velocity limit
        
        return distance <= landingDistance && relativeVelocity <= maxLandingVelocity;
    }
    
    // Start planet exploration (called when L key is pressed)
    startExploration() {
        console.log("Starting planet exploration...");
        
        // Save current main game state
        this.saveMainGameState();
        
        // Set global flags
        planetExplorationActive = true;
        mainGamePaused = true;
        this.isActive = true;
        
        // Hide main game elements
        document.getElementById('gameview').style.display = 'none';
        document.getElementById('hud').style.display = 'none';
        
        // Hide radar controls
        const radarControls = document.querySelector('.radarContols');
        if (radarControls) {
            radarControls.style.display = 'none';
        }
        
        // Create exploration interface
        this.createExplorationInterface();
        
        // Start exploration loop
        this.explorationLoop();
        
        return true;
    }
    
    // Save the current main game state
    saveMainGameState() {
        this.savedMainGameState = {
            ship: {
                worldX: this.ship.worldX,
                worldY: this.ship.worldY,
                velocityX: this.ship.velocityX,
                velocityY: this.ship.velocityY,
                angle: this.ship.angle,
                angularVelocity: this.ship.angularVelocity
            },
            // Add more state as needed
        };
        console.log("Main game state saved");
    }
    
    // Restore main game state when leaving planet
    restoreMainGameState() {
        if (this.savedMainGameState) {
            this.ship.worldX = this.savedMainGameState.ship.worldX;
            this.ship.worldY = this.savedMainGameState.ship.worldY;
            this.ship.velocityX = this.savedMainGameState.ship.velocityX;
            this.ship.velocityY = this.savedMainGameState.ship.velocityY;
            this.ship.angle = this.savedMainGameState.ship.angle;
            this.ship.angularVelocity = this.savedMainGameState.ship.angularVelocity;
            console.log("Main game state restored");
        }
    }
    
    // Create the planet exploration interface
    createExplorationInterface() {
        // Create main exploration container with flex layout
        const explorationContainer = document.createElement('div');
        explorationContainer.id = 'explorationContainer';
        explorationContainer.style.position = 'absolute';
        explorationContainer.style.top = '50%';
        explorationContainer.style.left = '50%';
        explorationContainer.style.transform = 'translate(-50%, -50%)';
        explorationContainer.style.display = 'flex';
        explorationContainer.style.flexDirection = 'row';
        explorationContainer.style.zIndex = '1000';
        
        // Create main exploration canvas (matching main game size)
        this.explorationCanvas = document.createElement('canvas');
        this.explorationCanvas.id = 'explorationCanvas';
        this.explorationCanvas.width = 1080;
        this.explorationCanvas.height = 720;
        this.explorationCanvas.style.border = '2px solid #fff';
        this.explorationCanvas.style.backgroundColor = '#001122';
        
        // Create context
        this.explorationCtx = this.explorationCanvas.getContext('2d');
        
        // Create HUD canvas (matching main game HUD size)
        this.hudCanvas = document.createElement('canvas');
        this.hudCanvas.id = 'explorationHUD';
        this.hudCanvas.width = 300;
        this.hudCanvas.height = 720;
        this.hudCanvas.style.border = '2px solid #fff';
        this.hudCanvas.style.backgroundColor = '#001133';
        
        // Create HUD context
        this.hudCtx = this.hudCanvas.getContext('2d');
        
        // Create exit button
        const exitButton = document.createElement('button');
        exitButton.textContent = 'Return to Ship';
        exitButton.style.position = 'absolute';
        exitButton.style.bottom = '-40px';
        exitButton.style.left = '50%';
        exitButton.style.transform = 'translateX(-50%)';
        exitButton.style.padding = '10px 20px';
        exitButton.style.fontSize = '16px';
        exitButton.style.backgroundColor = '#88f';
        exitButton.style.color = '#fff';
        exitButton.style.border = 'none';
        exitButton.style.borderRadius = '5px';
        exitButton.style.cursor = 'pointer';
        
        exitButton.addEventListener('click', () => {
            this.endExploration();
        });
        
        // Assemble interface
        explorationContainer.appendChild(this.explorationCanvas);
        explorationContainer.appendChild(this.hudCanvas);
        explorationContainer.appendChild(exitButton);
        
        document.body.appendChild(explorationContainer);
        
        // Set initial player position - player stays at center, world rotates around them
        this.playerWorldAngle = 0; // Start at the "top" of the planet
        const initialTerrainHeight = this.getTerrainHeightAtAngle(this.playerWorldAngle);
        this.playerHeight = initialTerrainHeight + this.playerRadius + 5; // Player center above terrain + player radius + small gap
        this.playerVelocity = { x: 0, y: 0 };
        this.playerPosition = { x: 540, y: 300 }; // Center of the larger canvas (1080/2, adjusted for planet view)
        this.onSurface = false; // Start slightly above surface so player can land
        
        // Initialize smooth movement properties
        this.angleVelocity = 0;
        this.targetAngle = this.playerWorldAngle;
    }
    
    // Main exploration game loop
    explorationLoop() {
        if (!this.isActive) return;
        
        this.updateExploration();
        this.drawExploration();
        this.drawHUD();
        
        requestAnimationFrame(() => this.explorationLoop());
    }
    
    // Update exploration physics and input
    updateExploration() {
        // Get terrain height at current position (height above planet surface)
        // Rotate collision detection by -90 degrees to align with player position
        const collisionAngle = this.playerWorldAngle - Math.PI / 2;
        const terrainHeight = this.getTerrainHeightAtAngle(collisionAngle);
        
        // Calculate the actual surface position from planet center
        // This must match exactly how terrain is drawn: planetRadius + terrainHeight
        const actualSurfaceHeight = this.planetRadius + terrainHeight;
        
        // Player's distance from planet center (player center position)
        const playerDistanceFromCenter = this.planetRadius + this.playerHeight;
        
        // Check if player is on the surface (player's bottom touches terrain)
        // Player's bottom is at: playerDistanceFromCenter - playerRadius
        const playerBottom = playerDistanceFromCenter - this.playerRadius;
        
        // Surface collision tolerance - small value to prevent jitter
        const surfaceTolerance = 1;
        this.onSurface = playerBottom <= (actualSurfaceHeight + surfaceTolerance);
        
        // Handle input - A/D and Arrow Keys rotate the world, player stays in center
        const jumpPressed = keys[' '] || keys['Space'];
        
        // Calculate desired movement direction
        let moveDirection = 0;
        if (keys['a'] || keys['A'] || keys['ArrowLeft']) {
            moveDirection -= 1; // Move left
        }
        if (keys['d'] || keys['D'] || keys['ArrowRight']) {
            moveDirection += 1; // Move right
        }
        
        // Update animation state based on movement
        this.isWalking = Math.abs(moveDirection) > 0;
        
        if (moveDirection < 0) {
            this.playerAnimationState = 'left';
        } else if (moveDirection > 0) {
            this.playerAnimationState = 'right';
        } else {
            this.playerAnimationState = 'front';
            this.animationFrame = 0; // Reset animation when stopped
        }
        
        // Update walk animation timer
        if (this.isWalking) {
            this.animationTimer += this.animationSpeed;
            if (this.animationTimer >= 1.0) {
                this.animationTimer = 0;
                this.animationFrame = (this.animationFrame + 1) % 4; // 4 frame cycle: base, step0, base, step1
            }
        } else {
            this.animationTimer = 0;
            this.animationFrame = 0;
        }
        
        if (this.onSurface) {
            // Player is on surface - smooth movement with acceleration/deceleration
            
            // Apply acceleration towards desired movement
            const targetAngularVelocity = moveDirection * this.moveSpeed;
            const velocityDifference = targetAngularVelocity - this.angleVelocity;
            const acceleration = Math.sign(velocityDifference) * Math.min(Math.abs(velocityDifference), this.maxAngularAcceleration);
            
            this.angleVelocity += acceleration;
            
            // Apply damping when no input
            if (moveDirection === 0) {
                this.angleVelocity *= this.angleDamping;
            }
            
            // Predictive collision detection before movement
            if (Math.abs(this.angleVelocity) > 0.0001) {
                // Check terrain ahead before moving
                const proposedAngle = this.playerWorldAngle + this.angleVelocity;
                const proposedCollisionAngle = proposedAngle - Math.PI / 2;
                const proposedTerrainHeight = this.getTerrainHeightAtAngle(proposedCollisionAngle);
                
                // Get current terrain for comparison
                const currentCollisionAngle = this.playerWorldAngle - Math.PI / 2;
                const currentTerrainHeight = this.getTerrainHeightAtAngle(currentCollisionAngle);
                
                // Calculate terrain slope change
                const terrainSlopeChange = proposedTerrainHeight - currentTerrainHeight;
                const maxWalkableSlope = this.playerRadius * 0.8;
                const maxClimbableSlope = this.playerRadius * 1.5;
                
                // Only block movement when trying to walk UP steep terrain
                const isMovingUpSlope = terrainSlopeChange > 0; // Only positive slope changes (going upward)
                const isSteppingIntoSteepTerrain = isMovingUpSlope && Math.abs(terrainSlopeChange) > maxWalkableSlope;
                const isSteppingIntoCliff = isMovingUpSlope && Math.abs(terrainSlopeChange) > maxClimbableSlope;
                
                let canMove = true;
                
                if (isSteppingIntoCliff) {
                    // Complete movement block for upward cliff faces only
                    canMove = false;
                    this.angleVelocity *= 0.05; // Almost stop movement
                    this.isWalking = false; // Stop walking animation when blocked
                    
                    // Add bounce feedback to indicate blocked movement
                    if (Math.abs(this.angleVelocity) > 0.005) {
                        this.playerVelocity.y += 0.5; // Small upward nudge
                    }
                } else if (isSteppingIntoSteepTerrain) {
                    // Reduced movement for steep but climbable upward terrain
                    const slopeResistance = Math.abs(terrainSlopeChange) / maxClimbableSlope;
                    this.angleVelocity *= (1 - slopeResistance * 0.8); // Strong resistance
                    canMove = Math.abs(this.angleVelocity) > 0.001; // Only move if there's still significant velocity
                    
                    // Stop walking animation if movement is too slow due to steep terrain
                    if (!canMove) {
                        this.isWalking = false;
                    }
                }
                
                // Only update position if movement is allowed
                if (canMove) {
                    this.playerWorldAngle += this.angleVelocity;
                    // Normalize angle
                    this.playerWorldAngle = ((this.playerWorldAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                    
                    // Reset vertical velocity when moving on surface
                    this.playerVelocity.y *= 0.9;
                }
            }
            
            // Keep player at surface height when on ground (player's bottom touches terrain)
            // Smooth terrain following with improved responsiveness
            const targetPlayerHeight = terrainHeight + this.playerRadius; // Player center should be terrain height + radius
            const heightDifference = Math.abs(targetPlayerHeight - this.playerHeight);
            
            // Adjust smoothing based on height difference - more responsive for larger changes
            let smoothingFactor = 0.2; // Default smoothing
            if (heightDifference > this.playerRadius * 0.5) {
                smoothingFactor = 0.4; // More responsive for significant terrain changes
            }
            if (heightDifference > this.playerRadius) {
                smoothingFactor = 0.6; // Even more responsive for large terrain changes
            }
            
            this.playerHeight = this.playerHeight * (1 - smoothingFactor) + targetPlayerHeight * smoothingFactor;
            
            // Jumping - only with SPACE, not W
            if (jumpPressed) {
                this.playerVelocity.y = -this.jumpPower; // Negative to move away from planet
                this.onSurface = false;
                this.angleVelocity *= 0.7; // Reduce horizontal momentum when jumping
            }
        } else {
            // Player is in the air - apply gravity and limited air control
            
            // Gravity pulls towards planet surface (positive Y brings player back to surface)
            this.playerVelocity.y += this.gravity;
            
            // Limited air control for A/D and Arrow Keys (much slower than on surface)
            const airControlLinearSpeed = 1; // Reduced for smoother air control
            const airControl = airControlLinearSpeed / this.planetRadius;
            const targetAirVelocity = moveDirection * airControl;
            
            // Smooth air control with terrain collision prediction
            this.angleVelocity = this.angleVelocity * 0.9 + targetAirVelocity * 0.1;
            
            // Predictive collision detection for air movement
            if (Math.abs(this.angleVelocity) > 0.0001) {
                // Check terrain ahead before moving
                const proposedAngle = this.playerWorldAngle + this.angleVelocity;
                const proposedCollisionAngle = proposedAngle - Math.PI / 2;
                const proposedTerrainHeight = this.getTerrainHeightAtAngle(proposedCollisionAngle);
                
                // Get current terrain for comparison
                const currentCollisionAngle = this.playerWorldAngle - Math.PI / 2;
                const currentTerrainHeight = this.getTerrainHeightAtAngle(currentCollisionAngle);
                
                // Calculate if player would collide with terrain at proposed position
                const proposedPlayerBottom = (this.planetRadius + this.playerHeight) - this.playerRadius;
                const proposedSurfaceHeight = this.planetRadius + proposedTerrainHeight;
                
                // Also check for steep terrain that should block horizontal movement
                const terrainSlopeChange = proposedTerrainHeight - currentTerrainHeight;
                const maxClimbableSlope = this.playerRadius * 1.5;
                const isSteppingIntoUpwardCliff = terrainSlopeChange > 0 && Math.abs(terrainSlopeChange) > maxClimbableSlope;
                
                let canMove = true;
                
                // Block movement only if flying into an upward cliff face
                if (isSteppingIntoUpwardCliff && proposedPlayerBottom <= proposedSurfaceHeight + this.playerRadius) {
                    canMove = false;
                    this.angleVelocity *= 0.1; // Reduce movement significantly
                    
                    // Bounce off the cliff face
                    this.playerVelocity.y -= 0.5; // Push away from cliff
                }
                
                // Only update position if movement is allowed
                if (canMove) {
                    this.playerWorldAngle += this.angleVelocity;
                }
            }
            
            // W/S for additional air movement (only when already in air)
            const verticalAirControl = this.gravity - 0.01;
            let thrusterActive = false;
            let thrusterDirection = 0; // -1 for upward thrust, 1 for downward thrust
            if (keys['w'] || keys['W'] || keys['ArrowUp']) {
                if (this.evaFuel <= 0) {
                    return;
                } else {
                    // Reduce thrust strength if player is in water to prevent speed stacking with buoyancy
                    const thrustForce = this.inWater ? verticalAirControl * 0.9 : verticalAirControl;
                    this.playerVelocity.y -= thrustForce; // Move away from planet
                    thrusterActive = true;
                    thrusterDirection = -1; // Upward thrust
                    this.evaFuel -= 0.01; // Consume small amount of EVA fuel
                }
            }
            if (keys['s'] || keys['S'] || keys['ArrowDown']) {
                if (this.evaFuel <= 0) {
                    return;
                } else {
                    // Normal thrust strength for downward movement
                    this.playerVelocity.y += verticalAirControl; // Move toward planet
                    thrusterActive = true;
                    thrusterDirection = 1; // Downward thrust
                    this.evaFuel -= 0.01; // Consume small amount of EVA fuel
                }
            }
            
            
            // Generate thruster particles when using air control
            if (thrusterActive) {
                this.generateThrusterParticles(thrusterDirection);
            }
        }
        
        // Apply vertical velocity (height changes)
        this.playerHeight += this.playerVelocity.y;
        
        // Apply progressive drag system based on velocity
        const baseDrag = 0.02; // Base drag coefficient
        const speedDrag = 0.001; // Additional drag based on speed
        
        // Calculate drag force based on velocity (higher speed = more drag)
        const speed = Math.abs(this.playerVelocity.y);
        const dragCoefficient = baseDrag + (speedDrag * speed);
        
        // Apply drag in opposite direction of movement
        if (this.playerVelocity.y > 0) {
            // Moving downward - apply upward drag
            this.playerVelocity.y *= (1 - dragCoefficient);
        } else if (this.playerVelocity.y < 0) {
            // Moving upward - apply downward drag
            this.playerVelocity.y *= (1 - dragCoefficient);
        }
        
        // Additional drag when in water (water resistance)
        if (this.inWater) {
            this.playerVelocity.y *= 0.95; // Extra water resistance
        }
        
        // Check collision with planet surface/terrain (player's bottom hits terrain)
        // Recalculate current terrain height for precise collision using the corrected angle
        const currentCollisionAngle = this.playerWorldAngle - Math.PI / 2;
        const currentTerrainHeight = this.getTerrainHeightAtAngle(currentCollisionAngle);
        const currentSurfaceHeight = this.planetRadius + currentTerrainHeight;
        const currentPlayerBottom = (this.planetRadius + this.playerHeight) - this.playerRadius;
        
        if (currentPlayerBottom <= currentSurfaceHeight) {
            const targetPlayerHeight = currentTerrainHeight + this.playerRadius;
            const heightDifference = targetPlayerHeight - this.playerHeight;
            
            // Calculate slope by checking terrain height slightly ahead in movement direction
            const lookAheadAngle = this.playerWorldAngle + (this.angleVelocity * 10) - Math.PI / 2; // Look ahead based on movement
            const lookAheadTerrainHeight = this.getTerrainHeightAtAngle(lookAheadAngle);
            const slopeChange = lookAheadTerrainHeight - currentTerrainHeight;
            
            // Define slope limits
            const maxWalkableSlope = this.playerRadius * 0.8; // Player can walk up slopes up to 80% of their radius
            const maxClimbableSlope = this.playerRadius * 1.5; // Player can smooth-climb slopes up to 1.5x their radius
            
            // Check if this is a steep surface that requires jumping
            const isMovingUpSlope = heightDifference > 0 && Math.abs(this.angleVelocity) > 0.001;
            const isSteepSlope = Math.abs(slopeChange) > maxWalkableSlope;
            const isVerysteepSlope = Math.abs(slopeChange) > maxClimbableSlope;
            
            if (isMovingUpSlope && isSteepSlope && this.onSurface) {
                // This is a steep slope - check if player can climb it
                if (isVerysteepSlope) {
                    // Too steep - block movement and require jumping
                    this.angleVelocity *= 0.1; // Greatly reduce horizontal movement
                    this.playerHeight = currentTerrainHeight + this.playerRadius; // Keep at current level
                    this.playerVelocity.y = Math.max(0, this.playerVelocity.y); // Don't let player sink
                    
                    // Add a small bounce to indicate the obstacle
                    if (Math.abs(this.angleVelocity) > 0.01) {
                        this.playerVelocity.y += 1; // Small upward nudge
                    }
                } else {
                    // Moderately steep - slow climbing with effort
                    const climbEffort = Math.abs(slopeChange) / maxClimbableSlope;
                    const climbSpeed = 0.15 * (1 - climbEffort * 0.7); // Slower climbing for steeper slopes
                    
                    this.playerHeight = this.playerHeight * (1 - climbSpeed) + targetPlayerHeight * climbSpeed;
                    this.angleVelocity *= (1 - climbEffort * 0.3); // Reduce movement speed when climbing
                    this.playerVelocity.y *= 0.8; // Reduce vertical velocity during climb
                }
            } else {
                // Normal collision handling for non-steep surfaces or when jumping/falling
                const heightDifferenceAbs = Math.abs(heightDifference);
                const maxSmoothHeight = this.playerRadius * 0.5; // Smooth adjustment for small height changes
                
                if (heightDifferenceAbs <= maxSmoothHeight && this.onSurface) {
                    // Small height difference - smooth adjustment
                    const adjustSpeed = 0.4;
                    this.playerHeight = this.playerHeight * (1 - adjustSpeed) + targetPlayerHeight * adjustSpeed;
                    this.playerVelocity.y *= 0.7;
                } else {
                    // Large height difference or coming from air - firm placement
                    this.playerHeight = targetPlayerHeight;
                    // Apply bounce and friction
                    this.playerVelocity.y *= -0.3;
                }
            }
            
            if (Math.abs(this.playerVelocity.y) < 1) {
                this.playerVelocity.y = 0;
                this.onSurface = true;
            }
        }
        
        // Water interaction
        this.inWater = false;
        this.onIce = false; // New property to track if player is on frozen water
        
        if (this.hasWater) {
            const waterHeight = this.waterLevel;
            const currentPlayerDistanceFromCenter = this.planetRadius + this.playerHeight;
            const currentPlayerBottom = currentPlayerDistanceFromCenter - this.playerRadius;
            const currentPlayerTop = currentPlayerDistanceFromCenter + this.playerRadius;
            
            // Check if player is in water (water is at planetRadius + waterLevel)
            const waterSurfaceHeight = this.planetRadius + waterHeight;
            
            if (this.waterType === 'frozen') {
                // Frozen water acts as solid ground - treat ice surface as terrain
                if (currentPlayerBottom <= waterSurfaceHeight + 2) { // Small tolerance for ice surface
                    this.onIce = true;
                    
                    // If player is below ice surface, push them up to stand on ice
                    if (currentPlayerBottom <= waterSurfaceHeight) {
                        this.playerHeight = waterHeight + this.playerRadius;
                        this.playerVelocity.y = Math.max(0, this.playerVelocity.y); // Stop downward movement
                        this.onSurface = true; // Player can walk on ice like terrain
                        
                        // Add slight slipperiness to ice movement
                        this.angleVelocity *= 0.999; // Less friction on ice
                    }
                }
            } else if (currentPlayerBottom <= waterSurfaceHeight) {
                // Regular water physics for non-frozen water
                this.inWater = true;
                
                // Water physics - buoyancy and resistance
                if (this.waterType === 'ocean' || this.waterType === 'lakes') {
                    // Buoyancy force (opposes gravity)
                    const submersionRatio = Math.min(1, (waterSurfaceHeight - currentPlayerBottom) / (this.playerRadius * 2));
                    const buoyancy = -this.gravity * 0.8 * submersionRatio; // 80% buoyancy
                    this.playerVelocity.y += buoyancy;
                    
                    // Water resistance
                    this.playerVelocity.y *= 0.95;
                    this.angleVelocity *= 0.98; // Slow down horizontal movement in water
                    
                    // Prevent player from sinking too deep into water
                    if (currentPlayerTop < waterSurfaceHeight && this.playerVelocity.y < 0) {
                        this.playerVelocity.y *= 0.5;
                    }
                }
            }
        }
        
        // Safety check: never let player go below planet surface (minimum terrain height)
        const minimumTerrainHeight = this.terrainBaseHeight * 0.3;
        if (this.playerHeight < minimumTerrainHeight + this.playerRadius) {
            this.playerHeight = minimumTerrainHeight + this.playerRadius;
            this.playerVelocity.y = 0;
        }
        
        // Keep player from flying too far away
        if (this.playerHeight > this.maxPlayerHeight) {
            this.playerHeight = this.maxPlayerHeight;
            this.playerVelocity.y = Math.min(0, this.playerVelocity.y);
        }
        
        // Normalize player world angle
        this.playerWorldAngle = ((this.playerWorldAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        
        // Update thruster particles
        // Update thruster particles using main.js global system
        updateGlobalParticles(); // Update all global particles including thrusters
        
        // Exit with ESC
        if (keys['Escape']) {
            this.endExploration();
            return;
        }
    }
    
    // Generate thruster particles when using air control (using main.js ThrusterParticle system)
    generateThrusterParticles(thrusterDirection) {
        // Determine particle spawn position based on player facing direction and thrust direction
        let particleOffsetX = 0;
        let particleOffsetY = 0;
        
        // Base particle spawn position (behind the player)
        if (this.playerAnimationState === 'left') {
            particleOffsetX = this.playerRadius * 0.8; // Particles come from right side
        } else if (this.playerAnimationState === 'right') {
            particleOffsetX = -this.playerRadius * 0.8; // Particles come from left side
        } else {
            // Front-facing, particles come from bottom or top based on thrust direction
            particleOffsetY = thrusterDirection * this.playerRadius * 0.8;
        }
        
        // Additional offset based on thrust direction
        if (thrusterDirection < 0) { // Upward thrust (W key)
            particleOffsetY += this.playerRadius * 0.5; // Particles come from below player
        } else { // Downward thrust (S key)
            particleOffsetY -= this.playerRadius * 0.5; // Particles come from above player
        }
        
        // Create 2-3 particles per frame when thrusting using main.js ThrusterParticle class
        const particleCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < particleCount; i++) {
            const particleX = this.playerPosition.x + particleOffsetX + (Math.random() - 0.5) * 8;
            const particleY = this.playerPosition.y + particleOffsetY + (Math.random() - 0.5) * 8;
            
            // Calculate direction for particle emission (opposite to thrust direction)
            const particleDirection = Math.atan2(
                thrusterDirection * -2, // Particles move opposite to thrust: down for W, up for S
                particleOffsetX
            ) + (Math.random() - 0.5) * 0.5; // Add some spread
            
            // Player angle for proper particle rotation (90 degrees offset for planet exploration)
            const playerAngle = 0; // No rotation needed for planet exploration thruster particles
            
            // Create ThrusterParticle using main.js class
            const thrusterParticle = new ThrusterParticle(
                particleX,
                particleY,
                particleDirection,
                playerAngle,
                0, // No inherited velocity in planet exploration
                0
            );
            
            // Adjust particle properties for planet exploration
            thrusterParticle.size *= 0.5; // Smaller particles for planet exploration
            thrusterParticle.maxLife *= 0.7; // Shorter lifetime
            thrusterParticle.currentLife = thrusterParticle.maxLife;
            
            globalThrusterParticles.push(thrusterParticle);
        }
    }
    
    
    // Draw thruster particles using main.js global system
    drawThrusterParticles() {
        // Save current context
        const originalCtx = ctx;
        
        // Temporarily set the global ctx to our exploration context
        ctx = this.explorationCtx;
        
        // Draw only thruster particles from the global system
        for (let particle of globalThrusterParticles) {
            particle.show();
        }
        
        // Restore original context
        ctx = originalCtx;
    }

    // Draw the exploration scene
    drawExploration() {
        // Clear canvas
        this.explorationCtx.clearRect(0, 0, this.explorationCanvas.width, this.explorationCanvas.height);
        
        // Draw space background
        this.explorationCtx.fillStyle = '#000011';
        this.explorationCtx.fillRect(0, 0, this.explorationCanvas.width, this.explorationCanvas.height);
        
        // Draw rotating background stars (using the new system from main.js)
        if (typeof drawRotatingBackgroundStars === 'function') {
            drawRotatingBackgroundStars(this.playerWorldAngle, this.explorationCanvas.width, this.explorationCanvas.height, this.explorationCtx);
        } else {
            // Fallback to simple stars if function not available
            this.explorationCtx.fillStyle = '#ffffff';
            for (let i = 0; i < 30; i++) {
                const starAngle = (i * 0.5) + this.playerWorldAngle * 0.2;
                const starDistance = 250 + (i % 3) * 30;
                const starX = this.playerPosition.x + Math.cos(starAngle) * starDistance;
                const starY = this.playerPosition.y + Math.sin(starAngle) * starDistance;
                
                if (starX >= 0 && starX < this.explorationCanvas.width && 
                    starY >= 0 && starY < this.explorationCanvas.height) {
                    this.explorationCtx.fillRect(starX, starY, 1, 1);
                }
            }
        }
        
        // Calculate planet position relative to player
        // Planet center should be positioned so player sits on surface regardless of radius
        const planetScreenX = this.planetCenter.x;
        // Planet center = player position + radius + current height above surface
        const planetScreenY = this.playerPosition.y + this.planetRadius + this.playerHeight;
        
        // Draw the circular planet with planet-specific colors
        this.explorationCtx.fillStyle = this.planetColors.main;
        this.explorationCtx.beginPath();
        this.explorationCtx.arc(planetScreenX, planetScreenY, this.planetRadius, 0, Math.PI * 2);
        this.explorationCtx.fill();
        
        // Draw planet outline
        this.explorationCtx.strokeStyle = this.planetColors.surface;
        this.explorationCtx.lineWidth = 3;
        this.explorationCtx.stroke();
        
        // Draw surface features that rotate based on player's world angle
        this.drawPlanetSurfaceFeatures(planetScreenX, planetScreenY);
        
        // Draw water layer if planet has water
        if (this.hasWater) {
            this.drawWaterLayer(planetScreenX, planetScreenY);
        }
        
        // Draw thruster particles (behind player)
        this.drawThrusterParticles();
        
        // Get current player sprite
        const playerSprite = this.getCurrentPlayerSprite();
        
        if (playerSprite && playerSprite.complete) {
            // Draw the player sprite
            const spriteWidth = 32; // Width of the player sprite
            const spriteHeight = 48; // Height of the player sprite
            this.explorationCtx.drawImage(
                playerSprite,
                this.playerPosition.x - spriteWidth / 2,
                this.playerPosition.y - spriteHeight / 2,
                spriteWidth,
                spriteHeight
            );
        } else {
            // Fallback to circle if sprite isn't loaded
            this.explorationCtx.fillStyle = '#bbf';
            this.explorationCtx.beginPath();
            this.explorationCtx.arc(this.playerPosition.x, this.playerPosition.y, 8, 0, Math.PI * 2);
            this.explorationCtx.fill();
            
            // Draw player outline
            this.explorationCtx.strokeStyle = '#ffffff';
            this.explorationCtx.lineWidth = 1;
            this.explorationCtx.stroke();
        }
        
        // Draw thruster particles
        this.drawThrusterParticles();
    }
    
    // Draw terrain that rotates with the world
    drawPlanetSurfaceFeatures(planetX, planetY) {
        // Draw the planet core first
        this.explorationCtx.save();
        
        // Draw terrain as connected polygon
        this.explorationCtx.beginPath();
        
        let firstPoint = true;
        // Use the calculated terrain resolution for consistent performance across planet sizes
        const terrainResolution = this.terrainResolution || 4; // Fallback to 4 if not calculated yet
        
        for (let i = 0; i < this.terrain.length; i += terrainResolution) {
            const terrainPoint = this.terrain[i];
            const relativeAngle = terrainPoint.angle - this.playerWorldAngle;
            
            // Use the same height calculation as collision detection for perfect alignment
            const terrainHeight = this.getRenderedTerrainHeightAtAngle(terrainPoint.angle);
            const terrainDistance = this.planetRadius + terrainHeight;
            const terrainX = planetX + Math.cos(relativeAngle) * terrainDistance;
            const terrainY = planetY + Math.sin(relativeAngle) * terrainDistance;
            
            if (firstPoint) {
                this.explorationCtx.moveTo(terrainX, terrainY);
                firstPoint = false;
            } else {
                this.explorationCtx.lineTo(terrainX, terrainY);
            }
        }
        
        // Close the terrain polygon by connecting back to start
        this.explorationCtx.closePath();
        
        // Fill terrain with surface color
        this.explorationCtx.fillStyle = this.planetColors.surface;
        this.explorationCtx.fill();
        
        // Outline terrain
        this.explorationCtx.strokeStyle = this.planetColors.features;
        this.explorationCtx.lineWidth = 2;
        this.explorationCtx.stroke();
        
        // Draw special terrain features
        this.drawTerrainFeatures(planetX, planetY);
        
        this.explorationCtx.restore();
    }
    
    // Draw special terrain features (mountains, craters, etc.)
    drawTerrainFeatures(planetX, planetY) {
        // Use double the terrain resolution for features to reduce their density appropriately
        const featureResolution = (this.terrainResolution || 4) * 2;
        
        for (let i = 0; i < this.terrain.length; i += featureResolution) {
            const terrainPoint = this.terrain[i];
            const relativeAngle = terrainPoint.angle - this.playerWorldAngle;
            
            // Use the same height calculation as collision detection
            const terrainHeight = this.getRenderedTerrainHeightAtAngle(terrainPoint.angle);
            const terrainDistance = this.planetRadius + terrainHeight;
            const featureX = planetX + Math.cos(relativeAngle) * terrainDistance;
            const featureY = planetY + Math.sin(relativeAngle) * terrainDistance;
            
            // Only draw visible features
            if (featureX >= -50 && featureX <= this.explorationCanvas.width + 50 &&
                featureY >= -50 && featureY <= this.explorationCanvas.height + 50) {
                
                // Draw different features based on terrain type
                this.explorationCtx.save();
                
                switch (terrainPoint.type) {
                    case 'mountain':
                    case 'peak':
                        this.explorationCtx.fillStyle = this.planetColors.features;
                        this.explorationCtx.beginPath();
                        this.explorationCtx.arc(featureX, featureY, 6, 0, Math.PI * 2);
                        this.explorationCtx.fill();
                        break;
                        
                    case 'crater':
                        this.explorationCtx.strokeStyle = this.planetColors.features;
                        this.explorationCtx.lineWidth = 2;
                        this.explorationCtx.beginPath();
                        this.explorationCtx.arc(featureX, featureY, 5, 0, Math.PI * 2);
                        this.explorationCtx.stroke();
                        break;
                        
                    case 'storm':
                        // Swirling cloud pattern for gas giants
                        this.explorationCtx.fillStyle = `${this.planetColors.features}80`; // Semi-transparent
                        this.explorationCtx.beginPath();
                        this.explorationCtx.arc(featureX, featureY, 8, 0, Math.PI * 2);
                        this.explorationCtx.fill();
                        break;
                        
                    case 'cloud':
                        this.explorationCtx.fillStyle = `${this.planetColors.surface}60`; // More transparent
                        this.explorationCtx.beginPath();
                        this.explorationCtx.arc(featureX, featureY, 4, 0, Math.PI * 2);
                        this.explorationCtx.fill();
                        break;
                }
                
                this.explorationCtx.restore();
            }
        }
    }
    
    // Draw water layer based on water type
    drawWaterLayer(planetX, planetY) {
        this.explorationCtx.save();
        
        const waterRadius = this.planetRadius + this.waterLevel;
        
        if (this.waterType === 'ocean') {
            // Full circular ocean covering the planet
            this.explorationCtx.globalAlpha = this.waterOpacity;
            this.explorationCtx.fillStyle = this.waterColor;
            this.explorationCtx.beginPath();
            this.explorationCtx.arc(planetX, planetY, waterRadius, 0, Math.PI * 2);
            this.explorationCtx.fill();
            
        } else if (this.waterType === 'frozen') {
            // Frozen water - solid ice layer that acts like terrain
            this.explorationCtx.globalAlpha = 0.95; // Nearly opaque ice
            this.explorationCtx.fillStyle = this.waterColor;
                       this.explorationCtx.beginPath();
            this.explorationCtx.arc(planetX, planetY, waterRadius, 0, Math.PI * 2);
            this.explorationCtx.fill();
            
            // Add ice texture with cracks and patterns
            this.explorationCtx.globalAlpha = 0.4;
            this.explorationCtx.strokeStyle = '#ffffff';
            this.explorationCtx.lineWidth = 1;
            
            // Generate consistent ice crack patterns
            const seed = this.planet.x + this.planet.y + this.planet.radius;
            const seededRandom = (index) => {
                const x = Math.sin(seed + index) * 10000;
                return x - Math.floor(x);
            };
            
            // Add circular ice pattern lines
            this.explorationCtx.globalAlpha = 0.2;
            for (let ring = 1; ring <= 3; ring++) {
                const ringRadius = waterRadius * (0.6 + ring * 0.15);
                this.explorationCtx.beginPath();
                this.explorationCtx.arc(planetX, planetY, ringRadius, 0, Math.PI * 2);
                this.explorationCtx.stroke();
            }
            
            // Add ice shine/highlight
            this.explorationCtx.globalAlpha = 0.6;
            this.explorationCtx.strokeStyle = '#e0f6ff';
            this.explorationCtx.lineWidth = 2;
            this.explorationCtx.beginPath();
            this.explorationCtx.arc(planetX, planetY, waterRadius * 0.95, Math.PI * 1.2, Math.PI * 1.8);
            this.explorationCtx.stroke();
        }
        
        this.explorationCtx.restore();
    }
    
    // End exploration and return to main game
    endExploration() {
        console.log("Ending planet exploration...");
        
        // Clean up exploration interface
        const explorationContainer = document.getElementById('explorationContainer');
        if (explorationContainer) {
            explorationContainer.remove();
        }
        
        // Restore main game state
        this.restoreMainGameState();
        
        // Show main game elements
        document.getElementById('gameview').style.display = 'block';
        document.getElementById('hud').style.display = 'block';
        
        // Show radar controls
        const radarControls = document.querySelector('.radarContols');
        if (radarControls) {
            radarControls.style.display = 'block';
        }
        
        // Reset global flags
        planetExplorationActive = false;
        mainGamePaused = false;
        this.isActive = false;
        currentPlanetExploration = null;
        
        console.log("Returned to main game");
    }
    
    // Draw organized HUD information in the side panel
    drawHUD() {
        // Clear HUD canvas
        this.hudCtx.clearRect(0, 0, this.hudCanvas.width, this.hudCanvas.height);
        
        // Set up text styling
        this.hudCtx.font = '14px Arial';
        this.hudCtx.textAlign = 'left';
        
        let yPos = 20;
        const lineHeight = 18;
        const sectionSpacing = 10;
        
        // Player Status Section
        this.hudCtx.fillStyle = '#ffdd44';
        this.hudCtx.font = 'bold 16px Arial';
        this.hudCtx.fillText('PLAYER STATUS', 10, yPos);
        yPos += lineHeight + 5;
        
        this.hudCtx.font = '14px Arial';
        this.hudCtx.fillStyle = '#ffffff';
        
        let statusText = this.onSurface ? 'On Surface' : 'In Air';
        if (this.inWater) {
            statusText = this.waterType === 'frozen' ? 'On Ice' : 'In Water';
        } else if (this.onIce) {
            statusText = 'On Ice';
        }
        
        this.hudCtx.fillText(`Status: ${statusText}`, 10, yPos);
        yPos += lineHeight;
        this.hudCtx.fillText(`Height: ${this.playerHeight.toFixed(1)}`, 10, yPos);
        yPos += lineHeight;
        this.hudCtx.fillText(`Velocity: ${Math.abs(this.playerVelocity.y).toFixed(1)}`, 10, yPos);
        yPos += lineHeight;
        this.hudCtx.fillText(`Position: ${(this.playerWorldAngle * 180 / Math.PI).toFixed(1)}°`, 10, yPos);
        yPos += lineHeight + sectionSpacing;
        this.hudCtx.fillText(`EVA Fuel: ${this.evaFuel.toFixed(2)}`, 10, yPos);
        yPos += lineHeight + sectionSpacing;
        
        // Planet Information Section
        this.hudCtx.fillStyle = '#44ddff';
        this.hudCtx.font = 'bold 16px Arial';
        this.hudCtx.fillText('PLANET INFO', 10, yPos);
        yPos += lineHeight + 5;
        
        this.hudCtx.font = '14px Arial';
        this.hudCtx.fillStyle = '#ffffff';
        
        const planetType = this.planet.radius > 120 ? 'Giant Planet' : this.planet.radius > 50 ? 'Terrestrial Planet' : 'Moon';
        const planetName = this.planet.Image && this.planet.Image.id ? this.planet.Image.id.replace('Planet', '') : 'Unknown Planet';
        
        this.hudCtx.fillText(`Name: ${planetName}`, 10, yPos);
        yPos += lineHeight;
        this.hudCtx.fillText(`Type: ${planetType}`, 10, yPos);
        yPos += lineHeight;
        this.hudCtx.fillText(`Radius: ${this.planet.radius.toFixed(1)}`, 10, yPos);
        yPos += lineHeight;
        this.hudCtx.fillText(`Mass: ${this.planet.mass.toFixed(2)}`, 10, yPos);
        yPos += lineHeight;
        this.hudCtx.fillText(`Gravity: ${this.gravity.toFixed(2)}`, 10, yPos);
        yPos += lineHeight + sectionSpacing;
        
        // Water System Section (if applicable)
        if (this.hasWater) {
            this.hudCtx.fillStyle = '#44ffdd';
            this.hudCtx.font = 'bold 16px Arial';
            this.hudCtx.fillText('WATER SYSTEM', 10, yPos);
            yPos += lineHeight + 5;
            
            this.hudCtx.font = '14px Arial';
            this.hudCtx.fillStyle = '#ffffff';
            
            this.hudCtx.fillText(`Type: ${this.waterType === 'frozen' ? 'Frozen' : 'Liquid'}`, 10, yPos);
            yPos += lineHeight;
            this.hudCtx.fillText(`Level: ${this.waterLevel.toFixed(1)}`, 10, yPos);
            yPos += lineHeight;
            this.hudCtx.fillText(`Opacity: ${(this.waterOpacity * 100).toFixed(0)}%`, 10, yPos);
            yPos += lineHeight + sectionSpacing;
        }
        
        // Animation Debug Section
        this.hudCtx.fillStyle = '#ffaa44';
        this.hudCtx.font = 'bold 16px Arial';
        this.hudCtx.fillText('ANIMATION', 10, yPos);
        yPos += lineHeight + 5;
        
        this.hudCtx.font = '14px Arial';
        this.hudCtx.fillStyle = '#ffffff';
        
        this.hudCtx.fillText(`State: ${this.playerAnimationState}`, 10, yPos);
        yPos += lineHeight;
        this.hudCtx.fillText(`Frame: ${this.animationFrame}`, 10, yPos);
        yPos += lineHeight;
        this.hudCtx.fillText(`Walking: ${this.isWalking ? 'Yes' : 'No'}`, 10, yPos);
        yPos += lineHeight + sectionSpacing * 2;
        
        // Controls Section
        this.hudCtx.fillStyle = '#ff88dd';
        this.hudCtx.font = 'bold 16px Arial';
        this.hudCtx.fillText('CONTROLS', 10, yPos);
        yPos += lineHeight + 5;
        
        this.hudCtx.font = '12px Arial';
        this.hudCtx.fillStyle = '#cccccc';
        
        this.hudCtx.fillText('A/D: Move left/right', 10, yPos);
        yPos += lineHeight - 2;
        this.hudCtx.fillText('SPACE: Jump', 10, yPos);
        yPos += lineHeight - 2;
        this.hudCtx.fillText('W/S: Air control', 10, yPos);
        yPos += lineHeight - 2;
        this.hudCtx.fillText('ESC: Return to ship', 10, yPos);
    }
}

// Function to start planet exploration from main game
function startPlanetExploration(ship, planet) {
    if (currentPlanetExploration) {
        console.log("Planet exploration already active");
        return false;
    }
    
    currentPlanetExploration = new PlanetExploration(planet, ship);
    return currentPlanetExploration.startExploration();
}

// Function to check if planet exploration is active
function isPlanetExplorationActive() {
    return planetExplorationActive;
}

// Function to check if main game is paused
function isMainGamePaused() {
    return mainGamePaused;
}
