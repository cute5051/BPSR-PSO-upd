import { StatisticData } from './StatisticData.js';
import skill_names from '../tables/skill_names_en_upd.json' with { type: 'json' };
import damageAttrs from '../tables/DamageAttrTable.json' with { type: 'json' };
import recount_table from '../tables/RecountTable.json' with { type: 'json' };
import logger from '../services/Logger.js';

const skillConfig = skill_names;
const dmgConfig = damageAttrs;
const recountConfig = recount_table;

function getSubProfessionBySkillId(skillId) {
    switch (skillId) {
        case 1241:
            return '(Frostbeam)';
        case 2307:
        case 2361:
        case 55302:
            return '(Concerto)';
        case 20301:
            return '(Lifebind)';
        case 1518:
        case 1541:
        case 21402:
            return '(Smite)';
        case 2306:
            return '(Dissonance)';
        case 120901:
        case 120902:
            return '(Icicle)';
        case 1714:
        case 1734:
            return '(Iaido Slash)';
        case 44701:
        case 179906:
            return '(Moonstrike)';
        case 220112:
        case 2203622:
            return '(Falconry)';
        case 2292:
        case 1700820:
        case 1700825:
        case 1700827:
            return '(Wildpack)';
        case 1419:
            return '(Vanguard)';
        case 1405:
        case 1418:
            return '(Skyward)';
        case 2405:
            return '(Shield)';
        case 2406:
            return '(Recovery)';
        case 199902:
            return '(Earthfort)';
        case 1930:
        case 1931:
        case 1934:
        case 1935:
            return '(Block)';
        default:
            return '';
    }
}

export class UserData {
    constructor(uid) {
        this.uid = uid;
        this.name = '';
        this.damageStats = new StatisticData('Dmg');
        this.healingStats = new StatisticData('Heal');
        this.takenDamage = 0; // 承伤
        this.deadCount = 0; // 死亡次数
        this.profession = '...';
        this.professionId = 0;
        this.skillUsage = new Map(); // 技能使用情况
        this.fightPoint = 0; // 总评分
        this.subProfession = '';
        this.attr = {};
        this.lastUpdateTime = Date.now();
    }

    _touch() {
        this.lastUpdateTime = Date.now();
    }

    /** 添加伤害记录
     * @param {number} skillId - 技能ID/Buff ID
     * @param {string} element - 技能元素属性
     * @param {number} damage - 伤害值
     * @param {boolean} isCrit - 是否为暴击
     * @param {boolean} [isLucky] - 是否为幸运
     * @param {boolean} [isCauseLucky] - 是否造成幸运
     * @param {number} hpLessenValue - 生命值减少量
     */
    addDamage(skillId, element, damage, isCrit, isLucky, isCauseLucky, hpLessenValue = 0, startTime) {
        this._touch();
        this.damageStats.addRecord(damage, isCrit, isLucky, hpLessenValue, startTime);
        // 记录技能使用情况
        if (!this.skillUsage.has(skillId)) {
            this.skillUsage.set(skillId, new StatisticData('Dmg', element));
        }
        this.skillUsage.get(skillId).addRecord(damage, isCrit, isCauseLucky, hpLessenValue);
        this.skillUsage.get(skillId).realtimeWindow.length = 0;

        const subProfession = getSubProfessionBySkillId(skillId);
        if (subProfession) {
            this.setSubProfession(subProfession);
        }
        // logger.info(this.skillUsage);
    }

    /** 添加治疗记录
     * @param {number} skillId - 技能ID/Buff ID
     * @param {string} element - 技能元素属性
     * @param {number} healing - 治疗值
     * @param {boolean} isCrit - 是否为暴击
     * @param {boolean} [isLucky] - 是否为幸运
     * @param {boolean} [isCauseLucky] - 是否造成幸运
     */
    addHealing(skillId, element, healing, isCrit, isLucky, isCauseLucky) {
        this._touch();
        this.healingStats.addRecord(healing, isCrit, isLucky);
        // 记录技能使用情况
        skillId = skillId + 1000000000;
        if (!this.skillUsage.has(skillId)) {
            this.skillUsage.set(skillId, new StatisticData('Heal', element));
        }
        this.skillUsage.get(skillId).addRecord(healing, isCrit, isCauseLucky);
        this.skillUsage.get(skillId).realtimeWindow.length = 0;

        const subProfession = getSubProfessionBySkillId(skillId - 1000000000);
        if (subProfession) {
            this.setSubProfession(subProfession);
        }
    }

