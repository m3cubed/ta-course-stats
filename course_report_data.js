"use strict";

function normalizeCourses(raw) {
  const entries = Array.isArray(raw)
    ? raw.map((value, index) => [courseNameFromValue(value, index), value])
    : Object.entries(raw || {});
  const usedIds = new Map();

  return entries
    .map(([name, value], index) => {
      const grades = extractGrades(value);
      const sectionIds = extractSectionIds(value);
      const label = String(name || `Course ${index + 1}`).trim();
      const baseId = slugify(label || `course-${index + 1}`);
      const idCount = usedIds.get(baseId) || 0;
      usedIds.set(baseId, idCount + 1);

      return {
        id: idCount ? `${baseId}-${idCount + 1}` : baseId,
        name: label || `Course ${index + 1}`,
        grades,
        sectionCount: sectionIds.length,
        stats: computeStats(grades),
      };
    })
    .filter((course) => course.grades.length > 0);
}

function courseNameFromValue(value, index) {
  if (value && typeof value === "object") {
    return (
      value.courseId || value.course || value.name || `Course ${index + 1}`
    );
  }

  return `Course ${index + 1}`;
}

function extractGrades(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (item && typeof item === "object") {
          return extractGrades(item);
        }

        return [parseGradeValue(item)];
      })
      .filter(Number.isFinite);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const source = Array.isArray(value.grades)
    ? value.grades
    : Array.isArray(value.students)
      ? value.students
      : Array.isArray(value.marks)
        ? value.marks
        : [];

  return source.map(parseGradeValue).filter(Number.isFinite);
}

