export class BuffData {
    constructor(tableUuid) {
        this.tableUuid = tableUuid;
        this.buffs = {};
        this.duration = 0;
    }

    addBuff(createTime, durationBuff) {
        this.duration = durationBuff;
        const endTime = createTime + durationBuff;
        buffs = {
                createTime: createTime,
                endTime: endTime,
        }
    }

    closeBuff(now) {
        if (this.buffs.endTime && this.buffs.endTime > now) { 
            this.buffs.endTime = now;
        }
    }

    getBuffInfo() {
        return this.buffs;
    }
}
