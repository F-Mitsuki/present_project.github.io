// --- 1. ゲームの設計図 (グローバル変数) ---

// 敵の「道」（ウェイポイント）: Y座標を50px下にシフト
const waypoints = [
    { x: 150, y: 550 }, // [0] スタート (500 + 50)
    { x: 150, y: 150 }, // [1] 曲がり角1 (100 + 50)
    { x: 650, y: 150 }, // [2] 曲がり角2 (100 + 50)
    { x: 650, y: 550 }  // [3] ゴール (500 + 50)
];

// コマの配置マス (10個): ユーザー調整後の最新データ
const towerTiles = [
    // 左の列 (2個)
    { x: 50, y: 350 }, { x: 50, y: 250 },
    // 上の列 (2個)
    { x: 200, y: 55 }, { x: 550, y: 55 },
    // 右の列 (2個)
    { x: 700, y: 350 }, { x: 700, y: 250 },
    // 内側、左寄り (2個)
    { x: 200, y: 350 }, { x: 200, y: 250 },
    // 内側、右寄り (2個)
    { x: 550, y: 350 }, { x: 550, y: 250 }
];

// --- 2. ゲームのステータスとデータ ---

let currentGold = 150; // 初期ゴールド
let gameLife = 10;     // ライフ
let isGameRunning = true;

const enemies = [];
const bullets = []; // 画面上の弾を格納
let enemySpawnTimer = null;
let currentWave = 0; // 現在のウェーブ数
const MAX_WAVE = 1; //デバッグ用: 1ウェーブでクリア(元に戻す場合は 10)
let waveTimer; // ウェーブ間の待機用タイマー

// コマのステータス: ユーザー調整後の最新データ
const TOWER_STATS = {
    SWORD: { cost: 10, power: 30, range: 150, speed: 2.0, name: '剣兵', color: 'red' }, 
    ARCHER: { cost: 30, power: 15, range: 300, speed: 1.0, name: '弓兵', color: 'cyan' },
    CANNON: { cost: 50, power: 50, range: 200, speed: 0.5, name: '大砲兵', color: 'purple' } 
};

const towers = [];

// --- 敵のイジり文言（名前）リスト ---

const A_NAMES = [
    '暴言厨', '事故車', 'ネット弁慶', '漢字弱者',
    'コミュ障', 'サークル', 'ゼミ', '友達０',
    '声はいい', '先伸ばし', '課題', 'メンタル',
    'ヤンマパン'
]; // 合計13個

const B_NAMES = [
    'べたべたえのき', '大学', '爆美女でーす', '社不',
    '借金43万'
]; // 合計5個

const C_NAMES = [
    'インスタのIDは', '住んでる市は'
]; // 合計2個
const NAME_COUNTERS = { A: 0, B: 0, C: 0 };

// 敵のステータス: ユーザー調整後の最新データ (HP強化)
const ENEMY_STATS = {
    A: { hp: 300, speed: 100, reward: 10, color: 'blue' },
    B: { hp: 150, speed: 150, reward: 15, color: 'green' },
    C: { hp: 500, speed: 75, reward: 20, color: 'orange' }
};

const SPAWN_SEQUENCE = [
    'A', 'A', 'A', 'B', 'C', 'A', 'B', 'A', 'B', 'C'
]; // 合計10体 (基本パターン)
let sequenceIndex = 0; // 敵のユニークIDとして使う
let gameArea = null;


// === 強化計算ヘルパー関数 ===

function fibonacci(n) {
    if (n <= 1) return n;
    let a = 0, b = 1;
    for (let i = 2; i <= n; i++) {
        let next = a + b;
        a = b;
        b = next;
    }
    return b;
}

function calculateUpgradeCost(currentLevel) {
    const nextLevel = currentLevel + 1;
    const fibNum = fibonacci(nextLevel); 
    return fibNum * 10; 
}

function calculateUpgradeRate(currentLevel) {
    const n = currentLevel;
    return (2.5 * n * n + 2.5 * n) / 100; // 0.05, 0.15, 0.30... (小数点)
}

