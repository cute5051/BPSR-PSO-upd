const colorHues = [
    210, // Blue
    30, // Orange
    270, // Purple
    150, // Teal
    330, // Magenta
    60, // Yellow
    180, // Cyan
    0, // Red
    240, // Indigo
];

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

let colorIndex = 0;

function getNextColorShades() {
    const h = colorHues[colorIndex];
    colorIndex = (colorIndex + 1) % colorHues.length;
    const s = 90;
    const l_dps = 30;
    const l_hps = 20;

    const dpsColor = `hsl(${h}, ${s}%, ${l_dps}%)`;
    const hpsColor = `hsl(${h}, ${s}%, ${l_hps}%)`;
    return { dps: dpsColor, hps: hpsColor };
}

function getColorByClass(professionId) {
    let dpsColor = `hsla(0, 70%, 37%, 1.00)`;
    switch (professionId) {
        case ProfessionType.HeavyGuardian:
        case ProfessionType.ShieldKnight:
            dpsColor = `hsla(224, 100%, 60%, 1.00)`;
            break;
        case ProfessionType.FireWarrior:
        case ProfessionType.VerdantOracle:
        case ProfessionType.SoulMusician_Scythe:
        case ProfessionType.SoulMusician:
            dpsColor = `hsla(330, 100%, 72%, 1.00)`;
            break;
        case ProfessionType.WindKnight:
        case ProfessionType.Stormblade:
        case ProfessionType.FrostMage:
        case ProfessionType.Marksman:
        case ProfessionType.Marksman_Cannon:
            break;
        default:
            break;
    }
    const hpsColor = `hsla(120, 100%, 39%, 1.00)`;
    return { dps: dpsColor, hps: hpsColor };
}

const appTitle = document.getElementById('appTitle');
const teamDps = document.getElementById('teamDps');
const timerTotal = document.getElementById('timerTotal');
const columnsContainer = document.getElementById('columnsContainer');
const settingsContainer = document.getElementById('settingsContainer');
const passthroughTitle = document.getElementById('passthroughTitle');
const pauseButton = document.getElementById('pauseButton');
const clearButton = document.getElementById('clearButton');
const helpButton = document.getElementById('helpButton');
const settingsButton = document.getElementById('settingsButton');
const closeButton = document.getElementById('closeButton');
const allButtons = [clearButton, pauseButton, settingsButton, closeButton];
const serverStatus = document.getElementById('serverStatus');
const opacitySlider = document.getElementById('opacitySlider');
const skillWindowOpacitySlider = document.getElementById('skillWindowOpacitySlider');
const countBossesCheckbox = document.getElementById('countBossesCheckbox');

let currentTargetUid = null;
let allUsers = {};
let userElements = {};
let userColors = {};
let isPaused = false;
let isPauseProcessData = false;
let socket = null;
let isWebSocketConnected = false;
let lastWebSocketMessage = Date.now();
const WEBSOCKET_RECONNECT_INTERVAL = 5000;

const SERVER_URL = 'localhost:8990';

function formatNumber(num) {
    if (isNaN(num)) return 'NaN';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return Math.round(num).toString();
}

function openSkillDetails(userId, targetUid) {
    console.log('Opening skill details for user:', userId, ' targetuid: ', targetUid);
    window.electronAPI.openSkillDetails(userId, targetUid);
}

function updateTimerTotals(timeInMs) {
    if (timeInMs) {
        const date = new Date(timeInMs);
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        timerTotal.textContent = `${minutes}:${seconds}`;
    } else {
        timerTotal.textContent = '00:00';
    }
}

function updateTeamDps(teamDpsPerSec) {
    if (teamDpsPerSec) {
        teamDps.textContent = `${formatNumber(teamDpsPerSec)}/s`;
    } else {
        teamDps.textContent = '0/s';
    }
}

function updateWindowTitle(bossName) {
    if (bossName) {
        appTitle.textContent = `${bossName}`;
        document.title = `${bossName}`;
    } else {
        appTitle.textContent = 'BPSR-PSO';
        document.title = 'BPSR-PSO';
    }
}

