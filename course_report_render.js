"use strict";

function render() {
  fileStatus.textContent = fileStatusText();
  document.body.classList.toggle("has-data", state.courses.length > 0);
  document.body.classList.toggle("has-comparison", hasComparison());
  renderCourseNav();

  if (!state.courses.length) {
    renderEmpty();
    return;
  }

  if (window.location.hash === ROUTE_COMPARE) {
    if (hasComparison()) {
      renderComparison();
    } else {
      renderMessage("Comparison not loaded", "Choose a second JSON file to compare against the current report.");
    }
    return;
  }

  const courseId = getCourseIdFromHash();
  if (courseId) {
    const routeCourse = resolveCourseRoute(courseId);
    if (routeCourse) {
      renderCourse(routeCourse.course, routeCourse.source);
    } else {
      renderMessage("Course not found", "Select a course from the list.");
    }
    return;
  }

  renderOverview();
}

function renderCourseNav() {
  courseNav.innerHTML = "";

  if (!state.courses.length) {
    const empty = el("span", { className: "course-link empty-link" }, [
      el("span", { className: "course-link-index", text: "--" }),
      el("span", { className: "course-link-main" }, [
        el("span", { className: "course-link-name", text: "No courses" }),
        el("span", { className: "course-link-meta", text: "0 students" }),
      ]),
      el("span", { className: "course-link-stat", text: "" }),
    ]);
    courseNav.append(empty);
    return;
  }

  const currentId = getCourseIdFromHash();
  const comparison = hasComparison() ? comparisonSummary() : null;
  const overview = el("a", {
    className: currentId || window.location.hash === ROUTE_COMPARE ? "course-link" : "course-link active",
    href: "#/",
  }, [
    el("span", { className: "course-link-index", text: "00" }),
    el("span", { className: "course-link-main" }, [
      el("span", { className: "course-link-name", text: "Overview" }),
      el("span", { className: "course-link-meta", text: overviewNavMetaText(comparison) }),
    ]),
    el("span", {
      className: "course-link-stat",
      text: overviewNavStatText(comparison),
    }),
  ]);
  courseNav.append(overview);

  if (hasComparison()) {
    const link = el("a", {
      className: window.location.hash === ROUTE_COMPARE ? "course-link active" : "course-link",
      href: ROUTE_COMPARE,
    }, [
      el("span", { className: "course-link-index", text: "C" }),
      el("span", { className: "course-link-main" }, [
        el("span", { className: "course-link-name", text: "Comparison" }),
        el("span", { className: "course-link-meta", text: `${comparison.matchedCount} matched courses` }),
      ]),
      el("span", { className: "course-link-stat", text: formatSignedGradePercent(comparison.averageDelta) }),
    ]);
    courseNav.append(link);
  }

  for (const [index, course] of state.courses.entries()) {
    const compareCourse = findCompareCourse(course.name);
    const link = el("a", {
      className: course.id === currentId ? "course-link active" : "course-link",
      href: `${ROUTE_COURSE_PREFIX}${encodeURIComponent(course.id)}`,
    }, [
      el("span", { className: "course-link-index", text: String(index + 1).padStart(2, "0") }),
      el("span", { className: "course-link-main" }, [
        el("span", { className: "course-link-name", text: course.name }),
        el("span", { className: "course-link-meta", text: courseNavMetaText(course, compareCourse) }),
      ]),
      el("span", {
        className: `course-link-stat ${compareCourse ? deltaClass(deltaValue(course.stats.average, compareCourse.stats.average)) : ""}`,
        text: courseNavStatText(course, compareCourse, "base"),
      }),
    ]);
    courseNav.append(link);
  }

  if (hasComparison()) {
    for (const [index, course] of compareOnlyCourses().entries()) {
      const routeId = compareOnlyRouteId(course.id);
      const link = el("a", {
        className: routeId === currentId ? "course-link active" : "course-link",
        href: `${ROUTE_COURSE_PREFIX}${encodeURIComponent(routeId)}`,
      }, [
        el("span", { className: "course-link-index", text: `C${String(index + 1).padStart(2, "0")}` }),
        el("span", { className: "course-link-main" }, [
          el("span", { className: "course-link-name", text: course.name }),
          el("span", { className: "course-link-meta", text: courseNavMetaText(course, null, "compare") }),
        ]),
        el("span", {
          className: "course-link-stat",
          text: courseNavStatText(course, null, "compare"),
        }),
      ]);
      courseNav.append(link);
    }
  }
}

