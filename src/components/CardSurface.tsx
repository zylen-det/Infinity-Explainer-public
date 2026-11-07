import { useLayoutEffect, useRef } from 'react';

// One closed outline paints both the card and the raised action area.
export function CardSurface() {
  const surfaceRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const surface = surfaceRef.current!;
    const card = surface.parentElement!;
    const actions = card.querySelector<HTMLElement>('.card-actions');
    const update = () => {
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      const actionWidth = actions?.offsetWidth ?? 0;
      const shoulder = Math.min(28, Math.max(0, w - actionWidth - 20));
      const start = Math.max(20, w - actionWidth - shoulder);
      const outline = (rise: number) => {
        const top = 44 - rise;
        return `M 20 44 H ${start} C ${start + shoulder / 2} 44 ${start + shoulder / 2} ${top} ${start + shoulder} ${top} H ${w - 20} Q ${w - .5} ${top} ${w - .5} ${top + 20} V ${h + 24} Q ${w - .5} ${h + 43.5} ${w - 20} ${h + 43.5} H 20 Q .5 ${h + 43.5} .5 ${h + 24} V 64 Q .5 44 20 44 Z`;
      };
      surface.setAttribute('viewBox', `0 0 ${w} ${h + 44}`);
      // CSS d/path() is not supported by every mobile WebView. Always provide
      // native SVG geometry; CSS can enhance it with the raised animation.
      surface.querySelector('path')!.setAttribute('d', outline(0));
      surface.style.setProperty('--card-outline-rest', `path("${outline(0)}")`);
      surface.style.setProperty('--card-outline-raised', `path("${outline(40)}")`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(card);
    if (actions) observer.observe(actions);
    return () => observer.disconnect();
  }, []);

  return <svg ref={surfaceRef} className="card-surface" aria-hidden="true"><path /></svg>;
}
