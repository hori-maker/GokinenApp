import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, writeBatch, getDocs, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let categories = []; // オブジェクト配列に変更 {id, name, order}

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
        newItems.sort((a, b) => a.order - b.order);
        gokinenItems = newItems;
        renderList();
    });
}

// ■ 3-B. カテゴリー同期（順番対応）
function startSyncCategories(userId) {
    // order順で取得したいが、既存データにorderがない場合もあるのでcreatedAt順で取得して並べ直す
    const q = query(collection(db, "users", userId, "categories"), orderBy("createdAt", "asc"));
    
    onSnapshot(q, async (snapshot) => {
        categories = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            categories.push({
                id: doc.id,
                name: data.name,
                order: data.order ?? (data.createdAt ? data.createdAt.toMillis() : 0)
            });
        });

        // カテゴリーがゼロなら初期作成
        if (categories.length === 0 && !snapshot.metadata.hasPendingWrites) {
            // データが本当に空の時だけ実行（読み込み遅延対策）
             const snapshotCheck = await getDocs(collection(db, "users", userId, "categories"));
             if (snapshotCheck.empty) {
                 await createDefaultCategories(userId);
                 return;
             }
        }
        
        // オーダー順に並び替え
        categories.sort((a, b) => a.order - b.order);

        renderCategoryOptions();
        renderList();
    });
}

async function createDefaultCategories(userId) {
    const defaults = ["総合", "健康", "仕事", "家庭", "広布", "経済"];
    const batch = writeBatch(db);
    let orderCounter = 0;
    defaults.forEach(name => {
        const ref = doc(collection(db, "users", userId, "categories"));
        batch.set(ref, { 
            name: name, 
            createdAt: serverTimestamp(),
            order: orderCounter++ 
        });
    });
    await batch.commit();
}

function renderCategoryOptions() {
    const select = document.getElementById('categorySelect');
    select.innerHTML = "";
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.name;
        option.textContent = cat.name;
        select.appendChild(option);
    });
}

// ■ 4. カテゴリー追加
document.getElementById('addCatBtn').addEventListener('click', async () => {
    const newCat = prompt("新しいカテゴリー名を入力してください");
    if (newCat && newCat.trim() !== "") {
        if (categories.some(c => c.name === newCat)) {
            alert("そのカテゴリーは既にあります");
            return;
        }
        // 一番下に追加
        const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.order)) : 0;
        
        await addDoc(collection(db, "users", currentUser.uid, "categories"), {
            name: newCat.trim(),
            createdAt: serverTimestamp(),
            order: maxOrder + 1
        });
        setTimeout(() => {
            document.getElementById('categorySelect').value = newCat.trim();
        }, 500);
    }
});

// ■ 5. カテゴリー削除（重要！）
window.deleteCategory = async (catId, catName) => {
    if (catName === "総合") {
        alert("「総合」カテゴリーは削除できません");
        return;
    }

    if (!confirm(`カテゴリー「${catName}」を削除しますか？\n（中の項目は「総合」に移動します）`)) {
        return;
    }

    const batch = writeBatch(db);

    // 1. そのカテゴリーに属するアイテムを探して「総合」に変更
    const itemsToMove = gokinenItems.filter(i => i.category === catName);
    itemsToMove.forEach(item => {
        const itemRef = doc(db, "users", currentUser.uid, "items", item.id);
        batch.update(itemRef, { category: "総合" });
    });

    // 2. カテゴリー自体を削除
    const catRef = doc(db, "users", currentUser.uid, "categories", catId);
    batch.delete(catRef);

    await batch.commit();
};


