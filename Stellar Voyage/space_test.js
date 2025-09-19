// space_test.js
// This file contains the sandbox mode for Stellar Voyage - Camera Panning System.
// TODO LIST: add functionality to create/edit planets, add wormhole, add sound effects / sounds / music, add telescope view with radio capabilities.
let canvas, ctx, hudCanvas, hudCtx, camera, shipNorth, greenPlanet, planets, comets;
let random = Math.floor(Math.random() * 100) + 10; // Random width for the planet
const keys = {};
const G = 20; // Gravitational constant (tweak for feel)
const maxComets = 10; // Maximum number of comets allowed at once
let worldSize = 25000; // how far away comets can spawn
let gallery = {}; // Initialize as empty object
let giants, terrestrials, moons; // Planet type arrays

// Camera system for sandbox mode
let cameraSpeed = 5; // Base camera movement speed
let cameraSpeedMultiplier = 1; // Speed multiplier (can be increased with shift, etc.)

// Barnes-Hut algorithm constants
const THETA = 0.5; // Approximation parameter for Barnes-Hut (0.5 is a good balance)

// QuadTree implementation for Barnes-Hut algorithm
class QuadTree {
    constructor(bounds, capacity = 1) {
        this.bounds = bounds; // {x, y, width, height}
        this.capacity = capacity;
        this.bodies = [];
        this.divided = false;
        this.children = [];
        
        // Center of mass calculation
        this.centerOfMass = { x: 0, y: 0 };
        this.totalMass = 0;
    }
    
    insert(body) {
        // Check if body is within bounds
        if (!this.contains(body)) {
            return false;
        }
        
        // Add to this node if capacity allows
        if (this.bodies.length < this.capacity && !this.divided) {
            this.bodies.push(body);
            this.updateCenterOfMass(body);
            return true;
        }
        
        // Subdivide if not already divided
        if (!this.divided) {
            this.subdivide();
        }
        
        // Try to insert into children
        for (let child of this.children) {
            if (child.insert(body)) {
                this.updateCenterOfMass(body);
                return true;
            }
        }
        
        return false;
    }
    
    contains(body) {
        return (body.x >= this.bounds.x && 
                body.x < this.bounds.x + this.bounds.width &&
                body.y >= this.bounds.y && 
                body.y < this.bounds.y + this.bounds.height);
    }
    
    subdivide() {
        const x = this.bounds.x;
        const y = this.bounds.y;
        const w = this.bounds.width / 2;
        const h = this.bounds.height / 2;
        
        this.children = [
            new QuadTree({ x: x, y: y, width: w, height: h }, this.capacity),           // NW
            new QuadTree({ x: x + w, y: y, width: w, height: h }, this.capacity),       // NE
            new QuadTree({ x: x, y: y + h, width: w, height: h }, this.capacity),       // SW
            new QuadTree({ x: x + w, y: y + h, width: w, height: h }, this.capacity)    // SE
        ];
        
        this.divided = true;
        
        // Redistribute existing bodies to children
        for (let body of this.bodies) {
            for (let child of this.children) {
                if (child.insert(body)) {
                    break;
                }
            }
        }
        this.bodies = []; // Clear bodies from this node
    }
    
    updateCenterOfMass(body) {
        const newTotalMass = this.totalMass + body.mass;
        
        if (this.totalMass === 0) {
            this.centerOfMass.x = body.x;
            this.centerOfMass.y = body.y;
        } else {
            this.centerOfMass.x = (this.centerOfMass.x * this.totalMass + body.x * body.mass) / newTotalMass;
            this.centerOfMass.y = (this.centerOfMass.y * this.totalMass + body.y * body.mass) / newTotalMass;
        }
        
        this.totalMass = newTotalMass;
    }
    
    calculateForce(body, forceAccumulator) {
        // If this is a leaf node with bodies
        if (!this.divided && this.bodies.length > 0) {
            for (let otherBody of this.bodies) {
                if (otherBody !== body) {
                    this.applyForce(body, otherBody, forceAccumulator);
                }
            }
            return;
        }
        
        // If this is an internal node, check if we can use approximation
        if (this.totalMass > 0) {
            const dx = this.centerOfMass.x - body.x;
            const dy = this.centerOfMass.y - body.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const nodeSize = Math.max(this.bounds.width, this.bounds.height);
            
            // If far enough away, use center of mass approximation
            if (nodeSize / distance < THETA) {
                const pseudoBody = {
                    x: this.centerOfMass.x,
                    y: this.centerOfMass.y,
                    mass: this.totalMass,
                    radius: 0 // For distance calculations
                };
                this.applyForce(body, pseudoBody, forceAccumulator);
                return;
            }
        }
        
        // Otherwise, recurse into children
        if (this.divided) {
            for (let child of this.children) {
                child.calculateForce(body, forceAccumulator);
            }
        }
    }
    
    applyForce(bodyA, bodyB, forceAccumulator) {
        const dx = bodyB.x - bodyA.x;
        const dy = bodyB.y - bodyA.y;
        const distSq = dx * dx + dy * dy + 1e-6; // Small epsilon to prevent division by zero
        const dist = Math.sqrt(distSq);
        
        // Check minimum distance to prevent extreme forces
        const minDist = (bodyA.radius || 0) + (bodyB.radius || 0) + 5;
        if (dist < minDist) {
            return;
        }
        
        const force = G * bodyB.mass / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        
        forceAccumulator.fx += fx;
        forceAccumulator.fy += fy;
    }
}

// Barnes-Hut gravity calculation function
function calculateBarnesHutForces(bodies) {
    if (bodies.length === 0) return [];
    
    // Calculate bounds for the quad tree
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let body of bodies) {
        minX = Math.min(minX, body.x);
        minY = Math.min(minY, body.y);
        maxX = Math.max(maxX, body.x);
        maxY = Math.max(maxY, body.y);
    }
    
    // Add padding to bounds
    const padding = 1000;
    const bounds = {
        x: minX - padding,
        y: minY - padding,
        width: maxX - minX + 2 * padding,
        height: maxY - minY + 2 * padding
    };
    
    // Build quad tree
    const quadTree = new QuadTree(bounds);
    for (let body of bodies) {
        quadTree.insert(body);
    }
    
    // Calculate forces for each body
    const forces = [];
    for (let body of bodies) {
        const forceAccumulator = { fx: 0, fy: 0 };
        quadTree.calculateForce(body, forceAccumulator);
        forces.push(forceAccumulator);
    }
    
    return forces;
}

// Global particle system
let globalIonParticles = [];
let globalDustParticles = [];
let globalThrusterParticles = [];
let globalWormholeParticles = [];

// Background star system
let backgroundStars = [];
const STAR_FIELD_SIZE = 50000; // Much larger than world to avoid repeating patterns
const PARALLAX_FACTOR = -0.001; // How much stars move relative to ship (0.001 = 0.1% of ship movement)

class BackgroundStar {
    constructor(x, y, brightness, color) {
        this.x = x;
        this.y = y;
        this.brightness = brightness; // 0.1 to 1.0
        this.size = Math.random() * 1.5 + 0.5; // 0.5 to 2.0 pixels
        this.color = color;
        this.twinklePhase = Math.random() * Math.PI * 2;
        this.twinkleSpeed = 0.02 + Math.random() * 0.03; // Random twinkle speed
    }
    
