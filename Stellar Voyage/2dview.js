// An alternative view for the main game, perceived as a 1 dimensional line based on what the ship can see
class AlternateView {
    constructor() {
        this.fov = Math.PI; // 180 degrees field of view
        this.visibleBodies = []; // Store planets/objects in view
        this.canvas = null;
        this.ctx = null;
        this.centerY = 75; // Center line of the 2D view
        this.maxDistance = 15000; // Maximum distance to show objects
        this.isRearView = false; // Toggle for rear view
    }
    
    initialize(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
    }
    
    update() {
        this.visibleBodies = [];
        
        if (!ship || !planets) return;
        
        // Check planets
        for (let planet of planets) {
            const bodyInfo = this.calculateBodyPosition(planet, ship);
            if (bodyInfo.inView) {
                bodyInfo.type = 'planet';
                bodyInfo.object = planet;
                this.visibleBodies.push(bodyInfo);
            }
        }
        
        // Check comets
        if (comets) {
            for (let comet of comets) {
                const bodyInfo = this.calculateBodyPosition(comet, ship);
                if (bodyInfo.inView) {
                    bodyInfo.type = 'comet';
                    bodyInfo.object = comet;
                    this.visibleBodies.push(bodyInfo);
                }
            }
        }
        
        // Check star
        if (star) {
            const bodyInfo = this.calculateBodyPosition(star, ship);
            if (bodyInfo.inView) {
                bodyInfo.type = 'star';
                bodyInfo.object = star;
                this.visibleBodies.push(bodyInfo);
            }
        }
        
        // Sort by distance (farthest first for proper layering - distant objects drawn first)
        this.visibleBodies.sort((a, b) => b.distance - a.distance);
    }
    
    calculateBodyPosition(body, ship) {
        // Calculate relative position
        const dx = body.x - ship.worldX;
        const dy = body.y - ship.worldY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Calculate angle from ship to body in world coordinates
        const bodyAngle = Math.atan2(dy, dx);
        
        // Ship's forward direction in world coordinates
        // ship.angle = 0 means pointing up (negative Y direction)
        // ship.angle = π/2 means pointing right (positive X direction)
        let shipForwardAngle = ship.angle - Math.PI/2; // Convert to standard math coordinates
        
        // If rear view is enabled, flip the ship's forward direction
        if (this.isRearView) {
            shipForwardAngle += Math.PI; // Add 180 degrees to look backwards
        }
        
        // Calculate relative angle (how far left/right the body is from ship's facing direction)
        let relativeAngle = bodyAngle - shipForwardAngle;
        
        // Normalize angle to [-π, π]
        while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
        while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
        
        // Check if within field of view
        const halfFov = this.fov / 2;
        const inView = Math.abs(relativeAngle) <= halfFov && distance <= this.maxDistance;
        
        // Calculate screen position (map angle to horizontal position)
        const screenX = (relativeAngle / halfFov) * (this.canvas.width / 2) + (this.canvas.width / 2);
        
        // Calculate apparent size based on distance, actual size, and field of view
        // As FOV decreases (zooming in), objects should appear larger
        const baseFOV = Math.PI; // 180 degrees as reference FOV
        const fovZoomFactor = baseFOV / this.fov; // Higher when FOV is smaller (zoomed in)
        const apparentSize = Math.max(1, (body.radius * 200 * fovZoomFactor) / distance);
        
        return {
            inView: inView,
            screenX: screenX,
            distance: distance,
            relativeAngle: relativeAngle,
            apparentSize: apparentSize,
            realSize: body.radius
        };
    }
    
    show() {
        if (!this.ctx || !this.canvas) return;
        
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background
        this.ctx.fillStyle = '#000011';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw horizon line
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.centerY);
        this.ctx.lineTo(this.canvas.width, this.centerY);
        this.ctx.stroke();
        
        // Draw field of view indicators
        this.drawFOVIndicators();
        
        // Draw visible bodies
        for (let bodyInfo of this.visibleBodies) {
            this.drawBody(bodyInfo);
        }
        
        // Draw ship indicator (center)
        this.drawShipIndicator();
        
        // Draw distance scale
        this.drawDistanceScale();
        
