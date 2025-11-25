import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ▼▼▼ あなたの鍵の設定（書き換えてください！） ▼▼▼
  const firebaseConfig = {
    apiKey: "AIzaSyAw0esiXUv6TfvkYa3ag4Uo2HNV9A3srNY",
    authDomain: "gokinen-app.firebaseapp.com",
    projectId: "gokinen-app",
    storageBucket: "gokinen-app.firebasestorage.app",
    messagingSenderId: "894591263464",
    appId: "1:894591263464:web:e14e84506dfabb597c1f5d"
  };
// ▲▲▲ 書き換えここまで ▲▲▲

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let gokinenItems = [];
let categories = []; 

// ■ 1. ログイン監視
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('appContent').style.display = 'block';
        startSyncItems(user.uid);
        startSyncCategories(user.uid);
    } else {
        currentUser = null;
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('appContent').style.display = 'none';
    }
});

// ■ 2. ログイン・ログアウト
document.getElementById('loginBtn').addEventListener('click', () => {
    signInWithPopup(auth, provider).catch((error) => alert("ログイン失敗: " + error.message));
});
document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth);
});

// ■ 3-A. アイテム同期
function startSyncItems(userId) {
    const q = query(collection(db, "users", userId, "items"), orderBy("createdAt", "asc"));
    onSnapshot(q, (snapshot) => {
        const newItems = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            newItems.push({
                id: doc.id,
                ...data,
                order: data.order ?? (data.createdAt ? data.createdAt.toMillis() : 0),
                isEditing: gokinenItems.find(i => i.id === doc.id)?.isEditing || false
            });
        });
        // 全体をオーダー順に並べておく
        newItems.sort((a, b) => a.order - b.order);
        gokinenItems = newItems;
        renderList();
    });
}

// ■ 3-B. カテゴリー同期
function startSyncCategories(userId) {
    const q = query(collection(db, "users", userId, "categories"), orderBy("createdAt", "asc"));
    onSnapshot(q, async (snapshot) => {
        categories = [];
        snapshot.forEach((doc) => {
            categories.push(doc.data().name);
        });
        if (categories.length === 0) {
            await createDefaultCategories(userId);
        } else {
            renderCategoryOptions();
            renderList(); // カテゴリーが増えたらリストも再描画
        }
    });
}

async function createDefaultCategories(userId) {
    const defaults = ["総合", "健康", "仕事", "家庭", "広布", "経済"];
    const batch = writeBatch(db);
    defaults.forEach(name => {
        const ref = doc(collection(db, "users", userId, "categories"));
        batch.set(ref, { name: name, createdAt: serverTimestamp() });
    });
    await batch.commit();
}

function renderCategoryOptions() {
    const select = document.getElementById('categorySelect');
    select.innerHTML = "";
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    });
}

// ■ 4. カテゴリー追加
document.getElementById('addCatBtn').addEventListener('click', async () => {
    const newCat = prompt("新しいカテゴリー名を入力してください");
    if (newCat && newCat.trim() !== "") {
        if (categories.includes(newCat)) {
            alert("そのカテゴリーは既にあります");
            return;
        }
        await addDoc(collection(db, "users", currentUser.uid, "categories"), {
            name: newCat.trim(),
            createdAt: serverTimestamp()
        });
        setTimeout(() => {
            document.getElementById('categorySelect').value = newCat.trim();
        }, 500);
    }
});