    show(offsetX, offsetY) {
        // Calculate screen position with parallax
        const screenX = (this.x + offsetX * PARALLAX_FACTOR) % canvas.width;
        const screenY = (this.y + offsetY * PARALLAX_FACTOR) % canvas.height;
        
        // Handle wrapping for seamless scrolling
        const positions = [
            { x: screenX, y: screenY },
            { x: screenX - canvas.width, y: screenY },
            { x: screenX + canvas.width, y: screenY },
            { x: screenX, y: screenY - canvas.height },
            { x: screenX, y: screenY + canvas.height },
            { x: screenX - canvas.width, y: screenY - canvas.height },
            { x: screenX + canvas.width, y: screenY - canvas.height },
            { x: screenX - canvas.width, y: screenY + canvas.height },
            { x: screenX + canvas.width, y: screenY + canvas.height }
        ];
        
        ctx.save();
        
        // No twinkling in space - stars shine steadily without atmospheric interference
        const alpha = this.brightness;
        
        for (let pos of positions) {
            // Only draw if star is visible on screen
            if (pos.x >= -this.size && pos.x <= canvas.width + this.size &&
                pos.y >= -this.size && pos.y <= canvas.height + this.size) {
                
                ctx.globalAlpha = alpha;
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, this.size, 0, Math.PI * 2);
                ctx.fill();
                
                // Add subtle glow for brighter stars
                if (this.brightness > 0.7) {
                    ctx.globalAlpha = alpha * 0.3;
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, this.size * 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        
        ctx.restore();
    }
}

function generateBackgroundStars() {
    backgroundStars = [];
    const numStars = 1500; // Adjust density as needed
    
    for (let i = 0; i < numStars; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const brightness = Math.pow(Math.random(), 2); // Bias toward dimmer stars
        
        // Generate realistic star colors based on temperature
        const temp = Math.random();
        let color;
        if (temp < 0.1) {
            color = `rgb(155, 176, 255)`; // Blue giants
        } else if (temp < 0.3) {
            color = `rgb(202, 215, 255)`; // Blue-white
        } else if (temp < 0.6) {
            color = `rgb(248, 247, 255)`; // White
        } else if (temp < 0.8) {
            color = `rgb(255, 244, 234)`; // Yellow-white
        } else if (temp < 0.95) {
            color = `rgb(255, 210, 161)`; // Orange
        } else {
            color = `rgb(255, 204, 111)`; // Red giants
        }
        
        backgroundStars.push(new BackgroundStar(x, y, brightness, color));
    }
}

function drawBackgroundStars() {
    // Calculate offset based on camera position for parallax effect
    const offsetX = camera.worldX;
    const offsetY = camera.worldY;
    
    for (let star of backgroundStars) {
        star.show(offsetX, offsetY);
    }
}

// Function for planet exploration rotating stars
function drawRotatingBackgroundStars(playerAngle, canvasWidth, canvasHeight, ctx) {
    // Generate stars if they don't exist for planet mode
    if (!backgroundStars.planetStars) {
        backgroundStars.planetStars = [];
        const numStars = 800;
        
        for (let i = 0; i < numStars; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 200 + Math.random() * 400; // Distance from center
            const brightness = Math.pow(Math.random(), 2);
            
            // Generate realistic star colors
            const temp = Math.random();
            let color;
            if (temp < 0.1) {
                color = `rgb(155, 176, 255)`;
            } else if (temp < 0.3) {
                color = `rgb(202, 215, 255)`;
            } else if (temp < 0.6) {
                color = `rgb(248, 247, 255)`;
            } else if (temp < 0.8) {
                color = `rgb(255, 244, 234)`;
            } else if (temp < 0.95) {
                color = `rgb(255, 210, 161)`;
            } else {
                color = `rgb(255, 204, 111)`;
            }
            
            backgroundStars.planetStars.push({
                angle: angle,
                distance: distance,
                brightness: brightness,
                size: Math.random() * 1.5 + 0.5,
                color: color,
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.02 + Math.random() * 0.03
            });
        }
    }
    
    ctx.save();
    
    // Draw rotating stars
    for (let star of backgroundStars.planetStars) {
        // Calculate rotated position
        const rotatedAngle = star.angle - playerAngle;
        const screenX = canvasWidth / 2 + Math.cos(rotatedAngle) * star.distance;
        const screenY = canvasHeight / 2 + Math.sin(rotatedAngle) * star.distance;
        
        // Only draw if star is visible on screen
        if (screenX >= -star.size && screenX <= canvasWidth + star.size &&
            screenY >= -star.size && screenY <= canvasHeight + star.size) {
            
            // Calculate twinkling
            star.twinklePhase += star.twinkleSpeed;
            const twinkle = 0.7 + 0.3 * Math.sin(star.twinklePhase);
            const alpha = star.brightness * twinkle;
            
            ctx.globalAlpha = alpha;
            ctx.fillStyle = star.color;
            ctx.beginPath();
            ctx.arc(screenX, screenY, star.size, 0, Math.PI * 2);
            ctx.fill();
            
            // Add glow for bright stars
            if (star.brightness > 0.7) {
                ctx.globalAlpha = alpha * 0.3;
                ctx.beginPath();
                ctx.arc(screenX, screenY, star.size * 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    ctx.restore();
}

let ambience; // Will be initialized in window.onload

// Save/Load system
let savedState = null;

// Currently selected planet
let selectedPlanet = null;

// Planet tracking system
let isTrackingPlanet = false;
let trackedPlanet = null;

// Comet tracking system
let isTrackingComet = false;
let trackedComet = null;
let selectedComet = null;

// Timewarp system
const timeWarpLevels = [1, 2, 5, 10, 25];
let currentTimeWarpIndex = 0;
let isPaused = false;
let physicsUpdateCounter = 0;

// Timewarp management functions
function getTimeWarpSettings(factor) {
    if (factor <= 1) {
        return { steps: 1, subTimeStep: 1.0, renderSkip: 1 };
    } else if (factor <= 5) {
        return { steps: factor, subTimeStep: 1.0, renderSkip: 1 };
    } else if (factor <= 25) {
        return { steps: 5, subTimeStep: factor / 5, renderSkip: Math.min(2, Math.floor(factor / 10)) };
    } else if (factor <= 100) {
        // More conservative for high speeds - cap subTimeStep at 4.0 for stability
        return { steps: Math.ceil(factor / 4), subTimeStep: Math.min(4.0, factor / Math.ceil(factor / 4)), renderSkip: Math.min(4, Math.floor(factor / 25)) };
    } else {
        // Very conservative for extreme speeds - cap subTimeStep at 5.0
        return { steps: Math.ceil(factor / 5), subTimeStep: Math.min(5.0, factor / Math.ceil(factor / 5)), renderSkip: Math.min(8, Math.floor(factor / 25)) };
    }
}

function increaseTimeWarp() {
    if (currentTimeWarpIndex < timeWarpLevels.length - 1) {
        currentTimeWarpIndex++;
        console.log(`Time warp increased to ${timeWarpLevels[currentTimeWarpIndex]}x`);
    }
}

function decreaseTimeWarp() {
    if (currentTimeWarpIndex > 0) {
        currentTimeWarpIndex--;
        console.log(`Time warp decreased to ${timeWarpLevels[currentTimeWarpIndex]}x`);
    }
}

function resetTimeWarp() {
    currentTimeWarpIndex = 0;
    isPaused = false;
    console.log("Time warp reset to 1x");
}

function togglePause() {
    isPaused = !isPaused;
    console.log(isPaused ? "Simulation paused" : "Simulation resumed");
}

function getCurrentTimeWarp() {
    return isPaused ? 0 : timeWarpLevels[currentTimeWarpIndex];
}

// Save/Load system functions
function saveGameState() {
    if (!gameStarted) {
        console.warn("Game not started yet, cannot save state!");
        return;
    }
    
    savedState = {
        // Save camera state
        camera: {
            worldX: camera.worldX,
            worldY: camera.worldY,
            velocityX: camera.velocityX,
            velocityY: camera.velocityY
        },
        
        // Save all planets and moons
        planets: planets.map(planet => ({
            x: planet.x,
            y: planet.y,
            velocityX: planet.velocityX,
            velocityY: planet.velocityY,
            radius: planet.radius,
            mass: planet.mass,
            imageIndex: getImageIndex(planet), // Store which image this planet uses
            trail: planet.trail, // Save trail data
            trailCounter: planet.trailCounter
        })),
        
        // Save all comets
        comets: comets.map(comet => ({
            x: comet.x,
            y: comet.y,
            velocityX: comet.velocityX,
            velocityY: comet.velocityY,
            radius: comet.radius,
            angle: comet.angle
        })),
        
        // Save star state (in case it ever changes)
        star: {
            x: star.x,
            y: star.y,
            radius: star.radius,
            mass: star.mass
        },
        
        // Save particle states
        globalIonParticles: globalIonParticles.map(particle => ({
            x: particle.x,
            y: particle.y,
            direction: particle.direction,
            angle: particle.angle,
            speed: particle.speed,
            life: particle.life,
            maxLife: particle.maxLife,
            currentLife: particle.currentLife,
            size: particle.size,
            intensity: particle.intensity
        })),
        
        globalDustParticles: globalDustParticles.map(particle => ({
            x: particle.x,
            y: particle.y,
            direction: particle.direction,
            angle: particle.angle,
            speed: particle.speed,
            life: particle.life,
            maxLife: particle.maxLife,
            currentLife: particle.currentLife,
            size: particle.size,
            intensity: particle.intensity,
            driftX: particle.driftX,
            driftY: particle.driftY
        })),
        
        globalThrusterParticles: globalThrusterParticles.map(particle => ({
            x: particle.x,
            y: particle.y,
            direction: particle.direction,
            angle: particle.angle,
            speed: particle.speed,
            life: particle.life,
            maxLife: particle.maxLife,
            currentLife: particle.currentLife,
            size: particle.size,
            intensity: particle.intensity,
            inheritedVelX: particle.inheritedVelX,
            inheritedVelY: particle.inheritedVelY,
            exhaustStage: particle.exhaustStage,
            stageTimer: particle.stageTimer,
            stageInterval: particle.stageInterval
        })),
        
        // Save planet tracking state
            planetTracking: {
                isTracking: isTrackingPlanet,
                trackedPlanetIndex: isTrackingPlanet && trackedPlanet ? planets.indexOf(trackedPlanet) : -1,
                selectedPlanetIndex: selectedPlanet ? planets.indexOf(selectedPlanet) : -1
            },
            cometTracking: {
                isTracking: isTrackingComet,
                trackedCometIndex: isTrackingComet && trackedComet ? comets.indexOf(trackedComet) : -1,
                selectedCometIndex: selectedComet ? comets.indexOf(selectedComet) : -1
            },        // Save timestamp
        timestamp: Date.now()
    };
    
    console.log("Game state saved successfully!");
    console.log(`Saved: ${savedState.planets.length} planets, ${savedState.comets.length} comets, ${savedState.globalIonParticles.length} ion particles, ${savedState.globalDustParticles.length} dust particles, ${savedState.globalThrusterParticles.length} thruster particles`);
    
    // Also save to localStorage for persistence
    try {
        localStorage.setItem('stellarVoyageSave', JSON.stringify(savedState));
        console.log("State also saved to localStorage");
    } catch (error) {
        console.warn("Failed to save to localStorage:", error);
    }
}

function loadGameState() {
    if (!savedState) {
        // Try to load from localStorage if no memory save exists
        try {
            const localSave = localStorage.getItem('stellarVoyageSave');
            if (localSave) {
                savedState = JSON.parse(localSave);
                console.log("Loaded state from localStorage");
            } else {
                console.warn("No saved state found!");
                return;
            }
        } catch (error) {
            console.warn("Failed to load from localStorage:", error);
            return;
        }
    }
    
    if (!gameStarted) {
        console.warn("Game not started yet, cannot load state!");
        return;
    }
    
    // Restore camera state
    camera.worldX = savedState.camera.worldX;
    camera.worldY = savedState.camera.worldY;
    camera.velocityX = savedState.camera.velocityX;
    camera.velocityY = savedState.camera.velocityY;
    
    // Restore star state
    star.x = savedState.star.x;
    star.y = savedState.star.y;
    star.radius = savedState.star.radius;
    star.mass = savedState.star.mass;
    
    // Restore planets
    planets = savedState.planets.map(planetData => {
        const planet = new Planet(planetData.x, planetData.y, planetData.radius);
        planet.velocityX = planetData.velocityX;
        planet.velocityY = planetData.velocityY;
        planet.mass = planetData.mass;
        // Restore trail data if it exists
        if (planetData.trail) {
            planet.trail = planetData.trail;
        }
        if (planetData.trailCounter !== undefined) {
            planet.trailCounter = planetData.trailCounter;
        }
        // Restore the correct image
        setImageFromIndex(planet, planetData.imageIndex);
        return planet;
    });
    
    // Restore comets
    comets = savedState.comets.map(cometData => {
        const comet = new Comet(cometData.x, cometData.y, cometData.radius);
        comet.velocityX = cometData.velocityX;
        comet.velocityY = cometData.velocityY;
        comet.angle = cometData.angle;
        return comet;
    });
    
    // Restore ion particles
    globalIonParticles = savedState.globalIonParticles.map(particleData => {
        const particle = new IonParticle(
            particleData.x, 
            particleData.y, 
            particleData.direction, 
            1000, // distanceToStar - will be recalculated
            particleData.angle
        );
        particle.speed = particleData.speed;
        particle.life = particleData.life;
        particle.maxLife = particleData.maxLife;
        particle.currentLife = particleData.currentLife;
        particle.size = particleData.size;
        particle.intensity = particleData.intensity;
        return particle;
    });
    
    // Restore dust particles
    globalDustParticles = savedState.globalDustParticles.map(particleData => {
        const particle = new DustParticle(
            particleData.x, 
            particleData.y, 
            particleData.direction, 
            1000, // distanceToStar - will be recalculated
            particleData.angle
        );
        particle.speed = particleData.speed;
        particle.life = particleData.life;
        particle.maxLife = particleData.maxLife;
        particle.currentLife = particleData.currentLife;
        particle.size = particleData.size;
        particle.intensity = particleData.intensity;
        particle.driftX = particleData.driftX;
        particle.driftY = particleData.driftY;
        return particle;
    });
    
    // Restore thruster particles
    globalThrusterParticles = savedState.globalThrusterParticles ? savedState.globalThrusterParticles.map(particleData => {
        const particle = new ThrusterParticle(
            particleData.x, 
            particleData.y, 
            particleData.direction, 
            particleData.angle,
            particleData.inheritedVelX || 0, // Handle old saves that might not have these properties
            particleData.inheritedVelY || 0
        );
        particle.speed = particleData.speed;
        particle.life = particleData.life;
        particle.maxLife = particleData.maxLife;
        particle.currentLife = particleData.currentLife;
        particle.size = particleData.size;
        particle.intensity = particleData.intensity;
        particle.inheritedVelX = particleData.inheritedVelX || 0;
        particle.inheritedVelY = particleData.inheritedVelY || 0;
        particle.exhaustStage = particleData.exhaustStage;
        particle.stageTimer = particleData.stageTimer;
        particle.stageInterval = particleData.stageInterval;
        return particle;
    }) : []; // Handle case where old saves don't have thruster particles
    
    // Restore planet tracking state if it exists
    if (savedState.planetTracking) {
        isTrackingPlanet = savedState.planetTracking.isTracking;
        
        // Restore tracked planet reference
        if (savedState.planetTracking.trackedPlanetIndex >= 0 && 
            savedState.planetTracking.trackedPlanetIndex < planets.length) {
            trackedPlanet = planets[savedState.planetTracking.trackedPlanetIndex];
        } else {
            trackedPlanet = null;
            isTrackingPlanet = false; // Can't track if planet doesn't exist
        }
        
        // Restore selected planet reference
        if (savedState.planetTracking.selectedPlanetIndex >= 0 && 
            savedState.planetTracking.selectedPlanetIndex < planets.length) {
            selectedPlanet = planets[savedState.planetTracking.selectedPlanetIndex];
        } else {
            selectedPlanet = null;
        }
        
        console.log(`Tracking state restored: isTracking=${isTrackingPlanet}, trackedPlanet=${trackedPlanet ? 'valid' : 'null'}, selectedPlanet=${selectedPlanet ? 'valid' : 'null'}`);
    }
    
    // Restore comet tracking state if it exists
    if (savedState.cometTracking) {
        isTrackingComet = savedState.cometTracking.isTracking;
        
        // Restore tracked comet reference
        if (savedState.cometTracking.trackedCometIndex >= 0 && 
            savedState.cometTracking.trackedCometIndex < comets.length) {
            trackedComet = comets[savedState.cometTracking.trackedCometIndex];
        } else {
            trackedComet = null;
            isTrackingComet = false; // Can't track if comet doesn't exist
        }
        
        // Restore selected comet reference
        if (savedState.cometTracking.selectedCometIndex >= 0 && 
            savedState.cometTracking.selectedCometIndex < comets.length) {
            selectedComet = comets[savedState.cometTracking.selectedCometIndex];
        } else {
            selectedComet = null;
        }
        
        console.log(`Comet tracking state restored: isTracking=${isTrackingComet}, trackedComet=${trackedComet ? 'valid' : 'null'}, selectedComet=${selectedComet ? 'valid' : 'null'}`);
    }
    
    console.log("Game state loaded successfully!");
    console.log(`Loaded: ${planets.length} planets, ${comets.length} comets, ${globalIonParticles.length} ion particles, ${globalDustParticles.length} dust particles, ${globalThrusterParticles.length} thruster particles`);
    
    const saveTime = new Date(savedState.timestamp);
    console.log(`Save was created on: ${saveTime.toLocaleString()}`);
}

// Helper functions to store and restore planet images
function getImageIndex(planet) {
    // Find which array and index the planet's image belongs to
    for (let i = 0; i < giants.length; i++) {
        if (planet.Image === giants[i]) return { type: 'giants', index: i };
    }
    for (let i = 0; i < terrestrials.length; i++) {
        if (planet.Image === terrestrials[i]) return { type: 'terrestrials', index: i };
    }
    for (let i = 0; i < moons.length; i++) {
        if (planet.Image === moons[i]) return { type: 'moons', index: i };
    }
    return { type: 'terrestrials', index: 0 }; // fallback
}

function setImageFromIndex(planet, imageIndex) {
    if (imageIndex.type === 'giants') {
        planet.Image = giants[imageIndex.index];
    } else if (imageIndex.type === 'terrestrials') {
        planet.Image = terrestrials[imageIndex.index];
    } else if (imageIndex.type === 'moons') {
        planet.Image = moons[imageIndex.index];
    }
}

function checkForSavedData() {
    try {
        const localSave = localStorage.getItem('stellarVoyageSave');
        if (localSave) {
            savedState = JSON.parse(localSave);
            const saveTime = new Date(savedState.timestamp);
            console.log(`Found save data from: ${saveTime.toLocaleString()}`);
            console.log("Press F9 to load saved state");
        }
    } catch (error) {
        console.warn("Error checking for saved data:", error);
    }
}

// Save/Load system functions
function showLoadingScreen() {
    const titleScreen = document.getElementById("titleScreen");
    const clickStart = document.getElementById("clickStart");
    
    // Hide the click to start button initially
    clickStart.style.display = "none";
    
    // Add loading text
    const loadingText = document.createElement("div");
    loadingText.id = "loadingText";
    loadingText.innerHTML = "<h2>Loading Assets...</h2><div id='loadingProgress'>0%</div>";
    loadingText.style.marginTop = "20px";
    titleScreen.appendChild(loadingText);
    
    // Start logo cycling animation
    startLogoCycle();
}

function hideLoadingScreen() {
    console.log("hideLoadingScreen called");
    const loadingText = document.getElementById("loadingText");
    const clickStart = document.getElementById("clickStart");
    
    if (loadingText) {
        loadingText.remove();
    }
    
    // Show the click to start button
    clickStart.style.display = "block";
    console.log("Click to start button should now be visible");
    
    // Stop logo cycling
    stopLogoCycle();
}

// Logo cycling variables
let cycleId = null;
let currentLogoIndex = 0;

function startLogoCycle() {
    const logos = [
        document.getElementById("logo0"),
        document.getElementById("logo1"), 
        document.getElementById("logo2"),
        document.getElementById("logo3")
    ];
    
    // Hide all logos initially
    logos.forEach(logo => logo.style.display = "none");
    
    // Show first logo
    logos[0].style.display = "block";
    currentLogoIndex = 0;
    
    cycleId = setInterval(() => {
        // Hide current logo
        logos[currentLogoIndex].style.display = "none";
        
        // Move to next logo
        currentLogoIndex = (currentLogoIndex + 1) % logos.length;
        
        // Show next logo
        logos[currentLogoIndex].style.display = "block";
    }, 500); // Change every half second
}

function stopLogoCycle() {
    if (cycleId) {
        clearInterval(cycleId);
        cycleId = null;
    }
    
    // Hide all logos
    const logos = [
        document.getElementById("logo0"),
        document.getElementById("logo1"), 
        document.getElementById("logo2"),
        document.getElementById("logo3")
    ];
    logos.forEach(logo => logo.style.display = "none");
    logos[3].style.display = "block";
}

// Loading state
let assetsLoaded = false;
let gameStarted = false;

// Start the loading process when the page loads
window.onload = () => {
    // Initialize gallery and ambience objects after DOM is loaded
    gallery = {
        shipNorth: document.getElementById("shipNorth"),
        shipSouth: document.getElementById("shipSouth"),
        shipEast: document.getElementById("shipEast"),
        shipWest: document.getElementById("shipWest"),
        dustTail : document.getElementById("dustTail"),
        ionTail: document.getElementById("ionTail"),
        exhaust0: document.getElementById("exhaust0"),
        exhaust1: document.getElementById("exhaust1"),
        exhaust2: document.getElementById("exhaust2"),
        amberPlanet: document.getElementById("amberPlanet"),
        bandsPlanet: document.getElementById("bandsPlanet"),
        bloodPlanet: document.getElementById("bloodPlanet"),
        bluePlanet: document.getElementById("bluePlanet"),
        boilingPlanet: document.getElementById("boilingPlanet"),
        brownPlanet: document.getElementById("brownPlanet"),
        cataractPlanet: document.getElementById("cataractPlanet"),
        cometImg: document.getElementById("comet"),
        cratersPlanet: document.getElementById("cratersPlanet"),
        crevassePlanet: document.getElementById("crevassePlanet"),
        deadPlanet: document.getElementById("deadPlanet"),
        dyingPlanet: document.getElementById("dyingPlanet"),
        grayPlanet: document.getElementById("grayPlanet"),
        greenPlanet: document.getElementById("greenPlanet"),
        harshPlanet: document.getElementById("harshPlanet"),
        icePlanet: document.getElementById("icePlanet"),
        islandsPlanet: document.getElementById("islandsPlanet"),
        jaundicePlanet: document.getElementById("jaundicePlanet"),
        lightningPlanet: document.getElementById("lightningPlanet"),
        methanePlanet: document.getElementById("methanePlanet"),
        oceanPlanet: document.getElementById("oceanPlanet"),
        orangePlanet: document.getElementById("orangePlanet"),
        oxidePlanet: document.getElementById("oxidePlanet"),
        pastelPlanet: document.getElementById("pastelPlanet"),
        redPlanet: document.getElementById("redPlanet"),
        rustPlanet: document.getElementById("rustPlanet"),
        toxicPlanet: document.getElementById("toxicPlanet"),
        veilPlanet: document.getElementById("veilPlanet"),
        weirdPlanet: document.getElementById("weirdPlanet"),
        yellowStar: document.getElementById("yellowStar")
    };
    
    ambience = document.getElementById("frozenPlanetAmbience");
    
    showLoadingScreen();
    loadAssets().then(() => {
        assetsLoaded = true;
        console.log("Assets loaded successfully!");
        hideLoadingScreen();
        setupGame();
    }).catch(err => {
        console.error("Failed to load assets:", err);
        document.getElementById("titleScreen").innerHTML = "<h1>Failed to load game assets. Please refresh the page.</h1>";
    });
};


// Setup creates the canvas and initializes the game objects.
function setupGame() {
    canvas = document.getElementById("gameview");
    ctx = canvas.getContext("2d");
    hudCanvas = document.getElementById("hud");
    hudCtx = hudCanvas.getContext("2d");

    // Initialize planet type arrays
    giants = [
        gallery.amberPlanet,
        gallery.bandsPlanet,
        gallery.bloodPlanet,
        gallery.brownPlanet,
        gallery.cataractPlanet,
        gallery.greenPlanet,
        gallery.jaundicePlanet,
        gallery.lightningPlanet,
        gallery.pastelPlanet
    ];
    terrestrials = [
        gallery.bluePlanet,
        gallery.boilingPlanet,
        gallery.deadPlanet,
        gallery.dyingPlanet,
        gallery.harshPlanet,
        gallery.icePlanet,
        gallery.islandsPlanet,
        gallery.oceanPlanet,
        gallery.orangePlanet,
        gallery.redPlanet,
        gallery.veilPlanet
    ];
    moons = [
        gallery.cratersPlanet,
        gallery.crevassePlanet,
        gallery.grayPlanet,
        gallery.icePlanet,
        gallery.methanePlanet,
        gallery.orangePlanet,
        gallery.oxidePlanet,
        gallery.redPlanet,
        gallery.rustPlanet,
        gallery.toxicPlanet,
        gallery.weirdPlanet
    ];
    comets = [];
    planets = [];
    camera = new Camera();
    star = new Star(0, 0, 600); // Center star

    // Generate background stars
    generateBackgroundStars();

    let minRadius = 50;
    let maxRadius = 200;
    let minMoonRadius = 30;
    let maxMoonRadius = 50;

    // Generate planets in orbital order from star outward
    const numPlanets = 5;
    const minOrbitDistance = star.radius + 3000; // Starting distance from star
    const baseOrbitSpacing = 2500; // Base spacing between orbits
    const spacingMultiplier = 15; // How much planet size affects spacing
    
    let currentOrbitDistance = minOrbitDistance;
    
    // Pre-determine moon data for more accurate spacing calculations
    const planetMoonData = [];
    for (let i = 0; i < numPlanets; i++) {
        // Generate planet size first (inner planets smaller, outer planets can be larger)
        let bias = Math.random();
        const sizeMultiplier = 0.7 + (i * 0.15); // Inner planets smaller, outer planets larger
        let radius = Math.floor((minRadius + (maxRadius - minRadius) * Math.pow(bias, 2)) * sizeMultiplier);
        radius = Math.max(minRadius, Math.min(maxRadius, radius)); // Clamp to valid range
        
        // Pre-determine if this planet will have a moon and its properties
        const willHaveMoon = Math.random() < 0.5; // 50% chance
        let moonRadius = 0;
        if (willHaveMoon) {
            let moonBias = Math.random();
            moonRadius = Math.floor(minMoonRadius + (maxMoonRadius - minMoonRadius) * Math.pow(moonBias, 2));
        }
        
        planetMoonData.push({
            radius: radius,
            moonRadius: moonRadius,
            willHaveMoon: willHaveMoon
        });
    }
    
    for (let i = 0; i < numPlanets; i++) {
        const planetData = planetMoonData[i];
        const radius = planetData.radius;
        
        // Calculate spacing based on this planet's TOTAL system mass (planet + moon if any)
        const planetMass = radius * 0.5; // Same mass calculation as in Planet class
        const moonMass = planetData.willHaveMoon ? planetData.moonRadius * 0.5 : 0;
        const totalSystemMass = planetMass + moonMass; // Combined mass of planet-moon system
        
        // Calculate influence from all previously placed planets (including their moons)
        let totalInfluence = totalSystemMass; // Start with current system's influence
        let maxPreviousMass = 0;
        
        for (let j = 0; j < planets.length; j++) {
            const prevPlanet = planets[j];
            const distanceToPrev = currentOrbitDistance - Math.hypot(prevPlanet.x - star.x, prevPlanet.y - star.y);
            
            // Calculate the previous planet's total system mass (including its moon if any)
            let prevSystemMass = prevPlanet.mass;
            // Check if this previous planet has a moon (they're added to planets array after creation)
            if (j < planetMoonData.length && planetMoonData[j].willHaveMoon) {
                const prevMoonMass = planetMoonData[j].moonRadius * 0.5;
                prevSystemMass += prevMoonMass;
            }
            
            // Add influence based on total system mass and proximity (closer planets have more influence)
            const proximityFactor = Math.max(0.1, 1 / Math.max(1, Math.abs(distanceToPrev) / 1000));
            totalInfluence += prevSystemMass * proximityFactor;
            maxPreviousMass = Math.max(maxPreviousMass, prevSystemMass);
        }
        
        // Calculate spacing based on total gravitational influence (using combined mass)
        const influenceBasedSpacing = baseOrbitSpacing + (totalInfluence * spacingMultiplier * 0.5);
        
        // Add minimum separation based on Hill sphere approximation (using total system mass)
        const hillSphereRadius = Math.pow(totalSystemMass / (3 * star.mass), 1/3) * currentOrbitDistance;
        const minimumSeparation = Math.max(hillSphereRadius * 3, radius * 3); // 3 Hill radii or 3 planet radii

        // Use the larger of influence-based spacing or minimum separation
        const finalSpacing = Math.max(influenceBasedSpacing, minimumSeparation);
        
        // Add some variation for natural look, but keep it smaller for stability
        const distanceVariation = finalSpacing * 0.15; // 15% variation
        const orbitalDistance = currentOrbitDistance + (Math.random() - 0.5) * distanceVariation;
        
        // Generate random angle around the star
        const angle = Math.random() * Math.PI * 2;
        
        // Calculate planet position
        const x = star.x + Math.cos(angle) * orbitalDistance;
        const y = star.y + Math.sin(angle) * orbitalDistance;
        
        // Create planet at calculated position
        const dx = x - star.x;
        const dy = y - star.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Calculate orbital velocity
        const orbitalSpeed = Math.sqrt(G * star.mass / dist);
        const perpX = -dy / dist;
        const perpY = dx / dist;
        
        let newPlanet = new Planet(x, y, radius);
        newPlanet.velocityX = perpX * orbitalSpeed;
        newPlanet.velocityY = perpY * orbitalSpeed;
        planets.push(newPlanet);
        console.log(`Created planet ${i + 1} at orbital distance: ${dist.toFixed(0)} from star, planet mass: ${planetMass.toFixed(1)}, moon mass: ${moonMass.toFixed(1)}, total system mass: ${totalSystemMass.toFixed(1)}, influence: ${totalInfluence.toFixed(1)}, spacing: ${finalSpacing.toFixed(0)}`);
        
        // Update current orbit distance for next planet using the calculated spacing
        currentOrbitDistance = orbitalDistance + finalSpacing;
    }

    // Create moons for planets using pre-determined data (store original planet count to avoid processing newly added moons)
    let moonsCreated = 0;
    const originalPlanetCount = planets.length; // Store count before adding moons
    for (let i = 0; i < originalPlanetCount; i++) { // Only iterate through original planets
        let planet = planets[i];
        const planetData = planetMoonData[i];
        
        if (planetData.willHaveMoon) { // Use pre-determined moon data
            console.log("Creating pre-determined moon for planet at:", planet.x, planet.y);
            
            // Use pre-determined moon radius
            const moonRadius = planetData.moonRadius;
            
            // Position moon at a safe distance from the planet (outside planet radius + buffer)
            const minDistance = planet.radius + moonRadius + 150; // Minimum safe distance
            const maxDistance = planet.radius + moonRadius + 200; // Maximum distance for orbit
            const moonDistance = minDistance + Math.random() * (maxDistance - minDistance);
            
            // Random angle around the planet
            const moonAngle = Math.random() * Math.PI * 2;
            const moonX = planet.x + Math.cos(moonAngle) * moonDistance;
            const moonY = planet.y + Math.sin(moonAngle) * moonDistance;
            
            // Create the moon
            let moon = new Planet(moonX, moonY, moonRadius);
            
            // --- Calculate proper orbital mechanics for planet-moon system ---
            
            // Calculate masses
            const planetMass = planet.mass;
            const moonMass = moon.mass;
            const totalMass = planetMass + moonMass;
            
            // Calculate center of mass (barycenter) of planet-moon system
            const barycenterX = (planet.x * planetMass + moonX * moonMass) / totalMass;
            const barycenterY = (planet.y * planetMass + moonY * moonMass) / totalMass;
            
            // Distance from star to barycenter
            const barycenterDistFromStar = Math.hypot(barycenterX - star.x, barycenterY - star.y);
            
            // Calculate the orbital velocity that the barycenter should have around the star
            const barycenterOrbitalSpeed = Math.sqrt(G * star.mass / barycenterDistFromStar);
            const barycenterTangentX = -(barycenterY - star.y) / barycenterDistFromStar;
            const barycenterTangentY = (barycenterX - star.x) / barycenterDistFromStar;
            const barycenterVelX = barycenterTangentX * barycenterOrbitalSpeed;
            const barycenterVelY = barycenterTangentY * barycenterOrbitalSpeed;
            
            // Calculate reduced mass and orbital parameters for planet-moon system
            const planetDistFromBarycenter = moonMass * moonDistance / totalMass;
            const moonDistFromBarycenter = planetMass * moonDistance / totalMass;
            
            // Calculate orbital speeds around barycenter with stability correction
            const planetOrbitalSpeed = Math.sqrt(G * moonMass * moonMass / (totalMass * moonDistance));
            const moonOrbitalSpeed = Math.sqrt(G * planetMass * planetMass / (totalMass * moonDistance));
            
            // Calculate directions perpendicular to planet-moon line
            const perpX = -Math.sin(moonAngle);
            const perpY = Math.cos(moonAngle);
            
            // Set velocities: barycenter motion + orbital motion around barycenter
            planet.velocityX = barycenterVelX - perpX * planetOrbitalSpeed;
            planet.velocityY = barycenterVelY - perpY * planetOrbitalSpeed;
            
            moon.velocityX = barycenterVelX + perpX * moonOrbitalSpeed;
            moon.velocityY = barycenterVelY + perpY * moonOrbitalSpeed;
            
            // Add moon to planets array
            planets.push(moon);
            moonsCreated++;
            console.log(`Created planet-moon system:`);
            console.log(`  Planet: mass=${planetMass.toFixed(1)}, distance from barycenter=${planetDistFromBarycenter.toFixed(1)}`);
            console.log(`  Moon: mass=${moonMass.toFixed(1)}, distance from barycenter=${moonDistFromBarycenter.toFixed(1)}`);
            console.log(`  Barycenter orbital speed: ${barycenterOrbitalSpeed.toFixed(2)}`);
        }
    }
    
    console.log(`Created ${planets.length - moonsCreated} planets and ${moonsCreated} moons total: ${planets.length} celestial bodies`);

    // Check for existing save data
    checkForSavedData();

    // Setup title screen click handler
    document.getElementById("clickStart").addEventListener("click", startGame, { once: true });

    // Radar click handling
    hudCanvas.addEventListener("mousedown", function(e) {
        const rect = hudCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Check for planet clicks first
        for (let hitbox of radarPlanetHitboxes) {
            const dx = mouseX - hitbox.x;
            const dy = mouseY - hitbox.y;
            if (dx * dx + dy * dy <= hitbox.r * hitbox.r) {
                selectedPlanet = hitbox.planet;
                selectedComet = null; // Clear comet selection
                console.log("Clicked planet:", hitbox.planet);
                return; // Exit early to prevent checking comets
            }
        }

        // Check for comet clicks if no planet was clicked
        for (let hitbox of radarCometHitboxes) {
            const dx = mouseX - hitbox.x;
            const dy = mouseY - hitbox.y;
            if (dx * dx + dy * dy <= hitbox.r * hitbox.r) {
                selectedComet = hitbox.comet;
                selectedPlanet = null; // Clear planet selection
                console.log("Clicked comet:", hitbox.comet);
                break;
            }
        }
    });

    // Spawn a comet every 10 seconds if there are less than the maximum allowed
    setInterval(() => {
        if (comets.length < maxComets) {
            spawnComet();
        }
    }, 10000); // 10 seconds
}

// Function to start the game when the user clicks
function startGame() {
    if (!assetsLoaded) {
        console.warn("Assets not loaded yet!");
        return;
    }
    
    if (gameStarted) {
        return; // Already started
    }
    
    gameStarted = true;
    
    // Hide title screen
    document.getElementById("titleScreen").style.display = "none";

    // Start audio
    ambience.volume = 0.5;
    ambience.play().catch(err => {
        console.warn("Audio blocked or failed:", err);
    });
    
    // Start the game loop
    draw();
    setInterval(draw, 1000 / 60);
}

// Asset loading function
function loadAssets() {
    return new Promise((resolve, reject) => {
        const imagesToLoad = [
            gallery.shipNorth,
            gallery.shipSouth,
            gallery.shipEast,
            gallery.shipWest,
            gallery.dustTail,
            gallery.ionTail,
            gallery.greenPlanet,
            gallery.bluePlanet,
            gallery.orangePlanet,
            gallery.grayPlanet,
            gallery.yellowStar,
            gallery.cometImg
        ];
        
        let loadedCount = 0;
        const totalAssets = imagesToLoad.length + 1; // +1 for audio
        
        function updateProgress() {
            loadedCount++;
            const progress = Math.round((loadedCount / totalAssets) * 100);
            const progressElement = document.getElementById("loadingProgress");
            if (progressElement) {
                progressElement.textContent = `${progress}%`;
            }
            
            if (loadedCount === totalAssets) {
                setTimeout(resolve, 1500); // Longer delay to see the loading process
            }
        }
        
        // Load images
        imagesToLoad.forEach(img => {
            if (img.complete && img.naturalWidth !== 0) {
                updateProgress();
            } else {
                img.onload = updateProgress;
                img.onerror = () => {
                    console.error("Failed to load image:", img.src);
                    updateProgress(); // Continue loading even if one image fails
                };
            }
        });
        
        // Load audio
        if (ambience.readyState >= 3) {
            updateProgress();
        } else {
            ambience.oncanplaythrough = updateProgress;
            ambience.onerror = () => {
                console.warn("Failed to load audio");
                updateProgress(); // Continue even if audio fails
            };
        }
    });
}

// The draw function updates the camera's position based on keyboard input with the .update() method (or at least it did before i changed literally everything).
function draw() {
    // Check if main game should be paused for planet exploration
    if (typeof isMainGamePaused === 'function' && isMainGamePaused()) {
        return; // Skip main game update when on planet
    }
    
    // Get current timewarp settings
    const currentWarp = getCurrentTimeWarp();
    const warpSettings = getTimeWarpSettings(currentWarp);
    
    // Skip physics updates if paused
    if (!isPaused) {
        // Run multiple physics steps for timewarp
        for (let warpStep = 0; warpStep < warpSettings.steps; warpStep++) {
            updatePhysics(warpSettings.subTimeStep);
        }
    }
    
    // Increment physics counter for render skipping
    physicsUpdateCounter++;
    
    // Skip rendering frames during high timewarp for performance
    if (physicsUpdateCounter % warpSettings.renderSkip !== 0) {
        return;
    }
    
    // Render the frame
    renderFrame();
}

// Separated physics update function
function updatePhysics(timeStep = 1.0) {
    // Adjust particle generation for high speed simulation
    const currentWarp = getCurrentTimeWarp();
    const shouldGenerateParticles = currentWarp <= 4; // Only generate particles up to 4x speed
    
    // --- Combined gravity calculation using Velocity Verlet integration ---
    // Apply forces and update positions using Velocity Verlet integration for better stability
    
    // Adaptive timestep: reduce timestep when planets are close together for stability
    let adaptiveTimeStep = timeStep;
    let minSeparation = Infinity;
    
    // Find the minimum separation between any two planets
    for (let i = 0; i < planets.length; i++) {
        for (let j = i + 1; j < planets.length; j++) {
            const dx = planets[i].x - planets[j].x;
            const dy = planets[i].y - planets[j].y;
            const separation = Math.sqrt(dx * dx + dy * dy);
            const combinedRadius = planets[i].radius + planets[j].radius;
            const normalizedSeparation = separation / combinedRadius;
            minSeparation = Math.min(minSeparation, normalizedSeparation);
        }
    }
    
    // Reduce timestep for close binaries (when separation < 10 radii)
    if (minSeparation < 10 && minSeparation > 0) {
        const stabilityFactor = Math.max(0.1, minSeparation / 10); // Scale from 0.1 to 1.0
        adaptiveTimeStep = timeStep * stabilityFactor;
        console.log(`Adaptive timestep: ${adaptiveTimeStep.toFixed(3)} (factor: ${stabilityFactor.toFixed(3)}, min separation: ${minSeparation.toFixed(1)} radii)`);
    }
    
    const numSubSteps = 4; // Subdivide physics timestep
    const subTimeStep = adaptiveTimeStep / numSubSteps;
    
    for (let subStep = 0; subStep < numSubSteps; subStep++) {
        // Recalculate all forces at each sub-step for accuracy
        const currentBodies = planets.map(planet => ({
            x: planet.x,
            y: planet.y,
            mass: planet.mass,
            radius: planet.radius
        }));
        
        const barnesHutForces = calculateBarnesHutForces(currentBodies);
        
        // Apply both star gravity and planet-planet forces using Velocity Verlet
        for (let i = 0; i < planets.length; i++) {
            let planet = planets[i];
            
            // Calculate star gravity force
            const dx = star.x - planet.x;
            const dy = star.y - planet.y;
            const distSq = dx * dx + dy * dy + 1e-6; // Add small value to prevent division by zero
            const dist = Math.sqrt(distSq);
            const starForce = G * star.mass / distSq;
            
            // Combine star gravity with Barnes-Hut forces
            const totalForceX = (dx / dist) * starForce + barnesHutForces[i].fx;
            const totalForceY = (dy / dist) * starForce + barnesHutForces[i].fy;
            
            // Store previous acceleration (if not stored yet)
            if (planet.prevAccelX === undefined) {
                planet.prevAccelX = totalForceX;
                planet.prevAccelY = totalForceY;
            }
            
            // Velocity Verlet integration for better energy conservation
            // x(t+dt) = x(t) + v(t)*dt + 0.5*a(t)*dt^2
            planet.x += planet.velocityX * subTimeStep + 0.5 * planet.prevAccelX * subTimeStep * subTimeStep;
            planet.y += planet.velocityY * subTimeStep + 0.5 * planet.prevAccelY * subTimeStep * subTimeStep;
            
            // v(t+dt) = v(t) + 0.5*(a(t) + a(t+dt))*dt
            planet.velocityX += 0.5 * (planet.prevAccelX + totalForceX) * subTimeStep;
            planet.velocityY += 0.5 * (planet.prevAccelY + totalForceY) * subTimeStep;
            
            // Store current acceleration for next iteration
            planet.prevAccelX = totalForceX;
            planet.prevAccelY = totalForceY;
        }
    }
    
    // Update planets (for trail recording and other planet-specific updates)
    // Reduce trail recording frequency at high speeds
    const shouldRecordTrail = currentWarp <= 3 || (physicsUpdateCounter % Math.floor(currentWarp / 2) === 0);
    for (let planet of planets) {
        if (shouldRecordTrail) {
            planet.update();
        }
    }

    // --- Comet physics using same Velocity Verlet integration ---
    // Calculate forces from planets to comets using Barnes-Hut (if there are planets and comets)
    if (comets.length > 0) {
        for (let comet of comets) {
            // Apply same adaptive sub-stepping to comets for consistency
            for (let subStep = 0; subStep < numSubSteps; subStep++) {
                // Calculate star gravity force
                const dxStar = star.x - comet.x;
                const dyStar = star.y - comet.y;
                const distSqStar = dxStar * dxStar + dyStar * dyStar + 1e-6;
                const distStar = Math.sqrt(distSqStar);
                const starForce = G * star.mass / distSqStar;
                
                let totalForceX = (dxStar / distStar) * starForce;
                let totalForceY = (dyStar / distStar) * starForce;
                
                // Add planet forces if planets exist
                if (planets.length > 0) {
                    const planetBodies = planets.map(planet => ({
                        x: planet.x,
                        y: planet.y,
                        mass: planet.mass,
                        radius: planet.radius
                    }));
                    
                    // Use Barnes-Hut for planet forces on comet
                    const cometBody = {
                        x: comet.x,
                        y: comet.y,
                        mass: 1, // Small mass for comet
                        radius: comet.radius
                    };
                    
                    // Build a temporary quad tree for this comet's force calculation
                    let minX = Math.min(comet.x, ...planetBodies.map(p => p.x));
                    let minY = Math.min(comet.y, ...planetBodies.map(p => p.y));
                    let maxX = Math.max(comet.x, ...planetBodies.map(p => p.x));
                    let maxY = Math.max(comet.y, ...planetBodies.map(p => p.y));
                    
                    const padding = 1000;
                    const bounds = {
                        x: minX - padding,
                        y: minY - padding,
                        width: maxX - minX + 2 * padding,
                        height: maxY - minY + 2 * padding
                    };
                    
                    const cometQuadTree = new QuadTree(bounds);
                    for (let planetBody of planetBodies) {
                        cometQuadTree.insert(planetBody);
                    }
                    
                    const cometForce = { fx: 0, fy: 0 };
                    cometQuadTree.calculateForce(cometBody, cometForce);
                    
                    totalForceX += cometForce.fx;
                    totalForceY += cometForce.fy;
                }
                
                // Store previous acceleration (if not stored yet)
                if (comet.prevAccelX === undefined) {
                    comet.prevAccelX = totalForceX;
                    comet.prevAccelY = totalForceY;
                }
                
                // Velocity Verlet integration for comets (same as planets)
                // x(t+dt) = x(t) + v(t)*dt + 0.5*a(t)*dt^2
                comet.x += comet.velocityX * subTimeStep + 0.5 * comet.prevAccelX * subTimeStep * subTimeStep;
                comet.y += comet.velocityY * subTimeStep + 0.5 * comet.prevAccelY * subTimeStep * subTimeStep;
                
                // v(t+dt) = v(t) + 0.5*(a(t) + a(t+dt))*dt
                comet.velocityX += 0.5 * (comet.prevAccelX + totalForceX) * subTimeStep;
                comet.velocityY += 0.5 * (comet.prevAccelY + totalForceY) * subTimeStep;
                
                // Store current acceleration for next iteration
                comet.prevAccelX = totalForceX;
                comet.prevAccelY = totalForceY;
            }
            
            if (shouldRecordTrail) {
                comet.update();
            }
        }
    }

    // --- Process wormhole request ---
    if (requestWormhole) {
        if (wormholes.length != 0) {
            console.log("Wormhole already exists, cannot spawn another yet.");
        } else {
            spawnWormhole();
        }
        requestWormhole = false; // Reset the flag
    }

    // --- Update wormholes ---
    wormholes = wormholes.filter(wormhole => {
        wormhole.life -= timeStep;
        wormhole.pulsePhase += 0.1 * timeStep; // For pulsing effect
        
        // Update wormhole position based on velocity
        wormhole.x += wormhole.velocityX * timeStep;
        wormhole.y += wormhole.velocityY * timeStep;
        
        // Generate evaporation particles around the wormhole (only at reasonable speeds)
        if (shouldGenerateParticles) {
            const lifeRatio = wormhole.life / 600; // 600 is the initial life
            const currentRadius = wormhole.radius * Math.max(0.1, lifeRatio);
            
            if (Math.random() < 0.4 && currentRadius > 5) { // 40% chance per frame to generate particles
                const numParticles = Math.floor(Math.random() * 3) + 1; // 1-3 particles per generation
                
                for (let i = 0; i < numParticles; i++) {
                    // Generate particles around the wormhole perimeter
                    const angle = Math.random() * Math.PI * 2;
                    const spawnRadius = currentRadius + Math.random() * 20; // Spawn just outside the wormhole
                    const particleX = wormhole.x + Math.cos(angle) * spawnRadius;
                    const particleY = wormhole.y + Math.sin(angle) * spawnRadius;
                    
                    // Particles move outward from wormhole center
                    const speed = 0.5 + Math.random() * 1.5; // Random outward speed
                    
                    // Calculate radial velocity (outward from wormhole center)
                    const radialVelX = Math.cos(angle) * speed;
                    const radialVelY = Math.sin(angle) * speed;
                    
                    // Add full wormhole velocity so particles move with the wormhole
                    const particleVelX = radialVelX + wormhole.velocityX;
                    const particleVelY = radialVelY + wormhole.velocityY;
                    
                    const particle = new WormholeParticle(particleX, particleY, particleVelX, particleVelY);
                    globalWormholeParticles.push(particle);
                }
            }
        }
        
        return wormhole.life > 0; // Keep wormhole if still alive
    });

    // Update global particles (reduced generation at high speeds)
    if (shouldGenerateParticles) {
        updateGlobalParticles();
    }

    // --- Remove comets that collide with the star or any planet ---
    comets = comets.filter(comet => {
        const collidesWithStar = checkBodyCollision(star, comet);
        const collidesWithPlanet = planets.some(planet => checkBodyCollision(planet, comet));
        
        // If comet is about to be destroyed, create explosion particles
        if (collidesWithStar || collidesWithPlanet) {
            createExplosion(comet.x, comet.y, comet.velocityX, comet.velocityY);
            return false; // Remove the comet
        }
        return true; // Keep the comet
    });

    // --- Merge planets that collide with each other ---
    for (let i = 0; i < planets.length; i++) {
        for (let j = i + 1; j < planets.length; j++) {
            if (checkBodyCollision(planets[i], planets[j])) {
                // Merge logic: average position and sum radii
                const planetA = planets[i];
                const planetB = planets[j];
                const newX = (planetA.x + planetB.x) / 2;
                const newY = (planetA.y + planetB.y) / 2;
                const newMass = planetA.mass + planetB.mass;
                const newRadius = newMass / 0.5; // Assuming mass = radius * 0.5

                // Create a new merged planet
                const mergedPlanet = new Planet(newX, newY, newRadius);
                
                // Apply conservation of momentum: p_final = p1 + p2
                // v_final = (m1*v1 + m2*v2) / (m1 + m2)
                mergedPlanet.velocityX = (planetA.mass * planetA.velocityX + planetB.mass * planetB.velocityX) / newMass;
                mergedPlanet.velocityY = (planetA.mass * planetA.velocityY + planetB.mass * planetB.velocityY) / newMass;
                
                // Set the correct mass (it gets overridden in Planet constructor)
                mergedPlanet.mass = newMass;

                // Replace the two planets with the merged one
                planets.splice(j, 1); // Remove planetB first
                planets.splice(i, 1, mergedPlanet); // Replace planetA with mergedPlanet
                break; // Restart the loop since the array has changed
            }
        }
    }
}

// Separated rendering function
function renderFrame() {
    // Clear canvas and apply zoom/camera transformation
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawBackgroundStars();
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.translate(-camera.worldX, -camera.worldY);

    // Draw all objects
    for (let planet of planets) {
        planet.show();
    }
    
    for (let comet of comets) {
        comet.show();
    }

    // Show wormholes
    wormholes.forEach(wormhole => {
        const lifeRatio = wormhole.life / 600;
        const currentRadius = wormhole.radius * Math.max(0.1, lifeRatio);
        
        if (currentRadius > 5) {
            ctx.save();
            ctx.translate(wormhole.x, wormhole.y);
            
            const pulseScale = 1 + Math.sin(wormhole.pulsePhase) * 0.2;
            const alpha = Math.max(0.3, lifeRatio);
            
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = "#00ffbb";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, currentRadius * pulseScale, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#00ffbb";
            ctx.beginPath();
            ctx.arc(0, 0, currentRadius * pulseScale * 0.5, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
    });

    // Show global particles
    showGlobalParticles();

    // Draw the star at the center of the world
    star.show();

    ctx.restore();

    // --- Draw pointer triangles to tracked and selected planets ---
    if (trackedPlanet) {
        // Calculate angle from camera center to tracked planet
        const dx = trackedPlanet.x - camera.worldX;
        const dy = trackedPlanet.y - camera.worldY;
        const distanceToTrackedPlanet = Math.hypot(dx, dy);
        
        // Only show tracking indicator if planet is far enough from camera center
        const hideDistance = trackedPlanet.radius + 200; // Hide when within planet radius + buffer
        
        if (distanceToTrackedPlanet > hideDistance) {
            const angle = Math.atan2(dy, dx);

            // Distance from screen center to draw the triangle
            const pointerDistance = 70; // Slightly further out for tracked planet

            // Calculate triangle center position (relative to screen center)
            const pointerX = canvas.width / 2 + Math.cos(angle) * pointerDistance;
            const pointerY = canvas.height / 2 + Math.sin(angle) * pointerDistance;

            // Draw the tracking triangle (larger and yellow)
            ctx.save();
            ctx.translate(pointerX, pointerY);
            ctx.rotate(angle);

            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(20, 0);
            ctx.lineTo(0, 10);
            ctx.closePath();
            ctx.fillStyle = "#ff0"; // Yellow for tracked
            ctx.globalAlpha = 0.9;
            ctx.fill();
            
            // Add pulsing outline
            const pulsePhase = (Date.now() / 300) % (Math.PI * 2);
            ctx.globalAlpha = 0.5 + Math.sin(pulsePhase) * 0.3;
            ctx.strokeStyle = "#ff0";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();

            // Calculate distance to planet surface
            const distanceToPlanet = distanceToTrackedPlanet - trackedPlanet.radius;

            // Draw distance text
            ctx.save();
            ctx.font = "16px Arial";
            ctx.fillStyle = "#ff0";
            ctx.globalAlpha = 0.9;
            ctx.textAlign = "center";
            ctx.fillText("TRACKING", pointerX, pointerY - 30);
            ctx.fillText(distanceToPlanet.toFixed(0) + "p", pointerX, pointerY - 15);
            ctx.restore();
        }
    } else if (selectedPlanet) {
        // Calculate angle from camera center to selected planet
        const dx = selectedPlanet.x - camera.worldX;
        const dy = selectedPlanet.y - camera.worldY;
        const angle = Math.atan2(dy, dx);

        // Distance from screen center to draw the triangle
        const pointerDistance = 50;

        // Calculate triangle center position (relative to screen center)
        const pointerX = canvas.width / 2 + Math.cos(angle) * pointerDistance;
        const pointerY = canvas.height / 2 + Math.sin(angle) * pointerDistance;

        // Draw the selection triangle
        ctx.save();
        ctx.translate(pointerX, pointerY);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(16, 0);
        ctx.lineTo(0, 8);
        ctx.closePath();
        ctx.fillStyle = "#0ff"; // Cyan for selected
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.restore();

        // Calculate distance to planet
        const distanceToPlanet = Math.hypot(selectedPlanet.x - camera.worldX, selectedPlanet.y - camera.worldY) - selectedPlanet.radius;

        // Draw distance text
        ctx.save();
        ctx.font = "14px Arial";
        ctx.fillStyle = "#0ff";
        ctx.globalAlpha = 0.9;
        ctx.textAlign = "center";
        ctx.fillText(distanceToPlanet.toFixed(0) + "p", pointerX, pointerY - 20);
        ctx.restore();
    } else if (trackedComet) {
        // Calculate angle from camera center to tracked comet
        const dx = trackedComet.x - camera.worldX;
        const dy = trackedComet.y - camera.worldY;
        const distanceToTrackedComet = Math.hypot(dx, dy);
        
        // Only show tracking indicator if comet is far enough from camera center
        const hideDistance = trackedComet.radius + 150; // Hide when within comet radius + buffer
        
        if (distanceToTrackedComet > hideDistance) {
            const angle = Math.atan2(dy, dx);

            // Distance from screen center to draw the triangle
            const pointerDistance = 65; // Slightly different from planets

            // Calculate triangle center position (relative to screen center)
            const pointerX = canvas.width / 2 + Math.cos(angle) * pointerDistance;
            const pointerY = canvas.height / 2 + Math.sin(angle) * pointerDistance;

            // Draw the tracking triangle (orange for comets)
            ctx.save();
            ctx.translate(pointerX, pointerY);
            ctx.rotate(angle);

            ctx.beginPath();
            ctx.moveTo(0, -8);
            ctx.lineTo(18, 0);
            ctx.lineTo(0, 8);
            ctx.closePath();
            ctx.fillStyle = "#f80"; // Orange for tracked comet
            ctx.globalAlpha = 0.9;
            ctx.fill();
            
            // Add pulsing outline
            const pulsePhase = (Date.now() / 400) % (Math.PI * 2);
            ctx.globalAlpha = 0.6 + Math.sin(pulsePhase) * 0.3;
            ctx.strokeStyle = "#f80";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();

            // Calculate distance to comet surface
            const distanceToComet = distanceToTrackedComet - trackedComet.radius;

            // Draw distance text
            ctx.save();
            ctx.font = "14px Arial";
            ctx.fillStyle = "#f80";
            ctx.globalAlpha = 0.9;
            ctx.textAlign = "center";
            ctx.fillText("TRACKING COMET", pointerX, pointerY - 25);
            ctx.fillText(distanceToComet.toFixed(0) + "p", pointerX, pointerY - 10);
            ctx.restore();
        }
    } else if (selectedComet) {
        // Calculate angle from camera center to selected comet
        const dx = selectedComet.x - camera.worldX;
        const dy = selectedComet.y - camera.worldY;
        const angle = Math.atan2(dy, dx);

        // Distance from screen center to draw the triangle
        const pointerDistance = 55;

        // Calculate triangle center position (relative to screen center)
        const pointerX = canvas.width / 2 + Math.cos(angle) * pointerDistance;
        const pointerY = canvas.height / 2 + Math.sin(angle) * pointerDistance;

        // Draw the selection triangle
        ctx.save();
        ctx.translate(pointerX, pointerY);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(14, 0);
        ctx.lineTo(0, 6);
        ctx.closePath();
        ctx.fillStyle = "#8ff"; // Light cyan for selected comet
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.restore();

        // Calculate distance to comet
        const distanceToComet = Math.hypot(selectedComet.x - camera.worldX, selectedComet.y - camera.worldY) - selectedComet.radius;

        // Draw distance text
        ctx.save();
        ctx.font = "12px Arial";
        ctx.fillStyle = "#8ff";
        ctx.globalAlpha = 0.9;
        ctx.textAlign = "center";
        ctx.fillText(distanceToComet.toFixed(0) + "p", pointerX, pointerY - 15);
        ctx.restore();
    }

    // Camera controls - handle WASD movement
    cameraSpeedMultiplier = keys["shift"] ? 3.0 : 1.0; // Fast movement with shift
    const effectiveSpeed = cameraSpeed * cameraSpeedMultiplier;
    
    // Only apply manual camera controls if not tracking anything
    if (!isTrackingPlanet && !isTrackingComet) {
        if (keys["a"] || keys["ArrowLeft"]) {
            camera.velocityX -= effectiveSpeed;
        }
        if (keys["d"] || keys["ArrowRight"]) {
            camera.velocityX += effectiveSpeed;
        }
        if (keys["w"] || keys["ArrowUp"]) {
            camera.velocityY -= effectiveSpeed;
        }
        if (keys["s"] || keys["ArrowDown"]) {
            camera.velocityY += effectiveSpeed;
        }
    }

    // Update camera position
    camera.update();

    // Draw HUD
    hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    hudCtx.fillStyle = "#003080";
    hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);

    hudCtx.fillStyle = "#bbbbff";
    hudCtx.font = "16px Arial";
    hudCtx.fillText("Sandbox Mode - Camera View", 20, 20);
    hudCtx.fillText("Camera X: " + camera.worldX.toFixed(1), 20, 40);
    hudCtx.fillText("Camera Y: " + camera.worldY.toFixed(1), 20, 60);
    const cameraVelocity1 = Math.sqrt(camera.velocityX * camera.velocityX + camera.velocityY * camera.velocityY);
    hudCtx.fillText("Camera Speed: " + cameraVelocity1.toFixed(2), 20, 80);
    hudCtx.fillText("Speed Multiplier: " + cameraSpeedMultiplier.toFixed(1) + "x", 20, 100);
    
    // Timewarp display
    const currentWarp = getCurrentTimeWarp();
    const warpName = timeWarpLevels[currentTimeWarpIndex];
    hudCtx.fillText(`Time Warp: ${warpName} (${currentWarp}x)`, 20, 120);
    if (isPaused) {
        hudCtx.fillStyle = "#ff8080";
        hudCtx.fillText("PAUSED", 20, 140);
        hudCtx.fillStyle = "#bbbbff";
    }
    
    // Controls instructions
    hudCtx.fillStyle = "#8080ff";
    hudCtx.font = "14px Arial";
    hudCtx.fillText("WASD/Arrow Keys: Move Camera", 20, 150);
    hudCtx.fillText("Shift: Fast Movement", 20, 170);
    hudCtx.fillText("Mouse Click: Select Planet", 20, 190);
    hudCtx.fillText("F: Track Selected Planet/Comet", 20, 210);
    hudCtx.fillText("G: Stop Tracking", 20, 230);
    hudCtx.fillText("+/-: Timewarp  Spacebar: Pause", 20, 250);

    // Additional info about features
    hudCtx.fillStyle = "#666";
    hudCtx.font = "12px Arial";
    hudCtx.fillText("• Selected comets show predicted orbit on radar", 20, 290);
    
    // Render all HUD elements
    renderHUD();

    // Draw radar and all UI components
    drawRadarAndUI();
}

// Render HUD function
function renderHUD() {
    // Planet tracking status
    if (isTrackingPlanet && trackedPlanet) {
        hudCtx.fillStyle = "#bbbbff";
        hudCtx.font = "16px Arial";
        hudCtx.fillText("TRACKING PLANET", 20, 310);
        hudCtx.fillStyle = "#8080ff";
        hudCtx.font = "14px Arial";
        hudCtx.fillText(`Planet at (${trackedPlanet.x.toFixed(0)}, ${trackedPlanet.y.toFixed(0)})`, 20, 330);
        if (selectedPlanet && selectedPlanet !== trackedPlanet) {
            hudCtx.fillStyle = "#bbbbff";
            hudCtx.fillText("Press F to switch to selected planet", 20, 350);
        }
        if (selectedComet) {
            hudCtx.fillStyle = "#bbbbff";
            hudCtx.fillText("Press F to switch to selected comet", 20, 370);
        }
    } else if (isTrackingComet && trackedComet) {
        hudCtx.fillStyle = "#ff8800";
        hudCtx.font = "16px Arial";
        hudCtx.fillText("TRACKING COMET", 20, 310);
        hudCtx.fillStyle = "#cc6600";
        hudCtx.font = "14px Arial";
        hudCtx.fillText(`Comet at (${trackedComet.x.toFixed(0)}, ${trackedComet.y.toFixed(0)})`, 20, 330);
        if (selectedPlanet) {
            hudCtx.fillStyle = "#ff8800";
            hudCtx.fillText("Press F to switch to selected planet", 20, 350);
        }
        if (selectedComet && selectedComet !== trackedComet) {
            hudCtx.fillStyle = "#ff8800";
            hudCtx.fillText("Press F to switch to selected comet", 20, 370);
        }
    } else if (selectedPlanet) {
        hudCtx.fillStyle = "#8080ff";
        hudCtx.font = "14px Arial";
        hudCtx.fillText("Planet Selected - Press F to Track", 20, 310);
    } else if (selectedComet) {
        hudCtx.fillStyle = "#cc6600";
        hudCtx.font = "14px Arial";
        hudCtx.fillText("Comet Selected - Press F to Track", 20, 310);
        hudCtx.fillStyle = "#8ff";
        hudCtx.font = "12px Arial";
        hudCtx.fillText("Predicted orbit shown on radar", 20, 330);
    }
    
    // Save/Load instructions
    hudCtx.fillStyle = "#8080ff";
    hudCtx.font = "16px Arial";
    hudCtx.fillText("F5: Save", 20, hudCanvas.height - 130);
    hudCtx.fillText("F9: Load", 20, hudCanvas.height - 110);
    
    // Planet Trails status
    hudCtx.fillStyle = showTrails ? "#bbbbff" : "#8080ff";
    hudCtx.fillText(`T: Planet Trails (${showTrails ? "ON" : "OFF"})`, 20, hudCanvas.height - 90);
    
    // Collision Prediction status
    hudCtx.fillStyle = showCollisionPrediction ? "#bbbbff" : "#8080ff";
    hudCtx.fillText(`C: Predict Collisions (${showCollisionPrediction ? "ON" : "OFF"})`, 20, hudCanvas.height - 70);
    // File status indicator
    if (savedState) {
        hudCtx.fillStyle = "#bbbbff";
        hudCtx.fillText("File Available", 180, hudCanvas.height - 130);
    } else {
        hudCtx.fillStyle = "#8080ff";
        hudCtx.fillText("No Data", 180, hudCanvas.height - 130);
    }
    
    // Collision warnings
    if (showCollisionPrediction && globalCollisionData && globalCollisionData.length > 0) {
        hudCtx.fillStyle = "#bbbbff";
        hudCtx.font = "16px Arial";
        hudCtx.fillText("COLLISION", 180, hudCanvas.height - 110);

        hudCtx.fillStyle = "#bbbbff";
        hudCtx.font = "12px Arial";
        const collision = globalCollisionData[0]; // Show first collision
        const timeToCollision = (collision.time / 60).toFixed(1); // Convert to seconds
        hudCtx.fillText(`${globalCollisionData.length} collision(s)`, 180, hudCanvas.height - 90);
        hudCtx.fillText(`Next in ~${timeToCollision}s`, 180, hudCanvas.height - 75);
    }

    // Draw radar and all UI components
    drawRadarAndUI();
}

// Separated radar and UI drawing function
function drawRadarAndUI() {
    // Draw radar background
    hudCtx.save();
    hudCtx.strokeStyle = "#fff";
    hudCtx.lineWidth = 2;
    hudCtx.strokeRect(radarX, radarY, radarSize, radarSize);
    hudCtx.fillStyle = "#111";
    hudCtx.fillRect(radarX, radarY, radarSize, radarSize);

    // Before drawing planets on radar, clear hitboxes
    radarPlanetHitboxes = [];
    radarCometHitboxes = [];

    // Draw planet trails on radar (before drawing current positions)
    if (showTrails) {
        for (let planet of planets) {
            if (planet.trail.length > 1) {
                hudCtx.save();
                
                // Draw trail as connected line segments
                hudCtx.beginPath();
                let trailDrawn = false;
                
                for (let i = 0; i < planet.trail.length; i++) {
                    const trailPoint = planet.trail[i];
                    const dx = trailPoint.x - camera.worldX;
                    const dy = trailPoint.y - camera.worldY;
                    const rx = radarX + radarSize / 2 + dx * radarScale;
                    const ry = radarY + radarSize / 2 + dy * radarScale;
                    
                    // Only draw if within radar bounds
                    if (rx >= radarX && rx <= radarX + radarSize &&
                        ry >= radarY && ry <= radarY + radarSize) {
                        
                        if (!trailDrawn) {
                            hudCtx.moveTo(rx, ry);
                            trailDrawn = true;
                        } else {
                            hudCtx.lineTo(rx, ry);
                        }
                    }
                }

                // Set trail appearance - fading cyan color
                hudCtx.strokeStyle = "#111";
                hudCtx.lineWidth = 1;
                hudCtx.globalAlpha = trailOpacity;
                hudCtx.stroke();
                
                // Draw individual trail points with fading opacity
                for (let i = 0; i < planet.trail.length; i++) {
                    const trailPoint = planet.trail[i];
                    const dx = trailPoint.x - camera.worldX;
                    const dy = trailPoint.y - camera.worldY;
                    const rx = radarX + radarSize / 2 + dx * radarScale;
                    const ry = radarY + radarSize / 2 + dy * radarScale;
                    
                    // Only draw if within radar bounds
                    if (rx >= radarX && rx <= radarX + radarSize &&
                        ry >= radarY && ry <= radarY + radarSize) {
                        
                        // Calculate fade based on position in trail (newer = more opaque)
                        const age = planet.trail.length - i;
                        const maxAge = planet.maxTrailLength;
                        const opacity = Math.max(0.1, 1 - (age / maxAge));
                        
                        hudCtx.beginPath();
                        hudCtx.arc(rx, ry, 1, 0, Math.PI * 2);
                        hudCtx.fillStyle = "#0aa";
                        hudCtx.globalAlpha = opacity * trailOpacity;
                        hudCtx.fill();
                    }
                }
                
                hudCtx.restore();
            }
        }
        
        // Draw predicted orbital paths and collision detection
        if (showCollisionPrediction) {
            // Only check for collisions once per second to improve performance and accuracy
            const currentTime = Date.now();
            if (currentTime - lastCollisionCheck > collisionCheckInterval) {
                cachedPlanetPaths = predictAllPlanetOrbits(planets, star, radarSteps, timeStep);
                const collisionData = detectPlanetCollisions(cachedPlanetPaths, planets);
                globalCollisionData = collisionData; // Store globally for HUD display
                lastCollisionCheck = currentTime;
                console.log(`Collision check performed: ${collisionData.length} collision(s) detected`);
            }
            
            // Use cached planet paths if available, otherwise calculate fresh ones
            const planetPaths = cachedPlanetPaths.length > 0 ? cachedPlanetPaths : predictAllPlanetOrbits(planets, star, radarSteps, timeStep);
            
            for (let planetIndex = 0; planetIndex < planets.length; planetIndex++) {
                const path = planetPaths[planetIndex];
                if (!path) continue; // Skip if path is undefined
                
                const planet = planets[planetIndex];
                
                hudCtx.save();
                hudCtx.strokeStyle = "#fff";
                hudCtx.globalAlpha = 0.9;
                hudCtx.lineWidth = 1;
                hudCtx.beginPath();
                
                let pathDrawn = false;
                for (let i = 0; i < path.length; i++) {
                    // Check if this step has a collision for this planet (using cached collision data)
                    const hasCollision = globalCollisionData.some(collision => 
                        (collision.planetA === planetIndex || collision.planetB === planetIndex) && 
                        collision.step === i * 2 // Account for step % 2 === 0 in path recording
                    );
                    
                    if (hasCollision) {
                        break; // Stop drawing this planet's path at collision
                    }
                    
                    const dx = path[i].x - camera.worldX;
                    const dy = path[i].y - camera.worldY;
                    const rx = radarX + radarSize / 2 + dx * radarScale;
                    const ry = radarY + radarSize / 2 + dy * radarScale;

                    // Stop drawing if out of radar bounds
                    if (
                        rx < radarX || rx > radarX + radarSize ||
                        ry < radarY || ry > radarY + radarSize
                    ) {
                        break;
                    }
                    if (i === 0) {
                        hudCtx.moveTo(rx, ry);
                        pathDrawn = true;
                    } else {
                        hudCtx.lineTo(rx, ry);
                    }
                }
                
                if (pathDrawn) {
                    hudCtx.strokeStyle = "#fff";
                    hudCtx.lineWidth = 1;
                    hudCtx.stroke();
                }
                hudCtx.restore();
            }
            
            // Draw red collision indicators (using cached collision data)
            for (let collision of globalCollisionData) {
                const dx = collision.x - camera.worldX;
                const dy = collision.y - camera.worldY;
                const rx = radarX + radarSize / 2 + dx * radarScale;
                const ry = radarY + radarSize / 2 + dy * radarScale;
                
                // Only draw if within radar bounds
                if (
                    rx >= radarX && rx <= radarX + radarSize &&
                    ry >= radarY && ry <= radarY + radarSize
                ) {
                    hudCtx.save();
                    hudCtx.strokeStyle = "#bbf"; // Light blue color for collision warning
                    hudCtx.fillStyle = "rgba(187, 187, 255, 0.3)"; // Semi-transparent light blue fill
                    hudCtx.lineWidth = 2;
                    hudCtx.globalAlpha = 0.8;
                    
                    // Draw pulsing circle
                    const pulsePhase = (Date.now() / 300) % (Math.PI * 2);
                    const pulseRadius = 8 + Math.sin(pulsePhase) * 3;
                    
                    hudCtx.beginPath();
                    hudCtx.arc(rx, ry, pulseRadius, 0, Math.PI * 2);
                    hudCtx.fill();
                    hudCtx.stroke();
                    hudCtx.restore();
                }
            }
        } else {
            // Original simple orbit prediction without collision detection
            globalCollisionData = []; // Clear collision data when disabled
            cachedPlanetPaths = []; // Clear cached paths when disabled
            cachedCometPath = []; // Clear cached comet paths when disabled
            cachedCometId = null; // Clear cached comet ID when disabled
            for (let planet of planets) {
                const path = predictOrbit(planet, planets, star, radarSteps, timeStep);
                hudCtx.save();
                hudCtx.strokeStyle = "#fff";
                hudCtx.globalAlpha = 0.9;
                hudCtx.lineWidth = 1;
                hudCtx.beginPath();
                for (let i = 0; i < path.length; i++) {
                    const dx = path[i].x - camera.worldX;
                    const dy = path[i].y - camera.worldY;
                    const rx = radarX + radarSize / 2 + dx * radarScale;
                    const ry = radarY + radarSize / 2 + dy * radarScale;

                    // Stop drawing if out of radar bounds
                    if (
                        rx < radarX || rx > radarX + radarSize ||
                        ry < radarY || ry > radarY + radarSize
                    ) {
                        break;
                    }
                    if (i === 0) {
                        hudCtx.moveTo(rx, ry);
                    } else {
                        hudCtx.lineTo(rx, ry);
                    }
                }
                hudCtx.strokeStyle = "#fff";
                hudCtx.lineWidth = 1;
                hudCtx.stroke();
                hudCtx.restore();
            }
        }
    }

    // Draw planets on radar
    for (let planet of planets) {
        // Offset from camera
        const dx = planet.x - camera.worldX;
        const dy = planet.y - camera.worldY;
        // Scale and center on radar
        const rx = radarX + radarSize / 2 + dx * radarScale;
        const ry = radarY + radarSize / 2 + dy * radarScale;
        const r = Math.max(2, planet.radius * radarScale);

        // Only draw if within radar bounds
        if (
            rx >= radarX && rx <= radarX + radarSize &&
            ry >= radarY && ry <= radarY + radarSize
        ) {
            hudCtx.beginPath();
            hudCtx.arc(rx, ry, r, 0, Math.PI * 2);
            
            // Color coding for different planet states
            if (planet === trackedPlanet) {
                hudCtx.fillStyle = "#ff0"; // Yellow for tracked planet
            } else if (planet === selectedPlanet) {
                hudCtx.fillStyle = "#0ff"; // Cyan for selected planet
            } else {
                hudCtx.fillStyle = "#0f0"; // Green for normal planets
            }
            hudCtx.fill();
            
            // Add pulsing ring around tracked planet
            if (planet === trackedPlanet) {
                hudCtx.save();
                const pulsePhase = (Date.now() / 400) % (Math.PI * 2);
                const pulseRadius = r + 3 + Math.sin(pulsePhase) * 2;
                hudCtx.strokeStyle = "#ff0";
                hudCtx.lineWidth = 2;
                hudCtx.globalAlpha = 0.7;
                hudCtx.beginPath();
                hudCtx.arc(rx, ry, pulseRadius, 0, Math.PI * 2);
                hudCtx.stroke();
                hudCtx.restore();
            }

            const hitboxBuffer = 5; // Buffer for hitbox detection

            // Store hitbox for click detection
            radarPlanetHitboxes.push({
                planet: planet,
                x: rx,
                y: ry,
                r: r + hitboxBuffer
            });
        }
    }

    // Draw star on radar
    const starRx = radarX + radarSize / 2 + (star.x - camera.worldX) * radarScale;
    const starRy = radarY + radarSize / 2 + (star.y - camera.worldY) * radarScale;
    if (
        starRx >= radarX && starRx <= radarX + radarSize &&
        starRy >= radarY && starRy <= radarY + radarSize
    ) {
        hudCtx.beginPath();
        hudCtx.arc(starRx, starRy, Math.max(2, star.radius * radarScale), 0, Math.PI * 2);
        hudCtx.fillStyle = "#ff0";
        hudCtx.fill();
    }

    // Draw comets on radar
    for (let comet of comets) {
        const dx = comet.x - camera.worldX;
        const dy = comet.y - camera.worldY;
        const rx = radarX + radarSize / 2 + dx * radarScale;
        const ry = radarY + radarSize / 2 + dy * radarScale;
        const r = Math.max(2, comet.radius * radarScale);
        
        if (
            rx >= radarX && rx <= radarX + radarSize &&
            ry >= radarY && ry <= radarY + radarSize
        ) {
            hudCtx.beginPath();
            hudCtx.arc(rx, ry, r, 0, Math.PI * 2);
            
            // Color coding for different comet states
            if (comet === trackedComet) {
                hudCtx.fillStyle = "#f80"; // Orange for tracked comet
            } else if (comet === selectedComet) {
                hudCtx.fillStyle = "#8ff"; // Light cyan for selected comet
            } else {
                hudCtx.fillStyle = "#fff"; // White for normal comets
            }
            hudCtx.fill();
            
            // Add pulsing ring around tracked comet
            if (comet === trackedComet) {
                hudCtx.save();
                const pulsePhase = (Date.now() / 500) % (Math.PI * 2);
                const pulseRadius = r + 2 + Math.sin(pulsePhase) * 1.5;
                hudCtx.strokeStyle = "#f80";
                hudCtx.lineWidth = 1.5;
                hudCtx.globalAlpha = 0.8;
                hudCtx.beginPath();
                hudCtx.arc(rx, ry, pulseRadius, 0, Math.PI * 2);
                hudCtx.stroke();
                hudCtx.restore();
            }

            const hitboxBuffer = 5; // Buffer for hitbox detection

            // Store hitbox for click detection
            radarCometHitboxes.push({
                comet: comet,
                x: rx,
                y: ry,
                r: r + hitboxBuffer
            });
        }
    }

    // Draw predicted orbit for selected comet
    if (selectedComet) {
        // Only recalculate comet path periodically for performance
        const currentTime = Date.now();
        if (currentTime - lastCometPathCheck > cometPathCheckInterval || 
            cachedCometId !== selectedComet || 
            cachedCometPath.length === 0) {
            
            // Use reduced steps for real-time comet path prediction (performance optimization)
            const cometSteps = Math.min(radarSteps, 500); // Cap at 500 steps for performance
            const cometTimeStep = 15; // Larger time step for faster calculation
            cachedCometPath = predictCometOrbit(selectedComet, planets, star, cometSteps, cometTimeStep);
            cachedCometId = selectedComet;
            lastCometPathCheck = currentTime;
        }
        
        // Use cached comet path
        const cometPath = cachedCometPath;
        
        if (cometPath.length > 1) {
            hudCtx.save();
            hudCtx.strokeStyle = "#8ff"; // Light cyan for comet orbit prediction
            hudCtx.lineWidth = 1;
            hudCtx.globalAlpha = 0.5;
            hudCtx.setLineDash([2, 4]); // Shorter dashes for minimalist look
            
            hudCtx.beginPath();
            let pathStarted = false;
            
            for (let point of cometPath) {
                const dx = point.x - camera.worldX;
                const dy = point.y - camera.worldY;
                const rx = radarX + radarSize / 2 + dx * radarScale;
                const ry = radarY + radarSize / 2 + dy * radarScale;
                
                // Only draw segments that are within radar bounds
                if (rx >= radarX && rx <= radarX + radarSize &&
                    ry >= radarY && ry <= radarY + radarSize) {
                    
                    if (!pathStarted) {
                        hudCtx.moveTo(rx, ry);
                        pathStarted = true;
                    } else {
                        hudCtx.lineTo(rx, ry);
                    }
                } else if (pathStarted) {
                    // If we were drawing and now we're out of bounds, finish this segment
                    hudCtx.stroke();
                    hudCtx.beginPath();
                    pathStarted = false;
                }
            }
            
            // Finish any remaining path
            if (pathStarted) {
                hudCtx.stroke();
            }
            
            hudCtx.restore();
        }
    } else {
        // Clear comet path cache when no comet is selected
        if (cachedCometPath.length > 0) {
            cachedCometPath = [];
            cachedCometId = null;
        }
    }

    hudCtx.restore();
}

// Keyboard event listeners
window.addEventListener("keydown", (e) => { 
    // Handle special keys (arrow keys) with their exact names
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        keys[e.key] = true;
    } else {
        keys[e.key.toLowerCase()] = true; 
    }
    
    // Save/Load hotkeys
    if (e.key.toLowerCase() === 'f5') {
        e.preventDefault(); // Prevent browser refresh
        saveGameState();
    }
    if (e.key.toLowerCase() === 'f9') {
        e.preventDefault(); // Prevent browser dev tools
        loadGameState();
    }
    
    // Planet tracking hotkeys
    if (e.key.toLowerCase() === 'f') {
        // Start tracking selected planet (or switch to new planet if already tracking)
        if (selectedPlanet) {
            // Stop any comet tracking first
            isTrackingComet = false;
            trackedComet = null;
            
            const wasAlreadyTracking = isTrackingPlanet;
            const previousPlanet = trackedPlanet;
            
            isTrackingPlanet = true;
            trackedPlanet = selectedPlanet;
            
            if (wasAlreadyTracking && previousPlanet !== selectedPlanet) {
                console.log(`Switched tracking from previous planet to new planet at (${trackedPlanet.x.toFixed(0)}, ${trackedPlanet.y.toFixed(0)})`);
            } else if (!wasAlreadyTracking) {
                console.log(`Started tracking planet at (${trackedPlanet.x.toFixed(0)}, ${trackedPlanet.y.toFixed(0)})`);
            } else {
                console.log(`Already tracking this planet at (${trackedPlanet.x.toFixed(0)}, ${trackedPlanet.y.toFixed(0)})`);
            }
        } else if (selectedComet) {
            // Stop any planet tracking first
            isTrackingPlanet = false;
            trackedPlanet = null;
            
            const wasAlreadyTracking = isTrackingComet;
            const previousComet = trackedComet;
            
            isTrackingComet = true;
            trackedComet = selectedComet;
            
            if (wasAlreadyTracking && previousComet !== selectedComet) {
                console.log(`Switched tracking from previous comet to new comet at (${trackedComet.x.toFixed(0)}, ${trackedComet.y.toFixed(0)})`);
            } else if (!wasAlreadyTracking) {
                console.log(`Started tracking comet at (${trackedComet.x.toFixed(0)}, ${trackedComet.y.toFixed(0)})`);
            } else {
                console.log(`Already tracking this comet at (${trackedComet.x.toFixed(0)}, ${trackedComet.y.toFixed(0)})`);
            }
        } else {
            console.log("No planet or comet selected. Click on a planet or comet in the radar first, then press F to track it.");
        }
    }
    if (e.key.toLowerCase() === 'g') {
        // Stop tracking
        if (isTrackingPlanet) {
            isTrackingPlanet = false;
            trackedPlanet = null;
            console.log("Stopped planet tracking");
        } else if (isTrackingComet) {
            isTrackingComet = false;
            trackedComet = null;
            console.log("Stopped comet tracking");
        }
    }
    
    // Timewarp controls
    if (e.key === '+' || e.key === '=') {
        increaseTimeWarp();
    }
    if (e.key === '-' || e.key === '_') {
        decreaseTimeWarp();
    }
    if (e.key === ' ') {
        e.preventDefault(); // Prevent page scroll
        togglePause();
    }
});

window.addEventListener("keyup", (e) => { 
    // Handle special keys (arrow keys) with their exact names
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        keys[e.key] = false;
    } else {
        keys[e.key.toLowerCase()] = false; 
    }
});

// Landing system functions
function checkLandingOpportunity(ship, planets) {
    for (let planet of planets) {
        if (typeof PlanetExploration !== 'undefined' && PlanetExploration.canLandOnPlanet) {
            if (PlanetExploration.canLandOnPlanet(ship, planet)) {
                return planet;
            }
        }
    }
    return null;
}

function attemptPlanetLanding(planet, ship) {
    if (typeof startPlanetExploration === 'function') {
        const success = startPlanetExploration(ship, planet);
        if (success) {
            console.log(`Successfully landed on planet with radius ${planet.radius} and mass ${planet.mass}`);
        } else {
            console.log("Failed to start planet exploration");
        }
    } else {
        console.log("Planet exploration system not available");
    }
}

// The ship class represents the player's ship in the game.
class Camera {
    // The constructor initializes the camera's properties for sandbox mode.
    constructor() {
        this.worldX = 0;             // Camera's position in the world
        this.worldY = 350;           // Camera's position in the world (account for star)
        this.velocityX = 0;          // Camera velocity for smooth movement
        this.velocityY = 0;          // Camera velocity for smooth movement
        this.damping = 0.85;         // Velocity damping for smooth stops
    }
    
    // The update method updates the camera's position based on its velocity.
    update() {
        // Priority: Planet tracking takes precedence over comet tracking
        if (isTrackingPlanet && trackedPlanet) {
            // Check if tracked planet still exists
            if (!planets.includes(trackedPlanet)) {
                // Planet was destroyed, stop tracking
                isTrackingPlanet = false;
                trackedPlanet = null;
                console.log("Tracked planet was destroyed, stopping tracking");
            } else {
                // Smoothly move camera towards the tracked planet
                const targetX = trackedPlanet.x;
                const targetY = trackedPlanet.y;
                
                // Calculate smooth interpolation (lerp) factor adjusted for timewarp
                const currentWarp = getCurrentTimeWarp();
                const baseLerpFactor = 0.05; // Base tracking speed
                const warpAdjustedLerpFactor = Math.min(baseLerpFactor * Math.sqrt(currentWarp), 0.3); // Scale with timewarp but cap at 0.3
                
                // Smoothly move camera position towards target
                this.worldX += (targetX - this.worldX) * warpAdjustedLerpFactor;
                this.worldY += (targetY - this.worldY) * warpAdjustedLerpFactor;
                
                // Reduce velocity when tracking to prevent drift
                this.velocityX *= 0.5;
                this.velocityY *= 0.5;
                
                return; // Skip normal velocity-based movement
            }
        }
        
        // If tracking a comet, smoothly move camera towards it
        if (isTrackingComet && trackedComet) {
            // Check if tracked comet still exists
            if (!comets.includes(trackedComet)) {
                // Comet was destroyed, stop tracking
                isTrackingComet = false;
                trackedComet = null;
                console.log("Tracked comet was destroyed, stopping tracking");
            } else {
                // Smoothly move camera towards the tracked comet
                const targetX = trackedComet.x;
                const targetY = trackedComet.y;
                
                // Calculate smooth interpolation (lerp) factor adjusted for timewarp (slightly faster for comets)
                const currentWarp = getCurrentTimeWarp();
                const baseLerpFactor = 0.07; // Base tracking speed (faster for comets)
                const warpAdjustedLerpFactor = Math.min(baseLerpFactor * Math.sqrt(currentWarp), 0.4); // Scale with timewarp but cap at 0.4
                
                // Smoothly move camera position towards target
                this.worldX += (targetX - this.worldX) * warpAdjustedLerpFactor;
                this.worldY += (targetY - this.worldY) * warpAdjustedLerpFactor;
                
                // Reduce velocity when tracking to prevent drift
                this.velocityX *= 0.5;
                this.velocityY *= 0.5;
                
                return; // Skip normal velocity-based movement
            }
        }
        
        // Normal camera movement (when not tracking)
        // Apply velocity to world position
        this.worldX += this.velocityX;
        this.worldY += this.velocityY;
        
        // Apply damping to velocity for smooth movement
        this.velocityX *= this.damping;
        this.velocityY *= this.damping;
    }
}

// Update the Planet class to accept x and y as parameters
class Planet {
    // The constructor initializes the planet's properties.
    constructor(x, y, radius) {
        this.radius = radius;
        this.mass = this.radius * 0.5;
        this.x = x;
        this.y = y;
        this.velocityX = 0;
        this.velocityY = 0;
        
        // Trail system for radar display
        this.trail = [];
        this.maxTrailLength = 1000; // Maximum number of trail points
        this.trailRecordInterval = 3; // Record position every N frames
        this.trailCounter = 0;
        
        // Select planet image based on size when created (not every frame)
        if (this.radius > 120) {
            // Giant planet
            this.Image = giants[Math.floor(Math.random() * giants.length)];
        } else if (this.radius > 50) {
            // Terrestrial planet
            this.Image = terrestrials[Math.floor(Math.random() * terrestrials.length)];
        } else {
            // Moon
            this.Image = moons[Math.floor(Math.random() * moons.length)];
        }
    }
    update() {
        // Note: Position updates are handled by the physics simulation in the main loop
        // This method is only for trail recording and other planet-specific updates
        
        // Record trail positions periodically
        this.trailCounter++;
        if (this.trailCounter >= this.trailRecordInterval) {
            this.trail.push({ x: this.x, y: this.y });
            
            // Remove old trail points if we exceed max length
            if (this.trail.length > this.maxTrailLength) {
                this.trail.shift(); // Remove oldest point
            }
            
            this.trailCounter = 0;
        }
    }
    // The show method draws the planet on the canvas.
    show() {
        ctx.save();
        ctx.translate(this.x, this.y);
        // Create a circular clipping path
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        // Draw the image inside the clipped circle
        ctx.drawImage(this.Image, -this.radius, -this.radius, this.radius * 2, this.radius * 2);
        ctx.restore();
    }
}

// The Star class represents a star in the game.
class Star {
    constructor(x, y, radius) {
        this.x = x;       // world X
        this.y = y;       // world Y
        this.radius = radius;
        this.mass = this.radius * 2; // Mass proportional to radius
    }
    show() {
        ctx.save();
        ctx.translate(this.x, this.y);
        const glowRadius = this.radius * 5;
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowRadius);
        gradient.addColorStop(0, "#ffc");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(gallery.yellowStar, -this.radius, -this.radius, this.radius * 2, this.radius * 2);
        ctx.restore();
    }
}

class Comet {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.velocityX = 0;
        this.velocityY = 0;
        this.angle = 0; // Angle facing the star
        this.lastParticleTime = 0;
    }
    
    update() {
        this.x += this.velocityX;
        this.y += this.velocityY;
        
        // Calculate angle to face the star
        const dx = star.x - this.x;
        const dy = star.y - this.y;
        this.angle = Math.atan2(dy, dx);
        
        // Generate particles (every few frames for performance)
        const now = Date.now();
        if (now - this.lastParticleTime > 50) { // Generate particles every 50ms
            this.generateParticles();
            this.lastParticleTime = now;
        }
    }
    
    generateParticles() {
        const distanceToStar = Math.hypot(star.x - this.x, star.y - this.y);
        
        // Generate ion tail particles (repelled directly away from star)
        if (distanceToStar < 10000) { // Only generate tails when close enough to star
            const ionDirection = Math.atan2(this.y - star.y, this.x - star.x);
            const ionParticle = new IonParticle(
                this.x + Math.random() * 10 - 5,
                this.y + Math.random() * 10 - 5,
                ionDirection,
                distanceToStar,
                this.angle // Pass comet's angle to particle
            );
            globalIonParticles.push(ionParticle); // Add to global array
        }
        
        // Generate dust tail particles (trailing behind comet)
        if (distanceToStar < 15000) {
            const dustDirection = Math.atan2(-this.velocityY, -this.velocityX);
            const dustParticle = new DustParticle(
                this.x + Math.random() * 8 - 4,
                this.y + Math.random() * 8 - 4,
                dustDirection,
                distanceToStar,
                this.angle // Pass comet's angle to particle
            );
            globalDustParticles.push(dustParticle); // Add to global array
        }

        // Delete ejected comets after a certain distance
        const maxDistance = worldSize * 1.2; // Maximum distance from star to keep comet
        const cometDistance = Math.hypot(this.x - star.x, this.y - star.y);
        if (cometDistance > maxDistance) {
            // Create explosion particles before deleting
            createExplosion();
            // Remove comet from the global array
            comets = comets.filter(c => c !== this);
        }
    }
    
    show() {
        // Draw the comet itself
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle); // Face the star
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(gallery.cometImg, -this.radius, -this.radius, this.radius * 2, this.radius * 2);
        ctx.restore();
    }
}

// Ion tail particle class
class IonParticle {
    constructor(x, y, direction, distanceToStar, cometAngle = 0) {
        this.x = x;
        this.y = y;
        this.direction = direction;
        this.angle = cometAngle; // Use comet's angle (facing the star)
        this.speed = 2 + Math.random() * 3; // Speed varies
        this.life = 1.0; // Full opacity initially
        this.maxLife = 60 + Math.random() * 40; // Lifetime in frames
        this.currentLife = this.maxLife;
        this.size = 32 + Math.random() * 4;
        
        // Intensity based on distance to star (closer = brighter tails)
        this.intensity = Math.max(0.3, 1 - (distanceToStar / 10000));
    }
    
    update() {
        // Move away from star
        this.x += Math.cos(this.direction) * this.speed;
        this.y += Math.sin(this.direction) * this.speed;
        // Keep the original angle (don't update it to movement direction)
        
        // Fade out over time
        this.currentLife--;
        this.life = this.currentLife / this.maxLife;
        
        // Speed up over time
        this.speed *= 1.02;
    }
    
    show() {
        if (this.life <= 0) return;
        
        ctx.save();
        ctx.globalAlpha = this.life * this.intensity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle); // Rotate to match comet's angle (facing the star)
        
        // Draw ion tail particle using the ion tail image
        const size = this.size / this.life;
        ctx.drawImage(gallery.ionTail, -size/2, -size/2, size, size);
        
        ctx.restore();
    }
}

// Dust tail particle class
class DustParticle {
    constructor(x, y, direction, distanceToStar, cometAngle = 0) {
        this.x = x;
        this.y = y;
        this.direction = direction + (Math.random() - 0.5) * 0.5; // Add some spread
        this.angle = cometAngle; // Use comet's angle (facing the star)
        this.speed = 0.5 + Math.random() * 1.5; // Slower than ion particles
        this.life = 1.0;
        this.maxLife = 80 + Math.random() * 60; // Longer lifetime than ion particles
        this.currentLife = this.maxLife;
        this.size = 32 + Math.random() * 3;
        
        // Intensity based on distance to star
        this.intensity = Math.max(0.2, 1 - (distanceToStar / 15000));
        
        // Drift velocity (affected by solar wind simulation)
        this.driftX = (Math.random() - 0.5) * 0.2;
        this.driftY = (Math.random() - 0.5) * 0.2;
    }
    
