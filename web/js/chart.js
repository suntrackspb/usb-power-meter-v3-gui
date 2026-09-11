const PowerChart = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const VIEW_WIDTH = 900;
  const VIEW_HEIGHT = 420;
  const PAD_LEFT = 46;
  const PAD_RIGHT = 12;
  const PAD_TOP = 14;
  const PAD_BOTTOM = 28;
  const WINDOW_SECONDS = 60;
  const DBM_MIN = -70;
  const DBM_MAX = 40;

  let svg = null;
  let tooltip = null;
  let points = [];
  let maxDbm = null;
  let paused = false;
  let lastRenderNow = 0;
  let hovering = false;
  let hoverClientX = 0;
  let hoverClientY = 0;

  function init(svgElement) {
    svg = svgElement;
    ensureTooltip();
    svg.addEventListener("mousemove", onPointerMove);
    svg.addEventListener("mouseleave", onPointerLeave);
    render();
  }

  function ensureTooltip() {
    if (tooltip) return;
    tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    document.body.appendChild(tooltip);
  }

  function setPaused(value) {
    paused = value;
  }

  function reset() {
    points = [];
    maxDbm = null;
    render();
  }

  function push(dbm, slotInfo) {
    if (paused) return;
    const now = performance.now() / 1000;
    points.push({ t: now, dbm, slotInfo: slotInfo || null });
    if (maxDbm === null || dbm > maxDbm) maxDbm = dbm;
    const cutoff = now - WINDOW_SECONDS;
    while (points.length && points[0].t < cutoff) points.shift();
    render();
  }

  function xFor(t, now) {
    const frac = 1 - (now - t) / WINDOW_SECONDS;
    return PAD_LEFT + frac * (VIEW_WIDTH - PAD_LEFT - PAD_RIGHT);
  }

  function yFor(dbm) {
    const clamped = Math.max(DBM_MIN, Math.min(DBM_MAX, dbm));
    const frac = (clamped - DBM_MIN) / (DBM_MAX - DBM_MIN);
    return VIEW_HEIGHT - PAD_BOTTOM - frac * (VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM);
  }

  function el(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach((key) => node.setAttribute(key, attrs[key]));
    return node;
  }

  function onPointerMove(event) {
    hovering = true;
    hoverClientX = event.clientX;
    hoverClientY = event.clientY;
    updateHover();
  }

  function onPointerLeave() {
    hovering = false;
    if (tooltip) tooltip.classList.remove("visible");
  }

  function updateHover() {
    if (!hovering || !svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const scaleX = VIEW_WIDTH / rect.width;
    const localX = (hoverClientX - rect.left) * scaleX;

    let nearest = points[0];
    let nearestDist = Infinity;
    for (const point of points) {
      const dist = Math.abs(xFor(point.t, lastRenderNow) - localX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = point;
      }
    }

    const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent-strong").trim() || "#4dd6c2";
    const surfaceColor = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#1b212a";
    const existing = svg.querySelector("#chart-hover-dot");
    if (existing) existing.remove();
    svg.appendChild(el("circle", {
      id: "chart-hover-dot",
      cx: xFor(nearest.t, lastRenderNow), cy: yFor(nearest.dbm), r: 5,
      fill: accentColor, stroke: surfaceColor, "stroke-width": 2,
    }));

    ensureTooltip();
    const secondsAgo = Math.max(0, lastRenderNow - nearest.t);
    const slotLines = nearest.slotInfo
      ? `<span>${nearest.slotInfo.frequencyMhz} MHz</span><span>${nearest.slotInfo.offsetDbm >= 0 ? "+" : ""}${nearest.slotInfo.offsetDbm.toFixed(1)} dB</span>`
      : "";
    tooltip.innerHTML = `<strong>${nearest.dbm.toFixed(1)} dBm</strong>${slotLines}<span>${secondsAgo.toFixed(1)}s ago</span>`;
    tooltip.style.left = `${hoverClientX + 14}px`;
    tooltip.style.top = `${hoverClientY + 14}px`;
    tooltip.classList.add("visible");
  }

  function render() {
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const gridColor = getComputedStyle(document.documentElement).getPropertyValue("--grid-line").trim() || "#262e39";
    const textColor = getComputedStyle(document.documentElement).getPropertyValue("--text-faint").trim() || "#5c6472";
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent-strong").trim() || "#4dd6c2";
    const amberColor = getComputedStyle(document.documentElement).getPropertyValue("--amber").trim() || "#e8a04d";

    for (let dbm = DBM_MIN; dbm <= DBM_MAX; dbm += 10) {
      const y = yFor(dbm);
      svg.appendChild(el("line", {
        x1: PAD_LEFT, x2: VIEW_WIDTH - PAD_RIGHT, y1: y, y2: y,
        stroke: gridColor, "stroke-width": 1,
      }));
      const label = el("text", {
        x: PAD_LEFT - 8, y: y + 4, "text-anchor": "end",
        fill: textColor, "font-size": 11, "font-family": "IBM Plex Mono, monospace",
      });
      label.textContent = String(dbm);
      svg.appendChild(label);
    }

    const now = performance.now() / 1000;
    lastRenderNow = now;

    if (points.length >= 2) {
      const linePoints = points
        .map((p) => `${xFor(p.t, now).toFixed(1)},${yFor(p.dbm).toFixed(1)}`)
        .join(" L");
      const pathData = `M${linePoints}`;
      const baselineY = VIEW_HEIGHT - PAD_BOTTOM;
      const areaData = `M${xFor(points[0].t, now).toFixed(1)},${baselineY} L${linePoints} L${xFor(points[points.length - 1].t, now).toFixed(1)},${baselineY} Z`;

      const gradientId = "chart-area-gradient";
      const defs = el("defs", {});
      const gradient = el("linearGradient", {
        id: gradientId, x1: "0", y1: "0", x2: "0", y2: "1",
      });
      gradient.appendChild(el("stop", { offset: "0%", "stop-color": accentColor, "stop-opacity": "0.35" }));
      gradient.appendChild(el("stop", { offset: "100%", "stop-color": accentColor, "stop-opacity": "0" }));
      defs.appendChild(gradient);
      svg.appendChild(defs);

      svg.appendChild(el("path", { d: areaData, fill: `url(#${gradientId})`, stroke: "none" }));

      svg.appendChild(el("path", {
        d: pathData, fill: "none", stroke: accentColor, "stroke-width": 2,
        "stroke-linejoin": "round", "stroke-linecap": "round",
      }));

      if (maxDbm !== null) {
        const y = yFor(maxDbm);
        svg.appendChild(el("line", {
          x1: PAD_LEFT, x2: VIEW_WIDTH - PAD_RIGHT, y1: y, y2: y,
          stroke: amberColor, "stroke-width": 1.2, "stroke-dasharray": "5,4",
        }));
      }

      const last = points[points.length - 1];
      svg.appendChild(el("circle", {
        cx: xFor(last.t, now), cy: yFor(last.dbm), r: 3.5, fill: accentColor,
      }));
    }

    if (hovering) updateHover();
  }

  return { init, push, reset, setPaused };
})();
