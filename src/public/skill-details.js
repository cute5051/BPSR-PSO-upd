let currentUserId = null;
let playerData = null;
let buffsData = null;
let fightStartTime = null;
let lastUpdateTime = null;
let currentTab = 'damage';

// Different column configurations for each tab
const tabColumns = {
    damage: {
        headers: ['Skill Name', 'Dmg %', 'Total Dmg', 'Hits', 'HPM', 'Crit Rate', 'Crit Min', 'Crit Avg', 'Crit Max', 'Normal Min', 'Normal Avg', 'Normal Max', 'Lucky Rate'],
        types: ['Dmg']
    },
    healing: {
        headers: ['Skill Name', 'Healing %', 'Total Healing', 'Heals', 'HealPM', 'Avg Heal', 'Crit Rate', 'Lucky Rate'],
        types: ['Heal']
    },
    buffs: {
        headers: ['Name', 'Uptime %', 'Uptime in seconds'],
        types: ['Buff']
    },
    all: {
        headers: ['Skill Name', 'Type', 'Total', 'Hits', 'Hits/Min', 'Crit Rate', 'Lucky Rate'],
        types: ['Dmg', 'Heal']
    }
};

function formatNumber(num) {
    if (isNaN(num)) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(3) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return Math.round(num).toString();
}

function calculateStatsPerMinute(totalCount, startTime) {
    const minutes = (lastUpdateTime - startTime) / 60000;
    return minutes > 0 ? (totalCount / minutes).toFixed(1) : '0';
}

function calculateSkillStats(skill) {
    const totalCount = skill.countBreakdown?.total || 0;
    const critCount = skill.countBreakdown?.critical || 0;
    const luckyCount = skill.countBreakdown?.lucky || 0;
    const normalCount = skill.countBreakdown?.normal || 0;
    
    const totalDamage = totalCount > 0 ? skill.damageBreakdown.total : 0;
    const criticalDamage = totalCount > 0 ? skill.damageBreakdown.critical : 0;
    const normalDamage = totalCount > 0 ? skill.damageBreakdown.normal : 0;
    const normalMin = totalCount > 0 ? skill.damageBreakdown.normalMin : 0;
    const normalAvg = totalCount > 0 ? skill.damageBreakdown.normalAvg : 0;
    const normalMax = totalCount > 0 ? skill.damageBreakdown.normalMax : 0;
    const criticalMin = totalCount > 0 ? skill.damageBreakdown.criticalMin : 0;
    const criticalAvg = totalCount > 0 ? skill.damageBreakdown.criticalAvg : 0;
    const criticalMax = totalCount > 0 ? skill.damageBreakdown.criticalMax : 0;
    const critRate = totalCount > 0 ? (critCount / totalCount) * 100 : 0;
    const luckyRate = totalCount > 0 ? (luckyCount / totalCount) * 100 : 0;
    
    return {
        totalDamage,
        criticalDamage,
        normalDamage,
        normalMin,
        normalAvg,
        normalMax,
        criticalMin,
        criticalAvg,
        criticalMax,
        critRate,
        luckyRate,
        totalCount,
        critCount,
        luckyCount,
        normalCount
    };
}

function filterSkillsByTab(skills) {
    const config = tabColumns[currentTab];
    const result = {};
    for (const [typeEnum, skillGroup] of Object.entries(skills)) {
        for (const [skillId, skill] of Object.entries(skillGroup.groupedSkills)) {
            if (!config.types.includes(skill.type)) continue;
            
            let shouldInclude = (skill.totalDamage > 0 || skill.totalCount > 0);
            
            if (shouldInclude) {
                if (!result[typeEnum]) {
                    result[typeEnum] = {
                        name: skillGroup.name,
                        displayIcon: skillGroup.displayIcon,
                        groupedSkills: {},
                    };
                }
                result[typeEnum].groupedSkills[skillId] = skill;
            }
        }
    }
    
    return result;
}

function getTotalForCurrentTab(skills) {
    return skills.reduce((sum, [_, skill]) => sum + skill.totalDamage, 0);
}