function renderEmpty() {
  const browseButton = el("button", { className: "empty-action", type: "button", text: "Choose JSON file" });
  browseButton.addEventListener("click", () => fileInput.click());

  app.replaceChildren(
    el("div", { className: "empty-state" }, [
      el("div", { className: "empty-cover" }, [
        el("div", { className: "empty-copy" }, [
          el("div", { className: "empty-marker", text: "JSON file" }),
          el("h1", { text: "Load course data" }),
          el("p", { text: "Drop the scraper export onto this page or choose the JSON file." }),
          browseButton,
        ]),
      ]),
    ]),
  );
}

function renderError(message) {
  fileStatus.textContent = "No file loaded";
  renderCourseNav();
  app.replaceChildren(
    el("div", { className: "message-state" }, [
      el("h1", { text: "File error" }),
      el("p", { text: message }),
    ]),
  );
}

function renderMessage(title, message) {
  app.replaceChildren(
    el("div", { className: "message-state" }, [
      el("h1", { text: title }),
      el("p", { text: message }),
    ]),
  );
}

function renderOverview() {
  const courses = hasComparison() ? combinedOverviewCourses() : state.courses;
  const aggregate = computeStats(courses.flatMap((course) => course.grades));
  const sectionTotal = courses.reduce((total, course) => total + course.sectionCount, 0);
  const metrics = [
    hasComparison() ? metric("Files", 2) : null,
    hasComparison() ? metric("Courses", courses.length) : null,
    metric("Total students", aggregate.count),
    sectionTotal ? metric("Sections", sectionTotal) : null,
    metric("Average", formatGrade(aggregate.average)),
    metric("Median", formatGrade(aggregate.median)),
    metric("IQR", formatGrade(aggregate.iqr)),
    metric("Std. dev.", formatGrade(aggregate.stdDev)),
    metric("Pass count", aggregate.passCount),
    metric("Pass rate", formatPercent(aggregate.passRate)),
    metric("Under 50% count", aggregate.riskCount),
    metric("Under 50% rate", formatPercent(aggregate.riskRate)),
    metric("80%+ count", aggregate.distinctionCount),
    metric("80%+ rate", formatPercent(aggregate.distinctionRate)),
    metric("Range", formatRange(aggregate.min, aggregate.max)),
  ].filter((item) => item);

  app.replaceChildren(
    el("article", {}, [
      pageHead("Overview", overviewSubtitle(courses, aggregate, sectionTotal), "00"),
      metricGrid(metrics),
      section("Notable Values", renderInsights(courses)),
      section("Course Summary", renderOverviewTable(courses)),
      section("Grade Bands", renderBands(aggregate.bands, aggregate.count)),
      section("Percentiles", renderPercentileTable(aggregate)),
      section("All Grades Distribution", renderDistributionChart({
        name: "All courses",
        grades: courses.flatMap((course) => course.grades),
        stats: aggregate,
      })),
    ]),
  );
}

