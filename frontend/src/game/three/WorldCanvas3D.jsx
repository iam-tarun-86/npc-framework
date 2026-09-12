import { useEffect, useRef } from 'react';
import { World3D } from './World3D';

export default function WorldCanvas3D() {
  const containerRef = useRef(null);
  const worldRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || worldRef.current) return;

    worldRef.current = new World3D(containerRef.current);
    window.__WORLD3D = worldRef.current;

    return () => {
      if (worldRef.current) {
        worldRef.current.destroy();
        worldRef.current = null;
        window.__WORLD3D = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden'
      }}
    />
  );
}