    update() {
        // Move in the trail direction
        this.x += Math.cos(this.direction) * this.speed + this.driftX;
        this.y += Math.sin(this.direction) * this.speed + this.driftY;
        // Keep the original angle (don't update it to movement direction)
        
        // Fade out over time
        this.currentLife--;
        this.life = this.currentLife / this.maxLife;
        
        // Slow down over time
        this.speed *= 0.995;
        
        // Apply some drift (simulating solar wind effects)
        this.driftX *= 1.01;
        this.driftY *= 1.01;
    }
    
    show() {
        if (this.life <= 0) return;
        
        ctx.save();
        ctx.globalAlpha = this.life * this.intensity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle); // Rotate to match comet's angle (facing the star)
        
        // Draw dust tail particle using the dust tail image
        const size = this.size / Math.sqrt(this.life); // Different size scaling
        ctx.drawImage(gallery.dustTail, -size/2, -size/2, size, size);
        
        ctx.restore();
    }
}

// Thruster particle class for ship engine effects
class ThrusterParticle {
    constructor(x, y, direction, shipAngle, shipVelX = 0, shipVelY = 0) {
        this.x = x;
        this.y = y;
        this.direction = direction + (Math.random() - 0.5) * 0.3; // Add some spread
        this.angle = shipAngle; // Face the same direction as the ship
        this.speed = 1.5 + Math.random() * 2; // Initial speed
        this.life = 1.0;
        this.maxLife = 30 + Math.random() * 20; // Short lifetime for thruster effect
        this.currentLife = this.maxLife;
        this.size = 32 + Math.random() * 8;
        this.intensity = 0.8 + Math.random() * 0.2; // High intensity for bright thruster
        
        // Start with ship's velocity but reduced (exhaust is "left behind" initially)
        const velocityReduction = 0.3 + Math.random() * 0.4; // Remove 30-70% of ship's velocity
        const inheritanceFactor = 1.0 - velocityReduction; // 30-70% of ship's velocity remaining
        this.inheritedVelX = shipVelX * inheritanceFactor;
        this.inheritedVelY = shipVelY * inheritanceFactor;
        
        // Which exhaust image to start with (0, 1, or 2)
        this.exhaustStage = 0;
        this.stageTimer = 0;
        this.stageInterval = Math.floor(this.maxLife / 3); // Divide lifetime into 3 stages
    }
    