function createUserElement(user, index, totalDamageOverall, totalHealingOverall) {
    if (!userColors[user.id]) {
        userColors[user.id] = getColorByClass(user.professionId);
    }
    const colors = userColors[user.id];

    const item = document.createElement('li');
    item.className = 'data-item clickable';
    item.dataset.userId = user.id;
    item.dataset.targetUid = user.targetUid || '';
    item.addEventListener('click', handleUserClick);

    const damagePercent = totalDamageOverall > 0 ? (user.total_damage.total / totalDamageOverall) * 100 : 0;
    const healingPercent = totalHealingOverall > 0 ? (user.total_healing.total / totalHealingOverall) * 100 : 0;

    const displayName = user.fightPoint ? `${user.name} (${user.fightPoint})` : user.name;

    let classIconHtml = '';
    const professionString = user.profession ? user.profession.trim() : '';
    if (professionString) {
        const mainProfession = professionString.split('(')[0].trim();
        const iconFileName = mainProfession.toLowerCase().replace(/ /g, '_') + '.png';
        classIconHtml = `<img src="assets/${iconFileName}" class="class-icon" alt="${mainProfession}" onerror="this.style.display='none'">`;
    }

    let subBarHtml = '';
    if (user.total_healing.total > 0 || user.total_hps > 0) {
        subBarHtml = `
            <div class="sub-bar">
                <div class="hps-bar-fill" style="width: ${healingPercent}%; background-color: ${colors.hps};"></div>
                <div class="hps-stats">
                   ${formatNumber(user.total_healing.total)} (${formatNumber(user.total_hps)} HPS, ${healingPercent.toFixed(1)}%)
                </div>
            </div>
        `;
    }

    item.innerHTML = `
        <div class="main-bar">
            <div class="dps-bar-fill" style="width: ${damagePercent}%; background-color: ${colors.dps};"></div>
            <div class="content">
                ${classIconHtml}
                <span class="name">${displayName}</span>
                <span class="stats">${formatNumber(user.total_dps)}/s (${formatNumber(user.total_damage.total)}, ${damagePercent.toFixed(1)}%)</span>
                <div class="dead-count-container">
                    <img src="assets/skull.png" class="dead-count-icon" onerror="this.style.display='none'">
                    <span class="dead-count">${user.dead_count}</span>
                </div>
            </div>
        </div>
        ${subBarHtml}
    `;

    return item;
}

function updateUserElement(element, user, index, totalDamageOverall, totalHealingOverall) {
    const colors = userColors[user.id];
    const damagePercent = totalDamageOverall > 0 ? (user.total_damage.total / totalDamageOverall) * 100 : 0;
    const healingPercent = totalHealingOverall > 0 ? (user.total_healing.total / totalHealingOverall) * 100 : 0;

    const displayName = user.fightPoint ? `${user.name} (${user.fightPoint})` : user.name;

    element.dataset.userId = user.id;
    element.dataset.targetUid = user.targetUid || '';

    const rankElement = element.querySelector('.rank');
    if (rankElement) {
        rankElement.textContent = `${index + 1}.`;
    }

    const nameElement = element.querySelector('.name');
    const statsElement = element.querySelector('.stats');
    if (nameElement && statsElement) {
        nameElement.textContent = displayName;
        statsElement.textContent = `${formatNumber(user.total_dps)}/s (${formatNumber(user.total_damage.total)}, ${damagePercent.toFixed(1)}%)`;
    }
    const deadCountElement = element.querySelector('.dead-count');
    if (deadCountElement) {
        deadCountElement.textContent = `${user.dead_count}`;
    }

    const dpsBarFill = element.querySelector('.dps-bar-fill');
    if (dpsBarFill) {
        dpsBarFill.style.width = `${damagePercent}%`;
        dpsBarFill.style.backgroundColor = colors.dps;
    }

    const hpsBarFill = element.querySelector('.hps-bar-fill');
    const hpsStats = element.querySelector('.hps-stats');

    if (user.total_healing.total > 0 || user.total_hps > 0) {
        if (!hpsBarFill) {
            const subBar = document.createElement('div');
            subBar.className = 'sub-bar';
            subBar.innerHTML = `
                <div class="hps-bar-fill" style="width: ${healingPercent}%; background-color: ${colors.hps};"></div>
                <div class="hps-stats">
                   ${formatNumber(user.total_healing.total)} (${formatNumber(user.total_hps)} HPS, ${healingPercent.toFixed(1)}%)
                </div>
            `;
            element.appendChild(subBar);
        } else {
            hpsBarFill.style.width = `${healingPercent}%`;
            hpsBarFill.style.backgroundColor = colors.hps;
            if (hpsStats) {
                hpsStats.textContent = `${formatNumber(user.total_healing.total)} (${formatNumber(user.total_hps)} HPS, ${healingPercent.toFixed(1)}%)`;
            }
        }
    } else if (hpsBarFill) {
        const subBar = element.querySelector('.sub-bar');
        if (subBar) {
            subBar.remove();
        }
    }

    const classIcon = element.querySelector('.class-icon');
    const professionString = user.profession ? user.profession.trim() : '';

    if (professionString) {
        const mainProfession = professionString.split('(')[0].trim();
        const iconFileName = mainProfession.toLowerCase().replace(/ /g, '_') + '.png';

        if (!classIcon) {
            const contentDiv = element.querySelector('.content');
            const rankElement = element.querySelector('.rank');
            const newClassIcon = document.createElement('img');
            newClassIcon.src = `assets/${iconFileName}`;
            newClassIcon.className = 'class-icon';
            newClassIcon.alt = mainProfession;
            newClassIcon.onerror = function () {
                this.style.display = 'none';
            };

            if (contentDiv && rankElement) {
                contentDiv.insertBefore(newClassIcon, rankElement.nextSibling);
            }
        } else {
            classIcon.src = `assets/${iconFileName}`;
            classIcon.alt = mainProfession;
            classIcon.style.display = '';
        }
    } else if (classIcon) {
        classIcon.style.display = 'none';
    }
}

