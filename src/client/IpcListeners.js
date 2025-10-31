import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import window from './Window.js';
import configManager from './ConfigManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_URL = 'localhost:8990';

const skillDetailsWindows = new Map();
let curOpacity = configManager.getSkillWindowsConfig().opacity;

window.setSkillWindowsManager({
    broadcastOpacity: (opacity) => {
        skillDetailsWindows.forEach((windowData, windowId) => {
            if (windowData.window && !windowData.window.isDestroyed()) {
                windowData.window.webContents.send('skill-window-opacity', opacity);
            }
        });
    },
});

ipcMain.on('close-client', (event) => {
    app.quit();
});

ipcMain.on('set-skill-window-opacity', (event, opacity) => {
    curOpacity = opacity;
    skillDetailsWindows.forEach((windowData, windowId) => {
        if (windowData.window && !windowData.window.isDestroyed()) {
            windowData.window.webContents.send('skill-window-opacity', curOpacity);
        }
    });
});

ipcMain.on('open-skill-details', (event, userId, targetUid) => {
    console.log('Fetching skill data for user ID:', userId, ' targetuid ', targetUid);
    const data = fetch(`http://${SERVER_URL}/api/v2/skill/${targetUid}/${userId}`)
        .then((response) => response.json())
        .then((data) => {
            if (!data) {
                console.log('No user data for user:', userId);
                return;
            }
            const userData = data.data;
            const skillWindow = new BrowserWindow({
                width: 1500,
                height: 700,
                minWidth: 800,
                minHeight: 500,
                transparent: true,
                frame: false,
                title: `Skill Details - ${userData.name}`,
                webPreferences: {
                    contextIsolation: true,
                    nodeIntegration: false,
                    preload: path.join(__dirname, '../preload.js'),
                },
                modal: false,
                autoMenuBar: true,
                center: true,
            });

            skillWindow.setAlwaysOnTop(true, 'normal');
            skillWindow.setMovable(true);
            skillWindow.loadFile(path.join(__dirname, '../public/skill-details.html'));

            const windowId = skillWindow.id;
            skillDetailsWindows.set(windowId, {
                window: skillWindow,
                userId: userId,
            });

            skillWindow.webContents.on('did-finish-load', () => {
                const savedOpacity = configManager.getSkillWindowsConfig().opacity;
                skillWindow.webContents.send('skill-details-data', userData);
                skillWindow.webContents.send('skill-window-opacity', savedOpacity);
            });

            skillWindow.on('closed', () => {
                console.log('Window closed, removing from Map:', windowId);
                skillDetailsWindows.delete(windowId);
            });
        });
});

ipcMain.on('request-buffs-data', (event, fight) => {
    const windowId = event.sender.id;
    const userId = fight.userId;
    const params = new URLSearchParams({
        fightStartTime: fight.fightStartTime,
        lastUpdateTime: fight.lastUpdateTime,
    }).toString();

    fetch(`http://${SERVER_URL}/api/buffs/${userId}?${params}`)
        .then((response) => response.json())
        .then((data) => {
            const windowInfo = skillDetailsWindows.get(windowId);
            if (windowInfo && !windowInfo.window.isDestroyed()) {
                console.log('Sending buffs data to window:', windowId);
                windowInfo.window.webContents.send('buffs-data', data);
            } else {
                console.log('Window not found or destroyed:', windowId);
            }
        })
        .catch((error) => {
            console.error('Error fetching buff data for window:', windowId, error);
            const windowInfo = skillDetailsWindows.get(windowId);
            if (windowInfo && !windowInfo.window.isDestroyed()) {
                windowInfo.window.webContents.send('buffs-data', { code: -1, buffs: {} });
            }
        });
});
