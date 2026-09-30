import * as THREE from 'three';
import { WATER, STRIPS } from './world.js';
import { wind } from './style.js';

export const GEAR_H = 1.6; // CG height above the wheels' contact point

// Shared by both planes (same gear, same world). Accelerations in m/s².
const G = 9.81, TAIL_PITCH = 0.17, ROLL_FRICTION = 0.4, BRAKE = 4;

// What differs per plane: THRUST (full throttle), KD / KI (parasitic / induced drag), KL (lift per CL·v²),
// CL0 + CLA·aoa up to the critical angle STALL, then lift falls by DROP per radian beyond it, down to FLOOR·CL_MAX.
// SLOW is the airspeed (m/s) under which the stall warning shows; ROLL the aileron rate (rad/s at full stick).
const aircraft = (a) => ({ ...a, CL_MAX: a.CL0 + a.CLA * a.STALL, CL_MIN: a.CL0 - a.CLA * a.STALL });
export const AIRCRAFT = {
  // Red biplane: ~205 km/h top speed, ~75 km/h stall, liftoff ~85 km/h with back pressure; a sharp stall
  red: aircraft({ THRUST: 3.8, KD: 0.001, KI: 0.001, KL: 0.0157, CL0: 0.25, CLA: 5, STALL: 0.26, DROP: 4, FLOOR: 0.35, SLOW: 20, ROLL: 2.0 }),
  // Blue parasol: light, big wing, draggy. ~165 km/h top speed, ~60 km/h stall, liftoff ~73 km/h; soft, forgiving stall
  blue: aircraft({ THRUST: 5.0, KD: 0.0021, KI: 0.0012, KL: 0.0214, CL0: 0.25, CLA: 5, STALL: 0.28, DROP: 1.5, FLOOR: 0.6, SLOW: 16, ROLL: 2.3 }),
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function liftCoef(ac, a) {
  if (a > ac.STALL) return ac.CL_MAX * Math.max(ac.FLOOR, 1 - (a - ac.STALL) * ac.DROP);
  if (a < -ac.STALL) return ac.CL_MIN * Math.max(ac.FLOOR, 1 - (-a - ac.STALL) * ac.DROP);
  return ac.CL0 + ac.CLA * a;
}

const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _right = new THREE.Vector3();
const _vl = new THREE.Vector3(), _vh = new THREE.Vector3(), _lift = new THREE.Vector3();
const _acc = new THREE.Vector3(), _tgt = new THREE.Vector3(), _va = new THREE.Vector3(), _air = new THREE.Vector3();
const _inv = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _e = new THREE.Euler();

export class Flight {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.rates = new THREE.Vector3(); // local pitch / yaw / roll rates (rad/s)
    this.ctrl = { pitch: 0, roll: 0, yaw: 0 };
    this.home = { strip: STRIPS[0], dir: 1 }; // where R puts you: strip + take-off direction (1 = along its heading)
    this.ac = AIRCRAFT.red;                    // the plane being flown (setAircraft, then reset)
    this.reset();
  }

  setAircraft(ac) { this.ac = ac; }

  reset() {
    this.state = 'ground';
    this.flown = false;
    this.stall = false;
    this.message = '';
    this.throttle = 0;
    this.speed = 0;
    this.gPitch = TAIL_PITCH;
    const { strip: s, dir } = this.home, back = s.len / 2 - 25; // lined up at the start of the strip
    this.heading = s.heading + (dir > 0 ? 0 : Math.PI);
    this.pos.set(s.x - dir * s.fx * back, s.h + GEAR_H, s.z - dir * s.fz * back);
    this.vel.set(0, 0, 0);
    this.rates.set(0, 0, 0);
    this.q.setFromEuler(_e.set(this.gPitch, this.heading, 0, 'YXZ'));
    this.air = 0;
    this.t = 0;
  }

  // Training: on the 3° glide path, lined up, 108 km/h, throttle 30%
  startApproach(a) {
    const D = a.D, s = a.strip;
    this.reset();
    this.state = 'air';
    this.flown = true;
    this.throttle = 0.3;
    const glide = (3 * Math.PI) / 180;
    this.pos.set(s.x + a.ox * (a.aimU + D), a.aimY + GEAR_H + D * Math.tan(glide), s.z + a.oz * (a.aimU + D));
    this.vel.set(-a.ox * Math.cos(glide), -Math.sin(glide), -a.oz * Math.cos(glide)).multiplyScalar(30).add(wind.vec); // 30 m/s through the air
    this.q.setFromEuler(_e.set(0.06, Math.atan2(a.ox, a.oz), 0, 'YXZ'));
  }

  get airspeed() { return this.air ?? 0; } // speed through the air (what the wings and the gauge feel)
  get vs() { return this.state === 'air' ? this.vel.y : 0; }
  get status() {
    if (this.state === 'crashed') return `Crashed: ${this.message}\nPress R to reset`;
    if (this.state === 'air') return this.stall ? 'Stall' : 'Airborne';
    if (this.speed < 0.5) {
      if (!this.flown) return 'Parked';
      const s = this.world.stripAt(this.pos.x, this.pos.z);
      return s ? `Landed · ${s.name}` : 'Landed (off-field)';
    }
    return 'Rolling';
  }

  update(dt, input) {
    const c = this.ctrl, k = Math.min(1, dt * 6);
    c.pitch += (input.axis('ArrowUp', 'ArrowDown') - c.pitch) * k; // ↓ = pull back = nose up
    c.roll += (input.axis('ArrowLeft', 'ArrowRight') - c.roll) * k;
    c.yaw += (input.axis('KeyD', 'KeyA') - c.yaw) * k;             // A = left rudder
    if (this.state === 'crashed') return;
    this.throttle = clamp(this.throttle + input.axis('KeyS', 'KeyW') * 0.5 * dt, 0, 1);
    if (this.state === 'air') this.airStep(dt);
    else this.groundStep(dt, input.down('KeyB'));
  }

  airStep(dt) {
    const { pos, vel, q, rates, ctrl: c, world } = this;
    _fwd.set(0, 0, -1).applyQuaternion(q);
    _up.set(0, 1, 0).applyQuaternion(q);
    _right.set(1, 0, 0).applyQuaternion(q);
    // Aerodynamics use the air-relative velocity: wind + gusts, plus light turbulence close to the ground
    this.t += dt;
    const agl = pos.y - world.groundAt(pos.x, pos.z);
    const bump = wind.now * wind.gust * 0.12 * Math.max(0, 1 - agl / 150);
    _air.copy(wind.vec).setY(bump * (Math.sin(this.t * 2.3) * 0.6 + Math.sin(this.t * 5.1 + 1) * 0.4));
    _va.copy(vel).sub(_air);
    const v = _va.length();
    this.air = v;
    _vl.copy(_va).applyQuaternion(_inv.copy(q).invert());
    const aoa = v > 2 ? Math.atan2(-_vl.y, -_vl.z) : 0;
    const beta = v > 2 ? Math.atan2(_vl.x, -_vl.z) : 0;
    const ac = this.ac, cl = liftCoef(ac, aoa);

    _acc.set(0, -G, 0).addScaledVector(_fwd, this.throttle * ac.THRUST);
    if (v > 0.5) {
      _vh.copy(_va).divideScalar(v);
      _lift.copy(_up).addScaledVector(_vh, -_up.dot(_vh));
      if (_lift.lengthSq() > 1e-6) _lift.normalize();
      _acc.addScaledVector(_lift, ac.KL * cl * v * v);
      _acc.addScaledVector(_vh, -(ac.KD + ac.KI * cl * cl) * v * v);
      _acc.addScaledVector(_right, -_vl.x * 1.5); // side force: kills sideslip
    }
    vel.addScaledVector(_acc, dt);
    pos.addScaledVector(vel, dt);

    // Control authority grows with airspeed; weathervane stability points the nose along the flight path
    const auth = clamp(v / 28, 0, 1), stab = clamp(v / 15, 0, 1.5);
    const a = clamp(aoa, -1, 1), b = clamp(beta, -1, 1);
    _tgt.set(
      c.pitch * 1.1 * auth - (a - 0.05) * 2.5 * stab,
      c.yaw * 0.6 * auth - b * 2.5 * stab,
      -c.roll * ac.ROLL * auth - _right.y * 0.6 * auth, // dihedral: gently levels the wings
    );
    rates.lerp(_tgt, Math.min(1, dt * 5));
    q.multiply(_dq.setFromEuler(_e.set(rates.x * dt, rates.y * dt, rates.z * dt, 'XYZ'))).normalize();
    this.stall = aoa > ac.STALL || v < ac.SLOW;

    if (world.hitObstacle(pos.x, pos.y, pos.z)) return this.crash('hit an obstacle');
    const gh = world.groundAt(pos.x, pos.z);
    if (pos.y - GEAR_H <= gh) this.touchdown(gh);
  }

  // Wheels reached the ground: judge the landing
  touchdown(gh) {
    const { vel, pos } = this;
    _e.setFromQuaternion(this.q, 'YXZ');
    const pitch = _e.x, yaw = _e.y, roll = _e.z;
    const sink = -vel.y, hs = Math.hypot(vel.x, vel.z);
    this.lastSink = sink; // how firm the last touchdown was (adventure postmarks)
    if (gh < WATER + 0.5) return this.crash('ditched in the water');
    if (sink > 4) return this.crash('landed too hard');
    if (Math.abs(roll) > 0.3) return this.crash('wing hit the ground');
    if (pitch < -0.12) return this.crash('nose hit the ground');
    if (pitch > 0.45) return this.crash('tail strike');
    if (hs > 50) return this.crash('touched down too fast');
    if (this.world.slopeAt(pos.x, pos.z) > 0.15) return this.crash('hit the terrain');
    this.state = 'ground';
    this.heading = yaw;
    this.gPitch = pitch;
    this.speed = Math.max(0, -vel.x * Math.sin(yaw) - vel.z * Math.cos(yaw));
    pos.y = gh + GEAR_H;
    vel.set(0, 0, 0);
    this.rates.set(0, 0, 0);
  }

  groundStep(dt, brake) {
    const { pos, ctrl: c, world, ac } = this;
    // Taildragger: tail down when slow, tail lifts with speed; back pressure raises the nose for rotation
    const f = clamp(this.speed / 20, 0, 1);
    const target = TAIL_PITCH * (1 - f) + (Math.max(0, c.pitch) * 0.2 + Math.min(0, c.pitch) * 0.02 - 0.03) * f;
    this.gPitch += (target - this.gPitch) * Math.min(1, dt * 3);
    this.heading += c.yaw * 0.9 * clamp(this.speed / 3, 0, 1) * dt;

    const dx = -Math.sin(this.heading), dz = -Math.cos(this.heading);
    const air = this.speed - (wind.vec.x * dx + wind.vec.z * dz); // headwind adds airspeed
    this.air = Math.max(0, air);
    const slope = (world.groundAt(pos.x + dx * 2, pos.z + dz * 2) - world.groundAt(pos.x - dx * 2, pos.z - dz * 2)) / 4;
    const acc = this.throttle * ac.THRUST - ac.KD * air * Math.abs(air) - G * slope; // uphill slows you, downhill speeds you up
    const friction = ROLL_FRICTION + (brake ? BRAKE : 0);
    this.speed = Math.max(0, this.speed + (acc - friction) * dt);

    pos.x += dx * this.speed * dt;
    pos.z += dz * this.speed * dt;
    const gh = world.groundAt(pos.x, pos.z);
    pos.y = gh + GEAR_H;
    this.q.setFromEuler(_e.set(this.gPitch, this.heading, 0, 'YXZ'));
    if (gh < WATER + 0.3) return this.crash('rolled into the water');
    if (world.hitObstacle(pos.x, pos.y, pos.z)) return this.crash('hit an obstacle');

    // Liftoff only when the wings actually carry the weight
    if (ac.KL * liftCoef(ac, this.gPitch) * this.air * this.air > G) {
      this.state = 'air';
      this.flown = true;
      this.vel.set(dx * this.speed, 0.5, dz * this.speed);
      this.rates.set(0, 0, 0);
      pos.y += 0.05;
    }
  }

  crash(message) {
    this.state = 'crashed';
    this.message = message;
    this.stall = false;
    this.throttle = 0;
    this.speed = 0;
    this.vel.set(0, 0, 0);
    this.pos.y = Math.max(this.pos.y, this.world.groundAt(this.pos.x, this.pos.z) + 1);
    this.q.multiply(_dq.setFromEuler(_e.set(-0.3, 0, 0.45, 'XYZ')));
  }
}
