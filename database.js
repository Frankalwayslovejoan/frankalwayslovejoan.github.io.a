// database.js - 萌車日記的記憶體核心 (PHEV 雙軌心臟相容修正版)
export class MoeCarDB {
    constructor() {
        this.dbName = 'MoeCarDB';
        this.version = 1;
        this.db = null;
    }

    // 🧬 初始化資料庫，建立車輛(vehicles)、能源(energy)、保養(maintenance)三張大數據表
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = (e) => reject('資料庫啟動失敗 😢: ' + e.target.error);
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                
                // 1. 車輛儲藏室表
                if (!db.objectStoreNames.contains('vehicles')) {
                    db.createObjectStore('vehicles', { keyPath: 'id', autoIncrement: true });
                }
                // 2. 能源補給紀錄表 (加油/充電歷史)
                if (!db.objectStoreNames.contains('energy')) {
                    db.createObjectStore('energy', { keyPath: 'id', autoIncrement: true });
                }
                // 3. 保養沙龍紀錄表 (維修/定期做 SPA)
                if (!db.objectStoreNames.contains('maintenance')) {
                    db.createObjectStore('maintenance', { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }

    // ==========================================
    // 🏡 區塊一：車輛相關 CRUD 記憶模組 (修正嚴格模式語法)
    // ==========================================
    
    // 撈出小窩裡所有的車車
    async getAllVehicles() {
        return new Promise((resolve) => {
            const transaction = this.db.transaction('vehicles', 'readonly');
            const store = transaction.objectStore('vehicles');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
        });
    }

    // 領養、迎娶一台新車車入庫
    async addVehicle(vehicle) {
        return new Promise((resolve) => {
            const transaction = this.db.transaction('vehicles', 'readwrite');
            const store = transaction.objectStore('vehicles');
            const request = store.add(vehicle);
            request.onsuccess = () => resolve(request.result); // 回傳新生成的自動 id
        });
    }

    // 修改、維護現有的車車資訊
    async updateVehicle(vehicle) {
        return new Promise((resolve) => {
            const transaction = this.db.transaction('vehicles', 'readwrite');
            const store = transaction.objectStore('vehicles');
            const request = store.put(vehicle); // put 有相同 id 就覆蓋修改
            request.onsuccess = () => resolve(request.result);
        });
    }    

    // ==========================================
    // ⛽ 區塊二：日常點心/能源紀錄模組
    // ==========================================
    
    // 記下一筆加油或充電點心
    async addEnergyLog(log) {
        return new Promise((resolve) => {
            const transaction = this.db.transaction('energy', 'readwrite');
            const store = transaction.objectStore('energy');
            const request = store.add(log);
            request.onsuccess = () => resolve(request.result);
        });
    }

    // 撈出特定車輛的所有能源紀錄 (自動依日期由新到舊排序)
    async getEnergyLogsByVehicle(vehicleId) {
        return new Promise((resolve) => {
            const transaction = this.db.transaction('energy', 'readonly');
            const store = transaction.objectStore('energy');
            const request = store.getAll();
            request.onsuccess = () => {
                const allLogs = request.result;
                const filtered = allLogs.filter(log => log.vehicleId == vehicleId);
                filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
                resolve(filtered);
            };
        });
    }

    // ==========================================
    // 🛠️ 區塊三：美容保養沙龍紀錄模組
    // ==========================================
    
    // 記下一筆保養或維修 SPA
    async addMaintenanceLog(log) {
        return new Promise((resolve) => {
            const transaction = this.db.transaction('maintenance', 'readwrite');
            const store = transaction.objectStore('maintenance');
            const request = store.add(log);
            request.onsuccess = () => resolve(request.result);
        });
    }

    // 撈出特定車輛的所有保養 SPA 紀錄 (自動由新到舊排序)
    async getMaintenanceLogsByVehicle(vehicleId) {
        return new Promise((resolve) => {
            const transaction = this.db.transaction('maintenance', 'readonly');
            const store = transaction.objectStore('maintenance');
            const request = store.getAll();
            request.onsuccess = () => {
                const allLogs = request.result;
                const filtered = allLogs.filter(log => log.vehicleId == vehicleId);
                filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
                resolve(filtered);
            };
        });
    }
    // ==========================================
    // 💾 區塊四：Day 6 時光機備份與還原核心邏輯
    // ==========================================
    
    // 一鍵撈出全資料庫三張表的終極打包函式
    async exportAllData() {
        return new Promise(async (resolve) => {
            const vehicles = await this.getAllVehicles();
            
            // 撈出補給紀錄表所有原始資料
            const energyReq = this.db.transaction('energy', 'readonly').objectStore('energy').getAll();
            energyReq.onsuccess = () => {
                const energy = energyReq.result;
                
                // 撈出沙龍紀錄表所有原始資料
                const maintReq = this.db.transaction('maintenance', 'readonly').objectStore('maintenance').getAll();
                maintReq.onsuccess = () => {
                    const maintenance = maintReq.result;
                    
                    // 打包成一個終極大 JSON 物件
                    resolve({ vehicles, energy, maintenance });
                };
            };
        });
    }

    // 接收備份檔，乾淨清空並還原覆蓋的終極還原函式
    async importAllData(backupObj) {
        return new Promise((resolve) => {
            // 開啟全資料庫大權限
            const transaction = this.db.transaction(['vehicles', 'energy', 'maintenance'], 'readwrite');
            
            // 1. 先清空原本本地可能殘留的舊資料
            transaction.objectStore('vehicles').clear();
            transaction.objectStore('energy').clear();
            transaction.objectStore('maintenance').clear();

            // 2. 將備份檔裡的車輛一筆一筆倒回去
            if (backupObj.vehicles) {
                backupObj.vehicles.forEach(v => transaction.objectStore('vehicles').add(v));
            }
            // 3. 將備份檔裡的能源點心倒回去
            if (backupObj.energy) {
                backupObj.energy.forEach(e => transaction.objectStore('energy').add(e));
            }
            // 4. 將備份檔裡的沙龍保養倒回去
            if (backupObj.maintenance) {
                backupObj.maintenance.forEach(m => transaction.objectStore('maintenance').add(m));
            }

            transaction.oncomplete = () => resolve(true);
        });
    }
    // ==========================================
    // ❌ 區塊五：連帶刪除車輛與所有歷史紀錄 (Day 6.5 新增)
    // ==========================================
    async deleteVehicleAllData(vehicleId) {
        return new Promise((resolve) => {
            // 開啟三張表的大權限
            const transaction = this.db.transaction(['vehicles', 'energy', 'maintenance'], 'readwrite');
            
            // 1. 刪除車輛本體
            transaction.objectStore('vehicles').delete(Number(vehicleId));

            // 2. 撈出並刪除所有該車輛的補給紀錄
            const energyStore = transaction.objectStore('energy');
            energyStore.getAll().onsuccess = (e) => {
                const logs = e.target.result.filter(log => log.vehicleId == vehicleId);
                logs.forEach(log => energyStore.delete(log.id));
            };

            // 3. 撈出並刪除所有該車輛的保養紀錄
            const maintStore = transaction.objectStore('maintenance');
            maintStore.getAll().onsuccess = (e) => {
                const logs = e.target.result.filter(log => log.vehicleId == vehicleId);
                logs.forEach(log => maintStore.delete(log.id));
            };

            // 4. 全部刪除成功後回報
            transaction.oncomplete = () => resolve(true);
        });
    }
}