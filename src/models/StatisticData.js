export class StatisticData {
    constructor(type, element) {
        this.type = type || '';
        this.element = element || '';
        this.stats = {
            normal: 0,
            normalMin: 0,
            normalAvg: 0,
            normalMax: 0,
            critical: 0,
            criticalMin: 0,
            criticalAvg: 0,
            criticalMax: 0,
            lucky: 0,
            crit_lucky: 0,
            hpLessen: 0,
            total: 0,
        };
        this.count = {
            normal: 0,
            critical: 0,
            lucky: 0,
            total: 0,
        };
        this.realtimeWindow = [];
        this.timeRange = [];
        this.realtimeStats = {
            value: 0,
            max: 0,
        };
    }

    /** 添加数据记录
     * @param {number} value - 数值
     * @param {boolean} isCrit - 是否为暴击
     * @param {boolean} isLucky - 是否为幸运
     * @param {number} hpLessenValue - 生命值减少量（仅伤害使用）
     */
    addRecord(value, isCrit, isLucky, hpLessenValue = 0, startTime) {
        const now = Date.now();

        if (isCrit) {
            if (isLucky) {
                this.stats.crit_lucky += value;
                this.stats.criticalMin = this.stats.criticalMin === 0 ? value : Math.min(this.stats.criticalMin, value);
                this.stats.criticalMax = Math.max(this.stats.criticalMax, value);
            } else {
                this.stats.critical += value;
                this.stats.criticalMin = this.stats.criticalMin === 0 ? value : Math.min(this.stats.criticalMin, value);
                this.stats.criticalMax = Math.max(this.stats.criticalMax, value);
            }
        } else {
            this.stats.normal += value;
            this.stats.normalMin = this.stats.normalMin === 0 ? value : Math.min(this.stats.normalMin, value);
            this.stats.normalMax = Math.max(this.stats.normalMax, value);
        }
        this.stats.total += value;
        this.stats.hpLessen += hpLessenValue;

        if (isCrit) {
            this.count.critical++;
        }
        if (isLucky) {
            this.count.lucky++;
            if (!isCrit) {
                this.count.normal++;
            }
        }
        if (!isCrit && !isLucky) {
            this.count.normal++;
        }
        this.count.total++;

        this.stats.criticalAvg =
            this.count.critical > 0 ? (this.stats.critical + this.stats.crit_lucky) / this.count.critical : 0;
        this.stats.normalAvg = this.count.normal > 0 ? this.stats.normal / this.count.normal : 0;

        this.realtimeWindow.push({
            time: now,
            value,
        });

        if (this.timeRange[0]) {
            this.timeRange[1] = now;
        } else {
            this.timeRange[0] = startTime;
        }
    }

    updateRealtimeStats() {
        const now = Date.now();

        while (this.realtimeWindow.length > 0 && now - this.realtimeWindow[0].time > 1000) {
            this.realtimeWindow.shift();
        }

        this.realtimeStats.value = 0;
        for (const entry of this.realtimeWindow) {
            this.realtimeStats.value += entry.value;
        }

        if (this.realtimeStats.value > this.realtimeStats.max) {
            this.realtimeStats.max = this.realtimeStats.value;
        }
    }

    getTotalPerSecond() {
        if (!this.timeRange[0] || !this.timeRange[1]) {
            return 0;
        }
        const totalPerSecond = (this.stats.total / (this.timeRange[1] - this.timeRange[0])) * 1000 || 0;
        if (!Number.isFinite(totalPerSecond)) return 0;
        return totalPerSecond;
    }

    reset() {
        this.stats = {
            normal: 0,
            critical: 0,
            lucky: 0,
            crit_lucky: 0,
            hpLessen: 0,
            total: 0,
        };
        this.count = {
            normal: 0,
            critical: 0,
            lucky: 0,
            total: 0,
        };
        this.realtimeWindow = [];
        this.timeRange = [];
        this.realtimeStats = {
            value: 0,
            max: 0,
        };
    }
}
