// 📡 註冊 PWA 離線小管家神經 (GitHub Pages 絕對路徑定案版)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // 自動偵測是不是在 GitHub Pages 上，如果是就自動補上專案名稱路徑
        const isGitHubPages = window.location.hostname.includes('github.io');
        const swPath = isGitHubPages ? '/moecar-journal/sw.js' : './sw.js';
        const swScope = isGitHubPages ? '/moecar-journal/' : './';

        navigator.serviceWorker.register(swPath, { scope: swScope })
            .then(reg => console.log('📡 萌車日記離線小管家註冊成功！ Scope 是:', reg.scope))
            .catch(err => console.log('😢 小管家罷工了：', err));
    });
}
import { MoeCarDB } from './database.js';

const db = new MoeCarDB();
let currentVehicleId = null;

// 就地編輯狀態機控制變數
let isEditingFuelLog = false;
let editingFuelLogId = null;

let isEditingServiceLog = false;
let editingServiceLogId = null;

window.addEventListener('DOMContentLoaded', async () => {
    await db.init();
    initApp();
});

async function initApp() {
    // 1. 導覽列切換
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => { switchPage(item.dataset.page); });
    });

    // 2. 綁定按鈕事件
    if (document.getElementById('btn-save-vehicle')) document.getElementById('btn-save-vehicle').addEventListener('click', handleSaveVehicle);
    if (document.getElementById('btn-new-vehicle')) document.getElementById('btn-new-vehicle').addEventListener('click', prepareNewVehicleForm);
    if (document.getElementById('btn-delete-vehicle')) document.getElementById('btn-delete-vehicle').addEventListener('click', handleDeleteVehicle);

    // 補給頁按鈕群
    if (document.getElementById('btn-save-fuel')) document.getElementById('btn-save-fuel').addEventListener('click', handleSaveFuel);
    if (document.getElementById('btn-delete-fuel')) document.getElementById('btn-delete-fuel').addEventListener('click', handleDeleteFuelLog);
    if (document.getElementById('btn-cancel-fuel-edit')) document.getElementById('btn-cancel-fuel-edit').addEventListener('click', resetFuelForm);

    // 沙龍頁按鈕群
    if (document.getElementById('btn-save-service')) document.getElementById('btn-save-service').addEventListener('click', handleSaveService);
    if (document.getElementById('btn-delete-service')) document.getElementById('btn-delete-service').addEventListener('click', handleDeleteServiceLog);
    if (document.getElementById('btn-cancel-service-edit')) document.getElementById('btn-cancel-service-edit').addEventListener('click', resetServiceForm);
    
    // 備份與還原
    if (document.getElementById('btn-export-json')) document.getElementById('btn-export-json').addEventListener('click', handleExportData);
    if (document.getElementById('btn-import-json')) {
        document.getElementById('btn-import-json').addEventListener('click', () => {
            const fi = document.getElementById('file-import-input'); if (fi) fi.click();
        });
    }
    if (document.getElementById('file-import-input')) document.getElementById('file-import-input').addEventListener('change', handleImportData);
    if (document.getElementById('v-type')) document.getElementById('v-type').addEventListener('change', (e) => { toggleSettingsFormFields(e.target.value); });

    // 🐾 主下拉選單切換
    const vSelect = document.getElementById('vehicleSelect');
    if (vSelect) {
        vSelect.addEventListener('change', async (e) => {
            currentVehicleId = e.target.value;
            resetFuelForm();
            resetServiceForm();
            await refreshHomeData();
            await refreshServicePage();
            await refreshStatsPage();
            
            const activePage = document.querySelector('.page.active');
            if (activePage && activePage.id === 'page-settings' && currentVehicleId) {
                loadVehicleToForm(currentVehicleId);
            }
        });
    }

    resetFuelForm();
    resetServiceForm();
    await refreshVehicleList();

    // 核心點擊監聽：點擊歷史紀錄卡片，原地觸發時空倒流編輯
    document.addEventListener('click', async (e) => {
        const fuelItem = e.target.closest('.fuel-log-item');
        if (fuelItem) { const id = fuelItem.dataset.id; if (id) await loadFuelLogToForm(id); }

        const serviceItem = e.target.closest('.service-log-item');
        if (serviceItem) { const id = serviceItem.dataset.id; if (id) await loadServiceLogToForm(id); }
    });
}

