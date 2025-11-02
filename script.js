// --- 1. ゲームの設計図 (グローバル変数) ---

// 敵の「道」（ウェイポイント）: Y座標を50px下にシフト
const waypoints = [
    { x: 150, y: 550 }, // [0] スタート (500 + 50)
    { x: 150, y: 150 }, // [1] 曲がり角1 (100 + 50)
    { x: 650, y: 150 }, // [2] 曲がり角2 (100 + 50)
    { x: 650, y: 550 }  // [3] ゴール (500 + 50)
];

// コマの配置マス (10個): ユーザー調整後の最新データ (バランス調整)
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
const MAX_WAVE = 10; // ゲームクリアに必要なウェーブ数
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
    '借金42万'
]; // 合計5個

const C_NAMES = [
    'インスタのIDは', '住んでる市は'
]; // 合計2個
const NAME_COUNTERS = { A: 0, B: 0, C: 0 };

const ENEMY_STATS = {
    A: { hp: 100, speed: 100, reward: 10, color: 'blue' },
    B: { hp: 50, speed: 150, reward: 15, color: 'green' },
    C: { hp: 200, speed: 75, reward: 20, color: 'orange' }
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
        this.name = nameArray[nameIndex % nameArray.length]; 
        NAME_COUNTERS[type] = (nameIndex + 1);

        // ★★★ 修正箇所: 敵のHP上昇を +50 から +100 に倍増！ ★★★
        const hpBonus = (currentWave - 1) * 100; 
        this.hp = this.stats.hp + hpBonus;
        // ★★★ ----------------------------------------- ★★★

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
    
    // Tower クラス内の upgrade メソッドを修正

    upgrade() {
        const cost = calculateUpgradeCost(this.level); 
        const baseRate = calculateUpgradeRate(this.level); // 基本の上昇率 (例: 0.05)
        
        if (currentGold < cost) {
            showMessage(`レベルアップに${cost}G必要です！ゴールドが足りません！`);
            return false;
        }

        currentGold -= cost;
        updateUI();

        // 攻撃スピードの上昇率 (他のステータスより15%低い)
        // 攻撃スピードの上昇率に1.1を掛けて、底上げする (君の要望)
        const speedRate = baseRate * 0.85 * 1.1; 

        // ログ追加: アップグレード前の速度
        console.log(`Lv${this.level} -> Lv${this.level + 1} | Rate: ${(baseRate * 100).toFixed(1)}%`);
        console.log(`[PRE-UPGRADE] Speed: ${this.stats.speed.toFixed(3)}`);

        // ★★★ 最終修正: 値を増やすことで速度アップ (1 + rate) ★★★
        this.stats.power *= (1 + baseRate);
        this.stats.range *= (1 + baseRate);
        this.stats.speed *= (1 + speedRate); // ★★★ 速度の値が大きくなるように修正 ★★★

        this.level++;
        this.updateVisuals();
        
        // ログ追加: アップグレード後の速度
        console.log(`[POST-UPGRADE] Speed: ${this.stats.speed.toFixed(3)}`);
        
        showMessage(`${this.stats.name}がレベル${this.level}にアップグレード！`);
        
        showTowerMenu(this.tileEl, this);
        return true;
    }
    updateVisuals() {
        this.tileEl.querySelector('.tower').innerHTML = `<span class="tower-level">Lv.${this.level}</span>`;
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
        this.tileEl.querySelector('.tower').remove();
        this.rangeEl.remove(); 
        
        showMessage(`${this.stats.name}を破棄し、${refund}Gを回収しました。`);
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
    document.querySelector('#gold-display span').textContent = `${currentGold}G`;
    document.querySelector('#life-display span').textContent = gameLife;
    document.getElementById('current-wave-display').textContent = currentWave;
    
    // カギのUIをTDクリア後に表示
    if (document.getElementById('key-ui')) {
        if (currentWave >= MAX_WAVE) {
             document.getElementById('key-ui').classList.remove('hidden');
        } else {
             document.getElementById('key-ui').classList.add('hidden');
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
    updateUI();
}

function showMessage(text, duration = 1500) {
    const msgEl = document.getElementById('gold-message');
    if (!msgEl) return;
    
    msgEl.textContent = text;
    msgEl.className = 'visible'; 
    
    setTimeout(() => {
        msgEl.className = 'hidden';
    }, duration);
}

function showDamageText(enemy, damage) {
    const textEl = document.createElement('div');
    textEl.className = 'damage-text';
    textEl.textContent = Math.round(damage); // ダメージを丸めて表示
    
    textEl.style.left = enemy.x + 15 + 'px'; 
    textEl.style.top = enemy.y + 15 + 'px'; 
    gameArea.appendChild(textEl);
    
    setTimeout(() => {
        textEl.remove();
    }, 1000); 
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

    // ウェーブごとの敵の総数 (配列の繰り返し回数) を設定
    let enemiesToSpawn;
    if (currentWave <= 3) {
        enemiesToSpawn = 5; // W1〜3: 5体 (SPAWN_SEQUENCEの前半5体)
    } else if (currentWave <= 7) {
        enemiesToSpawn = 10; // W4〜7: 10体 (SPAWN_SEQUENCE全体1回分)
    } else { // W8〜10
        enemiesToSpawn = 20; // W8〜10: 20体 (SPAWN_SEQUENCE全体2回分)
    }

    let spawnCount = 0;
    
    enemySpawnTimer = setInterval(() => {
        
        if (spawnCount >= enemiesToSpawn) {
            clearInterval(enemySpawnTimer);
            waveTimer = setInterval(checkWaveEnd, 1000); 
            return;
        }

        // どのインデックスの敵を出すか？ -> SPAWN_SEQUENCE配列内で循環させる
        const indexInSequence = spawnCount % SPAWN_SEQUENCE.length; 
        
        let enemyType;
        if (currentWave <= 3 && indexInSequence >= 5) {
            // W1-3で6体目以降は出さない (enemiesToSpawn <= 5なので発生しないはずだが保険)
            return; 
        } else {
            enemyType = SPAWN_SEQUENCE[indexInSequence];
        }

        spawnEnemyFromType(enemyType);
        spawnCount++;
        
    }, 1500); // 1.5秒ごとに敵を生成
}

function checkWaveEnd() {
    if (enemies.length === 0) {
        clearInterval(waveTimer);
        // 全体を通して10ウェーブ全てが終了していたらクリア
        if (currentWave >= MAX_WAVE) {
             showGameClearScreen();
        } else {
            startWaves(); // 次のウェーブへ移行
        }
    }
}

function spawnEnemyFromType(enemyType) {
    const newEnemy = new Enemy(enemyType, sequenceIndex++); 
    enemies.push(newEnemy);
}

function gameLoop(timestamp) {
    if (!isGameRunning) return;

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

// ★★★ 新規追加: メニュー表示ヘルパー関数 ★★★
function showTowerMenu(tile, existingTower) {
    const popup = document.getElementById('tower-popup');
    popup.style.left = parseInt(tile.style.left) + 'px'; // マスの左位置
    popup.style.top = parseInt(tile.style.top) + 'px';   // マスの上位置
    popup.style.display = 'block';
    
    // ポップアップを閉じるためのイベントリスナーを再設定
    const closePopup = (event) => {
        // キャンセルボタン以外、またはメニュー外をクリックした場合に閉じる
        // UPGRADEアクションはメニューを閉じない
        if (event.target.closest('#tower-popup') && event.target.dataset.action !== 'CANCEL' && event.target.dataset.action !== 'UPGRADE') return;
        if (event.target.closest('.tower-tile')) return; 

        popup.style.display = 'none';
        document.removeEventListener('click', closePopup);
    };
    
    // イベントリスナーを一度削除し、メニュー以外のクリックで閉じるように設定
    document.addEventListener('click', closePopup, true); 

    // 既にタワーが置かれている場合 (管理ポップアップ)
    if (existingTower) {
        const upgradeCost = calculateUpgradeCost(existingTower.level); // 新しいコスト計算
        const sellRefund = Math.floor(TOWER_STATS[existingTower.type].cost * 0.5); 
        
        popup.innerHTML = `
            <p>${existingTower.stats.name} (Lv.${existingTower.level})</p>
            <button data-action="UPGRADE">レベルアップ (${upgradeCost}G)</button>
            <button data-action="SELL">破棄 (${sellRefund}G 回収)</button>
            <button data-action="CANCEL">キャンセル</button>
        `;
        
        popup.querySelectorAll('button').forEach(button => {
            button.onclick = (btnEvent) => {
                const action = btnEvent.target.dataset.action;
                
                if (action === 'UPGRADE') {
                    const success = existingTower.upgrade();
                    // 成功したら、メニューは閉じずに、アップグレードされた情報を再表示
                    if (success) {
                         // 連続強化成功時は、showTowerMenu内でclosePopupを再登録するため、ここで一旦閉じない
                    }
                } else if (action === 'SELL') {
                    existingTower.sell();
                    const index = towers.indexOf(existingTower);
                    if (index > -1) {
                        towers.splice(index, 1);
                    }
                    popup.style.display = 'none';
                } else if (action === 'CANCEL') {
                    popup.style.display = 'none';
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
                const type = btnEvent.target.dataset.type;
                popup.style.display = 'none';
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
        showMessage("ゴールドが足りません！");
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
    newTower.updateVisuals(); 
}


// === ゲーム終了画面関数 ===

function showGameOverScreen() {
    const endScreen = document.getElementById('end-screen');
    const endMessage = document.getElementById('end-message');
    const endScore = document.getElementById('end-score');
    
    endMessage.textContent = "ゲームオーバー！";
    endMessage.style.color = "red";
    
    endScore.textContent = `最終ゴールド: ${currentGold}G`;
    
    endScreen.classList.remove('hidden');
    
    document.getElementById('restart-button').onclick = () => {
        window.location.reload(); 
    };
}

function showGameClearScreen() {
    const endScreen = document.getElementById('end-screen');
    const endMessage = document.getElementById('end-message');
    const endScore = document.getElementById('end-score');
    
    document.getElementById('key-ui').classList.remove('hidden');
    
    endMessage.textContent = "TD成功！脱出のカギを獲得した！";
    endMessage.style.color = "gold"; 
    endScore.textContent = `このカギを脱出ゲームで使おう！`;
    
    endScreen.classList.remove('hidden');
    
    document.getElementById('restart-button').textContent = "脱出ゲームの続きへ";
    document.getElementById('restart-button').onclick = () => {
        document.getElementById('app-container').style.display = 'none'; 
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
    
    enemies.forEach(e => e.el.remove());
    bullets.forEach(b => b.el.remove());
    towers.forEach(t => {
        t.rangeEl.remove(); 
        const tileEl = t.tileEl;
        if (tileEl) tileEl.dataset.occupied = '';
    });
    enemies.length = 0;
    bullets.length = 0;
    towers.length = 0;
    
    if (enemySpawnTimer) clearInterval(enemySpawnTimer);
    if (waveTimer) clearInterval(waveTimer);
    
    document.getElementById('end-screen').classList.add('hidden');
    document.getElementById('key-ui').classList.add('hidden');
}

// script.js の startGame() 関数を修正

function startGame() {
    // UIの表示/非表示のロジックは initTDGame() に移動済み
    
    resetGame();
    startWaves();
    
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function startEscapeGame() {
    console.log("TDクリア！脱出ゲームの次のステップへ移行します。");
    // 次のステップで、この中に脱出ゲームのロジックを入れる！
}


// --- 7. DOMContentLoaded ---

// script.js の DOMContentLoaded 内を修正

document.addEventListener('DOMContentLoaded', () => {
    // 最初にポップアップのコンテナを生成 (Tower設置のために必要)
    const popup = document.createElement('div');
    popup.id = 'tower-popup';

    document.getElementById('td-game-area').appendChild(popup);
    
    // app-root の後に配置する必要があるため、bodyに追加
    document.body.appendChild(popup); 

    // ★★★ TDゲームの初期化とイベント設定を initTDGame に集約 ★★★
    initTDGame(); 
});

// script.js のどこかに追加 (TDゲームの初期設定)
function initTDGame() {
    // TDゲーム本体の各種IDを取得
    const titleScreen = document.getElementById('title-screen');
    const explanationScreen = document.getElementById('explanation-screen');
    const tdGameArea = document.getElementById('td-game-area');
    const startButton = document.getElementById('start-button');
    const tdStartButton = document.getElementById('td-start-button');
    const towerDescriptions = document.getElementById('tower-descriptions');

    // ★★★ 修正箇所1: イベントリスナーの設定 ★★★
    startButton.onclick = () => {
        titleScreen.classList.add('hidden');
        explanationScreen.classList.remove('hidden');
        setupDescriptions(towerDescriptions); // 説明文を生成
    };
    
    tdStartButton.onclick = () => {
        explanationScreen.classList.add('hidden');
        tdGameArea.classList.remove('hidden');
        
        // TDゲーム本体の開始
        startGame(); 
    };

    // 最初にタイトル画面だけを表示
    titleScreen.classList.remove('hidden');
    explanationScreen.classList.add('hidden');
    tdGameArea.classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    
    // TDゲーム関連のDOM要素の取得 (マップ描画に必要)
    gameArea = document.getElementById('game-area');
    drawMap();
    
    // コマの配置イベントをTDゲームエリアで設定
    document.querySelectorAll('.tower-tile').forEach(tile => {
        tile.onclick = (e) => {
            const existingTower = towers.find(t => t.tileEl === tile);
            showTowerMenu(tile, existingTower);
        };
    });
}

// コマの説明を生成する関数 (新規追加)
function setupDescriptions(container) {
    container.innerHTML = ''; // コンテナをクリア
    Object.values(TOWER_STATS).forEach(stats => {
        const item = document.createElement('div');
        item.className = 'tower-desc-item';
        item.innerHTML = `
            <h3 style="color:${stats.color};">${stats.name}</h3>
            <p>攻撃力: ${stats.power} / 射程: ${stats.range} / 攻撃速度: ${stats.speed}回/秒</p>
        `;
        container.appendChild(item);
    });
}
// -----------------------------------------------------------
// ★★★ 既存の startGame() 関数は、TDゲーム開始のロジックのみに集約してください ★★★
// -----------------------------------------------------------