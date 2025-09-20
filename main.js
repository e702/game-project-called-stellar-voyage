// main.js
// This file contains the main game logic for Stellar Voyage.
// TODO LIST: add functionality to the wormhole, add effect when passing through wormhole, add sound effects / sounds / music, add telescope view with radio capabilities.
let canvas, ctx, hudCanvas, hudCtx, altCanvas, altCtx, ship, shipNorth, greenPlanet, planets, comets;
let alternateView; // Will be initialized after the AlternateView class is loaded
let random = Math.floor(Math.random() * 100) + 10; // Random width for the planet
const keys = {};
const G = 20; // Gravitational constant (tweak for feel)
const maxComets = 30; // Maximum number of comets allowed at once
let worldSize = 50000; // how far away comets can spawn
let gallery = {}; // Initialize as empty object
let radioSounds = {}; // Initialize radio sounds gallery
let giants, terrestrials, moons; // Planet type arrays
let radarCelestialHitboxes = []; // Hitboxes for radar click detection

// Solar system generation configuration
const SOLAR_SYSTEM_TYPE = 'hardcoded'; // 'random' or 'hardcoded' - change this to switch between generation types

// Global array to store all stars (for binary star systems)
let stars = [];

// Helper functions for orbital mechanics (used by both random and hardcoded generation)
function calculateOrbitalVelocity(planetX, planetY, planetMass, starX, starY, starMass) {
    const dx = planetX - starX;
    const dy = planetY - starY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Calculate orbital velocity using reduced mass for proper n-body dynamics
    const totalMass = starMass + planetMass;
    const orbitalSpeed = Math.sqrt(G * totalMass / dist);
    
    // Calculate velocities for both star and planet around their center of mass
    const starVelFactor = planetMass / totalMass;
    const planetVelFactor = starMass / totalMass;
    
    const perpX = -dy / dist;
    const perpY = dx / dist;
    
    return {
        planetVelX: perpX * orbitalSpeed * planetVelFactor,
        planetVelY: perpY * orbitalSpeed * planetVelFactor,
        starVelX: -perpX * orbitalSpeed * starVelFactor,
        starVelY: -perpY * orbitalSpeed * starVelFactor
    };
}

function createPlanetWithOrbit(x, y, radius, planetImage = null, parentStar = null) {
    const planet = new Planet(x, y, radius);
    
    // Set specific image if provided
    if (planetImage) {
        planet.Image = planetImage;
    }
    
    // Use the main star if no parent star specified
    const orbitStar = parentStar || star;
    
    // Calculate orbital velocity
    const velocity = calculateOrbitalVelocity(x, y, planet.mass, orbitStar.x, orbitStar.y, orbitStar.mass);
    
    // Add parent star's velocity to planet's orbital velocity (inheritance of motion)
    planet.velocityX = velocity.planetVelX + (orbitStar.velocityX || 0);
    planet.velocityY = velocity.planetVelY + (orbitStar.velocityY || 0);
    
    // Apply counter-velocity to star (conservation of momentum)
    orbitStar.velocityX += velocity.starVelX;
    orbitStar.velocityY += velocity.starVelY;
    
    return planet;
}

// Enhanced orbital velocity calculation that accounts for nearby planets
function calculateMultiBodyOrbitalVelocity(planetX, planetY, planetMass, parentStar, nearbyPlanets = []) {
    // Start with basic two-body orbital velocity
    const basicVelocity = calculateOrbitalVelocity(planetX, planetY, planetMass, parentStar.x, parentStar.y, parentStar.mass);
    
    // If no nearby planets, return basic calculation WITH parent star's velocity added
    if (nearbyPlanets.length === 0) {
        return {
            planetVelX: basicVelocity.planetVelX + (parentStar.velocityX || 0),
            planetVelY: basicVelocity.planetVelY + (parentStar.velocityY || 0),
            starVelX: basicVelocity.starVelX,
            starVelY: basicVelocity.starVelY
        };
    }
    
    // Calculate perturbations from nearby planets
    let totalPerturbationX = 0;
    let totalPerturbationY = 0;
    
    for (let nearbyPlanet of nearbyPlanets) {
        const dx = nearbyPlanet.x - planetX;
        const dy = nearbyPlanet.y - planetY;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);
        
        // Skip if planets are too close (avoid singularities)
        if (dist < (nearbyPlanet.radius || 50) * 3) {
            continue;
        }
        
        // Calculate gravitational influence
        const influence = G * nearbyPlanet.mass / distSq;
        const influenceX = (dx / dist) * influence;
        const influenceY = (dy / dist) * influence;
        
        // Weight influence by distance (closer planets have more effect)
        const distanceWeight = 1.0 / (1.0 + dist / 1000); // Normalize by 1000 distance units
        
        totalPerturbationX += influenceX * distanceWeight * 0.1; // Scale down perturbation
        totalPerturbationY += influenceY * distanceWeight * 0.1;
    }
    
    // Apply perturbations as velocity adjustments AND add parent star's velocity
    return {
        planetVelX: basicVelocity.planetVelX + totalPerturbationX + (parentStar.velocityX || 0),
        planetVelY: basicVelocity.planetVelY + totalPerturbationY + (parentStar.velocityY || 0),
        starVelX: basicVelocity.starVelX,
        starVelY: basicVelocity.starVelY
    };
}

function createMoonWithOrbit(planet, moonRadius, distance, angle, moonImage = null) {
    const moonX = planet.x + Math.cos(angle) * distance;
    const moonY = planet.y + Math.sin(angle) * distance;
    
    const moon = new Planet(moonX, moonY, moonRadius);
    
    // Set specific image if provided
    if (moonImage) {
        moon.Image = moonImage;
    }
    
    // Calculate proper orbital mechanics for planet-moon system
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
    
    // Calculate orbital speeds around barycenter
    const planetOrbitalSpeed = Math.sqrt(G * moonMass * moonMass / (totalMass * distance));
    const moonOrbitalSpeed = Math.sqrt(G * planetMass * planetMass / (totalMass * distance));
    
    // Calculate directions perpendicular to planet-moon line
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);
    
    // Set velocities: barycenter motion + orbital motion around barycenter
    planet.velocityX = barycenterVelX - perpX * planetOrbitalSpeed;
    planet.velocityY = barycenterVelY - perpY * planetOrbitalSpeed;
    
    moon.velocityX = barycenterVelX + perpX * moonOrbitalSpeed;
    moon.velocityY = barycenterVelY + perpY * moonOrbitalSpeed;
    
    return moon;
}

// Random solar system generation function
function generateRandomSolarSystem() {
    console.log("Generating random solar system...");
    
    // Initialize stars array with just the main star for random generation
    stars = [star];
    
    let minRadius = 50;
    let maxRadius = 200;
    let minMoonRadius = 30;
    let maxMoonRadius = 50;

    // Generate planets in orbital order from star outward
    const numPlanets = 5;
    const minOrbitDistance = star.radius + 3000; // Starting distance from star
    const baseOrbitSpacing = 6000; // Base spacing between orbits
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
        let x = star.x + Math.cos(angle) * orbitalDistance;
        let y = star.y + Math.sin(angle) * orbitalDistance;
        
        // Check if position conflicts with ship
        let shipDist = Math.hypot(x - ship.worldX, y - ship.worldY);
        if (shipDist < radius + Math.max(ship.width, ship.height) + 100) {
            // If too close to ship, offset the angle by 90 degrees
            const newAngle = angle + Math.PI / 2;
            x = star.x + Math.cos(newAngle) * orbitalDistance;
            y = star.y + Math.sin(newAngle) * orbitalDistance;
        }
        
        // Create the planet using helper function
        let newPlanet = createPlanetWithOrbit(x, y, radius);
        planets.push(newPlanet);
        
        const dist = Math.hypot(x - star.x, y - star.y);
        console.log(`Created planet ${i + 1} at orbital distance: ${dist.toFixed(0)} from star, planet mass: ${planetMass.toFixed(1)}, moon mass: ${moonMass.toFixed(1)}, total system mass: ${totalSystemMass.toFixed(1)}, influence: ${totalInfluence.toFixed(1)}, spacing: ${finalSpacing.toFixed(0)}`);
        
        // Update current orbit distance for next planet using the calculated spacing
        currentOrbitDistance = orbitalDistance + finalSpacing;
    }

    // Create moons for planets using pre-determined data
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
            
            // Create the moon using helper function
            let moon = createMoonWithOrbit(planet, moonRadius, moonDistance, moonAngle);
            
            // Add moon to planets array
            planets.push(moon);
            moonsCreated++;
            console.log(`Created planet-moon system: Planet mass=${planet.mass.toFixed(1)}, Moon mass=${moon.mass.toFixed(1)}`);
        }
    }
    
    console.log(`Random generation complete: ${planets.length - moonsCreated} planets and ${moonsCreated} moons total: ${planets.length} celestial bodies`);
}