        // Draw title
        this.ctx.fillStyle = '#AAA';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'left';
        const viewType = this.isRearView ? 'Rear View' : 'Forward View';
        this.ctx.fillText(`Ship Horizon View - ${viewType}`, 10, 20);
    }
    
    drawFOVIndicators() {
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 2;
        
        // Left edge of FOV
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(0, this.canvas.height);
        this.ctx.stroke();
        
        // Right edge of FOV
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width, 0);
        this.ctx.lineTo(this.canvas.width, this.canvas.height);
        this.ctx.stroke();
        
        // Center line (ship's facing direction) - different color for rear view
        this.ctx.strokeStyle = this.isRearView ? '#8080FF' : '#88F';
        this.ctx.lineWidth = this.isRearView ? 2 : 1;
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width / 2, 0);
        this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
        this.ctx.stroke();
        
        // Add direction indicator at the center line
        this.ctx.fillStyle = this.isRearView ? '#8080FF' : '#88F';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        const directionText = this.isRearView ? 'REAR' : 'FORWARD';
        this.ctx.fillText(directionText, this.canvas.width / 2, 15);
    }
    
    drawBody(bodyInfo) {
        const x = bodyInfo.screenX;
        const size = bodyInfo.apparentSize;
        
        // Calculate y position based on distance (closer objects appear higher)
        const distanceFactor = 1 - (bodyInfo.distance / this.maxDistance);
        const y = this.centerY - (distanceFactor * 10); // Objects appear above/below horizon based on distance
        
        this.ctx.save();
        
        // Draw the body
        if (bodyInfo.type === 'planet') {
            // Draw planet using its actual image from the main game
            const planet = bodyInfo.object;
            if (planet.Image && planet.Image.complete) {
                // Create circular clipping path for the planet image
                this.ctx.beginPath();
                this.ctx.arc(x, y, size, 0, 2 * Math.PI);
                this.ctx.closePath();
                this.ctx.clip();
                
                // Draw the planet image within the circular clip
                this.ctx.drawImage(
                    planet.Image, 
                    x - size, 
                    y - size, 
                    size * 2, 
                    size * 2
                );
                
                // Reset clipping and add a subtle border
                this.ctx.restore();
                this.ctx.save();
                this.ctx.strokeStyle = '#666';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.arc(x, y, size, 0, 2 * Math.PI);
                this.ctx.stroke();
            } else {
                // Fallback to colored circle if image isn't available
                this.ctx.fillStyle = this.getPlanetColor(bodyInfo.object);
                this.ctx.beginPath();
                this.ctx.arc(x, y, size, 0, 2 * Math.PI);
                this.ctx.fill();
            }
            
        } else if (bodyInfo.type === 'star') {
            // Draw star using its actual image from the main game
            if (typeof gallery !== 'undefined' && gallery.yellowStar && gallery.yellowStar.complete) {
                // Create circular clipping path for the star image
                this.ctx.beginPath();
                this.ctx.arc(x, y, size, 0, 2 * Math.PI);
                this.ctx.closePath();
                this.ctx.clip();
                
                // Draw the star image within the circular clip
                this.ctx.drawImage(
                    gallery.yellowStar, 
                    x - size, 
                    y - size, 
                    size * 2, 
                    size * 2
                );
                
                // Reset clipping and add a bright glow effect
                this.ctx.restore();
                this.ctx.save();
                this.ctx.shadowColor = '#FFFF88';
                this.ctx.shadowBlur = size;
                this.ctx.strokeStyle = '#FFFF88';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(x, y, size, 0, 2 * Math.PI);
                this.ctx.stroke();
            } else {
                // Fallback to bright yellow circle
                this.ctx.fillStyle = '#FFFF88';
                this.ctx.shadowColor = '#FFFF88';
                this.ctx.shadowBlur = size;
                this.ctx.beginPath();
                this.ctx.arc(x, y, size, 0, 2 * Math.PI);
                this.ctx.fill();
            }
            
        } else if (bodyInfo.type === 'comet') {
            // Draw comet using its actual image from the main game
            if (typeof gallery !== 'undefined' && gallery.cometImg && gallery.cometImg.complete) {
                // Create circular clipping path for the comet image
                this.ctx.beginPath();
                this.ctx.arc(x, y, size, 0, 2 * Math.PI);
                this.ctx.closePath();
                this.ctx.clip();
                
                // Draw the comet image within the circular clip
                this.ctx.drawImage(
                    gallery.cometImg, 
                    x - size, 
                    y - size, 
                    size * 2, 
                    size * 2
                );
                
                // Reset clipping and add a subtle border
                this.ctx.restore();
                this.ctx.save();
                this.ctx.strokeStyle = '#CCCCCC';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.arc(x, y, size, 0, 2 * Math.PI);
                this.ctx.stroke();
            } else {
                // Fallback to white dot
                this.ctx.fillStyle = '#CCCCCC';
                this.ctx.beginPath();
                this.ctx.arc(x, y, size, 0, 2 * Math.PI);
                this.ctx.fill();
            }
        }
        
        this.ctx.restore();
        
        // Draw distance text below the object
        this.ctx.fillStyle = '#AAA';
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'center';
        const distanceText = Math.round(bodyInfo.distance).toLocaleString();
        this.ctx.fillText(distanceText, x, y + size + 15);
    }
    
    getPlanetColor(planet) {
        // Try to determine color based on planet image if possible
        // This is a simplified approach - you might want to expand this
        if (planet.image) {
            const imageName = planet.image.id || '';
            if (imageName.includes('blue')) return '#4444FF';
            if (imageName.includes('red')) return '#FF4444';
            if (imageName.includes('green')) return '#44FF44';
            if (imageName.includes('brown')) return '#8B4513';
            if (imageName.includes('gray') || imageName.includes('grey')) return '#888888';
            if (imageName.includes('ice')) return '#CCFFFF';
            if (imageName.includes('orange')) return '#FF8844';
            if (imageName.includes('yellow')) return '#FFFF44';
        }
        
        // Default colors based on planet type/size
        if (planet.radius > 150) return '#FF8844'; // Gas giants - orange
        if (planet.radius > 80) return '#4488FF';  // Large terrestrials - blue
        return '#888888'; // Small bodies/moons - gray
    }
    
    drawShipIndicator() {
        const centerX = this.canvas.width / 2;
        const centerY = this.centerY;
        
        // Draw ship as a crosshair
        this.ctx.strokeStyle = '#BBBBFF';
        this.ctx.lineWidth = 2;
        
        // Horizontal lines
        this.ctx.beginPath();
        this.ctx.moveTo(centerX - 32, centerY);
        this.ctx.lineTo(centerX - 25, centerY);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(centerX + 32, centerY);
        this.ctx.lineTo(centerX + 25, centerY);
        this.ctx.stroke();

        // Vertical lines
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY - 32);
        this.ctx.lineTo(centerX, centerY - 25);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY + 32);
        this.ctx.lineTo(centerX, centerY + 25);
        this.ctx.stroke();

        // Add small center dot
        this.ctx.fillStyle = '#BBBBFF';
        this.ctx.beginPath();
        this.ctx.rect(centerX - 25, centerY - 25, 50, 50);
        this.ctx.stroke();
    }
    
    drawDistanceScale() {
        // Draw a simple distance scale on the right side
        const scaleX = this.canvas.width - 180;
        const scaleY = 20;
        
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 1;
        this.ctx.font = '10px Arial';
        this.ctx.fillStyle = '#AAA';
        this.ctx.textAlign = 'left';
        
        // Draw scale markers
        const distances = [1000, 5000, 10000, 15000];
        for (let i = 0; i < distances.length; i++) {
            const y = scaleY + (i * 15);
            this.ctx.fillText(distances[i].toLocaleString(), scaleX, y);
        }
        
        // Draw FOV info
        this.ctx.fillText(`FOV: ${Math.round(this.fov * 180 / Math.PI)}°`, scaleX, scaleY + 80);
        this.ctx.fillText(`Max Dist: ${this.maxDistance.toLocaleString()}`, scaleX, scaleY + 95);
        
        // Draw controls legend
        this.ctx.fillStyle = '#888';
        this.ctx.font = '9px Arial';
        this.ctx.fillText('Controls:', scaleX, scaleY + 115);
        this.ctx.fillText('H: Toggle Panel', scaleX, scaleY + 128);
        this.ctx.fillText('V: Rear View (hold)', scaleX, scaleY + 141);
        this.ctx.fillText('Q/E: FOV ±', scaleX, scaleY + 154);
        this.ctx.fillText('R: Reset FOV', scaleX, scaleY + 167);
        this.ctx.fillText('-/+: Distance', scaleX, scaleY + 180);
        this.ctx.fillText('Wheel: FOV', scaleX, scaleY + 193);
        this.ctx.fillText('Click: Select', scaleX, scaleY + 206);
    }
}