    update() {
        // Move away from ship engine (exhaust direction) plus inherited ship velocity
        this.x += Math.cos(this.direction) * this.speed + this.inheritedVelX;
        this.y += Math.sin(this.direction) * this.speed + this.inheritedVelY;

        // Fade out over time
        this.currentLife--;
        this.life = this.currentLife / this.maxLife;
        
        // Update exhaust stage animation
        this.stageTimer++;
        if (this.stageTimer >= this.stageInterval) {
            this.exhaustStage = Math.min(2, this.exhaustStage + 1); // Progress through stages 0, 1, 2
            this.stageTimer = 0;
        }
    }
    
    show() {
        if (this.life <= 0) return;
        
        ctx.save();
        ctx.globalAlpha = this.life * this.intensity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle); // Rotate to match ship's angle
        
        // Select the correct exhaust image based on stage
        let exhaustImage;
        switch(this.exhaustStage) {
            case 0:
                exhaustImage = gallery.exhaust0;
                break;
            case 1:
                exhaustImage = gallery.exhaust1;
                break;
            case 2:
                exhaustImage = gallery.exhaust2;
                break;
            default:
                exhaustImage = gallery.exhaust0;
        }
        
        // Draw thruster particle using the appropriate exhaust image
        const size = this.size * (0.5 + this.life * 0.5); // Size varies with life
        ctx.drawImage(exhaustImage, -size/2, -size/2, size, size);
        