function getColor(str) {
    if (!str) return "#e2e3e5";
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h}, 70%, 85%)`;
}

// ■ 5. 並び替え（カテゴリー間移動対応版）
function initSortable() {
    // クラス名 .sortable-list がついている全てのリストに対してSortableを適用
    const lists = document.querySelectorAll('.sortable-list');
    
    lists.forEach(list => {
        new Sortable(list, {
            group: 'shared', // ★重要：これをつけるとリスト間で移動できるようになる
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            
            // ドラッグが終わった時の処理
            onEnd: async function (evt) {
                const itemEl = evt.item; // 動かした要素
                const newList = evt.to; // 移動先のリスト（ul）
                const itemId = itemEl.getAttribute('data-id');
                
                // 移動先のカテゴリー名を取得
                const newCategory = newList.getAttribute('data-category');
                
                // そのリスト内の新しい並び順IDを取得
                const newOrderIds = Array.from(newList.querySelectorAll('li')).map(el => el.getAttribute('data-id'));
                
                // 一括更新
                const batch = writeBatch(db);
                
                // 1. 移動したアイテムのカテゴリーを更新
                const itemRef = doc(db, "users", currentUser.uid, "items", itemId);
                batch.update(itemRef, { category: newCategory });

                // 2. 移動先のリスト内の順番を更新
                newOrderIds.forEach((id, index) => {
                    const ref = doc(db, "users", currentUser.uid, "items", id);
                    batch.update(ref, { order: index });
                });

                // 3. もし元のリストと違うなら、元のリストの順番も整え直してもいいが、
                // 今回は「order」はカテゴリー内での相対順序として扱うので、移動先だけ整えればOK
                
                await batch.commit();
            }
        });
    });
}

// ■ 6. アイテム追加
const input = document.getElementById('gokinenInput');
const categorySelect = document.getElementById('categorySelect');

document.getElementById('addBtn').addEventListener('click', addItem);
input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing && !event.shiftKey) {
        event.preventDefault();
        addItem();
    }
});

async function addItem() {
    const rawText = input.value;
    const category = categorySelect.value || "総合";
    if (rawText.trim() === "") return;

    const lines = rawText.split(/\n/);
    
    // そのカテゴリー内での最大オーダーを探す
    const sameCatItems = gokinenItems.filter(i => (i.category || "総合") === category);
    const maxOrder = sameCatItems.length > 0 ? Math.max(...sameCatItems.map(i => i.order)) : 0;
    let currentOrder = maxOrder + 1;
    
    const batch = writeBatch(db);

    for (const line of lines) {
        const text = line.trim();
        if (text !== "") {
            const newDocRef = doc(collection(db, "users", currentUser.uid, "items"));
            batch.set(newDocRef, {
                text: text, category: category, isFulfilled: false, fulfilledDate: null, createdAt: serverTimestamp(), order: Date.now() + currentOrder
            });
            currentOrder++;
        }
    }
    await batch.commit();
    input.value = '';
}

// ■ 7. 操作機能
window.fulfillItem = async (id) => {
    const itemRef = doc(db, "users", currentUser.uid, "items", id);
    const now = new Date();
    const dateStr = now.getFullYear() + "/" + (now.getMonth() + 1) + "/" + now.getDate();
    await updateDoc(itemRef, { isFulfilled: true, fulfilledDate: dateStr });
    alert("おめでとうございます！記録しました。");
};
window.deleteItem = async (id) => {
    if(confirm("本当に削除してよろしいですか？")) {
        await deleteDoc(doc(db, "users", currentUser.uid, "items", id));
    }
};

window.startEdit = (id) => {
    const item = gokinenItems.find(i => i.id === id);
    if(item) { item.isEditing = true; renderList(); }
};
window.cancelEdit = (id) => {
    const item = gokinenItems.find(i => i.id === id);
    if(item) { item.isEditing = false; renderList(); }
};

window.saveEdit = async (id) => {
    const inputVal = document.getElementById(`edit-input-${id}`).value.trim();
    const catVal = document.getElementById(`edit-cat-${id}`).value;
    if(inputVal === "") return alert("内容を入力してください");

    const item = gokinenItems.find(i => i.id === id);
    if(item) item.isEditing = false;
    renderList();

    const itemRef = doc(db, "users", currentUser.uid, "items", id);
    await updateDoc(itemRef, { text: inputVal, category: catVal });
};

// ■ 8. 描画（カテゴリー別分割表示）
function renderList() {
    const container = document.getElementById('activeListContainer');
    const fulfilledList = document.getElementById('fulfilledList');
    
    container.innerHTML = '';
    fulfilledList.innerHTML = '';

    // ★カテゴリーごとに箱を作る
    // "総合"など既存のカテゴリー + アイテムについてるけどリストにない未知のカテゴリーも網羅
    const allCats = new Set([...categories, "総合"]);
    gokinenItems.forEach(i => allCats.add(i.category || "総合"));
    
    // カテゴリーのリストを配列にしてソート（総合を先頭に）
    const sortedCats = Array.from(allCats).sort((a, b) => {
        if(a === "総合") return -1;
        if(b === "総合") return 1;
        return a.localeCompare(b);
    });

    // 1. 未達成リストの描画
    sortedCats.forEach(catName => {
        // そのカテゴリーに属するアイテムを抽出
        const itemsInCat = gokinenItems.filter(i => !i.isFulfilled && (i.category || "総合") === catName);
        
        // 色生成
        const bgColor = getColor(catName);

        // カテゴリーのヘッダー作成
        const header = document.createElement('div');
        header.className = 'category-header';
        header.style.borderLeftColor = bgColor.replace('85%', '60%'); // 少し濃い色を枠線に
        header.innerHTML = `<span>${catName}</span> <span style="font-size:0.8rem; color:#888;">${itemsInCat.length}件</span>`;
        container.appendChild(header);

        // カテゴリーごとのリスト（ul）作成
        const ul = document.createElement('ul');
        ul.className = 'list-group sortable-list';
        ul.setAttribute('data-category', catName); // 移動したときにどのカテゴリーかわかるようにする

        // アイテムを入れる
        itemsInCat.forEach(item => {
            const li = createLi(item);
            ul.appendChild(li);
        });

        container.appendChild(ul);
    });

    // 2. 達成済みリストの描画（ここは今まで通り一括で、カテゴリーバッジを表示）
    const fulfilledItems = gokinenItems.filter(i => i.isFulfilled);
    // 達成日順（新しい順）に並べ替え
    fulfilledItems.sort((a, b) => new Date(b.fulfilledDate) - new Date(a.fulfilledDate));

    fulfilledItems.forEach(item => {
        const li = document.createElement('li');
        li.classList.add('fulfilled-item');
        const catName = item.category || "総合";
        const badge = `<span class="cat-badge" style="background-color:${getColor(catName)}">${catName}</span>`;
        
        li.innerHTML = `
            <div>
                ${badge}
                <span style="white-space: pre-wrap;">${item.text}</span>
                <span class="date-label">達成日: ${item.fulfilledDate}</span>
            </div>
            <button class="btn-delete" onclick="deleteItem('${item.id}')">削</button>
        `;
        fulfilledList.appendChild(li);
    });

    // Sortableを全リストに適用
    initSortable();
}

// LI要素を作る関数（コードを見やすくするために分離）
function createLi(item) {
    const li = document.createElement('li');
    li.setAttribute('data-id', item.id);
    
    // バッジはヘッダーがあるので、リスト内ではあえて表示しなくてもスッキリするかも？
    // でも編集時のためにカテゴリー情報は持っておく
    
    if (item.isEditing) {
        let catOptions = "";
        categories.forEach(c => {
            const selected = (c === (item.category || "総合")) ? "selected" : "";
            catOptions += `<option value="${c}" ${selected}>${c}</option>`;
        });

        li.innerHTML = `
            <div style="width:100%;">
                <div style="margin-bottom:5px;">
                    <select id="edit-cat-${item.id}" style="padding:5px; border-radius:4px; border:1px solid #ccc;">
                        ${catOptions}
                    </select>
                </div>
                <textarea id="edit-input-${item.id}" class="edit-input" rows="2">${item.text}</textarea>
                <div style="margin-top:5px; text-align:right;">
                    <button class="btn-save" onclick="saveEdit('${item.id}')">保存</button>
                    <button class="btn-cancel" onclick="cancelEdit('${item.id}')">キャンセル</button>
                </div>
            </div>
        `;
    } else {
        li.innerHTML = `
            <div style="display:flex; align-items:center; width:100%;">
                <span class="drag-handle">≡</span>
                <span style="flex:1; margin-left:5px; white-space: pre-wrap;">${item.text}</span>
            </div>
            <div style="display:flex; flex-shrink:0;">
                <button class="btn-edit" onclick="startEdit('${item.id}')">編</button>
                <button class="btn-fulfill" onclick="fulfillItem('${item.id}')">叶</button>
                <button class="btn-delete" onclick="deleteItem('${item.id}')">削</button>
            </div>
        `;
    }
    return li;
}