// Add mouse and keyboard controls for the alternate view
function setupAlternateViewControls() {
    const altCanvas = document.getElementById("2dview");
    const altViewPanel = document.getElementById("altViewPanel");
    let isDropdownOpen = false;
    
    // Function to toggle the panel
    function togglePanel() {
        isDropdownOpen = !isDropdownOpen;
        altViewPanel.style.display = isDropdownOpen ? 'block' : 'none';
    }
    
    // Store toggle function globally for H key access
    window.toggleHorizonView = togglePanel;
    
    // Mouse wheel to adjust field of view
    altCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (alternateView) {
            const fovChange = e.deltaY * 0.001; // Adjust sensitivity
            alternateView.fov = Math.max(Math.PI / 6, Math.min(Math.PI * 2, alternateView.fov + fovChange)); // Clamp between 30° and 360°
        }
    });
    
    // Right-click to reset FOV
    altCanvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (alternateView) {
            alternateView.fov = Math.PI; // Reset to 180°
        }
    });
    
    // Click to select objects (if you want to add this feature later)
    altCanvas.addEventListener('click', (e) => {
        if (alternateView && alternateView.visibleBodies) {
            const rect = altCanvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            // Find clicked object
            for (let bodyInfo of alternateView.visibleBodies) {
                const distance = Math.sqrt(
                    Math.pow(clickX - bodyInfo.screenX, 2) + 
                    Math.pow(clickY - (alternateView.centerY - (1 - (bodyInfo.distance / alternateView.maxDistance)) * 30), 2)
                );
                
                if (distance <= bodyInfo.apparentSize + 10) { // 10px buffer
                    // Select this object (you can extend this functionality)
                    console.log(`Selected ${bodyInfo.type} at distance ${Math.round(bodyInfo.distance)}`);
                    if (bodyInfo.type === 'planet') {
                        selectedPlanet = bodyInfo.object; // Select planet in main game
                    }
                    break;
                }
            }
        }
    });
}

