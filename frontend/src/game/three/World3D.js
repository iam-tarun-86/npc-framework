import * as THREE from 'three';
import { MAP_WIDTH, MAP_HEIGHT, NPC_POSITIONS, PLAYER_SPAWN, TILE_MAP } from '../data/villageMap';
import { CollisionSystem } from './CollisionSystem';

/* ─── deterministic pseudo-random hash for variety ─── */
function tileHash(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

export class World3D {
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth || window.innerWidth;
    this.height = container.clientHeight || window.innerHeight;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.animId = null;

    this.player = null;
    this.npcs = {};
    this.nearNPC = null;
    this.dialogueOpen = false;

    this.keys = {
      up: false,
      down: false,
      left: false,
      right: false,
      interact: false
    };

    this.tileScale = 2.0;
    this.interactRadius = 3.5;

    // Movement physics & animation states (FROZEN)
    this.velocity = new THREE.Vector3();
    this.maxSpeed = 6.2;
    this.acceleration = 36.0;
    this.friction = 26.0;
    this.turnSpeed = 14.0;
    this.currentFacing = 0;
    this.targetFacing = 0;
    this.isMoving = false;
    this.walkCycle = 0;

    // Collision system (FROZEN)
    this.collision = new CollisionSystem();
    this.playerRadius = 0.35;

    this.borinState = 'idle';
    this.patrolElapsed = 0;
    this.patrolDuration = 3.5;
    this.patrolTimer = null;
    this.patrolInterval = null;

    // Animated world elements
    this.animatedWater = null;
    this.fountainRipples = null;
    this.fountainCrystal = null;
    this.chimneySmoke = [];
    this.lanternFlickers = [];
    this.fireflies = [];
    this.fountainParticles = [];

    // Nameplate projection data
    this.npcScreenPositions = {};

    this.init();
  }

  tileToWorld(tileX, tileY) {
    const worldX = (tileX - MAP_WIDTH / 2 + 0.5) * this.tileScale;
    const worldZ = (tileY - MAP_HEIGHT / 2 + 0.5) * this.tileScale;
    return { x: worldX, z: worldZ };
  }

  worldToTile(worldX, worldZ) {
    const tileX = worldX / this.tileScale + MAP_WIDTH / 2 - 0.5;
    const tileY = worldZ / this.tileScale + MAP_HEIGHT / 2 - 0.5;
    return { x: tileX, y: tileY };
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1322);
    // Deep atmospheric twilight fog
    this.scene.fog = new THREE.FogExp2(0x0e1322, 0.014);

    const aspect = this.width / this.height;
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 1000);
    this.cameraOffset = new THREE.Vector3(0, 14.5, 13.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.container.appendChild(this.renderer.domElement);

    this.setupLighting();
    this.setupSkybox();
    this.setupEnvironment();
    this.setupEntities();
    this.setupFireflies();
    this.bindEvents();
    this.setupPatrol();

    this.clock = new THREE.Clock();
    this.animate();
  }

  /* ═══════════════════════════════════════════════════════
     CINEMATIC TWILIGHT LIGHTING
     ═══════════════════════════════════════════════════════ */
  setupLighting() {
    // Hemisphere: deep indigo sky fill with warm earthen ground bounce
    const hemiLight = new THREE.HemisphereLight(0x82a5d4, 0x423424, 1.15);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    // Golden-hour twilight directional sun
    const sunLight = new THREE.DirectionalLight(0xffc58a, 1.45);
    sunLight.position.set(22, 38, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 120;
    const d = 35;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0001;
    sunLight.shadow.normalBias = 0.05;
    sunLight.shadow.normalBias = 0.02;
    this.scene.add(sunLight);

    // Cool celestial rim light from opposing side
    const rimLight = new THREE.DirectionalLight(0x5a7ebb, 0.45);
    rimLight.position.set(-18, 16, -18);
    this.scene.add(rimLight);

    // Hero plaza & fountain magical ambient warmth
    const plazaLight = new THREE.PointLight(0xffa73b, 2.2, 28, 1.3);
    plazaLight.position.set(0, 3.2, 0);
    plazaLight.castShadow = false;
    plazaLight.shadow.mapSize.width = 512;
    plazaLight.shadow.mapSize.height = 512;
    this.scene.add(plazaLight);
    this.lanternFlickers.push(plazaLight);

    // Magical crystal light at fountain center
    const crystalLight = new THREE.PointLight(0x38bdf8, 1.6, 10, 1.5);
    crystalLight.position.set(0, 2.4, 0);
    this.scene.add(crystalLight);

    // Warm atmospheric building window & porch lights
    const buildingLights = [
      { pos: this.tileToWorld(4.5, 1.0), color: 0xff8c38, intensity: 1.3 }, // Alaric shop
      { pos: this.tileToWorld(12.5, 1.0), color: 0x4f86f7, intensity: 1.1 }, // Borin post
      { pos: this.tileToWorld(4.5, 6.0), color: 0xa855f7, intensity: 1.2 }, // Vexis sanctum
      { pos: this.tileToWorld(12.5, 6.0), color: 0xf59e0b, intensity: 1.2 }  // Mira hall
    ];
    buildingLights.forEach(cfg => {
      const light = new THREE.PointLight(cfg.color, cfg.intensity, 12, 1.6);
      light.position.set(cfg.pos.x, 2.4, cfg.pos.z);
      this.scene.add(light);
      this.lanternFlickers.push(light);
    });
  }

  setupSkybox() {
    const skyGeo = new THREE.SphereGeometry(220, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor:    { value: new THREE.Color(0x080b18) },
        midColor:    { value: new THREE.Color(0x1a233a) },
        bottomColor: { value: new THREE.Color(0x351e12) },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          vec3 col;
          if (h > 0.0) {
            col = mix(midColor, topColor, pow(h, 0.8));
          } else {
            col = mix(midColor, bottomColor, pow(-h, 0.7));
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
  }

  /* ═══════════════════════════════════════════════════════
     CONTINUOUS TERRAIN, ORGANIC PATHS & ENVIRONMENT
     ═══════════════════════════════════════════════════════ */
  /* ═══════════════════════════════════════════════════════
     PROCEDURAL STYLIZED GRASS PBR TEXTURE SET
     Seamless albedo + normal + roughness authored in-canvas.
     No external files, offline, license-free, tuned to the
     low-poly twilight art direction (not photographic).
     ═══════════════════════════════════════════════════════ */
  createGrassTextureSet() {
    const SIZE = 256;

    // ── Tileable value-noise fBm (periodic ⇒ wraps seamlessly) ──
    const hash = (ix, iy, seed) => {
      let h = (ix * 374761393 + iy * 668265263 + seed * 1013904223) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (t) => t * t * (3 - 2 * t);
    const vnoise = (x, y, period, seed) => {
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = smooth(x - x0), fy = smooth(y - y0);
      const wx0 = ((x0 % period) + period) % period, wx1 = ((x0 + 1) % period + period) % period;
      const wy0 = ((y0 % period) + period) % period, wy1 = ((y0 + 1) % period + period) % period;
      const v00 = hash(wx0, wy0, seed), v10 = hash(wx1, wy0, seed);
      const v01 = hash(wx0, wy1, seed), v11 = hash(wx1, wy1, seed);
      return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
    };
    const fbm = (x, y, basePeriod, seed) => {
      let sum = 0, amp = 0.5, freq = 1, norm = 0;
      for (let o = 0; o < 4; o++) {
        sum += amp * vnoise(x * freq, y * freq, basePeriod * freq, seed + o * 17);
        norm += amp; amp *= 0.5; freq *= 2;
      }
      return sum / norm;
    };

    // Twilight-cohesive stylized palette
    const cDark = [44, 84, 50];
    const cMid  = [72, 116, 60];
    const cLite = [118, 158, 88];
    const cDirt = [88, 72, 48];
    const basePeriod = 8;

    const albedo = document.createElement('canvas'); albedo.width = albedo.height = SIZE;
    const aCtx = albedo.getContext('2d');
    const aImg = aCtx.createImageData(SIZE, SIZE);
    const height = new Float32Array(SIZE * SIZE);
    const rough = new Float32Array(SIZE * SIZE);

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const nx = (x / SIZE) * basePeriod;
        const ny = (y / SIZE) * basePeriod;
        const g = fbm(nx, ny, basePeriod, 11);
        const dirtMask = fbm(nx * 0.5, ny * 0.5, basePeriod, 71);
        let r, gg, b;
        if (g < 0.5) { const t = g / 0.5; r = lerp(cDark[0], cMid[0], t); gg = lerp(cDark[1], cMid[1], t); b = lerp(cDark[2], cMid[2], t); }
        else { const t = (g - 0.5) / 0.5; r = lerp(cMid[0], cLite[0], t); gg = lerp(cMid[1], cLite[1], t); b = lerp(cMid[2], cLite[2], t); }
        const earth = Math.max(0, dirtMask - 0.64) / 0.36;
        if (earth > 0) { r = lerp(r, cDirt[0], earth * 0.8); gg = lerp(gg, cDirt[1], earth * 0.8); b = lerp(b, cDirt[2], earth * 0.8); }
        const i = (y * SIZE + x) * 4;
        aImg.data[i] = r; aImg.data[i + 1] = gg; aImg.data[i + 2] = b; aImg.data[i + 3] = 255;
        height[y * SIZE + x] = g * (1 - earth * 0.6);
        rough[y * SIZE + x] = 0.92 - earth * 0.2;
      }
    }
    aCtx.putImageData(aImg, 0, 0);

    // ── Sparse upright grass streaks (seamless via wrapped copies) ──
    const streaks = [];
    for (let s = 0; s < 340; s++) {
      const px = hash(s, 3, 91) * SIZE, py = hash(s, 7, 91) * SIZE;
      const len = 3 + hash(s, 9, 91) * 6;
      const ang = -Math.PI / 2 + (hash(s, 11, 91) - 0.5) * 0.6;
      const shade = hash(s, 13, 91);
      const col = shade > 0.62 ? cLite : shade > 0.32 ? cMid : cDark;
      streaks.push({ px, py, dx: Math.cos(ang) * len, dy: Math.sin(ang) * len, col, a: 0.10 + hash(s, 15, 91) * 0.13, len });
    }
    aCtx.lineWidth = 1;
    for (const st of streaks) {
      aCtx.strokeStyle = `rgba(${st.col[0]},${st.col[1]},${st.col[2]},${st.a})`;
      for (const ox of [0, -SIZE, SIZE]) for (const oy of [0, -SIZE, SIZE]) {
        if (st.px + ox > -st.len && st.px + ox < SIZE + st.len && st.py + oy > -st.len && st.py + oy < SIZE + st.len) {
          aCtx.beginPath(); aCtx.moveTo(st.px + ox, st.py + oy); aCtx.lineTo(st.px + ox + st.dx, st.py + oy + st.dy); aCtx.stroke();
        }
      }
    }

    // ── Height field (grass value + raised streaks) → normal map via Sobel ──
    const hCanvas = document.createElement('canvas'); hCanvas.width = hCanvas.height = SIZE;
    const hCtx = hCanvas.getContext('2d');
    const hImg = hCtx.createImageData(SIZE, SIZE);
    for (let p = 0; p < SIZE * SIZE; p++) {
      const v = Math.max(0, Math.min(1, height[p])) * 255;
      hImg.data[p * 4] = v; hImg.data[p * 4 + 1] = v; hImg.data[p * 4 + 2] = v; hImg.data[p * 4 + 3] = 255;
    }
    hCtx.putImageData(hImg, 0, 0);
    hCtx.lineWidth = 1;
    for (const st of streaks) {
      hCtx.strokeStyle = `rgba(255,255,255,${st.a * 1.3})`;
      for (const ox of [0, -SIZE, SIZE]) for (const oy of [0, -SIZE, SIZE]) {
        if (st.px + ox > -st.len && st.px + ox < SIZE + st.len && st.py + oy > -st.len && st.py + oy < SIZE + st.len) {
          hCtx.beginPath(); hCtx.moveTo(st.px + ox, st.py + oy); hCtx.lineTo(st.px + ox + st.dx, st.py + oy + st.dy); hCtx.stroke();
        }
      }
    }

    const hData = hCtx.getImageData(0, 0, SIZE, SIZE).data;
    const H = (x, y) => hData[((((y % SIZE) + SIZE) % SIZE) * SIZE + (((x % SIZE) + SIZE) % SIZE)) * 4] / 255;
    const normal = document.createElement('canvas'); normal.width = normal.height = SIZE;
    const nCtx = normal.getContext('2d');
    const nImg = nCtx.createImageData(SIZE, SIZE);
    const strength = 1.6;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = (H(x - 1, y) - H(x + 1, y)) * strength;
        const dy = (H(x, y - 1) - H(x, y + 1)) * strength;
        const len = Math.hypot(dx, dy, 1);
        const i = (y * SIZE + x) * 4;
        nImg.data[i] = (dx / len * 0.5 + 0.5) * 255;
        nImg.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
        nImg.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
        nImg.data[i + 3] = 255;
      }
    }
    nCtx.putImageData(nImg, 0, 0);

    // ── Roughness map ──
    const roughCanvas = document.createElement('canvas'); roughCanvas.width = roughCanvas.height = SIZE;
    const rCtx = roughCanvas.getContext('2d');
    const rImg = rCtx.createImageData(SIZE, SIZE);
    for (let p = 0; p < SIZE * SIZE; p++) {
      const v = Math.max(0, Math.min(1, rough[p])) * 255;
      rImg.data[p * 4] = v; rImg.data[p * 4 + 1] = v; rImg.data[p * 4 + 2] = v; rImg.data[p * 4 + 3] = 255;
    }
    rCtx.putImageData(rImg, 0, 0);

    const maxAniso = this.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
    const makeTex = (canvas, srgb) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = maxAniso;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return tex;
    };

    return {
      map: makeTex(albedo, true),
      normalMap: makeTex(normal, false),
      roughnessMap: makeTex(roughCanvas, false)
    };
  }

  setupEnvironment() {
    const totalW = MAP_WIDTH * this.tileScale;
    const totalH = MAP_HEIGHT * this.tileScale;

    // High-resolution continuous undulating ground mesh
    const segX = MAP_WIDTH * 4;
    const segZ = MAP_HEIGHT * 4;
    const groundW = totalW + 6;
    const groundH = totalH + 6;
    const groundGeo = new THREE.PlaneGeometry(groundW, groundH, segX, segZ);
    groundGeo.rotateX(-Math.PI / 2);

    // Clean continuous ground plane
    const posAttr = groundGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) { posAttr.setY(i, 0); }

    // Low-frequency macro colour variation baked into vertex colours so the
    // repeating texture never reads as a grid (multiplies the albedo texture).
    const macro = (x, z) =>
      0.5 + 0.22 * Math.sin(x * 0.13 + z * 0.07)
          + 0.16 * Math.sin(x * 0.05 - z * 0.11 + 2.1)
          + 0.10 * Math.sin(z * 0.19 + 1.3);
    const colors = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      const v = 0.86 + Math.max(0, Math.min(1, macro(posAttr.getX(i), posAttr.getZ(i)))) * 0.22;
      colors[i * 3] = v * 0.97;      // slightly cooler reds
      colors[i * 3 + 1] = v;          // green leads
      colors[i * 3 + 2] = v * 0.94;   // less blue → keeps it grassy
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Procedural seamless PBR grass texture set, tiled ~4 world-units per repeat
    const grassTex = this.createGrassTextureSet();
    const repeatX = Math.round(groundW / 4);
    const repeatZ = Math.round(groundH / 4);
    grassTex.map.repeat.set(repeatX, repeatZ);
    grassTex.normalMap.repeat.set(repeatX, repeatZ);
    grassTex.roughnessMap.repeat.set(repeatX, repeatZ);
    this.groundTextures = grassTex;

    const groundMat = new THREE.MeshStandardMaterial({
      map: grassTex.map,
      normalMap: grassTex.normalMap,
      roughnessMap: grassTex.roughnessMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 1.0,
      metalness: 0.0,
      vertexColors: true,
      color: 0xffffff
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Bedrock skirt
    const bedrockGeo = new THREE.PlaneGeometry(totalW + 50, totalH + 50);
    const bedrockMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.95 });
    const bedrock = new THREE.Mesh(bedrockGeo, bedrockMat);
    bedrock.rotation.x = -Math.PI / 2;
    bedrock.position.y = -0.08;
    bedrock.receiveShadow = true;
    this.scene.add(bedrock);

    // ─── Organic Blended Cobblestone Paths ───
    this.buildOrganicPaths();

    // ─── Forest, Foliage & Detail Distribution ───
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const type = TILE_MAP[y][x];
        const pos = this.tileToWorld(x, y);

        if (type === 1) {
          this.createTree(pos.x, pos.z, x, y);
          // Frozen collision: trunk radius 0.4m
          this.collision.addCircle(pos.x, pos.z, 0.4, `tree_${x}_${y}`);
        } else if (type === 0) {
          // Open grass meadow details
          const h = tileHash(x, y, 42);
          if (h > 0.65) {
            this.createFlowerCluster(pos.x, pos.z, x, y);
          } else if (h > 0.45) {
            this.createGrassTuft(pos.x, pos.z, x, y);
          }
          if (tileHash(x, y, 99) > 0.78) {
            this.createFallenLeaves(pos.x, pos.z, x, y);
          }
        }
      }
    }

    // ─── Peripheral Forest Framing Layers ───
    this.createPeripheralForest();

    // ─── Perimeter Wall & Corner Pillars (FROZEN Collision) ───
    this.createPerimeterWall();

    // ─── NPC Buildings & FROZEN Collisions ───
    const alaricPos = this.tileToWorld(4.5, 0.5);
    this.createAlaricShop(alaricPos.x, alaricPos.z);
    this.collision.addBox(alaricPos.x, alaricPos.z, 3.8, 2.5, 'alaric_shop');

    const borinPos = this.tileToWorld(12.5, 0.5);
    this.createBorinPost(borinPos.x, borinPos.z);
    this.collision.addBox(borinPos.x, borinPos.z, 3.4, 2.4, 'borin_post');

    const vexisPos = this.tileToWorld(4.5, 5.5);
    this.createVexisSanctum(vexisPos.x, vexisPos.z);
    this.collision.addBox(vexisPos.x, vexisPos.z, 3.0, 2.3, 'vexis_sanctum');

    const miraPos = this.tileToWorld(12.5, 5.5);
    this.createMiraHall(miraPos.x, miraPos.z);
    this.collision.addBox(miraPos.x, miraPos.z, 4.4, 2.8, 'mira_hall');

    // ─── Hero Central Fountain (FROZEN Collision r = 1.75m) ───
    this.createFountain(0, 0);
    this.collision.addCircle(0, 0, 1.75, 'fountain');

    // ─── Village Lamp Posts (FROZEN Collision) ───
    const lampPositions = [
      { x: -3, z: 0 }, { x: 3, z: 0 },
      { x: 0, z: -5 }, { x: 0, z: 5 },
      { x: -6, z: -3 }, { x: 6, z: -3 }
    ];
    lampPositions.forEach((lp, i) => {
      this.createLampPost(lp.x, lp.z);
      this.collision.addCircle(lp.x, lp.z, 0.25, `lamp_${i}`);
    });

    // ─── Environmental Storytelling Props & FROZEN Collisions ───
    this.createPropsCluster();
  }

  buildOrganicPaths() {
    const stonePalettes = [
      new THREE.MeshStandardMaterial({ color: 0x6e6559, roughness: 0.8, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x5a5247, roughness: 0.85, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x7a7266, roughness: 0.75, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x48423a, roughness: 0.9, flatShading: true })
    ];

    // Plaza circular paving ring around fountain
    const plazaPavingGeo = new THREE.RingGeometry(1.8, 3.4, 18);
    const plazaMat = new THREE.MeshStandardMaterial({ color: 0x766c5e, roughness: 0.78, flatShading: true });
    const plazaPaving = new THREE.Mesh(plazaPavingGeo, plazaMat);
    plazaPaving.rotation.x = -Math.PI / 2;
    plazaPaving.position.y = 0.02;
    plazaPaving.receiveShadow = true;
    this.scene.add(plazaPaving);

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (TILE_MAP[y][x] === 3) {
          const pos = this.tileToWorld(x, y);

          // Sub-path bed with soft irregular border
          // Organic cobblestone bed directly on grass

          // 5-7 individual organic cobblestones per path tile
          const count = 8 + Math.floor(tileHash(x, y, 1) * 4);
          for (let s = 0; s < count; s++) {
            const stoneSizeX = 0.28 + tileHash(x, y, s * 5) * 0.24;
            const stoneSizeZ = 0.26 + tileHash(x, y, s * 7 + 1) * 0.22;
            const stoneH = 0.05 + tileHash(x, y, s * 11) * 0.03;

            const stoneGeo = new THREE.BoxGeometry(stoneSizeX, stoneH, stoneSizeZ);
            const mat = stonePalettes[Math.floor(tileHash(x, y, s * 13) * stonePalettes.length)];
            const stone = new THREE.Mesh(stoneGeo, mat);

            const ox = (tileHash(x, y, s * 17 + 2) - 0.5) * (this.tileScale * 0.72);
            const oz = (tileHash(x, y, s * 19 + 3) - 0.5) * (this.tileScale * 0.72);
            stone.position.set(pos.x + ox, 0.02, pos.z + oz);
            stone.rotation.y = tileHash(x, y, s * 23) * Math.PI;
            stone.receiveShadow = true;
            this.scene.add(stone);
          }
        }
      }
    }
  }

  /* ═══════════════════════════════════════════════════════
     TREE SYSTEM & FOREST COMPOSITION (3 DISTINCT ARCHETYPES)
     ═══════════════════════════════════════════════════════ */
  createTree(x, z, tx, ty) {
    const variety = tileHash(tx, ty, 10);
    const scale = 0.85 + tileHash(tx, ty, 20) * 0.35;
    const rotation = tileHash(tx, ty, 30) * Math.PI * 2;

    if (variety < 0.42) {
      // Archetype A: Layered Alpine Pine
      this.createPineTree(x, z, scale, rotation);
    } else if (variety < 0.75) {
      // Archetype B: Stylized Low-Poly Deciduous Oak
      this.createOakTree(x, z, scale, rotation);
    } else {
      // Archetype C: Ancient Weeping Birch / Willow
      this.createBirchTree(x, z, scale, rotation);
    }

    // Occasional undergrowth bush near tree bases
    if (tileHash(tx, ty, 88) > 0.4) {
      this.createBush(x + 0.45 * scale, z + 0.35 * scale, 0.35 * scale);
    }
  }

  createPineTree(x, z, scale, rot) {
    const g = new THREE.Group();
    const trunkH = 1.6 * scale;
    const trunkGeo = new THREE.CylinderGeometry(0.14 * scale, 0.26 * scale, trunkH, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x331c11, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    g.add(trunk);

    const leafPalette = [0x1a4a2b, 0x1e5a32, 0x164225, 0x226639];
    const tiers = [
      { r: 1.45 * scale, h: 1.6 * scale, y: trunkH + 0.3 * scale, c: leafPalette[0] },
      { r: 1.15 * scale, h: 1.4 * scale, y: trunkH + 1.0 * scale, c: leafPalette[1] },
      { r: 0.85 * scale, h: 1.2 * scale, y: trunkH + 1.7 * scale, c: leafPalette[2] },
      { r: 0.50 * scale, h: 0.9 * scale, y: trunkH + 2.3 * scale, c: leafPalette[3] },
    ];
    tiers.forEach((t) => {
      const mat = new THREE.MeshStandardMaterial({ color: t.c, roughness: 0.7, flatShading: true });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(t.r, t.h, 7), mat);
      cone.position.y = t.y;
      cone.castShadow = true;
      g.add(cone);
    });

    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.scene.add(g);
  }

  createOakTree(x, z, scale, rot) {
    const g = new THREE.Group();
    const trunkH = 1.4 * scale;
    const trunkGeo = new THREE.CylinderGeometry(0.18 * scale, 0.34 * scale, trunkH, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3e2918, roughness: 0.88 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    g.add(trunk);

    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2e7039, roughness: 0.75, flatShading: true });
    const foliageMat2 = new THREE.MeshStandardMaterial({ color: 0x3a8246, roughness: 0.72, flatShading: true });

    // Multi-faceted cloud-like canopy clusters
    const clumps = [
      { r: 1.2 * scale, pos: [0, trunkH + 0.9 * scale, 0], mat: foliageMat },
      { r: 0.85 * scale, pos: [-0.6 * scale, trunkH + 0.6 * scale, 0.4 * scale], mat: foliageMat2 },
      { r: 0.9 * scale, pos: [0.55 * scale, trunkH + 0.75 * scale, -0.35 * scale], mat: foliageMat },
      { r: 0.75 * scale, pos: [0.2 * scale, trunkH + 1.5 * scale, 0.2 * scale], mat: foliageMat2 },
    ];
    clumps.forEach(c => {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(c.r, 1), c.mat);
      mesh.position.set(...c.pos);
      mesh.castShadow = true;
      g.add(mesh);
    });

    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.scene.add(g);
  }

  createBirchTree(x, z, scale, rot) {
    const g = new THREE.Group();
    const trunkH = 2.1 * scale;
    const trunkGeo = new THREE.CylinderGeometry(0.11 * scale, 0.18 * scale, trunkH, 6);
    // Pale birch bark with dark knots
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0xd9d1be, roughness: 0.65 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    g.add(trunk);

    const knotMat = new THREE.MeshStandardMaterial({ color: 0x221a12, roughness: 0.9 });
    [0.5, 1.1, 1.6].forEach(ky => {
      const knot = new THREE.Mesh(new THREE.BoxGeometry(0.06 * scale, 0.12 * scale, 0.24 * scale), knotMat);
      knot.position.set(0, ky * scale, 0);
      g.add(knot);
    });

    // Weeping willow/birch elongated canopy
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x489654, roughness: 0.7, flatShading: true });
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 * scale, 1), canopyMat);
    canopy.position.y = trunkH + 0.45 * scale;
    canopy.scale.set(0.85, 1.4, 0.85);
    canopy.castShadow = true;
    g.add(canopy);

    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.scene.add(g);
  }

  createBush(x, z, radius) {
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x275932, roughness: 0.8, flatShading: true });
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), bushMat);
    mesh.position.set(x, radius * 0.7, z);
    mesh.scale.set(1, 0.75, 1);
    mesh.castShadow = true;
    this.scene.add(mesh);
  }

  createPeripheralForest() {
    // Layered forest background silhouettes beyond perimeter
    const outerTrees = [
      // North forest ridge
      [-18, -14], [-12, -15], [-6, -14.5], [0, -15.5], [7, -14], [13, -15], [19, -14.5],
      // South forest ridge
      [-19, 14.5], [-13, 15], [-5, 14.2], [2, 15.2], [8, 14.6], [14, 15], [18, 14.2],
      // West deep ridge
      [-22, -8], [-23, -2], [-22, 5], [-23, 10],
      // East deep ridge
      [22, -9], [23, -1], [22, 6], [23, 11]
    ];
    outerTrees.forEach(([ox, oz], i) => {
      const s = 1.2 + (i % 3) * 0.25;
      this.createPineTree(ox, oz, s, i);
    });
  }

  /* ═══════════════════════════════════════════════════════
     PERIMETER WALLS & CORNER PILLARS
     ═══════════════════════════════════════════════════════ */
  createPerimeterWall() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x47515f, roughness: 0.75, flatShading: true });
    const wallH = 0.6;
    const wallW = 0.4;
    const halfW = (MAP_WIDTH * this.tileScale) / 2;
    const halfH = (MAP_HEIGHT * this.tileScale) / 2;

    const nGeo = new THREE.BoxGeometry(halfW * 2 + wallW, wallH, wallW);
    const nWall = new THREE.Mesh(nGeo, stoneMat);
    nWall.position.set(0, wallH / 2, -halfH + 0.5 * this.tileScale);
    nWall.castShadow = true; nWall.receiveShadow = true;
    this.scene.add(nWall);
    this.collision.addBox(0, -halfH + 0.5 * this.tileScale, halfW * 2 + wallW, wallW, 'wall_north');

    const sWall = new THREE.Mesh(nGeo, stoneMat);
    sWall.position.set(0, wallH / 2, halfH - 0.5 * this.tileScale);
    sWall.castShadow = true; sWall.receiveShadow = true;
    this.scene.add(sWall);
    this.collision.addBox(0, halfH - 0.5 * this.tileScale, halfW * 2 + wallW, wallW, 'wall_south');

    const wGeo = new THREE.BoxGeometry(wallW, wallH, halfH * 2);
    const wWall = new THREE.Mesh(wGeo, stoneMat);
    wWall.position.set(-halfW + 0.5 * this.tileScale, wallH / 2, 0);
    wWall.castShadow = true; wWall.receiveShadow = true;
    this.scene.add(wWall);
    this.collision.addBox(-halfW + 0.5 * this.tileScale, 0, wallW, halfH * 2, 'wall_west');

    const eWall = new THREE.Mesh(wGeo, stoneMat);
    eWall.position.set(halfW - 0.5 * this.tileScale, wallH / 2, 0);
    eWall.castShadow = true; eWall.receiveShadow = true;
    this.scene.add(eWall);
    this.collision.addBox(halfW - 0.5 * this.tileScale, 0, wallW, halfH * 2, 'wall_east');

    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.35, wallH + 0.4, 6);
    const corners = [
      [-halfW + this.tileScale * 0.5, -halfH + this.tileScale * 0.5],
      [halfW - this.tileScale * 0.5, -halfH + this.tileScale * 0.5],
      [-halfW + this.tileScale * 0.5, halfH - this.tileScale * 0.5],
      [halfW - this.tileScale * 0.5, halfH - this.tileScale * 0.5]
    ];
    corners.forEach(([cx, cz], i) => {
      const p = new THREE.Mesh(pillarGeo, stoneMat);
      p.position.set(cx, (wallH + 0.4) / 2, cz);
      p.castShadow = true;
      this.scene.add(p);
      this.collision.addCircle(cx, cz, 0.35, `pillar_${i}`);
    });
  }

  /* ═══════════════════════════════════════════════════════
     HERO CENTRAL FOUNTAIN LANDMARK (FROZEN COLLISION r = 1.75m)
     ═══════════════════════════════════════════════════════ */
  createFountain(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a6677, roughness: 0.65, flatShading: true });
    const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x3d4754, roughness: 0.75, flatShading: true });

    // Tier 1: Outer Stepped Basin
    const outerBaseGeo = new THREE.CylinderGeometry(1.68, 1.74, 0.3, 12);
    const outerBase = new THREE.Mesh(outerBaseGeo, stoneMat);
    outerBase.position.y = 0.15;
    outerBase.castShadow = true; outerBase.receiveShadow = true;
    group.add(outerBase);

    // Carved Coping Rim
    const rimGeo = new THREE.TorusGeometry(1.62, 0.12, 6, 16);
    const rim = new THREE.Mesh(rimGeo, darkStoneMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.3;
    rim.castShadow = true;
    group.add(rim);

    // Inner Water Basin
    const innerRimGeo = new THREE.CylinderGeometry(1.48, 1.48, 0.25, 12);
    const innerRim = new THREE.Mesh(innerRimGeo, darkStoneMat);
    innerRim.position.y = 0.12;
    group.add(innerRim);

    // Translucent animated water surface
    const waterGeo = new THREE.CylinderGeometry(1.44, 1.44, 0.24, 16);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.08,
      metalness: 0.75,
      transparent: true,
      opacity: 0.82
    });
    this.animatedWater = new THREE.Mesh(waterGeo, waterMat);
    this.animatedWater.position.y = 0.22;
    group.add(this.animatedWater);

    // Concentric ripple disc
    const rippleGeo = new THREE.RingGeometry(0.3, 1.35, 16);
    const rippleMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    this.fountainRipples = new THREE.Mesh(rippleGeo, rippleMat);
    this.fountainRipples.rotation.x = -Math.PI / 2;
    this.fountainRipples.position.y = 0.26;
    group.add(this.fountainRipples);

    // Central Multi-tier Pedestal
    const pedestalGeo = new THREE.CylinderGeometry(0.28, 0.42, 1.4, 8);
    const pedestal = new THREE.Mesh(pedestalGeo, stoneMat);
    pedestal.position.y = 0.7;
    pedestal.castShadow = true;
    group.add(pedestal);

    // Tier 2: Elevated Upper Basin Bowl
    const upperBowlGeo = new THREE.CylinderGeometry(0.65, 0.45, 0.25, 8);
    const upperBowl = new THREE.Mesh(upperBowlGeo, stoneMat);
    upperBowl.position.y = 1.35;
    upperBowl.castShadow = true;
    group.add(upperBowl);

    // Upper Spout Spire
    const spireGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.6, 8);
    const spire = new THREE.Mesh(spireGeo, darkStoneMat);
    spire.position.y = 1.7;
    spire.castShadow = true;
    group.add(spire);

    // Hero Floating Crystal Orb
    const crystalGeo = new THREE.OctahedronGeometry(0.22);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.75,
      roughness: 0.15,
      metalness: 0.5
    });
    this.fountainCrystal = new THREE.Mesh(crystalGeo, crystalMat);
    this.fountainCrystal.position.y = 2.25;
    group.add(this.fountainCrystal);

    // Fountain water droplet particles
    const dropMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.75 });
    const dropGeo = new THREE.SphereGeometry(0.045, 4, 4);
    for (let i = 0; i < 24; i++) {
      const drop = new THREE.Mesh(dropGeo, dropMat);
      drop.position.set(0, 1.8, 0);
      drop.userData.baseY = 1.4;
      drop.userData.speed = 0.8 + Math.random() * 0.9;
      drop.userData.phase = Math.random() * Math.PI * 2;
      drop.userData.radius = 0.15 + Math.random() * 0.45;
      group.add(drop);
      this.fountainParticles.push(drop);
    }

    this.scene.add(group);
  }

  /* ═══════════════════════════════════════════════════════
     DISTINCT NPC BUILDINGS WITH HIGH DETAIL ARCHITECTURE
     ═══════════════════════════════════════════════════════ */
  createAlaricShop(x, z) {
    // Alaric: Merchant Emporium & Potion Shop
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const stoneFoundationMat = new THREE.MeshStandardMaterial({ color: 0x47515f, roughness: 0.8, flatShading: true });
    const timberWallMat = new THREE.MeshStandardMaterial({ color: 0x6e472a, roughness: 0.82 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x992b24, roughness: 0.58, flatShading: true });
    const awningMat1 = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7, side: THREE.DoubleSide });

    // Stone foundation
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.4, 2.2), stoneFoundationMat);
    foundation.position.y = 0.2;
    foundation.castShadow = true; foundation.receiveShadow = true;
    g.add(foundation);

    // Timber upper story
    const walls = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.8, 2.1), timberWallMat);
    walls.position.y = 1.3;
    walls.castShadow = true; walls.receiveShadow = true;
    g.add(walls);

    // Gabled roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.4, 4), roofMat);
    roof.position.y = 2.9;
    roof.scale.set(1.15, 1.0, 0.9);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);

    // Stone Chimney with Smoke
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.4), stoneFoundationMat);
    chimney.position.set(1.2, 3.2, -0.45);
    chimney.castShadow = true;
    g.add(chimney);

    // Striped Merchant Awning
    const awningGeo = new THREE.PlaneGeometry(2.6, 1.1);
    const awning = new THREE.Mesh(awningGeo, awningMat1);
    awning.position.set(-0.2, 1.95, 1.25);
    awning.rotation.x = -0.32;
    awning.castShadow = true;
    g.add(awning);

    // Shop Counter Table
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 0.55), timberWallMat);
    counter.position.set(-0.2, 0.45, 1.18);
    counter.castShadow = true;
    g.add(counter);

    // Merchandise on counter (Potions & Scales)
    const potionColors = [0xef4444, 0x10b981, 0x3b82f6];
    potionColors.forEach((col, idx) => {
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 0.2, 6),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.2, emissive: col, emissiveIntensity: 0.35 })
      );
      pot.position.set(-0.8 + idx * 0.35, 0.95, 1.18);
      g.add(pot);
    });

    // Hanging Merchant Scales Sign
    const signMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.7 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.06), signMat);
    sign.position.set(1.4, 1.8, 1.1);
    sign.rotation.y = Math.PI / 5;
    g.add(sign);

    // Warm shop window
    const winMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), winMat);
    win.position.set(0.6, 1.3, 1.06);
    g.add(win);

    this.scene.add(g);
  }

  createBorinPost(x, z) {
    // Borin: Fortified Garrison Guardhouse & Watchtower
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3e4754, roughness: 0.75, flatShading: true });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, flatShading: true });
    const bannerBlue = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.6 });

    // Heavy Stone Fort Walls
    const fort = new THREE.Mesh(new THREE.BoxGeometry(3.3, 2.2, 2.3), stoneMat);
    fort.position.y = 1.1;
    fort.castShadow = true; fort.receiveShadow = true;
    g.add(fort);

    // Watchtower corner
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 3.2, 6), stoneMat);
    tower.position.set(-1.3, 1.6, 0.85);
    tower.castShadow = true;
    g.add(tower);

    const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.0, 6), roofMat);
    towerRoof.position.set(-1.3, 3.7, 0.85);
    towerRoof.castShadow = true;
    g.add(towerRoof);

    // Fort Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 4), roofMat);
    roof.position.y = 2.8;
    roof.scale.set(1.1, 1.0, 0.85);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);

    // Hanging Heraldic Guard Banners
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, 0.04), bannerBlue);
    banner.position.set(0.5, 1.4, 1.18);
    banner.castShadow = true;
    g.add(banner);

    // Heavy Iron-reinforced Door
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5 }));
    door.position.set(-0.2, 0.65, 1.16);
    g.add(door);

    // Guard Post Weapon Rack
    const rackWood = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.15), new THREE.MeshStandardMaterial({ color: 0x451a03 }));
    rackWood.position.set(1.1, 0.45, 1.35);
    g.add(rackWood);

    const spearMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 });
    for (let i = 0; i < 2; i++) {
      const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4), spearMat);
      spear.position.set(0.95 + i * 0.3, 0.7, 1.35);
      spear.rotation.z = -0.15 + i * 0.3;
      g.add(spear);
    }

    this.scene.add(g);
  }

  createVexisSanctum(x, z) {
    // Vexis: Occult Shadow Sanctum with Obsidian Spires & Violet Runes
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const obsidianMat = new THREE.MeshStandardMaterial({ color: 0x16111f, roughness: 0.85, flatShading: true });
    const roofSlateMat = new THREE.MeshStandardMaterial({ color: 0x3b1859, roughness: 0.55, flatShading: true });
    const runeGlowMat = new THREE.MeshStandardMaterial({ color: 0xc084fc, emissive: 0x9333ea, emissiveIntensity: 0.8 });

    // Sanctum Main Hall
    const walls = new THREE.Mesh(new THREE.BoxGeometry(2.9, 2.4, 2.1), obsidianMat);
    walls.position.y = 1.2;
    walls.castShadow = true; walls.receiveShadow = true;
    g.add(walls);

    // Gothic Steep Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.9, 4), roofSlateMat);
    roof.position.y = 3.3;
    roof.scale.set(1.05, 1.0, 0.85);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);

    // 4 Corner Gothic Spire Pinnacles
    [[-1.2, -0.9], [1.2, -0.9], [-1.2, 0.9], [1.2, 0.9]].forEach(([sx, sz]) => {
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.4, 4), obsidianMat);
      spire.position.set(sx, 2.9, sz);
      spire.castShadow = true;
      g.add(spire);
    });

    // Glowing Occult Runic Circle above Archway
    const rune = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 8), runeGlowMat);
    rune.position.set(0, 1.9, 1.06);
    g.add(rune);

    // Arcane Shadow Crystal
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), runeGlowMat);
    crystal.position.set(0, 1.9, 1.08);
    g.add(crystal);

    // Dark Veil Doorway
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.25, 0.08), new THREE.MeshStandardMaterial({ color: 0x09070f }));
    door.position.set(0, 0.62, 1.06);
    g.add(door);

    // Amethyst Window Slits
    [[-0.9, 1.35], [0.9, 1.35]].forEach(([wx, wy]) => {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.55), runeGlowMat);
      win.position.set(wx, wy, 1.06);
      g.add(win);
    });

    this.scene.add(g);
  }

  createMiraHall(x, z) {
    // Elder Mira: Thatch Council Lodge & Herbalist Porch
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const logMat = new THREE.MeshStandardMaterial({ color: 0x5c3d23, roughness: 0.85 });
    const thatchMat = new THREE.MeshStandardMaterial({ color: 0x926c2e, roughness: 0.75, flatShading: true });
    const herbGreen = new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.8 });

    // Timber Council Hall
    const walls = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.9, 2.6), logMat);
    walls.position.y = 0.95;
    walls.castShadow = true; walls.receiveShadow = true;
    g.add(walls);

    // Thatched Broad Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.4, 6), thatchMat);
    roof.position.y = 2.5;
    roof.scale.set(1.15, 1.0, 0.9);
    roof.castShadow = true;
    g.add(roof);

    // Wooden Porch Pergola
    const pergolaBeam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.6), logMat);
    pergolaBeam.position.set(0, 1.6, 1.5);
    g.add(pergolaBeam);

    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6), logMat);
    post1.position.set(-1.1, 0.8, 1.7);
    g.add(post1);
    const post2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6), logMat);
    post2.position.set(1.1, 0.8, 1.7);
    g.add(post2);

    // Bundles of Drying Herbs hanging under porch
    [-0.6, 0, 0.6].forEach(hx => {
      const bundle = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 5), herbGreen);
      bundle.position.set(hx, 1.4, 1.5);
      bundle.rotation.x = Math.PI;
      g.add(bundle);
    });

    // Warm Rose Window
    const winMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const rose = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.35, 8), winMat);
    rose.position.set(0, 1.45, 1.32);
    g.add(rose);

    // Entrance Door
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.25, 0.08), new THREE.MeshStandardMaterial({ color: 0x331c0a }));
    door.position.set(0, 0.62, 1.32);
    g.add(door);

    this.scene.add(g);
  }

  /* ═══════════════════════════════════════════════════════
     ENVIRONMENTAL STORYTELLING PROPS
     ═══════════════════════════════════════════════════════ */
  createPropsCluster() {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x54361b, roughness: 0.85 });
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x5c3317, roughness: 0.72, flatShading: true });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x714b28, roughness: 0.82 });

    // Barrels near Alaric shop (FROZEN Collision)
    const bPositions = [
      { x: 7, y: 1 }, { x: 7.3, y: 1.5 }
    ];
    bPositions.forEach((bp, i) => {
      const pos = this.tileToWorld(bp.x, bp.y);
      this.createBarrel(pos.x, pos.z, barrelMat);
      this.collision.addCircle(pos.x, pos.z, 0.35, `barrel_${i}`);
    });

    // Crates near Borin post (FROZEN Collision)
    const cPositions = [
      { x: 14.5, y: 1 }, { x: 14.8, y: 1.3 }
    ];
    cPositions.forEach((cp, i) => {
      const pos = this.tileToWorld(cp.x, cp.y);
      this.createCrate(pos.x, pos.z, crateMat);
      this.collision.addBox(pos.x, pos.z, 0.6, 0.6, `crate_${i}`);
    });

    // Benches along paths (FROZEN Collision)
    const benchPositions = [
      { x: 8, y: 3, rot: 0 },
      { x: 11, y: 3, rot: 0 },
      { x: 8, y: 8, rot: 0 },
      { x: 11, y: 8, rot: 0 }
    ];
    benchPositions.forEach((bp, i) => {
      const pos = this.tileToWorld(bp.x, bp.y);
      this.createBench(pos.x, pos.z, woodMat, bp.rot);
      this.collision.addBox(pos.x, pos.z, 1.25, 0.45, `bench_${i}`);
    });

    // Rocks scattered in open areas (FROZEN Collision)
    const rockPositions = [
      { x: 2, y: 4 }, { x: 16, y: 4 }, { x: 2, y: 9 }, { x: 17, y: 9 },
      { x: 7, y: 11 }, { x: 14, y: 11 }
    ];
    rockPositions.forEach((rp, i) => {
      const pos = this.tileToWorld(rp.x, rp.y);
      this.createRock(pos.x, pos.z, rp.x, rp.y);
      this.collision.addCircle(pos.x, pos.z, 0.4, `rock_${i}`);
    });

    // Notice board near plaza (FROZEN Collision)
    this.createNoticeBoard(-2, -3);
    this.collision.addBox(-2, -3, 1.1, 0.35, 'notice_board');
  }

  createBarrel(x, z, mat) {
    const g = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.32, 0.35, 0.7, 8);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.35;
    body.castShadow = true;
    g.add(body);
    const hoopMat = new THREE.MeshStandardMaterial({ color: 0x1f242d, metalness: 0.8, roughness: 0.4 });
    [0.15, 0.55].forEach(yy => {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.02, 4, 16), hoopMat);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = yy;
      g.add(hoop);
    });
    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  createCrate(x, z, mat) {
    const geo = new THREE.BoxGeometry(0.55, 0.5, 0.55);
    const crate = new THREE.Mesh(geo, mat);
    crate.position.set(x, 0.25, z);
    crate.rotation.y = tileHash(Math.floor(x * 10), Math.floor(z * 10), 99) * Math.PI;
    crate.castShadow = true; crate.receiveShadow = true;
    this.scene.add(crate);
  }

  createBench(x, z, mat, rot) {
    const g = new THREE.Group();
    const seatGeo = new THREE.BoxGeometry(1.2, 0.08, 0.35);
    const seat = new THREE.Mesh(seatGeo, mat);
    seat.position.y = 0.42;
    seat.castShadow = true;
    g.add(seat);
    const legGeo = new THREE.BoxGeometry(0.08, 0.42, 0.08);
    [[-0.5, 0.12], [0.5, 0.12], [-0.5, -0.12], [0.5, -0.12]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(lx, 0.21, lz);
      leg.castShadow = true;
      g.add(leg);
    });
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.scene.add(g);
  }

  createRock(x, z, tx, ty) {
    const size = 0.32 + tileHash(tx, ty, 77) * 0.38;
    const geo = new THREE.DodecahedronGeometry(size, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x545e68, roughness: 0.85, flatShading: true });
    const rock = new THREE.Mesh(geo, mat);
    rock.position.set(x, size * 0.4, z);
    rock.rotation.set(tileHash(tx, ty, 1) * 2, tileHash(tx, ty, 2) * 2, tileHash(tx, ty, 3));
    rock.scale.y = 0.65;
    rock.castShadow = true; rock.receiveShadow = true;
    this.scene.add(rock);
  }

  createNoticeBoard(x, z) {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e14, roughness: 0.85 });
    const postGeo = new THREE.CylinderGeometry(0.06, 0.07, 1.5, 6);
    const p1 = new THREE.Mesh(postGeo, woodMat); p1.position.set(-0.4, 0.75, 0); p1.castShadow = true; g.add(p1);
    const p2 = new THREE.Mesh(postGeo, woodMat); p2.position.set(0.4, 0.75, 0); p2.castShadow = true; g.add(p2);

    const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.06), new THREE.MeshStandardMaterial({ color: 0x6e5234, roughness: 0.8 }));
    board.position.y = 1.2; board.castShadow = true; g.add(board);

    // Pinned notices paper
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.35), new THREE.MeshBasicMaterial({ color: 0xfef3c7 }));
    paper.position.set(-0.15, 1.25, 0.04);
    g.add(paper);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.3), woodMat);
    roof.position.y = 1.58; roof.rotation.x = -0.15; g.add(roof);

    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  createLampPost(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.5, metalness: 0.85 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.6, 6), ironMat);
    pole.position.y = 1.3; pole.castShadow = true; group.add(pole);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.12, 8), ironMat);
    base.position.y = 0.06; group.add(base);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.35), ironMat);
    arm.position.set(0, 2.5, 0.15); group.add(arm);

    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, 0.28), new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6 }));
    lantern.position.set(0, 2.5, 0.3); group.add(lantern);

    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
    glow.position.set(0, 2.5, 0.3); group.add(glow);

    const pLight = new THREE.PointLight(0xf59e0b, 1.5, 14, 1.5);
    pLight.position.set(0, 2.5, 0.3);
    group.add(pLight);
    this.lanternFlickers.push(pLight);

    this.scene.add(group);
  }

  createGrassTuft(x, z, tx, ty) {
    const g = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x3d824d, roughness: 0.8, side: THREE.DoubleSide });
    const bladeGeo = new THREE.PlaneGeometry(0.06, 0.28);
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(bladeGeo, bladeMat);
      b.position.set((tileHash(tx, ty, i + 40) - 0.5) * 0.5, 0.14, (tileHash(tx, ty, i + 50) - 0.5) * 0.5);
      b.rotation.y = tileHash(tx, ty, i + 60) * Math.PI;
      b.rotation.x = -0.2 + tileHash(tx, ty, i + 70) * 0.4;
      g.add(b);
    }
    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  createFlowerCluster(x, z, tx, ty) {
    const g = new THREE.Group();
    g.position.set(x, 0.05, z);
    const fGeo = new THREE.SphereGeometry(0.06, 4, 4);
    const fColors = [0xf43f5e, 0xa855f7, 0x38bdf8, 0xfbbf24, 0xec4899];
    const col = fColors[Math.abs(tx * 7 + ty * 13) % fColors.length];
    const fMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, emissive: col, emissiveIntensity: 0.15 });
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(fGeo, fMat);
      f.position.set((tileHash(tx, ty, i + 80) - 0.5) * 0.6, 0.07, (tileHash(tx, ty, i + 90) - 0.5) * 0.6);
      g.add(f);
    }
    this.scene.add(g);
  }

  createFallenLeaves(x, z, tx, ty) {
    const g = new THREE.Group();
    g.position.set(x, 0.02, z);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xc27829, roughness: 0.9, flatShading: true });
    const leafGeo = new THREE.PlaneGeometry(0.1, 0.08);
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Mesh(leafGeo, leafMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set((tileHash(tx, ty, i + 12) - 0.5) * 0.7, 0.01, (tileHash(tx, ty, i + 14) - 0.5) * 0.7);
      l.rotation.z = tileHash(tx, ty, i + 16) * Math.PI;
      g.add(l);
    }
    this.scene.add(g);
  }

  setupFireflies() {
    const fireflyMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.85 });
    const fireflyGeo = new THREE.SphereGeometry(0.04, 4, 4);
    for (let i = 0; i < 50; i++) {
      const ff = new THREE.Mesh(fireflyGeo, fireflyMat.clone());
      const area = (MAP_WIDTH * this.tileScale) * 0.4;
      ff.position.set(
        (Math.random() - 0.5) * area * 2,
        0.5 + Math.random() * 3.2,
        (Math.random() - 0.5) * area * 2
      );
      ff.userData.basePos = ff.position.clone();
      ff.userData.phase = Math.random() * Math.PI * 2;
      ff.userData.speed = 0.4 + Math.random() * 0.6;
      ff.userData.drift = 0.6 + Math.random() * 1.1;
      this.scene.add(ff);
      this.fireflies.push(ff);
    }
  }

  /* ═══════════════════════════════════════════════════════
     CHARACTER SILHOUETTES & LAYERED MATERIALS
     ═══════════════════════════════════════════════════════ */
  setupEntities() {
    const playerSpawnPos = this.tileToWorld(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    this.player = this.createPlayerMesh();
    this.player.position.set(playerSpawnPos.x, 0, playerSpawnPos.z);
    this.scene.add(this.player);

    Object.entries(NPC_POSITIONS).forEach(([key, config]) => {
      const pos = this.tileToWorld(config.x, config.y);
      let npcMesh;

      switch(key) {
        case 'alaric': npcMesh = this.createAlaricNPC(); break;
        case 'borin':  npcMesh = this.createBorinNPC(); break;
        case 'vexis':  npcMesh = this.createVexisNPC(); break;
        case 'mira':   npcMesh = this.createMiraNPC(); break;
        default:       npcMesh = this.createGenericNPC(config.color || 0xaa88ee); break;
      }

      npcMesh.position.set(pos.x, 0, pos.z);
      // Merge (not overwrite) so builder-set handles like `joints` and `auraMesh` survive
      npcMesh.userData = {
        ...npcMesh.userData,
        id: key,
        name: config.name,
        role: config.role,
        portrait: config.portrait,
        tileX: config.x,
        tileY: config.y,
        color: config.color,
        interactRadius: 3.5
      };

      this.npcs[key] = npcMesh;
      this.scene.add(npcMesh);

      // Register stationary NPCs as FROZEN circular collision obstacles
      if (key !== 'borin') {
        this.collision.addCircle(pos.x, pos.z, 0.45, `npc_${key}`);
      }
    });

    this.borinOriginalPos = this.tileToWorld(NPC_POSITIONS.borin.x, NPC_POSITIONS.borin.y);
    this.alaricShopPos = this.tileToWorld(NPC_POSITIONS.alaric.x + 1.2, NPC_POSITIONS.alaric.y);

    // Borin autonomous locomotion state & tuning (velocity-driven, not lerped)
    this.borinLoco = { velX: 0, velZ: 0, walkCycle: 0 };
    this.borinLocoParams = {
      maxSpeed: 3.0,     // deliberate guard's march, ~half the player's 6.2
      accel: 9.0,        // smooth ramp up to speed
      friction: 8.0,     // smooth ramp down when decelerating
      turnSpeed: 9.0,    // body rotates to face travel direction
      arriveRadius: 0.3, // considered "arrived" within this distance
      slowRadius: 1.6,   // begins decelerating this far from the target
      radius: 0.4        // collision probe radius
    };
  }

  /* ─── Player Hero with Articulated Joint Hierarchy (FROZEN) ─── */
  createPlayerMesh() {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.6 });
    const tunicMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.55, flatShading: true }); // Indigo traveling tunic
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x54361b, roughness: 0.8 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.75, roughness: 0.3 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.7 });

    // ── Left Leg (Hip Pivot y = 0.65) ──
    const lLegPivot = new THREE.Group();
    lLegPivot.position.set(-0.13, 0.65, 0);

    const legGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.4, 6);
    const lLegMesh = new THREE.Mesh(legGeo, tunicMat);
    lLegMesh.position.set(0, -0.2, 0);
    lLegMesh.castShadow = true;
    lLegPivot.add(lLegMesh);

    const bootGeo = new THREE.BoxGeometry(0.2, 0.28, 0.26);
    const lBootMesh = new THREE.Mesh(bootGeo, leatherMat);
    lBootMesh.position.set(0, -0.48, 0.03);
    lBootMesh.castShadow = true;
    lLegPivot.add(lBootMesh);
    group.add(lLegPivot);

    // ── Right Leg (Hip Pivot y = 0.65) ──
    const rLegPivot = new THREE.Group();
    rLegPivot.position.set(0.13, 0.65, 0);

    const rLegMesh = new THREE.Mesh(legGeo, tunicMat);
    rLegMesh.position.set(0, -0.2, 0);
    rLegMesh.castShadow = true;
    rLegPivot.add(rLegMesh);

    const rBootMesh = new THREE.Mesh(bootGeo, leatherMat);
    rBootMesh.position.set(0, -0.48, 0.03);
    rBootMesh.castShadow = true;
    rLegPivot.add(rBootMesh);
    group.add(rLegPivot);

    // ── Torso / Body Group ──
    const bodyGroup = new THREE.Group();
    bodyGroup.position.set(0, 0, 0);

    // Layered Tunic Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.52, 0.32), tunicMat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    bodyGroup.add(torso);

    // Leather Belt & Harness Straps
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.34), leatherMat);
    belt.position.y = 0.72;
    bodyGroup.add(belt);

    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.54, 0.34), leatherMat);
    strap.position.set(-0.08, 0.96, 0);
    strap.rotation.z = -0.3;
    bodyGroup.add(strap);

    // Adventurer Backpack
    const bp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.22), leatherMat);
    bp.position.set(0, 1.0, -0.24);
    bp.castShadow = true;
    bodyGroup.add(bp);

    const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 8), new THREE.MeshStandardMaterial({ color: 0x78716c }));
    bedroll.position.set(0, 1.25, -0.24);
    bedroll.rotation.z = Math.PI / 2;
    bodyGroup.add(bedroll);

    // Steel Broadsword Sheathed on Hip
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.05), metalMat);
    sword.position.set(0.3, 0.62, -0.1);
    sword.rotation.z = -0.18;
    bodyGroup.add(sword);

    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0xca8a04 })); // Brass hilt
    hilt.position.set(0.3, 0.94, -0.1);
    bodyGroup.add(hilt);

    // Head & Hair
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), skinMat);
    head.position.y = 1.35;
    head.castShadow = true;
    bodyGroup.add(head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2e1809, roughness: 0.9 }));
    hair.position.set(0, 1.38, -0.02);
    bodyGroup.add(hair);

    // Traveling Cap with Red Feather
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.22, 6), capMat);
    cap.position.set(0, 1.52, 0);
    cap.rotation.x = -0.1;
    bodyGroup.add(cap);

    const feather = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.24, 0.06), new THREE.MeshStandardMaterial({ color: 0xdc2626 }));
    feather.position.set(0.15, 1.58, 0);
    feather.rotation.z = -0.35;
    bodyGroup.add(feather);

    group.add(bodyGroup);

    // ── Left Arm (Shoulder Pivot y = 1.15) ──
    const lArmPivot = new THREE.Group();
    lArmPivot.position.set(-0.32, 1.15, 0);

    const armGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.42, 6);
    const lArmMesh = new THREE.Mesh(armGeo, tunicMat);
    lArmMesh.position.set(0, -0.22, 0);
    lArmMesh.castShadow = true;
    lArmPivot.add(lArmMesh);

    const lGlove = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), leatherMat);
    lGlove.position.set(0, -0.42, 0);
    lArmPivot.add(lGlove);
    group.add(lArmPivot);

    // ── Right Arm (Shoulder Pivot y = 1.15) ──
    const rArmPivot = new THREE.Group();
    rArmPivot.position.set(0.32, 1.15, 0);

    const rArmMesh = new THREE.Mesh(armGeo, tunicMat);
    rArmMesh.position.set(0, -0.22, 0);
    rArmMesh.castShadow = true;
    rArmPivot.add(rArmMesh);

    const rGlove = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), leatherMat);
    rGlove.position.set(0, -0.42, 0);
    rArmPivot.add(rGlove);
    group.add(rArmPivot);

    // real shadows used instead of black discs

    // Expose joint handles for kinematic movement animation
    group.userData.joints = {
      lLeg: lLegPivot,
      rLeg: rLegPivot,
      lArm: lArmPivot,
      rArm: rArmPivot,
      body: bodyGroup
    };

    return group;
  }

  /* ─── Distinct Alaric Merchant / Mage Model ─── */
  createAlaricNPC() {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc8a07a, roughness: 0.6 });
    const robeMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.6, flatShading: true }); // Crimson merchant robe
    const apronMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.75 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.6, roughness: 0.3 });

    // Sturdy boots
    const bootGeo = new THREE.BoxGeometry(0.22, 0.28, 0.28);
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x2e1605, roughness: 0.85 });
    const lBoot = new THREE.Mesh(bootGeo, bootMat); lBoot.position.set(-0.14, 0.14, 0); group.add(lBoot);
    const rBoot = new THREE.Mesh(bootGeo, bootMat); rBoot.position.set(0.14, 0.14, 0); group.add(rBoot);

    const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.35, 6);
    const lLeg = new THREE.Mesh(legGeo, robeMat); lLeg.position.set(-0.14, 0.46, 0); group.add(lLeg);
    const rLeg = new THREE.Mesh(legGeo, robeMat); rLeg.position.set(0.14, 0.46, 0); group.add(rLeg);

    // Plump merchant torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.42), robeMat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    group.add(torso);

    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.48, 0.08), apronMat);
    apron.position.set(0, 0.88, 0.22);
    group.add(apron);

    // Gold coin pouch on belt
    const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), apronMat);
    pouch.position.set(0.33, 0.68, 0.16);
    pouch.scale.y = 0.8;
    group.add(pouch);

    // Arms
    const armGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.42, 6);
    const lArm = new THREE.Mesh(armGeo, robeMat); lArm.position.set(-0.38, 0.9, 0); group.add(lArm);
    const rArm = new THREE.Mesh(armGeo, robeMat); rArm.position.set(0.38, 0.9, 0); group.add(rArm);

    // Head, bushy beard & pointed merchant wizard hat
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), skinMat);
    head.position.y = 1.35;
    head.castShadow = true;
    group.add(head);

    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 }));
    beard.position.set(0, 1.23, 0.14);
    beard.scale.set(1, 1.25, 0.7);
    group.add(beard);

    const hatMat = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.7 });
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.85, 8), hatMat);
    hat.position.set(0, 1.76, 0);
    hat.castShadow = true;
    group.add(hat);

    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 12), hatMat);
    brim.position.set(0, 1.5, 0);
    group.add(brim);

    // Gold buckle on hat
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.04), goldMat);
    buckle.position.set(0, 1.56, 0.28);
    group.add(buckle);

    this.addMoodAura(group, 0xcc3333);
    // real shadows used instead of black discs
    return group;
  }

  /* ─── Distinct Sergeant Borin Guard Model (Articulated joints for locomotion) ─── */
  createBorinNPC() {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xb8956a, roughness: 0.6 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.25 });
    const armorBlue = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.5 });
    const plumeMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.7 });

    const legGeo = new THREE.CylinderGeometry(0.1, 0.11, 0.5, 6);
    const bootGeo = new THREE.BoxGeometry(0.24, 0.35, 0.3);

    // ── Left Leg (hip pivot y = 0.85) so the swing animation can drive it ──
    const lLegPivot = new THREE.Group();
    lLegPivot.position.set(-0.15, 0.85, 0);
    const lLegMesh = new THREE.Mesh(legGeo, armorBlue);
    lLegMesh.position.set(0, -0.25, 0); lLegMesh.castShadow = true; lLegPivot.add(lLegMesh);
    const lBoot = new THREE.Mesh(bootGeo, steelMat);
    lBoot.position.set(0, -0.68, 0.02); lBoot.castShadow = true; lLegPivot.add(lBoot);
    group.add(lLegPivot);

    // ── Right Leg (hip pivot y = 0.85) ──
    const rLegPivot = new THREE.Group();
    rLegPivot.position.set(0.15, 0.85, 0);
    const rLegMesh = new THREE.Mesh(legGeo, armorBlue);
    rLegMesh.position.set(0, -0.25, 0); rLegMesh.castShadow = true; rLegPivot.add(rLegMesh);
    const rBoot = new THREE.Mesh(bootGeo, steelMat);
    rBoot.position.set(0, -0.68, 0.02); rBoot.castShadow = true; rLegPivot.add(rBoot);
    group.add(rLegPivot);

    // ── Body group (torso + armor + head, bobs with gait) ──
    const bodyGroup = new THREE.Group();

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.64, 0.38), armorBlue);
    torso.position.y = 1.18;
    torso.castShadow = true;
    bodyGroup.add(torso);

    const breastplate = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.52, 0.14), steelMat);
    breastplate.position.set(0, 1.2, 0.18);
    bodyGroup.add(breastplate);

    // Heavy shoulder pauldrons (rigid, stay on body over the swinging arms)
    const lPaul = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), steelMat);
    lPaul.position.set(-0.4, 1.4, 0); lPaul.scale.y = 0.75; bodyGroup.add(lPaul);
    const rPaul = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), steelMat);
    rPaul.position.set(0.4, 1.4, 0); rPaul.scale.y = 0.75; bodyGroup.add(rPaul);

    // Tower Shield slung on the back (rigid on body)
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.08), armorBlue);
    shield.position.set(-0.25, 1.15, -0.25);
    shield.rotation.y = 0.2;
    shield.castShadow = true;
    bodyGroup.add(shield);

    const shieldBoss = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), steelMat);
    shieldBoss.position.set(-0.25, 1.15, -0.3);
    bodyGroup.add(shieldBoss);

    // Steel Knight Helmet with Red Plume
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), skinMat);
    head.position.y = 1.6; bodyGroup.add(head);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), steelMat);
    helmet.position.y = 1.64;
    helmet.scale.set(1, 0.88, 1.08);
    bodyGroup.add(helmet);

    const plume = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.55), plumeMat);
    plume.position.set(0, 1.88, -0.05);
    bodyGroup.add(plume);

    group.add(bodyGroup);

    // ── Armored arms (shoulder pivot y = 1.33) counter-swing with the legs ──
    const armGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.5, 6);
    const lArmPivot = new THREE.Group();
    lArmPivot.position.set(-0.38, 1.33, 0);
    const lArmMesh = new THREE.Mesh(armGeo, armorBlue);
    lArmMesh.position.set(0, -0.25, 0); lArmMesh.castShadow = true; lArmPivot.add(lArmMesh);
    group.add(lArmPivot);

    const rArmPivot = new THREE.Group();
    rArmPivot.position.set(0.38, 1.33, 0);
    const rArmMesh = new THREE.Mesh(armGeo, armorBlue);
    rArmMesh.position.set(0, -0.25, 0); rArmMesh.castShadow = true; rArmPivot.add(rArmMesh);
    group.add(rArmPivot);

    // Expose joint handles so the shared walk-cycle animator can drive Borin
    group.userData.joints = {
      lLeg: lLegPivot,
      rLeg: rLegPivot,
      lArm: lArmPivot,
      rArm: rArmPivot,
      body: bodyGroup
    };

    this.addMoodAura(group, 0x3366cc);
    // real shadows used instead of black discs
    return group;
  }

  /* ─── Distinct Vexis Shadow Broker Model ─── */
  createVexisNPC() {
    const group = new THREE.Group();
    const cloakMat = new THREE.MeshStandardMaterial({ color: 0x130e1c, roughness: 0.88 }); // Deep obsidian cloak
    const violetMat = new THREE.MeshStandardMaterial({ color: 0xc084fc, emissive: 0x9333ea, emissiveIntensity: 0.8 });

    // Slender boots
    const bootGeo = new THREE.BoxGeometry(0.16, 0.3, 0.24);
    const lBoot = new THREE.Mesh(bootGeo, cloakMat); lBoot.position.set(-0.1, 0.15, 0); group.add(lBoot);
    const rBoot = new THREE.Mesh(bootGeo, cloakMat); rBoot.position.set(0.1, 0.15, 0); group.add(rBoot);

    const legGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.45, 6);
    const lLeg = new THREE.Mesh(legGeo, cloakMat); lLeg.position.set(-0.1, 0.52, 0); group.add(lLeg);
    const rLeg = new THREE.Mesh(legGeo, cloakMat); rLeg.position.set(0.1, 0.52, 0); group.add(rLeg);

    // Torso with trailing layered shadow cowl
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.52, 0.28), cloakMat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    group.add(torso);

    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.3, 6), cloakMat);
    cloak.position.set(0, 0.72, -0.15);
    cloak.rotation.x = 0.12;
    cloak.castShadow = true;
    group.add(cloak);

    // Dual Curved Shadow Daggers at Hip
    const daggerMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.2 });
    [-0.24, 0.24].forEach(dx => {
      const dagger = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.03), daggerMat);
      dagger.position.set(dx, 0.65, 0.12);
      dagger.rotation.z = dx > 0 ? 0.3 : -0.3;
      group.add(dagger);
    });

    // Deep Shadow Hood with Glowing Violet Eyes
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), cloakMat);
    hood.position.set(0, 1.45, -0.05);
    hood.scale.set(1, 0.92, 1.15);
    hood.castShadow = true;
    group.add(hood);

    const eyeGeo = new THREE.PlaneGeometry(0.06, 0.02);
    const lEye = new THREE.Mesh(eyeGeo, violetMat); lEye.position.set(-0.06, 1.4, 0.22); group.add(lEye);
    const rEye = new THREE.Mesh(eyeGeo, violetMat); rEye.position.set(0.06, 1.4, 0.22); group.add(rEye);

    // Floating Amethyst Amulet
    const amulet = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), violetMat);
    amulet.position.set(0, 1.2, 0.18);
    group.add(amulet);

    this.addMoodAura(group, 0x9933cc);
    // real shadows used instead of black discs
    return group;
  }

  /* ─── Distinct Elder Mira Healer / Elder Model ─── */
  createMiraNPC() {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4b896, roughness: 0.6 });
    const robeMat = new THREE.MeshStandardMaterial({ color: 0x785336, roughness: 0.75, flatShading: true }); // Earth-toned herbalist robe
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4, metalness: 0.5 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.85 }); // Silver hair in bun

    // Flowing Robe Skirt
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.75, 8), robeMat);
    skirt.position.y = 0.45;
    skirt.rotation.x = Math.PI;
    skirt.castShadow = true;
    group.add(skirt);

    // Torso with Golden Sash
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.3), robeMat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    group.add(torso);

    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.32), goldMat);
    sash.position.set(0.14, 0.9, 0.08);
    sash.rotation.z = -0.22;
    group.add(sash);

    // Head with Silver Bun
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), skinMat);
    head.position.y = 1.34;
    head.castShadow = true;
    group.add(head);

    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), hairMat);
    bun.position.set(0, 1.48, -0.12);
    group.add(bun);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), hairMat);
    hair.position.set(0, 1.37, -0.04);
    hair.scale.set(1, 0.88, 1.15);
    group.add(hair);

    // Carved Walking Staff with Celestial Crystal Orb
    const staffMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7 });
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 1.95, 6), staffMat);
    staff.position.set(0.42, 0.95, 0.12);
    staff.castShadow = true;
    group.add(staff);

    const staffCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.7, roughness: 0.2 })
    );
    staffCrystal.position.set(0.42, 1.95, 0.12);
    group.add(staffCrystal);

    this.addMoodAura(group, 0xccaa33);
    // real shadows used instead of black discs
    return group;
  }

  createGenericNPC(color) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 8, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    body.position.y = 0.7; body.castShadow = true; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshStandardMaterial({ color: 0xc8a07a }));
    head.position.y = 1.25; group.add(head);
    this.addMoodAura(group, color);
    // real shadows used instead of black discs
    return group;
  }

  addContactShadow(group) {
    const shadowGeo = new THREE.CircleGeometry(0.45, 16);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);
  }

  addMoodAura(group, color) {
    const auraGeo = new THREE.RingGeometry(0.65, 0.78, 32);
    const auraMat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.03;
    group.add(aura);
    group.userData.auraMesh = aura;
  }

  /* ═══════════════════════════════════════════════════════
     EVENT LISTENERS & DECOUPLING
     ═══════════════════════════════════════════════════════ */
  bindEvents() {
    this.onKeyDown = (e) => {
      if (this.dialogueOpen) return;
      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp') this.keys.up = true;
      if (code === 'KeyS' || code === 'ArrowDown') this.keys.down = true;
      if (code === 'KeyA' || code === 'ArrowLeft') this.keys.left = true;
      if (code === 'KeyD' || code === 'ArrowRight') this.keys.right = true;
      if (code === 'KeyE') {
        this.keys.interact = true;
        this.triggerInteraction();
      }
      if (code === 'KeyT' || code === 'Backquote') {
        window.dispatchEvent(new CustomEvent('toggle-dev'));
      }
    };

    this.onKeyUp = (e) => {
      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp') this.keys.up = false;
      if (code === 'KeyS' || code === 'ArrowDown') this.keys.down = false;
      if (code === 'KeyA' || code === 'ArrowLeft') this.keys.left = false;
      if (code === 'KeyD' || code === 'ArrowRight') this.keys.right = false;
      if (code === 'KeyE') this.keys.interact = false;
    };

    this.onResize = () => {
      if (!this.container || !this.renderer || !this.camera) return;
      this.width = this.container.clientWidth || window.innerWidth;
      this.height = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);

    this.onDialogueOpen = () => {
      this.dialogueOpen = true;
      this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
      this.velocity.set(0, 0, 0);
      this.isMoving = false;
    };
    this.onDialogueClose = () => {
      this.dialogueOpen = false;
    };
    window.addEventListener('dialogue-open', this.onDialogueOpen);
    window.addEventListener('dialogue-close', this.onDialogueClose);

    this.onNpcStateUpdate = (e) => {
      const data = e.detail;
      if (!data) return;
      Object.entries(data).forEach(([npcId, state]) => {
        const npc = this.npcs[npcId];
        if (npc && npc.userData.auraMesh) {
          if (state.mood < 0.35) {
            npc.userData.auraMesh.material.color.setHex(0xef4444);
          } else if (state.mood > 0.70) {
            npc.userData.auraMesh.material.color.setHex(0x10b981);
          } else {
            npc.userData.auraMesh.material.color.setHex(npc.userData.color || 0x6366f1);
          }
        }
      });
    };
    window.addEventListener('npc-state-update', this.onNpcStateUpdate);

    this.onDebugUpdate = (e) => {
      const debug = e.detail?.debug || e.detail;
      if (debug && debug.npc_id) {
        const npc = this.npcs[debug.npc_id];
        if (npc && npc.userData.auraMesh) {
          if (debug.surprise_triggered) {
            npc.userData.auraMesh.material.color.setHex(0xf59e0b);
          } else if (debug.mood_score < 0.35) {
            npc.userData.auraMesh.material.color.setHex(0xef4444);
          } else if (debug.mood_score > 0.70) {
            npc.userData.auraMesh.material.color.setHex(0x10b981);
          }
        }
      }
    };
    window.addEventListener('debug-update', this.onDebugUpdate);
  }

  triggerInteraction() {
    if (this.dialogueOpen) return;
    if (this.nearNPC) {
      const data = {
        npcId: this.nearNPC.userData.id,
        npcName: this.nearNPC.userData.name,
        role: this.nearNPC.userData.role,
        portrait: this.nearNPC.userData.portrait
      };
      window.dispatchEvent(new CustomEvent('start-dialogue', { detail: data }));
      window.dispatchEvent(new CustomEvent('dialogue-open'));
    }
  }

  setupPatrol() {
    this.patrolTimer = setTimeout(() => {
      this.startPatrol();
    }, 5000);

    this.patrolInterval = setInterval(() => {
      this.startPatrol();
    }, 25000);
  }

  startPatrol() {
    if (this.borinState === 'idle' && !this.dialogueOpen && this.npcs.borin && this.npcs.alaric) {
      this.borinState = 'patrolling';
      this.patrolElapsed = 0;
    }
  }

  triggerNPCChat() {
    this.borinState = 'chatting';

    // Resume the patrol after a FIXED pause, decoupled from network latency so the
    // chat beat is deterministic whether the backend/LLM is up, slow, or offline.
    this.chatTimer = setTimeout(() => {
      if (this.borinState === 'chatting') this.borinState = 'returning';
    }, 5000);

    // Fire-and-forget the autonomous dialogue. Backend contract is { npc_id_1, npc_id_2 };
    // it generates in-character fallback text server-side when the LLM is offline.
    fetch('http://localhost:5000/npc-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npc_id_1: 'borin', npc_id_2: 'alaric' })
    })
      .then((res) => res.json())
      .then((data) => console.log('[3D World] Autonomous NPC Chat Result:', data))
      .catch((err) => console.error('[3D World] NPC Chat error:', err));
  }

  /* ─── Autonomous NPC patrol state machine (velocity-driven locomotion) ─── */
  updatePatrol(delta) {
    if (!this.npcs.borin) return;
    const borin = this.npcs.borin;
    const loco = this.borinLoco;
    const params = this.borinLocoParams;

    if (this.borinState === 'patrolling') {
      const { arrived } = this.stepNpcLocomotion(borin, loco, this.alaricShopPos.x, this.alaricShopPos.z, delta, params);
      if (arrived) this.triggerNPCChat();
    } else if (this.borinState === 'returning') {
      const { arrived } = this.stepNpcLocomotion(borin, loco, this.borinOriginalPos.x, this.borinOriginalPos.z, delta, params);
      if (arrived) this.borinState = 'idle';
    } else if (this.borinState === 'chatting') {
      // Come to rest, relax into idle, and turn to face the merchant
      loco.velX = 0;
      loco.velZ = 0;
      this.relaxNpcJoints(borin, delta);
      borin.position.y += (0 - borin.position.y) * Math.min(8 * delta, 1.0);
      const alaric = this.npcs.alaric;
      if (alaric) {
        const target = Math.atan2(alaric.position.x - borin.position.x, alaric.position.z - borin.position.z);
        let diff = target - borin.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        borin.rotation.y += diff * Math.min(6.0 * delta, 1.0);
      }
    }
  }

  /* ═══════════════════════════════════════════════════════
     REUSABLE NPC LOCOMOTION — mirrors the player pipeline:
     target → direction → target velocity → accel/decel →
     collision → position → facing → velocity-driven walk cycle
     ═══════════════════════════════════════════════════════ */
  stepNpcLocomotion(npc, loco, targetX, targetZ, delta, params) {
    const dx = targetX - npc.position.x;
    const dz = targetZ - npc.position.z;
    const distToTarget = Math.hypot(dx, dz);

    // 1. Target velocity — ramp down inside slowRadius for a clean arrival
    let tvx = 0;
    let tvz = 0;
    if (distToTarget > params.arriveRadius) {
      const nx = dx / distToTarget;
      const nz = dz / distToTarget;
      const approach = Math.min(1.0, distToTarget / params.slowRadius);
      const speed = params.maxSpeed * approach;
      tvx = nx * speed;
      tvz = nz * speed;
    }

    // 2. Smooth acceleration toward target / friction toward stop
    if (tvx !== 0 || tvz !== 0) {
      loco.velX += (tvx - loco.velX) * Math.min(params.accel * delta, 1.0);
      loco.velZ += (tvz - loco.velZ) * Math.min(params.accel * delta, 1.0);
    } else {
      const sp = Math.hypot(loco.velX, loco.velZ);
      if (sp > 0.02) {
        const ns = Math.max(0, sp - params.friction * delta);
        loco.velX *= ns / sp;
        loco.velZ *= ns / sp;
      } else {
        loco.velX = 0;
        loco.velZ = 0;
      }
    }

    // 3. Collision-resolved movement (same system + wall sliding as the player)
    const speed = Math.hypot(loco.velX, loco.velZ);
    if (speed > 0.001) {
      const resolved = this.collision.resolveMovement(
        npc.position.x, npc.position.z,
        loco.velX * delta, loco.velZ * delta,
        params.radius
      );
      npc.position.x = resolved.x;
      npc.position.z = resolved.z;
      if (resolved.blockedX) loco.velX = 0;
      if (resolved.blockedZ) loco.velZ = 0;
    }

    // 4. Face the direction of actual travel
    if (speed > 0.15) {
      const targetFacing = Math.atan2(loco.velX, loco.velZ);
      let diff = targetFacing - npc.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      npc.rotation.y += diff * Math.min(params.turnSpeed * delta, 1.0);
    }

    // 5. Walk cycle driven by the NPC's real speed (never faked)
    this.animateNpcWalk(npc, loco, speed, params.maxSpeed, delta);

    const arrived = distToTarget <= params.arriveRadius && speed < 0.2;
    return { arrived, speed, distToTarget };
  }

  animateNpcWalk(npc, loco, speed, maxSpeed, delta) {
    const joints = npc.userData?.joints;
    if (!joints) return;

    if (speed > 0.15) {
      const cadence = (speed / maxSpeed) * 9.0;
      loco.walkCycle += cadence * delta;
      const swing = Math.sin(loco.walkCycle);

      joints.lLeg.rotation.x = swing * 0.6;
      joints.rLeg.rotation.x = -swing * 0.6;
      joints.lArm.rotation.x = -swing * 0.45;
      joints.rArm.rotation.x = swing * 0.45;
      joints.body.rotation.y = swing * 0.06;
      npc.position.y = Math.abs(Math.sin(loco.walkCycle)) * 0.07;
    } else {
      this.relaxNpcJoints(npc, delta);
      npc.position.y += (0 - npc.position.y) * Math.min(8.0 * delta, 1.0);
    }
  }

  relaxNpcJoints(npc, delta) {
    const joints = npc.userData?.joints;
    if (!joints) return;
    const r = Math.min(12.0 * delta, 1.0);
    joints.lLeg.rotation.x += (0 - joints.lLeg.rotation.x) * r;
    joints.rLeg.rotation.x += (0 - joints.rLeg.rotation.x) * r;
    joints.lArm.rotation.x += (0 - joints.lArm.rotation.x) * r;
    joints.rArm.rotation.x += (0 - joints.rArm.rotation.x) * r;
    joints.body.rotation.y += (0 - joints.body.rotation.y) * r;
  }

  /* ═══════════════════════════════════════════════════════
     FROZEN KINEMATIC MOVEMENT, COLLISION & ANIMATION PIPELINE
     ═══════════════════════════════════════════════════════ */
  updatePlayer(delta) {
    if (!this.player || this.dialogueOpen) {
      this.isMoving = false;
      this.resetLimbRotations(delta);
      return;
    }

    // 1. Gather raw input vector
    let inputX = 0;
    let inputZ = 0;
    if (this.keys.up) inputZ -= 1;
    if (this.keys.down) inputZ += 1;
    if (this.keys.left) inputX -= 1;
    if (this.keys.right) inputX += 1;

    const hasInput = (inputX !== 0 || inputZ !== 0);

    // 2. Calculate target velocity
    const targetVel = new THREE.Vector3();
    if (hasInput) {
      const len = Math.hypot(inputX, inputZ);
      targetVel.x = (inputX / len) * this.maxSpeed;
      targetVel.z = (inputZ / len) * this.maxSpeed;
    }

    // 3. Smooth acceleration & deceleration (friction)
    if (hasInput) {
      const diffX = targetVel.x - this.velocity.x;
      const diffZ = targetVel.z - this.velocity.z;
      this.velocity.x += diffX * Math.min(this.acceleration * delta, 1.0);
      this.velocity.z += diffZ * Math.min(this.acceleration * delta, 1.0);
    } else {
      const currentSpeed = this.velocity.length();
      if (currentSpeed > 0.05) {
        const drop = this.friction * delta;
        const newSpeed = Math.max(0, currentSpeed - drop);
        this.velocity.multiplyScalar(newSpeed / currentSpeed);
      } else {
        this.velocity.set(0, 0, 0);
      }
    }

    const currentSpeed = this.velocity.length();
    this.isMoving = currentSpeed > 0.15;

    // 4. Deterministic collision resolution & wall sliding
    if (currentSpeed > 0.001) {
      const moveDx = this.velocity.x * delta;
      const moveDz = this.velocity.z * delta;

      const resolved = this.collision.resolveMovement(
        this.player.position.x,
        this.player.position.z,
        moveDx,
        moveDz,
        this.playerRadius
      );

      // Clamp to map boundaries
      const minX = (-MAP_WIDTH / 2 + 1) * this.tileScale;
      const maxX = (MAP_WIDTH / 2 - 1) * this.tileScale;
      const minZ = (-MAP_HEIGHT / 2 + 1) * this.tileScale;
      const maxZ = (MAP_HEIGHT / 2 - 1) * this.tileScale;

      this.player.position.x = Math.max(minX, Math.min(maxX, resolved.x));
      this.player.position.z = Math.max(minZ, Math.min(maxZ, resolved.z));

      if (resolved.blockedX) this.velocity.x = 0;
      if (resolved.blockedZ) this.velocity.z = 0;
    }

    // 5. Smooth character facing rotation
    if (hasInput || currentSpeed > 0.3) {
      const dirX = hasInput ? inputX : this.velocity.x;
      const dirZ = hasInput ? inputZ : this.velocity.z;
      this.targetFacing = Math.atan2(dirX, dirZ);

      let angleDiff = this.targetFacing - this.player.rotation.y;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      this.player.rotation.y += angleDiff * Math.min(this.turnSpeed * delta, 1.0);
    }

    // 6. Velocity-proportional walk cycle animation
    const joints = this.player.userData?.joints;
    if (joints) {
      if (this.isMoving) {
        const cadence = (currentSpeed / this.maxSpeed) * 11.0;
        this.walkCycle += cadence * delta;

        const swing = Math.sin(this.walkCycle);
        const maxLegAngle = 0.65;
        const maxArmAngle = 0.55;

        // Alternating leg swings
        joints.lLeg.rotation.x = swing * maxLegAngle;
        joints.rLeg.rotation.x = -swing * maxLegAngle;

        // Counter-phase arm swings
        joints.lArm.rotation.x = -swing * maxArmAngle;
        joints.rArm.rotation.x = swing * maxArmAngle;

        // Torso roll & vertical body bob
        joints.body.rotation.y = swing * 0.08;
        this.player.position.y = Math.abs(Math.sin(this.walkCycle)) * 0.08;
      } else {
        this.resetLimbRotations(delta);
        // Idle breathing bob
        this.player.position.y = Math.sin(this.clock.getElapsedTime() * 2.5) * 0.02;
      }
    }
  }

  resetLimbRotations(delta) {
    const joints = this.player?.userData?.joints;
    if (!joints) return;

    const returnRate = Math.min(15.0 * delta, 1.0);
    joints.lLeg.rotation.x += (0 - joints.lLeg.rotation.x) * returnRate;
    joints.rLeg.rotation.x += (0 - joints.rLeg.rotation.x) * returnRate;
    joints.lArm.rotation.x += (0 - joints.lArm.rotation.x) * returnRate;
    joints.rArm.rotation.x += (0 - joints.rArm.rotation.x) * returnRate;
    joints.body.rotation.y += (0 - joints.body.rotation.y) * returnRate;
  }

  checkProximity() {
    if (!this.player) return;

    let closest = null;
    let minDistance = Infinity;

    Object.entries(this.npcs).forEach(([key, npcMesh]) => {
      if (key === 'borin' && this.borinState !== 'idle') return;

      const dist = this.player.position.distanceTo(npcMesh.position);
      if (dist <= npcMesh.userData.interactRadius && dist < minDistance) {
        minDistance = dist;
        closest = npcMesh;
      }
    });

    this.nearNPC = closest;

    window.dispatchEvent(new CustomEvent('game-state', {
      detail: {
        nearNPC: closest ? {
          npcData: {
            npcId: closest.userData.id,
            npcName: closest.userData.name,
            role: closest.userData.role,
            portrait: closest.userData.portrait
          }
        } : null
      }
    }));
  }

  updateNpcScreenPositions() {
    if (!this.camera || !this.player) return;

    const positions = {};
    const playerPos = this.player.position;

    Object.entries(this.npcs).forEach(([key, npcMesh]) => {
      const worldPos = new THREE.Vector3();
      npcMesh.getWorldPosition(worldPos);
      worldPos.y += 2.0;

      const dist = playerPos.distanceTo(npcMesh.position);

      const screenPos = worldPos.clone().project(this.camera);
      const x = (screenPos.x * 0.5 + 0.5) * this.width;
      const y = (-screenPos.y * 0.5 + 0.5) * this.height;

      const behind = screenPos.z > 1;

      positions[key] = {
        x, y,
        distance: dist,
        behind,
        name: npcMesh.userData.name,
        role: npcMesh.userData.role,
        color: npcMesh.userData.color,
        isNear: dist <= npcMesh.userData.interactRadius
      };
    });

    this.npcScreenPositions = positions;

    window.dispatchEvent(new CustomEvent('npc-screen-positions', {
      detail: positions
    }));
  }

  updateCamera() {
    if (!this.player || !this.camera) return;
    const targetCamX = this.player.position.x + this.cameraOffset.x;
    const targetCamY = this.player.position.y + this.cameraOffset.y;
    const targetCamZ = this.player.position.z + this.cameraOffset.z;

    this.camera.position.x += (targetCamX - this.camera.position.x) * 0.06;
    this.camera.position.y += (targetCamY - this.camera.position.y) * 0.06;
    this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.06;

    this.camera.lookAt(
      this.player.position.x,
      this.player.position.y + 0.8,
      this.player.position.z
    );
  }

  /* ═══════════════════════════════════════════════════════
     ANIMATION LOOP
     ═══════════════════════════════════════════════════════ */
  animate() {
    // Bail out if the world has been torn down (guards a queued frame after destroy)
    if (!this.renderer || !this.scene) return;
    this.animId = requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.getElapsedTime();

    this.updatePlayer(delta);
    this.updatePatrol(delta);
    this.checkProximity();
    this.updateCamera();
    this.updateNpcScreenPositions();

    // Subtle NPC idle breathing and head turns toward player
    Object.values(this.npcs).forEach((npc, idx) => {
      if (npc.userData.id === 'borin' && this.borinState !== 'idle') return;

      npc.position.y = Math.sin(time * 2.0 + idx * 1.5) * 0.035;
      npc.rotation.z = Math.sin(time * 1.5 + idx * 2.0) * 0.012;

      if (this.player) {
        const dist = npc.position.distanceTo(this.player.position);
        if (dist < 5.0 && dist > 0.1) {
          const dx = this.player.position.x - npc.position.x;
          const dz = this.player.position.z - npc.position.z;
          const targetAngle = Math.atan2(dx, dz);
          let currentAngle = npc.rotation.y;
          let diff = targetAngle - currentAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          npc.rotation.y += diff * 0.03;
        }
      }
    });

    // Hero Fountain Animations
    if (this.animatedWater) {
      this.animatedWater.rotation.y = time * 0.25;
    }
    if (this.fountainRipples) {
      this.fountainRipples.rotation.z = -time * 0.4;
      this.fountainRipples.material.opacity = 0.25 + Math.sin(time * 3) * 0.1;
    }
    if (this.fountainCrystal) {
      this.fountainCrystal.rotation.y = time * 0.9;
      this.fountainCrystal.position.y = 2.25 + Math.sin(time * 2.2) * 0.08;
    }

    this.fountainParticles.forEach(drop => {
      const t = (time * drop.userData.speed + drop.userData.phase) % (Math.PI * 2);
      const h = Math.sin(t) * 0.65;
      drop.position.y = drop.userData.baseY + Math.max(0, h);
      drop.position.x = Math.sin(t * 2.2) * drop.userData.radius;
      drop.position.z = Math.cos(t * 1.8) * drop.userData.radius;
      drop.material.opacity = h > 0 ? 0.7 : 0.2;
    });

    // Lantern Flickers
    this.lanternFlickers.forEach((light, i) => {
      if (!light.userData) light.userData = {};
      if (!light.userData.baseIntensity) light.userData.baseIntensity = light.intensity;
      light.intensity = light.userData.baseIntensity + Math.sin(time * 6.0 + i * 1.8) * 0.25;
    });

    // Fireflies Drift
    this.fireflies.forEach(ff => {
      const t = time * ff.userData.speed + ff.userData.phase;
      ff.position.x = ff.userData.basePos.x + Math.sin(t * 0.7) * ff.userData.drift;
      ff.position.y = ff.userData.basePos.y + Math.sin(t * 1.3) * 0.4;
      ff.position.z = ff.userData.basePos.z + Math.cos(t * 0.9) * ff.userData.drift;
      ff.material.opacity = 0.45 + Math.sin(t * 3.2) * 0.35;
    });

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
    if (this.patrolTimer) clearTimeout(this.patrolTimer);
    if (this.patrolInterval) clearInterval(this.patrolInterval);
    if (this.chatTimer) clearTimeout(this.chatTimer);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('dialogue-open', this.onDialogueOpen);
    window.removeEventListener('dialogue-close', this.onDialogueClose);
    window.removeEventListener('npc-state-update', this.onNpcStateUpdate);
    window.removeEventListener('debug-update', this.onDebugUpdate);

    // Dispose every GPU resource in the scene graph to prevent leaks on
    // repeated engine switching (3D → 2D → 3D). renderer.dispose() alone
    // does NOT free geometries/materials/textures.
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach((mat) => {
            for (const key in mat) {
              const val = mat[key];
              if (val && val.isTexture) val.dispose();
            }
            if (mat.dispose) mat.dispose();
          });
        }
      });
      this.scene.clear();
    }

    if (this.renderer && this.renderer.domElement && this.container) {
      if (this.renderer.domElement.parentNode === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
      this.renderer.dispose();
      if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
    }

    // Drop references so the GC can reclaim the graph
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.player = null;
    this.npcs = {};
    this.animatedWater = null;
    this.fountainRipples = null;
    this.fountainCrystal = null;
    this.chimneySmoke = [];
    this.lanternFlickers = [];
    this.fireflies = [];
    this.fountainParticles = [];
  }
}
