import zlib from 'zlib';
import Long from 'long';
import pbjs from 'protobufjs/minimal.js';
import fs from 'fs';
import logger from './Logger.js';
import { createRequire } from 'module';
import monsterNames from '../tables/monster_names_en_upd.json' with { type: 'json' };
import { BinaryReader } from '../models/BinaryReader.js';
import userDataManager from './UserDataManager.js';

const require = createRequire(import.meta.url);
const pb = require('../algo/blueprotobuf.js');

const MessageType = {
    None: 0,
    Call: 1,
    Notify: 2,
    Return: 3,
    Echo: 4,
    FrameUp: 5,
    FrameDown: 6,
};

const NotifyMethod = {
    SyncNearEntities: 0x00000006,
    SyncContainerData: 0x00000015,
    SyncContainerDirtyData: 0x00000016,
    SyncServerTime: 0x0000002b,
    SyncNearDeltaInfo: 0x0000002d,
    SyncToMeDeltaInfo: 0x0000002e,
};

const AttrType = {
    AttrName: 0x01,
    AttrId: 0x0a,
    AttrProfessionId: 0xdc,
    AttrDeadTime: 0xce,
    AttrFightPoint: 0x272e,
    AttrLevel: 0x2710,
    AttrRankLevel: 0x274c,
    AttrCri: 0x2b66,
    AttrLucky: 0x2b7a,
    AttrHp: 0x2c2e,
    AttrMaxHp: 0x2c38,
    AttrElementFlag: 0x646d6c,
    AttrReductionLevel: 0x64696d,
    AttrReduntionId: 0x6f6c65,
    AttrEnergyFlag: 0x543cd3c6,
};

const ProfessionType = {
    Stormblade: 1,
    FrostMage: 2,
    FireWarrior: 3,
    WindKnight: 4,
    VerdantOracle: 5,
    Marksman_Cannon: 8,
    HeavyGuardian: 9,
    SoulMusician_Scythe: 10,
    Marksman: 11,
    ShieldKnight: 12,
    SoulMusician: 13,
};

const EDamageSource = {
    EDamageSourceSkill: 0,
    EDamageSourceBullet: 1,
    EDamageSourceBuff: 2,
    EDamageSourceFall: 3,
    EDamageSourceFakeBullet: 4,
    EDamageSourceOther: 100,
};

const EDamageProperty = {
    General: 0,
    Fire: 1,
    Water: 2,
    Electricity: 3,
    Wood: 4,
    Wind: 5,
    Rock: 6,
    Light: 7,
    Dark: 8,
    Count: 9,
};

const getProfessionNameFromId = (professionId) => {
    switch (professionId) {
        case ProfessionType.Stormblade:
            return 'Stormblade';
        case ProfessionType.FrostMage:
            return 'Frost Mage';
        case ProfessionType.FireWarrior:
            return 'Fire Warrior';
        case ProfessionType.WindKnight:
            return 'Wind Knight';
        case ProfessionType.VerdantOracle:
            return 'Verdant Oracle';
        case ProfessionType.Marksman_Cannon:
            return 'Gunner';
        case ProfessionType.HeavyGuardian:
            return 'Heavy Guardian';
        case ProfessionType.SoulMusician_Scythe:
            return 'Reaper';
        case ProfessionType.Marksman:
            return 'Marksman';
        case ProfessionType.ShieldKnight:
            return 'Shield Knight';
        case ProfessionType.SoulMusician:
            return 'Soul Musician';
        default:
            return '';
    }
};

const getDamageElement = (damageProperty) => {
    switch (damageProperty) {
        case EDamageProperty.General:
            return 'General'; //⚔️物
        case EDamageProperty.Fire:
            return 'Fire'; //🔥火
        case EDamageProperty.Water:
            return 'Water'; //❄️冰
        case EDamageProperty.Electricity:
            return 'Electricity'; //⚡雷
        case EDamageProperty.Wood:
            return 'Wood'; //🍀森
        case EDamageProperty.Wind:
            return 'Wind'; //💨风
        case EDamageProperty.Rock:
            return 'Rock'; //⛰️岩
        case EDamageProperty.Light:
            return 'Light'; //🌟光
        case EDamageProperty.Dark:
            return 'Dark'; //🌑暗
        case EDamageProperty.Count:
            return '❓？'; // 未知
        default:
            return 'General'; //⚔️物
    }
};

