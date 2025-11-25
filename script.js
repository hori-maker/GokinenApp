import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let categories = []; // カテゴリーリスト

// ■ 1. ログイン監視
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('appContent').style.display = 'block';
        
        // アイテムとカテゴリー両方の同期を開始
        startSyncItems(user.uid);
        startSyncCategories(user.uid);
        
        initSortable();
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

// ■ 3-B. カテゴリー同期（新機能）
function startSyncCategories(userId) {
    const q = query(collection(db, "users", userId, "categories"), orderBy("createdAt", "asc"));
    
    onSnapshot(q, async (snapshot) => {
        categories = [];
        snapshot.forEach((doc) => {
            categories.push(doc.data().name);
        });

        // もしカテゴリーが1つもなかったら、初期セットを作る
        if (categories.length === 0) {
            await createDefaultCategories(userId);
        } else {
            renderCategoryOptions(); // プルダウンを更新
        }
    });
}

// 初期カテゴリーを作る関数
async function createDefaultCategories(userId) {
    const defaults = ["総合", "健康", "仕事", "家庭", "広布", "経済"];
    const batch = writeBatch(db);
    defaults.forEach(name => {
        const ref = doc(collection(db, "users", userId, "categories"));
        batch.set(ref, { name: name, createdAt: serverTimestamp() });
    });
    await batch.commit();
}

// プルダウンの中身を作る関数
function renderCategoryOptions() {
    const select = document.getElementById('categorySelect');
    select.innerHTML = ""; // 一旦空にする
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    });
}

// ■ 4. カテゴリー追加ボタン
document.getElementById('addCatBtn').addEventListener('click', async () => {
    const newCat = prompt("新しいカテゴリー名を入力してください");
    if (newCat && newCat.trim() !== "") {
        // 重複チェック
        if (categories.includes(newCat)) {
            alert("そのカテゴリーは既にあります");
            return;
        }
        await addDoc(collection(db, "users", currentUser.uid, "categories"), {
            name: newCat.trim(),
            createdAt: serverTimestamp()
        });
        // 追加したら自動でそのカテゴリーを選択状態にする
        setTimeout(() => {
            document.getElementById('categorySelect').value = newCat.trim();
        }, 500);
    }
});

// ■ 5. 名前から色を自動生成する関数（ハッシュ計算）
function getColor(str) {
    if (!str) return "#e2e3e5"; // なければグレー
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // パステルカラーっぽい色を作る
    const h = hash % 360;
    return `hsl(${h}, 70%, 85%)`; // 色相(H)を変化させ、彩度・明度は固定
}

// ■ 6. 並び替え
function initSortable() {
    const activeList = document.getElementById('activeList');
    new Sortable(activeList, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: async function () {
            const itemElements = activeList.querySelectorAll('li');
            const newOrderIds = Array.from(itemElements).map(el => el.getAttribute('data-id'));
            const batch = writeBatch(db);
            newOrderIds.forEach((id, index) => {
                const ref = doc(db, "users", currentUser.uid, "items", id);
                batch.update(ref, { order: index });
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
    const maxOrder = gokinenItems.length > 0 ? Math.max(...gokinenItems.map(i => i.order)) : 0;
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

// ■ 8. 各種ボタン機能
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
    if(inputVal === "") return alert("内容を入力してください");
    const item = gokinenItems.find(i => i.id === id);
    if(item) item.isEditing = false;
    renderList();
    const itemRef = doc(db, "users", currentUser.uid, "items", id);
    await updateDoc(itemRef, { text: inputVal });
};

// ■ 9. 描画
function renderList() {
    const activeList = document.getElementById('activeList');
    const fulfilledList = document.getElementById('fulfilledList');
    activeList.innerHTML = '';
    fulfilledList.innerHTML = '';

    gokinenItems.forEach(item => {
        const li = document.createElement('li');
        li.setAttribute('data-id', item.id);

        const catName = item.category || "総合";
        // ★名前から色を自動計算して背景色にする
        const bgColor = getColor(catName);
        const catBadge = `<span class="cat-badge" style="background-color:${bgColor}">${catName}</span>`;

        if (!item.isFulfilled) {
            if (item.isEditing) {
                li.innerHTML = `
                    <div style="width:100%;">
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
                        ${catBadge}
                        <span style="flex:1; margin-left:5px; white-space: pre-wrap;">${item.text}</span>
                    </div>
                    <div style="display:flex; flex-shrink:0;">
                        <button class="btn-edit" onclick="startEdit('${item.id}')">編</button>
                        <button class="btn-fulfill" onclick="fulfillItem('${item.id}')">叶</button>
                        <button class="btn-delete" onclick="deleteItem('${item.id}')">削</button>
                    </div>
                `;
            }
            activeList.appendChild(li);
        } else {
            li.classList.add('fulfilled-item');
            li.innerHTML = `
                <div>
                    ${catBadge}
                    <span style="white-space: pre-wrap;">${item.text}</span>
                    <span class="date-label">達成日: ${item.fulfilledDate}</span>
                </div>
                <button class="btn-delete" onclick="deleteItem('${item.id}')">削</button>
            `;
            fulfilledList.insertBefore(li, fulfilledList.firstChild);
        }
    });
}