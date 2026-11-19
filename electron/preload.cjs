// The only bridge between the page and the desktop shell: asks the shell to save the page as a PDF.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- sandboxed preload scripts must be CommonJS
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  savePdf: (name) => ipcRenderer.invoke("save-pdf", String(name)),
});
