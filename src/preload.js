const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    closeClient: () => ipcRenderer.send('close-client'),
    onTogglePassthrough: (callback) => ipcRenderer.on('passthrough-toggled', (_event, value) => callback(value)),
    setMainOpacity: (opacity) => ipcRenderer.invoke('set-main-opacity', opacity),
    onMainOpacity: (callback) => ipcRenderer.on('main-opacity', (_event, value) => callback(value)),
    openSkillDetails: (userId, targetUid) => ipcRenderer.send('open-skill-details', userId, targetUid),
    onSkillDetailsData: (callback) => ipcRenderer.on('skill-details-data', (_event, value) => callback(value)),
    requestBuffsData: (fight) => ipcRenderer.send('request-buffs-data', fight),
    onBuffsData: (callback) => ipcRenderer.on('buffs-data', (_event, value) => callback(value)),
    setSkillWindowOpacity: (opacity) => ipcRenderer.invoke('set-skill-window-opacity', opacity),
    onSkillWindowOpacity: (callback) => ipcRenderer.on('skill-window-opacity', (_event, value) => callback(value)),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