const getDamageSource = (damageSource) => {
    switch (damageSource) {
        case EDamageSource.EDamageSourceSkill:
            return 'Skill';
        case EDamageSource.EDamageSourceBullet:
            return 'Bullet';
        case EDamageSource.EDamageSourceBuff:
            return 'Buff';
        case EDamageSource.EDamageSourceFall:
            return 'Fall';
        case EDamageSource.EDamageSourceFakeBullet:
            return 'FBullet';
        case EDamageSource.EDamageSourceOther:
            return 'Other';
        default:
            return 'Unknown';
    }
};

const isUuidPlayer = (uuid) => {
    return (uuid.toBigInt() & 0xffffn) === 640n;
};

const isUuidMonster = (uuid) => {
    return (uuid.toBigInt() & 0xffffn) === 64n;
};

const doesStreamHaveIdentifier = (reader) => {
    const startPos = reader.position;
    if (reader.remaining() < 8) {
        return false;
    }

    let identifier = reader.readUInt32LE();
    reader.readInt32();

    if (identifier !== 0xfffffffe) {
        reader.position = startPos;
        return false;
    }

    identifier = reader.readInt32();
    reader.readInt32();

    reader.position = startPos;
    return true;
};

const streamReadString = (reader) => {
    const length = reader.readUInt32LE();
    reader.readInt32();

    const buffer = reader.readBytes(length);
    reader.readInt32();

    return buffer.toString();
};

let currentUserUuid = Long.ZERO;

export class PacketProcessor {
    constructor() {
        this.internalBuffer = Buffer.alloc(0);
    }

    _decompressPayload(buffer) {
        if (!zlib.zstdDecompressSync) {
            logger.warn('zstdDecompressSync is not available! Please check your Node.js version!');
            return;
        }
        return zlib.zstdDecompressSync(buffer);
    }

