/* ==========================================================
   SpendSense — chart helpers.
   Thin wrappers around Chart.js tuned to our palette.
   ========================================================== */

(function () {
  "use strict";

  if (!window.SS) return;
  const P = window.SS.PALETTE;

  function base(opts = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: P.primary,
            font: { family: "Inter", size: 12 },
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            padding: 14,
          },
          position: "bottom",
        },
        tooltip: {
          backgroundColor: P.primary,
          titleColor: "#F2E8B7",
          bodyColor: "#FFFEFA",
          cornerRadius: 8,
          padding: 10,
          titleFont: { family: "Inter", size: 12, weight: "600" },
          bodyFont: { family: "Inter", size: 12 },
        },
      },
      ...opts,
    };
  }

  function cartesian(extra = {}) {
    return {
      x: {
        grid: { display: false },
        ticks: { color: P.muted, font: { family: "Inter", size: 11 } },
        border: { color: P.border },
      },
      y: {
        grid: { color: P.border, drawBorder: false },
        ticks: {
          color: P.muted,
          font: { family: "Inter", size: 11 },
          callback: (v) => "₹" + (v >= 1000 ? v / 1000 + "k" : v),
        },
        border: { display: false },
        beginAtZero: true,
      },
      ...extra,
    };
  }

  function makeLine(ctx, labels, data, { label = "Spending", color = P.primary } = {}) {
    if (!window.Chart) return null;
    return new window.Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label,
            data,
            borderColor: color,
            backgroundColor: hexA(color, 0.12),
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: color,
            pointBorderColor: "#FFFEFA",
            pointBorderWidth: 2,
            borderWidth: 2.5,
          },
        ],
      },
      options: {
        ...base({ scales: cartesian() }),
      },
    });
  }

  function makeMultiLine(ctx, labels, datasets) {
    if (!window.Chart) return null;
    const parsed = datasets.map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.color || P.seq[i % P.seq.length],
      backgroundColor: hexA(ds.color || P.seq[i % P.seq.length], 0.1),
      borderDash: ds.dashed ? [6, 6] : [],
      fill: !!ds.fill,
      tension: 0.35,
      pointRadius: ds.pointRadius ?? 3,
      pointHoverRadius: (ds.pointRadius ?? 3) + 2,
      pointBackgroundColor: ds.color || P.seq[i % P.seq.length],
      pointBorderColor: "#FFFEFA",
      pointBorderWidth: 2,
      borderWidth: 2.5,
      spanGaps: true,
    }));
    return new window.Chart(ctx, {
      type: "line",
      data: { labels, datasets: parsed },
      options: { ...base({ scales: cartesian() }) },
    });
  }

  function makeBar(ctx, labels, data, { label = "Amount", colors } = {}) {
    if (!window.Chart) return null;
    const bg = colors || data.map((_, i) => P.seq[i % P.seq.length]);
    return new window.Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label,
            data,
            backgroundColor: bg,
            borderRadius: 8,
            borderSkipped: false,
          },
        ],
      },
      options: {
        ...base({ scales: cartesian() }),
      },
    });
  }

  const percentOnSlices = {
    id: "percentOnSlices",
    afterDatasetsDraw(chart) {
      const ds = chart.data.datasets[0];
      if (!ds) return;
      const total = ds.data.reduce((s, v) => s + Number(v || 0), 0);
      if (!total) return;
      const meta = chart.getDatasetMeta(0);
      const { ctx } = chart;
      ctx.save();
      ctx.font = '700 11px "Inter", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      meta.data.forEach((arc, i) => {
        const value = Number(ds.data[i] || 0);
        const pct = (value / total) * 100;
        if (pct < 5) return; // skip slices too small to label
        const pos = arc.tooltipPosition();
        ctx.fillStyle = "#15181B";
        ctx.fillText(`${pct.toFixed(0)}%`, pos.x, pos.y);
      });
      ctx.restore();
    },
  };

  function makeDoughnut(ctx, labels, data) {
    if (!window.Chart) return null;
    const colors = data.map((_, i) => P.seq[i % P.seq.length]);
    const total = data.reduce((s, v) => s + Number(v || 0), 0);
    const opts = base({
      cutout: "62%",
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            color: P.primary,
            font: { family: "Inter", size: 12 },
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            padding: 14,
            generateLabels(chart) {
              const ds = chart.data.datasets[0] || { data: [], backgroundColor: [] };
              return chart.data.labels.map((label, i) => ({
                text: label,
                fillStyle: ds.backgroundColor[i],
                strokeStyle: ds.backgroundColor[i],
                pointStyle: "circle",
                hidden: false,
                index: i,
              }));
            },
          },
        },
        tooltip: {
          backgroundColor: P.primary,
          titleColor: "#F2E8B7",
          bodyColor: "#FFFEFA",
          cornerRadius: 8,
          padding: 10,
          callbacks: {
            label(ctx) {
              const v = Number(ctx.parsed || 0);
              const pct = total ? ((v / total) * 100).toFixed(1) : "0";
              return ` ${ctx.label}: ₹${v.toLocaleString("en-IN")} · ${pct}%`;
            },
          },
        },
      },
    });
    // Prevent base() from re-overriding plugins
    opts.plugins = { ...opts.plugins };
    return new window.Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors,
            borderColor: "#FFFEFA",
            borderWidth: 3,
            hoverOffset: 6,
          },
        ],
      },
      options: opts,
      plugins: [percentOnSlices],
    });
  }

  function hexA(hex, alpha) {
    const h = hex.replace("#", "");
    const bigint = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  window.SS.charts = { makeLine, makeMultiLine, makeBar, makeDoughnut };
})();
