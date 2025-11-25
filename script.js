document.addEventListener('DOMContentLoaded', () => {
    loadItems();
    initSortable();

    // Enterキー設定
    const input = document.getElementById('gokinenInput');
    input.addEventListener('keydown', (event) => {
        // Shift+Enterは改行したいので除外、ただのEnterのみ反応させる
        if (event.key === 'Enter' && !event.isComposing && !event.shiftKey) {
            event.preventDefault(); // Enterでの改行入力を防ぐ
            addItem();
        }
    });
});

let gokinenItems = [];

function initSortable() {
    const activeList = document.getElementById('activeList');
    
    new Sortable(activeList, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: function () {
            const itemElements = activeList.querySelectorAll('li');
            const newOrderIds = Array.from(itemElements).map(el => parseInt(el.getAttribute('data-id')));

            const activeItems = [];
            newOrderIds.forEach(id => {
                const item = gokinenItems.find(i => i.id === id);
                if (item) activeItems.push(item);
            });

            const fulfilledItems = gokinenItems.filter(i => i.isFulfilled);

            gokinenItems = [...activeItems, ...fulfilledItems];
            saveData();
        }
    });
}

function addItem() {
    const input = document.getElementById('gokinenInput');
    const rawText = input.value; // 入力されたそのままの文字
    
    if (rawText.trim() === "") {
        alert("ご祈念項目を入力してください");
        return;
    }

    // ★ここがポイント：改行で区切って、行ごとに処理する
    const lines = rawText.split(/\n/);

    lines.forEach((line, index) => {
        const text = line.trim();
        if (text !== "") {
            const newItem = {
                // 複数同時追加でIDが被らないように少しずらす
                id: Date.now() + index, 
                text: text,
                isFulfilled: false,
                fulfilledDate: null
            };
            // ★ここを変更：unshift(先頭)ではなくpush(末尾)にする
            gokinenItems.push(newItem);
        }
    });

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
        
        // 叶ったものはリストの後ろへ
        gokinenItems = gokinenItems.filter(i => i.id !== id);
        gokinenItems.push(item);

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
        li.setAttribute('data-id', item.id);

        if (!item.isFulfilled) {
            li.innerHTML = `
                <div style="display:flex; align-items:center; width:100%;">
                    <span class="drag-handle">≡</span>
                    <span style="flex:1; margin-left:5px; white-space: pre-wrap;">${item.text}</span>
                </div>
                <div style="display:flex; flex-shrink:0;">
                    <button class="btn-fulfill" onclick="fulfillItem(${item.id})">叶</button>
                    <button class="btn-delete" onclick="deleteItem(${item.id})">削</button>
                </div>
            `;
            activeList.appendChild(li);
        } else {
            li.classList.add('fulfilled-item');
            li.innerHTML = `
                <div>
                    <span style="white-space: pre-wrap;">${item.text}</span>
                    <span class="date-label">達成日: ${item.fulfilledDate}</span>
                </div>
                <button class="btn-delete" onclick="deleteItem(${item.id})">削</button>
            `;
            // 達成リストは新しいものが上がいいかな？(下に追加したい場合は appendChild に変えてください)
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