// --- 3. クラス定義 ---

class Enemy {
    constructor(type, index) {
        this.type = type;
        this.stats = ENEMY_STATS[type];
        this.hp = this.stats.hp;
        this.currentWaypoint = 0;
        this.isAlive = true;
        this.id = 'e' + index;

        const nameArray = type === 'A' ? A_NAMES : (type === 'B' ? B_NAMES : C_NAMES);
        const nameIndex = NAME_COUNTERS[type];
        
        // 名前リストが空の場合のフォールバック
        if (nameArray && nameArray.length > 0) {
            this.name = nameArray[nameIndex % nameArray.length]; 
            NAME_COUNTERS[type] = (nameIndex + 1);
        } else {
            this.name = `敵 ${type}`; // デフォルト名
        }

        // 最終バランス: ウェーブごとのHPボーナスは「なし」
        this.hp = this.stats.hp; 

        this.el = document.createElement('div');
        this.el.className = 'enemy';
        this.el.id = this.id;
        this.el.style.backgroundColor = this.stats.color;
        this.el.innerHTML = `<span class="enemy-text">${this.name}</span>`;
        
        document.getElementById('enemy-container').appendChild(this.el);

        this.x = waypoints[0].x - 15;
        this.y = waypoints[0].y - 15;
        this.el.style.transform = `translate(${this.x}px, ${this.y}px)`;
    }
    
    takeDamage(damage) {
        if (!this.isAlive) return;
        this.hp -= damage;
        if (this.hp <= 0) {
            this.die();
        }
    }
    
    die() {
        if (!this.isAlive) return;
        
        currentGold += this.stats.reward;
        updateUI(); 
        
        this.remove(); 
    }

    move(deltaTime) {
        if (!this.isAlive) return;
        const target = waypoints[this.currentWaypoint + 1];
        if (!target) {
            this.reachGoal();
            return;
        }
        
        const dx = target.x - (this.x + 15);
        const dy = target.y - (this.y + 15);
        const distance = Math.sqrt(dx * dx + dy * dy);
        const travelDistance = this.stats.speed * deltaTime;

        if (distance > travelDistance) {
            const ratio = travelDistance / distance;
            this.x += dx * ratio;
            this.y += dy * ratio;
        } else {
            this.x = target.x - 15;
            this.y = target.y - 15;
            this.currentWaypoint++;
        }

        this.el.style.transform = `translate(${this.x}px, ${this.y}px)`;
    }

    reachGoal() {
        gameLife--; 
        updateUI(); 
        
        if (gameLife <= 0) {
            isGameRunning = false;
            clearInterval(enemySpawnTimer); 
            clearInterval(waveTimer); 
            showGameOverScreen(); 
        }
        
        this.remove();
    }
    
    remove() {
        this.isAlive = false;
        this.el.remove();
    }
}

class Tower {
    constructor(type, stats, tileEl) {
        this.type = type;
        this.stats = { ...stats }; 
        this.tileEl = tileEl;
        this.level = 1;
        this.lastAttackTime = 0; 
        
        this.centerX = parseInt(tileEl.style.left) + 25;
        this.centerY = parseInt(tileEl.style.top) + 25;

        this.rangeEl = document.createElement('div');
        this.rangeEl.className = 'tower-range-circle';
        
        gameArea.appendChild(this.rangeEl);
        this.updateVisuals(); 
    }
    
    upgrade() {
        const cost = calculateUpgradeCost(this.level); 
        const baseRate = calculateUpgradeRate(this.level); 
        
        if (currentGold < cost) {
            showMessage(`レベルアップに${cost}足りん。計算もできないのか？`);
            return false;
        }

        currentGold -= cost;
        updateUI();

        // 最終バランス調整 (攻撃射程60%, 速度0.65*1.1)
        const powerRangeRate = baseRate * 0.6; 
        const speedRate = baseRate * 0.65 * 1.1; 

        // 速度(speed)は値が大きいほど速い
        this.stats.power *= (1 + powerRangeRate); 
        this.stats.range *= (1 + powerRangeRate); 
        this.stats.speed *= (1 + speedRate); 

        this.level++;
        this.updateVisuals();
        
        showMessage(`${this.stats.name}がレベル${this.level}にアップ～`);
        
        // メニューを更新するために再度呼び出す
        showTowerMenu(this.tileEl, this);
        return true;
    }
    
