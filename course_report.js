"use strict";

fileInput.addEventListener("change", handleFileChange);
compareFileInput.addEventListener("change", handleCompareFileChange);
clearButton.addEventListener("click", clearReport);
if (fileLabelInput) {
  fileLabelInput.addEventListener("input", handleFileLabelChange);
}
if (compareFileLabelInput) {
  compareFileLabelInput.addEventListener("input", handleCompareFileLabelChange);
}
if (teacherFilterSelect) {
  teacherFilterSelect.addEventListener("change", handleTeacherFilterChange);
}
document.addEventListener("dragenter", handleDragEnter);
document.addEventListener("dragover", handleDragOver);
document.addEventListener("dragleave", handleDragLeave);
document.addEventListener("drop", handleDrop);
if (dropOverlay) {
  dropOverlay.addEventListener("dragenter", handleDragEnter);
  dropOverlay.addEventListener("dragover", handleDragOver);
  dropOverlay.addEventListener("dragleave", handleDragLeave);
  dropOverlay.addEventListener("drop", handleDrop);
}
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

function handleFileLabelChange(event) {
  state.fileLabel = event.target.value.trim();
  saveStoredData();
  render();
}

function handleCompareFileLabelChange(event) {
  state.compareFileLabel = event.target.value.trim();
  saveStoredData();
  render();
}

function handleTeacherFilterChange(event) {
  state.teacherFilter = event.target.value;
  saveStoredData();

  if (getCourseIdFromHash()) {
    window.location.hash = "#/";
    return;
  }

  render();
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
        state.compareFileLabel = defaultFileLabel(file.name, "Second file");
        state.compareRaw = raw;
        state.compareCourses = courses;
      } else {
        state.fileName = file.name;
        state.fileLabel = defaultFileLabel(file.name, "First file");
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
      state.fileLabel = defaultFileLabel(baseFile.name, "First file");
      state.raw = baseData.raw;
      state.courses = baseData.courses;
      state.compareFileName = compareFile.name;
      state.compareFileLabel = defaultFileLabel(compareFile.name, "Second file");
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
  if (!isPotentialFileDrag(event)) return;
  event.preventDefault();
  event.stopPropagation();
  dragDepth += 1;
  setDragActive(true);
}

function handleDragOver(event) {
  if (!isPotentialFileDrag(event)) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "copy";
  setDragActive(true);
}

function handleDragLeave(event) {
  if (!isPotentialFileDrag(event)) return;
  event.preventDefault();
  event.stopPropagation();
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) setDragActive(false);
}

function handleDrop(event) {
  if (!isPotentialFileDrag(event)) return;
  event.preventDefault();
  event.stopPropagation();
  dragDepth = 0;
  setDragActive(false);

  const files = Array.from(event.dataTransfer.files || []);
  if (!files.length) {
    renderError("The browser did not receive a file. Drag the JSON from File Explorer, or use Choose JSON.");
    return;
  }

  if (files.length > 1) {
    loadDroppedPair(files[0], files[1]);
    return;
  }

  loadJsonFile(files[0], state.courses.length ? "compare" : "base");
}

function isPotentialFileDrag(event) {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return false;
  if (dataTransfer.files && dataTransfer.files.length > 0) return true;
  return Array.from(dataTransfer.types || []).some((type) => (
    type === "Files" ||
    type === "application/x-moz-file" ||
    type === "public.file-url" ||
    type === "text/uri-list"
  ));
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

function saveStoredData() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      fileName: state.fileName,
      fileLabel: state.fileLabel,
      raw: state.raw,
      compareFileName: state.compareFileName,
      compareFileLabel: state.compareFileLabel,
      compareRaw: state.compareRaw,
      teacherFilter: state.teacherFilter,
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
    state.fileLabel = typeof stored.fileLabel === "string" ? stored.fileLabel : defaultFileLabel(stored.fileName, "First file");
    state.raw = stored.raw;
    state.courses = normalizeCourses(stored.raw);
    state.compareFileName = stored.compareFileName || "";
    state.compareFileLabel = typeof stored.compareFileLabel === "string"
      ? stored.compareFileLabel
      : (stored.compareFileName ? defaultFileLabel(stored.compareFileName, "Second file") : "");
    state.compareRaw = stored.compareRaw || null;
    state.compareCourses = stored.compareRaw ? normalizeCourses(stored.compareRaw) : [];
    state.teacherFilter = typeof stored.teacherFilter === "string" ? stored.teacherFilter : "";
  } catch (error) {
    clearData();
  }
}

function clearData() {
  state.fileName = "";
  state.fileLabel = "";
  state.raw = null;
  state.courses = [];
  state.teacherFilter = "";
  clearCompareData();
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    // Ignore storage errors on local file pages.
  }
}

function clearCompareData() {
  state.compareFileName = "";
  state.compareFileLabel = "";
  state.compareRaw = null;
  state.compareCourses = [];
}
