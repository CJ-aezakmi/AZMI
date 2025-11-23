const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aezakmiAPI', {
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  saveProfile: (p) => ipcRenderer.invoke('save-profile', p),
  deleteProfiles: (ids) => ipcRenderer.invoke('delete-profiles', ids),
  launchProfile: (p) => ipcRenderer.invoke('launch-profile', p)
});