    _processAoiSyncDelta(aoiSyncDelta) {
        if (!aoiSyncDelta) {
            return;
        }
        let targetUuid = aoiSyncDelta.Uuid;
        if (!targetUuid) {
            return;
        }
        const isTargetPlayer = isUuidPlayer(targetUuid);
        const isTargetMonster = isUuidMonster(targetUuid);
        let targetUid = targetUuid.shiftRight(16);

        const attrCollection = aoiSyncDelta.Attrs;
        if (attrCollection && attrCollection.Attrs) {
            if (isTargetPlayer) {
                this._processPlayerAttrs(targetUid.toNumber(), attrCollection.Attrs);
            } else if (isTargetMonster) {
                this._processEnemyAttrs(targetUid.toNumber(), attrCollection.Attrs, targetUuid.toNumber());
            }
        }

        //buffs
        const buffInfos = aoiSyncDelta.BuffInfos;
        // const tempTable = new Map();
        if (buffInfos) {
            for (const syncBuffInfo of buffInfos.BuffInfos) {
                const durationBuff = syncBuffInfo.Duration;
                const tableUuid = syncBuffInfo.TableUuid;
                const buffUuid = syncBuffInfo.BuffUuid;
                const createTime = syncBuffInfo.CreateTime.toNumber();
                if (!durationBuff) {
                    // logger.info(syncBuffInfo);
                    continue;
                }
                // tempTable.set(buffUuid, syncBuffInfo);
                userDataManager.addBuff(targetUid.toNumber(), buffUuid, tableUuid, durationBuff, createTime);
            }
        }
        const buffEffect = aoiSyncDelta.BuffEffect;
        if (buffEffect) {
            for (const syncBuffEffect of buffEffect.BuffEffects) {
                const now = Date.now();
                const typeBuffEffect = syncBuffEffect.Type;
                const buffUuid = syncBuffEffect.BuffUuid;
                // if (targetUid.toNumber() === 35842554) {
                //     const tempBuff = tempTable.get(buffUuid);
                //     if (tempBuff && tempBuff.TableUuid === 683115) {
                //         logger.info(`type: ${typeBuffEffect}`);
                //         logger.info(tempBuff);
                //         logger.info(syncBuffEffect);
                //     }
                // }
                if (typeBuffEffect === 2) {
                    userDataManager.closeBuff(targetUid.toNumber(), buffUuid, now);
                } else if (typeBuffEffect !== 1) {
                }
            }
        }

        const skillEffect = aoiSyncDelta.SkillEffects;
        if (!skillEffect || !skillEffect.Damages) {
            return;
        }
        // if (skillEffect) {
        //     logger.info(skillEffect);
        // }
        for (const syncDamageInfo of skillEffect.Damages) {
            const skillId = syncDamageInfo.OwnerId;
            if (!skillId) {
                continue;
            }

            let attackerUuid = syncDamageInfo.TopSummonerId || syncDamageInfo.AttackerUuid;
            if (!attackerUuid) {
                continue;
            }

            const isAttackerPlayer = isUuidPlayer(attackerUuid);
            attackerUuid = attackerUuid.shiftRight(16);

            // if (attackerUuid.toNumber() === 35842554) {
            //     logger.info(syncDamageInfo);
            //     logger.info(skillEffect);
            // }
            const value = syncDamageInfo.Value;
            const luckyValue = syncDamageInfo.LuckyValue;
            const damage = value ?? luckyValue ?? Long.ZERO;
            if (damage.isZero()) {
                continue;
            }

            const isCrit = syncDamageInfo.TypeFlag != null ? (syncDamageInfo.TypeFlag & 1) === 1 : false;
            const isCauseLucky = syncDamageInfo.TypeFlag != null ? (syncDamageInfo.TypeFlag & 0b100) === 0b100 : false;
            const isHeal = syncDamageInfo.Type === pb.EDamageType.Heal;
            const isDead = syncDamageInfo.IsDead != null ? syncDamageInfo.IsDead : false;
            const isLucky = !!luckyValue;
            const hpLessenValue = syncDamageInfo.HpLessenValue != null ? syncDamageInfo.HpLessenValue : Long.ZERO;
            const damageElement = getDamageElement(syncDamageInfo.Property);
            const damageSource = syncDamageInfo.DamageSource ?? 0;

            if (isTargetPlayer) {
                if (isHeal) {
                    userDataManager.addHealing(
                        isAttackerPlayer ? attackerUuid.toNumber() : 0,
                        skillId,
                        damageElement,
                        damage.toNumber(),
                        isCrit,
                        isLucky,
                        isCauseLucky,
                        targetUid.toNumber()
                    );
                } else {
                    // userDataManager.addTakenDamage(targetUid.toNumber(), damage.toNumber(), isDead, attackerUuid.toNumber());
                }
                if (isDead) {
                    userDataManager.setAttrKV(targetUid.toNumber(), 'hp', 0);
                }
            } else {
                if (!isHeal && isAttackerPlayer) {
                    userDataManager.addDamage(
                        attackerUuid.toNumber(),
                        skillId,
                        damageElement,
                        damage.toNumber(),
                        isCrit,
                        isLucky,
                        isCauseLucky,
                        hpLessenValue.toNumber(),
                        targetUid.toNumber()
                    );
                }
                if (isDead) {
                    userDataManager.refreshTargetFight(targetUid.toNumber());
                }
            }

            let extra = [];
            if (isCrit) {
                extra.push('Crit');
            }
            if (isLucky) {
                extra.push('Lucky');
            }
            if (isCauseLucky) {
                extra.push('CauseLucky');
            }
            if (extra.length === 0) {
                extra.push('Normal');
            }

            const actionType = isHeal ? 'HEAL' : 'DMG';
            let infoStr = `SRC: `;

            if (isAttackerPlayer) {
                const attacker = userDataManager.getUser(attackerUuid.toNumber());
                if (attacker.name) {
                    infoStr += attacker.name;
                }
                infoStr += `#${attackerUuid.toString()}(player)`;
            } else {
                if (userDataManager.enemyCache.name.has(attackerUuid.toNumber())) {
                    infoStr += userDataManager.enemyCache.name.get(attackerUuid.toNumber());
                }
                infoStr += `#${attackerUuid.toString()}(enemy)`;
            }

            let targetName = '';
            if (isTargetPlayer) {
                const target = userDataManager.getUser(targetUid.toNumber());
                if (target.name) {
                    targetName += target.name;
                }
                targetName += `#${targetUid.toString()}(player)`;
            } else {
                if (userDataManager.enemyCache.name.has(targetUid.toNumber())) {
                    targetName += userDataManager.enemyCache.name.get(targetUid.toNumber());
                }
                targetName += `#${targetUid.toString()}(enemy)`;
            }

            infoStr += ` TGT: ${targetName}`;
            const dmgLog = `[${actionType}] DS: ${getDamageSource(damageSource)} ${infoStr} ID: ${skillId} VAL: ${damage} HPLSN: ${hpLessenValue} ELEM: ${damageElement.slice(-1)} EXT: ${extra.join('|')}`;
            //logger.info(dmgLog);
            // userDataManager.addLog(dmgLog);
        }
    }

