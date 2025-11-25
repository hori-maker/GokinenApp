document.addEventListener('DOMContentLoaded', () => {
    loadItems();
    initSortable(); // 並び替え機能を有効にする

        // --- ↓↓ ここから追加 ↓↓ ---
    // Enterキーで追加できるようにする設定
    const input = document.getElementById('gokinenInput');
    input.addEventListener('keydown', (event) => {
        // 「Enterキーが押された」かつ「日本語変換中じゃない」とき
        if (event.key === 'Enter' && !event.isComposing) {
            addItem();
        }
    });
    // --- ↑↑ ここまで追加 ↑↑ ---
});

let gokinenItems = [];

// 並び替え機能を設定する関数
function initSortable() {
    const activeList = document.getElementById('activeList');
    
    new Sortable(activeList, {
        handle: '.drag-handle', // このクラスの要素をつまんでドラッグする
        animation: 150, // アニメーションの速度
        ghostClass: 'sortable-ghost', // ドラッグ中の見た目
        
        // 並び替えが終わった時に呼ばれる
        onEnd: function () {
            // 1. 画面上の並び順（ID）を全部取得する
            const itemElements = activeList.querySelectorAll('li');
            const newOrderIds = Array.from(itemElements).map(el => parseInt(el.getAttribute('data-id')));

            // 2. 元のデータを、新しい順番に作り直す
            // (まだ叶っていない項目を、画面の通りに並べる)
            const activeItems = [];
            newOrderIds.forEach(id => {
                const item = gokinenItems.find(i => i.id === id);
                if (item) activeItems.push(item);
            });

            // (すでに叶った項目は、その後ろにくっつけるだけ)
            const fulfilledItems = gokinenItems.filter(i => i.isFulfilled);

            // 3. 合体させて保存
            gokinenItems = [...activeItems, ...fulfilledItems];
            saveData(); // 画面再描画は不要（すでに動いているから）
        }
    });
}

function addItem() {
    const input = document.getElementById('gokinenInput');
    const text = input.value.trim();
    if (text === "") {
        alert("ご祈念項目を入力してください");
        return;
    }
    const newItem = {
        id: Date.now(),
        text: text,
        isFulfilled: false,
        fulfilledDate: null
    };
    // 新しい項目は一番上に追加（unshift）
    gokinenItems.unshift(newItem);
    input.value = '';
    saveAndRender();
}

function fulfillItem(id) {
    const item = gokinenItems.find(item => item.id === id);
    if (item) {
        item.isFulfilled = true;
        const now = new Date();
        const dateStr = now.getFullYear() + "/" + 
                        (now.getMonth() + 1) + "/" + 
                        now.getDate() + " " + 
                        now.getHours() + ":" + 
                        String(now.getMinutes()).padStart(2, '0');
        item.fulfilledDate = dateStr;
        
        // 叶った項目は配列の後ろへ移動させる
        gokinenItems = gokinenItems.filter(i => i.id !== id); // 一旦消す
        gokinenItems.push(item); // 後ろに追加

        saveAndRender();
        alert("おめでとうございます！記録しました。");
    }
}

function deleteItem(id) {
    if(confirm("本当に削除してよろしいですか？")) {
        gokinenItems = gokinenItems.filter(item => item.id !== id);
        saveAndRender();
    }
}

function saveData() {
    localStorage.setItem('gokinenData', JSON.stringify(gokinenItems));
}

function saveAndRender() {
    saveData();
    renderList();
}

function renderList() {
    const activeList = document.getElementById('activeList');
    const fulfilledList = document.getElementById('fulfilledList');
    activeList.innerHTML = '';
    fulfilledList.innerHTML = '';

    gokinenItems.forEach(item => {
        const li = document.createElement('li');
        // 並び替えのためにIDを埋め込む
        li.setAttribute('data-id', item.id);

        if (!item.isFulfilled) {
            // --- まだ叶っていない項目 ---
            li.innerHTML = `
                <div style="display:flex; align-items:center; width:100%;">
                    <!-- つまむマーク -->
                    <span class="drag-handle">≡</span>
                    <span style="flex:1; margin-left:5px;">${item.text}</span>
                </div>
                <div style="display:flex; flex-shrink:0;">
                    <button class="btn-fulfill" onclick="fulfillItem(${item.id})">叶</button>
                    <button class="btn-delete" onclick="deleteItem(${item.id})">削</button>
                </div>
            `;
            activeList.appendChild(li);
        } else {
            // --- 叶った項目 ---
            li.classList.add('fulfilled-item');
            li.innerHTML = `
                <div>
                    <span>${item.text}</span>
                    <span class="date-label">達成日: ${item.fulfilledDate}</span>
                </div>
                <button class="btn-delete" onclick="deleteItem(${item.id})">削</button>
            `;
            // 叶ったリストは上に追加していく
            fulfilledList.insertBefore(li, fulfilledList.firstChild);
        }
    });
}

function loadItems() {
    const storedData = localStorage.getItem('gokinenData');
    if (storedData) {
        gokinenItems = JSON.parse(storedData);
        renderList();
    }
}