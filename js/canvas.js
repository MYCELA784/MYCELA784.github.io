/* PUBLIC API
 *   MYCELA.MyceliumCanvas.init(canvasId)  — starts the mycelium node animation
 */
(function (ns) {
  function init(canvasId) {
    const c = document.getElementById(canvasId); if (!c) return;
    const ctx  = c.getContext('2d');
    const hero = c.parentElement;
    const N    = 55;

    function resize() { c.width = hero.offsetWidth; c.height = hero.offsetHeight; }
    resize();
    window.addEventListener('resize', resize);

    const nodes = Array.from({ length: N }, () => ({
      x:  Math.random() * c.width,
      y:  Math.random() * c.height,
      vx: (Math.random() - 0.5) * 0.32,
      vy: (Math.random() - 0.5) * 0.32,
      r:  Math.random() * 1.4 + 0.5,
      p:  Math.random() * Math.PI * 2,
    }));

    function tick() {
      ctx.clearRect(0, 0, c.width, c.height);
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < 130) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(195,160,70,${(1 - d / 130) * 0.12})`;
            ctx.lineWidth   = 0.7;
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }
      const t = Date.now() * 0.001;
      nodes.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(195,160,70,${0.2 + 0.17 * Math.sin(t + n.p)})`;
        ctx.fill();
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > c.width)  n.vx *= -1;
        if (n.y < 0 || n.y > c.height) n.vy *= -1;
      });
      requestAnimationFrame(tick);
    }
    tick();
  }

  ns.MyceliumCanvas = { init };
})(window.MYCELA = window.MYCELA || {});