// Call this function after the page loads
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        setupAlternateViewControls();
    });
}

// Keyboard shortcuts for alternate view (can be extended)
window.addEventListener('keydown', (e) => {
    if (!alternateView) return;
    
    // Toggle dropdown with 'H' key (H for Horizon)
    if (e.key.toLowerCase() === 'h') {
        if (window.toggleHorizonView) {
            window.toggleHorizonView();
        }
        return;
    }
    
    // Rear view with 'V' key (hold for rear view)
    if (e.key.toLowerCase() === 'v') {
        alternateView.isRearView = true;
        return;
    }
    
    switch(e.key.toLowerCase()) {
        case 'q': // Decrease FOV
            alternateView.fov = Math.max(Math.PI / 6, alternateView.fov - 0.1);
            break;
        case 'e': // Increase FOV
            alternateView.fov = Math.min(Math.PI * 2, alternateView.fov + 0.1);
            break;
        case 'r': // Reset FOV
            alternateView.fov = Math.PI;
            break;
        case '-': // Decrease max distance
            alternateView.maxDistance = Math.max(5000, alternateView.maxDistance - 2000);
            break;
        case '=': // Increase max distance
            alternateView.maxDistance = Math.min(50000, alternateView.maxDistance + 2000);
            break;
    }
});

// Handle key release for rear view
window.addEventListener('keyup', (e) => {
    if (!alternateView) return;
    
    // Release rear view when 'V' key is released
    if (e.key.toLowerCase() === 'v') {
        alternateView.isRearView = false;
    }
});