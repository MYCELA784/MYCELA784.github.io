(function () {
  var cv = document.getElementById('mycelium-canvas');
  if (!cv) return;
  var cx = cv.getContext('2d');
  var W, H, segs = [], tips = [], frame = 0, nextSeed = 0;

  function resize() {
    W = cv.width = cv.offsetWidth;
    H = cv.height = cv.offsetHeight;
  }

  function seed(sx, sy) {
    var arms = 3 + Math.floor(Math.random() * 4);
    for (var i = 0; i < arms; i++) {
      var angle = (Math.PI * 2 * i / arms) + (Math.random() - 0.5) * 0.7;
      tips.push({
        x: sx, y: sy,
        a: angle,
        gen: 0,
        len: 0,
        maxLen: 80 + Math.random() * 90,
        speed: 0.5 + Math.random() * 0.35,
        wobble: 0.03 + Math.random() * 0.05
      });
    }
  }

  function spawnSeeds() {
    var count = 2 + Math.floor(Math.random() * 3);
    for (var i = 0; i < count; i++) {
      seed(Math.random() * W, Math.random() * H);
    }
    nextSeed = frame + 200 + Math.floor(Math.random() * 100);
  }

  function step() {
    var next = [];
    for (var i = 0; i < tips.length; i++) {
      var t = tips[i];
      t.a += (Math.random() - 0.5) * t.wobble * 2;
      var ex = t.x + Math.cos(t.a) * t.speed;
      var ey = t.y + Math.sin(t.a) * t.speed;
      if (ex > 0 && ex < W && ey > 0 && ey < H) {
        segs.push({ x1: t.x, y1: t.y, x2: ex, y2: ey, gen: t.gen, born: frame });
      }
      t.x = ex; t.y = ey; t.len += t.speed;
      if (t.len < t.maxLen) {
        next.push(t);
      } else if (t.gen < 3 && Math.random() < 0.6 && tips.length < 180) {
        var spread = 0.3 + Math.random() * 0.3;
        next.push({
          x: ex, y: ey,
          a: t.a - spread,
          gen: t.gen + 1,
          len: 0,
          maxLen: 40 + Math.random() * 50,
          speed: t.speed * 0.82,
          wobble: t.wobble * 1.15
        });
        if (Math.random() < 0.55) {
          next.push({
            x: ex, y: ey,
            a: t.a + spread,
            gen: t.gen + 1,
            len: 0,
            maxLen: 40 + Math.random() * 50,
            speed: t.speed * 0.82,
            wobble: t.wobble * 1.15
          });
        }
      }
    }
    tips = next;
  }

  function draw() {
    cx.clearRect(0, 0, W, H);
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var fade = Math.min(1, (frame - s.born) / 20);
      var base = 0.09 - s.gen * 0.022;
      var op = base * fade * (0.88 + 0.12 * Math.sin(frame * 0.016 + s.born * 0.09));
      if (op < 0.004) continue;
      cx.beginPath();
      cx.moveTo(s.x1, s.y1);
      cx.lineTo(s.x2, s.y2);
      cx.strokeStyle = 'rgba(0,33,71,' + op + ')';
      cx.lineWidth = Math.max(0.25, 0.9 - s.gen * 0.22);
      cx.stroke();
    }
  }

  function loop() {
    frame++;
    if (segs.length > 4000) segs.splice(0, 200);
    if (frame >= nextSeed && tips.length < 50) spawnSeeds();
    step();
    draw();
    requestAnimationFrame(loop);
  }

  resize();
  seed(W * 0.2, H * 0.45);
  seed(W * 0.65, H * 0.6);
  seed(W * 0.5, H * 0.12);
  nextSeed = 320;
  loop();

  window.addEventListener('resize', function () {
    resize();
    segs = [];
    tips = [];
    seed(W * 0.2, H * 0.45);
    seed(W * 0.65, H * 0.6);
    seed(W * 0.5, H * 0.12);
    nextSeed = frame + 320;
  });
})();
