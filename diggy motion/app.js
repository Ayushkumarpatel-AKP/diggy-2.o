import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const motions = [
  { id: "standing-idle-fbx", file: "Standing Idle.fbx", name: "STANDING IDLE", icon: "◌", description: "Uploaded standing idle animation", duration: 1, energy: 70 },
  { id: "walking-fbx", file: "Walking.fbx", name: "WALKING", icon: "▶", description: "Uploaded walking animation", duration: 1.1, energy: 100 },
  { id: "angry-point-fbx", file: "Angry Point.fbx", name: "ANGRY POINT", icon: "!", description: "Uploaded angry point animation", duration: 1, energy: 100 },
  { id: "arm-stretching-fbx", file: "Arm Stretching.fbx", name: "ARM STRETCHING", icon: "↔", description: "Uploaded arm stretching animation", duration: 1, energy: 100 },
  { id: "happy-walk-fbx", file: "Happy Walk.fbx", name: "HAPPY WALK", icon: "★", description: "Uploaded happy walk animation", duration: 1, energy: 100 },
  { id: "clapping-fbx", file: "Clapping.fbx", name: "CLAPPING", icon: "+", description: "Uploaded clapping animation", duration: 1, energy: 100 },
  { id: "looking-fbx", file: "Looking.fbx", name: "LOOKING", icon: "◉", description: "Uploaded looking animation", duration: 1, energy: 100 },
  { id: "standing-greeting-fbx", file: "Standing Greeting.fbx", name: "STANDING GREETING", icon: "✦", description: "Uploaded standing greeting animation", duration: 1, energy: 100 },
];

const defaultHandPose = {
  leftArmX: 0, leftArmZ: 0, leftElbowX: 0,
  rightArmX: 0, rightArmZ: 0, rightElbowX: 0,
};
const requestedIdlePose = {
  leftArmX: -0.66,
  leftArmZ: -0.96,
  leftElbowX: 0.24,
  rightArmX: -0.39,
  rightArmZ: 1.06,
  rightElbowX: -0.2,
};
const expressionNames = ["Smile", "Smile2", "Smile3", "Blink", "Wink", "Up", "Down", "Left", "Right", "Sad", "Sad2", "Sad3", "Kiss", "Nose", "Confused", "Angry", "Surprised", "Smug"];
const expressionPresets = {
  happy: { Smile: 0.85, Smile2: 0.45, Smile3: 0.25 },
  surprised: { Surprised: 0.9, Up: 0.35, Blink: 0 },
  angry: { Angry: 0.9, Sad: 0.15 },
  wink: { Smile: 0.35, Wink: 1 },
  sad: { Sad: 0.85, Sad2: 0.45, Sad3: 0.25, Down: 0.25 },
  kiss: { Kiss: 0.95, Smile: 0.2 },
  confused: { Confused: 0.9, Up: 0.2, Left: 0.3 },
  smug: { Smug: 0.9, Smile: 0.3 },
  sleepy: { Sad: 0.35, Sad2: 0.2, Blink: 0.75, Down: 0.25 },
  excited: { Smile: 0.95, Smile2: 0.7, Surprised: 0.35, Up: 0.25 },
};
const motionExpressionProfiles = {
  "standing-idle-fbx": "smug",
  "walking-fbx": "happy",
  "angry-point-fbx": "angry",
  "arm-stretching-fbx": "surprised",
  "happy-walk-fbx": "excited",
  "clapping-fbx": "happy",
  "looking-fbx": "confused",
  "standing-greeting-fbx": "happy",
};
const boneNames = [
  "hips", "spine", "chest", "neck", "head",
  "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot",
];

const state = {
  selectedMotion: motions[0],
  energy: 70,
  speed: 100,
  mirror: false,
  playing: false,
  currentTime: 0,
  grid: true,
  sequence: [],
  modelRoot: null,
  restRotations: new Map(),
  handPose: { ...defaultHandPose },
  restHandPose: { ...requestedIdlePose },
  boneCalibration: new Map(),
  selectedBone: "head",
  bonePointsVisible: true,
  boneMarkers: new THREE.Group(),
  fbxRoot: null,
  fbxMixer: null,
  fbxClock: new THREE.Clock(),
  fbxAnimationPlaying: false,
  fbxAction: null,
  loadedAnimations: new Map(),
  lightColor: "#ffffff",
  lightIntensity: 1.6,
  expressions: Object.fromEntries(expressionNames.map((name) => [name, 0])),
  expressionCurrent: Object.fromEntries(expressionNames.map((name) => [name, 0])),
  morphMeshes: [],
  activeExpressionPreset: null,
  expressionAnimated: true,
};
localStorage.setItem("diggy-rest-hand-pose", JSON.stringify(state.restHandPose));

