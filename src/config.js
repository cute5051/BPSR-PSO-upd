import fs from 'fs';
import path from 'path';

class Config {
    constructor() {
        this.configPath = path.join(process.cwd(), 'config.json');
        this._data = this.loadConfig();
    }

    get VERSION() {
        return this._data.VERSION;
    }

    set VERSION(value) {
        this._data.VERSION = value;
        this.saveConfig();
    }

    get IS_PAUSED() {
        return this._data.IS_PAUSED;
    }

    set IS_PAUSED(value) {
        this._data.IS_PAUSED = value;
        this.saveConfig();
    }

    get GLOBAL_SETTINGS() {
        return this._data.GLOBAL_SETTINGS;
    }

    set GLOBAL_SETTINGS(value) {
        this._data.GLOBAL_SETTINGS = { ...this._data.GLOBAL_SETTINGS, ...value };
        this.saveConfig();
    }

    loadConfig() {
        const defaults = {
            VERSION: '1.0.0',
            IS_PAUSED: false,
            GLOBAL_SETTINGS: {
                autoClearOnServerChange: true,
                autoClearOnTimeout: false,
                onlyRecordBoss: false,
            },
        };

        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                return { ...defaults, ...JSON.parse(data) };
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }

        return defaults;
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this._data, null, 2));
        } catch (error) {
            console.error('Error saving config:', error);
        }
    }

    reset() {
        this._data = this.loadConfig();
        this.saveConfig();
    }
}

export const config = new Config();