function updateTableHeaders() {
    const tableHeader = document.getElementById('skillTableHeader');
    const config = tabColumns[currentTab];
    
    tableHeader.innerHTML = `
        <tr>
            ${config.headers.map(header => `<th>${header}</th>`).join('')}
        </tr>
    `;
}

function renderSkillTable() {
    const tableBody = document.getElementById('skillTableBody');
    const playerName = document.getElementById('playerName');
    const totalInfoElement = document.getElementById('totalInfo');
    
    updateTableHeaders();
    
    if (!playerData || !playerData.skills) {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #b0b0b0;">No skill data available</td></tr>';
        return;
    }
    
    playerName.textContent = `${playerData.name}`;
    
    const skillsWithData = filterSkillsByTab(playerData.skills);
    if (skillsWithData.length === 0) {
        const messages = {
            damage: 'No damage skills used',
            healing: 'No healing skills used', 
            all: 'No skill usage data'
        };
        tableBody.innerHTML = `<tr><td colspan="${tabColumns[currentTab].headers.length}" style="text-align: center; padding: 20px; color: #b0b0b0;">${messages[currentTab]}</td></tr>`;
        return;
    }
    
    tableBody.innerHTML = '';
    
    const professionId = playerData.professionId;

    const sortedGroups = Object.entries(skillsWithData)
        .map(([typeEnum, groupData]) => {
            const groupedSkills = groupData.groupedSkills;
            const groupStats = {
                totalDamage: 0,
                normalDamage: 0,
                criticalDamage: 0,
                totalCount: 0,
                critCount: 0,
                normalCount: 0,
                critRate: 0,
                luckyRate: 0,
                criticalMin: 0,
                criticalAvg: 0,
                criticalMax: 0,
                normalMin: 0,
                normalAvg: 0,
                normalMax: 0
            };
            
            let groupSkillCount = 0;
            
            for (const [skillId, skill] of Object.entries(groupedSkills)) {
                const stats = calculateSkillStats(skill);
                groupStats.totalDamage += stats.totalDamage;
                groupStats.normalDamage += stats.normalDamage;
                groupStats.criticalDamage += stats.criticalDamage;
                groupStats.totalCount += stats.totalCount;
                groupStats.critCount += stats.critCount;
                groupStats.normalCount += stats.normalCount;
                groupStats.critRate += stats.critRate;
                groupStats.luckyRate += stats.luckyRate;
                groupStats.criticalMin = groupStats.criticalMin === 0 ? stats.criticalMin : Math.min(groupStats.criticalMin, stats.criticalMin);
                groupStats.criticalMax = Math.max(groupStats.criticalMax, stats.criticalMax);
                groupStats.normalMin = groupStats.normalMin === 0 ? stats.normalMin : Math.min(groupStats.normalMin, stats.normalMin);
                groupStats.normalMax = Math.max(groupStats.normalMax, stats.normalMax);
                groupSkillCount++;
            }
            
            if (groupSkillCount > 0) {
                groupStats.critRate /= groupSkillCount;
                groupStats.luckyRate /= groupSkillCount;
                groupStats.criticalAvg = groupStats.criticalDamage > 0 ? groupStats.criticalDamage / groupStats.critCount : 0;
                groupStats.normalAvg = groupStats.normalDamage > 0 ? groupStats.normalDamage / groupStats.normalCount : 0;
            }
            
            return {
                typeEnum,
                groupDisplayName: groupData.name,
                groupDisplayIcon: groupData.displayIcon,
                groupedSkills,
                groupStats,
            };
        })
        .sort((a, b) => b.groupStats.totalDamage - a.groupStats.totalDamage); 

    const totalDamage = sortedGroups.reduce((sum, groupData) => sum + groupData.groupStats.totalDamage, 0);

    if (totalInfoElement) {
        if (currentTab === 'damage') {
            totalInfoElement.textContent = `Total Damage: ${formatNumber(totalDamage)}. Fight time(sec): ${((lastUpdateTime - fightStartTime) / 1000).toFixed(2)}`;
        } else if (currentTab === 'healing') {
            totalInfoElement.textContent = `Total Healing: ${formatNumber(totalDamage)}`;
        } else {
            totalInfoElement.textContent = `Total: ${formatNumber(totalDamage)}`;
        }
    }

    for (const group of sortedGroups) {
        const { typeEnum, groupDisplayName, groupDisplayIcon, groupedSkills, groupStats } = group;
        const groupDamagePercent = totalDamage > 0 ? ((groupStats.totalDamage / totalDamage) * 100).toFixed(1) : '0';
        
        const groupRow = document.createElement('tr');
        groupRow.className = 'group-main-row';
        groupRow.setAttribute('data-expanded', 'false');
        groupRow.setAttribute('data-group-type', groupDisplayName);
        
        if (currentTab === 'damage') {
            groupRow.innerHTML = `
                <td class="expand-toggle group-name">
                    <img class="skill-icon skill-icon-circle" width="38" height="38" src="assets/skills/${professionId}/${groupDisplayIcon}">
                    <span class="skill-name">▶ ${groupDisplayName}</span>
                </td>
                <td>${groupDamagePercent}%</td>
                <td>${formatNumber(groupStats.totalDamage)}</td>
                <td>${groupStats.totalCount}</td>
                <td>${calculateStatsPerMinute(groupStats.totalCount, fightStartTime)}</td>
                <td>${groupStats.critRate.toFixed(1)}%</td>
                <td>${formatNumber(groupStats.criticalMin)}</td>
                <td>${formatNumber(groupStats.criticalAvg)}</td>
                <td>${formatNumber(groupStats.criticalMax)}</td>
                <td>${formatNumber(groupStats.normalMin)}</td>
                <td>${formatNumber(groupStats.normalAvg)}</td>
                <td>${formatNumber(groupStats.normalMax)}</td>
                <td>${groupStats.luckyRate.toFixed(1)}%</td>
            `;
        } else if (currentTab === 'healing') {
            groupRow.innerHTML = `
                <td class="expand-toggle group-name">▶ ${groupDisplayName}</td>
                <td>${groupDamagePercent}%</td>
                <td>${formatNumber(groupStats.totalDamage)}</td>
                <td>${groupStats.totalCount}</td>
                <td>${calculateStatsPerMinute(groupStats.totalCount, fightStartTime)}</td>
                <td>${groupStats.critRate.toFixed(1)}%</td>
                <td>${groupStats.luckyRate.toFixed(1)}%</td>
            `;
        } else {
            groupRow.innerHTML = `
                <td class="expand-toggle group-name">▶ ${groupDisplayName}</td>
                <td>${groupDisplayName}</td>
                <td>${formatNumber(groupStats.totalDamage)}</td>
                <td>${groupStats.totalCount}</td>
                <td>${calculateStatsPerMinute(groupStats.totalCount, fightStartTime)}</td>
                <td>${groupStats.critRate.toFixed(1)}%</td>
                <td>${groupStats.luckyRate.toFixed(1)}%</td>
            `;
        }
        const skillNameCell1 = groupRow.querySelector('.skill-name');
        if (skillNameCell1) {
            skillNameCell1.addEventListener('mouseenter', (e) => showSkillTooltip(e, groupedSkills, typeEnum));
            skillNameCell1.addEventListener('mouseleave', hideSkillTooltip);
            skillNameCell1.addEventListener('mousemove', (e) => {
                const tooltip = document.getElementById('skillTooltip');
                if (tooltip && tooltip.classList.contains('show')) {
                    positionTooltip(e, tooltip);
                }
            });
        }
        tableBody.appendChild(groupRow);


        
        const sortedSkills = Object.entries(groupedSkills)
            .sort((a, b) => a[1].totalDamage - b[1].totalDamage);
        
        groupRow.addEventListener('click', function(e) {
            if (e.target.classList.contains('expand-toggle') || e.target.closest('.expand-toggle')) {
                return;
            }
            const isExpanded = this.getAttribute('data-expanded') === 'true';
            const groupType = this.getAttribute('data-group-type');
            
            if (isExpanded) {
                this.setAttribute('data-expanded', 'false');
                // this.querySelector('.expand-toggle').textContent = '▶';
                this.querySelector('.skill-name').textContent = `▶${groupType}`;
                
                const detailRows = this.parentNode.querySelectorAll(`tr.skill-detail-row[data-group-type="${groupType}"]`);
                detailRows.forEach(row => row.remove());
            } else {
                this.setAttribute('data-expanded', 'true');
                // this.querySelector('.expand-toggle').textContent = '▼';
                this.querySelector('.skill-name').textContent = `▼ ${groupType}`;
                
                for (const [skillId, skill] of sortedSkills) {
                    const stats = calculateSkillStats(skill);
                    const damagePercent = totalDamage > 0 ? ((skill.totalDamage / totalDamage) * 100).toFixed(1) : '0';
                    
                    const detailRow = document.createElement('tr');
                    detailRow.className = 'skill-detail-row';
                    detailRow.setAttribute('data-group-type', groupDisplayName);
                    
                    if (currentTab === 'damage') {
                        detailRow.innerHTML = `
                            <td>
                                <img class="skill-icon skill-icon-circle" width="38" height="38" src="assets/skills/${professionId}/${skill.displayIcon}">
                                <span class="skill-name">${skill.displayName || `Skill ${skillId}`}</span>
                            </td>
                            <td>${damagePercent}%</td>
                            <td>${formatNumber(skill.totalDamage)}</td>
                            <td>${stats.totalCount}</td>
                            <td>${calculateStatsPerMinute(stats.totalCount, fightStartTime)}</td>
                            <td>${stats.critRate.toFixed(1)}%</td>
                            <td>${formatNumber(stats.criticalMin)}</td>
                            <td>${formatNumber(stats.criticalAvg)}</td>
                            <td>${formatNumber(stats.criticalMax)}</td>
                            <td>${formatNumber(stats.normalMin)}</td>
                            <td>${formatNumber(stats.normalAvg)}</td>
                            <td>${formatNumber(stats.normalMax)}</td>
                            <td>${stats.luckyRate.toFixed(1)}%</td>
                        `;
                    } else if (currentTab === 'healing') {
                        detailRow.innerHTML = `
                            <td class="skill-name">${skill.displayName || `Skill ${skillId}`}</td>
                            <td>${damagePercent}%</td>
                            <td>${formatNumber(skill.totalDamage)}</td>
                            <td>${stats.totalCount}</td>
                            <td>${calculateStatsPerMinute(stats.totalCount, fightStartTime)}</td>
                            <td>${stats.critRate.toFixed(1)}%</td>
                            <td>${stats.luckyRate.toFixed(1)}%</td>
                        `;
                    } else {
                        detailRow.innerHTML = `
                            <td>${skill.displayName || `Skill ${skillId}`}</td>
                            <td>${skill.type || 'Unknown'}</td>
                            <td>${formatNumber(skill.totalDamage)}</td>
                            <td>${stats.totalCount}</td>
                            <td>${calculateStatsPerMinute(stats.totalCount, fightStartTime)}</td>
                            <td>${stats.critRate.toFixed(1)}%</td>
                            <td>${stats.luckyRate.toFixed(1)}%</td>
                        `;
                    }
                    
                    const skillNameCell = detailRow.querySelector('.skill-name');
                    if (skillNameCell) {
                        skillNameCell.addEventListener('mouseenter', (e) => showSkillTooltip(e, skill, skillId));
                        skillNameCell.addEventListener('mouseleave', hideSkillTooltip);
                        skillNameCell.addEventListener('mousemove', (e) => {
                            const tooltip = document.getElementById('skillTooltip');
                            if (tooltip && tooltip.classList.contains('show')) {
                                positionTooltip(e, tooltip);
                            }
                        });
                    }
                    
                    this.parentNode.insertBefore(detailRow, this.nextSibling);
                }
            }
        });
        
        const expandToggle = groupRow.querySelector('.expand-toggle');
        expandToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            groupRow.click();
        });
    }
}