const els = {
  viewport: document.querySelector("#viewport"),
  status: document.querySelector("#load-status"),
  loading: document.querySelector("#loading-message"),
  motionList: document.querySelector("#motion-list"),
  selectedName: document.querySelector("#selected-motion-name"),
  selectedDuration: document.querySelector("#selected-motion-duration"),
  timeline: document.querySelector("#timeline"),
  currentTime: document.querySelector("#current-time"),
  totalTime: document.querySelector("#total-time"),
  play: document.querySelector("#play-toggle"),
  energy: document.querySelector("#energy-slider"),
  energyOutput: document.querySelector("#energy-output"),
  speed: document.querySelector("#speed-slider"),
  speedOutput: document.querySelector("#speed-output"),
  mirror: document.querySelector("#mirror-toggle"),
  sequence: document.querySelector("#sequence"),
  handSettingsOutput: document.querySelector("#hand-settings-output"),
  boneSelect: document.querySelector("#bone-select"),
  boneX: document.querySelector("#bone-x"),
  boneY: document.querySelector("#bone-y"),
  boneZ: document.querySelector("#bone-z"),
  boneXOutput: document.querySelector("#bone-x-output"),
  boneYOutput: document.querySelector("#bone-y-output"),
  boneZOutput: document.querySelector("#bone-z-output"),
  boneSettingsOutput: document.querySelector("#bone-settings-output"),
  loadChiori: document.querySelector("#load-chiori"),
  playWalking: document.querySelector("#play-walking"),
  lightColor: document.querySelector("#light-color"),
  lightIntensity: document.querySelector("#light-intensity"),
  lightIntensityOutput: document.querySelector("#light-intensity-output"),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color("#030a05");
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
camera.position.set(0, 1.25, -4.2);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
els.viewport.appendChild(renderer.domElement);
const boneRaycaster = new THREE.Raycaster();
const bonePointer = new THREE.Vector2();

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, 0);
controls.enablePan = false;
controls.minDistance = 2.4;
controls.maxDistance = 6;

