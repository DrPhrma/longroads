import * as THREE from "three";

// ─── Config ───────────────────────────────────────────────
const ROAD_WIDTH = 10;
const LANE_MARK = 0.18;
const SEGMENT_LEN = 40;
const SEGMENT_COUNT = 18;
const MAX_SPEED = 42;
const ACCEL = 28;
const BRAKE = 48;
const FRICTION = 8;
const STEER_SPEED = 2.4;
const STEER_RETURN = 3.2;

// ─── State ────────────────────────────────────────────────
const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
};

let started = false;
let speed = 0;
let distance = 0;
let steer = 0;
let carX = 0;

// ─── DOM ──────────────────────────────────────────────────
const speedEl = document.getElementById("speed");
const distEl = document.getElementById("distance");
const overlay = document.getElementById("overlay");

function startGame() {
  if (started) return;
  started = true;
  overlay.classList.add("hidden");
}

overlay.addEventListener("click", startGame);
overlay.addEventListener("touchstart", (e) => {
  e.preventDefault();
  startGame();
});

window.addEventListener("keydown", (e) => {
  if (!started) startGame();
  if (e.code === "KeyW" || e.code === "ArrowUp") keys.up = true;
  if (e.code === "KeyS" || e.code === "ArrowDown") keys.down = true;
  if (e.code === "KeyA" || e.code === "ArrowLeft") keys.left = true;
  if (e.code === "KeyD" || e.code === "ArrowRight") keys.right = true;
  if (e.code === "Space") {
    e.preventDefault();
    keys.down = true;
  }
  if (e.code === "KeyR") restart();
});

window.addEventListener("keyup", (e) => {
  if (e.code === "KeyW" || e.code === "ArrowUp") keys.up = false;
  if (e.code === "KeyS" || e.code === "ArrowDown") keys.down = false;
  if (e.code === "KeyA" || e.code === "ArrowLeft") keys.left = false;
  if (e.code === "KeyD" || e.code === "ArrowRight") keys.right = false;
  if (e.code === "Space") keys.down = false;
});

// Touch: hold right half = gas, left = steer zones
let touchId = null;
window.addEventListener(
  "touchstart",
  (e) => {
    if (!started) return;
    const t = e.changedTouches[0];
    touchId = t.identifier;
    const x = t.clientX / window.innerWidth;
    if (x < 0.35) keys.left = true;
    else if (x > 0.65) keys.right = true;
    else keys.up = true;
  },
  { passive: true }
);
window.addEventListener(
  "touchend",
  (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchId) {
        keys.up = keys.left = keys.right = keys.down = false;
        touchId = null;
      }
    }
  },
  { passive: true }
);

// ─── Scene ────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d9);
scene.fog = new THREE.Fog(0x87b5d9, 80, 220);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  400
);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lights
const hemi = new THREE.HemisphereLight(0xb8d4f0, 0x3d5a3a, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
sun.position.set(40, 80, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 200;
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
scene.add(sun);

// ─── Ground strips (grass) ────────────────────────────────
const grassMat = new THREE.MeshLambertMaterial({ color: 0x4a7a3a });
const grassGeo = new THREE.PlaneGeometry(200, SEGMENT_LEN * SEGMENT_COUNT + 80);
const grass = new THREE.Mesh(grassGeo, grassMat);
grass.rotation.x = -Math.PI / 2;
grass.position.y = -0.05;
grass.receiveShadow = true;
scene.add(grass);

// ─── Road segments ────────────────────────────────────────
const roadMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
const lineMat = new THREE.MeshBasicMaterial({ color: 0xf0f0f0 });
const edgeMat = new THREE.MeshBasicMaterial({ color: 0xf5c542 });

const segments = [];
let nextZ = 0;

function makeSegment(z) {
  const group = new THREE.Group();
  group.position.z = z;

  // slight random height offset for gentle hills
  const yOff = Math.sin(z * 0.012) * 1.8 + Math.sin(z * 0.031) * 0.9;
  group.position.y = yOff;

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_WIDTH, SEGMENT_LEN),
    roadMat
  );
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  group.add(road);

  // center dashed line pieces
  const dashCount = 4;
  const dashLen = SEGMENT_LEN / (dashCount * 2);
  for (let i = 0; i < dashCount; i++) {
    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(LANE_MARK, dashLen),
      lineMat
    );
    dash.rotation.x = -Math.PI / 2;
    dash.position.y = 0.02;
    dash.position.z = -SEGMENT_LEN / 2 + dashLen + i * dashLen * 2;
    group.add(dash);
  }

  // edge lines
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, SEGMENT_LEN),
      edgeMat
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.set((ROAD_WIDTH / 2 - 0.3) * side, 0.025, 0);
    group.add(edge);
  }

  // roadside trees (simple cones)
  for (let i = 0; i < 3; i++) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const tree = makeTree();
    tree.position.set(
      side * (ROAD_WIDTH / 2 + 4 + Math.random() * 12),
      0,
      (Math.random() - 0.5) * SEGMENT_LEN
    );
    group.add(tree);
  }

  scene.add(group);
  return group;
}

function makeTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6),
    new THREE.MeshLambertMaterial({ color: 0x5c3a1e })
  );
  trunk.position.y = 0.6;
  trunk.castShadow = true;
  g.add(trunk);
  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 2.4, 7),
    new THREE.MeshLambertMaterial({ color: 0x2d6b2d })
  );
  leaves.position.y = 2.2;
  leaves.castShadow = true;
  g.add(leaves);
  return g;
}

for (let i = 0; i < SEGMENT_COUNT; i++) {
  segments.push(makeSegment(nextZ));
  nextZ -= SEGMENT_LEN;
}

// ─── Car ──────────────────────────────────────────────────
function makeCar() {
  const car = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xc45c2a });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1e });
  const glassMat = new THREE.MeshLambertMaterial({
    color: 0x88b8d8,
    transparent: true,
    opacity: 0.75,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 3.2), bodyMat);
  body.position.y = 0.45;
  body.castShadow = true;
  car.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.6), bodyMat);
  cabin.position.set(0, 0.85, -0.15);
  cabin.castShadow = true;
  car.add(cabin);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.32, 0.08), glassMat);
  windshield.position.set(0, 0.85, 0.65);
  car.add(windshield);

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 12);
  const positions = [
    [-0.85, 0.32, 1.0],
    [0.85, 0.32, 1.0],
    [-0.85, 0.32, -1.0],
    [0.85, 0.32, -1.0],
  ];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    w.castShadow = true;
    car.add(w);
  }

  return car;
}

const car = makeCar();
scene.add(car);

// ─── Camera follow ────────────────────────────────────────
const camOffset = new THREE.Vector3(0, 4.5, 9);
const camLook = new THREE.Vector3(0, 1.2, -12);

// ─── Restart ──────────────────────────────────────────────
function restart() {
  speed = 0;
  distance = 0;
  steer = 0;
  carX = 0;
  car.position.set(0, 0, 0);
  car.rotation.set(0, 0, 0);
  // rebuild road positions
  nextZ = 0;
  for (const seg of segments) {
    scene.remove(seg);
  }
  segments.length = 0;
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    segments.push(makeSegment(nextZ));
    nextZ -= SEGMENT_LEN;
  }
}

// ─── Loop ─────────────────────────────────────────────────
const clock = new THREE.Clock();
let lastHud = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (started) {
    // speed
    if (keys.up) speed += ACCEL * dt;
    if (keys.down) speed -= BRAKE * dt;
    speed -= FRICTION * dt * (speed > 0 ? 1 : 0);
    speed = THREE.MathUtils.clamp(speed, 0, MAX_SPEED);

    // steer
    if (keys.left) steer += STEER_SPEED * dt;
    else if (keys.right) steer -= STEER_SPEED * dt;
    else steer = THREE.MathUtils.damp(steer, 0, STEER_RETURN, dt);
    steer = THREE.MathUtils.clamp(steer, -1, 1);

    const move = speed * dt;
    distance += move;

    // lateral
    carX += steer * speed * 0.12 * dt * 10;
    const half = ROAD_WIDTH / 2 - 1.1;
    carX = THREE.MathUtils.clamp(carX, -half, half);

    // move world toward camera (car stays near origin on Z)
    for (const seg of segments) {
      seg.position.z += move;
    }

    // recycle segments behind camera
    for (const seg of segments) {
      if (seg.position.z > SEGMENT_LEN * 1.5) {
        seg.position.z = nextZ;
        const yOff =
          Math.sin(nextZ * 0.012) * 1.8 + Math.sin(nextZ * 0.031) * 0.9;
        seg.position.y = yOff;
        nextZ -= SEGMENT_LEN;
      }
    }

    // car pose
    const roadY =
      Math.sin((-distance) * 0.012) * 1.8 +
      Math.sin((-distance) * 0.031) * 0.9;
    car.position.x = carX;
    car.position.y = roadY;
    car.position.z = 0;
    car.rotation.y = steer * 0.25;
    car.rotation.z = -steer * 0.12;
    car.rotation.x = -speed * 0.002;

    // camera
    const targetCam = new THREE.Vector3(
      car.position.x * 0.35,
      car.position.y + camOffset.y,
      camOffset.z
    );
    camera.position.lerp(targetCam, 1 - Math.exp(-6 * dt));
    const look = new THREE.Vector3(
      car.position.x * 0.5,
      car.position.y + camLook.y,
      camLook.z
    );
    camera.lookAt(look);
  } else {
    camera.position.set(0, 5, 12);
    camera.lookAt(0, 1, -5);
  }

  // HUD throttle
  lastHud += dt;
  if (lastHud > 0.08) {
    lastHud = 0;
    const kmh = Math.round(speed * 3.6);
    speedEl.innerHTML = `${kmh} <span>km/h</span>`;
    distEl.innerHTML = `${Math.round(distance)} <span>m</span>`;
  }

  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