function renderBuffTable() {
    const tableBody = document.getElementById('skillTableBody');
    const totalInfoElement = document.getElementById('totalInfo');
    
    // Update table headers for buffs tab
    updateTableHeaders();
    
    if (!buffsData || !buffsData.buffs || Object.keys(buffsData.buffs).length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #b0b0b0;">No buff data available</td></tr>';
        if (totalInfoElement) {
            totalInfoElement.textContent = 'Total Buffs: 0';
        }
        return;
    }
    
    const buffs = buffsData.buffs;
    const buffsArray = Object.entries(buffs);
    
    tableBody.innerHTML = '';
    
    // Calculate fight duration for stats
    const fightDurationMs = lastUpdateTime - fightStartTime;
    const fightDurationSeconds = fightDurationMs / 1000;
    
    if (totalInfoElement) {//Total Buffs: ${buffsArray.length}. 
        totalInfoElement.textContent = `Fight time: ${fightDurationSeconds}`;
    }
    
    buffsArray.forEach(([buffId, buff]) => {        
        
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td class="skill-name">${buff.buffName || `Buff ${buffId}`}</td>
            <td>${buff.uptime.toFixed(1)}%</td>
            <td>${(buff.totalUptime / 1000).toFixed(2)}</td>
        `;

        const skillNameCell = row.querySelector('.skill-name');
        if (skillNameCell) {
            skillNameCell.addEventListener('mouseenter', (e) => showSkillTooltip(e, buff, buffId));
            skillNameCell.addEventListener('mouseleave', hideSkillTooltip);
            skillNameCell.addEventListener('mousemove', (e) => {
                const tooltip = document.getElementById('skillTooltip');
                if (tooltip && tooltip.classList.contains('show')) {
                    positionTooltip(e, tooltip);
                }
            });
        }
        
        tableBody.appendChild(row);
    });
}

function showSkillTooltip(event, skill, skillId) {
    const tooltip = document.getElementById('skillTooltip');
    if (!tooltip) return;
    
    // Get skill description - you might need to adjust this based on your data structure
    const description = skill.description || skill.tooltip || skill.buffDesc || 'No description available';
    
    tooltip.innerHTML = `
        <div class="skill-description">${description}</div>
        <div class="skill-id">Skill ID: ${skillId}</div>
    `;
    
    tooltip.classList.add('show');
    
    // Position the tooltip
    positionTooltip(event, tooltip);
}

function hideSkillTooltip() {
    const tooltip = document.getElementById('skillTooltip');
    if (tooltip) {
        tooltip.classList.remove('show');
    }
}

function positionTooltip(event, tooltip) {
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    let x = mouseX + 15;
    let y = mouseY + 15;
    
    // Adjust if tooltip would go off the right edge
    if (x + tooltipWidth > windowWidth) {
        x = mouseX - tooltipWidth - 15;
    }
    
    // Adjust if tooltip would go off the bottom edge
    if (y + tooltipHeight > windowHeight) {
        y = mouseY - tooltipHeight - 15;
    }
    
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
}

function switchTab(tabName) {
    currentTab = tabName;
    
    // Update active tab styling
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
    
    if (tabName != "buffs") {
        renderSkillTable();
    } else {
        window.electronAPI.requestBuffsData({
            userId: currentUserId,
            fightStartTime: fightStartTime,
            lastUpdateTime: lastUpdateTime,
        });
    }
}

function closeWindow() {
    window.close();
}

window.electronAPI.onSkillWindowOpacity((opcaity) => {
    document.documentElement.style.setProperty('--main-bg-opacity', opcaity);
});

window.electronAPI.onBuffsData((data) => {
    buffsData = data;
    if (currentTab === 'buffs') {
        renderBuffTable();
    }
});

window.electronAPI.onSkillDetailsData((data) => {
    currentUserId = data.uid;
    playerData = data;
    fightStartTime = data.fightStartTime || Date.now();
    lastUpdateTime = data.lastUpdateTime || Date.now();
    renderSkillTable();
});

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchTab(this.getAttribute('data-tab'));
        });
    });
    
    renderSkillTable();
});