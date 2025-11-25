// Firebaseの機能を読み込み
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ▼▼▼ あなたの鍵の設定（ここを書き換えてください！） ▼▼▼
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
        initSortable(); // 並び替え機能ON
    } else {
        currentUser = null;
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('appContent').style.display = 'none';
    }
});

// ■ 2. ボタン設定
document.getElementById('loginBtn').addEventListener('click', () => {
    signInWithPopup(auth, provider).catch((error) => alert("ログイン失敗: " + error.message));
});
document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth);
});

// ■ 3. データ同期（並び替え対応版）
function startSync(userId) {
    // データを作成日順に取得
    const q = query(
        collection(db, "users", userId, "items"), 
        orderBy("createdAt", "asc")
    );

    onSnapshot(q, (snapshot) => {
        gokinenItems = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            gokinenItems.push({
                id: doc.id,
                ...data,
                // 並び順がない場合は、作成日(数値)を代用する
                order: data.order ?? (data.createdAt ? data.createdAt.toMillis() : 0)
            });
        });

        // ここで「order」の数字が小さい順に並び替える
        gokinenItems.sort((a, b) => a.order - b.order);

        renderList();
    });
}

// ■ 4. 並び替え機能（SortableJS）
function initSortable() {
    const activeList = document.getElementById('activeList');
    
    new Sortable(activeList, {
        handle: '.drag-handle', // つまむ場所
        animation: 150,
        ghostClass: 'sortable-ghost',
        
        // 並び替えが終わった時
        onEnd: async function () {
            // 1. 画面上のIDの順番を取得
            const itemElements = activeList.querySelectorAll('li');
            const newOrderIds = Array.from(itemElements).map(el => el.getAttribute('data-id'));

            // 2. まとめて更新の準備（Batch）
            const batch = writeBatch(db);

            // 3. 未達成リストの順番を更新（0, 1, 2...と番号を振り直す）
            newOrderIds.forEach((id, index) => {
                const ref = doc(db, "users", currentUser.uid, "items", id);
                batch.update(ref, { order: index });
            });

            // 4. Firebaseに送信
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
    
    // 現在の一番大きいorder値を取得（一番下に追加するため）
    const maxOrder = gokinenItems.length > 0 
        ? Math.max(...gokinenItems.map(i => i.order)) 
        : 0;

    let currentOrder = maxOrder + 1; // 続きの番号からスタート

    // まとめて処理
    const batch = writeBatch(db); // 一括追加用

    for (const line of lines) {
        const text = line.trim();
        if (text !== "") {
            const newDocRef = doc(collection(db, "users", currentUser.uid, "items"));
            batch.set(newDocRef, {
                text: text,
                isFulfilled: false,
                fulfilledDate: null,
                createdAt: serverTimestamp(),
                order: Date.now() + currentOrder // 大きな数字にして一番下にする
            });
            currentOrder++;
        }
    }
    await batch.commit(); // 送信
    input.value = '';
}

// ■ 6. 叶った・削除
window.fulfillItem = async (id) => {
    const item = gokinenItems.find(i => i.id === id);
    if (!item) return;

    const now = new Date();
    const dateStr = now.getFullYear() + "/" + (now.getMonth() + 1) + "/" + now.getDate();

    const itemRef = doc(db, "users", currentUser.uid, "items", id);
    await updateDoc(itemRef, {
        isFulfilled: true,
        fulfilledDate: dateStr
    });
    alert("おめでとうございます！記録しました。");
};

window.deleteItem = async (id) => {
    if(confirm("本当に削除してよろしいですか？")) {
        await deleteDoc(doc(db, "users", currentUser.uid, "items", id));
    }
};

// ■ 7. 描画
function renderList() {
    const activeList = document.getElementById('activeList');
    const fulfilledList = document.getElementById('fulfilledList');
    activeList.innerHTML = '';
    fulfilledList.innerHTML = '';

    gokinenItems.forEach(item => {
        const li = document.createElement('li');
        li.setAttribute('data-id', item.id); // 並び替え用にIDを埋め込む

        if (!item.isFulfilled) {
            li.innerHTML = `
                <div style="display:flex; align-items:center; width:100%;">
                    <!-- ▼ ここにつまむマークを追加しました -->
                    <span class="drag-handle">≡</span>
                    <span style="flex:1; margin-left:5px; white-space: pre-wrap;">${item.text}</span>
                </div>
                <div style="display:flex; flex-shrink:0;">
                    <button class="btn-fulfill" onclick="fulfillItem('${item.id}')">叶</button>
                    <button class="btn-delete" onclick="deleteItem('${item.id}')">削</button>
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
                <button class="btn-delete" onclick="deleteItem('${item.id}')">削</button>
            `;
            fulfilledList.insertBefore(li, fulfilledList.firstChild);
        }
    });
}