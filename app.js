(function () {
  "use strict";
  const D = window.DATA, LG = window.Logic;
  const $ = (id) => document.getElementById(id);
  const MENIT = [15, 30, 60];
  const COLORS = ["#e8f1f2", "#bcd8dc", "#8dbcc4", "#55969f", "#2b6b75"];
  const KEY_STORE = "ors_key_webgis_pati", ISO_STORE = "iso_webgis_pati";
  const state = { menit: 30, luar: false, speed: 30, iso: null, sumber: "radius", tgl: null, key: "", busy: false, routeOn: false };

  function sget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- data ----------
  const kecs = D.kecamatan.features.map((f) => ({
    nama: f.properties.kecamatan, luas: f.properties.luas_km2, geom: f.geometry,
    pts: LG.samplePoints(f.geometry, 0.0045),
  }));
  const faskes = D.faskes.features.map((f) => ({
    nama: f.properties.nama, jenis: f.properties.jenis, kec: f.properties.kecamatan,
    sumber: f.properties.sumber, catatan: f.properties.catatan, luar: !!f.properties.luar,
    igd: !!f.properties.igd, coord: f.geometry.coordinates,
  }));
  const igdList = faskes.filter((f) => f.igd);

  // ---------- peta ----------
  const map = L.map("map", { zoomSnap: 0.25 });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 18, subdomains: "abcd",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO | Batas: BIG",
  }).addTo(map);

  const byName = {};
  const kecLayer = L.geoJSON(D.kecamatan, {
    style: { color: "#44606a", weight: 1, fillColor: COLORS[0], fillOpacity: 0.75 },
    onEachFeature: (f, layer) => { byName[f.properties.kecamatan] = layer; },
  });
  const isoLayer = L.layerGroup();
  const rsLayer = L.layerGroup(), pkmLayer = L.layerGroup(), luarLayer = L.layerGroup();
  const routeLayer = L.layerGroup();

  function popupFaskes(f) {
    return "<b>" + esc(f.nama) + "</b><br>" + esc(f.jenis) + (f.kec ? " &middot; " + esc(f.kec) : "") +
      "<br><span style='color:#5b6b79'>Koordinat: " + esc(f.sumber) + "</span>" + (f.catatan ? "<br><i>" + esc(f.catatan) + "</i>" : "");
  }
  for (const f of faskes) {
    const ll = [f.coord[1], f.coord[0]];
    if (f.igd) {
      const m = L.marker(ll, { icon: L.divIcon({ className: "", html: '<div class="rsicon' + (f.luar ? " luar" : "") + '">H</div>', iconSize: [22, 22], iconAnchor: [11, 11] }) });
      m.bindPopup(popupFaskes(f));
      (f.luar ? luarLayer : rsLayer).addLayer(m);
    } else {
      L.circleMarker(ll, { radius: 5, color: "#fff", weight: 1.5, fillColor: "#1d4ed8", fillOpacity: 1, bubblingMouseEvents: false })
        .bindPopup(popupFaskes(f)).addTo(pkmLayer);
    }
  }
  kecLayer.addTo(map); isoLayer.addTo(map); pkmLayer.addTo(map); rsLayer.addTo(map); routeLayer.addTo(map);
  map.fitBounds(kecLayer.getBounds());

  // ---------- sumber isokron ----------
  function loadIso() {
    if (window.ISOKRON && window.ISOKRON.items && window.ISOKRON.items.length) {
      state.iso = LG.prep(window.ISOKRON.items); state.sumber = "ors"; state.tgl = window.ISOKRON.dibuat; return;
    }
    const s = sget(ISO_STORE);
    if (s) {
      try {
        const o = JSON.parse(s);
        if (o.items && o.items.length) { state.iso = LG.prep(o.items); state.sumber = "ors"; state.tgl = o.dibuat; return; }
      } catch (e) { /* abaikan */ }
    }
    useRadius();
  }
  function useRadius() {
    state.iso = LG.prep(LG.radiusItems(igdList, state.speed, MENIT)); state.sumber = "radius"; state.tgl = null;
  }

  // ---------- tampilan hasil ----------
  function colorFor(p) { return COLORS[Math.min(4, Math.floor(p / 20.0001))]; }
  function refresh() {
    const cov = LG.coverage(kecs, state.iso, state.menit, state.luar);
    const penduduk = Object.keys(D.penduduk || {}).length ? D.penduduk : null;
    const sum = LG.summarize(cov, penduduk);
    $("sLuas").textContent = sum.persenLuas.toFixed(0) + "%";
    $("sKec").textContent = sum.kecKurang + " dari " + kecs.length;
    $("cardPend").style.display = sum.persenPend == null ? "none" : "";
    if (sum.persenPend != null) $("sPend").textContent = sum.persenPend.toFixed(0) + "%";

    const badge = $("sumberBadge");
    if (state.sumber === "ors") { badge.textContent = "Isokron ORS" + (state.tgl ? " (" + state.tgl + ")" : ""); badge.className = "badge"; }
    else { badge.textContent = "Perkiraan radius garis lurus " + state.speed + " km/jam (bukan rute jalan)"; badge.className = "badge warn"; }
    $("btnDl").disabled = state.sumber !== "ors";

    const byKec = {};
    for (const r of cov) byKec[r.nama] = r;
    kecLayer.eachLayer((l) => {
      const r = byKec[l.feature.properties.kecamatan];
      l.setStyle({ fillColor: colorFor(r.persen) });
      l.bindTooltip(esc(r.nama) + ": " + r.persen.toFixed(0) + "% wilayah terjangkau ≤ " + state.menit + " menit", { sticky: true });
    });

    const tbl = $("tbl"); tbl.innerHTML = "";
    cov.slice().sort((a, b) => a.persen - b.persen).forEach((r) => {
      const tr = document.createElement("tr"); tr.className = "k";
      tr.innerHTML = "<td>" + esc(r.nama) + '</td><td><div class="bar"><i style="width:' + r.persen.toFixed(0) + '%;background:' + (r.persen < 50 ? "#c2410c" : "") + '"></i></div></td><td class="pct">' + r.persen.toFixed(0) + "%</td>";
      tr.onclick = () => { const l = byName[r.nama]; if (l) { map.fitBounds(l.getBounds(), { padding: [30, 30] }); l.openTooltip(); } };
      tbl.appendChild(tr);
    });
    drawIso();
  }
  function drawIso() {
    isoLayer.clearLayers();
    if (!$("lIso").checked) return;
    for (const i of state.iso) {
      if (i.menit !== state.menit || (i.luar && !state.luar)) continue;
      L.geoJSON(i.geom, { style: { color: "#c2410c", weight: 1, fillColor: "#fb923c", fillOpacity: 0.14 }, interactive: false }).addTo(isoLayer);
    }
  }
  function toggle(layer, on) { if (on) layer.addTo(map); else map.removeLayer(layer); }

  // legenda
  $("legend").innerHTML = COLORS.map((c) => '<i style="background:' + c + '"></i>').join("");

  // ---------- kontrol ----------
  $("seg").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.menit = +b.dataset.m;
    [...$("seg").children].forEach((x) => x.classList.toggle("on", x === b));
    refresh();
  });
  $("lKec").onchange = (e) => toggle(kecLayer, e.target.checked);
  $("lIso").onchange = drawIso;
  $("lRs").onchange = (e) => { toggle(rsLayer, e.target.checked); toggle(luarLayer, e.target.checked && state.luar); };
  $("lPkm").onchange = (e) => toggle(pkmLayer, e.target.checked);
  $("lLuar").onchange = (e) => { state.luar = e.target.checked; toggle(luarLayer, state.luar && $("lRs").checked); refresh(); };
  $("speed").onchange = (e) => {
    state.speed = Math.max(15, Math.min(60, +e.target.value || 30));
    e.target.value = state.speed;
    if (state.sumber === "radius") { useRadius(); refresh(); }
  };
  $("lRoute").onchange = (e) => { state.routeOn = e.target.checked; if (!state.routeOn) routeLayer.clearLayers(); };
  state.key = sget(KEY_STORE) || ""; $("key").value = state.key;
  $("key").onchange = (e) => { state.key = e.target.value.trim(); sset(KEY_STORE, state.key); };

  function setStatus(msg, bad) { const s = $("status"); s.textContent = msg; s.style.color = bad ? "#b91c1c" : ""; }

  // ---------- OpenRouteService ----------
  async function ors(path, body) {
    const res = await fetch("https://api.openrouteservice.org" + path, {
      method: "POST",
      headers: { Authorization: state.key, "Content-Type": "application/json", Accept: "application/json, application/geo+json" },
      body: JSON.stringify(body),
    });
    let data = null; try { data = await res.json(); } catch (e) { /* kosong */ }
    if (!res.ok) {
      const m = data && data.error && (data.error.message || data.error);
      throw new Error(res.status + ": " + (typeof m === "string" ? m : m ? JSON.stringify(m) : res.statusText));
    }
    return data;
  }
  function roundGeom(g) {
    const r = (c) => (typeof c[0] === "number" ? [+c[0].toFixed(4), +c[1].toFixed(4)] : c.map(r));
    return { type: g.type, coordinates: r(g.coordinates) };
  }

  $("btnIso").onclick = async () => {
    if (state.busy) return;
    state.key = $("key").value.trim(); sset(KEY_STORE, state.key);
    if (!state.key) { setStatus("Isi API key ORS dulu.", true); return; }
    state.busy = true; $("btnIso").disabled = true;
    const items = [];
    try {
      const batches = []; for (let i = 0; i < igdList.length; i += 5) batches.push(igdList.slice(i, i + 5));
      for (let b = 0; b < batches.length; b++) {
        setStatus("Menghitung isokron… (" + (b + 1) + "/" + batches.length + ")");
        const bt = batches[b];
        const data = await ors("/v2/isochrones/driving-car", { locations: bt.map((x) => x.coord), range: [900, 1800, 3600], range_type: "time" });
        for (const f of data.features) {
          const fas = bt[f.properties.group_index];
          items.push({ nama: fas.nama, menit: Math.round(f.properties.value / 60), luar: fas.luar, geometry: roundGeom(f.geometry) });
        }
        if (b < batches.length - 1) await sleep(2500);
      }
      const dibuat = new Date().toLocaleDateString("id-ID");
      const ok = sset(ISO_STORE, JSON.stringify({ dibuat, items }));
      state.iso = LG.prep(items); state.sumber = "ors"; state.tgl = dibuat; window.__isokron = { dibuat, items };
      refresh();
      setStatus("Selesai: " + items.length + " area jangkauan." + (ok ? "" : " (Tidak tersimpan di browser, segera unduh hasilnya.)") + " Klik 'Unduh hasil' lalu simpan sebagai data/isokron.js.");
    } catch (err) {
      setStatus("Gagal: " + err.message, true);
    }
    state.busy = false; $("btnIso").disabled = false;
  };
  $("btnDl").onclick = () => {
    const obj = window.__isokron || (window.ISOKRON && window.ISOKRON.items ? window.ISOKRON : null) || JSON.parse(sget(ISO_STORE) || "null");
    if (!obj) return;
    const blob = new Blob(["window.ISOKRON=" + JSON.stringify(obj) + ";"], { type: "text/javascript" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "isokron.js";
    document.body.appendChild(a); a.click(); a.remove();
  };

  map.on("click", async (e) => {
    if (!state.routeOn || state.busy) return;
    if (!state.key) { setStatus("Isi API key ORS untuk memakai fitur rute.", true); return; }
    state.busy = true; routeLayer.clearLayers();
    const cands = igdList.filter((f) => state.luar || !f.luar);
    const from = [e.latlng.lng, e.latlng.lat];
    L.circleMarker(e.latlng, { radius: 6, color: "#fff", weight: 2, fillColor: "#0f766e", fillOpacity: 1 }).addTo(routeLayer);
    try {
      setStatus("Mencari IGD terdekat…");
      const m = await ors("/v2/matrix/driving-car", {
        locations: [from].concat(cands.map((c) => c.coord)),
        sources: [0], destinations: cands.map((_, i) => i + 1), metrics: ["duration", "distance"],
      });
      let best = -1, bd = Infinity;
      m.durations[0].forEach((d, i) => { if (d != null && d < bd) { bd = d; best = i; } });
      if (best < 0) throw new Error("tidak ada rute yang ditemukan dari titik ini");
      const tujuan = cands[best];
      const r = await ors("/v2/directions/driving-car/geojson", { coordinates: [from, tujuan.coord] });
      L.geoJSON(r, { style: { color: "#0f766e", weight: 5, opacity: 0.9 } }).addTo(routeLayer);
      const s = r.features[0].properties.summary;
      L.popup().setLatLng(e.latlng).setContent("<b>IGD terdekat: " + esc(tujuan.nama) + "</b><br>" + Math.round(s.duration / 60) + " menit &middot; " + (s.distance / 1000).toFixed(1) + " km (perkiraan, tanpa lalu lintas)").openOn(map);
      setStatus("");
    } catch (err) {
      setStatus("Rute gagal: " + err.message, true);
    }
    state.busy = false;
  });

  loadIso();
  refresh();
})();
