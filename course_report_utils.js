"use strict";

function deltaValue(baseValue, nextValue) {
  if (!Number.isFinite(baseValue) || !Number.isFinite(nextValue)) return null;
  return nextValue - baseValue;
}

function deltaCell(value, formatter, lowerIsBetter) {
  return el("td", {
    className: `number-cell delta-cell ${deltaClass(value, lowerIsBetter)}`,
    text: formatter(value),
  });
}

function deltaClass(value, lowerIsBetter) {
  if (!Number.isFinite(value) || value === 0) return "delta-neutral";
  const isBetter = lowerIsBetter ? value < 0 : value > 0;
  return isBetter ? "delta-positive" : "delta-negative";
}

function formatComparisonValue(value, formatter) {
  if (!Number.isFinite(value)) return "";
  if (formatter === formatSignedCount) return String(value);
  if (formatter === formatSignedPercent) return formatPercent(value);
  return formatGrade(value);
}

function maxBy(items, getter) {
  return items.reduce(
    (best, item) => (getter(item) > getter(best) ? item : best),
    items[0],
  );
}

function minBy(items, getter) {
  return items.reduce(
    (best, item) => (getter(item) < getter(best) ? item : best),
    items[0],
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isRiskBand(band) {
  return band?.label === "< 50%";
}

function formatGrade(value) {
  return Number.isFinite(value) ? `${fmt1.format(value)}%` : "";
}

function formatGradePercent(value) {
  return formatGrade(value);
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${fmt1.format(value * 100)}%` : "";
}

function formatRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
  return `${formatGrade(min)} - ${formatGrade(max)}`;
}

function formatSignedCount(value) {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatSignedGrade(value) {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : ""}${fmt1.format(value)}%`;
}

function formatSignedGradePercent(value) {
  return formatSignedGrade(value);
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : ""}${fmt1.format(value * 100)}%`;
}

function slugify(value) {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "course";
}

function defaultFileLabel(fileName, fallback) {
  const label = String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/^course-results[-_]?/i, "")
    .trim();

  return label || fallback;
}

function el(tagName, options, children) {
  const node = document.createElement(tagName);
  const opts = options || {};

  for (const [key, value] of Object.entries(opts)) {
    if (key === "className") {
      node.className = value;
    } else if (key === "text") {
      node.textContent = value;
    } else if (key === "style") {
      Object.assign(node.style, value);
    } else {
      node.setAttribute(key, value);
    }
  }

  if (children) {
    for (const child of children) {
      node.append(child);
    }
  }

  return node;
}

function svg(tagName, attributes, content) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tagName);

  for (const [key, value] of Object.entries(attributes || {})) {
    node.setAttribute(key, value);
  }

  if (Array.isArray(content)) {
    for (const child of content) {
      node.append(child);
    }
  } else if (content !== undefined) {
    node.textContent = content;
  }

  return node;
}