function renderComparisonOverview() {
  const summary = comparisonSummary();
  const metrics = [
    metric("Base courses", summary.base.courseCount),
    metric("Compare courses", summary.next.courseCount),
    metric("Course delta", formatSignedCount(summary.next.courseCount - summary.base.courseCount)),
    metric("Base students", summary.base.stats.count),
    metric("Compare students", summary.next.stats.count),
    metric("Student delta", formatSignedCount(summary.studentDelta)),
    metric("Base sections", summary.base.sectionCount),
    metric("Compare sections", summary.next.sectionCount),
    metric("Section delta", formatSignedCount(summary.sectionDelta)),
    metric("Base average", formatGrade(summary.base.stats.average)),
    metric("Compare average", formatGrade(summary.next.stats.average)),
    metric("Average delta", formatSignedGrade(summary.averageDelta)),
    metric("Base median", formatGrade(summary.base.stats.median)),
    metric("Compare median", formatGrade(summary.next.stats.median)),
    metric("Median delta", formatSignedGrade(summary.medianDelta)),
    metric("Base IQR", formatGrade(summary.base.stats.iqr)),
    metric("Compare IQR", formatGrade(summary.next.stats.iqr)),
    metric("IQR delta", formatSignedGrade(summary.iqrDelta)),
    metric("Under 50% delta", formatSignedCount(summary.riskCountDelta)),
    metric("80%+ delta", formatSignedCount(summary.distinctionCountDelta)),
  ];

  app.replaceChildren(
    el("article", {}, [
      pageHead("Comparison", comparisonOverviewSubtitle(summary), "C"),
      el("div", { className: "comparison-metrics" }, metrics),
      section("Course Deltas", renderComparisonTable(comparisonPairs())),
      section("Base Grade Bands", renderBands(summary.base.stats.bands, summary.base.stats.count)),
      section("Compare Grade Bands", renderBands(summary.next.stats.bands, summary.next.stats.count)),
      section("Grade Band Shifts", renderBandComparison(summary.base.stats, summary.next.stats)),
      section("Base Percentiles", renderPercentileTable(summary.base.stats)),
      section("Compare Percentiles", renderPercentileTable(summary.next.stats)),
      section("Percentile Shifts", renderPercentileComparison(summary.base.stats, summary.next.stats)),
      section("Base Distribution", renderDistributionChart({
        name: state.fileName,
        grades: state.courses.flatMap((course) => course.grades),
        stats: summary.base.stats,
      })),
      section("Compare Distribution", renderDistributionChart({
        name: state.compareFileName,
        grades: state.compareCourses.flatMap((course) => course.grades),
        stats: summary.next.stats,
      })),
    ]),
  );
}

function renderComparison() {
  renderComparisonOverview();
}

function renderCourse(course, source = "base") {
  const stats = course.stats;
  const compareCourse = source === "base" ? findCompareCourse(course.name) : null;
  const metrics = [
    metric("Students", stats.count),
    course.sectionCount ? metric("Sections", course.sectionCount) : null,
    metric("Average", formatGrade(stats.average)),
    metric("Median", formatGrade(stats.median)),
    metric("IQR", formatGrade(stats.iqr)),
    metric("Std. dev.", formatGrade(stats.stdDev)),
    metric("Pass count", stats.passCount),
    metric("Pass rate", formatPercent(stats.passRate)),
    metric("Under 50% count", stats.riskCount),
    metric("Under 50% rate", formatPercent(stats.riskRate)),
    metric("80%+ count", stats.distinctionCount),
    metric("80%+ rate", formatPercent(stats.distinctionRate)),
    metric("Range", formatRange(stats.min, stats.max)),
  ].filter((item) => item);

  app.replaceChildren(
    el("article", {}, [
      pageHead(course.name, coursePageSubtitle(course, source, compareCourse), courseMarker(course, source)),
      metricGrid(metrics),
      hasComparison() ? section("Comparison", compareCourse ? renderCourseComparison(course, compareCourse) : renderNoComparison(course, source)) : null,
      section("Distribution", renderDistributionChart(course)),
      section("Grade Bands", renderBands(stats.bands, stats.count)),
      section("Percentiles", renderPercentileTable(stats)),
      section("Grades", renderGradeStrip(course.grades)),
    ].filter((item) => item)),
  );
}

function pageHead(title, subtitle, marker) {
  return el("header", { className: "page-head" }, [
    el("div", {}, [
      el("h1", { className: "page-title", text: title }),
      el("p", { className: "page-subtitle", text: subtitle }),
    ]),
    el("div", { className: "page-marker", text: marker }),
  ]);
}