// Hard-coded solar system generation function
function generateHardcodedSolarSystem() {
    console.log("Generating hard-coded solar system...");
    
    // Initialize stars array with the main star
    stars = [star];
    
    // === THE SOLACE SYSTEM ===
    // Sun: Radius 600 (already created in setupGame), center of the solar system at (0, 0)
    
    // Planet 1: Radius 85, 4000 distance to star, orangePlanet image
    let planet1 = createPlanetWithOrbit(star.x + 4000, star.y, 85, gallery.orangePlanet);
    planets.push(planet1);
    console.log("Created Planet 1: Troke at distance 4000 from Solace");
    
    // Planet 2: Radius 70, 12000 distance to star, tealGlade image (logo3), with moon
    // This planet accounts for Planet 1's gravitational influence
    const planet2 = new Planet(star.x + 12000, star.y, 70);
    if (gallery.tealGlade) {
        planet2.Image = gallery.tealGlade;
    }
    
    // Calculate enhanced orbital velocity accounting for Planet 1's influence
    const planet2Velocity = calculateMultiBodyOrbitalVelocity(
        planet2.x, 
        planet2.y, 
        planet2.mass, 
        star, 
        [planet1] // Planet 1 affects Planet 2's orbit
    );
    
    planet2.velocityX = planet2Velocity.planetVelX;
    planet2.velocityY = planet2Velocity.planetVelY;
    
    // Apply counter-velocity to star (conservation of momentum)
    star.velocityX += planet2Velocity.starVelX;
    star.velocityY += planet2Velocity.starVelY;
    
    planets.push(planet2);
    
    // Planet 2 Moon: radius 40, 310 moon distance, grayPlanet moon image
    // Calculate moon position at safe distance (planet radius + moon radius + specified distance)
    const moonDistance = planet2.radius + 40 + 200; // 70 + 40 + 200 = 310 total distance
    let moon2 = createMoonWithOrbit(planet2, 40, moonDistance, Math.PI/3, gallery.grayPlanet);
    planets.push(moon2);
    console.log("Created Planet 2: Teal Glade at distance 12000 from Solace with moon Roto");

    // Planet 3: Radius 60, 25000 distance to star, harshPlanet image
    // This planet accounts for Planet 1 and Planet 2's gravitational influence
    const planet3 = new Planet(star.x + 25000, star.y, 60);
    if (gallery.harshPlanet) {
        planet3.Image = gallery.harshPlanet;
    }
    
    // Calculate enhanced orbital velocity accounting for previous planets' influence
    const planet3Velocity = calculateMultiBodyOrbitalVelocity(
        planet3.x, 
        planet3.y, 
        planet3.mass, 
        star, 
        [planet1, planet2] // Both previous planets affect Planet 3's orbit
    );
    
    planet3.velocityX = planet3Velocity.planetVelX;
    planet3.velocityY = planet3Velocity.planetVelY;
    
    // Apply counter-velocity to star (conservation of momentum)
    star.velocityX += planet3Velocity.starVelX;
    star.velocityY += planet3Velocity.starVelY;
    
    planets.push(planet3);
    console.log("Created Planet 3: Poltan at distance 25000 from Solace (with multi-body perturbations)");

    // === BINARY STAR SYSTEM ===
    // Binary star: Radius 150, 70000 distance to main star
    const binaryStarX = star.x + 70000;
    const binaryStarY = star.y;
    let binaryStar = new Star(binaryStarX, binaryStarY, 150);
    
    // Calculate binary star orbital velocity around main star
    const binaryVelocity = calculateOrbitalVelocity(binaryStarX, binaryStarY, binaryStar.mass, star.x, star.y, star.mass);
    binaryStar.velocityX = binaryVelocity.planetVelX;
    binaryStar.velocityY = binaryVelocity.planetVelY;
    
    // Apply counter-velocity to main star
    star.velocityX += binaryVelocity.starVelX;
    star.velocityY += binaryVelocity.starVelY;
    
    // Add binary star to stars array
    stars.push(binaryStar);
    console.log("Created Binary Star: Nemesis at distance 70000 from Solace");
    
    // Binary Planet B1: radius 55, 3000 distance to binary star, methanePlanet image
    let planetB1 = createPlanetWithOrbit(binaryStarX + 3000, binaryStarY, 55, gallery.methanePlanet, binaryStar);
    planets.push(planetB1);
    console.log("Created Binary Planet B1: Chryse at distance 3000 from Nemesis");
    
    // Binary Planet B2: radius 50, 8000 distance to binary star, using redPlanet image
    // This planet accounts for Planet B1's gravitational influence
    const planetB2 = new Planet(binaryStarX + 8000, binaryStarY, 50);
    if (gallery.redPlanet) {
        planetB2.Image = gallery.redPlanet;
    }
    
    // Calculate enhanced orbital velocity accounting for Planet B1's influence
    const enhancedVelocity = calculateMultiBodyOrbitalVelocity(
        planetB2.x, 
        planetB2.y, 
        planetB2.mass, 
        binaryStar, 
        [planetB1] // Planet B1 affects Planet B2's orbit
    );
    
    planetB2.velocityX = enhancedVelocity.planetVelX;
    planetB2.velocityY = enhancedVelocity.planetVelY;
    
    // Apply counter-velocity to binary star (conservation of momentum)
    binaryStar.velocityX += enhancedVelocity.starVelX;
    binaryStar.velocityY += enhancedVelocity.starVelY;
    
    planets.push(planetB2);
    console.log("Created Binary Planet B2: Dead planet at distance 8000 from Nemesis (with B1 perturbation)");
    
    console.log(`Hard-coded generation complete: ${planets.length - 1} planets, 1 moon, and 1 binary star system`);
    console.log(`Total celestial bodies: ${planets.length} planets/moons + 2 stars = ${planets.length + 2} objects`);
}

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
    // Calculate offset based on ship position for parallax effect
    const offsetX = ship.worldX;
    const offsetY = ship.worldY;
    
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

// Save/Load system
let savedState = null;

// Currently selected planet
let selectedPlanet = null;
let autoRotationEnabled = false;

