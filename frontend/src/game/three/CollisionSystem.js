/**
 * CollisionSystem.js
 * Deterministic, lightweight 2D gameplay collision layer for World3D.
 * Supports:
 *  - Axis-Aligned Bounding Boxes (AABB) with dimensions { x, z, width, depth }
 *  - Circles { x, z, radius }
 * Provides axis-independent collision resolution with natural wall sliding.
 */

export class CollisionSystem {
  constructor() {
    this.obstacles = [];
  }

  clear() {
    this.obstacles = [];
  }

  addBox(x, z, width, depth, id = 'box') {
    this.obstacles.push({
      type: 'box',
      id,
      x,
      z,
      width,
      depth,
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2
    });
  }

  addCircle(x, z, radius, id = 'circle') {
    this.obstacles.push({
      type: 'circle',
      id,
      x,
      z,
      radius
    });
  }

  /**
   * Tests if a circle at (cx, cz) with radius r collides with any obstacle.
   */
  isColliding(cx, cz, r = 0.35) {
    for (let i = 0; i < this.obstacles.length; i++) {
      const obs = this.obstacles[i];

      if (obs.type === 'box') {
        // Nearest point on AABB to circle center
        const closestX = Math.max(obs.minX, Math.min(cx, obs.maxX));
        const closestZ = Math.max(obs.minZ, Math.min(cz, obs.maxZ));

        const dx = cx - closestX;
        const dz = cz - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < r * r) {
          return true;
        }
      } else if (obs.type === 'circle') {
        const dx = cx - obs.x;
        const dz = cz - obs.z;
        const totalR = r + obs.radius;

        if (dx * dx + dz * dz < totalR * totalR) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Resolves movement from current (currX, currZ) given desired movement delta (dx, dz).
   * Evaluates X and Z axes independently to allow natural sliding along obstacle edges.
   */
  resolveMovement(currX, currZ, dx, dz, r = 0.35) {
    let newX = currX;
    let newZ = currZ;

    // Try moving along X
    if (dx !== 0) {
      const candidateX = currX + dx;
      if (!this.isColliding(candidateX, currZ, r)) {
        newX = candidateX;
      }
    }

    // Try moving along Z (using newX if allowed, or currX)
    if (dz !== 0) {
      const candidateZ = currZ + dz;
      if (!this.isColliding(newX, candidateZ, r)) {
        newZ = candidateZ;
      } else if (!this.isColliding(currX, candidateZ, r)) {
        // If combined diagonal collided, allow Z movement alone if possible
        newZ = candidateZ;
        newX = currX;
      }
    }

    return {
      x: newX,
      z: newZ,
      blockedX: newX === currX && dx !== 0,
      blockedZ: newZ === currZ && dz !== 0
    };
  }
}