function metricGrid(items) {
  return el("div", { className: "metric-grid" }, items);
}

function metric(label, value, note) {
  const children = [
    el("div", { className: "metric-label", text: label }),
    el("div", { className: "metric-value", text: String(value) }),
  ];

  if (note) {
    children.push(el("div", { className: "metric-note", text: note }));
  }

  return el("div", { className: "metric" }, children);
}

function section(title, body) {
  return el("section", { className: "section" }, [
    el("div", { className: "section-title", text: title }),
    el("div", { className: "section-body" }, [body]),
  ]);
}

function renderOverviewTable(courses) {
  const rows = courses.map((course) => {
    const stats = course.stats;
    const routeId = course.routeId || course.id;
    return el("tr", {}, [
      el("td", {}, [
        el("a", {
          className: "course-table-link",
          href: `${ROUTE_COURSE_PREFIX}${encodeURIComponent(routeId)}`,
          text: course.name,
        }),
      ]),
      el("td", { className: "number-cell", text: String(stats.count) }),
      el("td", { className: "number-cell", text: course.sectionCount ? String(course.sectionCount) : "" }),
      tableMeterCell(stats.average, formatGrade, 100),
      el("td", { className: "number-cell", text: formatGrade(stats.median) }),
      el("td", { className: "number-cell", text: formatGrade(stats.iqr) }),
      el("td", { className: "number-cell", text: formatGrade(stats.stdDev) }),
      el("td", { className: "number-cell", text: String(stats.riskCount) }),
      tableMeterCell(stats.passRate, formatPercent, 1),
      tableMeterCell(stats.riskRate, formatPercent, 1, "risk-tone"),
      el("td", { className: "number-cell", text: formatRange(stats.min, stats.max) }),
    ]);
  });

  return el("div", { className: "table-wrap overview-table-wrap" }, [
    el("table", {}, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "Course" }),
          el("th", { className: "number-cell", text: "Students" }),
          el("th", { className: "number-cell", text: "Sections" }),
          el("th", { className: "number-cell", text: "Average" }),
          el("th", { className: "number-cell", text: "Median" }),
          el("th", { className: "number-cell", text: "IQR" }),
          el("th", { className: "number-cell", text: "Std. dev." }),
          el("th", { className: "number-cell", text: "Under 50% count" }),
          el("th", { className: "number-cell", text: "Pass rate" }),
          el("th", { className: "number-cell", text: "Under 50% rate" }),
          el("th", { className: "number-cell", text: "Range" }),
        ]),
      ]),
      el("tbody", {}, rows),
    ]),
  ]);
}

function renderComparisonTable(pairs) {
  const rows = pairs.map((pair) => {
    const base = pair.base;
    const next = pair.next;
    return el("tr", {}, [
      el("td", {}, [
        el("a", {
          className: "course-table-link",
          href: coursePairHref(pair),
          text: pair.name,
        }),
      ]),
      el("td", { text: comparisonStatus(pair) }),
      el("td", { className: "number-cell", text: base ? String(base.stats.count) : "" }),
      el("td", { className: "number-cell", text: next ? String(next.stats.count) : "" }),
      deltaCell(deltaValue(base?.stats.count, next?.stats.count), formatSignedCount),
      el("td", { className: "number-cell", text: base?.sectionCount ? String(base.sectionCount) : "" }),
      el("td", { className: "number-cell", text: next?.sectionCount ? String(next.sectionCount) : "" }),
      deltaCell(deltaValue(base?.sectionCount, next?.sectionCount), formatSignedCount),
      el("td", { className: "number-cell", text: base ? formatGrade(base.stats.average) : "" }),
      el("td", { className: "number-cell", text: next ? formatGrade(next.stats.average) : "" }),
      deltaCell(deltaValue(base?.stats.average, next?.stats.average), formatSignedGrade),
      deltaCell(deltaValue(base?.stats.median, next?.stats.median), formatSignedGrade),
      deltaCell(deltaValue(base?.stats.iqr, next?.stats.iqr), formatSignedGrade),
      deltaCell(deltaValue(base?.stats.riskCount, next?.stats.riskCount), formatSignedCount, true),
      deltaCell(deltaValue(base?.stats.distinctionCount, next?.stats.distinctionCount), formatSignedCount),
    ]);
  });

  return el("div", { className: "table-wrap comparison-table-wrap" }, [
    el("table", {}, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "Course" }),
          el("th", { text: "Status" }),
          el("th", { className: "number-cell", text: "Base students" }),
          el("th", { className: "number-cell", text: "Compare students" }),
          el("th", { className: "number-cell", text: "Student delta" }),
          el("th", { className: "number-cell", text: "Base sections" }),
          el("th", { className: "number-cell", text: "Compare sections" }),
          el("th", { className: "number-cell", text: "Section delta" }),
          el("th", { className: "number-cell", text: "Base avg." }),
          el("th", { className: "number-cell", text: "Compare avg." }),
          el("th", { className: "number-cell", text: "Avg. delta" }),
          el("th", { className: "number-cell", text: "Median delta" }),
          el("th", { className: "number-cell", text: "IQR delta" }),
          el("th", { className: "number-cell", text: "Under 50% delta" }),
          el("th", { className: "number-cell", text: "80%+ delta" }),
        ]),
      ]),
      el("tbody", {}, rows),
    ]),
  ]);
}