        ctx.restore();
    }
}

class Wormhole {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.velocityX = vx;
        this.velocityY = vy;
        this.radius = 100;
        this.life = 600; // Lasts for 10 seconds at 60 FPS
        this.pulsePhase = 0; // For pulsing effect
    }
}

class WormholeParticle {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.velocityX = vx;
        this.velocityY = vy;
        this.life = 60 + Math.random() * 60; // 1-2 seconds
        this.currentLife = this.life;
        this.size = 2 + Math.random() * 4; // Smaller particles for evaporation effect
        this.alpha = 1.0; // Start fully opaque
    }
    
    update() {
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.currentLife--;
        
        // Fade out as particle ages
        this.alpha = this.currentLife / this.life;
    }
    
    show() {
        if (this.currentLife <= 0) return;
        
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = "#00ffbb"; // Cyan color matching wormhole
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Add a subtle glow effect
        ctx.globalAlpha = this.alpha * 0.3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

// Global particle management functions
function updateGlobalParticles() {
    // Update and filter ion particles
    globalIonParticles = globalIonParticles.filter(particle => {
        particle.update();
        return particle.life > 0;
    });
    
    // Update and filter dust particles
    globalDustParticles = globalDustParticles.filter(particle => {
        particle.update();
        return particle.life > 0;
    });
    
    // Update and filter thruster particles
    globalThrusterParticles = globalThrusterParticles.filter(particle => {
        particle.update();
        return particle.life > 0;
    });
    
    // Update and filter wormhole particles
    globalWormholeParticles = globalWormholeParticles.filter(particle => {
        particle.update();
        return particle.currentLife > 0;
    });
}

function showGlobalParticles() {
    // Draw thruster particles first (behind other particles)
    for (let particle of globalThrusterParticles) {
        particle.show();
    }
    
    // Draw dust particles next
    for (let particle of globalDustParticles) {
        particle.show();
    }
    
    // Draw ion particles on top
    for (let particle of globalIonParticles) {
        particle.show();
    }
    
    // Draw wormhole particles (they handle their own alpha)
    for (let particle of globalWormholeParticles) {
        particle.show();
    }
}

// Function to add explosion particles when a comet is destroyed, or other events
function createExplosion(x, y, velocityX, velocityY) {
    const explosionParticles = 20 + Math.random() * 30; // 20-50 particles
    
    for (let i = 0; i < explosionParticles; i++) {
        // Create debris particles in random directions
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 4;
        const randomAngle = Math.random() * Math.PI * 2; // Random rotation for explosion debris
        // Create a new dust particle for the explosion
        const dustParticle = new DustParticle(
            x + (Math.random() - 0.5) * 15,
            y + (Math.random() - 0.5) * 15,
            angle,
            500,
            randomAngle // Random angle for explosion debris
        );
        dustParticle.speed = speed;
        dustParticle.maxLife = 60 + Math.random() * 80; // Medium life for explosion
        dustParticle.currentLife = dustParticle.maxLife;
        // Inherit some of the comet's velocity
        dustParticle.driftX = velocityX * 0.3;
        dustParticle.driftY = velocityY * 0.3;
        globalDustParticles.push(dustParticle);
    }
}

// Radar settings
const radarX = 50;
const radarY = 350;
const radarSize = 200;
let radarWorldSize = 4000; // world units shown on radar by default
let radarScale = radarSize / radarWorldSize;
let radarSteps = 1000; // Default number of steps for orbit prediction
let timeStep = 10; // Time step for simulation, can be adjusted for smoother lines or faster simulation

// Radar hitbox arrays
let radarPlanetHitboxes = [];
let radarCometHitboxes = [];

// Update radar scale when slider changes
document.getElementById("radarSlider").addEventListener("input", function(e) {
    radarWorldSize = Number(e.target.value);
    radarScale = radarSize / radarWorldSize;
    document.getElementById("radarValue").innerHTML = radarWorldSize;
});

// Update radar steps when slider changes
document.getElementById("radarSteps").addEventListener("input", function(e) {
    radarSteps = Number(e.target.value);
    document.getElementById("radarStepsValue").innerHTML = radarSteps;
});

// Trail controls (add these if you want to adjust trail settings dynamically)
let showTrails = true;
let trailOpacity = 0.6;
let globalCollisionData = []; // Store detected planet collisions for HUD display
let showCollisionPrediction = true; // Control for planet collision prediction
let lastCollisionCheck = 0; // Timestamp of last collision detection
let collisionCheckInterval = 100; // Check collisions every 100ms (0.1 second)
let cachedPlanetPaths = []; // Cache planet paths to avoid recalculating every frame
let lastCometPathCheck = 0; // Timestamp of last comet path calculation
let cometPathCheckInterval = 100; // Recalculate comet paths every 100ms (0.1 second)
let cachedCometPath = []; // Cache comet path to avoid recalculating every frame
let cachedCometId = null; // Track which comet's path is cached
let requestWormhole = false; // Flag to request wormhole spawn
let wormholes = []; // Array to store active wormholes

// You can add keyboard shortcuts to toggle trails
window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === 't' && gameStarted) {
        showTrails = !showTrails;
        console.log("Planet trails (t):", showTrails ? "ON" : "OFF");
        
        // Clear caches when trails are disabled
        if (!showTrails) {
            cachedPlanetPaths = [];
            cachedCometPath = [];
            cachedCometId = null;
        }
    }
    if (e.key.toLowerCase() === 'c' && gameStarted) {
        showCollisionPrediction = !showCollisionPrediction;
        console.log("Collision prediction (c):", showCollisionPrediction ? "ON" : "OFF");
        
        // Clear caches when collision prediction is disabled
        if (!showCollisionPrediction) {
            cachedPlanetPaths = [];
            cachedCometPath = [];
            cachedCometId = null;
        }
    }
    // Spawn wormhole with 'o' key
    if (e.key.toLowerCase() === 'o' && gameStarted) {
        requestWormhole = true;
        console.log("Wormhole spawn requested (o)");
    }
});