    _processSyncNearDeltaInfo(payloadBuffer) {
        const syncNearDeltaInfo = pb.SyncNearDeltaInfo.decode(payloadBuffer);
        if (!syncNearDeltaInfo.DeltaInfos) {
            return;
        }
        for (const aoiSyncDelta of syncNearDeltaInfo.DeltaInfos) {
            this._processAoiSyncDelta(aoiSyncDelta);
        }
    }

    _processSyncToMeDeltaInfo(payloadBuffer) {
        const syncToMeDeltaInfo = pb.SyncToMeDeltaInfo.decode(payloadBuffer);
        const aoiSyncToMeDelta = syncToMeDeltaInfo.DeltaInfo;
        const uuid = aoiSyncToMeDelta.Uuid;
        if (uuid && !currentUserUuid.eq(uuid)) {
            currentUserUuid = uuid;
            userDataManager.setCurrentPlayerUid(currentUserUuid.shiftRight(16).toNumber());
            logger.info('Got player UUID! UUID: ' + currentUserUuid + ' UID: ' + currentUserUuid.shiftRight(16));
        }
        const aoiSyncDelta = aoiSyncToMeDelta.BaseDelta;
        if (!aoiSyncDelta) {
            return;
        }
        this._processAoiSyncDelta(aoiSyncDelta);
    }

    _processSyncContainerData(payloadBuffer) {
        try {
            const syncContainerData = pb.SyncContainerData.decode(payloadBuffer);
            if (!syncContainerData.VData) {
                return;
            }
            const vData = syncContainerData.VData;
            if (!vData.CharId) {
                return;
            }
            const playerUid = vData.CharId.toNumber();

            if (vData.RoleLevel && vData.RoleLevel.Level) {
                userDataManager.setAttrKV(playerUid, 'level', vData.RoleLevel.Level);
            }
            if (vData.Attr && vData.Attr.CurHp) {
                userDataManager.setAttrKV(playerUid, 'hp', vData.Attr.CurHp.toNumber());
            }
            if (vData.Attr && vData.Attr.MaxHp) {
                userDataManager.setAttrKV(playerUid, 'max_hp', vData.Attr.MaxHp.toNumber());
            }
            if (!vData.CharBase) {
                return;
            }
            const charBase = vData.CharBase;
            if (charBase.Name) {
                userDataManager.setName(playerUid, charBase.Name);
            }
            if (charBase.FightPoint) {
                userDataManager.setFightPoint(playerUid, charBase.FightPoint);
            }
            if (!vData.ProfessionList) {
                return;
            }
            const professionList = vData.ProfessionList;
            if (professionList.CurProfessionId) {
                userDataManager.setProfession(
                    playerUid,
                    getProfessionNameFromId(professionList.CurProfessionId),
                    professionList.CurProfessionId
                );
            }
        } catch (err) {
            fs.writeFileSync('./SyncContainerData.dat', payloadBuffer);
            logger.warn(
                `Failed to decode SyncContainerData for player ${currentUserUuid.shiftRight(16)}. Please report to developer`
            );
            throw err;
        }
    }