function handleUserClick(event) {
    event.stopPropagation();
    const userId = this.dataset.userId;
    const targetUid = this.dataset.targetUid;
    openSkillDetails(userId, targetUid);
}

function updateAll() {
    const usersArray = Object.values(allUsers).filter(
        (user) => user.total_damage.total > 0 || user.total_healing.total > 0
    );

    const totalDamageOverall = usersArray.reduce((sum, user) => sum + user.total_damage.total, 0);
    const totalHealingOverall = usersArray.reduce((sum, user) => sum + user.total_healing.total, 0);

    usersArray.sort((a, b) => b.total_dps - a.total_dps);

    const currentUserIds = new Set(usersArray.map((user) => user.id));

    Object.keys(userElements).forEach((userId) => {
        if (!currentUserIds.has(userId)) {
            if (userElements[userId] && userElements[userId].parentNode) {
                userElements[userId].remove();
            }
            delete userElements[userId];
            delete userColors[userId];
        }
    });

    usersArray.forEach((user, index) => {
        if (userElements[user.id]) {
            updateUserElement(userElements[user.id], user, index, totalDamageOverall, totalHealingOverall);
        } else {
            userElements[user.id] = createUserElement(user, index, totalDamageOverall, totalHealingOverall);
            columnsContainer.appendChild(userElements[user.id]);
        }
    });

    usersArray.forEach((user, index) => {
        const element = userElements[user.id];
        if (element && element.parentNode) {
            const currentIndex = Array.from(columnsContainer.children).indexOf(element);
            if (currentIndex !== index && currentIndex !== -1) {
                if (index === 0) {
                    columnsContainer.prepend(element);
                } else if (index >= columnsContainer.children.length) {
                    columnsContainer.appendChild(element);
                } else {
                    columnsContainer.insertBefore(element, columnsContainer.children[index]);
                }
            }
        }
    });
}

function processDataUpdate(data) {
    if (isPaused) return;
    if (!data.user) {
        console.warn('Received data without a "user" object:', data);
        return;
    }
    if (Object.keys(data.user).length === 0) {
        return;
    }

    const dataUserIds = new Set(Object.keys(data.user));
    const currentUserIds = new Set(Object.keys(allUsers));
    currentUserIds.forEach((userId) => {
        if (!dataUserIds.has(userId)) {
            delete allUsers[userId];
        }
    });
    const currentUserElementsIds = new Set(Object.keys(userElements));
    currentUserElementsIds.forEach((userId) => {
        if (!dataUserIds.has(userId)) {
            if (userElements[userId] && userElements[userId].parentNode) {
                userElements[userId].remove();
            }
            delete userElements[userId];
            delete userColors[userId];
        }
    });
    let targetName = null;
    let teamDpsPerSec = 0;
    let timeInMs = 0;
    for (const userId in data.user) {
        const newUser = data.user[userId];
        const existingUser = allUsers[userId] || {};
        timeInMs = newUser.lastUpdateTime - newUser.startTime;
        targetName = newUser.targetName;

        const updatedUser = {
            ...existingUser,
            ...newUser,
            id: userId,
        };

        //user dps
        const totalPerSecond = (newUser.total_damage?.total / timeInMs) * 1000 || 0;
        updatedUser.total_dps = totalPerSecond;
        //team dps
        teamDpsPerSec = teamDpsPerSec + totalPerSecond;
        //user hps
        const totalHps = (newUser.total_healing?.total / timeInMs) * 1000 || 0;
        updatedUser.total_hps = totalHps;

        const hasNewValidName = newUser.name && typeof newUser.name === 'string' && newUser.name !== '未知';
        if (hasNewValidName) {
            updatedUser.name = newUser.name;
        } else if (!existingUser.name || existingUser.name === '...') {
            updatedUser.name = '...';
        }

        const hasNewProfession = newUser.profession && typeof newUser.profession === 'string';
        if (hasNewProfession) {
            updatedUser.profession = newUser.profession;
        } else if (!existingUser.profession) {
            updatedUser.profession = '';
        }

        const hasNewFightPoint = newUser.fightPoint !== undefined && typeof newUser.fightPoint === 'number';
        if (hasNewFightPoint) {
            updatedUser.fightPoint = newUser.fightPoint;
        } else if (existingUser.fightPoint === undefined) {
            updatedUser.fightPoint = 0;
        }

        allUsers[userId] = updatedUser;
    }

    updateTeamDps(teamDpsPerSec);
    updateWindowTitle(targetName);
    updateAll();
    updateTimerTotals(timeInMs);
}

