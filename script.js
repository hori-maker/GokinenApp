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

// ■ 1. ログイン監視
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('appContent').style.display = 'block';
        startSync(user.uid);
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

// ■ 3. データ同期
function startSync(userId) {
    const q = query(collection(db, "users", userId, "items"), orderBy("createdAt", "asc"));

    onSnapshot(q, (snapshot) => {
        const newItems = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            newItems.push({
                id: doc.id,
                ...data,
                order: data.order ?? (data.createdAt ? data.createdAt.toMillis() : 0),
                // 編集中かどうかの状態は、既存のリストから引き継ぐ
                isEditing: gokinenItems.find(i => i.id === doc.id)?.isEditing || false
            });
        });
        
        newItems.sort((a, b) => a.order - b.order);
        gokinenItems = newItems; // データを更新
        renderList();
    });
}

// ■ 4. 並び替え（SortableJS）
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

// ■ 5. 追加機能
const input = document.getElementById('gokinenInput');
document.getElementById('addBtn').addEventListener('click', addItem);
input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing && !event.shiftKey) {
        event.preventDefault();
        addItem();
    }
});

async function addItem() {
    const rawText = input.value;
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
                text: text, isFulfilled: false, fulfilledDate: null, createdAt: serverTimestamp(), order: Date.now() + currentOrder
            });
            currentOrder++;
        }
    }
    await batch.commit();
    input.value = '';
}

// ■ 6. 叶った・削除・編集機能
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

// --- ★ここから下が新機能（編集）です★ ---

// 編集ボタンを押した時：入力モードにする
window.startEdit = (id) => {
    const item = gokinenItems.find(i => i.id === id);
    if(item) {
        item.isEditing = true; // 編集中のフラグを立てる
        renderList(); // 画面を書き直す（入力欄が現れる）
    }
};

// キャンセルボタンを押した時：元に戻す
window.cancelEdit = (id) => {
    const item = gokinenItems.find(i => i.id === id);
    if(item) {
        item.isEditing = false;
        renderList();
    }
};

// 保存ボタンを押した時：Firebaseを更新
window.saveEdit = async (id) => {
    const inputVal = document.getElementById(`edit-input-${id}`).value.trim();
    if(inputVal === "") return alert("内容を入力してください");

    // 画面上で一旦編集モードを終わらせる
    const item = gokinenItems.find(i => i.id === id);
    if(item) item.isEditing = false;
    renderList();

    // Firebaseに送信
    const itemRef = doc(db, "users", currentUser.uid, "items", id);
    await updateDoc(itemRef, { text: inputVal });
};

// ■ 7. 描画
function renderList() {
    const activeList = document.getElementById('activeList');
    const fulfilledList = document.getElementById('fulfilledList');
    activeList.innerHTML = '';
    fulfilledList.innerHTML = '';

    gokinenItems.forEach(item => {
        const li = document.createElement('li');
        li.setAttribute('data-id', item.id);

        if (!item.isFulfilled) {
            // --- 未達成リスト ---
            if (item.isEditing) {
                // ★ 編集中の見た目（入力欄 + 保存 + キャンセル）
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
                // ★ 通常の見た目（テキスト + 編集 + 叶 + 削）
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
            activeList.appendChild(li);
        } else {
            // --- 達成済みリスト（編集不可） ---
            li.classList.add('fulfilled-item');
            li.innerHTML = `
                <div>
                    <span style="white-space: pre-wrap;">${item.text}</span>
                    <span class="date-label">達成日: ${item.fulfilledDate}</span>
                </div>
                <button class="btn-delete" onclick="deleteItem('${item.id}')">削</button>
            `;
            fulfilledList.insertBefore(li, fulfilledList.firstChild);
        }
    });
}