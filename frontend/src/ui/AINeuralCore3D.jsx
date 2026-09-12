import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * AINeuralCore3D:
 * A stylized 3D particle sphere driven by real backend cognitive telemetry.
 * NOTE: This is an artistic conceptual visualization representing surprise loss,
 * mood state, and episodic memory density, not a literal tensor projection of neural weights.
 *
 * The renderer/scene/WebGL context are created ONCE on mount and reused. Telemetry
 * changes only mutate colors, particle density, and animation parameters in place,
 * which avoids tearing down and recreating a WebGL context on every chat turn.
 */
function moodColor(surpriseTriggered, moodScore) {
  if (surpriseTriggered) return new THREE.Color(0xf59e0b);
  if (moodScore > 0.6) return new THREE.Color(0x10b981);
  if (moodScore < 0.35) return new THREE.Color(0xef4444);
  return new THREE.Color(0x6366f1);
}

function buildParticleGeometry(memoryCount) {
  const count = Math.min(180, Math.max(60, 40 + memoryCount * 12));
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = 1.1 + (Math.random() - 0.5) * 0.15;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

export default function AINeuralCore3D({ surpriseTriggered = false, moodScore = 0.5, memoryCount = 4 }) {
  const mountRef = useRef(null);
  const sceneObjs = useRef(null);
  // Live telemetry read by the animation loop without triggering rebuilds
  const telemetry = useRef({ surpriseTriggered, moodScore });

  // Keep the animation-loop's telemetry snapshot current (updated in an effect, not during render)
  useEffect(() => {
    telemetry.current = { surpriseTriggered, moodScore };
  }, [surpriseTriggered, moodScore]);

  // ── Build once on mount ──
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = 120;
    const height = 120;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 3.2;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const color = moodColor(surpriseTriggered, moodScore);

    const geometry = buildParticleGeometry(memoryCount);
    const material = new THREE.PointsMaterial({ size: 0.08, color: color.clone(), transparent: true, opacity: 0.85 });
    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    const coreGeo = new THREE.IcosahedronGeometry(0.5, 1);
    const coreMat = new THREE.MeshBasicMaterial({ color: color.clone(), wireframe: true, transparent: true, opacity: 0.5 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    let animId;
    const clock = new THREE.Clock();
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const { surpriseTriggered: st, moodScore: ms } = telemetry.current;

      const rotSpeed = 0.5 + ms * 0.6;
      particles.rotation.y = t * rotSpeed;
      particles.rotation.x = t * (rotSpeed * 0.4);
      core.rotation.y = -t * rotSpeed * 1.5;

      const pulse = 1.0 + (st ? Math.sin(t * 12) * 0.15 : Math.sin(t * 3) * 0.05);
      particles.scale.set(pulse, pulse, pulse);
      core.scale.set(pulse * 0.8, pulse * 0.8, pulse * 0.8);

      renderer.render(scene, camera);
    };
    animate();

    sceneObjs.current = { renderer, scene, particles, material, coreMat };

    return () => {
      cancelAnimationFrame(animId);
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      particles.geometry.dispose();
      material.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss();
      sceneObjs.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live colour update (no context churn) ──
  useEffect(() => {
    const objs = sceneObjs.current;
    if (!objs) return;
    const color = moodColor(surpriseTriggered, moodScore);
    objs.material.color.copy(color);
    objs.coreMat.color.copy(color);
  }, [surpriseTriggered, moodScore]);

  // ── Rebuild only the particle cloud when memory density changes ──
  useEffect(() => {
    const objs = sceneObjs.current;
    if (!objs) return;
    const oldGeo = objs.particles.geometry;
    objs.particles.geometry = buildParticleGeometry(memoryCount);
    oldGeo.dispose();
  }, [memoryCount]);

  return (
    <div className="relative flex flex-col items-center justify-center p-2 rounded-xl bg-slate-950/60 border border-slate-700/60 shadow-inner">
      <div ref={mountRef} className="w-32 h-32 flex items-center justify-center" />
      <div className="text-[10px] font-mono text-slate-400 mt-1 uppercase tracking-wider flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${surpriseTriggered ? 'bg-amber-400 animate-ping' : 'bg-indigo-400 animate-pulse'}`} />
        Neural Core Pulse
      </div>
    </div>
  );
}
