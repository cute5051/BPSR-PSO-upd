import { UserData } from '../models/UserData.js';
import monsterNames from '../tables/monster_names_en_upd.json' with { type: 'json' };
import buff_table from '../tables/buff_table.json' with { type: 'json' };
import { Lock } from '../models/Lock.js';
import { config } from '../config.js';
import socket from './Socket.js';
import logger from './Logger.js';
import fsPromises from 'fs/promises';
import path from 'path';

class UserDataManager {
    constructor(logger) {
        this.currentPlayerUid = null;

        this.users = new Map();
        this.usersBuffs = new Map();
        this.userCache = new Map();
        this.cacheFilePath = './users.json';
        this.targetFights = new Map();
        this.targetFightsHistory = new Map();
        this.cacheMonstrFilePath = './monstr.json';

        this.saveThrottleDelay = 2000;
        this.saveThrottleTimer = null;
        this.pendingSave = false;

        this.currentTargetUid = null;
        this.hpCache = new Map();
        this.startTime = Date.now();

        this.logLock = new Lock();
        this.logDirExist = new Set();

        this.enemyCache = {
            name: new Map(),
            hp: new Map(),
            maxHp: new Map(),
            attrToUid: new Map(),
        };

        // 自动保存
        this.lastAutoSaveTime = 0;
        this.lastLogTime = 0;
        setInterval(() => {
            if (this.lastLogTime < this.lastAutoSaveTime) return;
            this.lastAutoSaveTime = Date.now();
            this.saveAllUserData();
        }, 10 * 1000);

        // New: Interval to clean up inactive fights exclude curTarget every 30 seconds
        // setInterval(() => {
        //     this.cleanUpInactiveTargetFights();
        // }, 30 * 1000);
    }

    cleanUpInactiveTargetFights() {
        const inactiveThreshold = 60 * 1000; // 1 минута
        const currentTime = Date.now();

        for (const [targetUid, targetFight] of this.targetFights.entries()) {
            if (this.currentTargetUid !== targetUid) {
                if (currentTime - targetFight.lastUpdateTime > inactiveThreshold) {
                    for (const [uid, user] of targetFight.users.entries()) {
                        targetFight.users.delete(uid);
                    }
                    this.targetFights.delete(targetUid);
                }
                logger.info(`Removed inactive fight with targetUid ${targetUid}`);
            }
        }
    }

    // New: Method to remove users who have not been updated in 60 seconds
    cleanUpInactiveUsers() {
        const inactiveThreshold = 60 * 1000; // 1 minute
        const currentTime = Date.now();

        for (const [uid, user] of this.users.entries()) {
            if (currentTime - user.lastUpdateTime > inactiveThreshold) {
                socket.emit('user_deleted', { uid });

                this.users.delete(uid);
                logger.info(`Removed inactive user with uid ${uid}`);
            }
        }
    }

    async init() {
        await this.loadUserCache();
    }

    async loadMonstrCache() {
        try {
            await fsPromises.access(this.cacheMonstrFilePath);
            const data = await fsPromises.readFile(this.cacheMonstrFilePath, 'utf8');
            const cacheData = JSON.parse(data);
            this.enemyCache.name = new Map(Object.entries(cacheData));
            logger.info(`Loaded ${this.enemyCache.name.size} monster cache entries`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Failed to load monster cache:', error);
            }
        }
    }

    async saveMonstrCache() {
        try {
            const cacheData = Object.fromEntries(this.enemyCache.name);
            await fsPromises.writeFile(this.cacheMonstrFilePath, JSON.stringify(cacheData, null, 2), 'utf8');
            logger.info(`Saved ${this.enemyCache.name.size} monster cache entries`);
        } catch (error) {
            logger.error('Failed to save user cache:', error);
        }
    }

    async loadUserCache() {
        try {
            await fsPromises.access(this.cacheFilePath);
            const data = await fsPromises.readFile(this.cacheFilePath, 'utf8');
            const cacheData = JSON.parse(data);
            this.userCache = new Map(Object.entries(cacheData));
            logger.info(`Loaded ${this.userCache.size} user cache entries`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Failed to load user cache:', error);
            }
        }
    }