function getColor(str) {
    if (!str) return "#e2e3e5";
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h}, 70%, 85%)`;
}

// ■ 6. 並び替え（カテゴリー並び替え対応！）
function initSortable() {
    // 1. アイテムの並び替え（リスト間移動）
    const itemLists = document.querySelectorAll('.sortable-item-list');
    itemLists.forEach(list => {
        new Sortable(list, {
            group: 'shared-items',
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: async function (evt) {
                // アイテム移動の処理（前回と同じ）
                const itemEl = evt.item;
                const newList = evt.to;
                const itemId = itemEl.getAttribute('data-id');
                const newCategory = newList.getAttribute('data-category');
                const newOrderIds = Array.from(newList.querySelectorAll('li')).map(el => el.getAttribute('data-id'));
                
                const batch = writeBatch(db);
                const itemRef = doc(db, "users", currentUser.uid, "items", itemId);
                batch.update(itemRef, { category: newCategory });
                newOrderIds.forEach((id, index) => {
                    const ref = doc(db, "users", currentUser.uid, "items", id);
                    batch.update(ref, { order: index });
                });
                await batch.commit();
            }
        });
    });

    // 2. ★カテゴリー自体の並び替え★
    const catContainer = document.getElementById('activeListContainer');
    new Sortable(catContainer, {
        handle: '.category-header', // ヘッダーをつかんで動かす
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: async function (evt) {
            // 並び替わったカテゴリーの順番を取得
            const catDivs = catContainer.querySelectorAll('.category-block');
            const batch = writeBatch(db);
            
            catDivs.forEach((div, index) => {
                const catId = div.getAttribute('data-cat-id');
                if(catId) { // 総合(IDなし)以外
                     const ref = doc(db, "users", currentUser.uid, "categories", catId);
                     batch.update(ref, { order: index });
                }
            });
            await batch.commit();
        }
    });
}

// ■ 7. アイテム追加
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

// ■ 8. 操作系
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

// ■ 9. 描画（カテゴリー並び替え対応版）
function renderList() {
    const container = document.getElementById('activeListContainer');
    const fulfilledList = document.getElementById('fulfilledList');
    
    container.innerHTML = '';
    fulfilledList.innerHTML = '';

    // カテゴリーリストを使って表示（なければ"総合"だけ作る）
    // order順に並んでいるcategories配列を使う
    const displayCats = [...categories];
    // もしDBに保存されていない「総合」がcategoriesになければ、手動で先頭に追加する
    if (!displayCats.some(c => c.name === "総合")) {
        displayCats.unshift({ id: null, name: "総合", order: -1 });
    }

    // 1. カテゴリーごとの箱を作る
    displayCats.forEach(catObj => {
        const catName = catObj.name;
        
        // そのカテゴリーのアイテム
        const itemsInCat = gokinenItems.filter(i => !i.isFulfilled && (i.category || "総合") === catName);
        
        // カテゴリーのブロック全体（ドラッグ対象）
        const catBlock = document.createElement('div');
        catBlock.className = 'category-block';
        catBlock.setAttribute('data-cat-id', catObj.id || ""); // IDを埋め込む

        // 色
        const bgColor = getColor(catName);

        // 削除ボタン（総合にはつけない）
        const deleteBtn = (catName !== "総合") 
            ? `<button class="btn-cat-delete" onclick="deleteCategory('${catObj.id}', '${catName}')">×</button>` 
            : "";

        // ヘッダー作成
        const header = document.createElement('div');
        header.className = 'category-header';
        header.style.borderLeftColor = bgColor.replace('85%', '60%');
        header.innerHTML = `
            <div>
                <span>${catName}</span> 
                <span style="font-size:0.8rem; color:#888; margin-left:5px;">${itemsInCat.length}件</span>
            </div>
            ${deleteBtn}
        `;
        catBlock.appendChild(header);

        // リスト（ul）作成
        const ul = document.createElement('ul');
        ul.className = 'list-group sortable-item-list'; // アイテム用のクラス
        ul.setAttribute('data-category', catName);

        itemsInCat.forEach(item => {
            const li = createLi(item);
            ul.appendChild(li);
        });

        catBlock.appendChild(ul);
        container.appendChild(catBlock);
    });

    // 2. 達成済みリスト
    const fulfilledItems = gokinenItems.filter(i => i.isFulfilled);
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

    initSortable();
}

function createLi(item) {
    const li = document.createElement('li');
    li.setAttribute('data-id', item.id);
    
    if (item.isEditing) {
        let catOptions = "";
        categories.forEach(c => {
            const selected = (c.name === (item.category || "総合")) ? "selected" : "";
            catOptions += `<option value="${c.name}" ${selected}>${c.name}</option>`;
        });
        // 総合がリストにない場合の対策
        if (!categories.some(c => c.name === "総合")) {
             const selected = ("総合" === (item.category || "総合")) ? "selected" : "";
             catOptions = `<option value="総合" ${selected}>総合</option>` + catOptions;
        }

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