function extractSectionIds(value) {
  if (Array.isArray(value)) {
    return value.flatMap(extractSectionIds).filter(Boolean);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const source = sectionSource(value);

  return source
    .map((section) => {
      if (typeof section === "string" || typeof section === "number") {
        return String(section);
      }

      if (section && typeof section === "object") {
        return section.courseId || section.sectionId || section.id || "";
      }

      return "";
    })
    .filter(Boolean);
}

function sectionSource(value) {
  const fields = ["courseIds", "courseId", "sectionIds", "sectionId", "sections"];

  for (const field of fields) {
    const source = value[field];
    if (Array.isArray(source)) return source;
    if (typeof source === "string" || typeof source === "number") return [source];
  }

  return [];
}

function parseGradeValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  if (typeof value === "string") {
    const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  if (value && typeof value === "object") {
    const fields = [
      "grade",
      "mark",
      "percentage",
      "percent",
      "score",
      "final",
      "current",
    ];
    for (const field of fields) {
      const parsed = parseGradeValue(value[field]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return NaN;
}

function computeStats(grades) {
  const values = grades.filter(Number.isFinite).sort((a, b) => a - b);
  const count = values.length;

  if (!count) {
    return {
      count: 0,
      average: null,
      median: null,
      min: null,
      max: null,
      q1: null,
      q3: null,
      p10: null,
      p90: null,
      iqr: null,
      stdDev: null,
      passCount: 0,
      riskCount: 0,
      distinctionCount: 0,
      passRate: null,
      riskRate: null,
      distinctionRate: null,
      bands: makeBands(values),
    };
  }

  const sum = values.reduce((total, grade) => total + grade, 0);
  const average = sum / count;
  const variance =
    values.reduce((total, grade) => total + Math.pow(grade - average, 2), 0) /
    count;
  const passCount = values.filter((grade) => grade >= 50).length;
  const riskCount = values.filter((grade) => grade < 50).length;
  const distinctionCount = values.filter((grade) => grade >= 80).length;
  const q1 = percentile(values, 0.25);
  const q3 = percentile(values, 0.75);

  return {
    count,
    average,
    median: percentile(values, 0.5),
    min: values[0],
    max: values[count - 1],
    q1,
    q3,
    p10: percentile(values, 0.1),
    p90: percentile(values, 0.9),
    iqr: q3 - q1,
    stdDev: Math.sqrt(variance),
    passCount,
    riskCount,
    distinctionCount,
    passRate: passCount / count,
    riskRate: riskCount / count,
    distinctionRate: distinctionCount / count,
    bands: makeBands(values),
  };
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  const position = (sortedValues.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function makeBands(values) {
  const bands = [
    { label: "< 50%", min: -Infinity, max: 49.999, count: 0 },
    { label: "50 - 59%", min: 50, max: 59.999, count: 0 },
    { label: "60 - 69%", min: 60, max: 69.999, count: 0 },
    { label: "70 - 79%", min: 70, max: 79.999, count: 0 },
    { label: "80 - 89%", min: 80, max: 89.999, count: 0 },
    { label: "90 - 99%", min: 90, max: 99.499, count: 0 },
    { label: "100%", min: 99.5, max: Infinity, count: 0 },
  ];

  for (const value of values) {
    const band = bands.find((item) => value >= item.min && value <= item.max);
    if (band) band.count += 1;
  }

  const total = values.length || 1;
  return bands.map((band) => ({
    label: band.label,
    count: band.count,
    percent: band.count / total,
  }));
}

function getCourseIdFromHash() {
  if (!window.location.hash.startsWith(ROUTE_COURSE_PREFIX)) return "";
  return decodeURIComponent(
    window.location.hash.slice(ROUTE_COURSE_PREFIX.length),
  );
}

function resolveCourseRoute(courseId) {
  if (isCompareOnlyRouteId(courseId)) {
    const compareId = courseId.slice(COMPARE_ONLY_ROUTE_PREFIX.length);
    const course = state.compareCourses.find((item) => item.id === compareId);
    return course ? { course, source: "compare" } : null;
  }

  const course = state.courses.find((item) => item.id === courseId);
  return course ? { course, source: "base" } : null;
}

function compareOnlyRouteId(courseId) {
  return `${COMPARE_ONLY_ROUTE_PREFIX}${courseId}`;
}

function isCompareOnlyRouteId(courseId) {
  return courseId.startsWith(COMPARE_ONLY_ROUTE_PREFIX);
}

function courseIndex(course) {
  const index = state.courses.findIndex((item) => item.id === course.id);
  return String(index + 1).padStart(2, "0");
}

function courseMarker(course, source) {
  if (source === "compare") {
    const index = state.compareCourses.findIndex(
      (item) => item.id === course.id,
    );
    return `C${String(index + 1).padStart(2, "0")}`;
  }

  return courseIndex(course);
}

function totalStudents() {
  return state.courses.reduce((total, course) => total + course.stats.count, 0);
}

function totalSections() {
  return state.courses.reduce(
    (total, course) => total + course.sectionCount,
    0,
  );
}

function overviewMetaText() {
  const sections = totalSections();
  return `${totalStudents()} students${sections ? ` / ${sections} sections` : ""}`;
}

function overviewNavMetaText(comparison) {
  if (!comparison) return overviewMetaText();
  const aggregate = aggregateCourseSet(combinedOverviewCourses());
  return `${aggregate.stats.count} students${aggregate.sectionCount ? ` / ${aggregate.sectionCount} sections` : ""}`;
}

function overviewNavStatText(comparison) {
  const aggregate = aggregateCourseSet(
    comparison ? combinedOverviewCourses() : state.courses,
  );
  if (!comparison) return formatGradePercent(aggregate.stats.average);
  return formatGradePercent(aggregate.stats.average);
}

function overviewSubtitle(courses, aggregate, sectionTotal) {
  const meta = `${courses.length} courses / ${aggregate.count} students${sectionTotal ? ` / ${sectionTotal} sections` : ""}`;
  if (!hasComparison()) return `${meta} in ${fileLabelForSource("base")}`;
  return `${meta} combined from ${fileLabelForSource("base")} and ${fileLabelForSource("compare")}`;
}

function comparisonOverviewSubtitle(summary) {
  return `${fileLabelForSource("base")}: ${fileSetMetaText(summary.base)} / ${fileLabelForSource("compare")}: ${fileSetMetaText(summary.next)}`;
}

function fileSetMetaText(aggregate) {
  return `${aggregate.courseCount} courses / ${aggregate.stats.count} students${aggregate.sectionCount ? ` / ${aggregate.sectionCount} sections` : ""}`;
}

function courseMetaText(course) {
  return `${course.stats.count} students${course.sectionCount ? ` / ${course.sectionCount} sections` : ""}`;
}

function coursePageSubtitle(course, source, compareCourse) {
  if (!hasComparison()) return courseMetaText(course);
  if (compareCourse)
    return `${courseMetaText(course)} / matched with ${fileLabelForSource("compare")}`;
  return `${courseMetaText(course)} / only in ${fileNameForSource(source)}`;
}

function courseNavMetaText(course, compareCourse, source = "base") {
  if (!hasComparison()) return courseMetaText(course);
  if (!compareCourse)
    return `Only in ${fileNameForSource(source)} / ${courseMetaText(course)}`;
  return `${course.stats.count} to ${compareCourse.stats.count} students`;
}

function courseNavStatText(course, compareCourse) {
  if (!compareCourse) return formatGradePercent(course.stats.average);
  return `${formatGradePercent(course.stats.average)} ${formatSignedGradePercent(deltaValue(course.stats.average, compareCourse.stats.average))}`;
}

function fileStatusText() {
  if (!state.fileName) return "No file loaded";
  if (!state.compareFileName) return fileLabelForSource("base");
  return `${fileLabelForSource("base")} vs ${fileLabelForSource("compare")}`;
}

function hasComparison() {
  return state.courses.length > 0 && state.compareCourses.length > 0;
}

function findCompareCourse(courseName) {
  return state.compareCourses.find((course) => course.name === courseName);
}

function compareOnlyCourses() {
  const baseNames = new Set(state.courses.map((course) => course.name));
  return state.compareCourses.filter((course) => !baseNames.has(course.name));
}

function combinedOverviewCourses() {
  const byName = new Map();

  for (const course of state.courses) {
    addCombinedCourse(byName, course, "base");
  }

  for (const course of state.compareCourses) {
    addCombinedCourse(byName, course, "compare");
  }

  return Array.from(byName.values()).map((course) => ({
    id: course.id,
    routeId: course.routeId,
    name: course.name,
    grades: course.grades,
    sectionCount: course.sectionCount,
    stats: computeStats(course.grades),
  }));
}

function addCombinedCourse(byName, course, source) {
  const existing = byName.get(course.name);
  const routeId =
    source === "compare" ? compareOnlyRouteId(course.id) : course.id;

  if (existing) {
    existing.grades.push(...course.grades);
    existing.sectionCount += course.sectionCount;
    if (source === "base") {
      existing.id = course.id;
      existing.routeId = routeId;
    }
    return;
  }

  byName.set(course.name, {
    id: course.id,
    routeId,
    name: course.name,
    grades: [...course.grades],
    sectionCount: course.sectionCount,
  });
}

function aggregateCourseSet(courses) {
  return {
    courseCount: courses.length,
    sectionCount: courses.reduce(
      (total, course) => total + course.sectionCount,
      0,
    ),
    stats: computeStats(courses.flatMap((course) => course.grades)),
  };
}

function comparisonPairs() {
  const compareByName = new Map(
    state.compareCourses.map((course) => [course.name, course]),
  );
  const used = new Set();
  const pairs = state.courses.map((base) => {
    const next = compareByName.get(base.name) || null;
    if (next) used.add(base.name);
    return { name: base.name, base, next };
  });

  for (const next of state.compareCourses) {
    if (!used.has(next.name)) {
      pairs.push({ name: next.name, base: null, next });
    }
  }

  return pairs;
}

function coursePairHref(pair) {
  const routeId = pair.base ? pair.base.id : compareOnlyRouteId(pair.next.id);
  return `${ROUTE_COURSE_PREFIX}${encodeURIComponent(routeId)}`;
}

function comparisonSummary() {
  const base = aggregateCourseSet(state.courses);
  const next = aggregateCourseSet(state.compareCourses);
  const matchedCount = comparisonPairs().filter(
    (pair) => pair.base && pair.next,
  ).length;

  return {
    base,
    next,
    matchedCount,
    studentDelta: deltaValue(base.stats.count, next.stats.count),
    sectionDelta: deltaValue(base.sectionCount, next.sectionCount),
    averageDelta: deltaValue(base.stats.average, next.stats.average),
    medianDelta: deltaValue(base.stats.median, next.stats.median),
    iqrDelta: deltaValue(base.stats.iqr, next.stats.iqr),
    riskCountDelta: deltaValue(base.stats.riskCount, next.stats.riskCount),
    distinctionCountDelta: deltaValue(
      base.stats.distinctionCount,
      next.stats.distinctionCount,
    ),
  };
}

function comparisonStatus(pair) {
  if (pair.base && pair.next) return "Matched";
  if (pair.base) return `Only in ${fileLabelForSource("base")}`;
  return `Only in ${fileLabelForSource("compare")}`;
}

function fileNameForSource(source) {
  return fileLabelForSource(source);
}

function fileLabelForSource(source) {
  if (source === "compare") {
    return (
      state.compareFileLabel ||
      defaultFileLabel(state.compareFileName, "Second file")
    );
  }

  return state.fileLabel || defaultFileLabel(state.fileName, "First file");
}