function toggleSettingsFormFields(type) {
    const tankEl = document.getElementById('v-wrapper-tank'); const battEl = document.getElementById('v-wrapper-battery');
    if (!tankEl || !battEl) return;
    if (type === 'Gasoline') { tankEl.style.display = 'block'; battEl.style.display = 'none'; } 
    else if (type === 'EV') { tankEl.style.display = 'none'; battEl.style.display = 'block'; } 
    else if (type === 'PHEV') { tankEl.style.display = 'block'; battEl.style.display = 'block'; }
}

function toggleFuelFormFields(type) {
    const gasWrapper = document.getElementById('f-wrapper-gas'); const elecWrapper = document.getElementById('f-wrapper-elec');
    if (!gasWrapper || !elecWrapper) return;
    if (type === 'Gasoline') { gasWrapper.style.display = 'block'; elecWrapper.style.display = 'none'; } 
    else if (type === 'EV') { gasWrapper.style.display = 'none'; elecWrapper.style.display = 'block'; } 
    else if (type === 'PHEV') { gasWrapper.style.display = 'block'; elecWrapper.style.display = 'block'; }
}

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    const targetPage = document.getElementById(`page-${pageId}`);
    const targetNav = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (targetPage && targetNav) { targetPage.classList.add('active'); targetNav.classList.add('active'); }
    if (pageId === 'settings') { if (currentVehicleId) { loadVehicleToForm(currentVehicleId); } else { prepareNewVehicleForm(); } }
    if (pageId === 'service') { refreshServicePage(); }
    if (pageId === 'stats') { refreshStatsPage(); }
}

async function refreshVehicleList() {
    const vehicles = await db.getAllVehicles(); const selector = document.getElementById('vehicleSelect'); if (!selector) return;
    selector.innerHTML = '';
    if (vehicles.length === 0) {
        selector.innerHTML = `<option value="">🐾 趕快去小窩登記車車</option>`;
        document.getElementById('home-car-name').innerText = '還沒有車車夥伴喔';
        document.getElementById('home-car-odo').innerText = '請到「小窩」領養一輛車車';
        currentVehicleId = null; return;
    }
    vehicles.forEach(v => { const opt = document.createElement('option'); opt.value = v.id; opt.innerText = v.name; selector.appendChild(opt); });
    if (!currentVehicleId || !vehicles.some(v => v.id == currentVehicleId)) { currentVehicleId = vehicles[0].id; }
    selector.value = currentVehicleId;
    await refreshHomeData();
}

// 🌟 新增：計算並刷新表單上「前次里程提示」的智慧核心
async function updateLastOdoTips(curCar) {
    if (!curCar) return;
    const fuelLogs = await db.getEnergyLogsByVehicle(currentVehicleId);
    
    // 日常補給前次里程：有紀錄就拿最新一筆，沒紀錄就拿初始相遇里程
    const lastFuelOdo = fuelLogs.length > 0 ? fuelLogs[0].odo : curCar.initOdo;
    const fTipEl = document.getElementById('f-last-odo-tip');
    if (fTipEl) fTipEl.innerText = `(前次里程: ${Number(lastFuelOdo).toLocaleString()} km)`;

    // 保養沙龍前次里程：同樣動態連動
    const serviceLogs = await db.getMaintenanceLogsByVehicle(currentVehicleId);
    const lastServiceOdo = serviceLogs.length > 0 ? serviceLogs[0].odo : curCar.initOdo;
    const sTipEl = document.getElementById('s-last-odo-tip');
    if (sTipEl) sTipEl.innerText = `(前次保養: ${Number(lastServiceOdo).toLocaleString()} km)`;
}