    /** 添加承伤记录
     * @param {number} damage - 承受的伤害值
     * @param {boolean} isDead - 是否致死伤害
     * */
    addTakenDamage(damage, isDead) {
        this._touch();
        this.takenDamage += damage;
        if (isDead) {
            this.deadCount++;
        }
    }

    /** 更新实时DPS和HPS 计算过去1秒内的总伤害和治疗 */
    updateRealtimeDps() {
        this.damageStats.updateRealtimeStats();
        this.healingStats.updateRealtimeStats();
    }

    /** 计算总DPS */
    getTotalDps() {
        return this.damageStats.getTotalPerSecond();
    }

    /** 计算总HPS */
    getTotalHps() {
        return this.healingStats.getTotalPerSecond();
    }

    /** 获取合并的次数统计 */
    getTotalCount() {
        return {
            normal: this.damageStats.count.normal + this.healingStats.count.normal,
            critical: this.damageStats.count.critical + this.healingStats.count.critical,
            lucky: this.damageStats.count.lucky + this.healingStats.count.lucky,
            total: this.damageStats.count.total + this.healingStats.count.total,
        };
    }

    /** 获取用户数据摘要 */
    getSummary() {
        return {
            realtime_dps: this.damageStats.realtimeStats.value,
            realtime_dps_max: this.damageStats.realtimeStats.max,
            total_dps: this.getTotalDps(),
            total_damage: { ...this.damageStats.stats },
            total_count: this.getTotalCount(),
            realtime_hps: this.healingStats.realtimeStats.value,
            realtime_hps_max: this.healingStats.realtimeStats.max,
            total_hps: this.getTotalHps(),
            total_healing: { ...this.healingStats.stats },
            taken_damage: this.takenDamage,
            profession: this.profession + (this.subProfession ? ` ${this.subProfession}` : ''),
            professionId: this.professionId,
            name: this.name,
            fightPoint: this.fightPoint,
            hp: this.attr.hp,
            max_hp: this.attr.max_hp,
            dead_count: this.deadCount,
        };
    }

    /** 获取技能统计数据 */
    getSkillSummary() {
        const skills = {};
        for (const [skillId, stat] of this.skillUsage) {
            const critCount = stat.count.critical;
            const luckyCount = stat.count.lucky;
            const critRate = stat.count.total > 0 ? critCount / stat.count.total : 0;
            const luckyRate = stat.count.total > 0 ? luckyCount / stat.count.total : 0;
            const name = skillConfig[skillId % 1000000000]?.name ?? skillId % 1000000000;
            const icon = skillConfig[skillId % 1000000000]?.icon ?? skillId % 1000000000;
            const elementype = stat.element;

            skills[skillId] = {
                displayName: name,
                displayIcon: icon,
                type: stat.type,
                elementype: elementype,
                totalDamage: stat.stats.total,
                totalCount: stat.count.total,
                critCount: stat.count.critical,
                luckyCount: stat.count.lucky,
                critRate: critRate,
                luckyRate: luckyRate,
                damageBreakdown: { ...stat.stats },
                countBreakdown: { ...stat.count },
            };
        }
        return skills;
    }