function renderCourseComparison(base, next) {
  const rows = [
    ["Students", base.stats.count, next.stats.count, formatSignedCount],
    ["Sections", base.sectionCount, next.sectionCount, formatSignedCount],
    ["Average", base.stats.average, next.stats.average, formatSignedGrade],
    ["Median", base.stats.median, next.stats.median, formatSignedGrade],
    ["IQR", base.stats.iqr, next.stats.iqr, formatSignedGrade],
    ["Under 50% count", base.stats.riskCount, next.stats.riskCount, formatSignedCount, true],
    ["80%+ count", base.stats.distinctionCount, next.stats.distinctionCount, formatSignedCount],
  ];

  return el("div", { className: "comparison-stack" }, [
    el("div", { className: "table-wrap" }, [
      el("table", {}, [
        el("thead", {}, [
          el("tr", {}, [
            el("th", { text: "Metric" }),
            el("th", { className: "number-cell", text: "Base" }),
            el("th", { className: "number-cell", text: "Compare" }),
            el("th", { className: "number-cell", text: "Delta" }),
          ]),
        ]),
        el("tbody", {}, rows.map(([label, baseValue, nextValue, formatter, lowerIsBetter]) => (
          el("tr", {}, [
            el("td", { text: label }),
            el("td", { className: "number-cell", text: formatComparisonValue(baseValue, formatter) }),
            el("td", { className: "number-cell", text: formatComparisonValue(nextValue, formatter) }),
            deltaCell(deltaValue(baseValue, nextValue), formatter, lowerIsBetter),
          ])
        ))),
      ]),
    ]),
    renderBandComparison(base.stats, next.stats),
    renderPercentileComparison(base.stats, next.stats),
  ]);
}

function renderNoComparison(course, source) {
  const currentFileName = source === "compare" ? state.compareFileName : state.fileName;
  const otherFileName = source === "compare" ? state.fileName : state.compareFileName;

  return el("div", { className: "comparison-note" }, [
    el("div", { className: "comparison-note-title", text: `Only in ${currentFileName}` }),
    el("p", {
      text: `${course.name} appears only in ${currentFileName}. No matching course was found in ${otherFileName}.`,
    }),
  ]);
}