async function refreshHomeData() {
    if (!currentVehicleId) return;
    const vehicles = await db.getAllVehicles(); const curCar = vehicles.find(v => v.id == currentVehicleId);
    if (curCar) {
        toggleFuelFormFields(curCar.type);
        
        // 🌟 智慧灌注前次里程小字體
        await updateLastOdoTips(curCar);

        const fuelLogs = await db.getEnergyLogsByVehicle(currentVehicleId);
        const serviceLogs = await db.getMaintenanceLogsByVehicle(currentVehicleId);
        const latestOdo = fuelLogs.length > 0 ? fuelLogs[0].odo : curCar.initOdo;
        document.getElementById('home-car-name').innerText = curCar.name;
        document.getElementById('home-car-odo').innerText = `總里程 ${Number(latestOdo).toLocaleString()} km`;

        const baseOdoForService = serviceLogs.length > 0 ? serviceLogs[0].odo : curCar.initOdo;
        const countdown = (baseOdoForService + 10000) - latestOdo;
        const countdownEl = document.getElementById('home-spa-countdown');
        if (countdownEl) {
            if (countdown <= 0) { countdownEl.innerHTML = `<span style="color:#D37575;">該去保養囉！⚠️</span>`; } 
            else { countdownEl.innerText = `${Number(countdown).toLocaleString()} km`; }
        }

        const recentDiv = document.getElementById('home-recent-logs');
        if (recentDiv) {
            if (fuelLogs.length === 0) { recentDiv.innerHTML = `暫時沒有紀錄，等主人餵我吃第一餐～`; } 
            else {
                recentDiv.innerHTML = fuelLogs.slice(0, 3).map(log => {
                    let text = `🎵 <b>${log.date}</b> | `;
                    if (log.gasAmount > 0) text += `⛽ ${log.gasAmount} L `;
                    if (log.elecAmount > 0) text += `⚡ ${log.elecAmount} kWh `;
                    text += `| 花了 $${(log.gasCost || 0) + (log.elecCost || 0)}<br>`;
                    text += `<span style="font-size: 11px; color:#A476D3; font-weight:bold;">🛠️ 點擊卡片：直接在上方表單修改/刪除</span>`;
                    return `<div class="fuel-log-item" data-id="${log.id}" style="padding: 10px; margin: 5px 0; border: 2px solid #FFE5E5; border-radius:14px; cursor: pointer; background:#FFF; transition: all 0.2s;" onmouseover="this.style.borderColor='#FFB3B3';this.style.background='#FFFDFB';" onmouseout="this.style.borderColor='#FFE5E5';this.style.background='#FFF';">${text}</div>`;
                }).join('');
            }
        }
    }
}

async function refreshServicePage() {
    if (!currentVehicleId) return;
    const logs = await db.getMaintenanceLogsByVehicle(currentVehicleId);
    const historyDiv = document.getElementById('service-history-logs'); if (!historyDiv) return;

    if (logs.length === 0) { historyDiv.innerHTML = `車車目前還沒做過 SPA 唷～`; } 
    else {
        historyDiv.innerHTML = logs.map(log => `
            <div class="service-log-item" data-id="${log.id}" style="padding: 10px; margin: 6px 0; border: 2px solid #E8D3FF; border-radius:14px; cursor: pointer; background:#FFF; transition: all 0.2s;" onmouseover="this.style.borderColor='#C7B0DE';this.style.background='#FDFBFF';" onmouseout="this.style.borderColor='#E8D3FF';this.style.background='#FFF';">
                ✨ <b>${log.date}</b> | 里程: ${Number(log.odo).toLocaleString()} km<br>
                <span style="font-size: 14px; color:#654E46; font-weight:bold;">項目: ${log.items}</span> — 花費: <span style="color:#A476D3; font-weight:bold;">$${log.cost}</span>
                <br><span style="font-size: 11px; color:#A476D3; font-weight:bold;">🛠️ 點擊卡片：直接在上方表單修改/刪除</span>
            </div>
        `).join('');
    }
}