    updateVisuals() {
        const towerEl = this.tileEl.querySelector('.tower');
        if (towerEl) {
            towerEl.innerHTML = `<span class="tower-level">Lv.${this.level}</span>`;
        }
        
        this.rangeEl.style.width = this.stats.range * 2 + 'px';
        this.rangeEl.style.height = this.stats.range * 2 + 'px';
        this.rangeEl.style.left = this.centerX - this.stats.range + 'px';
        this.rangeEl.style.top = this.centerY - this.stats.range + 'px';
    }

    sell() {
        const baseCost = TOWER_STATS[this.type].cost;
        const refund = Math.floor(baseCost * 0.5); 
        currentGold += refund;
        updateUI();

        this.tileEl.dataset.occupied = '';
        const towerEl = this.tileEl.querySelector('.tower');
        if (towerEl) {
            towerEl.remove();
        }
        this.rangeEl.remove(); 
        
        showMessage(`${this.stats.name}を破棄し、${refund}G回収。`);
    }

    attack(deltaTime) {
        if (!isGameRunning) return;

        const attackInterval = 1 / this.stats.speed; 
        const currentTime = performance.now() / 1000;

        if (currentTime < this.lastAttackTime + attackInterval) {
            return;
        }

        const target = this.findTarget();
        
        if (target) {
            this.lastAttackTime = currentTime; 
            this.shoot(target);
        }
    }

    findTarget() {
        let targetsInRange = [];

        enemies.forEach(enemy => {
            if (!enemy.isAlive) return; // 生きている敵だけを対象
            const enemyCenterX = enemy.x + 15;
            const enemyCenterY = enemy.y + 15;

            const distance = Math.sqrt(
                Math.pow(this.centerX - enemyCenterX, 2) + 
                Math.pow(this.centerY - enemyCenterY, 2)
            );

            if (distance <= this.stats.range) {
                targetsInRange.push({ enemy: enemy, distance: distance });
            }
        });
        
        if (targetsInRange.length === 0) return null;

        let target = targetsInRange[0].enemy;

        switch (this.type) {
            case 'SWORD': 
                let minDistance = targetsInRange[0].distance;
                targetsInRange.forEach(t => {
                    if (t.distance < minDistance) {
                        minDistance = t.distance;
                        target = t.enemy;
                    }
                });
                break;
                
            case 'ARCHER': 
                let targetProgress = this.calculateEnemyProgress(targetsInRange[0].enemy);
                targetsInRange.forEach(t => {
                    const progress = this.calculateEnemyProgress(t.enemy);
                    
                    if (progress > targetProgress) {
                        targetProgress = progress;
                        target = t.enemy;
                    }
                });
                break;
                
            case 'CANNON':
                let maxHP = targetsInRange[0].enemy.hp;
                targetsInRange.forEach(t => {
                    if (t.enemy.hp > maxHP) {
                        maxHP = t.enemy.hp;
                        target = t.enemy;
                    }
                });
                break;
        }

        return target;
    }

    calculateEnemyProgress(enemy) {
        let progress = enemy.currentWaypoint;
        const currentTarget = waypoints[enemy.currentWaypoint + 1];
        if (currentTarget) {
            const enemyCenterX = enemy.x + 15;
            const enemyCenterY = enemy.y + 15;
            const dx = currentTarget.x - enemyCenterX;
            const dy = currentTarget.y - enemyCenterY;
            const remainingDistance = Math.sqrt(dx * dx + dy * dy);
            progress = enemy.currentWaypoint + (1 - remainingDistance / 500); 
        }
        return progress;
    }
    
