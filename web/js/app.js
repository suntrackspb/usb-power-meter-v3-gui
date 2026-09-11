const App = (() => {
  const SLOT_COUNT = 9;
  const SLOT_LETTERS = "ABCDEFGHI";
  const LOG_MAX_ROWS = 200;
  const THEME_KEY = "pmc.theme";
  const RATE_LABELS = ["L", "M", "H"];

  let connected = false;
  let currentPort = null;
  let selectedSlot = 1;
  let slots = {};
  let logRows = [];
  let minDbm = null;
  let maxDbm = null;
  let lastReading = null;
  let paused = false;
  let captures = [];
  let recording = false;
  let sampleRate = 1;
  let analysisRows = [];
  let analysisTooltip = null;

  const ANALYSIS_DBM_MIN = -70;
  const ANALYSIS_DBM_MAX = 40;
  const ANALYSIS_PAD_TOP = 14;
  const ANALYSIS_PAD_BOTTOM = 28;
  const ANALYSIS_HEIGHT = 420;
  const ANALYSIS_POINT_SPACING = 6;

  const el = {};

  function cacheDom() {
    el.portSelect = document.getElementById("port-select");
    el.connectionDot = document.getElementById("connection-dot");
    el.btnConnect = document.getElementById("btn-connect");
    el.btnTheme = document.getElementById("btn-theme");
    el.accordion = document.getElementById("accordion");
    el.rateMeta = document.getElementById("rate-meta");
    el.slotsMeta = document.getElementById("slots-meta");
    el.logMeta = document.getElementById("log-meta");
    el.readingCurrentDbm = document.getElementById("reading-current-dbm");
    el.readingCurrentPower = document.getElementById("reading-current-power");
    el.readingMaxDbm = document.getElementById("reading-max-dbm");
    el.readingMaxPower = document.getElementById("reading-max-power");
    el.readingMinDbm = document.getElementById("reading-min-dbm");
    el.readingMinPower = document.getElementById("reading-min-power");
    el.btnPause = document.getElementById("btn-pause");
    el.btnResetMinMax = document.getElementById("btn-reset-minmax");
    el.btnCapture = document.getElementById("btn-capture");
    el.slotsGrid = document.getElementById("slots-grid");
    el.btnReadSlots = document.getElementById("btn-read-slots");
    el.log = document.getElementById("log");
    el.rateSwitch = document.getElementById("rate-switch");
    el.btnPauseChart = document.getElementById("btn-pause-chart");
    el.chartSvg = document.getElementById("chart-svg");
    el.liveIndicator = document.getElementById("live-indicator");
    el.statusConnection = document.getElementById("status-connection");
    el.langSwitch = document.getElementById("lang-switch");
    el.btnOpenCsv = document.getElementById("btn-open-csv");
    el.liveView = document.getElementById("live-view");
    el.analysisView = document.getElementById("analysis-view");
    el.analysisFilename = document.getElementById("analysis-filename");
    el.analysisPoints = document.getElementById("analysis-points");
    el.analysisSvg = document.getElementById("analysis-svg");
    el.analysisAxis = document.getElementById("analysis-axis");
    el.btnCloseAnalysis = document.getElementById("btn-close-analysis");
    el.btnRefreshPorts = document.getElementById("btn-refresh-ports");
  }

  function formatDbm(value) {
    if (value === null || value === undefined) return "–.-";
    return (value >= 0 ? "+" : "") + value.toFixed(1);
  }

  function formatPower(value, unit) {
    if (value === null || value === undefined) return "–.- µW";
    return `${value.toFixed(2)} ${unit}`;
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    setTheme(saved === "light" ? "light" : "dark");
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    setTheme(current === "dark" ? "light" : "dark");
  }

  function initAccordion() {
    el.accordion.querySelectorAll(".acc-section").forEach((section) => {
      const head = section.querySelector(".acc-head");
      const body = section.querySelector(".acc-body");
      head.addEventListener("click", () => expandSection(section));
      body.addEventListener("transitionend", (event) => {
        if (event.propertyName !== "grid-template-rows") return;
        const inner = section.querySelector(".acc-inner");
        inner.classList.toggle("scrollable", section.classList.contains("expanded"));
      });
    });
  }

  function expandSection(target) {
    el.accordion.querySelectorAll(".acc-section").forEach((section) => {
      const expanded = section === target;
      section.classList.toggle("expanded", expanded);
      section.querySelector(".acc-head").setAttribute("aria-expanded", String(expanded));
      if (!expanded) section.querySelector(".acc-inner").classList.remove("scrollable");
    });
  }

  function closePopovers() {
    document.querySelectorAll(".slot-popover").forEach((p) => p.remove());
  }

  function openPopover(anchorEl, index, slot) {
    if (anchorEl.dataset.popoverOpen === "1") {
      closePopovers();
      delete anchorEl.dataset.popoverOpen;
      return;
    }
    closePopovers();
    anchorEl.dataset.popoverOpen = "1";

    const popover = document.createElement("div");
    popover.className = "slot-popover";
    popover.addEventListener("click", (event) => event.stopPropagation());

    const freqField = document.createElement("div");
    freqField.className = "field";
    const freqLabel = document.createElement("label");
    freqLabel.textContent = I18n.t("slots.freq");
    const freqInput = document.createElement("input");
    freqInput.type = "number";
    freqInput.min = "0";
    freqInput.max = "9999";
    freqInput.value = slot ? slot.frequency_mhz : "";
    freqField.appendChild(freqLabel);
    freqField.appendChild(freqInput);

    const offsetField = document.createElement("div");
    offsetField.className = "field";
    const offsetLabel = document.createElement("label");
    offsetLabel.textContent = I18n.t("slots.offset");
    const offsetInput = document.createElement("input");
    offsetInput.type = "number";
    offsetInput.step = "0.1";
    offsetInput.value = slot ? slot.offset_dbm : "";
    offsetField.appendChild(offsetLabel);
    offsetField.appendChild(offsetInput);

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn primary";
    saveBtn.textContent = I18n.t("slots.save");
    saveBtn.addEventListener("click", () => {
      const frequencyMhz = parseInt(freqInput.value, 10);
      const offsetDbm = parseFloat(offsetInput.value);
      if (Number.isNaN(frequencyMhz) || Number.isNaN(offsetDbm)) return;
      writeSlot(index, frequencyMhz, offsetDbm);
      popover.remove();
    });

    popover.appendChild(freqField);
    popover.appendChild(offsetField);
    popover.appendChild(saveBtn);
    document.body.appendChild(popover);

    const rect = anchorEl.getBoundingClientRect();
    const popoverWidth = 190;
    let left = rect.right - popoverWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8));
    popover.style.left = `${left}px`;
    popover.style.top = `${rect.bottom + 6}px`;

    freqInput.focus();
  }

  function renderSlots() {
    el.slotsGrid.innerHTML = "";
    for (let index = 1; index <= SLOT_COUNT; index += 1) {
      const slot = slots[index];
      const card = document.createElement("div");
      card.className = "slot-card" + (index === selectedSlot ? " active" : "");
      card.addEventListener("click", () => {
        selectedSlot = index;
        if (slot) writeSlot(index, slot.frequency_mhz, slot.offset_dbm);
        renderSlots();
      });

      const top = document.createElement("div");
      top.className = "slot-top";
      const badge = document.createElement("span");
      badge.className = "slot-badge";
      badge.textContent = SLOT_LETTERS[index - 1];
      const editBtn = document.createElement("button");
      editBtn.className = "slot-edit";
      editBtn.title = I18n.t("slots.save");
      editBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
      editBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        openPopover(editBtn, index, slot);
      });
      top.appendChild(badge);
      top.appendChild(editBtn);

      const freq = document.createElement("div");
      freq.className = "slot-freq";
      freq.innerHTML = slot
        ? `${slot.frequency_mhz}<span class="u">MHz</span>`
        : `–<span class="u">MHz</span>`;

      const offset = document.createElement("div");
      offset.className = "slot-offset";
      if (slot) {
        const cls = slot.offset_dbm >= 0 ? "pos" : "neg";
        offset.innerHTML = `<span class="${cls}">${slot.offset_dbm >= 0 ? "+" : ""}${slot.offset_dbm.toFixed(1)} dB</span>`;
      } else {
        offset.textContent = "– dB";
      }

      card.appendChild(top);
      card.appendChild(freq);
      card.appendChild(offset);
      el.slotsGrid.appendChild(card);
    }
    const count = Object.keys(slots).length;
    el.slotsMeta.textContent = count ? `${count}/${SLOT_COUNT}` : "–";
  }

  function appendLog(direction, payload, timestamp) {
    logRows.push({ direction, payload, timestamp });
    if (logRows.length > LOG_MAX_ROWS) logRows.shift();
    const row = document.createElement("div");
    row.className = "log-row";
    const time = new Date(timestamp * 1000);
    const hh = String(time.getHours()).padStart(2, "0");
    const mm = String(time.getMinutes()).padStart(2, "0");
    const ss = String(time.getSeconds()).padStart(2, "0");
    row.innerHTML = `
      <span class="t">${hh}:${mm}:${ss}</span>
      <span class="dir ${direction}">${direction.toUpperCase()}</span>
      <span class="payload">${payload}</span>
    `;
    el.log.appendChild(row);
    while (el.log.children.length > LOG_MAX_ROWS) el.log.removeChild(el.log.firstChild);
    el.log.scrollTop = el.log.scrollHeight;
    el.logMeta.textContent = String(logRows.length);
  }

  function updateReadout(reading) {
    lastReading = reading;
    el.readingCurrentDbm.innerHTML = `${formatDbm(reading.dbm)} <small>dBm</small>`;
    el.readingCurrentPower.textContent = formatPower(reading.power, reading.unit);

    if (minDbm === null || reading.dbm < minDbm) {
      minDbm = reading.dbm;
      el.readingMinDbm.innerHTML = `${formatDbm(minDbm)} <small style="font-size:12px;">dBm</small>`;
      el.readingMinPower.textContent = formatPower(reading.power, reading.unit);
    }
    if (maxDbm === null || reading.dbm > maxDbm) {
      maxDbm = reading.dbm;
      el.readingMaxDbm.innerHTML = `${formatDbm(maxDbm)} <small style="font-size:12px;">dBm</small>`;
      el.readingMaxPower.textContent = formatPower(reading.power, reading.unit);
    }
    if (!paused) {
      const activeSlot = slots[selectedSlot];
      const slotInfo = activeSlot
        ? { letter: SLOT_LETTERS[selectedSlot - 1], frequencyMhz: activeSlot.frequency_mhz, offsetDbm: activeSlot.offset_dbm }
        : null;
      PowerChart.push(reading.dbm, slotInfo);
    }
    if (recording) {
      const activeSlot = slots[selectedSlot];
      captures.push({
        timestamp: (Date.now() / 1000).toFixed(3),
        slot_letter: activeSlot ? SLOT_LETTERS[selectedSlot - 1] : "",
        frequency_mhz: activeSlot ? activeSlot.frequency_mhz : "",
        offset_dbm: activeSlot ? activeSlot.offset_dbm : "",
        current_dbm: reading.dbm,
        current_power: reading.power,
        current_unit: reading.unit,
        min_dbm: minDbm,
        min_power: minDbm,
        min_unit: reading.unit,
        max_dbm: maxDbm,
        max_power: maxDbm,
        max_unit: reading.unit,
      });
      el.btnCapture.querySelector(".rec-count").textContent = String(captures.length);
    }
  }

  function resetMinMax() {
    minDbm = null;
    maxDbm = null;
    el.readingMaxDbm.innerHTML = `–.- <small style="font-size:12px;">dBm</small>`;
    el.readingMaxPower.textContent = "–.- µW";
    el.readingMinDbm.innerHTML = `–.- <small style="font-size:12px;">dBm</small>`;
    el.readingMinPower.textContent = "–.- µW";
    PowerChart.reset();
  }

  function togglePause() {
    paused = !paused;
    el.btnPause.textContent = I18n.t(paused ? "readouts.resume" : "readouts.pause");
    el.btnPauseChart.textContent = I18n.t(paused ? "chart.resume" : "chart.pause");
    PowerChart.setPaused(paused);
    el.liveIndicator.classList.toggle("on", !paused && connected);
  }

  function toggleRecording() {
    if (recording) {
      recording = false;
      el.btnCapture.classList.remove("recording");
      updateCaptureLabel();
      const rows = captures;
      captures = [];
      if (rows.length) pywebview.api.export_csv(rows);
      return;
    }
    captures = [];
    recording = true;
    el.btnCapture.classList.add("recording");
    updateCaptureLabel();
  }

  function updateCaptureLabel() {
    const label = I18n.t(recording ? "readouts.stopCapture" : "readouts.capture");
    el.btnCapture.innerHTML = recording
      ? `<span class="rec-dot"></span>${label} <span class="rec-count">${captures.length}</span>`
      : label;
  }

  function refreshPorts() {
    pywebview.api.list_ports().then((ports) => {
      el.portSelect.innerHTML = "";
      if (!ports.length) {
        const opt = document.createElement("option");
        opt.textContent = I18n.t("footer.noPorts");
        opt.disabled = true;
        el.portSelect.appendChild(opt);
        return;
      }
      ports.forEach((port) => {
        const opt = document.createElement("option");
        opt.value = port.device;
        opt.textContent = `${port.device} — ${port.description}`;
        el.portSelect.appendChild(opt);
      });
    });
  }

  function toggleConnection() {
    if (connected) {
      pywebview.api.disconnect();
      return;
    }
    const port = el.portSelect.value;
    if (!port) return;
    pywebview.api.connect(port);
  }

  function writeSlot(index, frequencyMhz, offsetDbm) {
    pywebview.api.write_slot(index, frequencyMhz, offsetDbm);
  }

  function setSampleRate(level) {
    sampleRate = level;
    pywebview.api.set_sample_rate(level);
    el.rateSwitch.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.rate) === level);
    });
    el.rateMeta.textContent = RATE_LABELS[level];
  }

  function openAnalysis() {
    pywebview.api.open_csv().then((result) => {
      if (!result || !result.rows.length) return;
      renderAnalysis(result.file_path, result.rows);
      el.liveView.hidden = true;
      el.analysisView.hidden = false;
    });
  }

  function closeAnalysis() {
    el.analysisView.hidden = true;
    el.liveView.hidden = false;
  }

  function analysisYFor(dbm) {
    const clamped = Math.max(ANALYSIS_DBM_MIN, Math.min(ANALYSIS_DBM_MAX, dbm));
    const frac = (clamped - ANALYSIS_DBM_MIN) / (ANALYSIS_DBM_MAX - ANALYSIS_DBM_MIN);
    return ANALYSIS_HEIGHT - ANALYSIS_PAD_BOTTOM - frac * (ANALYSIS_HEIGHT - ANALYSIS_PAD_TOP - ANALYSIS_PAD_BOTTOM);
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs).forEach((key) => node.setAttribute(key, attrs[key]));
    return node;
  }

  function ensureAnalysisTooltip() {
    if (analysisTooltip) return;
    analysisTooltip = document.createElement("div");
    analysisTooltip.className = "chart-tooltip";
    document.body.appendChild(analysisTooltip);
  }

  function renderAnalysis(filePath, rows) {
    analysisRows = rows;
    const axisWidth = 46;
    const width = Math.max(el.analysisSvg.parentElement.clientWidth, rows.length * ANALYSIS_POINT_SPACING + 20);

    const fileName = filePath.split(/[\\/]/).pop();
    el.analysisFilename.textContent = fileName;
    el.analysisPoints.textContent = I18n.t("analysis.points", { count: rows.length });

    const gridColor = getComputedStyle(document.documentElement).getPropertyValue("--grid-line").trim() || "#262e39";
    const textColor = getComputedStyle(document.documentElement).getPropertyValue("--text-faint").trim() || "#5c6472";
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent-strong").trim() || "#4dd6c2";

    const axis = el.analysisAxis;
    axis.setAttribute("viewBox", `0 0 ${axisWidth} ${ANALYSIS_HEIGHT}`);
    while (axis.firstChild) axis.removeChild(axis.firstChild);
    for (let dbm = ANALYSIS_DBM_MIN; dbm <= ANALYSIS_DBM_MAX; dbm += 10) {
      const y = analysisYFor(dbm);
      const label = svgEl("text", {
        x: axisWidth - 8, y: y + 4, "text-anchor": "end",
        fill: textColor, "font-size": 11, "font-family": "IBM Plex Mono, monospace",
      });
      label.textContent = String(dbm);
      axis.appendChild(label);
    }

    const svg = el.analysisSvg;
    svg.setAttribute("viewBox", `0 0 ${width} ${ANALYSIS_HEIGHT}`);
    svg.setAttribute("width", width);
    svg.setAttribute("height", ANALYSIS_HEIGHT);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    for (let dbm = ANALYSIS_DBM_MIN; dbm <= ANALYSIS_DBM_MAX; dbm += 10) {
      const y = analysisYFor(dbm);
      svg.appendChild(svgEl("line", {
        x1: 0, x2: width, y1: y, y2: y, stroke: gridColor, "stroke-width": 1,
      }));
    }

    const linePoints = rows
      .map((row, i) => {
        const x = i * ANALYSIS_POINT_SPACING;
        const y = analysisYFor(parseFloat(row.current_dbm));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" L");
    const pathData = `M${linePoints}`;
    const baselineY = analysisYFor(ANALYSIS_DBM_MIN);
    const lastX = (rows.length - 1) * ANALYSIS_POINT_SPACING;
    const areaData = `M0,${baselineY} L${linePoints} L${lastX.toFixed(1)},${baselineY} Z`;

    const gradientId = "analysis-area-gradient";
    const defs = svgEl("defs", {});
    const gradient = svgEl("linearGradient", {
      id: gradientId, x1: "0", y1: "0", x2: "0", y2: "1",
    });
    gradient.appendChild(svgEl("stop", { offset: "0%", "stop-color": accentColor, "stop-opacity": "0.35" }));
    gradient.appendChild(svgEl("stop", { offset: "100%", "stop-color": accentColor, "stop-opacity": "0" }));
    defs.appendChild(gradient);
    svg.appendChild(defs);

    svg.appendChild(svgEl("path", { d: areaData, fill: `url(#${gradientId})`, stroke: "none" }));

    svg.appendChild(svgEl("path", {
      d: pathData, fill: "none", stroke: accentColor, "stroke-width": 2,
      "stroke-linejoin": "round", "stroke-linecap": "round",
    }));
  }

  function onAnalysisPointerMove(event) {
    if (!analysisRows.length) return;
    const rect = el.analysisSvg.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const index = Math.max(0, Math.min(analysisRows.length - 1, Math.round(localX / ANALYSIS_POINT_SPACING)));
    const row = analysisRows[index];
    const dbm = parseFloat(row.current_dbm);

    const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent-strong").trim() || "#4dd6c2";
    const surfaceColor = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#1b212a";
    const existing = el.analysisSvg.querySelector("#analysis-hover-dot");
    if (existing) existing.remove();
    el.analysisSvg.appendChild(svgEl("circle", {
      id: "analysis-hover-dot",
      cx: index * ANALYSIS_POINT_SPACING, cy: analysisYFor(dbm), r: 5,
      fill: accentColor, stroke: surfaceColor, "stroke-width": 2,
    }));

    ensureAnalysisTooltip();
    const time = row.timestamp ? new Date(parseFloat(row.timestamp) * 1000) : null;
    const timeText = time ? time.toLocaleTimeString(undefined, { hour12: false }) : "";
    const offsetNum = parseFloat(row.offset_dbm);
    const offsetText = row.offset_dbm !== "" && !Number.isNaN(offsetNum)
      ? `<span>${offsetNum >= 0 ? "+" : ""}${offsetNum.toFixed(1)} dB</span>`
      : "";
    const slotText = row.slot_letter ? `<span>${row.frequency_mhz} MHz</span>${offsetText}` : "";
    analysisTooltip.innerHTML = `<strong>${dbm.toFixed(1)} dBm</strong><span>${row.current_power} ${row.current_unit}</span>${slotText}${timeText ? `<span>${timeText}</span>` : ""}`;
    analysisTooltip.style.left = `${event.clientX + 14}px`;
    analysisTooltip.style.top = `${event.clientY + 14}px`;
    analysisTooltip.classList.add("visible");
  }

  function onAnalysisPointerLeave() {
    if (analysisTooltip) analysisTooltip.classList.remove("visible");
    const existing = el.analysisSvg.querySelector("#analysis-hover-dot");
    if (existing) existing.remove();
  }

  function bindEvents() {
    el.btnRefreshPorts.addEventListener("click", refreshPorts);
    el.btnOpenCsv.addEventListener("click", openAnalysis);
    el.btnCloseAnalysis.addEventListener("click", closeAnalysis);
    el.analysisSvg.addEventListener("mousemove", onAnalysisPointerMove);
    el.analysisSvg.addEventListener("mouseleave", onAnalysisPointerLeave);
    el.btnConnect.addEventListener("click", toggleConnection);
    el.btnTheme.addEventListener("click", toggleTheme);
    el.btnPause.addEventListener("click", togglePause);
    el.btnPauseChart.addEventListener("click", togglePause);
    el.btnResetMinMax.addEventListener("click", resetMinMax);
    el.btnCapture.addEventListener("click", toggleRecording);
    el.btnReadSlots.addEventListener("click", () => pywebview.api.request_settings());
    el.rateSwitch.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => setSampleRate(Number(btn.dataset.rate)));
    });
    el.langSwitch.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => I18n.setLang(btn.dataset.lang));
    });
    document.addEventListener("i18n:changed", () => {
      renderSlots();
      updateCaptureLabel();
    });
    document.addEventListener("click", () => closePopovers());
  }

  function handlePower(reading) {
    updateReadout(reading);
  }

  function handleSettings(newSlots) {
    slots = {};
    newSlots.forEach((slot) => { slots[slot.index] = slot; });
    renderSlots();
  }

  function handleLog(entry) {
    appendLog(entry.direction, entry.payload, entry.timestamp);
  }

  function handleConnectionChanged(status) {
    connected = status.connected;
    el.connectionDot.classList.toggle("connected", connected);
    el.btnConnect.textContent = I18n.t(connected ? "titlebar.disconnect" : "titlebar.connect");
    el.btnConnect.classList.toggle("danger", !connected);
    el.liveIndicator.classList.toggle("on", connected && !paused);
    if (connected) {
      currentPort = el.portSelect.value;
      el.statusConnection.textContent = I18n.t("footer.connected", { port: currentPort });
    } else {
      currentPort = null;
      el.statusConnection.textContent = I18n.t("footer.disconnected");
      slots = {};
      renderSlots();
    }
  }

  function registerBridge() {
    window.PowerMeterEvents = {
      onPower: handlePower,
      onSettings: handleSettings,
      onLog: handleLog,
      onConnectionChanged: handleConnectionChanged,
    };
  }

  async function init() {
    cacheDom();
    initTheme();
    await I18n.init();
    initAccordion();
    renderSlots();
    bindEvents();
    registerBridge();
    PowerChart.init(el.chartSvg);
    refreshPorts();
  }

  return { init };
})();

window.addEventListener("pywebviewready", () => App.init());