// Save/Load system functions
function saveGameState() {
    if (!gameStarted) {
        console.warn("Game not started yet, cannot save state!");
        return;
    }
    
    savedState = {
        // Save ship state
        ship: {
            worldX: ship.worldX,
            worldY: ship.worldY,
            velocityX: ship.velocityX,
            velocityY: ship.velocityY,
            angle: ship.angle,
            angularVelocity: ship.angularVelocity,
            health: ship.health,
            thrust: ship.thrust
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
        
        // Save all stars (main star and binary stars)
        stars: stars.map(starObj => ({
            x: starObj.x,
            y: starObj.y,
            velocityX: starObj.velocityX || 0,
            velocityY: starObj.velocityY || 0,
            radius: starObj.radius,
            mass: starObj.mass
        })),
        
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
        
        // Save timestamp
        timestamp: Date.now()
    };
    
    console.log("Game state saved successfully!");
    console.log(`Saved: ${savedState.stars.length} stars, ${savedState.planets.length} planets, ${savedState.comets.length} comets, ${savedState.globalIonParticles.length} ion particles, ${savedState.globalDustParticles.length} dust particles, ${savedState.globalThrusterParticles.length} thruster particles`);
    
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
    
    // Restore ship state
    ship.worldX = savedState.ship.worldX;
    ship.worldY = savedState.ship.worldY;
    ship.velocityX = savedState.ship.velocityX;
    ship.velocityY = savedState.ship.velocityY;
    ship.angle = savedState.ship.angle;
    ship.angularVelocity = savedState.ship.angularVelocity;
    ship.health = savedState.ship.health;
    ship.thrust = savedState.ship.thrust;
    
    // Restore all stars
    if (savedState.stars) {
        // New save format with stars array
        stars = savedState.stars.map(starData => {
            const starObj = new Star(starData.x, starData.y, starData.radius);
            starObj.velocityX = starData.velocityX || 0;
            starObj.velocityY = starData.velocityY || 0;
            starObj.mass = starData.mass;
            return starObj;
        });
        // Set the main star reference to the first star
        star = stars[0];
    } else {
        // Fallback for old save format with single star
        star.x = savedState.star.x;
        star.y = savedState.star.y;
        star.radius = savedState.star.radius;
        star.mass = savedState.star.mass;
        star.velocityX = 0;
        star.velocityY = 0;
        // Rebuild stars array with just the main star
        stars = [star];
    }
    
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
    
    console.log("Game state loaded successfully!");
    console.log(`Loaded: ${stars.length} stars, ${planets.length} planets, ${comets.length} comets, ${globalIonParticles.length} ion particles, ${globalDustParticles.length} dust particles, ${globalThrusterParticles.length} thruster particles`);
    
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
    // Initialize gallery objects after DOM is loaded
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
        yellowStar: document.getElementById("yellowStar"),
        redStar: document.getElementById("redStar"),
        tealGlade: document.getElementById("logo3")
    };
    
    // Initialize radio sounds gallery for the radio system
    radioSounds = {
        // Planet radio signals - each planet will have a unique audio signature
        trokeRadio: document.getElementById("trokeRadio"),
        homeRadio: document.getElementById("homeRadio"),
        poltanRadio: document.getElementById("poltanRadio"),
        chryseRadio: document.getElementById("chryseRadio"),
        dwarmRadio: document.getElementById("dwarmRadio"),

        // Star radio signals
        solaceRadio: document.getElementById("solaceRadio"),
        nemesisRadio: document.getElementById("nemesisRadio"),
        
        // Comet radio signals (can be randomized or generic)
        cometRadio: document.getElementById("cometRadio"),
        
        // Background static/noise
        radioStatic: document.getElementById("radioStatic")
    };
    
    // Initialize alternate view instance
    alternateView = new AlternateView();
    
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
    altCanvas = document.getElementById("2dview");
    altCtx = altCanvas.getContext("2d");

    // Initialize alternate view
    alternateView.initialize(altCanvas, altCtx);

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
    ship = new Ship();
    star = new Star(0, 0, 600); // Center star

    // Generate background stars
    generateBackgroundStars();

    // Generate solar system based on configuration
    if (SOLAR_SYSTEM_TYPE === 'random') {
        generateRandomSolarSystem();
    } else if (SOLAR_SYSTEM_TYPE === 'hardcoded') {
        generateHardcodedSolarSystem();
    } else {
        console.error("Invalid SOLAR_SYSTEM_TYPE:", SOLAR_SYSTEM_TYPE);
        // Fallback to random generation
        generateRandomSolarSystem();
    }

    // Check for existing save data
    checkForSavedData();

    // Setup title screen click handler
    document.getElementById("clickStart").addEventListener("click", startGame, { once: true });

    // Radar click handling
    hudCanvas.addEventListener("mousedown", function(e) {
        const rect = hudCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        for (let hitbox of radarCelestialHitboxes) {
            const dx = mouseX - hitbox.x;
            const dy = mouseY - hitbox.y;
            if (dx * dx + dy * dy <= hitbox.r * hitbox.r) {
                selectedPlanet = hitbox.object; // Set selected object (planet, comet, or star)
                autoRotationEnabled = true; // Enable auto-rotation for newly selected object
                console.log(`Clicked ${hitbox.type}:`, hitbox.object);
                break;
            }
        }
    });

    // Spawn a comet every 10 seconds if there are less than the maximum allowed
    setInterval(() => {
        if (comets.length < maxComets) {
            spawnComet();
        }
    }, 1000); // 1 second
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
        
        const audioToLoad = [
            radioSounds.trokeRadio,
            radioSounds.homeRadio,
            radioSounds.poltanRadio,
            radioSounds.chryseRadio,
            radioSounds.dwarmRadio,
            radioSounds.solaceRadio,
            radioSounds.nemesisRadio,
            radioSounds.cometRadio,
            radioSounds.radioStatic
        ].filter(audio => audio); // Filter out any undefined audio elements
        
        let loadedCount = 0;
        const totalAssets = imagesToLoad.length + audioToLoad.length;
        
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
        
        // Load audio files
        audioToLoad.forEach(audio => {
            if (audio.readyState >= 3) { // HAVE_FUTURE_DATA or better
                updateProgress();
            } else {
                audio.oncanplaythrough = updateProgress;
                audio.onerror = () => {
                    console.error("Failed to load audio:", audio.src);
                    updateProgress(); // Continue loading even if one audio fails
                };
                // Trigger loading
                audio.load();
            }
        });
    });
}