// 大數據分析引擎
async function refreshStatsPage() {
    if (!currentVehicleId) return;
    const vehicles = await db.getAllVehicles(); const curCar = vehicles.find(v => v.id == currentVehicleId); if (!curCar) return;
    const fuelLogs = await db.getEnergyLogsByVehicle(currentVehicleId); const serviceLogs = await db.getMaintenanceLogsByVehicle(currentVehicleId);

    let totalFuelCost = 0, totalGasLiters = 0, totalEleckWh = 0;
    fuelLogs.forEach(log => { totalFuelCost += (log.gasCost || 0) + (log.elecCost || 0); totalGasLiters += (log.gasAmount || 0); totalEleckWh += (log.elecAmount || 0); });

    let totalServiceCost = 0; serviceLogs.forEach(log => { totalServiceCost += log.cost; });
    const totalRunningCost = totalFuelCost + totalServiceCost;
    const latestOdo = fuelLogs.length > 0 ? fuelLogs[0].odo : curCar.initOdo; const totalDistance = latestOdo - curCar.initOdo;

    let costPerDay = 0; const allDates = [...fuelLogs, ...serviceLogs].map(l => new Date(l.date).getTime());
    if (allDates.length > 0) {
        const diffDays = Math.max(1, Math.ceil((Math.max(...allDates) - Math.min(...allDates)) / (1000 * 60 * 60 * 24)));
        costPerDay = totalRunningCost / diffDays;
    }
    const costPerKm = totalDistance > 0 ? (totalRunningCost / totalDistance) : 0;

    let sumGasEcon = 0, validGasCount = 0, maxGas = 0, minGas = Infinity; let sumElecEcon = 0, validEleccount = 0;
    const revLogs = [...fuelLogs].reverse();
    for (let i = 1; i < revLogs.length; i++) {
        const cur = revLogs[i]; const prev = revLogs[i - 1]; if (cur.isMissed) continue; const dist = cur.odo - prev.odo;
        if (dist > 0) {
            if (cur.gasAmount > 0) { const econ = dist / cur.gasAmount; sumGasEcon += econ; validGasCount++; if (econ > maxGas) maxGas = econ; if (econ < minGas) minGas = econ; }
            if (cur.elecAmount > 0) { sumElecEcon += (dist / cur.elecAmount); validEleccount++; }
        }
    }
    if (minGas === Infinity) minGas = 0;

    if(document.getElementById('st-total-running')) document.getElementById('st-total-running').innerText = `$${totalRunningCost.toLocaleString()}`;
    if(document.getElementById('st-cost-day')) document.getElementById('st-cost-day').innerText = `$${costPerDay.toFixed(2)}`;
    if(document.getElementById('st-cost-km')) document.getElementById('st-cost-km').innerText = `$${costPerKm.toFixed(2)}`;
    if(document.getElementById('st-total-dist')) document.getElementById('st-total-dist').innerText = `${totalDistance.toLocaleString()} km`;
    if(document.getElementById('st-avg-fuel')) document.getElementById('st-avg-fuel').innerText = validGasCount > 0 ? `${(sumGasEcon/validGasCount).toFixed(2)} km/L` : 'N/A';
    if(document.getElementById('st-max-fuel')) document.getElementById('st-max-fuel').innerText = maxGas > 0 ? `${maxGas.toFixed(2)} km/L` : 'N/A';
    if(document.getElementById('st-min-fuel')) document.getElementById('st-min-fuel').innerText = minGas > 0 ? `${minGas.toFixed(2)} km/L` : 'N/A';
    if(document.getElementById('st-avg-elec')) document.getElementById('st-avg-elec').innerText = validEleccount > 0 ? `${(sumElecEcon/validEleccount).toFixed(2)} km/kWh` : 'N/A';
    if(document.getElementById('st-total-fuel-cost')) document.getElementById('st-total-fuel-cost').innerText = `$${totalFuelCost.toLocaleString()}`;
    if(document.getElementById('st-total-fuel-liters')) document.getElementById('st-total-fuel-liters').innerText = `${totalGasLiters.toFixed(2)} L`;
    if(document.getElementById('st-total-fuel-kwh')) document.getElementById('st-total-fuel-kwh').innerText = `${totalEleckWh.toFixed(2)} kWh`;
    if(document.getElementById('st-total-service')) document.getElementById('st-total-service').innerText = `$${totalServiceCost.toLocaleString()}`;
    if(document.getElementById('st-service-count')) document.getElementById('st-service-count').innerText = `${serviceLogs.length} 次`;
}