// Keep the stage green through the UI and background, not through the avatar lighting.
// Neutral lights preserve the colors authored in the VRM materials.
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
keyLight.position.set(2, 4, 3);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0xffffff, 0.7, 8);
rimLight.position.set(-2, 2, -2);
scene.add(rimLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
fillLight.position.set(-2, 2, 3);
scene.add(fillLight);

const grid = new THREE.GridHelper(10, 20, 0x12301c, 0x06100a);
grid.position.y = -0.02;
scene.add(grid);
scene.add(state.boneMarkers);

function resize() {
  const { width, height } = els.viewport.getBoundingClientRect();
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
window.addEventListener("resize", resize);
resize();

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  return `${mins}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

function renderMotionList() {
  document.querySelector("#motion-count").textContent = `${motions.length.toString().padStart(2, "0")} MOVES`;
  els.motionList.innerHTML = motions.map((motion) => `
    <button class="motion-card ${motion.id === state.selectedMotion.id ? "is-selected" : ""}" data-motion="${motion.id}">
      <span class="motion-icon">${motion.icon}</span>
      <span><strong>${motion.name}</strong><small>${motion.description}</small></span>
      <span class="motion-arrow">›</span>
    </button>
  `).join("");
  els.motionList.querySelectorAll("[data-motion]").forEach((button) => {
    button.addEventListener("click", () => loadUploadedAnimation(motions.find((motion) => motion.id === button.dataset.motion)));
  });
}

function selectMotion(motion) {
  state.selectedMotion = motion;
  const expressionProfile = expressionPresets[motionExpressionProfiles[motion.id]] || {};
  setExpressions(expressionProfile);
  state.currentTime = 0;
  state.energy = motion.energy;
  els.timeline.max = motion.duration;
  els.timeline.value = 0;
  els.selectedName.textContent = motion.name;
  els.selectedDuration.textContent = `${motion.duration.toFixed(1)} SEC`;
  els.totalTime.textContent = formatTime(motion.duration);
  els.energy.value = state.energy;
  els.energyOutput.value = `${state.energy}%`;
  renderMotionList();
  applyPose(0);
}

function renderSequence() {
  els.sequence.innerHTML = state.sequence.length
    ? state.sequence.map((item, index) => `<div class="sequence-item"><strong>${index + 1}. ${item.name}</strong><span>${item.duration.toFixed(1)} SEC // ${item.energy}% ENERGY</span></div>`).join("")
    : `<div class="sequence-empty">ADD A MOTION TO BUILD YOUR SEQUENCE</div>`;
}

function bone(name) {
  return state.vrm?.humanoid?.getRawBoneNode(name);
}

function calibrationFor(name) {
  return state.boneCalibration.get(name) || { x: 0, y: 0, z: 0 };
}

function applyBoneCalibration() {
  for (const name of boneNames) {
    const node = bone(name);
    const offset = calibrationFor(name);
    if (node) {
      node.rotation.x += offset.x;
      node.rotation.y += offset.y;
      node.rotation.z += offset.z;
    }
  }
}

function updateBoneSettingsOutput() {
  const offset = calibrationFor(state.selectedBone);
  els.boneSettingsOutput.value = JSON.stringify({
    bone: state.selectedBone,
    x: Number(offset.x.toFixed(2)),
    y: Number(offset.y.toFixed(2)),
    z: Number(offset.z.toFixed(2)),
  }, null, 2);
}

function updateBoneControls() {
  const offset = calibrationFor(state.selectedBone);
  els.boneSelect.value = state.selectedBone;
  els.boneX.value = offset.x;
  els.boneY.value = offset.y;
  els.boneZ.value = offset.z;
  els.boneXOutput.value = offset.x.toFixed(2);
  els.boneYOutput.value = offset.y.toFixed(2);
  els.boneZOutput.value = offset.z.toFixed(2);
  updateBoneSettingsOutput();
}

function selectBone(name) {
  if (!bone(name)) return;
  state.selectedBone = name;
  updateBoneControls();
  state.boneMarkers.children.forEach((marker) => {
    marker.material.color.set(marker.userData.boneName === name ? "#ffb000" : "#00ff41");
    marker.scale.setScalar(marker.userData.boneName === name ? 1.45 : 1);
  });
}

function createBoneMarkers() {
  state.boneMarkers.clear();
  for (const name of boneNames) {
    if (!bone(name)) continue;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 8),
      new THREE.MeshBasicMaterial({ color: "#00ff41", depthTest: false }),
    );
    marker.renderOrder = 10;
    marker.userData.boneName = name;
    state.boneMarkers.add(marker);
  }
  els.boneSelect.innerHTML = boneNames
    .filter((name) => bone(name))
    .map((name) => `<option value="${name}">${name}</option>`)
    .join("");
  selectBone(state.selectedBone);
}

function updateBoneMarkers() {
  state.boneMarkers.visible = state.bonePointsVisible && state.modelRoot?.visible !== false;
  for (const marker of state.boneMarkers.children) {
    const node = bone(marker.userData.boneName);
    if (!node) continue;
    node.getWorldPosition(marker.position);
  }
}

function rotate(name, x = 0, y = 0, z = 0) {
  const node = bone(name);
  if (!node) return;
  node.rotation.set(x, y, z);
}

function applyNeutralPose() {
  state.modelRoot?.position.set(0, 0, 0);
  // Relaxed rest pose: arms hang beside the torso with a small elbow bend.
  rotate("leftUpperArm", 0.12 + state.restHandPose.leftArmX, 0.04, -0.08 + state.restHandPose.leftArmZ);
  rotate("rightUpperArm", 0.12 + state.restHandPose.rightArmX, -0.04, 0.08 + state.restHandPose.rightArmZ);
  rotate("leftLowerArm", -0.16 + state.restHandPose.leftElbowX, 0.02, -0.04);
  rotate("rightLowerArm", -0.16 + state.restHandPose.rightElbowX, -0.02, 0.04);
  rotate("leftUpperLeg", 0, 0, 0);
  rotate("rightUpperLeg", 0, 0, 0);
  rotate("spine", 0, 0, 0);
  rotate("chest", 0, 0, 0);
  rotate("neck", 0, 0, 0);
}