function renderBandComparison(baseStats, nextStats) {
  const nextBands = new Map(nextStats.bands.map((band) => [band.label, band]));
  const rows = baseStats.bands.map((baseBand) => {
    const nextBand = nextBands.get(baseBand.label);
    return el("tr", {}, [
      el("td", { text: baseBand.label }),
      el("td", { className: "number-cell", text: String(baseBand.count) }),
      el("td", { className: "number-cell", text: nextBand ? String(nextBand.count) : "" }),
      deltaCell(deltaValue(baseBand.count, nextBand?.count), formatSignedCount, isRiskBand(baseBand)),
      el("td", { className: "number-cell", text: formatPercent(baseBand.percent) }),
      el("td", { className: "number-cell", text: nextBand ? formatPercent(nextBand.percent) : "" }),
      deltaCell(deltaValue(baseBand.percent, nextBand?.percent), formatSignedPercent, isRiskBand(baseBand)),
    ]);
  });

  return el("div", { className: "table-wrap" }, [
    el("table", {}, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "Band" }),
          el("th", { className: "number-cell", text: "Base count" }),
          el("th", { className: "number-cell", text: "Compare count" }),
          el("th", { className: "number-cell", text: "Count delta" }),
          el("th", { className: "number-cell", text: "Base percent" }),
          el("th", { className: "number-cell", text: "Compare percent" }),
          el("th", { className: "number-cell", text: "Percent delta" }),
        ]),
      ]),
      el("tbody", {}, rows),
    ]),
  ]);
}

function renderPercentileComparison(baseStats, nextStats) {
  const rows = [
    ["P10", "p10"],
    ["Q1", "q1"],
    ["Median", "median"],
    ["Q3", "q3"],
    ["P90", "p90"],
    ["IQR", "iqr"],
  ].map(([label, key]) => (
    el("tr", {}, [
      el("td", { text: label }),
      el("td", { className: "number-cell", text: formatGrade(baseStats[key]) }),
      el("td", { className: "number-cell", text: formatGrade(nextStats[key]) }),
      deltaCell(deltaValue(baseStats[key], nextStats[key]), formatSignedGrade),
    ])
  ));

  return el("div", { className: "table-wrap" }, [
    el("table", {}, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "Percentile" }),
          el("th", { className: "number-cell", text: "Base" }),
          el("th", { className: "number-cell", text: "Compare" }),
          el("th", { className: "number-cell", text: "Delta" }),
        ]),
      ]),
      el("tbody", {}, rows),
    ]),
  ]);
}

function renderInsights(sourceCourses = state.courses) {
  const courses = sourceCourses.filter((course) => course.stats.count > 0);

  if (!courses.length) {
    return el("p", { className: "page-subtitle", text: "No grades were found in the loaded courses." });
  }

  const highestAverage = maxBy(courses, (course) => course.stats.average);
  const lowestAverage = minBy(courses, (course) => course.stats.average);
  const mostStudents = maxBy(courses, (course) => course.stats.count);
  const coursesWithSections = courses.filter((course) => course.sectionCount > 0);
  const mostSections = coursesWithSections.length ? maxBy(coursesWithSections, (course) => course.sectionCount) : null;
  const widestRange = maxBy(courses, (course) => course.stats.max - course.stats.min);

  return el("div", { className: "insight-grid" }, [
    insight("Highest average", highestAverage.name, formatGrade(highestAverage.stats.average)),
    insight("Lowest average", lowestAverage.name, formatGrade(lowestAverage.stats.average)),
    insight("Most students", mostStudents.name, `${mostStudents.stats.count} students`),
    mostSections ? insight("Most sections", mostSections.name, `${mostSections.sectionCount} sections`) : null,
    insight("Widest range", widestRange.name, formatRange(widestRange.stats.min, widestRange.stats.max)),
  ].filter((item) => item));
}

function insight(label, value, note) {
  return el("div", { className: "insight" }, [
    el("div", { className: "insight-label", text: label }),
    el("div", { className: "insight-value", text: value }),
    el("div", { className: "insight-note", text: note }),
  ]);
}

function tableMeterCell(value, formatter, scale, tone) {
  const width = Number.isFinite(value) ? `${clamp((value / scale) * 100, 0, 100)}%` : "0%";

  return el("td", { className: `number-cell table-metric-cell ${tone || ""}` }, [
    el("span", { className: "table-metric-value", text: formatter(value) }),
    el("span", { className: "table-meter" }, [
      el("span", { className: "table-meter-fill", style: { width } }),
    ]),
  ]);
}

