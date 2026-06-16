"use strict";

const STORAGE_KEY = "course-grade-report:data";
const ROUTE_COURSE_PREFIX = "#/course/";
const ROUTE_COMPARE = "#/compare";
const COMPARE_ONLY_ROUTE_PREFIX = "compare:";

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

