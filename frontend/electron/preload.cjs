const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 获取后端服务器地址
  getServerUrl: () => ipcRenderer.invoke('get:serverUrl'),

  // 切换服务器地址
  changeServerUrl: (url) => ipcRenderer.invoke('change:serverUrl', url),

  // 获取平台
  getPlatform: () => process.platform,

  // 窗口控制
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // 窗口最大化状态
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChange: (callback) => {
    const handler = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window:maximizeChange', handler);
    // 返回 unsubscribe 函数，供调用方在 cleanup 时移除监听器，避免累积
    return () => ipcRenderer.removeListener('window:maximizeChange', handler);
  },
});
