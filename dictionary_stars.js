// dictionary_stars.js
let canvas, ctx, stars = [];
const G = 0.1; // gravitational constant
const THETA = 0.5; // Barnes-Hut approximation parameter (lower = more accurate)

class BackgroundStar {
    constructor(x, y, vx, vy, radius, color) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = radius;
        this.color = color;
    }

    update() {
        this.x = (this.x + this.vx + canvas.width) % canvas.width;
        this.y = (this.y + this.vy + canvas.height) % canvas.height;
    }

    show() {
        ctx.save();
        const glowRadius = this.radius * 3;
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowRadius);
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }
}

// QuadTree node for Barnes-Hut algorithm
class QuadTreeNode {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.star = null;
        this.centerOfMass = { x: 0, y: 0 };
        this.totalMass = 0;
        this.children = [null, null, null, null]; // NW, NE, SW, SE
        this.isLeaf = true;
    }

    insert(star) {
        // If node is empty, place star here
        if (this.totalMass === 0) {
            this.star = star;
            this.centerOfMass.x = star.x;
            this.centerOfMass.y = star.y;
            this.totalMass = star.radius; // using radius as mass
            return;
        }

        // If this is a leaf with one star, subdivide
        if (this.isLeaf) {
            this.subdivide();
            
            // Move existing star to appropriate child
            const existingStar = this.star;
            this.star = null;
            this.insertIntoChild(existingStar);
            this.isLeaf = false;
        }

        // Insert new star into appropriate child
        this.insertIntoChild(star);
        
        // Update center of mass
        this.updateCenterOfMass(star);
    }

    subdivide() {
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        
        this.children[0] = new QuadTreeNode(this.x, this.y, halfWidth, halfHeight); // NW
        this.children[1] = new QuadTreeNode(this.x + halfWidth, this.y, halfWidth, halfHeight); // NE
        this.children[2] = new QuadTreeNode(this.x, this.y + halfHeight, halfWidth, halfHeight); // SW
        this.children[3] = new QuadTreeNode(this.x + halfWidth, this.y + halfHeight, halfWidth, halfHeight); // SE
    }

    insertIntoChild(star) {
        const midX = this.x + this.width / 2;
        const midY = this.y + this.height / 2;
        
        let index = 0;
        if (star.x >= midX) index += 1; // East
        if (star.y >= midY) index += 2; // South
        
        this.children[index].insert(star);
    }

    updateCenterOfMass(star) {
        const newMass = star.radius;
        const totalMass = this.totalMass + newMass;
        
        this.centerOfMass.x = (this.centerOfMass.x * this.totalMass + star.x * newMass) / totalMass;
        this.centerOfMass.y = (this.centerOfMass.y * this.totalMass + star.y * newMass) / totalMass;
        this.totalMass = totalMass;
    }

    calculateForce(star, forceAccumulator) {
        // If empty node, no force
        if (this.totalMass === 0) return;

        const dx = this.centerOfMass.x - star.x;
        const dy = this.centerOfMass.y - star.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);

        // If this is a leaf node with the same star, skip
        if (this.isLeaf && this.star === star) return;

        // Barnes-Hut criterion: if s/d < θ, treat as single body
        const s = Math.max(this.width, this.height);
        if (this.isLeaf || s / dist < THETA) {
            // Calculate force directly
            if (dist > 0) {
                const force = G * this.totalMass / (distSq + 1); // +1 for softening
                forceAccumulator.fx += (dx / dist) * force;
                forceAccumulator.fy += (dy / dist) * force;
            }
        } else {
            // Recursively calculate forces from children
            for (let child of this.children) {
                if (child && child.totalMass > 0) {
                    child.calculateForce(star, forceAccumulator);
                }
            }
        }
    }
}

class QuadTree {
    constructor(x, y, width, height) {
        this.root = new QuadTreeNode(x, y, width, height);
    }

    insert(star) {
        this.root.insert(star);
    }

    calculateForceOnStar(star) {
        const force = { fx: 0, fy: 0 };
        this.root.calculateForce(star, force);
        return force;
    }
}

function resizeCanvas() {
    // Remember old dimensions
    const oldW = canvas.width;
    const oldH = canvas.height;

    // Resize to new viewport
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Compute scaling factors
    const scaleX = canvas.width  / oldW;
    const scaleY = canvas.height / oldH;

    // Apply to every star
    for (let star of stars) {
        star.x *= scaleX;
        star.y *= scaleY;
    }
}

function setup() {
    canvas = document.getElementById("stars");
    ctx = canvas.getContext("2d");
    resizeCanvas();

    // Create 500 stars
    stars = [];
    for (let i = 0; i < 2000; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const radius = Math.random() * 1.5 + 0.8;
        const progress = Math.random();
        const color = getSpectrumColor(progress);
        // give each star a small random velocity
        const vx = (Math.random() - 0.5) * radius / 10;
        const vy = (Math.random() - 0.5) * radius / 10;
        stars.push(new BackgroundStar(x, y, vx, vy, radius, color));
    }
}

function draw() {
    // clear screen
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Build quadtree for this frame
    const quadTree = new QuadTree(0, 0, canvas.width, canvas.height);
    
    // Insert all stars into the quadtree
    for (let star of stars) {
        quadTree.insert(star);
    }

    // Calculate forces using Barnes-Hut algorithm
    for (let star of stars) {
        const force = quadTree.calculateForceOnStar(star);
        
        // Apply force to velocity
        star.vx += force.fx;
        star.vy += force.fy;
        
        // Update position and draw
        star.update();
        star.show();
    }
}

function getSpectrumColor(progress) {
    // Clamp progress between 0 and 1
    progress = Math.min(1, Math.max(0, progress));

    let r, g, b;

    if (progress < 0.5) {
        // Interpolate between light blue and white
        const t = progress / 0.5;
        r = 150 + (255 - 150) * t;
        g = 200 + (255 - 200) * t;
        b = 230 + (255 - 230) * t;
    } else {
        // Interpolate between white and light orange
        const t = (progress - 0.5) / 0.5;
        r = 255;
        g = 255 - (255 - 200) * t;
        b = 255 - (255 - 150) * t;
    }

    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function setAlpha(rgbStr, alpha) {
    // Extract numeric r, g, b
    const [r, g, b] = rgbStr.match(/\d+/g).map(Number);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function animate() {
    draw();
    requestAnimationFrame(animate);
}

// kick everything off once DOM is ready
window.addEventListener("DOMContentLoaded", () => {
    setup();
    animate();
});

// keep canvas full-screen on resize
window.addEventListener("resize", resizeCanvas);