// 🏡 車輛維護控制
let isEditingVehicle = true;
async function handleSaveVehicle() {
    const name = document.getElementById('v-name').value; const model = document.getElementById('v-model').value; const type = document.getElementById('v-type').value;
    const tank = Number(document.getElementById('v-tank').value) || 0; const battery = Number(document.getElementById('v-battery').value) || 0;
    const odo = document.getElementById('v-odo').value; const price = document.getElementById('v-price').value;
    if (!name || !model || odo === '') { alert('💡 咦？資料要填完整唷！'); return; }
    const carData = { name, model, type, tank, battery, initOdo: Number(odo) || 0, price: Number(price) || 0, timestamp: Date.now() };
    if (isEditingVehicle && currentVehicleId) { carData.id = Number(currentVehicleId); await db.updateVehicle(carData); alert(`🎉 成功更新【${name}】的資料！`); } 
    else { currentVehicleId = await db.addVehicle(carData); alert(`🎉 成功迎娶新車車【${name}】！`); }
    await refreshVehicleList(); switchPage('fuel');
}

async function loadVehicleToForm(vehicleId) {
    const vehicles = await db.getAllVehicles(); const car = vehicles.find(v => v.id == vehicleId);
    if (car) {
        isEditingVehicle = true; document.getElementById('settings-title').innerText = '🏡 維護車車資料';
        document.getElementById('v-name').value = car.name; document.getElementById('v-model').value = car.model; document.getElementById('v-type').value = car.type;
        document.getElementById('v-tank').value = car.tank || ''; document.getElementById('v-battery').value = car.battery || '';
        document.getElementById('v-odo').value = car.initOdo; document.getElementById('v-price').value = car.price || '';
        document.getElementById('btn-save-vehicle').innerText = '確認修改儲存 💾'; toggleSettingsFormFields(car.type);
        if (document.getElementById('btn-delete-vehicle')) document.getElementById('btn-delete-vehicle').style.display = 'block';
    }
}

function prepareNewVehicleForm() {
    isEditingVehicle = false; document.getElementById('settings-title').innerText = '🏡 領養新車車座騎';
    document.getElementById('v-name').value = ''; document.getElementById('v-model').value = ''; document.getElementById('v-type').value = 'Gasoline';
    document.getElementById('v-tank').value = ''; document.getElementById('v-battery').value = ''; document.getElementById('v-odo').value = ''; document.getElementById('v-price').value = '';
    document.getElementById('btn-save-vehicle').innerText = '確認迎娶入庫 🏠'; toggleSettingsFormFields('Gasoline');
    if (document.getElementById('btn-delete-vehicle')) document.getElementById('btn-delete-vehicle').style.display = 'none';
}

// ==========================================
// 🚀 補給日常點心「就地時空還原」機制 (免彈窗)
// ==========================================
async function loadFuelLogToForm(logId) {
    const transaction = db.db.transaction('energy', 'readonly');
    const store = transaction.objectStore('energy');
    const log = await new Promise(res => { const req = store.get(Number(logId)); req.onsuccess = () => res(req.result); });
    if (!log) return;

    isEditingFuelLog = true;
    editingFuelLogId = log.id;

    document.getElementById('fuel-form-title').innerText = '⚙️ 修改此筆日常補給';
    document.getElementById('btn-cancel-fuel-edit').style.display = 'block';
    document.getElementById('btn-delete-fuel').style.display = 'block';
    document.getElementById('btn-save-fuel').innerText = '確認修改此筆 💾';
    document.getElementById('btn-save-fuel').style.backgroundColor = 'var(--mint)';

    document.getElementById('f-date').value = log.date;
    document.getElementById('f-odo').value = log.odo;
    document.getElementById('f-isFull').checked = log.isFull;
    document.getElementById('f-isMissed').checked = log.isMissed;
    document.getElementById('f-note').value = log.note || '';

    if (document.getElementById('f-gas-type')) document.getElementById('f-gas-type').value = log.gasType || '95';
    if (document.getElementById('f-gas-amount')) document.getElementById('f-gas-amount').value = log.gasAmount || '';
    if (document.getElementById('f-gas-cost')) document.getElementById('f-gas-cost').value = log.gasCost || '';
    if (document.getElementById('f-elec-amount')) document.getElementById('f-elec-amount').value = log.elecAmount || '';
    if (document.getElementById('f-elec-cost')) document.getElementById('f-elec-cost').value = log.elecCost || '';

    document.getElementById('fuel-form-card').scrollIntoView({ behavior: 'smooth' });
}