function applyPose(time) {
  const t = time * (state.speed / 100);
  const phase = (t / state.selectedMotion.duration) * Math.PI * 2;
  const amount = state.energy / 70;
  const direction = state.mirror ? -1 : 1;
  const motion = state.selectedMotion.id;
  applyNeutralPose();
  if (motion === "hello") {
    // Natural 3D hello: anticipate, lift from the shoulder, wave at the wrist,
    // then settle back into the user's saved idle pose.
    const progress = Math.min(time / state.selectedMotion.duration, 1);
    const smooth = (value) => value * value * (3 - 2 * value);
    const lift = smooth(Math.min(progress / 0.38, 1)) * (1 - smooth(Math.max((progress - 0.78) / 0.22, 0)));
    const anticipation = 1 - smooth(Math.min(progress / 0.16, 1));
    const wave = Math.sin(Math.max(progress - 0.34, 0) * Math.PI * 8) * lift;
    const wristWave = Math.sin(Math.max(progress - 0.34, 0) * Math.PI * 8) * 0.42 * lift;
    const bounce = Math.sin(Math.min(progress / 0.7, 1) * Math.PI) * 0.035 * amount;
    const rest = state.restHandPose;
    state.modelRoot?.position.set(0, bounce, 0);
    rotate("spine", 0.025 * anticipation, 0.04 * direction * lift, -0.02 * direction * lift);
    rotate("chest", 0.02 * anticipation, -0.06 * direction * lift, 0.025 * direction * lift);
    rotate("rightUpperArm", 0.12 + rest.rightArmX - 1.45 * lift - 0.08 * anticipation, -0.04 + 0.52 * direction * lift, 0.08 + rest.rightArmZ - 0.85 * direction * lift);
    // The forearm bend is deliberately close to 90 degrees at the top of the wave.
    // Keep the elbow slightly open during the lift, then settle it back to rest.
    const elbowBend = -1.42 * lift;
    rotate("rightLowerArm", -0.16 + rest.rightElbowX + elbowBend + 0.28 * wave, -0.02 + 0.22 * direction * lift, 0.04 + 0.18 * wave);
    rotate("rightHand", 0, 0.28 * wristWave, 0.55 * direction * wristWave);
    rotate("leftUpperArm", 0.12 + rest.leftArmX + 0.04 * Math.sin(progress * Math.PI * 2), 0.04, -0.08 + rest.leftArmZ - 0.06 * direction * lift);
    rotate("leftLowerArm", -0.16 + rest.leftElbowX, 0.02, -0.04);
    rotate("neck", -0.06 * lift, 0.08 * direction * lift, 0.1 * direction * lift);
  } else if (motion === "cheer") {
    const bounce = Math.abs(Math.sin(phase)) * 0.14 * amount;
    const punch = Math.max(0, Math.sin(phase)) * amount;
    state.modelRoot?.position.set(0, bounce, 0);
    rotate("leftUpperArm", state.restHandPose.leftArmX - 0.6 * punch, 0, state.restHandPose.leftArmZ - 0.75 * direction * punch);
    rotate("rightUpperArm", state.restHandPose.rightArmX - 0.6 * punch, 0, state.restHandPose.rightArmZ + 0.75 * direction * punch);
    rotate("leftLowerArm", -0.3 * punch, 0, 0);
    rotate("rightLowerArm", -0.3 * punch, 0, 0);
    rotate("leftUpperLeg", 0.18 * Math.sin(phase) * amount, 0, 0);
    rotate("rightUpperLeg", -0.18 * Math.sin(phase) * amount, 0, 0);
    rotate("spine", 0, 0.12 * Math.sin(phase) * direction, 0);
    rotate("neck", -0.1 * punch, 0, 0);
  } else if (motion === "hero") {
    const breath = Math.sin(phase) * 0.04 * amount;
    rotate("leftUpperArm", 0.12 + state.restHandPose.leftArmX + breath, 0.04, -0.08 + state.restHandPose.leftArmZ + 0.12 * direction);
    rotate("rightUpperArm", 0.12 + state.restHandPose.rightArmX + breath, -0.04, 0.08 + state.restHandPose.rightArmZ + 0.12 * direction);
    rotate("leftLowerArm", 0.25, 0, 0);
    rotate("rightLowerArm", 0.25, 0, 0);
    rotate("chest", 0, 0.04 * Math.sin(phase), 0);
    rotate("neck", -0.03 * Math.sin(phase), 0, 0);
  } else if (motion === "dance") {
    const bounce = Math.abs(Math.sin(phase)) * 0.12 * amount;
    state.modelRoot?.position.set(0, bounce, 0);
    rotate("leftUpperArm", 0.5 * Math.sin(phase) * amount, 0, -0.9 * direction);
    rotate("rightUpperArm", -0.5 * Math.sin(phase) * amount, 0, 0.9 * direction);
    rotate("leftUpperLeg", 0.25 * Math.sin(phase) * amount, 0, 0);
    rotate("rightUpperLeg", -0.25 * Math.sin(phase) * amount, 0, 0);
    rotate("spine", 0, 0.15 * Math.sin(phase) * amount, 0.08 * Math.sin(phase * 2));
  } else if (motion === "nod") {
    rotate("neck", 0.22 * Math.sin(phase) * amount, 0, 0);
    rotate("chest", 0.08 * Math.sin(phase) * amount, 0, 0);
  }
  applyHandControls();
  applyBoneCalibration();
}