// The draw function updates the ship's position based on keyboard input with the .update() method.
function draw() {
    // Check if main game should be paused for planet exploration
    if (typeof isMainGamePaused === 'function' && isMainGamePaused()) {
        return; // Skip main game update when on planet
    }
    
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw background stars (before world transformation)
    drawBackgroundStars();

    // Move the world so the ship stays centered
    ctx.save();
    ctx.translate(
        canvas.width / 2 - ship.worldX,
        canvas.height / 2 - ship.worldY
    );

    // --- Gravity from all bodies to ship (one-way to prevent ship from affecting large body orbits) ---
    // Apply gravity from ALL stars
    for (let starBody of stars) {
        const dx = starBody.x - ship.worldX;
        const dy = starBody.y - ship.worldY;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);
        const minDist = starBody.radius; // Prevents infinite force near center

        if (dist > minDist) {
            const force = G * starBody.mass / distSq;
            ship.velocityX += (dx / dist) * force;
            ship.velocityY += (dy / dist) * force;
        }
    }

    // Apply gravity from planets to ship
    for (let planet of planets) {
        const dx = planet.x - ship.worldX;
        const dy = planet.y - ship.worldY;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);
        const minDist = planet.radius + ship.width / 2 + 5;

        if (dist > minDist) {
            const planetMass = planet.mass;
            const force = G * planetMass / distSq;
            // Only apply force to ship, not back to planet (one-way gravity)
            ship.velocityX += (dx / dist) * force;
            ship.velocityY += (dy / dist) * force;
        }
    }

    // --- Planet-planet gravity using Barnes-Hut algorithm for optimization ---
    // Include ALL stars in the n-body system for realistic gravitational dynamics
    const allBodies = [
        // Add all stars as gravitational bodies
        ...stars.map(starBody => ({
            x: starBody.x,
            y: starBody.y,
            mass: starBody.mass,
            radius: starBody.radius,
            object: starBody,
            type: 'star'
        })),
        // Add all planets
        ...planets.map(planet => ({
            x: planet.x,
            y: planet.y,
            mass: planet.mass,
            radius: planet.radius,
            object: planet,
            type: 'planet'
        }))
    ];
    
    const barnesHutForces = calculateBarnesHutForces(allBodies);
    
    // Apply forces and update positions using smaller timesteps for stability
    const numSubSteps = 4; // Subdivide physics timestep
    const subTimeStep = 1.0 / numSubSteps;
    
    for (let subStep = 0; subStep < numSubSteps; subStep++) {
        for (let i = 0; i < allBodies.length; i++) {
            const body = allBodies[i];
            const force = barnesHutForces[i];
            
            // Apply Barnes-Hut calculated forces
            body.object.velocityX += force.fx * subTimeStep;
            body.object.velocityY += force.fy * subTimeStep;
            
            // Update position with smaller timestep
            body.object.x += body.object.velocityX * subTimeStep;
            body.object.y += body.object.velocityY * subTimeStep;
        }
    }
    
    // Update planets (for trail recording and other planet-specific updates)
    for (let planet of planets) {
        planet.update();
    }
    
    // Show all planets
    for (let planet of planets) {
        planet.show();
    }

    // --- Comet physics ---
    // Calculate forces from all bodies to comets using Barnes-Hut (if there are comets)
    if (comets.length > 0) {
        // Include ALL stars and planets in the gravitational calculations for comets
        const allBodiesForComets = [
            // Add all stars
            ...stars.map(starBody => ({
                x: starBody.x,
                y: starBody.y,
                mass: starBody.mass,
                radius: starBody.radius
            })),
            // Add all planets
            ...planets.map(planet => ({
                x: planet.x,
                y: planet.y,
                mass: planet.mass,
                radius: planet.radius
            }))
        ];
        
        for (let comet of comets) {
            // Use Barnes-Hut approximation for all gravitational bodies
            const cometBody = {
                x: comet.x,
                y: comet.y,
                mass: 1, // Small mass for comet
                radius: comet.radius
            };
            
            // Build a temporary quad tree for this comet's force calculation
            let minX = Math.min(comet.x, ...allBodiesForComets.map(p => p.x));
            let minY = Math.min(comet.y, ...allBodiesForComets.map(p => p.y));
            let maxX = Math.max(comet.x, ...allBodiesForComets.map(p => p.x));
            let maxY = Math.max(comet.y, ...allBodiesForComets.map(p => p.y));
            
            const padding = 1000;
            const bounds = {
                x: minX - padding,
                y: minY - padding,
                width: maxX - minX + 2 * padding,
                height: maxY - minY + 2 * padding
            };
            
            const cometQuadTree = new QuadTree(bounds);
            for (let body of allBodiesForComets) {
                cometQuadTree.insert(body);
            }
            
            const cometForce = { fx: 0, fy: 0 };
            cometQuadTree.calculateForce(cometBody, cometForce);
            
            comet.velocityX += cometForce.fx;
            comet.velocityY += cometForce.fy;
            
            comet.update();
            comet.show();
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

    // --- Update and show wormholes ---
    wormholes = wormholes.filter(wormhole => {
        wormhole.life--;
        wormhole.pulsePhase += 0.1; // For pulsing effect
        
        // Update wormhole position based on velocity
        wormhole.x += wormhole.velocityX;
        wormhole.y += wormhole.velocityY;
        
        // Calculate shrinking effect based on remaining life
        const lifeRatio = wormhole.life / 600; // 600 is the initial life
        const currentRadius = wormhole.radius * Math.max(0.1, lifeRatio); // Shrink to 10% of original size minimum
        
        // Generate evaporation particles around the wormhole
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
        
        // Draw the wormhole only if it has a meaningful size
        if (currentRadius > 5) { // Only draw if radius is larger than 5 pixels
            ctx.save();
            ctx.translate(wormhole.x, wormhole.y);
            
            // Create pulsing effect
            const pulseScale = 1 + Math.sin(wormhole.pulsePhase) * 0.2;
            const alpha = Math.max(0.3, lifeRatio); // Fade out as it shrinks
            
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = "#00ffbb";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, currentRadius * pulseScale, 0, Math.PI * 2);
            ctx.stroke();
            
            // Inner glow effect (REPLACE THIS WITH MODIFIED BACKGROUND STARS)
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#00ffbb";
            ctx.beginPath();
            ctx.arc(0, 0, currentRadius * pulseScale * 0.5, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
        
        return wormhole.life > 0; // Keep wormhole if still alive
    });

    // Update and draw global particles (persist even after comets are destroyed)
    updateGlobalParticles();
    showGlobalParticles();

    // Draw ALL stars in the system
    for (let starBody of stars) {
        starBody.show();
    }

    ctx.restore();
    ship.show();

    // --- Draw pointer triangles to selected planet ---
    if (selectedPlanet) {
        // Calculate angle from ship to selected planet
        const dx = selectedPlanet.x - ship.worldX;
        const dy = selectedPlanet.y - ship.worldY;
        const angle = Math.atan2(dy, dx);

        // Distance from ship center to draw the triangle (just outside the ship)
        const pointerDistance = ship.height / 2 + 18;

        // Calculate triangle center position
        const pointerX = ship.x + Math.cos(angle) * pointerDistance;
        const pointerY = ship.y + Math.sin(angle) * pointerDistance;

        // Draw the triangle
        ctx.save();
        ctx.translate(pointerX, pointerY);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(16, 0);
        ctx.lineTo(0, 8);
        ctx.closePath();
        ctx.fillStyle = "#0ff";
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.restore();

        // Calculate distance to planet
        const distanceToPlanet = Math.hypot(selectedPlanet.x - ship.worldX, selectedPlanet.y - ship.worldY) - selectedPlanet.radius - ship.width / 2;

        // Draw distance text
        ctx.save();
        ctx.font = "14px Arial";
        ctx.fillStyle = "#0ff";
        ctx.globalAlpha = 0.9;
        ctx.textAlign = "center";
        ctx.fillText(distanceToPlanet.toFixed(0) + "p", pointerX, pointerY - 20);
        ctx.restore();

        // Calculate relative velocity to ship
        const relVelX = selectedPlanet.velocityX - ship.velocityX;
        const relVelY = selectedPlanet.velocityY - ship.velocityY;
        const velAngle = Math.atan2(relVelY, relVelX);

        // Place triangle at the same distance from the ship
        const velPointerDistance = ship.height / 2 + 32;
        const velPointerX = ship.x + Math.cos(velAngle) * velPointerDistance;
        const velPointerY = ship.y + Math.sin(velAngle) * velPointerDistance;

        // Draw velocity triangle
        ctx.save();
        ctx.translate(velPointerX, velPointerY);
        ctx.rotate(velAngle);

        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(16, 0);
        ctx.lineTo(0, 8);
        ctx.closePath();
        ctx.fillStyle = "#fff"; // Different colour for velocity direction
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.restore();

        // Calculate relative velocity magnitude
        const relVelMag = Math.hypot(relVelX, relVelY);

        // Draw relative velocity text
        ctx.save();
        ctx.font = "14px Arial";
        ctx.fillStyle = "#fff";
        ctx.globalAlpha = 0.9;
        ctx.textAlign = "center";
        ctx.fillText(relVelMag.toFixed(2) + " p/f", velPointerX, velPointerY - 20);
        ctx.restore();
    }

    // Draw HUD
    hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    hudCtx.fillStyle = "#003080";
    hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);

    hudCtx.fillStyle = "#bbbbff";
    hudCtx.font = "16px Arial";
    hudCtx.fillText("Ship Health: " + ship.health, 20, 20);
    const velocity = Math.sqrt(ship.velocityX * ship.velocityX + ship.velocityY * ship.velocityY);
    hudCtx.fillText("Velocity: " + velocity.toFixed(2), 20, 40);
    hudCtx.fillText("Thrust Output: " + ship.thrust.toFixed(2), 20, 60);
    hudCtx.fillText("Fuel: " + ship.fuel.toFixed(2), 20, 80);
    hudCtx.fillText("Ship Angle: " + (ship.angle * 180 / Math.PI).toFixed(2) + "°", 20, 100);
    
    // Save/Load instructions
    hudCtx.fillStyle = "#8080ff";
    hudCtx.font = "16px Arial";
    hudCtx.fillText("F5: Save", 20, hudCanvas.height - 130);
    hudCtx.fillText("F9: Load", 20, hudCanvas.height - 110);
    
    // Planet Trails status
    hudCtx.fillStyle = showTrails ? "#bbbbff" : "#8080ff";
    hudCtx.fillText(`T: Planet Trails (${showTrails ? "ON" : "OFF"})`, 20, hudCanvas.height - 90);
    
    // Ship Path status
    hudCtx.fillStyle = showShipTrajectory ? "#bbbbff" : "#8080ff";
    hudCtx.fillText(`P: Ship Path (${showShipTrajectory ? "ON" : "OFF"})`, 20, hudCanvas.height - 70);
    
    // Collision Prediction status
    hudCtx.fillStyle = showCollisionPrediction ? "#bbbbff" : "#8080ff";
    hudCtx.fillText(`C: Predict Collisions (${showCollisionPrediction ? "ON" : "OFF"})`, 20, hudCanvas.height - 50);

    // Dynamic landing status
    if (typeof checkLandingOpportunity === 'function') {
        const landablePlanet = checkLandingOpportunity(ship, planets);
        if (landablePlanet) {
            hudCtx.fillStyle = "#bbbbff"; // Bright when can land
            hudCtx.fillText("L: LAND NOW!", 20, hudCanvas.height - 30);
        } else {
            hudCtx.fillStyle = "#8080ff"; // Dim when can't land
            hudCtx.fillText("L: Land (when near)", 20, hudCanvas.height - 30);
        }
    } else {
        hudCtx.fillStyle = "#8080ff";
        hudCtx.fillText("L: Land (when near)", 20, hudCanvas.height - 30);
    }
    hudCtx.fillStyle = "#00ffbb";
    hudCtx.fillText("O: Wormhole", 20, hudCanvas.height - 10);
    hudCtx.fillStyle = "#8080ff";
    hudCtx.fillText("H: Horizon View", 180, hudCanvas.height - 10);
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
    if (ship.health <= 0) {
        ship.thrust = 0; // Disable thrust if health is zero
        ship.angularDamping = 1; // Disable angular damping to simulate loss of control
        ship.rotationSpeedMultiplier = 0.1; // Very slow rotation to simulate loss of control
        hudCtx.fillStyle = "#ff0000";
        hudCtx.font = "18px Arial";
        hudCtx.fillText("Warning: Ship Destroyed", 20, 160);
    } else if (ship.health <= 50) {
        ship.thrust = 0.05; // Reduce thrust if health is low
        hudCtx.fillStyle = "#ff0000";
        hudCtx.font = "18px Arial";
        hudCtx.fillText("Warning: Critical Damage", 20, 160);
    } else if (ship.health <= 70) {
        ship.thrust = 0.1; // Further reduce thrust if health is very low
        hudCtx.fillStyle = "#ffff00";
        hudCtx.font = "18px Arial";
        hudCtx.fillText("Warning: Ship is Damaged", 20, 160);
    }
    if (ship.fuel <= 0) {
        hudCtx.fillStyle = "#ff0000";
        hudCtx.font = "18px Arial";
        hudCtx.fillText("Warning: Fuel Empty", 20, 200);
    } else if (ship.fuel <= 20) {
        hudCtx.fillStyle = "#ffff00";
        hudCtx.font = "18px Arial";
        hudCtx.fillText("Warning: Low Fuel", 20, 200);
    }

    // Ship controls
    // Check for manual rotation input first
    const manualRotationInput = keys["a"] || keys["ArrowLeft"] || keys["d"] || keys["ArrowRight"];
    
    if (manualRotationInput) {
        // Manual input detected - disable auto-rotation permanently until new planet selected
        autoRotationEnabled = false;
        
        // Apply manual rotation control
        if (keys["a"] || keys["ArrowLeft"]) ship.angularVelocity -= ship.rotationSpeed * ship.rotationSpeedMultiplier;
        if (keys["d"] || keys["ArrowRight"]) ship.angularVelocity += ship.rotationSpeed * ship.rotationSpeedMultiplier;
    } else if (selectedPlanet && autoRotationEnabled) {
        // Auto-rotation to selected planet (only when enabled and no manual input)
        // Calculate angle to selected planet
        const dx = selectedPlanet.x - ship.worldX;
        const dy = selectedPlanet.y - ship.worldY;
        const targetAngle = Math.atan2(dx, -dy); // Note: inverted Y for canvas coordinates
        
        // Calculate shortest angular difference
        let angleDiff = targetAngle - ship.angle;
        
        // Normalize angle difference to [-π, π]
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        // Apply smooth rotation towards target or lock when close enough
        const rotationThreshold = 0.05; // Lock angle when this close (about 3 degrees)
        if (Math.abs(angleDiff) > rotationThreshold) {
            // Apply smooth rotation when far from target
            const rotationForce = ship.rotationSpeed * ship.rotationSpeedMultiplier * 0.7; // Slightly gentler than manual
            if (angleDiff > 0) {
                ship.angularVelocity += rotationForce;
            } else {
                ship.angularVelocity -= rotationForce;
            }
        } else {
            // Lock to target angle when close enough for precise targeting
            ship.angle = targetAngle;
            ship.angularVelocity = 0; // Stop any residual rotation
        }
    }
    if (keys["w"] || keys["ArrowUp"]) {
        if (ship.fuel <= 0) {
            ship.fuel = 0;
            // No thrust if out of fuel
        } else {
            ship.velocityX += Math.sin(ship.angle) * ship.thrust;
            ship.velocityY -= Math.cos(ship.angle) * ship.thrust;
            ship.fuel -= ship.thrust * 0.1;   // Deplete fuel while thrust is applied
            
            // Generate thruster particles when thrusting forward
            if (Math.random() < 0.7) { // 70% chance to generate particle each frame
                // Calculate position behind the ship (opposite to thrust direction)
                const thrusterOffsetDistance = ship.height / 2 + 5; // Behind the ship
                const thrusterX = ship.worldX - Math.sin(ship.angle) * thrusterOffsetDistance;
                const thrusterY = ship.worldY + Math.cos(ship.angle) * thrusterOffsetDistance;
                
                // Direction opposite to ship's forward direction
                const thrusterDirection = ship.angle + Math.PI;
                
                const thrusterParticle = new ThrusterParticle(
                    thrusterX + (Math.random() - 0.5) * 8, // Add some randomness
                    thrusterY + (Math.random() - 0.5) * 8,
                    thrusterDirection,
                    ship.angle,
                    ship.velocityX, // Pass ship's velocity
                    ship.velocityY
                );
                globalThrusterParticles.push(thrusterParticle);
            }
        }
    }
    if (keys["s"] || keys["ArrowDown"]) {
        if (ship.fuel <= 0) {
            ship.fuel = 0;
            // No thrust if out of fuel
        } else {
            ship.velocityX -= Math.sin(ship.angle) * ship.thrust;
            ship.velocityY += Math.cos(ship.angle) * ship.thrust;
            ship.fuel -= ship.thrust * 0.1; // Deplete fuel while thrust is applied
            
            // Generate thruster particles when thrusting backward
            if (Math.random() < 0.5) { // 50% chance (reverse thrust is weaker)
                // Calculate position in front of the ship
                const thrusterOffsetDistance = ship.height / 2 + 5;
                const thrusterX = ship.worldX - Math.sin(ship.angle) * thrusterOffsetDistance;
                const thrusterY = ship.worldY - Math.cos(ship.angle) * thrusterOffsetDistance;
                
                // Direction same as ship's forward direction (reverse thrust)
                const thrusterDirection = ship.angle;
                
                const thrusterParticle = new ThrusterParticle(
                    thrusterX + (Math.random() - 0.5) * 8,
                    thrusterY + (Math.random() - 0.5) * 8,
                    thrusterDirection,
                    ship.angle,
                    ship.velocityX, // Pass ship's velocity
                    ship.velocityY
                );
                // Make reverse thrust particles slightly smaller and less intense
                thrusterParticle.size *= 0.7;
                thrusterParticle.intensity *= 0.6;
                globalThrusterParticles.push(thrusterParticle);
            }
        }
    }

    // Landing check - L key to land on nearby planets
    if (keys["l"] && typeof checkLandingOpportunity === 'function') {
        const landablePlanet = checkLandingOpportunity(ship, planets);
        if (landablePlanet && typeof attemptPlanetLanding === 'function') {
            attemptPlanetLanding(landablePlanet, ship);
            console.log("Attempting landing on planet:", landablePlanet);
        }
    }

    // Set ship image based on angle
    if (ship.angle >= -Math.PI / 4 && ship.angle < Math.PI / 4) {
        ship.Image = gallery.shipNorth; // Facing North
    } else if (ship.angle >= Math.PI / 4 && ship.angle < 3 * Math.PI / 4) {
        ship.Image = gallery.shipEast; // Facing East
    } else if (ship.angle >= 3 * Math.PI / 4 || ship.angle < -3 * Math.PI / 4) {
        ship.Image = gallery.shipSouth; // Facing South
    } else if (ship.angle >= -3 * Math.PI / 4 && ship.angle < -Math.PI / 4) {
        ship.Image = gallery.shipWest; // Facing West
    }

    // Update ship position
    ship.update();

    // Draw radar background
    hudCtx.save();
    hudCtx.strokeStyle = "#fff";
    hudCtx.lineWidth = 2;
    hudCtx.strokeRect(radarX, radarY, radarSize, radarSize);
    hudCtx.fillStyle = "#111";
    hudCtx.fillRect(radarX, radarY, radarSize, radarSize);

    // Before drawing planets on radar, clear hitboxes
    radarCelestialHitboxes = [];

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
                    const dx = trailPoint.x - ship.worldX;
                    const dy = trailPoint.y - ship.worldY;
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
                    const dx = trailPoint.x - ship.worldX;
                    const dy = trailPoint.y - ship.worldY;
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
        // Draw predicted orbital paths for planets with collision detection
        if (showCollisionPrediction) {
            // Only check for collisions once per second to improve performance and accuracy
            const currentTime = Date.now();
            if (currentTime - lastCollisionCheck > collisionCheckInterval) {
                cachedPlanetPaths = predictAllPlanetOrbits(planets, stars, radarSteps, timeStep);
                const collisionData = detectPlanetCollisions(cachedPlanetPaths, planets);
                globalCollisionData = collisionData; // Store globally for HUD display
                lastCollisionCheck = currentTime;
                console.log(`Collision check performed: ${collisionData.length} collision(s) detected`);
            }
            
            // Use cached planet paths if available, otherwise calculate fresh ones
            const planetPaths = cachedPlanetPaths.length > 0 ? cachedPlanetPaths : predictAllPlanetOrbits(planets, stars, radarSteps, timeStep);
            
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
                    
                    const dx = path[i].x - ship.worldX;
                    const dy = path[i].y - ship.worldY;
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
                const dx = collision.x - ship.worldX;
                const dy = collision.y - ship.worldY;
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
            for (let planet of planets) {
                const path = predictOrbit(planet, planets, stars, radarSteps, timeStep);
                hudCtx.save();
                hudCtx.strokeStyle = "#fff";
                hudCtx.globalAlpha = 0.9;
                hudCtx.lineWidth = 1;
                hudCtx.beginPath();
                for (let i = 0; i < path.length; i++) {
                    const dx = path[i].x - ship.worldX;
                    const dy = path[i].y - ship.worldY;
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

    // Draw predicted trajectory for ship
    if (showShipTrajectory) {
        // Only calculate ship path once per second to improve performance
        const currentTime = Date.now();
        if (currentTime - lastShipPathCheck > shipPathCheckInterval) {
            cachedShipPath = predictShipTrajectory(ship, planets, stars, radarSteps, timeStep);
            lastShipPathCheck = currentTime;
        }
        
        // Use cached ship path
        const shipPath = cachedShipPath;
        
        if (shipPath && shipPath.length > 0) {
            hudCtx.save();
            hudCtx.strokeStyle = "#88f"; // Light blue color for ship trajectory
            hudCtx.globalAlpha = 0.8;
            hudCtx.lineWidth = 2;
            hudCtx.beginPath();
            
            for (let i = 0; i < shipPath.length; i++) {
                const dx = shipPath[i].x - ship.worldX;
                const dy = shipPath[i].y - ship.worldY;
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
            hudCtx.stroke();
            hudCtx.restore();
        }
    } else {
        // Clear cached ship path when disabled
        cachedShipPath = [];
    }

    // Draw planets on radar
    for (let planet of planets) {
        // Offset from ship
        const dx = planet.x - ship.worldX;
        const dy = planet.y - ship.worldY;
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
            hudCtx.fillStyle = "#0f0";
            hudCtx.fill();

            const hitboxBuffer = 5; // Buffer for hitbox detection

            // Store hitbox for click detection
            radarCelestialHitboxes.push({
                object: planet,
                type: 'planet',
                x: rx,
                y: ry,
                r: r + hitboxBuffer
            });
        }
    }

    // Draw ALL stars on radar
    for (let starBody of stars) {
        const starRx = radarX + radarSize / 2 + (starBody.x - ship.worldX) * radarScale;
        const starRy = radarY + radarSize / 2 + (starBody.y - ship.worldY) * radarScale;
        const starR = Math.max(2, starBody.radius * radarScale);
        if (
            starRx >= radarX && starRx <= radarX + radarSize &&
            starRy >= radarY && starRy <= radarY + radarSize
        ) {
            hudCtx.beginPath();
            hudCtx.arc(starRx, starRy, starR, 0, Math.PI * 2);
            hudCtx.fillStyle = "#ff0";
            hudCtx.fill();
            
            const hitboxBuffer = 5; // Buffer for hitbox detection
            
            // Store hitbox for click detection
            radarCelestialHitboxes.push({
                object: starBody,
                type: 'star',
                x: starRx,
                y: starRy,
                r: starR + hitboxBuffer
            });
        }
    }

    // Draw comets on radar
    for (let comet of comets) {
        const dx = comet.x - ship.worldX;
        const dy = comet.y - ship.worldY;
        const rx = radarX + radarSize / 2 + dx * radarScale;
        const ry = radarY + radarSize / 2 + dy * radarScale;
        const r = Math.max(2, comet.radius * radarScale);
        if (
            rx >= radarX && rx <= radarX + radarSize &&
            ry >= radarY && ry <= radarY + radarSize
        ) {
            hudCtx.beginPath();
            hudCtx.arc(rx, ry, r, 0, Math.PI * 2);
            hudCtx.fillStyle = "#fff"; // White for comets
            hudCtx.fill();
            
            const hitboxBuffer = 5; // Buffer for hitbox detection
            
            // Store hitbox for click detection
            radarCelestialHitboxes.push({
                object: comet,
                type: 'comet',
                x: rx,
                y: ry,
                r: r + hitboxBuffer
            });
        }
    }
    
    // Draw ship indicator (triangle) at center of radar, rotated to match ship.angle
    hudCtx.save();
    hudCtx.translate(radarX + radarSize / 2, radarY + radarSize / 2);
    hudCtx.rotate(ship.angle);

    // Draw a triangle pointing in the ship's forward direction
    hudCtx.beginPath();
    hudCtx.moveTo(0, -10);   // Tip of the triangle
    hudCtx.lineTo(7, 8);     // Bottom right
    hudCtx.lineTo(-7, 8);    // Bottom left
    hudCtx.closePath();
    hudCtx.fillStyle = "#bbf"; // Light blue for ship indicator
    hudCtx.fill();

    hudCtx.restore();

    // --- Ship/planet collision response ---
    for (let planet of planets) {
        if (checkCollision(ship, planet)) {
            // Calculate the normal vector from planet to ship
            const dx = ship.worldX - planet.x;
            const dy = ship.worldY - planet.y;
            const dist = Math.hypot(dx, dy);
            if (dist === 0) continue; // Prevent division by zero

            // Normalize the normal vector
            const nx = dx / dist;
            const ny = dy / dist;

            // --- Relative velocity ---
            const relVelX = ship.velocityX - planet.velocityX;
            const relVelY = ship.velocityY - planet.velocityY;

            // Calculate the velocity dot normal (relative)
            const dot = relVelX * nx + relVelY * ny;

            // Health loss logic
            const impactVelocity = Math.abs(dot);
            const damageThreshold = 7.5; // Tune as needed
            let tookDamage = false;
            let wasDestroyed = false;
            
            if (impactVelocity > damageThreshold) {
                ship.health -= 10;
                tookDamage = true;
            }
            const fatalThreshold = 20; // Tune as needed
            if (impactVelocity > fatalThreshold) {
                ship.health = 0; // Ship is destroyed
                wasDestroyed = true;
                ship.velocityX = 0; // Stop the ship
                ship.velocityY = 0; // Stop the ship
            }

            // Reflect the relative velocity and apply damping
            const bounce = 0.3;
            const reflectedRelVelX = relVelX - 2 * dot * nx;
            const reflectedRelVelY = relVelY - 2 * dot * ny;

            // New ship velocity = planet velocity + reflected relative velocity (with bounce)
            ship.velocityX = planet.velocityX + reflectedRelVelX * bounce;
            ship.velocityY = planet.velocityY + reflectedRelVelY * bounce;

            // Move ship just outside the planet to prevent sticking
            ship.worldX = planet.x + nx * ((ship.width / 2) + planet.radius + 1);
            ship.worldY = planet.y + ny * ((ship.width / 2) + planet.radius + 1);
            
            // Create explosion effects after collision response is complete
            if (wasDestroyed) {
                // Create larger explosion effect when ship is destroyed
                createExplosion(ship.worldX, ship.worldY, ship.velocityX, ship.velocityY);
                createExplosion(ship.worldX, ship.worldY, ship.velocityX, ship.velocityY); // Double explosion for destruction
            } else if (tookDamage) {
                // Create explosion effect when ship takes damage
                createExplosion(ship.worldX, ship.worldY, ship.velocityX, ship.velocityY);
            }
        }
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
                mergedPlanet.velocityX = (planetA.velocityX + planetB.velocityX) / 2;
                mergedPlanet.velocityY = (planetA.velocityY + planetB.velocityY) / 2;

                // Replace the two planets with the merged one
                planets.splice(j, 1); // Remove planetB first
                planets.splice(i, 1, mergedPlanet); // Replace planetA with mergedPlanet
                break; // Restart the loop since the array has changed
            }
        }
    }
    
    // Update and show alternate view only when visible
    if (alternateView && altCtx) {
        const altViewPanel = document.getElementById("altViewPanel");
        const isVisible = altViewPanel && altViewPanel.style.display !== 'none';
        
        if (isVisible) {
            alternateView.update();
            alternateView.show();
        }
    }
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
class Ship {
    // The constructor initializes the ship's properties.
    constructor() {
        this.width = 32;
        this.height = 64;
        this.x = canvas.width / 2;   // Always center of canvas
        this.y = canvas.height / 2;  // Always center of canvas
        this.worldX = 0;             // Ship's position in the world
        this.worldY = 350;           // Ship's position in the world (account for star)
        this.velocityX = 0;
        this.velocityY = 0;
        this.angle = 0;
        this.angularVelocity = 0;
        this.angularDamping = 0.8;  // value can be adjusted (0 to 1), lower value = more damping
        this.rotationSpeed = 0.05;
        this.rotationSpeedMultiplier = 0.5; // Adjust for feel
        this.thrust = 0.2;
        this.prevWorldX = this.worldX;
        this.prevWorldY = this.worldY;
        this.health = 100;
        this.fuel = 100;
        this.Image = gallery.shipNorth; // Default image facing North
    }
    // The update method updates the ship's position based on its velocity.
    update() {
        // Store previous world position for collision response
        this.prevWorldX = this.worldX;
        this.prevWorldY = this.worldY;

        // Apply velocity to world position
        this.worldX += this.velocityX;
        this.worldY += this.velocityY;

        // Apply angular velocity to angle
        this.angle += this.angularVelocity;
        // Wrap angle to [-PI, PI]
        if (this.angle > Math.PI) this.angle -= 2 * Math.PI;
        if (this.angle < -Math.PI) this.angle += 2 * Math.PI;
        // Apply damping to angular velocity
        this.angularVelocity *= this.angularDamping;
    }
    // The show method draws the ship on the canvas.
    show() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.drawImage(this.Image, -this.width / 2, -this.height / 2, this.width, this.height);
        ctx.restore();
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
        this.velocityX = 0; // Star can now move
        this.velocityY = 0; // Star can now move
    }
    show() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        const glowRadius = this.radius * 5;
        
        if (this.radius <= 150) {
            // Create gradient with local coordinates (0,0 since we translated)
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
            gradient.addColorStop(0, "#fa8");
            gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw the star itself
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(gallery.redStar, -this.radius, -this.radius, this.radius * 2, this.radius * 2);
        } else {
            // Create gradient with local coordinates (0,0 since we translated)
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
            gradient.addColorStop(0, "#ffc");
            gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw the star itself
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(gallery.yellowStar, -this.radius, -this.radius, this.radius * 2, this.radius * 2);
        }
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
        const distanceToShip = Math.hypot(ship.worldX - this.x, ship.worldY - this.y);
        
        // Only generate particles if the comet is within 3000 pixels of the ship
        if (distanceToShip > 3000) {
            return; // Skip particle generation if too far from ship
        }
        
        // Generate ion tail particles (repelled directly away from star)
        if (distanceToStar < 20000) { // Only generate tails when close enough to star
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
        if (distanceToStar < 30000) {
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
        const maxDistance = 200000; // Maximum distance from star to keep comet
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
        this.intensity = Math.max(0.3, 1 - (distanceToStar / 20000));
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
        this.intensity = Math.max(0.2, 1 - (distanceToStar / 30000));
        
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
let showShipTrajectory = true; // Control for ship trajectory prediction
let globalCollisionData = []; // Store detected planet collisions for HUD display
let showCollisionPrediction = true; // Control for planet collision prediction
let lastCollisionCheck = 0; // Timestamp of last collision detection
let collisionCheckInterval = 100; // Check collisions every 100ms (0.1 second)
let cachedPlanetPaths = []; // Cache planet paths to avoid recalculating every frame
let lastShipPathCheck = 0; // Timestamp of last ship path calculation
let shipPathCheckInterval = 100; // Check ship path every 100ms (0.1 second)
let cachedShipPath = []; // Cache ship path to avoid recalculating every frame
let requestWormhole = false; // Flag to request wormhole spawn
let wormholes = []; // Array to store active wormholes

// You can add keyboard shortcuts to toggle trails
window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === 't' && gameStarted) {
        showTrails = !showTrails;
        console.log("Planet trails (t):", showTrails ? "ON" : "OFF");
    }
    if (e.key.toLowerCase() === 'p' && gameStarted) {
        showShipTrajectory = !showShipTrajectory;
        console.log("Ship trajectory prediction (p):", showShipTrajectory ? "ON" : "OFF");
    }
    if (e.key.toLowerCase() === 'c' && gameStarted) {
        showCollisionPrediction = !showCollisionPrediction;
        console.log("Collision prediction (c):", showCollisionPrediction ? "ON" : "OFF");
    }
    // Spawn wormhole with 'o' key
    if (e.key.toLowerCase() === 'o' && gameStarted) {
        requestWormhole = true;
        console.log("Wormhole spawn requested (o)");
    }
});

// Spawn Comets
function spawnComet() {
    // Randomly choose which star to orbit (70% main star, 30% binary star)
    const orbitMainStar = Math.random() < 0.7;
    const targetStar = orbitMainStar ? stars[0] : (stars.length > 1 ? stars[1] : stars[0]);
    
    // Calculate a random angle
    const angle = Math.random() * Math.PI * 2;
    
    let cometDist;
    let minCometDistance;
    let maxCometDistance;
    
    if (orbitMainStar) {
        // Bias comet spawning beyond the third planet (at distance 25000) for main star
        const planet3Distance = 25000;
        minCometDistance = planet3Distance - 5000; // Start 5000 units before Planet 3
        maxCometDistance = 40000; // Don't go too far to avoid binary star region
    } else {
        // For binary star, spawn comets in its local region
        const binaryPlanetDistance = 8000; // Binary Planet B2 distance
        minCometDistance = binaryPlanetDistance - 3000; // Start before Binary Planet B2
        maxCometDistance = 15000; // Local region around binary star
    }
    
    // Create biased distribution favoring outer regions
    const randomFactor = Math.random();
    const biasedFactor = Math.pow(randomFactor, 0.5); // Square root for outward bias
    cometDist = minCometDistance + (maxCometDistance - minCometDistance) * biasedFactor;

    // Calculate comet's world position relative to chosen star
    const cometX = targetStar.x + Math.cos(angle) * cometDist;
    const cometY = targetStar.y + Math.sin(angle) * cometDist;

    // Set comet radius (adjust as needed)
    const cometRadius = Math.floor(Math.random() * 15) + 5; // Random radius between 5 and 20

    // Create the comet
    let comet = new Comet(cometX, cometY, cometRadius);

    // Calculate the vector from chosen star to comet
    const dx = cometX - targetStar.x;
    const dy = cometY - targetStar.y;
    const actualDistance = Math.sqrt(dx * dx + dy * dy);

    // Calculate orbital speed around the chosen star
    const orbitalSpeed = Math.sqrt(G * targetStar.mass / actualDistance);

    // Randomize the speed factor for varied orbital characteristics
    const speedFactor = 0.1 + Math.random() * 0.4; // Range: 0.1 to 0.5

    // Perpendicular direction (tangent to the orbit around chosen star)
    const perpX = -dy / actualDistance;
    const perpY = dx / actualDistance;

    // Set the comet's velocity (orbital motion around chosen star)
    const cometOrbitalVelX = perpX * orbitalSpeed * speedFactor;
    const cometOrbitalVelY = perpY * orbitalSpeed * speedFactor;
    
    // Add the star's velocity to the comet's orbital velocity (inheritance of motion)
    comet.velocityX = cometOrbitalVelX + (targetStar.velocityX || 0);
    comet.velocityY = cometOrbitalVelY + (targetStar.velocityY || 0);

    comets.push(comet);
    const starName = orbitMainStar ? "Solace (main star)" : "Nemesis (binary star)";
    console.log(`Spawned comet around ${starName} at distance ${actualDistance.toFixed(0)} from star`);
}

// Collision check function
function checkCollision(ship, planet) {
    const dx = ship.worldX - planet.x;
    const dy = ship.worldY - planet.y;
    const distance = Math.hypot(dx, dy);
    const minDist = (ship.width / 2) + planet.radius;
    return distance < minDist;
}

function checkBodyCollision(body1, body2) {
    const dx = body1.x - body2.x;
    const dy = body1.y - body2.y;
    const distance = Math.hypot(dx, dy);
    const minDist = (body1.radius + body2.radius);
    return distance < minDist;
}

function predictShipTrajectory(ship, planets, allStars, steps = radarSteps, timeStep = 1) {
    const path = [];
    
    // Create simulation copy of ship
    const simShip = {
        x: ship.worldX,
        y: ship.worldY,
        vx: ship.velocityX,
        vy: ship.velocityY
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
    
    // Create copies of all star states for simulation
    const simulatedStars = allStars.map(starBody => ({
        x: starBody.x,
        y: starBody.y,
        vx: starBody.velocityX,
        vy: starBody.velocityY,
        mass: starBody.mass,
        radius: starBody.radius
    }));
    
    for (let step = 0; step < steps; step++) {
        // Calculate gravitational forces on ship
        let fx = 0, fy = 0;
        
        // Gravity from ALL stars
        for (let starBody of simulatedStars) {
            const dxStar = starBody.x - simShip.x;
            const dyStar = starBody.y - simShip.y;
            const distSqStar = dxStar * dxStar + dyStar * dyStar + 1e-6;
            const distStar = Math.sqrt(distSqStar);
            const starForce = G * starBody.mass / distSqStar;
            fx += (dxStar / distStar) * starForce;
            fy += (dyStar / distStar) * starForce;
        }
        
        // Gravity from planets
        for (let i = 0; i < simulatedPlanets.length; i++) {
            const planet = simulatedPlanets[i];
            const dx = planet.x - simShip.x;
            const dy = planet.y - simShip.y;
            const distSq = dx * dx + dy * dy + 1e-6;
            const dist = Math.sqrt(distSq);
            const minDist = planet.radius + 20; // Ship size approximation
            
            if (dist > minDist) {
                const force = G * planet.mass / distSq;
                fx += (dx / dist) * force;
                fy += (dy / dist) * force;
            }
        }
        
        // Update ship velocity and position
        simShip.vx += fx * timeStep;
        simShip.vy += fy * timeStep;
        simShip.x += simShip.vx * timeStep;
        simShip.y += simShip.vy * timeStep;
        
        // Update planets for more accurate trajectory prediction using Barnes-Hut
        const planetBodies = simulatedPlanets.map(planet => ({
            x: planet.x,
            y: planet.y,
            mass: planet.mass,
            radius: planet.radius
        }));
        
        const planetForces = calculateBarnesHutForces(planetBodies);
        
        // Update planet positions
        for (let i = 0; i < simulatedPlanets.length; i++) {
            const planet = simulatedPlanets[i];
            const force = planetForces[i];
            
            // Add gravity from ALL stars to Barnes-Hut calculated forces
            let starForceX = 0, starForceY = 0;
            for (let starBody of simulatedStars) {
                const dxStar = starBody.x - planet.x;
                const dyStar = starBody.y - planet.y;
                const distSqStar = dxStar * dxStar + dyStar * dyStar + 1e-6;
                const distStar = Math.sqrt(distSqStar);
                const starForce = G * starBody.mass / distSqStar;
                starForceX += (dxStar / distStar) * starForce;
                starForceY += (dyStar / distStar) * starForce;
            }
            
            planet.vx += (force.fx + starForceX) * timeStep;
            planet.vy += (force.fy + starForceY) * timeStep;
            planet.x += planet.vx * timeStep;
            planet.y += planet.vy * timeStep;
        }
        
        // Update star positions
        for (let i = 0; i < simulatedStars.length; i++) {
            const starBody = simulatedStars[i];
            
            // Calculate forces from other stars and planets
            let starForceX = 0, starForceY = 0;
            
            // Gravity from other stars
            for (let j = 0; j < simulatedStars.length; j++) {
                if (i !== j) {
                    const otherStar = simulatedStars[j];
                    const dxStar = otherStar.x - starBody.x;
                    const dyStar = otherStar.y - starBody.y;
                    const distSqStar = dxStar * dxStar + dyStar * dyStar + 1e-6;
                    const distStar = Math.sqrt(distSqStar);
                    const force = G * otherStar.mass / distSqStar;
                    starForceX += (dxStar / distStar) * force;
                    starForceY += (dyStar / distStar) * force;
                }
            }
            
            // Gravity from planets
            for (let planet of simulatedPlanets) {
                const dxPlanet = planet.x - starBody.x;
                const dyPlanet = planet.y - starBody.y;
                const distSqPlanet = dxPlanet * dxPlanet + dyPlanet * dyPlanet + 1e-6;
                const distPlanet = Math.sqrt(distSqPlanet);
                const planetForce = G * planet.mass / distSqPlanet;
                starForceX += (dxPlanet / distPlanet) * planetForce;
                starForceY += (dyPlanet / distPlanet) * planetForce;
            }
            
            starBody.vx += starForceX * timeStep;
            starBody.vy += starForceY * timeStep;
            starBody.x += starBody.vx * timeStep;
            starBody.y += starBody.vy * timeStep;
        }
        
        // Record ship position every few steps to reduce data
        if (step % 3 === 0) {
            path.push({ 
                x: simShip.x, 
                y: simShip.y 
            });
        }
    }
    
    return path;
}

function predictOrbit(targetPlanet, planets, allStars, steps = radarSteps, timeStep) {
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
    
    // Create copies of all star states for simulation
    const simulatedStars = allStars.map(starBody => ({
        x: starBody.x,
        y: starBody.y,
        vx: starBody.velocityX,
        vy: starBody.velocityY,
        mass: starBody.mass,
        radius: starBody.radius
    }));
    
    // Find the target planet in our simulation
    const targetIndex = planets.indexOf(targetPlanet);
    
    for (let step = 0; step < steps; step++) {
        // Calculate forces using Barnes-Hut algorithm
        const allBodies = [
            // Include all stars
            ...simulatedStars.map(starBody => ({
                x: starBody.x,
                y: starBody.y,
                mass: starBody.mass,
                radius: starBody.radius
            })),
            // Include all planets
            ...simulatedPlanets.map(planet => ({
                x: planet.x,
                y: planet.y,
                mass: planet.mass,
                radius: planet.radius
            }))
        ];
        
        const forces = calculateBarnesHutForces(allBodies);
        
        // Update all planets simultaneously using calculated forces
        for (let i = 0; i < simulatedPlanets.length; i++) {
            const planet = simulatedPlanets[i];
            
            // The forces array includes forces from all bodies (stars + planets)
            // Update velocity (Leapfrog integration for better stability)
            const planetForceIndex = simulatedStars.length + i; // Planet forces come after star forces
            planet.vx += forces[planetForceIndex].fx * timeStep;
            planet.vy += forces[planetForceIndex].fy * timeStep;
            
            // Update position
            planet.x += planet.vx * timeStep;
            planet.y += planet.vy * timeStep;
        }
        
        // Update star positions too
        for (let i = 0; i < simulatedStars.length; i++) {
            const starBody = simulatedStars[i];
            starBody.vx += forces[i].fx * timeStep;
            starBody.vy += forces[i].fy * timeStep;
            starBody.x += starBody.vx * timeStep;
            starBody.y += starBody.vy * timeStep;
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
function predictAllPlanetOrbits(planets, allStars, steps = radarSteps, timeStep = 10) {
    if (!planets || !Array.isArray(planets)) return []; // Prevent crash if planets is undefined

    const allPlanetTrajectories = planets.map(() => []); // Array of paths, one for each planet
    
    // Create copies of all planet states for simulation
    const simulatedPlanets = planets.map(planet => ({
        x: planet.x,
        y: planet.y,
        vx: planet.velocityX,
        vy: planet.velocityY,
        mass: planet.mass,
        radius: planet.radius
    }));
    
    // Create copies of all star states for simulation
    const simulatedStars = allStars.map(starBody => ({
        x: starBody.x,
        y: starBody.y,
        vx: starBody.velocityX,
        vy: starBody.velocityY,
        mass: starBody.mass,
        radius: starBody.radius
    }));
    
    for (let step = 0; step < steps; step++) {
        // Calculate forces using Barnes-Hut algorithm including all stars
        const allBodies = [
            // Include all stars
            ...simulatedStars.map(starBody => ({
                x: starBody.x,
                y: starBody.y,
                mass: starBody.mass,
                radius: starBody.radius
            })),
            // Include all planets
            ...simulatedPlanets.map(planet => ({
                x: planet.x,
                y: planet.y,
                mass: planet.mass,
                radius: planet.radius
            }))
        ];
        
        const forces = calculateBarnesHutForces(allBodies);
        
        // Update stars first
        for (let i = 0; i < simulatedStars.length; i++) {
            const starBody = simulatedStars[i];
            starBody.vx += forces[i].fx * timeStep;
            starBody.vy += forces[i].fy * timeStep;
            starBody.x += starBody.vx * timeStep;
            starBody.y += starBody.vy * timeStep;
        }
        
        // Update all planets simultaneously using calculated forces
        for (let i = 0; i < simulatedPlanets.length; i++) {
            const planet = simulatedPlanets[i];
            
            // The forces array includes forces from all bodies (stars + planets)
            const planetForceIndex = simulatedStars.length + i; // Planet forces come after star forces
            planet.vx += forces[planetForceIndex].fx * timeStep;
            planet.vy += forces[planetForceIndex].fy * timeStep;
            
            // Update position
            planet.x += planet.vx * timeStep;
            planet.y += planet.vy * timeStep;
        }
        
        // Record positions for all planets every few steps to reduce data
        if (step % 2 === 0) {
            for (let i = 0; i < simulatedPlanets.length; i++) {
                allPlanetTrajectories[i].push({ 
                    x: simulatedPlanets[i].x, 
                    y: simulatedPlanets[i].y
                });
            }
        }
    }

    return allPlanetTrajectories;
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
    // Calculate position 250 pixels in front of the ship
    // Use the same coordinate system as the ship's thrust direction
    const distance = 250;
    const wormholeX = ship.worldX + Math.sin(ship.angle) * distance;
    const wormholeY = ship.worldY - Math.cos(ship.angle) * distance;
    
    // Create wormhole with ship's velocity
    const wormhole = new Wormhole(wormholeX, wormholeY, ship.velocityX, ship.velocityY);
    wormholes.push(wormhole);
    
    console.log(`Wormhole spawned at (${wormholeX.toFixed(1)}, ${wormholeY.toFixed(1)}) with velocity (${ship.velocityX.toFixed(2)}, ${ship.velocityY.toFixed(2)})`);
}