function renderDistributionChart(course) {
  const stats = course.stats;
  const values = course.grades.filter(Number.isFinite);

  if (!values.length) {
    return el("p", { className: "page-subtitle", text: "No grades were found for this course." });
  }

  const width = 960;
  const height = 360;
  const margin = { top: 24, right: 28, bottom: 72, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const minGrade = Math.min(0, Math.floor(Math.min(...values) / 10) * 10);
  const maxGrade = Math.max(100, Math.ceil(Math.max(...values) / 10) * 10);
  const domainMin = minGrade;
  const domainMax = maxGrade === minGrade ? minGrade + 10 : maxGrade;
  const binCount = Math.max(5, Math.ceil((domainMax - domainMin) / 10));
  const binWidth = (domainMax - domainMin) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    min: domainMin + index * binWidth,
    max: domainMin + (index + 1) * binWidth,
    count: 0,
  }));

  for (const value of values) {
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - domainMin) / binWidth)));
    bins[index].count += 1;
  }

  const hasCurve = stats.stdDev && stats.stdDev > 0;
  const curvePoints = hasCurve ? makeNormalCurve(stats.average, stats.stdDev, values.length, domainMin, domainMax, binWidth) : [];
  const maxExpected = curvePoints.reduce((max, point) => Math.max(max, point.y), 0);
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count), maxExpected);
  const x = (value) => margin.left + ((value - domainMin) / (domainMax - domainMin)) * plotWidth;
  const y = (count) => margin.top + plotHeight - (count / maxCount) * plotHeight;
  const children = [];

  for (let i = 0; i <= 5; i += 1) {
    const tickCount = (maxCount / 5) * i;
    const tickY = y(tickCount);
    children.push(svg("line", {
      class: "chart-rule",
      x1: margin.left,
      x2: width - margin.right,
      y1: tickY,
      y2: tickY,
    }));
    children.push(svg("text", {
      class: "chart-label",
      x: margin.left - 12,
      y: tickY + 5,
      "text-anchor": "end",
    }, fmt.format(tickCount)));
  }

  children.push(svg("line", {
    class: "chart-axis",
    x1: margin.left,
    x2: width - margin.right,
    y1: margin.top + plotHeight,
    y2: margin.top + plotHeight,
  }));
  children.push(svg("line", {
    class: "chart-axis",
    x1: margin.left,
    x2: margin.left,
    y1: margin.top,
    y2: margin.top + plotHeight,
  }));

  for (const bin of bins) {
    const barX = x(bin.min) + 3;
    const barY = y(bin.count);
    const barWidth = Math.max(1, x(bin.max) - x(bin.min) - 6);
    const barHeight = margin.top + plotHeight - barY;
    children.push(svg("rect", {
      class: "chart-bar",
      x: barX,
      y: barY,
      width: barWidth,
      height: barHeight,
    }));
  }

  if (hasCurve) {
    const path = curvePoints
      .map((point, index) => `${index ? "L" : "M"} ${x(point.x).toFixed(2)} ${y(point.y).toFixed(2)}`)
      .join(" ");
    children.push(svg("path", { class: "chart-curve", d: path }));
    children.push(svg("line", {
      class: "chart-mean",
      x1: x(stats.average),
      x2: x(stats.average),
      y1: margin.top,
      y2: margin.top + plotHeight,
    }));
    children.push(svg("line", {
      class: "chart-median",
      x1: x(stats.median),
      x2: x(stats.median),
      y1: margin.top,
      y2: margin.top + plotHeight,
    }));
  }

  for (let tick = domainMin; tick <= domainMax; tick += 20) {
    children.push(svg("text", {
      class: "chart-label",
      x: x(tick),
      y: margin.top + plotHeight + 30,
      "text-anchor": "middle",
    }, formatGrade(tick)));
  }

  children.push(svg("text", {
    class: "chart-axis-title",
    x: margin.left + plotWidth / 2,
    y: height - 18,
    "text-anchor": "middle",
  }, "Grade (%)"));
  children.push(svg("text", {
    class: "chart-axis-title",
    x: 20,
    y: margin.top + plotHeight / 2,
    "text-anchor": "middle",
    transform: `rotate(-90 20 ${margin.top + plotHeight / 2})`,
  }, "Students"));

  return el("div", { className: "chart-wrap" }, [
    svg("svg", {
      class: "distribution-chart",
      role: "img",
      "aria-label": `${course.name} grade distribution. Average ${formatGrade(stats.average)}. Median ${formatGrade(stats.median)}.`,
      viewBox: `0 0 ${width} ${height}`,
    }, children),
    el("div", {
      className: "chart-summary",
      text: `Average ${formatGrade(stats.average)} / Median ${formatGrade(stats.median)}`,
    }),
  ]);
}