// Spawn Comets
function spawnComet() {
    // Calculate a random angle and distance from the star
    const angle = Math.random() * Math.PI * 2;
    const cometDist = Math.random() * worldSize; // Random distance from the star

    // Calculate comet's world position
    const cometX = star.x + Math.cos(angle) * cometDist;
    const cometY = star.y + Math.sin(angle) * cometDist;

    // Set comet radius (adjust as needed)
    const cometRadius = Math.floor(Math.random() * 15) + 5; // Random radius between 5 and 20

    // Create the comet
    let comet = new Comet(cometX, cometY, cometRadius);

    // Calculate the vector from star to comet
    const dx = cometX - star.x;
    const dy = cometY - star.y;

    // Calculate orbital speed
    const orbitalSpeed = Math.sqrt(G * star.mass / cometDist);

    // --- Add this: randomize the speed factor ---
    const speedFactor = 0.1 + Math.random() * 0.4; // Range: 0.1 to 0.5

    // Perpendicular direction (tangent to the orbit)
    const perpX = -dy / cometDist;
    const perpY = dx / cometDist;

    // 10. Set the comet's velocity
    comet.velocityX = perpX * orbitalSpeed * speedFactor;
    comet.velocityY = perpY * orbitalSpeed * speedFactor;

    comets.push(comet);
}