    shoot(target) {
        const bulletSpeedFactor = this.stats.speed; 
        const baseBulletSpeed = 500;
        const finalBulletSpeed = baseBulletSpeed * bulletSpeedFactor * 0.5; 
        
        const bullet = {
            el: document.createElement('div'),
            x: this.centerX - 2, 
            y: this.centerY - 2,
            target: target,
            damage: this.stats.power,
            speed: finalBulletSpeed,
            isAlive: true
        };
        
        bullet.el.className = 'bullet';
        bullet.el.style.backgroundColor = this.stats.color;
        gameArea.appendChild(bullet.el);
        
        bullets.push(bullet); 

        showDamageText(target, this.stats.power);
    }
}

// --- 4. マップとUIの描画関数 ---

function updateUI() {
    const goldEl = document.querySelector('#gold-display span');
    const lifeEl = document.querySelector('#life-display span');
    const waveEl = document.getElementById('current-wave-display');

    if (goldEl) goldEl.textContent = `${currentGold}G`;
    if (lifeEl) lifeEl.textContent = gameLife;
    if (waveEl) waveEl.textContent = currentWave;
    
    const keyUiEl = document.getElementById('key-ui');
    if (keyUiEl) {
        if (currentWave >= MAX_WAVE && enemies.length === 0) {
             keyUiEl.classList.remove('hidden');
        } else {
             keyUiEl.classList.add('hidden');
        }
    }
}

function createElement(id, className, x, y) {
    const el = document.createElement('div');
    if (id) el.id = id;
    if (className) el.className = className;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    return el;
}