    async saveUserCache() {
        try {
            const cacheData = Object.fromEntries(this.userCache);
            await fsPromises.writeFile(this.cacheFilePath, JSON.stringify(cacheData, null, 2), 'utf8');
        } catch (error) {
            logger.error('Failed to save user cache:', error);
        }
    }

    saveUserCacheThrottled() {
        this.pendingSave = true;
        if (this.saveThrottleTimer) {
            clearTimeout(this.saveThrottleTimer);
        }
        this.saveThrottleTimer = setTimeout(async () => {
            if (this.pendingSave) {
                await this.saveUserCache();
                this.pendingSave = false;
                this.saveThrottleTimer = null;
            }
        }, this.saveThrottleDelay);
    }

    async forceUserCacheSave() {
        await this.saveAllUserData(this.users, this.startTime);
        if (this.saveThrottleTimer) {
            clearTimeout(this.saveThrottleTimer);
            this.saveThrottleTimer = null;
        }
        if (this.pendingSave) {
            await this.saveUserCache();
            this.pendingSave = false;
        }
    }

    getUser(uid) {
        if (!this.users.has(uid)) {
            const user = new UserData(uid);
            const cachedData = this.userCache.get(String(uid));
            if (cachedData) {
                if (cachedData.name) {
                    user.setName(cachedData.name);
                }
                if (cachedData.profession) {
                    user.setProfession(cachedData.profession);
                }
                if (cachedData.professionId) {
                    user.setProfessionId(cachedData.professionId);
                }
                if (cachedData.fightPoint !== undefined && cachedData.fightPoint !== null) {
                    user.setFightPoint(cachedData.fightPoint);
                }
                if (cachedData.maxHp !== undefined && cachedData.maxHp !== null) {
                    user.setAttrKV('max_hp', cachedData.maxHp);
                }
            }
            if (this.hpCache.has(uid)) {
                user.setAttrKV('hp', this.hpCache.get(uid));
            }
            this.users.set(uid, user);
        }
        return this.users.get(uid);
    }

    getTargetFight(targetUid) {
        if (!this.targetFights.has(targetUid)) {
            this.targetFights.set(targetUid, {
                startTime: Date.now(),
                lastUpdateTime: Date.now(),
                users: new Map(),
            });
            logger.info(`Started new fight with target ${targetUid} with startTime: ${Date.now()}`);
        }
        return this.targetFights.get(targetUid);
    }

    getUserBattleData(targetUid, userUid) {
        const targetFight = this.getTargetFight(targetUid);
        if (!targetFight.users.has(userUid)) {
            const userData = new UserData(userUid);

            const mainUser = this.users.get(userUid);
            if (mainUser) {
                userData.name = mainUser.name;
                userData.profession = mainUser.profession;
                userData.professionId = mainUser.professionId;
                userData.fightPoint = mainUser.fightPoint;
                userData.attr = { ...mainUser.attr };
            }

            targetFight.users.set(userUid, userData);
        }
        return targetFight.users.get(userUid);
    }

    addDamage(uid, skillId, element, damage, isCrit, isLucky, isCauseLucky, hpLessenValue = 0, targetUid) {
        if (config.IS_PAUSED) return;
        this.checkTimeoutClear();
        if (uid === this.currentPlayerUid) {
            this.setCurrentTargetUid(targetUid);
        }
        const targetFight = this.getTargetFight(targetUid);
        targetFight.lastUpdateTime = Date.now();
        const user = this.getUserBattleData(targetUid, uid);
        user.addDamage(skillId, element, damage, isCrit, isLucky, isCauseLucky, hpLessenValue, targetFight.startTime);
    }