function checkBodyCollision(body1, body2) {
    const dx = body1.x - body2.x;
    const dy = body1.y - body2.y;
    const distance = Math.hypot(dx, dy);
    const minDist = (body1.radius + body2.radius);
    return distance < minDist;
}

function predictOrbit(targetPlanet, planets, star, steps = radarSteps, timeStep) {
    if (!planets || !Array.isArray(planets)) return []; // Prevent crash if planets is undefined

    const path = [];
    
    // Create copies of all planet states for simulation
    const simulatedPlanets = planets.map(planet => ({
        x: planet.x,
        y: planet.y,
        vx: planet.velocityX,
        vy: planet.velocityY,
        mass: planet.mass,
        radius: planet.radius,
        isTarget: planet === targetPlanet
    }));
    
    // Find the target planet in our simulation
    const targetIndex = planets.indexOf(targetPlanet);
    
    for (let step = 0; step < steps; step++) {
        // Calculate forces using Barnes-Hut algorithm
        const planetBodies = simulatedPlanets.map(planet => ({
            x: planet.x,
            y: planet.y,
            mass: planet.mass,
            radius: planet.radius
        }));
        
        const forces = calculateBarnesHutForces(planetBodies);
        
        // Update all planets simultaneously using calculated forces
        for (let i = 0; i < simulatedPlanets.length; i++) {
            const planet = simulatedPlanets[i];
            
            // Add star gravity to Barnes-Hut calculated forces
            const dxStar = star.x - planet.x;
            const dyStar = star.y - planet.y;
            const distSqStar = dxStar * dxStar + dyStar * dyStar + 1e-6;
            const distStar = Math.sqrt(distSqStar);
            const starForce = G * star.mass / distSqStar;
            
            // Update velocity
            planet.vx += (forces[i].fx + (dxStar / distStar) * starForce) * timeStep;
            planet.vy += (forces[i].fy + (dyStar / distStar) * starForce) * timeStep;
            
            // Update position
            planet.x += planet.vx * timeStep;
            planet.y += planet.vy * timeStep;
        }
        
        // Record the target planet's position every few steps to reduce data
        if (step % 2 === 0 && targetIndex >= 0) {
            path.push({ 
                x: simulatedPlanets[targetIndex].x, 
                y: simulatedPlanets[targetIndex].y 
            });
        }
    }

    return path;
}

