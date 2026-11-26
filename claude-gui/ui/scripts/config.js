/* ======================= Konfigurace a stav ======================= */

const $ = (id) => document.getElementById(id);

const state = {
  queue: [],
  sessions: [],      // metadata ze serveru
  current: null,     // { id, cwd, title, cwdExists }
  query: "",
  serverHits: null,  // Set session-id z fulltextu
  searchSeq: 0,
  view: "chat",
  sideMode: "chats",
  open: {},
  org: { folders: [], assign: {} },
  limits: null,
  usage: null,
  usageRange: ["h5", "today", "d7", "d30"].includes(localStorage.getItem("cg-range")) ? localStorage.getItem("cg-range") : "today",
};