    addHealing(uid, skillId, element, healing, isCrit, isLucky, isCauseLucky, targetUid) {
        if (config.IS_PAUSED) return;
        this.checkTimeoutClear();
        if (uid !== 0) {
            for (const targetFight of this.targetFights.values()) {
                if (targetFight.users.has(uid) && targetFight.users.has(targetUid)) {
                    for (const userData of targetFight.users.values()) {
                        if (userData.uid === uid) {
                            userData.addHealing(skillId, element, healing, isCrit, isLucky, isCauseLucky);
                        }
                    }
                }
            }
        }
    }

    addTakenDamage(uid, damage, isDead, attackerUid) {
        if (config.IS_PAUSED) return;
        this.checkTimeoutClear();
        const user = this.getUserBattleData(attackerUid, uid);
        user.addTakenDamage(damage, isDead);
    }

    addBuff(targetUid, buffUuid, tableUuid, durationBuff, createTime) {
        let endTime = undefined;
        if (durationBuff) {
            endTime = createTime + durationBuff;
        }
        if (!this.usersBuffs.has(targetUid)) {
            const mapBuff = new Map();
            mapBuff.set(buffUuid, {
                tableUuid: tableUuid,
                createTime: createTime,
                endTime: endTime,
            });
            this.usersBuffs.set(targetUid, mapBuff);
            return;
        }
        const mapBuff = this.usersBuffs.get(targetUid);
        if (!mapBuff.has(buffUuid)) {
            mapBuff.set(buffUuid, {
                tableUuid: tableUuid,
                createTime: createTime,
                endTime: endTime,
            });
            return;
        } else {
            const buff = mapBuff.get(buffUuid);
            buff.endTime = endTime;
        }
    }

    closeBuff(targetUid, buffUuid, now) {
        if (this.usersBuffs.has(targetUid)) {
            const mapBuff = this.usersBuffs.get(targetUid);
            if (mapBuff.has(buffUuid)) {
                const buff = mapBuff.get(buffUuid);
                if (!buff.endTime) {
                    mapBuff.set(buffUuid, {
                        ...buff,
                        endTime: now,
                    });
                }
                if (buff.endTime > now) {
                    buff.endTime = now;
                }
            }
        }
    }

    getBuffsInfo(targetUid) {
        const tgtUserBuffs = this.usersBuffs.get(targetUid);
        const buffs = {};
        for (const [uid, buffsInfo] of tgtUserBuffs.entries()) {
            const buffTable = buff_table[buffsInfo.tableUuid];
            buffs[uid] = {
                buffName: buffTable.Name,
                buffDesc: buffTable.Desc,
                tableUuid: buffsInfo.tableUuid,
                createTime: buffsInfo.createTime,
                endTime: buffsInfo.endTime,
            };
        }
        return buffs;
    }