    _processSyncContainerDirtyData(payloadBuffer) {
        if (currentUserUuid.isZero()) {
            return;
        }

        // --- FIX: Correctly access the protobuf message type ---
        const syncContainerDirtyData = pb.SyncContainerDirtyData.decode(payloadBuffer);

        if (!syncContainerDirtyData.VData || !syncContainerDirtyData.VData.Buffer) {
            return;
        }

        const messageReader = new BinaryReader(Buffer.from(syncContainerDirtyData.VData.Buffer));
        if (!doesStreamHaveIdentifier(messageReader)) {
            return;
        }

        let fieldIndex = messageReader.readUInt32LE();
        messageReader.readInt32();

        switch (fieldIndex) {
            case 2: // CharBase
                if (!doesStreamHaveIdentifier(messageReader)) {
                    break;
                }
                fieldIndex = messageReader.readUInt32LE();
                messageReader.readInt32();
                switch (fieldIndex) {
                    case 5: {
                        // Name
                        const playerName = streamReadString(messageReader);
                        if (!playerName || playerName === '') {
                            break;
                        }
                        userDataManager.setName(currentUserUuid.shiftRight(16).toNumber(), playerName);
                        break;
                    }
                    case 35: {
                        // FightPoint
                        const fightPoint = messageReader.readUInt32LE();
                        messageReader.readInt32();
                        userDataManager.setFightPoint(currentUserUuid.shiftRight(16).toNumber(), fightPoint);
                        break;
                    }
                }
                break;
            case 16: // UserFightAttr
                if (!doesStreamHaveIdentifier(messageReader)) {
                    break;
                }
                fieldIndex = messageReader.readUInt32LE();
                messageReader.readInt32();
                switch (fieldIndex) {
                    case 1: {
                        // CurHp
                        const curHp = messageReader.readUInt32LE();
                        userDataManager.setAttrKV(currentUserUuid.shiftRight(16).toNumber(), 'hp', curHp);
                        break;
                    }
                    case 2: {
                        // MaxHp
                        const maxHp = messageReader.readUInt32LE();
                        userDataManager.setAttrKV(currentUserUuid.shiftRight(16).toNumber(), 'max_hp', maxHp);
                        break;
                    }
                }
                break;
            case 61: // ProfessionList
                if (!doesStreamHaveIdentifier(messageReader)) {
                    break;
                }
                fieldIndex = messageReader.readUInt32LE();
                messageReader.readInt32();
                if (fieldIndex === 1) {
                    // CurProfessionId
                    const curProfessionId = messageReader.readUInt32LE();
                    messageReader.readInt32();
                    if (curProfessionId) {
                        userDataManager.setProfession(
                            currentUserUuid.shiftRight(16).toNumber(),
                            getProfessionNameFromId(curProfessionId),
                            curProfessionId
                        );
                    }
                }
                break;
        }
    }

    _processPlayerAttrs(playerUid, attrs) {
        for (const attr of attrs) {
            if (!attr.Id || !attr.RawData) {
                continue;
            }
            const reader = pbjs.Reader.create(attr.RawData);
            switch (attr.Id) {
                case AttrType.AttrName: {
                    userDataManager.setName(playerUid, reader.string());
                    break;
                }
                case AttrType.AttrProfessionId: {
                    const idProf = reader.int32();
                    userDataManager.setProfession(playerUid, getProfessionNameFromId(idProf), idProf);
                    break;
                }
                case AttrType.AttrFightPoint: {
                    userDataManager.setFightPoint(playerUid, reader.int32());
                    break;
                }
                case AttrType.AttrLevel: {
                    userDataManager.setAttrKV(playerUid, 'level', reader.int32());
                    break;
                }
                case AttrType.AttrRankLevel: {
                    userDataManager.setAttrKV(playerUid, 'rank_level', reader.int32());
                    break;
                }
                case AttrType.AttrCri: {
                    userDataManager.setAttrKV(playerUid, 'cri', reader.int32());
                    break;
                }
                case AttrType.AttrLucky: {
                    userDataManager.setAttrKV(playerUid, 'lucky', reader.int32());
                    break;
                }
                case AttrType.AttrHp: {
                    userDataManager.setAttrKV(playerUid, 'hp', reader.int32());
                    break;
                }
                case AttrType.AttrMaxHp: {
                    userDataManager.setAttrKV(playerUid, 'max_hp', reader.int32());
                    break;
                }
                case AttrType.AttrElementFlag: {
                    userDataManager.setAttrKV(playerUid, 'element_flag', reader.int32());
                    break;
                }
                case AttrType.AttrEnergyFlag: {
                    userDataManager.setAttrKV(playerUid, 'energy_flag', reader.int32());
                    break;
                }
                case AttrType.AttrReductionLevel: {
                    userDataManager.setAttrKV(playerUid, 'reduction_level', reader.int32());
                    break;
                }
            }
        }
    }