function resetFuelForm() {
    isEditingFuelLog = false;
    editingFuelLogId = null;

    document.getElementById('fuel-form-title').innerText = '✏️ 記下一筆日常補給';
    document.getElementById('btn-cancel-fuel-edit').style.display = 'none';
    document.getElementById('btn-delete-fuel').style.display = 'none';
    document.getElementById('btn-save-fuel').innerText = '餵飽並保存 🛠️';
    document.getElementById('btn-save-fuel').style.backgroundColor = 'var(--primary)';

    document.getElementById('f-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('f-odo').value = '';
    document.getElementById('f-isFull').checked = true;
    document.getElementById('f-isMissed').checked = false;
    document.getElementById('f-note').value = '';
    if (document.getElementById('f-gas-amount')) document.getElementById('f-gas-amount').value = '';
    if (document.getElementById('f-gas-cost')) document.getElementById('f-gas-cost').value = '';
    if (document.getElementById('f-elec-amount')) document.getElementById('f-elec-amount').value = '';
    if (document.getElementById('f-elec-cost')) document.getElementById('f-elec-cost').value = '';
    
    // 重置時重新整理前次里程小提示
    db.getAllVehicles().then(vehicles => {
        const curCar = vehicles.find(v => v.id == currentVehicleId);
        if (curCar) updateLastOdoTips(curCar);
    });
}

async function handleSaveFuel() {
    if (!currentVehicleId) { alert('💡 請先去小窩迎娶車車唷！'); return; }
    const date = document.getElementById('f-date').value; const odo = Number(document.getElementById('f-odo').value);
    const isFull = document.getElementById('f-isFull').checked; const isMissed = document.getElementById('f-isMissed').checked; const note = document.getElementById('f-note').value;
    const gasType = document.getElementById('f-gas-type').value; const gasAmount = Number(document.getElementById('f-gas-amount').value) || 0; const gasCost = Number(document.getElementById('f-gas-cost').value) || 0;
    const elecAmount = Number(document.getElementById('f-elec-amount').value) || 0; const elecCost = Number(document.getElementById('f-elec-cost').value) || 0;

    if (!date || !odo) { alert('💡 日期或里程格子漏掉囉！'); return; }

    const vehicles = await db.getAllVehicles();
    const curCar = vehicles.find(v => v.id == currentVehicleId);
    
    // 1. 初次里程防線
    if (curCar && odo < curCar.initOdo) {
        alert(`🚨 里程時空混亂！\n目前的總里程數 (${odo} km) 不能比這台車車「初次相遇的里程」(${curCar.initOdo} km) 還要少唷！😭`);
        return;
    }

    // 2. 交叉時間序列與里程連動防線
    const existingLogs = await db.getEnergyLogsByVehicle(currentVehicleId);
    const inputTime = new Date(date).getTime();

    for (let log of existingLogs) {
        if (isEditingFuelLog && log.id === Number(editingFuelLogId)) continue;
        const logTime = new Date(log.date).getTime();
        
        if (inputTime > logTime && odo < log.odo) {
            alert(`🚨 時空矛盾！\n你輸入的日期 (${date}) 比過去的紀錄 (${log.date}) 還要晚，但是里程數 (${odo} km) 卻比該筆舊紀錄 (${log.odo} km) 還要少！`);
            return;
        } 
        if (inputTime < logTime && odo > log.odo) {
            alert(`🚨 時空矛盾！\n你輸入的日期 (${date}) 比未來的紀錄 (${log.date}) 還要早，但是里程數 (${odo} km) 卻比該筆新紀錄 (${log.odo} km) 還要多！`);
            return;
        }
        if (inputTime === logTime && odo < log.odo) {
            alert(`🚨 同日里程限制！\n在同一天 (${date}) 的多筆紀錄中，後續輸入的里程數不能走回頭路倒退嚕唷！`);
            return;
        }
    }

    const fuelLog = { vehicleId: currentVehicleId, date, odo, isFull, isMissed, note, gasType, gasAmount, gasCost, elecAmount, elecCost, timestamp: Date.now() };

    if (isEditingFuelLog && editingFuelLogId !== null) {
        fuelLog.id = Number(editingFuelLogId);
        const tx = db.db.transaction('energy', 'readwrite');
        await new Promise(res => { const req = tx.objectStore('energy').put(fuelLog); req.onsuccess = () => res(); });
        alert('🌸 這筆日常補給已就地修改成功！');
    } else {
        await db.addEnergyLog(fuelLog); alert('🎉 成功餵飽車車囉！');
    }

    resetFuelForm();
    await refreshHomeData();
    await refreshStatsPage();
}

async function handleDeleteFuelLog() {
    if (!isEditingFuelLog || editingFuelLogId === null) return;
    const conf = confirm('⚠️ 確定要刪除這筆日常補給紀錄嗎？');
    if (!conf) return;

    const tx = db.db.transaction('energy', 'readwrite');
    await new Promise(res => { const req = tx.objectStore('energy').delete(Number(editingFuelLogId)); req.onsuccess = () => res(); });
    alert('🕊️ 該筆紀錄已消失在時空汪洋中。');

    resetFuelForm();
    await refreshHomeData();
    await refreshStatsPage();
}

// ==========================================
// 🚀 保養沙龍「就地時空還原」機制 (免彈窗)
// ==========================================
async function loadServiceLogToForm(logId) {
    const transaction = db.db.transaction('maintenance', 'readonly');
    const store = transaction.objectStore('maintenance');
    const log = await new Promise(res => { const req = store.get(Number(logId)); req.onsuccess = () => res(req.result); });
    if (!log) return;

    isEditingServiceLog = true;
    editingServiceLogId = log.id;

    document.getElementById('service-form-title').innerText = '⚙️ 修改保養沙龍細則';
    document.getElementById('btn-cancel-service-edit').style.display = 'block';
    document.getElementById('btn-delete-service').style.display = 'block';
    document.getElementById('btn-save-service').innerText = '確認修改保養 💾';
    document.getElementById('btn-save-service').style.backgroundColor = 'var(--mint)';

    document.getElementById('s-date').value = log.date;
    document.getElementById('s-odo').value = log.odo;
    document.getElementById('s-items').value = log.items;
    document.getElementById('s-cost').value = log.cost;
    document.getElementById('s-note').value = log.note || '';

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetServiceForm() {
    isEditingServiceLog = false;
    editingServiceLogId = null;

    document.getElementById('service-form-title').innerText = '✨ 紀錄本次保養沙龍';
    document.getElementById('btn-cancel-service-edit').style.display = 'none';
    document.getElementById('btn-delete-service').style.display = 'none';
    document.getElementById('btn-save-service').innerText = '紀錄完畢 🌸';
    document.getElementById('btn-save-service').style.backgroundColor = 'var(--lavender)';

    document.getElementById('s-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('s-odo').value = '';
    document.getElementById('s-items').value = '';
    document.getElementById('s-cost').value = '';
    document.getElementById('s-note').value = '';

    db.getAllVehicles().then(vehicles => {
        const curCar = vehicles.find(v => v.id == currentVehicleId);
        if (curCar) updateLastOdoTips(curCar);
    });
}

async function handleSaveService() {
    const date = document.getElementById('s-date').value; const odo = Number(document.getElementById('s-odo').value);
    const items = document.getElementById('s-items').value; const cost = Number(document.getElementById('s-cost').value) || 0; const note = document.getElementById('s-note').value;
    if (!date || !odo || !items) { alert('💡 欄位沒填齊唷～'); return; }

    const vehicles = await db.getAllVehicles();
    const curCar = vehicles.find(v => v.id == currentVehicleId);
    if (curCar && odo < curCar.initOdo) {
        alert(`🚨 里程時空混亂！\n保養里程 (${odo} km) 不能比這台車車「初次相遇的里程」(${curCar.initOdo} km) 還要少唷！😭`);
        return;
    }

    const serviceLogs = await db.getMaintenanceLogsByVehicle(currentVehicleId);
    const inputTime = new Date(date).getTime();

    for (let log of serviceLogs) {
        if (isEditingServiceLog && log.id === Number(editingServiceLogId)) continue;
        const logTime = new Date(log.date).getTime();
        
        if (inputTime > logTime && odo < log.odo) {
            alert(`🚨 時空矛盾！\n輸入的保養日期 (${date}) 比過去的保養紀錄 (${log.date}) 還晚，但里程 (${odo} km) 卻比較少！`);
            return;
        }
        if (inputTime < logTime && odo > log.odo) {
            alert(`🚨 時空矛盾！\n輸入的保養日期 (${date}) 比未來的保養紀錄 (${log.date}) 還早，但里程 (${odo} km) 卻比較多！`);
            return;
        }
    }

    const serviceLog = { vehicleId: currentVehicleId, date, odo, items, cost, note, timestamp: Date.now() };

    if (isEditingServiceLog && editingServiceLogId !== null) {
        serviceLog.id = Number(editingServiceLogId);
        const tx = db.db.transaction('maintenance', 'readwrite');
        await new Promise(res => { const req = tx.objectStore('maintenance').put(serviceLog); req.onsuccess = () => res(); });
        alert('🌸 本次保養沙龍明細已成功覆蓋修正！');
    } else {
        await db.addMaintenanceLog(serviceLog); alert('🌸 沙龍紀錄成功！');
    }

    resetServiceForm();
    await refreshServicePage();
    await refreshHomeData();
    await refreshStatsPage();
    switchPage('fuel');
}

async function handleDeleteServiceLog() {
    if (!isEditingServiceLog || editingServiceLogId === null) return;
    const conf = confirm('⚠️ 確定要刪除這筆保養歷史紀錄嗎？');
    if (!conf) return;

    const tx = db.db.transaction('maintenance', 'readwrite');
    await new Promise(res => { const req = tx.objectStore('maintenance').delete(Number(editingServiceLogId)); req.onsuccess = () => res(); });
    alert('🕊️ 保養紀錄已順利移除。');

    resetServiceForm();
    await refreshServicePage();
    await refreshHomeData();
    await refreshStatsPage();
    switchPage('fuel');
}

// 備份與還原
async function handleExportData() {
    const dataPackage = await db.exportAllData(); const jsonString = JSON.stringify(dataPackage, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' }); const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a'); const today = new Date().toISOString().split('T')[0];
    downloadAnchor.href = url; downloadAnchor.download = `moecar_diary_backup_${today}.json`;
    document.body.appendChild(downloadAnchor); downloadAnchor.click(); document.body.removeChild(downloadAnchor); URL.revokeObjectURL(url);
    alert('💾 備份成功！');
}

function handleImportData(e) {
    const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const parsedData = JSON.parse(event.target.result);
            if (!parsedData.vehicles || !parsedData.energy || !parsedData.maintenance) { alert('🚨 檔案格式不對唷～'); return; }
            const confirmRecover = confirm('⚠️ 是否啟動還原？'); if (!confirmRecover) return;
            await db.importAllData(parsedData); alert('🎉 時光機還原成功！'); e.target.value = '';
            currentVehicleId = null; resetFuelForm(); resetServiceForm(); await refreshVehicleList(); await refreshHomeData(); switchPage('fuel');
        } catch (error) { alert('😢 讀取檔案錯誤：' + error); }
    };
    reader.readAsText(file);
}

async function handleDeleteVehicle() {
    if (!currentVehicleId) return;
    const vehicles = await db.getAllVehicles(); const curCar = vehicles.find(v => v.id == currentVehicleId); const carName = curCar ? curCar.name : '這台車車';
    const firstConfirm = confirm(`⚠️ 確定要刪除【${carName}】嗎？`); if (!firstConfirm) return;
    const secondConfirm = confirm(`🚨 警告！會連帶永久刪除所有紀錄！`); if (!secondConfirm) return;
    await db.deleteVehicleAllData(currentVehicleId); alert(`🕊️ 已釋放車車囉！`);
    currentVehicleId = null; resetFuelForm(); resetServiceForm(); await refreshVehicleList();
    const remainingVehicles = await db.getAllVehicles();
    if (remainingVehicles.length > 0) { await refreshHomeData(); switchPage('fuel'); } else { prepareNewVehicleForm(); switchPage('settings'); }
}
