(function () {
  "use strict";

  const STORAGE_KEY = "course-grade-report:data";
  const ROUTE_COURSE_PREFIX = "#/course/";
  const ROUTE_COMPARE = "#/compare";

  const state = {
    fileName: "",
    courses: [],
    raw: null,
    compareFileName: "",
    compareCourses: [],
    compareRaw: null,
  };

  const app = document.getElementById("app");
  const fileInput = document.getElementById("fileInput");
  const compareFileInput = document.getElementById("compareFileInput");
  const fileStatus = document.getElementById("fileStatus");
  const clearButton = document.getElementById("clearButton");
  const courseNav = document.getElementById("courseNav");
  const dropOverlay = document.getElementById("dropOverlay");
  const dropTitle = document.getElementById("dropTitle");
  let dragDepth = 0;

  const fmt = new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });

  const fmt1 = new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });

  fileInput.addEventListener("change", handleFileChange);
  compareFileInput.addEventListener("change", handleCompareFileChange);
  clearButton.addEventListener("click", clearReport);
  document.addEventListener("dragenter", handleDragEnter);
  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("dragleave", handleDragLeave);
  document.addEventListener("drop", handleDrop);
  window.addEventListener("hashchange", render);

  loadStoredData();
  render();

  function handleFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    loadJsonFile(file, "base");
    event.target.value = "";
  }

  function handleCompareFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    loadJsonFile(file, "compare");
    event.target.value = "";
  }

  function clearReport() {
    clearData();
    fileInput.value = "";
    compareFileInput.value = "";

    if (window.location.hash && window.location.hash !== "#/") {
      window.location.hash = "#/";
      return;
    }

    render();
  }

  function loadJsonFile(file, target) {
    readCourseFile(file)
      .then(({ raw, courses }) => {
        if (target === "compare") {
          state.compareFileName = file.name;
          state.compareRaw = raw;
          state.compareCourses = courses;
        } else {
          state.fileName = file.name;
          state.raw = raw;
          state.courses = courses;
        }

        saveStoredData();
        window.location.hash = target === "compare" && state.courses.length ? ROUTE_COMPARE : "#/";
        render();
      })
      .catch((error) => {
        if (target === "compare") {
          clearCompareData();
          saveStoredData();
        } else {
          clearData();
        }
        renderError(error.message || "The selected file could not be read.");
      });
  }

  function loadDroppedPair(baseFile, compareFile) {
    Promise.all([readCourseFile(baseFile), readCourseFile(compareFile)])
      .then(([baseData, compareData]) => {
        state.fileName = baseFile.name;
        state.raw = baseData.raw;
        state.courses = baseData.courses;
        state.compareFileName = compareFile.name;
        state.compareRaw = compareData.raw;
        state.compareCourses = compareData.courses;
        saveStoredData();
        window.location.hash = ROUTE_COMPARE;
        render();
      })
      .catch((error) => {
        clearData();
        renderError(error.message || "The selected files could not be read.");
      });
  }

  function readCourseFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = JSON.parse(String(reader.result || ""));
          const courses = normalizeCourses(raw);

          if (!courses.length) {
            throw new Error("The file does not contain any courses with grades.");
          }

          resolve({ raw, courses });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => {
        reject(new Error("The selected file could not be read."));
      };
      reader.readAsText(file);
    });
  }

  function handleDragEnter(event) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    setDragActive(true);
  }

  function handleDragOver(event) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  }

  function handleDragLeave(event) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) setDragActive(false);
  }

  function handleDrop(event) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    setDragActive(false);

    const files = Array.from(event.dataTransfer.files || []);
    if (!files.length) {
      renderError("Drop a JSON file.");
      return;
    }

    if (files.length > 1) {
      loadDroppedPair(files[0], files[1]);
      return;
    }

    loadJsonFile(files[0], state.courses.length ? "compare" : "base");
  }

  function hasDraggedFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
  }

  function setDragActive(active) {
    document.body.classList.toggle("drag-active", active);
    if (dropOverlay) {
      dropOverlay.setAttribute("aria-hidden", active ? "false" : "true");
    }
    if (dropTitle && active) {
      dropTitle.textContent = state.courses.length ? "Drop comparison JSON" : "Drop JSON";
    }
  }

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
      return value.courseId || value.course || value.name || `Course ${index + 1}`;
    }

    return `Course ${index + 1}`;
  }

  function extractGrades(value) {
    if (Array.isArray(value)) {
      return value.map(parseGradeValue).filter(Number.isFinite);
    }

    if (!value || typeof value !== "object") {
      return [];
    }

    const source =
      Array.isArray(value.grades) ? value.grades :
      Array.isArray(value.students) ? value.students :
      Array.isArray(value.marks) ? value.marks :
      [];

    return source.map(parseGradeValue).filter(Number.isFinite);
  }

  function extractSectionIds(value) {
    if (!value || typeof value !== "object") {
      return [];
    }

    const source =
      Array.isArray(value.courseIds) ? value.courseIds :
      Array.isArray(value.sectionIds) ? value.sectionIds :
      Array.isArray(value.sections) ? value.sections :
      [];

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

  function parseGradeValue(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : NaN;
    }

    if (typeof value === "string") {
      const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
      return match ? Number(match[0]) : NaN;
    }

    if (value && typeof value === "object") {
      const fields = ["grade", "mark", "percentage", "percent", "score", "final", "current"];
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
    const variance = values.reduce((total, grade) => total + Math.pow(grade - average, 2), 0) / count;
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
      { label: "<50%", min: -Infinity, max: 49.999, count: 0 },
      { label: "50-59%", min: 50, max: 59.999, count: 0 },
      { label: "60-69%", min: 60, max: 69.999, count: 0 },
      { label: "70-79%", min: 70, max: 79.999, count: 0 },
      { label: "80-89%", min: 80, max: 89.999, count: 0 },
      { label: "90-99%", min: 90, max: 99.499, count: 0 },
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
      const course = state.courses.find((item) => item.id === courseId);
      if (course) {
        renderCourse(course);
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
    const overview = el("a", {
      className: currentId || window.location.hash === ROUTE_COMPARE ? "course-link" : "course-link active",
      href: "#/",
    }, [
      el("span", { className: "course-link-index", text: "00" }),
      el("span", { className: "course-link-main" }, [
        el("span", { className: "course-link-name", text: "Overview" }),
        el("span", { className: "course-link-meta", text: overviewMetaText() }),
      ]),
      el("span", { className: "course-link-stat", text: formatGradePercent(computeStats(state.courses.flatMap((course) => course.grades)).average) }),
    ]);
    courseNav.append(overview);

    if (hasComparison()) {
      const comparison = comparisonSummary();
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
          text: courseNavStatText(course, compareCourse),
        }),
      ]);
      courseNav.append(link);
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
    const aggregate = computeStats(state.courses.flatMap((course) => course.grades));
    const sectionTotal = totalSections();
    const metrics = [
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
        pageHead("Overview", `${state.courses.length} courses / ${overviewMetaText()} in ${state.fileName}`, "00"),
        metricGrid(metrics),
        section("Notable Values", renderInsights()),
        section("Course Comparison", renderOverviewTable()),
        section("Grade Bands", renderBands(aggregate.bands, aggregate.count)),
        section("Percentiles", renderPercentileTable(aggregate)),
        section("All Grades Distribution", renderDistributionChart({
          name: "All courses",
          grades: state.courses.flatMap((course) => course.grades),
          stats: aggregate,
        })),
      ]),
    );
  }

  function renderComparison() {
    const summary = comparisonSummary();
    const metrics = [
      metric("Base students", summary.base.stats.count),
      metric("Compare students", summary.next.stats.count),
      metric("Student delta", formatSignedCount(summary.studentDelta)),
      metric("Section delta", formatSignedCount(summary.sectionDelta)),
      metric("Average delta", formatSignedGrade(summary.averageDelta)),
      metric("Median delta", formatSignedGrade(summary.medianDelta)),
      metric("IQR delta", formatSignedGrade(summary.iqrDelta)),
      metric("Under 50% delta", formatSignedCount(summary.riskCountDelta)),
      metric("80%+ delta", formatSignedCount(summary.distinctionCountDelta)),
    ];

    app.replaceChildren(
      el("article", {}, [
        pageHead("Comparison", `${state.fileName} vs ${state.compareFileName}`, "C"),
        el("div", { className: "comparison-metrics" }, metrics),
        section("Course Deltas", renderComparisonTable(comparisonPairs())),
        section("Grade Band Shifts", renderBandComparison(summary.base.stats, summary.next.stats)),
        section("Percentile Shifts", renderPercentileComparison(summary.base.stats, summary.next.stats)),
      ]),
    );
  }

  function renderCourse(course) {
    const stats = course.stats;
    const compareCourse = findCompareCourse(course.name);
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
        pageHead(course.name, courseMetaText(course), courseIndex(course)),
        metricGrid(metrics),
        compareCourse ? section("Comparison", renderCourseComparison(course, compareCourse)) : null,
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

  function renderOverviewTable() {
    const rows = state.courses.map((course) => {
      const stats = course.stats;
      return el("tr", {}, [
        el("td", {}, [
          el("a", {
            className: "course-table-link",
            href: `${ROUTE_COURSE_PREFIX}${encodeURIComponent(course.id)}`,
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

    return el("div", { className: "table-wrap" }, [
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
        el("td", { text: pair.name }),
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

  function renderInsights() {
    const courses = state.courses.filter((course) => course.stats.count > 0);

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
    const height = 320;
    const margin = { top: 24, right: 28, bottom: 44, left: 50 };
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
        y: height - 14,
        "text-anchor": "middle",
      }, formatGrade(tick)));
    }

    children.push(svg("text", {
      class: "chart-label",
      x: width - margin.right,
      y: margin.top + 16,
      "text-anchor": "end",
    }, `Average ${formatGrade(stats.average)} / Median ${formatGrade(stats.median)}`));

    return el("div", { className: "chart-wrap" }, [
      svg("svg", {
        class: "distribution-chart",
        role: "img",
        "aria-label": `${course.name} grade distribution`,
        viewBox: `0 0 ${width} ${height}`,
      }, children),
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

  function getCourseIdFromHash() {
    if (!window.location.hash.startsWith(ROUTE_COURSE_PREFIX)) return "";
    return decodeURIComponent(window.location.hash.slice(ROUTE_COURSE_PREFIX.length));
  }

  function courseIndex(course) {
    const index = state.courses.findIndex((item) => item.id === course.id);
    return String(index + 1).padStart(2, "0");
  }

  function totalStudents() {
    return state.courses.reduce((total, course) => total + course.stats.count, 0);
  }

  function totalSections() {
    return state.courses.reduce((total, course) => total + course.sectionCount, 0);
  }

  function overviewMetaText() {
    const sections = totalSections();
    return `${totalStudents()} students${sections ? ` / ${sections} sections` : ""}`;
  }

  function courseMetaText(course) {
    return `${course.stats.count} students${course.sectionCount ? ` / ${course.sectionCount} sections` : ""}`;
  }

  function courseNavMetaText(course, compareCourse) {
    if (!compareCourse) return courseMetaText(course);
    return `${course.stats.count} -> ${compareCourse.stats.count} students`;
  }

  function courseNavStatText(course, compareCourse) {
    if (!compareCourse) return formatGradePercent(course.stats.average);
    return `${formatGradePercent(course.stats.average)} ${formatSignedGradePercent(deltaValue(course.stats.average, compareCourse.stats.average))}`;
  }

  function fileStatusText() {
    if (!state.fileName) return "No file loaded";
    if (!state.compareFileName) return state.fileName;
    return `${state.fileName} vs ${state.compareFileName}`;
  }

  function hasComparison() {
    return state.courses.length > 0 && state.compareCourses.length > 0;
  }

  function findCompareCourse(courseName) {
    return state.compareCourses.find((course) => course.name === courseName);
  }

  function aggregateCourseSet(courses) {
    return {
      courseCount: courses.length,
      sectionCount: courses.reduce((total, course) => total + course.sectionCount, 0),
      stats: computeStats(courses.flatMap((course) => course.grades)),
    };
  }

  function comparisonPairs() {
    const compareByName = new Map(state.compareCourses.map((course) => [course.name, course]));
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

  function comparisonSummary() {
    const base = aggregateCourseSet(state.courses);
    const next = aggregateCourseSet(state.compareCourses);
    const matchedCount = comparisonPairs().filter((pair) => pair.base && pair.next).length;

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
      distinctionCountDelta: deltaValue(base.stats.distinctionCount, next.stats.distinctionCount),
    };
  }

  function comparisonStatus(pair) {
    if (pair.base && pair.next) return "Matched";
    if (pair.base) return "Base only";
    return "Compare only";
  }

  function deltaValue(baseValue, nextValue) {
    if (!Number.isFinite(baseValue) || !Number.isFinite(nextValue)) return null;
    return nextValue - baseValue;
  }

  function deltaCell(value, formatter, lowerIsBetter) {
    return el("td", { className: `number-cell delta-cell ${deltaClass(value, lowerIsBetter)}`, text: formatter(value) });
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
    return items.reduce((best, item) => getter(item) > getter(best) ? item : best, items[0]);
  }

  function minBy(items, getter) {
    return items.reduce((best, item) => getter(item) < getter(best) ? item : best, items[0]);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isRiskBand(band) {
    return band?.label === "<50%";
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
    return `${formatGrade(min)}-${formatGrade(max)}`;
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

  function saveStoredData() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        fileName: state.fileName,
        raw: state.raw,
        compareFileName: state.compareFileName,
        compareRaw: state.compareRaw,
      }));
    } catch (error) {
      // The report still works without session storage; course routes just reset on reload.
    }
  }

  function loadStoredData() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (!stored || !stored.raw) return;
      state.fileName = stored.fileName || "";
      state.raw = stored.raw;
      state.courses = normalizeCourses(stored.raw);
      state.compareFileName = stored.compareFileName || "";
      state.compareRaw = stored.compareRaw || null;
      state.compareCourses = stored.compareRaw ? normalizeCourses(stored.compareRaw) : [];
    } catch (error) {
      clearData();
    }
  }

  function clearData() {
    state.fileName = "";
    state.raw = null;
    state.courses = [];
    clearCompareData();
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Ignore storage errors on local file pages.
    }
  }

  function clearCompareData() {
    state.compareFileName = "";
    state.compareRaw = null;
    state.compareCourses = [];
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
})();
