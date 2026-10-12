/**
 * Cristi Desktop - Live2D Kinetic Physics Engine 2.0
 * 
 * Provides real-time dynamic harmonic spring-pendulum physics,
 * ambient micro-breeze & wind turbulence simulation, inertial reaction to
 * head/body acceleration, and resonant oscillation for hair, cloth, skirts,
 * ribbons, tails, ears, and accessories across all Live2D Cubism models.
 */

import type {
  Live2DCoreModel,
  ModelProfile,
  SpringPhysicsState,
  ActivePhysicsParam,
  Kinematics
} from './types';

interface PhysicsDefinition {
  pattern: RegExp;
  type: string;
  spring: number;
  damping: number;
  mass: number;
}

export class Live2DPhysicsEngine {
  private springs: Map<string, SpringPhysicsState> = new Map();
  private windTime: number = 0;
  private windBaseSpeed: number = 0.8;
  private windIntensity: number = 0.35;
  private gustTimer: number = 0;
  private nextGustInterval: number = 4000;
  private currentGustStrength: number = 0;

  private lastHead = { x: 0, y: 0, z: 0 };
  private lastBody = { x: 0, y: 0, z: 0 };
  private headVelocity = { x: 0, y: 0, z: 0 };
  private bodyVelocity = { x: 0, y: 0, z: 0 };
  private headAccel = { x: 0, y: 0, z: 0 };
  private bodyAccel = { x: 0, y: 0, z: 0 };

  private readonly physicsParamPatterns: PhysicsDefinition[] = [
    { pattern: /hair.*front/i, type: 'hair_front', spring: 140, damping: 10, mass: 1.0 },
    { pattern: /hair.*side/i, type: 'hair_side', spring: 110, damping: 9, mass: 1.1 },
    { pattern: /hair.*back/i, type: 'hair_back', spring: 90, damping: 8, mass: 1.3 },
    { pattern: /hair.*fluffy/i, type: 'hair_fluffy', spring: 160, damping: 12, mass: 0.8 },
    { pattern: /param.*hair/i, type: 'hair_generic', spring: 120, damping: 10, mass: 1.0 },
    { pattern: /cloth|skirt|dress|sleeve/i, type: 'cloth', spring: 80, damping: 7, mass: 1.5 },
    { pattern: /ribbon|tie|string|strap/i, type: 'ribbon', spring: 170, damping: 11, mass: 0.7 },
    { pattern: /tail/i, type: 'tail', spring: 75, damping: 6, mass: 1.8 },
    { pattern: /ear/i, type: 'ear', spring: 190, damping: 13, mass: 0.6 },
    { pattern: /bust.*y/i, type: 'bust_y', spring: 220, damping: 16, mass: 0.9 },
    { pattern: /bust.*x/i, type: 'bust_x', spring: 200, damping: 15, mass: 0.9 },
    { pattern: /acc|wing|feather/i, type: 'accessory', spring: 130, damping: 9, mass: 1.0 }
  ];

  public activePhysicsParams: ActivePhysicsParam[] = [];

  /**
   * Introspects model core parameter IDs and binds spring dynamics
   */
  bindModel(coreModel: Live2DCoreModel | null, _profile: ModelProfile | null = null): void {
    this.springs.clear();
    this.activePhysicsParams = [];

    if (!coreModel) return;

    // Get all parameter IDs in this model
    let paramIds: string[] = [];
    if (Array.isArray(coreModel._parameterIds)) {
      paramIds = coreModel._parameterIds;
    } else if (typeof coreModel.getParameterCount === 'function') {
      const count = coreModel.getParameterCount();
      for (let i = 0; i < count; i++) {
        if (coreModel.getParameterId) {
          paramIds.push(coreModel.getParameterId(i));
        }
      }
    }

    // Match parameters against known physics categories
    for (const paramId of paramIds) {
      if (typeof paramId !== 'string') continue;

      // Skip base structural parameters (Head, Body, Eyes, Brow, Mouth, Breath)
      const isBase = /angle|eyeball|eyeopen|eyesmile|brow|mouth|cheek|breath/i.test(paramId);
      if (isBase) continue;

      for (const def of this.physicsParamPatterns) {
        if (def.pattern.test(paramId)) {
          this.springs.set(paramId, {
            position: 0,
            velocity: 0,
            target: 0,
            spring: def.spring,
            damping: def.damping,
            mass: def.mass,
            type: def.type
          });

          this.activePhysicsParams.push({
            paramId,
            type: def.type,
            spring: def.spring,
            damping: def.damping,
            mass: def.mass
          });
          break;
        }
      }
    }
  }

  /**
   * Calculate wind turbulence based on multi-harmonic sine waves + stochastic gusts
   */
  computeWind(deltaSec: number): number {
    this.windTime += deltaSec * this.windBaseSpeed;

    // Ambient micro-breeze (composite of 3 harmonics)
    const wave1 = Math.sin(this.windTime * 1.0);
    const wave2 = Math.sin(this.windTime * 2.3 + 1.2) * 0.5;
    const wave3 = Math.sin(this.windTime * 4.7 + 2.8) * 0.25;
    const ambientWind = (wave1 + wave2 + wave3) / 1.75; // normalized ~ -1 to 1

    // Stochastic gust logic
    this.gustTimer += deltaSec * 1000;
    if (this.gustTimer >= this.nextGustInterval) {
      this.gustTimer = 0;
      this.nextGustInterval = 3000 + Math.random() * 5000;
      this.currentGustStrength = (Math.random() > 0.4 ? 1 : -1) * (0.4 + Math.random() * 0.6);
    }

    // Decay gust strength smoothly with exact continuous exponential decay
    this.currentGustStrength *= Math.exp(-1.8 * deltaSec);

    return (ambientWind * this.windIntensity) + (this.currentGustStrength * 0.6);
  }