function applyHandControls() {
  const leftArm = bone("leftUpperArm");
  const rightArm = bone("rightUpperArm");
  const leftElbow = bone("leftLowerArm");
  const rightElbow = bone("rightLowerArm");
  if (leftArm) {
    leftArm.rotation.x += state.handPose.leftArmX;
    leftArm.rotation.z += state.handPose.leftArmZ;
  }

  if (rightArm) {
    rightArm.rotation.x += state.handPose.rightArmX;
    rightArm.rotation.z += state.handPose.rightArmZ;
  }
  if (leftElbow) leftElbow.rotation.x += state.handPose.leftElbowX;
  if (rightElbow) rightElbow.rotation.x += state.handPose.rightElbowX;
}

function updateHandSettingsOutput() {
  els.handSettingsOutput.value = JSON.stringify({
    leftArmX: Number(state.handPose.leftArmX.toFixed(2)),
    leftArmZ: Number(state.handPose.leftArmZ.toFixed(2)),
    leftElbowX: Number(state.handPose.leftElbowX.toFixed(2)),
    rightArmX: Number(state.handPose.rightArmX.toFixed(2)),
    rightArmZ: Number(state.handPose.rightArmZ.toFixed(2)),
    rightElbowX: Number(state.handPose.rightElbowX.toFixed(2)),
  }, null, 2);
}

function updateTransport() {
  els.timeline.value = state.currentTime;
  els.currentTime.textContent = formatTime(state.currentTime);
  els.play.textContent = state.playing ? "PAUSE" : "PLAY";
}

function setFbxVisibility(visible) {
  if (state.fbxRoot) state.fbxRoot.visible = visible;
  state.boneMarkers.visible = false;
}

function frameFbx(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const height = Math.max(size.y, 0.01);
  const scale = 2.15 / height;
  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
}

function applyChioriColors(root) {
  const textureLoader = new THREE.TextureLoader();
  const texturePaths = {
    face: "./tex/avatar_girl_sword_chiori_mat_face.png",
    body: "./tex/avatar_girl_sword_chiori_mat_body.png",
    hair: "./tex/avatar_girl_sword_chiori_mat_hair.png",
  };
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    object.material = materials.map((source) => {
      const material = source.clone();
      const name = `${material.name} ${object.name}`.toLowerCase();
      let texturePath = texturePaths.body;
      if (/face|eye|head/.test(name)) texturePath = texturePaths.face;
      else if (/hair|bang/.test(name)) texturePath = texturePaths.hair;
      textureLoader.load(texturePath, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        material.map = texture;
        material.color.set("#ffffff");
        material.needsUpdate = true;
      });
      material.needsUpdate = true;
      return material;
    });
  });
}

function setExpressions(values = {}) {
  state.activeExpressionPreset = Object.entries(expressionPresets).find(([, preset]) =>
    expressionNames.every((name) => (preset[name] ?? 0) === (values[name] ?? 0))
  )?.[0] ?? null;
  for (const name of expressionNames) state.expressions[name] = values[name] ?? 0;
  applyExpressions();
}

function easeExpression(value) {
  return value * value * (3 - 2 * value);
}