function drawMap() {
    const startPoint = createElement('spawn-point', null, waypoints[0].x - 25, waypoints[0].y - 25);
    gameArea.appendChild(startPoint);

    const goalPoint = createElement('goal-point', null, waypoints[3].x - 25, waypoints[3].y - 25);
    gameArea.appendChild(goalPoint);

    towerTiles.forEach((tile, index) => {
        const tileEl = createElement(`tile-${index}`, 'tower-tile', tile.x, tile.y);
        gameArea.appendChild(tileEl);
    });
    
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
        .tower-range-circle {
            position: absolute;
            border: 1px dotted rgba(255, 255, 255, 0.5); 
            border-radius: 50%;
            pointer-events: none; 
            z-index: 5;
        }
    `;
    document.head.appendChild(styleEl);
    if (!document.getElementById('tower-popup')) {
        const popup = document.createElement('div');
        popup.id = 'tower-popup';
        gameArea.appendChild(popup); // #game-area を親にする
    }

    updateUI(); // 最後にUIを初期化
}

function showMessage(text, duration = 1500) {
    const msgEl = document.getElementById('gold-message');
    if (!msgEl) return;
    
    msgEl.textContent = text;
    msgEl.classList.remove('hidden'); // .hidden を削除
    msgEl.classList.add('visible');  // .visible を追加
    
    setTimeout(() => {
        msgEl.classList.remove('visible');
        msgEl.classList.add('hidden');
    }, duration);
}

function showDamageText(enemy, damage) {
    const textEl = document.createElement('div');
    textEl.className = 'damage-text';
    textEl.textContent = Math.round(damage); 
    
    textEl.style.left = enemy.x + 15 + 'px'; 
    textEl.style.top = enemy.y + 15 + 'px'; 
    gameArea.appendChild(textEl);
    
    setTimeout(() => {
        textEl.remove();
    }, 1000); 
}

// ウェーブ開始ポップアップ関数
function showWavePopup(text, duration = 2500) { 
    let popup = document.getElementById('wave-popup');
    if (!popup) return; 
    
    popup.textContent = text;
    popup.classList.remove('hidden');
    popup.classList.add('show');
    
    setTimeout(() => {
        popup.classList.remove('show');
        popup.classList.add('hidden');
    }, duration);
}


// --- 5. ゲームループとウェーブ管理 ---

let lastTime = 0;

// === ウェーブ管理関数 ===
function startWaves() {
    if (currentWave >= MAX_WAVE && enemies.length === 0) {
        showGameClearScreen(); 
        return;
    }
    
    currentWave++;
    updateUI(); 
    console.log(`ウェーブ ${currentWave} 開始！`);
    
    showWavePopup(`ウェーブ ${currentWave}`);

    // ウェーブごとの敵の総数
    let enemiesToSpawn;
    if (currentWave <= 3) {
        enemiesToSpawn = 5; // W1〜3: 5体
    } else if (currentWave <= 7) {
        enemiesToSpawn = 10; // W4〜7: 10体
    } else { // W8〜10
        enemiesToSpawn = 20; // W8〜10: 20体
    }

    let spawnCount = 0;
    
    enemySpawnTimer = setInterval(() => {
        
        if (spawnCount >= enemiesToSpawn) {
            clearInterval(enemySpawnTimer);
            waveTimer = setInterval(checkWaveEnd, 1000); 
            return;
        }

        const indexInSequence = spawnCount % SPAWN_SEQUENCE.length; 
        
        let enemyType;
        // W1-3で、シーケンスのインデックスが5以上になったら、それ以上出さない
        if (currentWave <= 3 && indexInSequence >= 5) {
             // W1-3は前半5体のみ
        } else {
            enemyType = SPAWN_SEQUENCE[indexInSequence];
            spawnEnemyFromType(enemyType);
        }
        
        spawnCount++;
        
    }, 1500); 
}

function checkWaveEnd() {
    if (enemies.length === 0) {
        clearInterval(waveTimer);
        if (currentWave >= MAX_WAVE) {
             showGameClearScreen();
        } else {
            startWaves(); 
        }
    }
}

function spawnEnemyFromType(enemyType) {
    if (!enemyType) return; 
    const newEnemy = new Enemy(enemyType, sequenceIndex++); 
    enemies.push(newEnemy);
}

function gameLoop(timestamp) {
    if (!isGameRunning) return;

    if (!lastTime) {
        lastTime = timestamp;
    }
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].move(deltaTime);
        
        if (!enemies[i].isAlive) {
            enemies.splice(i, 1);
        }
    }
    
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        if (!bullet.isAlive) continue;

        const target = bullet.target;
        
        if (!target.isAlive) {
            bullet.el.remove();
            bullets.splice(i, 1);
            continue;
        }

        const targetCenterX = target.x + 15;
        const targetCenterY = target.y + 15;
        const dx = targetCenterX - bullet.x;
        const dy = targetCenterY - bullet.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const bulletTravel = bullet.speed * deltaTime;

        if (distance < bulletTravel) {
            target.takeDamage(bullet.damage); 
            
            bullet.el.remove();
            bullets.splice(i, 1);
        } else {
            const ratio = bulletTravel / distance;
            bullet.x += dx * ratio;
            bullet.y += dy * ratio;
            bullet.el.style.transform = `translate(${bullet.x}px, ${bullet.y}px)`;
        }
    }
    
    towers.forEach(tower => {
        tower.attack(deltaTime);
    });

    requestAnimationFrame(gameLoop);
}

// --- 6. 設置と終了画面 ---

// メニュー表示ヘルパー関数
function showTowerMenu(tile, existingTower) {
    const popup = document.getElementById('tower-popup');
    if (!popup) return; 
    
    
    popup.style.left = tile.style.left;
    popup.style.top = tile.style.top;
    popup.style.display = 'block';
    
    // ポップアップを閉じるためのイベントリスナー
    const closePopup = (event) => {
        if (event.target.closest('#tower-popup') && (event.target.dataset.action === 'UPGRADE')) return;
        if (event.target.closest('.tower-tile') === tile) return; 

        if (!event.target.closest('#tower-popup') || event.target.dataset.action === 'CANCEL' || event.target.dataset.action === 'SELL') {
            popup.style.display = 'none';
            document.removeEventListener('click', closePopup, true);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', closePopup, true); 
    }, 0);

    // 既にタワーが置かれている場合
    if (existingTower) {
        const upgradeCost = calculateUpgradeCost(existingTower.level); 
        const sellRefund = Math.floor(TOWER_STATS[existingTower.type].cost * 0.5); 
        
        popup.innerHTML = `
            <p>${existingTower.stats.name} (Lv.${existingTower.level})</p>
            <button data-action="UPGRADE">レベルアップ (${upgradeCost}G)</button>
            <button data-action="SELL">破棄 (${sellRefund}G 回収)</button>
            <button data-action="CANCEL">キャンセル</button>
        `;
        
        popup.querySelectorAll('button').forEach(button => {
            button.onclick = (btnEvent) => {
                btnEvent.stopPropagation(); 
                const action = btnEvent.target.dataset.action;
                
                if (action === 'UPGRADE') {
                    existingTower.upgrade();
                } else if (action === 'SELL') {
                    existingTower.sell();
                    const index = towers.indexOf(existingTower);
                    if (index > -1) {
                        towers.splice(index, 1);
                    }
                    popup.style.display = 'none'; 
                    document.removeEventListener('click', closePopup, true);
                } else if (action === 'CANCEL') {
                    popup.style.display = 'none'; 
                    document.removeEventListener('click', closePopup, true);
                }
            };
        });

    } else {
        // タワーが置かれていない場合 (新規設置)
        popup.innerHTML = `
            <p>コマを選択:</p>
            <button data-type="SWORD">剣兵 (${TOWER_STATS.SWORD.cost}G)</button>
            <button data-type="ARCHER">弓兵 (${TOWER_STATS.ARCHER.cost}G)</button>
            <button data-type="CANNON">大砲兵 (${TOWER_STATS.CANNON.cost}G)</button>
            <button data-type="CANCEL">キャンセル</button>
        `;
        
        popup.querySelectorAll('button').forEach(button => {
            button.onclick = (btnEvent) => {
                btnEvent.stopPropagation(); 
                const type = btnEvent.target.dataset.type;
                popup.style.display = 'none';
                document.removeEventListener('click', closePopup, true);
                if (type !== 'CANCEL') {
                    placeTower(type, tile);
                }
            };
        });
    }
}


function placeTower(type, tileEl) {
    const stats = TOWER_STATS[type];
    
    if (currentGold < stats.cost) {
        showMessage("お金が足りない。また借金する気か？");
        return;
    }

    currentGold -= stats.cost;
    updateUI();

    tileEl.dataset.occupied = 'true';
    
    const towerEl = document.createElement('div');
    towerEl.className = 'tower ' + type.toLowerCase();
    towerEl.style.backgroundColor = stats.color;
    towerEl.style.width = tileEl.style.width;
    towerEl.style.height = tileEl.style.height;
    tileEl.appendChild(towerEl);
    
    const newTower = new Tower(type, stats, tileEl);
    towers.push(newTower);
    // newTower.updateVisuals(); // constructorで既に呼ばれている
}


// === ゲーム終了画面関数 ===

function showGameOverScreen() {
    isGameRunning = false;
    const endScreen = document.getElementById('end-screen');
    const endMessage = document.getElementById('end-message');
    const endScore = document.getElementById('end-score');
    
    endMessage.textContent = "ゲームオーバー";
    endMessage.style.color = "red";
    
    endScore.textContent = `最終ゴールド: ${currentGold}G`;
    
    endScreen.classList.remove('hidden');
    
    document.getElementById('restart-button').onclick = () => {
        window.location.reload(); 
    };
}

function showGameClearScreen() {
    isGameRunning = false; 
    const endScreen = document.getElementById('end-screen');
    const endMessage = document.getElementById('end-message');
    const endScore = document.getElementById('end-score');
    
    const keyUiEl = document.getElementById('key-ui');
    if (keyUiEl) keyUiEl.classList.remove('hidden');
    
    endMessage.textContent = "ゲームクリア！脱出のカギを獲得！";
    endMessage.style.color = "gold"; 
    endScreen.classList.remove('hidden');
    
    document.getElementById('restart-button').textContent = "脱出ゲームの続きへ";
    document.getElementById('restart-button').onclick = () => {
        document.getElementById('td-game-area').classList.add('hidden'); 
        document.getElementById('end-screen').classList.add('hidden'); 
        startEscapeGame();
    };
}

// === ゲーム開始ロジック ===

function resetGame() {
    currentGold = 150; 
    gameLife = 10;     
    isGameRunning = true;
    currentWave = 0;
    
    NAME_COUNTERS.A = 0; 
    NAME_COUNTERS.B = 0; 
    NAME_COUNTERS.C = 0; 
    
    // 既存のDOM要素をクリーンアップ
    enemies.forEach(e => e.el.remove());
    bullets.forEach(b => b.el.remove());
    towers.forEach(t => {
        if (t.rangeEl) t.rangeEl.remove(); 
        if (t.tileEl) {
            t.tileEl.dataset.occupied = '';
            const towerVisual = t.tileEl.querySelector('.tower');
            if (towerVisual) towerVisual.remove();
        }
    });
    enemies.length = 0;
    bullets.length = 0;
    towers.length = 0;
    
    if (enemySpawnTimer) clearInterval(enemySpawnTimer);
    if (waveTimer) clearInterval(waveTimer);
    
    const endScreen = document.getElementById('end-screen');
    if (endScreen) endScreen.classList.add('hidden');
    const keyUiEl = document.getElementById('key-ui');
    if (keyUiEl) keyUiEl.classList.add('hidden');
    
    // 脱出ゲーム画面も隠す
    const escapeRoom = document.getElementById('escape-room-1');
    if (escapeRoom) {
        escapeRoom.remove(); // 毎回新しく作るほうが安全
    }
    // TDゲームエリアは表示する
    document.getElementById('td-game-area').classList.remove('hidden');
    
    if (gameArea) {
        gameArea.innerHTML = '<div id="enemy-container"></div>'; 
        drawMap();
        // イベントリスナーを再設定する必要がある
        setupTileClickListeners();
    }
}

function startGame() {
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('explanation-screen').classList.add('hidden');
    document.getElementById('td-game-area').classList.remove('hidden');
    
    resetGame();
    startWaves();
    
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function startEscapeGame() {
    console.log("ゲームクリア！次のステップへ");

    // TDゲームエリアと終了画面を隠す
    document.getElementById('td-game-area').classList.add('hidden'); 
    document.getElementById('end-screen').classList.add('hidden'); 
    
    const appRoot = document.getElementById('app-root');
    appRoot.style.backgroundColor = '#111'; // 背景色を暗くする

    // 脱出ゲーム画面が既にあればそれを表示、なければ作成
    let escapeRoomScreen = document.getElementById('escape-room-1');
    if (!escapeRoomScreen) {
        escapeRoomScreen = document.createElement('div');
        escapeRoomScreen.id = 'escape-room-1';
        escapeRoomScreen.className = 'app-screen'; 
        escapeRoomScreen.style.zIndex = 1001; 
        appRoot.appendChild(escapeRoomScreen);

        // メッセージ表示用のスタイルも動的に追加
        const styleEl = document.createElement('style');
        styleEl.innerHTML = `
            .action-button { 
                padding: 10px 20px; font-size: 18px; margin: 10px;
                cursor: pointer; background-color: #444; color: white;
                border: 1px solid #888; border-radius: 5px;
            }
            .action-button:hover { background-color: #666; }
            #escape-message-area {
                position: absolute; top: 50%; left: 50%;
                transform: translate(-50%, -50%); z-index: 1002;
                pointer-events: none;
            }
            #escape-message {
                display: inline-block; /* これで一つのブロックとして扱われる */
                text-align: left;
                font-size: 30px; color: #FFD700; 
                background-color: rgba(0, 0, 0, 0.8);
                padding: 10px 20px; border-radius: 5px;
                opacity: 0; transition: opacity 0.5s;
                white-space: pre-wrap;
            }
            #escape-message.visible { opacity: 1; }
            #escape-message.hidden { opacity: 0; }
        `;
        document.head.appendChild(styleEl);
    }
    
    // 画面の内容を設定
    escapeRoomScreen.innerHTML = `
        <h1 style="color: gold;">部屋1：カギを手に入れた！</h1>
        <p style="color: white;">カギを使いますか？</p>
        <button id="use-key-button" class="action-button">カギを使う</button>
        <button id="look-around-button" class="action-button">まだ調べる</button>
        <div id="escape-message-area">
             <span id="escape-message" class="hidden"></span>
        </div>
    `;

    // 画面を表示
    escapeRoomScreen.classList.remove('hidden');

    //脱出ゲーム専用のメッセージ関数
    function showEscapeMessage(text, duration = 2000) {
        // TDゲームの showMessage とは別の、脱出ゲーム専用の関数
        const msgEl = document.getElementById('escape-message');
        if (!msgEl) return;
        
        msgEl.textContent = text;
        msgEl.classList.remove('hidden');
        msgEl.classList.add('visible');
        
        setTimeout(() => {
            msgEl.classList.remove('visible');
            msgEl.classList.add('hidden');
        }, duration);
    }

    // 新しいボタンにイベントリスナーを設定
    document.getElementById('use-key-button').onclick = () => {
         escapeRoomScreen.innerHTML = `
            <h1 style="color: #4CAF50; font-size: 40px; text-align: center;">脱出成功！<br>誕生日おめでとう~</h1>
            <p style="color: white; font-size: 18px; padding: 0 20px; text-align: center;">次はどんな個人情報を教えてくれるの？</p>
         `;
    };
    
    document.getElementById('look-around-button').onclick = () => {
         showEscapeMessage("いや何がしたいねん。\nなんやインスタIDでも言うか？k...");
    };
}

// --- 7. DOMContentLoaded ---

document.addEventListener('DOMContentLoaded', () => {
    initTDGame(); 
});

function setupTileClickListeners() {
    // コマの配置イベントをTDゲームエリアで設定
    document.querySelectorAll('.tower-tile').forEach(tile => {
        tile.onclick = (e) => {
            const existingTower = towers.find(t => t.tileEl === tile);
            showTowerMenu(tile, existingTower);
        };
    });
}

// TDゲームの初期設定
function initTDGame() {
    // UIフローのDOM要素を取得
    const titleScreen = document.getElementById('title-screen');
    const explanationScreen = document.getElementById('explanation-screen');
    const tdGameArea = document.getElementById('td-game-area');
    const startButton = document.getElementById('start-button');
    const tdStartButton = document.getElementById('td-start-button');
    const towerDescriptions = document.getElementById('tower-descriptions');

    // イベントリスナーの設定
    startButton.onclick = () => {
        titleScreen.classList.add('hidden');
        explanationScreen.classList.remove('hidden');
        setupDescriptions(towerDescriptions); 
    };
    
    tdStartButton.onclick = () => {
        explanationScreen.classList.add('hidden');
        startGame(); 
    };

    // 最初にタイトル画面だけを表示
    titleScreen.classList.remove('hidden');
    explanationScreen.classList.add('hidden');
    tdGameArea.classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    
    // TDゲーム関連のDOM要素の取得
    gameArea = document.getElementById('game-area');
    drawMap(); // マップとポップアップコンテナを描画

    setupTileClickListeners();
}

// コマの説明を生成する関数
function setupDescriptions(container) {
    container.innerHTML = ''; 
    Object.values(TOWER_STATS).forEach(stats => {
        const item = document.createElement('div');
        item.className = 'tower-desc-item';
        
        const upgradeRateLv1 = calculateUpgradeRate(1);
        const powerRate = (upgradeRateLv1 * 0.7 * 100).toFixed(0);
        const speedRate = (upgradeRateLv1 * 0.85 * 1.1 * 100).toFixed(0);

        item.innerHTML = `
            <h3 style="color:${stats.color};">${stats.name}</h3>
            <p>
                コスト: ${stats.cost}G / 攻撃力: ${stats.power.toFixed(0)} / 射程: ${stats.range.toFixed(0)} / 攻撃速度: ${stats.speed.toFixed(1)}回/秒
                <br>
                Lvアップ時(Lv1): 攻/射 ${powerRate}%↑ / 速 ${speedRate}%↑
            </p>
        `;
        container.appendChild(item);
    });
}