    _processEnemyAttrs(enemyUid, attrs, enemyUuid) {
        for (const attr of attrs) {
            if (!attr.Id || !attr.RawData) {
                continue;
            }
            const reader = pbjs.Reader.create(attr.RawData);
            switch (attr.Id) {
                case AttrType.AttrName: {
                    const enemyName = reader.string();
                    userDataManager.enemyCache.name.set(enemyUid, enemyName);
                    logger.info(`Found monster name ${enemyName} for id ${enemyUid}`);
                    break;
                }
                case AttrType.AttrId: {
                    const attrId = reader.int32();
                    userDataManager.enemyCache.attrToUid.set(enemyUid, attrId);
                    const name = monsterNames[attrId].Name;
                    if (name) {
                        logger.info(
                            `Found monster name ${name} for uuid ${enemyUuid} for uid ${enemyUid} by attrId ${attrId}`
                        );
                        userDataManager.enemyCache.name.set(enemyUid, name);
                    }
                    break;
                }
                case AttrType.AttrHp: {
                    const hp = reader.int32();
                    if (
                        userDataManager.enemyCache.hp.get(enemyUid) &&
                        userDataManager.enemyCache.hp.get(enemyUid) < hp
                    ) {
                        logger.info(
                            `UID ${enemyUid} HP: ${userDataManager.enemyCache.hp.get(enemyUid)} < ${userDataManager.enemyCache.maxHp.get(enemyUid)}`
                        );
                        userDataManager.refreshTargetFight(enemyUid);
                    }
                    userDataManager.enemyCache.hp.set(enemyUid, hp);
                    break;
                }
                case AttrType.AttrMaxHp: {
                    userDataManager.enemyCache.maxHp.set(enemyUid, reader.int32());
                    break;
                }
            }
        }
    }

    _processSyncNearEntities(payloadBuffer) {
        const syncNearEntities = pb.SyncNearEntities.decode(payloadBuffer);
        if (!syncNearEntities.Appear) {
            return;
        }
        for (const entity of syncNearEntities.Appear) {
            const entityUuid = entity.Uuid;
            if (!entityUuid) {
                continue;
            }
            const entityUid = entityUuid.shiftRight(16).toNumber();
            const attrCollection = entity.Attrs;
            if (attrCollection && attrCollection.Attrs) {
                switch (entity.EntType) {
                    case pb.EEntityType.EntMonster: {
                        this._processEnemyAttrs(entityUid, attrCollection.Attrs, entityUuid);
                        break;
                    }
                    case pb.EEntityType.EntChar: {
                        this._processPlayerAttrs(entityUid, attrCollection.Attrs);
                        break;
                    }
                }
            }
        }
    }

    _processNotifyMsg(reader, isZstdCompressed) {
        const serviceUuid = reader.readUInt64();
        reader.readUInt32(); // stubId
        const methodId = reader.readUInt32();
        if (serviceUuid !== 0x0000000063335342n) {
            logger.debug(`Skipping NotifyMsg with serviceId ${serviceUuid}`);
            return;
        }
        let msgPayload = reader.readRemaining();
        if (isZstdCompressed) {
            msgPayload = this._decompressPayload(msgPayload);
        }
        switch (methodId) {
            case NotifyMethod.SyncNearEntities: {
                this._processSyncNearEntities(msgPayload);
                break;
            }
            case NotifyMethod.SyncContainerData: {
                this._processSyncContainerData(msgPayload);
                break;
            }
            case NotifyMethod.SyncContainerDirtyData: {
                this._processSyncContainerDirtyData(msgPayload);
                break;
            }
            case NotifyMethod.SyncToMeDeltaInfo: {
                this._processSyncToMeDeltaInfo(msgPayload);
                break;
            }
            case NotifyMethod.SyncNearDeltaInfo: {
                this._processSyncNearDeltaInfo(msgPayload);
                break;
            }
            default: {
                logger.debug(`Skipping NotifyMsg with methodId ${methodId}`);
                break;
            }
        }
    }

    _processReturnMsg(reader, isZstdCompressed) {
        logger.debug('Unimplemented processing return');
    }