function applyExpressions(time = 0) {
  const smoothing = 0.12;
  for (const name of expressionNames) {
    const current = state.expressionCurrent[name] ?? 0;
    const target = state.expressions[name] ?? 0;
    state.expressionCurrent[name] = current + (target - current) * smoothing;
  }
  for (const mesh of state.morphMeshes) {
    for (const name of expressionNames) {
      const value = state.expressionCurrent[name];
      const index = mesh.morphTargetDictionary?.[name];
      if (index === undefined) continue;
      let animatedValue = value;
      if (state.expressionAnimated && state.activeExpressionPreset) {
        const blinkCycle = (Math.sin(time * 1.45 - 1.1) + 1) / 2;
        const blink = easeExpression(Math.min(Math.max((blinkCycle - 0.91) / 0.09, 0), 1));
        if (name === "Blink" && ["happy", "excited", "smug", "surprised"].includes(state.activeExpressionPreset)) {
          animatedValue = Math.max(value, blink);
        }
        if (name === "Smile" && ["happy", "excited"].includes(state.activeExpressionPreset)) {
          const smileWave = (Math.sin(time * 2.2) + 1) / 2;
          animatedValue = Math.min(1, value + easeExpression(smileWave) * 0.06);
        }
        if (name === "Surprised" && state.activeExpressionPreset === "excited") {
          const surpriseWave = Math.max(0, Math.sin(time * 3));
          animatedValue = Math.min(1, value + easeExpression(surpriseWave) * 0.12);
        }
      }
      mesh.morphTargetInfluences[index] = Math.max(0, animatedValue);
    }
  }
}

function findMorphMeshes(root) {
  state.morphMeshes = [];
  root.traverse((object) => {
    if (object.isMesh && object.morphTargetDictionary && object.morphTargetInfluences) state.morphMeshes.push(object);
  });
  applyExpressions();
}

async function loadChiori() {
  try {
    const loader = new FBXLoader();
    const fbx = await loader.loadAsync("./Chiori.fbx");
    if (state.fbxRoot) scene.remove(state.fbxRoot);
    state.fbxRoot = fbx;
    frameFbx(fbx);
    applyChioriColors(fbx);
    findMorphMeshes(fbx);
    fbx.rotation.y = Math.PI;
    scene.add(fbx);
    setFbxVisibility(true);
    els.loading?.remove();
    els.status.textContent = "CHIORI FBX READY";
    els.status.style.color = "var(--green)";
    els.status.style.borderColor = "var(--green)";
  } catch (error) {
    els.status.textContent = "CHIORI FBX ERROR";
    els.status.style.color = "var(--red)";
    console.error("Could not load Chiori.fbx", error);
  }
}

async function loadWalking() {
  await loadUploadedAnimation(motions.find((motion) => motion.id === "walking-fbx"));
}

async function loadUploadedAnimation(motion) {
  try {
    if (!state.fbxRoot) await loadChiori();
    let animationSource = state.loadedAnimations.get(motion.id);
    if (!animationSource) {
      const loader = new FBXLoader();
      animationSource = await loader.loadAsync(`./${encodeURIComponent(motion.file).replace(/%20/g, " ")}`);
      state.loadedAnimations.set(motion.id, animationSource);
    }
    if (!animationSource.animations.length) {
      throw new Error(`${motion.file} does not contain an animation clip.`);
    }
    if (state.fbxMixer) state.fbxMixer.stopAllAction();
    state.fbxMixer = new THREE.AnimationMixer(state.fbxRoot);
    state.fbxAction = state.fbxMixer.clipAction(animationSource.animations[0]);
    state.selectedMotion = motion;
    state.selectedMotion.duration = animationSource.animations[0].duration;
    state.fbxAction.reset().play();
    state.fbxAnimationPlaying = true;
    state.playing = true;
    selectMotion(motion);
    setFbxVisibility(true);
    els.status.textContent = `${motion.name} READY`;
    els.status.style.color = "var(--green)";
    els.status.style.borderColor = "var(--green)";
  } catch (error) {
    els.status.textContent = "WALKING FBX ERROR";
    els.status.style.color = "var(--red)";
    console.error(`Could not load ${motion.file}`, error);
  }
}