// Predict orbits for all planets simultaneously to enable collision detection
function predictAllPlanetOrbits(planets, star, steps = radarSteps, timeStep = 10) {
    if (!planets || !Array.isArray(planets)) return []; // Prevent crash if planets is undefined

    const allPaths = planets.map(() => []); // Array of paths, one for each planet
    
    // Create copies of all planet states for simulation
    const simulatedPlanets = planets.map(planet => ({
        x: planet.x,
        y: planet.y,
        vx: planet.velocityX,
        vy: planet.velocityY,
        mass: planet.mass,
        radius: planet.radius
    }));
    
    for (let step = 0; step < steps; step++) {
        // Calculate forces using Barnes-Hut algorithm
        const planetBodies = simulatedPlanets.map(planet => ({
            x: planet.x,
            y: planet.y,
            mass: planet.mass,
            radius: planet.radius
        }));
        
        const forces = calculateBarnesHutForces(planetBodies);
        
        // Update all planets simultaneously using calculated forces
        for (let i = 0; i < simulatedPlanets.length; i++) {
            const planet = simulatedPlanets[i];
            
            // Add star gravity to Barnes-Hut calculated forces
            const dxStar = star.x - planet.x;
            const dyStar = star.y - planet.y;
            const distSqStar = dxStar * dxStar + dyStar * dyStar + 1e-6;
            const distStar = Math.sqrt(distSqStar);
            const starForce = G * star.mass / distSqStar;
            
            // Update velocity
            planet.vx += (forces[i].fx + (dxStar / distStar) * starForce) * timeStep;
            planet.vy += (forces[i].fy + (dyStar / distStar) * starForce) * timeStep;
            
            // Update position
            planet.x += planet.vx * timeStep;
            planet.y += planet.vy * timeStep;
        }
        
        // Record positions for all planets every few steps to reduce data
        if (step % 2 === 0) {
            for (let i = 0; i < simulatedPlanets.length; i++) {
                allPaths[i].push({ 
                    x: simulatedPlanets[i].x, 
                    y: simulatedPlanets[i].y,
                    step: step // Include step number for collision timing
                });
            }
        }
    }

    return allPaths;
}

// Predict orbit for a specific comet
function predictCometOrbit(targetComet, planets, star, steps = radarSteps * 2, timeStep = 5) {
    if (!targetComet) return [];

    const path = [];
    
    // Create a copy of the comet state for simulation
    const simulatedComet = {
        x: targetComet.x,
        y: targetComet.y,
        vx: targetComet.velocityX,
        vy: targetComet.velocityY,
        mass: 1, // Small mass for comet
        radius: targetComet.radius
    };
    
    // Create copies of all planet states for simulation
    const simulatedPlanets = planets.map(planet => ({
        x: planet.x,
        y: planet.y,
        vx: planet.velocityX,
        vy: planet.velocityY,
        mass: planet.mass,
        radius: planet.radius
    }));
    
    for (let step = 0; step < steps; step++) {
        // === Use same physics approach as main game engine ===
        
        // Apply star gravity to all planets (same as main physics)
        for (let planet of simulatedPlanets) {
            const dx = star.x - planet.x;
            const dy = star.y - planet.y;
            const distSq = dx * dx + dy * dy + 1e-6;
            const dist = Math.sqrt(distSq);
            const force = G * star.mass / distSq;
            
            planet.vx += (dx / dist) * force * timeStep;
            planet.vy += (dy / dist) * force * timeStep;
        }
        
        // Apply planet-planet gravity using Barnes-Hut (same as main physics)
        if (simulatedPlanets.length > 1) {
            const planetBodies = simulatedPlanets.map(planet => ({
                x: planet.x,
                y: planet.y,
                mass: planet.mass,
                radius: planet.radius
            }));
            
            const barnesHutForces = calculateBarnesHutForces(planetBodies);
            
            // Apply forces using subdivided timesteps for accuracy (same as main physics)
            const numSubSteps = 4;
            const subTimeStep = timeStep / numSubSteps;
            
            for (let subStep = 0; subStep < numSubSteps; subStep++) {
                // Apply Barnes-Hut forces to planets
                for (let i = 0; i < simulatedPlanets.length; i++) {
                    const force = barnesHutForces[i];
                    simulatedPlanets[i].vx += force.fx * subTimeStep;
                    simulatedPlanets[i].vy += force.fy * subTimeStep;
                }
                
                // Update planet positions (sub-step)
                for (let planet of simulatedPlanets) {
                    planet.x += planet.vx * subTimeStep;
                    planet.y += planet.vy * subTimeStep;
                }
            }
        } else {
            // Update planet positions (single step when no planet-planet interactions)
            for (let planet of simulatedPlanets) {
                planet.x += planet.vx * timeStep;
                planet.y += planet.vy * timeStep;
            }
        }
        
        // === Calculate comet forces using the exact same approach as main physics ===
        
        // Star gravity on comet
        const dxStar = star.x - simulatedComet.x;
        const dyStar = star.y - simulatedComet.y;
        const distSqStar = dxStar * dxStar + dyStar * dyStar + 1e-6;
        const distStar = Math.sqrt(distSqStar);
        const starForce = G * star.mass / distSqStar;
        
        simulatedComet.vx += (dxStar / distStar) * starForce * timeStep;
        simulatedComet.vy += (dyStar / distStar) * starForce * timeStep;
        
        // Planet gravity on comet (using Barnes-Hut for consistency)
        if (simulatedPlanets.length > 0) {
            // Create bodies array including the comet for Barnes-Hut calculation
            const allBodies = [
                {
                    x: simulatedComet.x,
                    y: simulatedComet.y,
                    mass: simulatedComet.mass,
                    radius: simulatedComet.radius
                },
                ...simulatedPlanets.map(planet => ({
                    x: planet.x,
                    y: planet.y,
                    mass: planet.mass,
                    radius: planet.radius
                }))
            ];
            
            const allForces = calculateBarnesHutForces(allBodies);
            
            // Apply planet forces to comet (first element is the comet)
            const cometForce = allForces[0];
            simulatedComet.vx += cometForce.fx * timeStep;
            simulatedComet.vy += cometForce.fy * timeStep;
        }
        
        // Update comet position
        simulatedComet.x += simulatedComet.vx * timeStep;
        simulatedComet.y += simulatedComet.vy * timeStep;
        
        // Record comet position every few steps to reduce data and smooth the path
        if (step % 3 === 0) {
            path.push({ 
                x: simulatedComet.x, 
                y: simulatedComet.y 
            });
        }
        
        // Stop prediction if comet goes too far from the system
        const distanceFromStar = Math.hypot(simulatedComet.x - star.x, simulatedComet.y - star.y);
        if (distanceFromStar > worldSize * 2) {
            break; // Comet has escaped the system
        }
    }

    return path;
}

// Detect collisions between predicted planet paths
function detectPlanetCollisions(planetPaths, planets) {
    const collisions = [];
    const planetsWithCollisions = new Set(); // Track which planets already have collisions
    
    if (!planetPaths || planetPaths.length < 2) return collisions;
    
    // Find the minimum path length to avoid index errors
    const minPathLength = Math.min(...planetPaths.map(path => path.length));
    
    // Check each time step for collisions between all planet pairs
    for (let step = 0; step < minPathLength; step++) {
        for (let i = 0; i < planetPaths.length; i++) {
            // Skip if this planet already has a collision prediction
            if (planetsWithCollisions.has(i)) continue;
            
            for (let j = i + 1; j < planetPaths.length; j++) {
                // Skip if either planet already has a collision prediction
                if (planetsWithCollisions.has(j)) continue;
                
                const planetA = planets[i];
                const planetB = planets[j];
                const posA = planetPaths[i][step];
                const posB = planetPaths[j][step];
                
                if (!posA || !posB) continue;
                
                // Calculate distance between planets at this time step
                const dx = posA.x - posB.x;
                const dy = posA.y - posB.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const collisionDistance = planetA.radius + planetB.radius + 10; // Small buffer
                
                if (distance <= collisionDistance) {
                    // Collision detected! Record it
                    collisions.push({
                        planetA: i,
                        planetB: j,
                        step: step * 2, // Convert back to original step numbering
                        x: (posA.x + posB.x) / 2, // Collision point (midpoint)
                        y: (posA.y + posB.y) / 2,
                        distance: distance,
                        time: step * timeStep // Time until collision
                    });
                    
                    // Mark both planets as having collision predictions
                    planetsWithCollisions.add(i);
                    planetsWithCollisions.add(j);
                    
                    // Break out of the j loop since we found a collision for planet i
                    break;
                }
            }
        }
    }
    
    return collisions;
}

function spawnWormhole() {
    // Calculate position near the camera center
    const distance = 250;
    const angle = Math.random() * Math.PI * 2; // Random angle since no ship direction
    const wormholeX = camera.worldX + Math.sin(angle) * distance;
    const wormholeY = camera.worldY - Math.cos(angle) * distance;
    
    // Create wormhole with minimal velocity
    const wormhole = new Wormhole(wormholeX, wormholeY, 0, 0);
    wormholes.push(wormhole);
    
    console.log(`Wormhole spawned at (${wormholeX.toFixed(1)}, ${wormholeY.toFixed(1)}) near camera position`);
}