    getBuffsInfoByTime(targetUid, startFightTime, lastUpdateTime) {
        const tgtUserBuffs = this.usersBuffs.get(targetUid);
        if (!tgtUserBuffs) return {};

        const buffs = {};
        const fightDuration = lastUpdateTime - startFightTime;

        const buffsByTableUuid = {};

        for (const [uid, buffsInfo] of tgtUserBuffs.entries()) {
            const tableUuid = buffsInfo.tableUuid;
            if (buffsInfo.createTime > lastUpdateTime || buffsInfo.endTime < startFightTime) {
                continue;
            }
            if (!buffsByTableUuid[tableUuid]) {
                buffsByTableUuid[tableUuid] = {
                    buffInfo: null,
                    intervals: [],
                };
            }

            if (!buffsByTableUuid[tableUuid].buffInfo) {
                const buffTable = buff_table[tableUuid];
                buffsByTableUuid[tableUuid].buffInfo = {
                    buffName: buffTable?.Name || `Buff ${tableUuid}`,
                    buffDesc: buffTable?.Desc || '',
                    tableUuid: tableUuid,
                };
            }

            buffsByTableUuid[tableUuid].intervals.push({
                createTime: buffsInfo.createTime,
                endTime: buffsInfo.endTime,
            });
        }

        for (const [tableUuid, data] of Object.entries(buffsByTableUuid)) {
            const intervals = data.intervals;
            let totalUptime = 0;

            intervals.sort((a, b) => a.createTime - b.createTime);

            const mergedIntervals = [];
            let currentInterval = null;

            for (const interval of intervals) {
                if (!currentInterval) {
                    currentInterval = { ...interval };
                    continue;
                }

                if (interval.createTime <= currentInterval.endTime) {
                    currentInterval.endTime = Math.max(currentInterval.endTime, interval.endTime);
                } else {
                    mergedIntervals.push(currentInterval);
                    currentInterval = { ...interval };
                }
            }

            if (currentInterval) {
                mergedIntervals.push(currentInterval);
            }

            for (const interval of mergedIntervals) {
                const buffStartInFight = Math.max(interval.createTime, startFightTime);
                const buffEndInFight = Math.min(interval.endTime, lastUpdateTime);

                const durationInFight = Math.max(0, buffEndInFight - buffStartInFight);

                if (durationInFight > 0) {
                    totalUptime += durationInFight;
                }
            }
            if (totalUptime <= 0) {
                continue;
            }
            const uptimePercentage = fightDuration > 0 ? (totalUptime / fightDuration) * 100 : 0;

            buffs[tableUuid] = {
                ...data.buffInfo,
                uptime: uptimePercentage,
                totalUptime: totalUptime,
                fightDuration: fightDuration,
            };
        }

        return buffs;
    }