function downloadFile(name, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

els.motionList.addEventListener("click", (event) => {
  if (event.target.closest("[data-motion]")) return;
});
els.play.addEventListener("click", () => {
  state.playing = !state.playing;
  state.fbxAnimationPlaying = state.playing;
  if (state.fbxAction) state.fbxAction.paused = !state.playing;
  updateTransport();
});
document.querySelector("#stop-button").addEventListener("click", () => {
  state.playing = false;
  state.fbxAnimationPlaying = false;
  state.currentTime = 0;
  if (state.fbxAction) {
    state.fbxAction.paused = true;
    state.fbxAction.time = 0;
    state.fbxMixer?.update(0);
  }
  updateTransport();
});
els.timeline.addEventListener("input", () => {
  state.currentTime = Number(els.timeline.value);
  if (state.fbxAction) {
    state.fbxAction.time = state.currentTime;
    state.fbxMixer?.update(0);
  }
  updateTransport();
});
els.energy.addEventListener("input", () => { state.energy = Number(els.energy.value); els.energyOutput.value = `${state.energy}%`; applyPose(state.currentTime); });
els.speed.addEventListener("input", () => { state.speed = Number(els.speed.value); els.speedOutput.value = `${state.speed}%`; });
els.mirror.addEventListener("click", () => { state.mirror = !state.mirror; els.mirror.textContent = `MIRROR: ${state.mirror ? "ON" : "OFF"}`; applyPose(state.currentTime); });
document.querySelector("#toggle-grid").addEventListener("click", (event) => { state.grid = !state.grid; grid.visible = state.grid; event.currentTarget.classList.toggle("is-active", state.grid); });
document.querySelector("#reset-camera").addEventListener("click", () => { camera.position.set(0, 1.25, -4.2); controls.target.set(0, 1.1, 0); controls.update(); });
els.loadChiori.addEventListener("click", loadChiori);
els.playWalking.addEventListener("click", loadWalking);
document.querySelector("#motion-list").addEventListener("dblclick", (event) => {
  const card = event.target.closest("[data-motion]");
  if (card) {
    state.sequence.push({ ...state.selectedMotion, energy: state.energy });
    renderSequence();
  }
});
document.querySelector("#clear-sequence").addEventListener("click", () => { state.sequence = []; renderSequence(); });
document.querySelector("#download-motion").addEventListener("click", () => {
  const boneCalibration = Object.fromEntries([...state.boneCalibration].map(([name, rotation]) => [name, rotation]));
  const payload = { format: "chiori-motion-v1", avatar: "Chiori.fbx", walkingClip: "Walking.fbx", motion: state.selectedMotion.id, duration: state.selectedMotion.duration, energy: state.energy, speed: state.speed, mirror: state.mirror, expressions: state.expressions, restHandPose: state.restHandPose, handPoseOffsets: state.handPose, boneCalibration, sequence: state.sequence.map(({ id, name, duration, energy }) => ({ id, name, duration, energy })), keyframes: [{ time: 0, label: "START" }, { time: state.selectedMotion.duration, label: "END" }] };
  downloadFile(`${state.selectedMotion.id}-motion.json`, JSON.stringify(payload, null, 2), "application/json");
});
els.lightColor.addEventListener("input", () => {
  const color = new THREE.Color(els.lightColor.value);
  keyLight.color.copy(color);
  rimLight.color.copy(color);
  fillLight.color.copy(color);
  state.lightColor = els.lightColor.value;
});
els.lightIntensity.addEventListener("input", () => {
  state.lightIntensity = Number(els.lightIntensity.value);
  els.lightIntensityOutput.value = `${state.lightIntensity.toFixed(1)}x`;
  keyLight.intensity = state.lightIntensity * 1.3;
  rimLight.intensity = state.lightIntensity * 0.45;
  fillLight.intensity = state.lightIntensity * 0.5;
});
document.querySelector("#export-video").addEventListener("click", () => {
  if (!window.MediaRecorder) return;
  const stream = renderer.domElement.captureStream(Number(document.querySelector("#fps-select").value));
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = () => downloadFile(`${state.selectedMotion.id}-preview.webm`, new Blob(chunks, { type: "video/webm" }), "video/webm");
  state.currentTime = 0; state.playing = true; recorder.start();
  setTimeout(() => { state.playing = false; recorder.stop(); }, state.selectedMotion.duration * 1000 / (state.speed / 100));
});

let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (state.playing) {
    state.currentTime += delta * (state.speed / 100);
    if (state.currentTime >= state.selectedMotion.duration) state.currentTime = 0;
    applyPose(state.currentTime);
    updateTransport();
  }
  if (state.fbxMixer && state.fbxAnimationPlaying) state.fbxMixer.update(state.fbxClock.getDelta());
  applyExpressions(now / 1000);
  controls.update();
  updateBoneMarkers();
  renderer.render(scene, camera);
}

renderMotionList();
renderSequence();
selectMotion(motions[0]);
loadWalking();
animate(performance.now());