function setupAppTitleDropdown() {
    const appTitle = document.getElementById('appTitle');
    const dropdown = document.getElementById('appTitleDropdown');

    if (!appTitle || !dropdown) return;

    // Click handler for app title
    appTitle.addEventListener('click', function (event) {
        event.stopPropagation();
        selectAllTargetsData();
        dropdown.classList.toggle('show');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function (event) {
        if (!appTitle.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    });

    // Prevent dropdown from closing when clicking inside it
    dropdown.addEventListener('click', function (event) {
        event.stopPropagation();
    });
}

function updateAppTitleDropdown(targets) {
    const dropdown = document.getElementById('appTitleDropdown');
    if (!dropdown) return;

    const availableTargets = targets.targets || {};

    dropdown.innerHTML = '';
    Object.entries(availableTargets).forEach(([index, targetData]) => {
        const item = document.createElement('div');
        // item.className = `app-title-dropdown-item ${targetData.targetUid === targetData.currentTargetUid ? 'active' : ''}`;
        item.className = `app-title-dropdown-item active`;
        item.setAttribute('data-target-uid', targetData.targetUid);

        item.innerHTML = `
            <div class="target-info">
                <span class="target-name">${targetData.targetName || 'Unknown Target'}</span>
                <span class="target-uid">${targetData.targetUid}</span>
            </div>
        `;

        item.addEventListener('click', function () {
            selectTargetData(targetData.targetUid);
            dropdown.classList.remove('show');
        });

        dropdown.appendChild(item);
    });

    if (Object.keys(availableTargets).length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'app-title-dropdown-item';
        emptyItem.textContent = 'No targets available';
        emptyItem.style.color = '#b0b0b0';
        emptyItem.style.cursor = 'default';
        dropdown.appendChild(emptyItem);
    }
}

async function selectTargetData(targetUid) {
    isPauseProcessData = true;
    const response = await fetch(`http://${SERVER_URL}/api/data/${targetUid}`);
    const result = await response.json();
    if (result.code === 0) {
        processDataUpdate(result);
    }
}

async function selectAllTargetsData() {
    const response = await fetch(`http://${SERVER_URL}/api/targets`);
    const result = await response.json();
    if (result.code === 0) {
        updateAppTitleDropdown(result);
    }
}

async function clearData() {
    try {
        const currentStatus = getServerStatus();
        showServerStatus('cleared');

        const response = await fetch(`http://${SERVER_URL}/api/clear`);
        const result = await response.json();

        if (result.code === 0) {
            allUsers = {};
            userColors = {};

            Object.values(userElements).forEach((element) => {
                if (element && element.parentNode) {
                    element.remove();
                }
            });
            userElements = {};
            updateTeamDps(undefined);
            updateTimerTotals(undefined);
            console.log('Data cleared successfully.');
        } else {
            console.error('Failed to clear data on server:', result.msg);
        }

        setTimeout(() => showServerStatus(currentStatus), 1000);
    } catch (error) {
        console.error('Error sending clear request to server:', error);
    }
}

function togglePause() {
    isPaused = !isPaused;
    pauseButton.innerText = isPaused ? 'Resume' : 'Pause';
    showServerStatus(isPaused ? 'paused' : 'connected');
}

function closeClient() {
    window.electronAPI.closeClient();
}

async function updateCountBossesSettings() {
    const settings = {
        onlyRecordBoss: countBossesCheckbox.checked,
    };

    try {
        const response = await fetch(`http://${SERVER_URL}/api/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(settings),
        });

        const result = await response.json();
        console.log('Settings saved:', result);

        if (result.code === 0) {
            console.log('Настройки успешно обновлены');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

async function setCountBossesSettings() {
    const response = await fetch(`http://${SERVER_URL}/api/settings`);
    const result = await response.json();
    countBossesCheckbox.checked = result.data.onlyRecordBoss;
}

function showServerStatus(status) {
    const statusElement = document.getElementById('serverStatus');
    statusElement.className = `status-indicator ${status}`;
}

function getServerStatus() {
    const statusElement = document.getElementById('serverStatus');
    return statusElement.className.replace('status-indicator ', '');
}

function connectWebSocket() {
    socket = io(`ws://${SERVER_URL}`);

    socket.on('connect', () => {
        isWebSocketConnected = true;
        showServerStatus('connected');
        lastWebSocketMessage = Date.now();
    });

    socket.on('disconnect', () => {
        isWebSocketConnected = false;
        showServerStatus('disconnected');
    });

    socket.on('data', (data) => {
        if (currentTargetUid !== data.currentTargetUid) {
            isPauseProcessData = false;
        }
        currentTargetUid = data.currentTargetUid;
        if (!isPauseProcessData) {
            processDataUpdate(data);
        }
        lastWebSocketMessage = Date.now();
    });

    socket.on('user_deleted', (data) => {
        console.log(`User ${data.uid} was removed due to inactivity.`);
        delete allUsers[data.uid];
        updateAll();
    });

    socket.on('connect_error', (error) => {
        showServerStatus('disconnected');
        console.error('WebSocket connection error:', error);
    });
}

function checkConnection() {
    if (!isWebSocketConnected && socket && socket.disconnected) {
        showServerStatus('reconnecting');
        socket.connect();
    }

    if (isWebSocketConnected && Date.now() - lastWebSocketMessage > WEBSOCKET_RECONNECT_INTERVAL) {
        isWebSocketConnected = false;
        if (socket) socket.disconnect();
        connectWebSocket();
        showServerStatus('reconnecting');
    }
}

function initialize() {
    connectWebSocket();
    setInterval(checkConnection, WEBSOCKET_RECONNECT_INTERVAL);
    setupAppTitleDropdown();
}

function toggleSettings() {
    const isSettingsVisible = !settingsContainer.classList.contains('hidden');

    if (isSettingsVisible) {
        settingsContainer.classList.add('hidden');
        columnsContainer.classList.remove('hidden');
    } else {
        settingsContainer.classList.remove('hidden');
        columnsContainer.classList.add('hidden');
        helpContainer.classList.add('hidden'); // Also hide help
    }
}

function setBackgroundOpacity(value) {
    document.documentElement.style.setProperty('--main-bg-opacity', value);

    window.electronAPI
        .setMainOpacity(value)
        .then((result) => {
            if (result.success) {
                console.log('Opacity saved to config:', value);
            } else {
                console.error('Failed to save opacity:', result.error);
            }
        })
        .catch((error) => {
            console.error('Error saving opacity:', error);
        });
}
function getBackgroundOpacity() {
    return document.documentElement.style.getPropertyValue('--main-bg-opacity');
}

document.addEventListener('DOMContentLoaded', () => {
    initialize();

    window.electronAPI.onMainOpacity((value) => {
        const opacity = parseFloat(value);
        setBackgroundOpacity(opacity);
        opacitySlider.value = opacity;
    });

    window.electronAPI.onSkillWindowOpacity((value) => {
        const opacity = parseFloat(value);
        skillWindowOpacitySlider.value = opacity;
    });

    opacitySlider.addEventListener('input', (event) => {
        setBackgroundOpacity(event.target.value);
    });

    skillWindowOpacitySlider.addEventListener('input', (event) => {
        const opacity = parseFloat(event.target.value);
        window.electronAPI
            .setSkillWindowOpacity(opacity)
            .then((result) => {
                if (result.success) {
                    console.log('Skill windows opacity saved to config:', opacity);
                } else {
                    console.error('Failed to save skill windows opacity:', result.error);
                }
            })
            .catch((error) => {
                console.error('Error saving skill windows opacity:', error);
            });
    });

    setCountBossesSettings();
    countBossesCheckbox.addEventListener('change', updateCountBossesSettings);

    // Listen for the passthrough toggle event from the main process
    window.electronAPI.onTogglePassthrough((isIgnoring) => {
        if (isIgnoring) {
            allButtons.forEach((button) => {
                button.classList.add('hidden');
            });
            passthroughTitle.classList.remove('hidden');
            columnsContainer.classList.remove('hidden');
            settingsContainer.classList.add('hidden');
        } else {
            allButtons.forEach((button) => {
                button.classList.remove('hidden');
            });
            passthroughTitle.classList.add('hidden');
        }
    });
});

window.clearData = clearData;
window.togglePause = togglePause;
window.toggleSettings = toggleSettings;
window.closeClient = closeClient;