    async addLog(log) {
        if (config.IS_PAUSED) return;

        const logDir = path.join('./logs', String(this.startTime));
        const logFile = path.join(logDir, 'fight.log');
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${log}\n`;

        this.lastLogTime = Date.now();

        await this.logLock.acquire();
        try {
            if (!this.logDirExist.has(logDir)) {
                try {
                    await fsPromises.access(logDir);
                } catch (error) {
                    await fsPromises.mkdir(logDir, { recursive: true });
                }
                this.logDirExist.add(logDir);
            }
            await fsPromises.appendFile(logFile, logEntry, 'utf8');
        } catch (error) {
            logger.error('Failed to save log:', error);
        }
        this.logLock.release();
    }

    setCurrentTargetUid(bossUid) {
        this.currentTargetUid = bossUid;
    }

    setCurrentPlayerUid(uid) {
        if (uid && this.currentPlayerUid !== uid) {
            logger.info('Set currentPlayerUid = ' + uid);
            this.currentPlayerUid = uid;
        }
    }
    setProfession(uid, profession, professionId) {
        const user = this.getUser(uid);
        if (user.profession !== profession) {
            user.setProfession(profession);
            user.setProfessionId(professionId);
            logger.info(`Found profession ${profession} id ${professionId} for uid ${uid}`);
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).professionId = professionId;
            this.userCache.get(uidStr).profession = profession;
            this.saveUserCacheThrottled();
        }
    }

    setName(uid, name) {
        const user = this.getUser(uid);
        if (user.name !== name) {
            user.setName(name);
            logger.info(`Found player name ${name} for uid ${uid}`);
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).name = name;
            this.saveUserCacheThrottled();
        }
    }

    setFightPoint(uid, fightPoint) {
        const user = this.getUser(uid);
        if (user.fightPoint != fightPoint) {
            user.setFightPoint(fightPoint);
            logger.info(`Found fight point ${fightPoint} for uid ${uid}`);
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).fightPoint = fightPoint;
            this.saveUserCacheThrottled();
        }
    }

    setAttrKV(uid, key, value) {
        const user = this.getUser(uid);
        user.attr[key] = value;
        if (key === 'max_hp') {
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).maxHp = value;
            this.saveUserCacheThrottled();
        }
        if (key === 'hp') {
            this.hpCache.set(uid, value);
        }
    }

    updateAllRealtimeDps() {
        for (const targetFight of this.targetFights.values()) {
            for (const userData of targetFight.users.values()) {
                userData.updateRealtimeDps();
            }
        }
    }

    getUserSkillData(uid, targetUid) {
        if (!targetUid) return {};
        let updUid = targetUid;
        let index;
        if (targetUid.includes('_')) {
            const i = targetUid.indexOf('_');
            updUid = targetUid.substring(0, i);
            index = parseInt(targetUid.substring(i + 1));
        }
        updUid = parseInt(updUid);
        let targetFight = this.targetFights.get(updUid);
        if (!isNaN(index)) {
            targetFight = this.targetFightsHistory.get(updUid)[index];
        }
        if (!targetFight || !targetFight.users.has(uid)) return {};

        const userBattleData = targetFight.users.get(uid);
        const mainUser = this.users.get(uid);
        const startTime = targetFight.startTime;
        const lastUpdateTime = targetFight.lastUpdateTime;

        return {
            uid: userBattleData.uid,
            name: mainUser?.name || userBattleData.name,
            profession: mainUser?.profession || userBattleData.profession,
            professionId: mainUser?.professionId || userBattleData.professionId,
            skills: userBattleData.getSkillSummary(),
            attr: mainUser?.attr || userBattleData.attr,
            fightPoint: mainUser?.fightPoint || userBattleData.fightPoint,
            fightStartTime: startTime,
            lastUpdateTime: lastUpdateTime,
        };
    }

    getUserSkillDataV2(uid, targetUid) {
        if (!targetUid) return {};
        let updUid = targetUid;
        let index;
        if (targetUid.includes('_')) {
            const i = targetUid.indexOf('_');
            updUid = targetUid.substring(0, i);
            index = parseInt(targetUid.substring(i + 1));
        }
        updUid = parseInt(updUid);
        let targetFight = this.targetFights.get(updUid);
        if (!isNaN(index)) {
            targetFight = this.targetFightsHistory.get(updUid)[index];
        }
        if (!targetFight || !targetFight.users.has(uid)) return {};

        const userBattleData = targetFight.users.get(uid);
        const mainUser = this.users.get(uid);
        const startTime = targetFight.startTime;
        const lastUpdateTime = targetFight.lastUpdateTime;

        return {
            uid: userBattleData.uid,
            name: mainUser?.name || userBattleData.name,
            profession: mainUser?.profession || userBattleData.profession,
            professionId: mainUser?.professionId || userBattleData.professionId,
            skills: userBattleData.getSkillSummaryV2(),
            attr: mainUser?.attr || userBattleData.attr,
            fightPoint: mainUser?.fightPoint || userBattleData.fightPoint,
            fightStartTime: startTime,
            lastUpdateTime: lastUpdateTime,
        };
    }

    getAllUsersData() {
        let currentTargetUid = this.currentTargetUid;
        if (
            !currentTargetUid ||
            !(this.targetFights.has(currentTargetUid) || this.targetFightsHistory.has(currentTargetUid)) ||
            (config.GLOBAL_SETTINGS.onlyRecordBoss &&
                monsterNames[this.enemyCache.attrToUid.get(currentTargetUid)]?.MonsterType !== 2)
        ) {
            return {};
        }
        const historyFightArr = this.targetFightsHistory.get(currentTargetUid);
        const length = historyFightArr?.length === 0 ? 1 : historyFightArr?.length;
        const currentTargetName =
            this.enemyCache.name.get(currentTargetUid) ||
            monsterNames[this.enemyCache.attrToUid.get(currentTargetUid)]?.Name ||
            currentTargetUid;
        let currentTargetFight = this.targetFights.get(currentTargetUid);
        if (!currentTargetFight && !isNaN(length)) {
            currentTargetFight = historyFightArr[length - 1];
            currentTargetUid = `${currentTargetUid}_${length - 1}`;
        }
        const result = {};

        for (const [userUid, userBattleData] of currentTargetFight.users.entries()) {
            const mainUser = this.users.get(userUid);
            if (mainUser) {
                userBattleData.name = mainUser.name;
                userBattleData.profession = mainUser.profession;
                userBattleData.professionId = mainUser.professionId;
                userBattleData.fightPoint = mainUser.fightPoint;
                userBattleData.attr = { ...mainUser.attr };
            }
            const summary = userBattleData.getSummary();
            result[userUid] = {
                ...summary,
                lastUpdateTime: currentTargetFight.lastUpdateTime,
                startTime: currentTargetFight.startTime,
                targetName: currentTargetName,
                targetUid: currentTargetUid,
            };
        }
        return result;
    }

    getAllUsersDataByUid(uid) {
        let updUid = uid;
        let index;
        if (uid.includes('_')) {
            const i = uid.indexOf('_');
            updUid = uid.substring(0, i);
            index = parseInt(uid.substring(i + 1));
        }
        updUid = parseInt(updUid);
        if (!(this.targetFights.has(updUid) || this.targetFightsHistory.has(updUid))) {
            return {};
        }

        const currentTargetName =
            this.enemyCache.name.get(updUid) || monsterNames[this.enemyCache.attrToUid.get(updUid)]?.Name || updUid;
        let currentTargetFight = this.targetFights.get(updUid);
        if (!isNaN(index)) {
            currentTargetFight = this.targetFightsHistory.get(updUid)[index];
            updUid = `${updUid}_${index}`;
        }
        const result = {};

        for (const [userUid, userBattleData] of currentTargetFight.users.entries()) {
            const mainUser = this.users.get(userUid);
            if (mainUser) {
                userBattleData.name = mainUser.name;
                userBattleData.profession = mainUser.profession;
                userBattleData.professionId = mainUser.professionId;
                userBattleData.fightPoint = mainUser.fightPoint;
                userBattleData.attr = { ...mainUser.attr };
            }
            const summary = userBattleData.getSummary();
            result[userUid] = {
                ...summary,
                lastUpdateTime: currentTargetFight.lastUpdateTime,
                startTime: currentTargetFight.startTime,
                targetName: currentTargetName,
                targetUid: updUid,
            };
        }
        return result;
    }

    getAllTargets() {
        const allTargets = [];
        for (const [targetUid, fightsArray] of this.targetFightsHistory.entries()) {
            if (
                config.GLOBAL_SETTINGS.onlyRecordBoss &&
                monsterNames[this.enemyCache.attrToUid.get(targetUid)]?.MonsterType !== 2
            )
                continue;
            for (let i = 0; i < fightsArray.length; i++) {
                const targetFight = fightsArray[i];

                if (targetFight.users.has(this.currentPlayerUid)) {
                    const targetName =
                        this.enemyCache.name.get(targetUid) ||
                        monsterNames[this.enemyCache.attrToUid.get(targetUid)]?.Name ||
                        targetUid;
                    allTargets.push({
                        targetUid: `${targetUid}_${i}`,
                        targetName: targetName,
                        lastUpdateTime: targetFight.lastUpdateTime,
                        startTime: targetFight.startTime,
                    });
                }
            }
        }

        for (const [targetUid, targetFight] of this.targetFights.entries()) {
            if (
                config.GLOBAL_SETTINGS.onlyRecordBoss &&
                monsterNames[this.enemyCache.attrToUid.get(targetUid)]?.MonsterType !== 2
            )
                continue;
            if (targetFight.users.has(this.currentPlayerUid)) {
                const targetName =
                    this.enemyCache.name.get(targetUid) ||
                    monsterNames[this.enemyCache.attrToUid.get(targetUid)]?.Name ||
                    targetUid;
                allTargets.push({
                    targetUid: targetUid,
                    targetName: targetName,
                    lastUpdateTime: targetFight.lastUpdateTime,
                    startTime: targetFight.startTime,
                });
            }
        }

        allTargets.sort((a, b) => b.lastUpdateTime - a.lastUpdateTime);
        return allTargets;
    }

    getAllEnemiesData() {
        const result = {};
        const enemyIds = new Set([
            ...this.enemyCache.name.keys(),
            ...this.enemyCache.hp.keys(),
            ...this.enemyCache.maxHp.keys(),
        ]);
        enemyIds.forEach((id) => {
            result[id] = {
                name: this.enemyCache.name.get(id),
                hp: this.enemyCache.hp.get(id),
                max_hp: this.enemyCache.maxHp.get(id),
            };
        });
        return result;
    }

    refreshTargetFight(targetUid) {
        const targetFight = this.targetFights.get(targetUid);
        if (targetFight) {
            const users = targetFight.users;
            if (users && users.has(this.currentPlayerUid)) {
                logger.info(`Move info about fight with ${targetUid} in history`);
                if (!this.targetFightsHistory.has(targetUid)) {
                    this.targetFightsHistory.set(targetUid, []);
                }
                const fightsArray = this.targetFightsHistory.get(targetUid);
                fightsArray.push(targetFight);
            }
            this.targetFights.delete(targetUid);
        }
    }

    deleteEnemyData(id) {
        this.enemyCache.name.delete(id);
        this.enemyCache.hp.delete(id);
        this.enemyCache.maxHp.delete(id);
    }

    refreshEnemyCache() {
        this.enemyCache.name.clear();
        this.enemyCache.hp.clear();
        this.enemyCache.maxHp.clear();
    }

    clearAll() {
        const usersToSave = this.users;
        const saveStartTime = this.startTime;
        this.targetFights = new Map();
        this.targetFightsHistory = new Map();
        this.users = new Map();
        this.startTime = Date.now();
        this.lastAutoSaveTime = 0;
        this.lastLogTime = 0;
        this.saveAllUserData(usersToSave, saveStartTime);
    }

    getUserIds() {
        return Array.from(this.users.keys());
    }

    async saveAllUserData(usersToSave = null, startTime = null) {
        try {
            const endTime = Date.now();
            const users = usersToSave || this.users;
            const timestamp = startTime || this.startTime;
            const logDir = path.join('./logs', String(timestamp));
            const usersDir = path.join(logDir, 'users');
            const summary = {
                startTime: timestamp,
                endTime,
                duration: endTime - timestamp,
                userCount: users.size,
                version: config.VERSION,
            };

            const allUsersData = {};
            const userDatas = new Map();
            for (const [uid, user] of users.entries()) {
                allUsersData[uid] = user.getSummary();
                const userData = {
                    uid: user.uid,
                    name: user.name,
                    profession: user.profession + (user.subProfession ? `-${user.subProfession}` : ''),
                    professionId: user.professionId,
                    skills: user.getSkillSummary(),
                    attr: user.attr,
                };
                userDatas.set(uid, userData);
            }

            try {
                await fsPromises.access(usersDir);
            } catch (error) {
                await fsPromises.mkdir(usersDir, { recursive: true });
            }

            const allUserDataPath = path.join(logDir, 'allUserData.json');
            await fsPromises.writeFile(allUserDataPath, JSON.stringify(allUsersData, null, 2), 'utf8');
            for (const [uid, userData] of userDatas.entries()) {
                const userDataPath = path.join(usersDir, `${uid}.json`);
                await fsPromises.writeFile(userDataPath, JSON.stringify(userData, null, 2), 'utf8');
            }
            await fsPromises.writeFile(path.join(logDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
            logger.debug(`Saved data for ${summary.userCount} users to ${logDir}`);
        } catch (error) {
            logger.error('Failed to save all user data:', error);
            throw error;
        }
    }

    checkTimeoutClear() {
        if (!config.GLOBAL_SETTINGS.autoClearOnTimeout || this.lastLogTime === 0 || this.users.size === 0) return;
        const currentTime = Date.now();
        if (this.lastLogTime && currentTime - this.lastLogTime > 15000) {
            this.clearAll();
            logger.info('Timeout reached, statistics cleared!');
        }
    }

    getConfig() {
        return config;
    }
}

const userDataManager = new UserDataManager();
export default userDataManager;