  /**
   * Update physics tick for all registered parameters
   */
  update(
    deltaSec: number,
    kinematics: Kinematics,
    setParamCallback: (paramId: string, value: number) => void
  ): void {
    if (this.springs.size === 0 || deltaSec <= 0) return;

    // Clamp deltaSec to prevent explosive instability on frame drops
    const dt = Math.min(deltaSec, 0.05);

    // 1. Calculate head & body velocities and accelerations (inertial forces)
    const headVx = (kinematics.headX - this.lastHead.x) / dt;
    const headVy = (kinematics.headY - this.lastHead.y) / dt;
    const headVz = (kinematics.headZ - this.lastHead.z) / dt;

    const bodyVx = (kinematics.bodyX - this.lastBody.x) / dt;
    const bodyVy = (kinematics.bodyY - this.lastBody.y) / dt;
    const bodyVz = (kinematics.bodyZ - this.lastBody.z) / dt;

    this.headAccel = {
      x: (headVx - this.headVelocity.x) / dt,
      y: (headVy - this.headVelocity.y) / dt,
      z: (headVz - this.headVelocity.z) / dt
    };

    this.bodyAccel = {
      x: (bodyVx - this.bodyVelocity.x) / dt,
      y: (bodyVy - this.bodyVelocity.y) / dt,
      z: (bodyVz - this.bodyVelocity.z) / dt
    };

    this.headVelocity = { x: headVx, y: headVy, z: headVz };
    this.bodyVelocity = { x: bodyVx, y: bodyVy, z: bodyVz };

    this.lastHead = { x: kinematics.headX, y: kinematics.headY, z: kinematics.headZ };
    this.lastBody = { x: kinematics.bodyX, y: kinematics.bodyY, z: kinematics.bodyZ };

    // 2. Compute ambient wind
    const windForce = this.computeWind(dt);

    // 3. Integrate spring-damper equations: F = -k*x - c*v + F_external
    for (const [paramId, spring] of this.springs.entries()) {
      let externalForce = 0;

      // External inertial & wind force mapping by physical type
      switch (spring.type) {
        case 'hair_front':
          externalForce = (-this.headAccel.x * 0.003) - (this.headAccel.z * 0.004) + (windForce * 0.35);
          break;
        case 'hair_side':
          externalForce = (-this.headAccel.x * 0.005) - (this.headAccel.z * 0.006) + (windForce * 0.50);
          break;
        case 'hair_back':
          externalForce = (-this.headAccel.x * 0.006) + (-this.bodyAccel.x * 0.004) + (windForce * 0.65);
          break;
        case 'hair_fluffy':
          externalForce = (-this.headAccel.x * 0.004) + (windForce * 0.80);
          break;
        case 'cloth':
        case 'skirt':
          externalForce = (-this.bodyAccel.x * 0.007) + (windForce * 0.60);
          break;
        case 'ribbon':
          externalForce = (-this.headAccel.x * 0.008) + (windForce * 0.90);
          break;
        case 'tail':
          externalForce = (-this.bodyAccel.x * 0.009) + (Math.sin(this.windTime * 1.5) * 0.25);
          break;
        case 'ear':
          externalForce = (-this.headAccel.x * 0.006) - (this.headAccel.y * 0.004) + (windForce * 0.30);
          break;
        case 'bust_y':
          externalForce = (-this.bodyAccel.y * 0.005) - (this.headAccel.y * 0.003);
          break;
        case 'bust_x':
          externalForce = (-this.bodyAccel.x * 0.004);
          break;
        default:
          externalForce = (-this.headAccel.x * 0.004) + (windForce * 0.40);
          break;
      }

      // Hooke's Law + Velocity Damping
      const displacement = spring.position - spring.target;
      const springForce = -spring.spring * displacement;
      const dampingForce = -spring.damping * spring.velocity;
      const totalForce = springForce + dampingForce + (externalForce * spring.spring);

      const acceleration = totalForce / spring.mass;
      spring.velocity += acceleration * dt;

      // Numerical damping safeguard - frame-rate normalized for 60Hz-240Hz monitors
      spring.velocity *= Math.pow(0.98, dt * 60);
      spring.position += spring.velocity * dt;

      // Clamp output between -1.0 and 1.0 (Live2D standard range)
      const clampedVal = Math.max(-1.0, Math.min(1.0, spring.position));

      // Apply output parameter to model adapter
      setParamCallback(paramId, clampedVal);
    }
  }

  /**
   * Reset all spring positions and velocities to neutral
   */
  reset(): void {
    for (const spring of this.springs.values()) {
      spring.position = 0;
      spring.velocity = 0;
      spring.target = 0;
    }
    this.lastHead = { x: 0, y: 0, z: 0 };
    this.lastBody = { x: 0, y: 0, z: 0 };
    this.headVelocity = { x: 0, y: 0, z: 0 };
    this.bodyVelocity = { x: 0, y: 0, z: 0 };
    this.headAccel = { x: 0, y: 0, z: 0 };
    this.bodyAccel = { x: 0, y: 0, z: 0 };
  }

  /**
   * Release resources and maps
   */
  destroy(): void {
    this.springs.clear();
    this.activePhysicsParams = [];
  }
}
