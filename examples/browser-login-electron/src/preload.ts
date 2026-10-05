import { contextBridge, ipcRenderer } from "electron";

import type { Bridge } from "./public";

// Keep this sandboxed preload small: never expose ipcRenderer or arbitrary IPC.
contextBridge.exposeInMainWorld("auth", {
  session: () => ipcRenderer.invoke("yielded:auth", "session"),
  signIn: () => ipcRenderer.invoke("yielded:auth", "signIn"),
  resume: () => ipcRenderer.invoke("yielded:auth", "resume"),
  cancel: () => ipcRenderer.invoke("yielded:auth", "cancel"),
  reconcile: () => ipcRenderer.invoke("yielded:auth", "reconcile"),
  signOut: () => ipcRenderer.invoke("yielded:auth", "signOut"),
} satisfies Bridge);
