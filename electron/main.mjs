// Desktop shell: runs the bundled Next.js server on this machine and shows it in a window.
// In development (`npm run desktop`) it shows the `npm run dev` server instead.
import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } from "electron";
import { writeFile } from "node:fs/promises";
import path from "node:path";

// The port is fixed on purpose: saved memos and settings are tied to the page's origin
// (host + port), so a different port on every launch would look like an empty app.
const PORT = app.isPackaged ? 47831 : 3000;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const START_URL = app.isPackaged ? ORIGIN : `http://localhost:${PORT}`;

let server = null;
let mainWindow = null;

function startServer() {
  const dir = path.join(process.resourcesPath, "app-server");
  server = utilityProcess.fork(path.join(dir, "server.js"), [], {
    cwd: dir,
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), HOSTNAME: "127.0.0.1" },
    stdio: "ignore",
    serviceName: "memo-server",
  });
  server.once("exit", (code) => {
    server = null;
    if (!app.isQuitting) {
      dialog.showErrorBox("もじメモ", `内部サーバーが停止しました（コード ${code}）。アプリを再起動してください。`);
      app.quit();
    }
  });
}

/** Poll until the server answers, or give up after ~20 seconds. */
async function waitForServer(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.status < 500) return true;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 520,
    autoHideMenuBar: true,
    backgroundColor: "#f6fbf3",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(import.meta.dirname, "preload.cjs"),
    },
  });

  // Links to other sites (API key pages etc.) open in the default browser, never inside the app.
  const isAppUrl = (url) => url.startsWith(`${START_URL}/`) || url === START_URL;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !isAppUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(START_URL);
}

// "PDFで保存": ask where to save, then write the page as laid out by its print styles.
ipcMain.handle("save-pdf", async (event, name) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  const safeName = String(name).replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "memo";
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    defaultPath: `${safeName}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return false;
  try {
    await writeFile(filePath, await event.sender.printToPDF({ pageSize: "A4", printBackground: true }));
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("もじメモ", `PDFを保存できませんでした。\n${reason}`);
    return false;
  }
});

// A second launch would fight over the fixed port: focus the running window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    if (app.isPackaged) startServer();
    if (!(await waitForServer(START_URL))) {
      dialog.showErrorBox(
        "もじメモ",
        app.isPackaged
          ? `内部サーバーを起動できませんでした。ポート ${PORT} を他のアプリが使っていないか確認してください。`
          : "開発サーバーに接続できません。先に別のターミナルで「npm run dev」を実行してください。",
      );
      app.quit();
      return;
    }
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    app.isQuitting = true;
    server?.kill();
  });
}
