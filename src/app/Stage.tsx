import { useEffect, useState, type ReactNode } from 'react';
import { LOGICAL_W, LOGICAL_H } from '../core/coords';

// レターボックス・スケーラ（SPEC §3.1）
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const onResize = () =>
      setScale(Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="viewport">
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