    getSkillSummaryV2() {
        const temp = structuredClone(this.skillUsage);
        const result = {};
        for (const [recountId, recountData] of Object.entries(recountConfig)) {
            const damageBreakdown = {};
            let firstIcon;
            for (const damageId of recountData.DamageId) {
                const damageAttr = dmgConfig[damageId];

                if (damageAttr && damageAttr.TypeEnum) {
                    const typeEnum = damageAttr.TypeEnum;

                    if (temp.has(typeEnum)) {
                        const stat = temp.get(typeEnum);
                        const critCount = stat.count.critical;
                        const luckyCount = stat.count.lucky;
                        const critRate = stat.count.total > 0 ? critCount / stat.count.total : 0;
                        const luckyRate = stat.count.total > 0 ? luckyCount / stat.count.total : 0;
                        const name = skillConfig[typeEnum % 1000000000]?.name ?? typeEnum % 1000000000;
                        const icon = skillConfig[typeEnum % 1000000000]?.icon;
                        if (icon && !firstIcon) firstIcon = icon;
                        const elementype = stat.element;

                        damageBreakdown[typeEnum] = {
                            displayName: name,
                            displayIcon: icon,
                            type: stat.type,
                            elementype: elementype,
                            totalDamage: stat.stats.total,
                            totalCount: stat.count.total,
                            critCount: stat.count.critical,
                            luckyCount: stat.count.lucky,
                            critRate: critRate,
                            luckyRate: luckyRate,
                            damageBreakdown: { ...stat.stats },
                            countBreakdown: { ...stat.count },
                        };
                        temp.delete(typeEnum);
                    }
                }
            }

            if (Object.keys(damageBreakdown).length > 0) {
                const icon = skillConfig[recountId % 1000000000]?.icon ?? firstIcon;
                result[recountId] = {
                    groupedSkills: damageBreakdown,
                    name: recountData.RecountName,
                    displayIcon: icon,
                };
            }
        }
        for (const [skillId, stat] of temp) {
            const skills = {};
            const critCount = stat.count.critical;
            const luckyCount = stat.count.lucky;
            const critRate = stat.count.total > 0 ? critCount / stat.count.total : 0;
            const luckyRate = stat.count.total > 0 ? luckyCount / stat.count.total : 0;
            const name = skillConfig[skillId % 1000000000]?.name ?? skillId % 1000000000;
            const icon = skillConfig[skillId % 1000000000]?.icon ?? '';
            const elementype = stat.element;

            skills[skillId] = {
                displayName: name,
                displayIcon: icon,
                type: stat.type,
                elementype: elementype,
                totalDamage: stat.stats.total,
                totalCount: stat.count.total,
                critCount: stat.count.critical,
                luckyCount: stat.count.lucky,
                critRate: critRate,
                luckyRate: luckyRate,
                damageBreakdown: { ...stat.stats },
                countBreakdown: { ...stat.count },
            };
            result[skillId] = {
                groupedSkills: skills,
                name: name,
                displayIcon: icon,
            };
        }

        // for (const [typeEnum, skillData] of this.skillUsage.entries()) {
        //     let flag = false;
        //     for (const [recountId, damageBreakdown] of Object.entries(result)) {
        //         for (const id of Object.keys(result[recountId].groupedSkills)) {
        //             if (typeEnum === id) {
        //                 flag = true;
        //             }
        //         }
        //     }
        //     if (!flag) {
        //         logger.info(`!pipyao! ${typeEnum}`);
        //         logger.info(skillData);
        //     }
        // }

        return result;
    }

    /** 设置职业
     * @param {string} profession - 职业名称
     * */
    setProfession(profession) {
        this._touch();
        if (profession !== this.profession) {
            this.setSubProfession('');
        }
        this.profession = profession;
    }

    /**
     * @param {int} professionId - class id
     * */
    setProfessionId(professionId) {
        this._touch();
        this.professionId = professionId;
    }

    /** 设置子职业
     * @param {string} subProfession - 子职业名称
     * */
    setSubProfession(subProfession) {
        this._touch();
        this.subProfession = subProfession;
    }

    /** 设置姓名
     * @param {string} name - 姓名
     * */
    setName(name) {
        this._touch();
        this.name = name;
    }

    /** 设置用户总评分
     * @param {number} fightPoint - 总评分
     * */
    setFightPoint(fightPoint) {
        this._touch();
        this.fightPoint = fightPoint;
    }

    /** 设置额外数据
     * @param {string} key
     * @param {any} value
     * */
    setAttrKV(key, value) {
        this._touch();
        this.attr[key] = value;
    }

    /** 重置数据 预留 */
    reset() {
        this.damageStats.reset();
        this.healingStats.reset();
        this.takenDamage = 0;
        this.skillUsage.clear();
        this.fightPoint = 0;
        this._touch();
    }
}
