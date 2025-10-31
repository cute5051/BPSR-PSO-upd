import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ConfigManager {
    constructor() {
        this.configPath = path.join(__dirname, '../../windowConfig.json');
        this.config = this.loadConfig();
    }

    get defaultConfig() {
        return {
            mainWindow: {
                width: 300,
                height: 300,
                x: undefined,
                y: undefined,
                passthrough: false,
                lastHeight: 300,
                opacity: 0.55
            },
            skillWindows: {
                opacity: 0.55
            }
        };
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const rawData = fs.readFileSync(this.configPath, 'utf8');
                const loadedConfig = JSON.parse(rawData);
                return this.deepMerge(this.defaultConfig, loadedConfig);
            }
        } catch (error) {
            console.error('Failed to read window config, using defaults.', error);
        }
        return this.defaultConfig;
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 4));
            return true;
        } catch (error) {
            console.error('Failed to save window config:', error);
            return false;
        }
    }

    deepMerge(target, source) {
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                this.deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    getMainWindowConfig() {
        return this.config.mainWindow;
    }

    getSkillWindowsConfig() {
        return this.config.skillWindows;
    }

    setMainWindowOpacity(opacity) {
        this.config.mainWindow.opacity = parseFloat(opacity);
        return this.saveConfig();
    }

    setSkillWindowsOpacity(opacity) {
        this.config.skillWindows.opacity = parseFloat(opacity);
        return this.saveConfig();
    }

    setMainWindowPosition(x, y) {
        this.config.mainWindow.x = x;
        this.config.mainWindow.y = y;
        return this.saveConfig();
    }

    setMainWindowSize(width, height) {
        this.config.mainWindow.width = width;
        this.config.mainWindow.height = height;
        return this.saveConfig();
    }

    setPassthrough(enabled) {
        this.config.mainWindow.passthrough = enabled;
        return this.saveConfig();
    }

    setLastHeight(height) {
        this.config.mainWindow.lastHeight = height;
        return this.saveConfig();
    }
}

const configManager = new ConfigManager();
export default configManager;