function makeNormalCurve(mean, stdDev, count, domainMin, domainMax, binWidth) {
  const points = [];
  const steps = 140;
  const coefficient = 1 / (stdDev * Math.sqrt(2 * Math.PI));

  for (let index = 0; index <= steps; index += 1) {
    const xValue = domainMin + ((domainMax - domainMin) * index) / steps;
    const z = (xValue - mean) / stdDev;
    const density = coefficient * Math.exp(-0.5 * z * z);
    points.push({
      x: xValue,
      y: density * binWidth * count,
    });
  }

  return points;
}

function renderBands(bands, total) {
  const maxCount = Math.max(1, ...bands.map((band) => band.count));
  const rows = bands.map((band) => {
    const width = `${(band.count / maxCount) * 100}%`;
    const riskClass = isRiskBand(band) ? " risk" : "";
    return el("div", { className: `band-row${riskClass}` }, [
      el("div", { className: "band-label", text: band.label }),
      el("div", { className: "band-track" }, [
        el("div", { className: "band-fill", style: { width } }),
      ]),
      el("div", { className: "band-count number-cell", text: String(band.count) }),
      el("div", { className: "band-percent number-cell", text: total ? formatPercent(band.percent) : "" }),
    ]);
  });

  return el("div", { className: "band-list" }, [
    el("div", { className: "band-row band-header" }, [
      el("div", { className: "band-label", text: "Band" }),
      el("div", { className: "band-track-label", text: "Distribution" }),
      el("div", { className: "band-count number-cell", text: "Count" }),
      el("div", { className: "band-percent number-cell", text: "Percent" }),
    ]),
    ...rows,
  ]);
}

function renderPercentileTable(stats) {
  return el("div", { className: "table-wrap" }, [
    el("table", {}, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "Minimum" }),
          el("th", { text: "P10" }),
          el("th", { text: "Q1" }),
          el("th", { text: "Median" }),
          el("th", { text: "Q3" }),
          el("th", { text: "P90" }),
          el("th", { text: "Maximum" }),
          el("th", { text: "IQR" }),
        ]),
      ]),
      el("tbody", {}, [
        el("tr", {}, [
          el("td", { text: formatGrade(stats.min) }),
          el("td", { text: formatGrade(stats.p10) }),
          el("td", { text: formatGrade(stats.q1) }),
          el("td", { text: formatGrade(stats.median) }),
          el("td", { text: formatGrade(stats.q3) }),
          el("td", { text: formatGrade(stats.p90) }),
          el("td", { text: formatGrade(stats.max) }),
          el("td", { text: formatGrade(stats.iqr) }),
        ]),
      ]),
    ]),
  ]);
}

function renderGradeStrip(grades) {
  const sorted = grades.filter(Number.isFinite).sort((a, b) => b - a);

  if (!sorted.length) {
    return el("p", { className: "page-subtitle", text: "No grades were found for this course." });
  }

  return el("div", { className: "grade-strip" }, sorted.map((grade) => (
    el("div", {
      className: grade < 50 ? "grade-pill risk" : "grade-pill",
      text: formatGrade(grade),
    })
  )));
}
