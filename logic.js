/* Logika hitungan (tanpa library): titik-dalam-poligon, sampel wilayah, cakupan, lingkaran. */
(function (root) {
  const Logic = {};

  function inRing(x, y, r) {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function inPoly(x, y, p) {
    if (!inRing(x, y, p[0])) return false;
    for (let k = 1; k < p.length; k++) if (inRing(x, y, p[k])) return false;
    return true;
  }
  function polys(g) { return g.type === "Polygon" ? [g.coordinates] : g.coordinates; }
  function bboxOf(g) {
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    for (const p of polys(g)) for (const pt of p[0]) {
      if (pt[0] < a) a = pt[0]; if (pt[1] < b) b = pt[1];
      if (pt[0] > c) c = pt[0]; if (pt[1] > d) d = pt[1];
    }
    return [a, b, c, d];
  }
  function inGeom(x, y, g, bb) {
    bb = bb || bboxOf(g);
    if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) return false;
    for (const p of polys(g)) if (inPoly(x, y, p)) return true;
    return false;
  }
  function samplePoints(g, step) {
    const bb = bboxOf(g), pts = [];
    for (let y = bb[1] + step / 2; y < bb[3]; y += step)
      for (let x = bb[0] + step / 2; x < bb[2]; x += step)
        if (inGeom(x, y, g, bb)) pts.push([x, y]);
    return pts;
  }
  function circle(lon, lat, km, n) {
    n = n || 72;
    const dLat = km / 110.574, dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
    const ring = [];
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
    }
    ring.push(ring[0]);
    return { type: "Polygon", coordinates: [ring] };
  }
  // items: [{nama, menit, luar, geometry}] -> tambah geom + bb
  function prep(items) {
    return items.map((i) => ({ nama: i.nama, menit: i.menit, luar: !!i.luar, geom: i.geometry, bb: bboxOf(i.geometry) }));
  }
  // cadangan: lingkaran garis lurus dari tiap RS (perkiraan kasar)
  function radiusItems(igdList, kmh, menitList) {
    const out = [];
    for (const f of igdList) for (const m of menitList)
      out.push({ nama: f.nama, menit: m, luar: f.luar, geometry: circle(f.coord[0], f.coord[1], (m / 60) * kmh) });
    return out;
  }
  function coverage(kecs, isos, menit, includeLuar) {
    const list = isos.filter((i) => i.menit === menit && (includeLuar || !i.luar));
    return kecs.map((k) => {
      let c = 0;
      for (const p of k.pts) {
        for (const i of list) if (inGeom(p[0], p[1], i.geom, i.bb)) { c++; break; }
      }
      const n = k.pts.length;
      return { nama: k.nama, n: n, covered: c, persen: n ? (100 * c) / n : 0 };
    });
  }
  function summarize(cov, penduduk) {
    let n = 0, c = 0, kurang = 0, pop = 0, popCov = 0, popOk = true;
    for (const r of cov) {
      n += r.n; c += r.covered;
      if (r.persen < 50) kurang++;
      const p = penduduk && penduduk[r.nama];
      if (p) { pop += p; popCov += (p * r.persen) / 100; } else popOk = false;
    }
    return { persenLuas: n ? (100 * c) / n : 0, kecKurang: kurang, persenPend: popOk && pop ? (100 * popCov) / pop : null };
  }

  Logic.inGeom = inGeom; Logic.bboxOf = bboxOf; Logic.samplePoints = samplePoints;
  Logic.circle = circle; Logic.prep = prep; Logic.radiusItems = radiusItems;
  Logic.coverage = coverage; Logic.summarize = summarize;
  root.Logic = Logic;
  if (typeof module !== "undefined") module.exports = Logic;
})(typeof window !== "undefined" ? window : globalThis);