    processPacket(packets) {
        try {
            const packetsReader = new BinaryReader(packets);
            const MIN_PACKET_SIZE = 6;
            const MAX_PACKET_SIZE = 1024 * 1024;
            while (packetsReader.remaining() >= MIN_PACKET_SIZE) {
                const packetSize = packetsReader.peekUInt32();
                if (packetSize < MIN_PACKET_SIZE || packetSize > MAX_PACKET_SIZE) {
                    logger.warn(`Invalid packet length detected: ${packetSize}. Discarding corrupt buffer.`);
                    return;
                }
                if (packetsReader.remaining() < packetSize) {
                    return;
                }
                const packetReader = new BinaryReader(packetsReader.readBytes(packetSize));
                packetReader.readUInt32();
                const packetType = packetReader.readUInt16();
                const isZstdCompressed = (packetType & 0x8000) !== 0;
                const msgTypeId = packetType & 0x7fff;
                switch (msgTypeId) {
                    case MessageType.Notify: {
                        this._processNotifyMsg(packetReader, isZstdCompressed);
                        break;
                    }
                    case MessageType.Return: {
                        this._processReturnMsg(packetReader, isZstdCompressed);
                        break;
                    }
                    case MessageType.FrameDown: {
                        packetReader.readUInt32(); // serverSequenceId
                        if (packetReader.remaining() === 0) {
                            break;
                        }
                        let nestedPacket = packetReader.readRemaining();
                        if (isZstdCompressed) {
                            nestedPacket = this._decompressPayload(nestedPacket);
                        }
                        this.processPacket(nestedPacket);
                        break;
                    }
                    default: {
                        // let testPacket = packetReader.readRemaining();
                        // logger.info(testPacket);
                        // if (isZstdCompressed) {
                        //     testPacket = this._decompressPayload(testPacket);
                        // }
                        // const testBuff = pb.BuffEffectSync.decode(testPacket);
                        // logger.info(testBuff);
                        // Silently ignore unknown packet types
                        break;
                    }
                }
            }
        } catch (e) {
            logger.error(
                `Fatal error while parsing packet data for player ${currentUserUuid.shiftRight(16)}.\nErr: ${e.stack}`
            );
        }
    }

    processDataChunk(dataChunk) {
        if (!dataChunk || dataChunk.length === 0) {
            return;
        }
        this.internalBuffer = Buffer.concat([this.internalBuffer, dataChunk]);
        this._parseBuffer();
    }

    _parseBuffer() {
        const MIN_PACKET_SIZE = 6;
        const MAX_PACKET_SIZE = 1024 * 1024;

        while (this.internalBuffer.length >= 4) {
            const tempReader = new BinaryReader(this.internalBuffer);
            const hasHeader = doesStreamHaveIdentifier(tempReader);
            if (!hasHeader) {
                logger.warn(`Invalid packet header: ${this.internalBuffer.readUInt32LE(0)}. Advancing to next chunk.`);
                this.internalBuffer = this.internalBuffer.subarray(4);
                continue;
            }
            const packetSize = this.internalBuffer.readUInt32LE(0);
            if (packetSize < MIN_PACKET_SIZE || packetSize > MAX_PACKET_SIZE) {
                logger.warn(`Invalid packet length detected: ${packetSize}. Clearing internal buffer.`);
                this.internalBuffer = Buffer.alloc(0);
                break;
            }
            if (this.internalBuffer.length < packetSize) {
                break;
            }
            const packetData = this.internalBuffer.subarray(0, packetSize);
            this.internalBuffer = this.internalBuffer.subarray(packetSize);
            this._processSinglePacket(packetData);
        }
    }

    _processSinglePacket(packetBuffer) {
        try {
            const packetReader = new BinaryReader(packetBuffer);
            packetReader.readUInt32();
            const packetType = packetReader.readUInt16();
            const isZstdCompressed = (packetType & 0x8000) !== 0;
            const msgTypeId = packetType & 0x7fff;
            switch (msgTypeId) {
                case MessageType.Notify: {
                    this._processNotifyMsg(packetReader, isZstdCompressed);
                    break;
                }
                case MessageType.Return: {
                    this._processReturnMsg(packetReader, isZstdCompressed);
                    break;
                }
                case MessageType.FrameDown: {
                    packetReader.readUInt32(); // serverSequenceId
                    if (packetReader.remaining() === 0) {
                        break;
                    }
                    let nestedPacket = packetReader.readRemaining();
                    if (isZstdCompressed) {
                        nestedPacket = this._decompressPayload(nestedPacket);
                    }
                    this.processDataChunk(nestedPacket);
                    break;
                }
                default: {
                    // Silently ignore unknown packet types
                    break;
                }
            }
        } catch (e) {
            // A try-catch block here is helpful for parsing issues
        }
    }
}
