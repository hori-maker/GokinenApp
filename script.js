// Firebaseの便利な機能をインターネットから読み込みます
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// アプリを起動する準備
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null; // ログインしているユーザー情報
let gokinenItems = []; // データを一時的に入れておく場所

// ■ 1. ログイン状態を監視する（アプリが開いた瞬間に動く）
onAuthStateChanged(auth, (user) => {
    if (user) {
        // ログインしている時
        currentUser = user;
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('appContent').style.display = 'block';
        
        // データの同期を開始！
        startSync(user.uid);
    } else {
        // ログアウトしている時
        currentUser = null;
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('appContent').style.display = 'none';
    }
});

// ■ 2. ログイン・ログアウトボタンの設定
document.getElementById('loginBtn').addEventListener('click', () => {
    signInWithPopup(auth, provider).catch((error) => alert("ログイン失敗: " + error.message));
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth);
});

// ■ 3. データをリアルタイム同期する魔法（onSnapshot）
function startSync(userId) {
    // ユーザーごとの箱（コレクション）を指定
    // 並び順：作成日(createdAt)の昇順(asc)＝新しいのが下に来る
    const q = query(
        collection(db, "users", userId, "items"), 
        orderBy("createdAt", "asc")
    );

    // データベースに変更があるたびに、ここが勝手に動く！
    onSnapshot(q, (snapshot) => {
        gokinenItems = [];
        snapshot.forEach((doc) => {
            gokinenItems.push({
                id: doc.id, // FirestoreのID
                ...doc.data() // 中身（text, isFulfilledなど）
            });
        });
        renderList(); // 画面を更新
    });
}

// ■ 4. 追加ボタンの設定
const input = document.getElementById('gokinenInput');
document.getElementById('addBtn').addEventListener('click', addItem);

// Enterキー設定
input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing && !event.shiftKey) {
        event.preventDefault();
        addItem();
    }
});

// 追加する関数（Firestoreに保存）
async function addItem() {
    const rawText = input.value;
    if (rawText.trim() === "") return;

    const lines = rawText.split(/\n/);
    
    // まとめて処理
    for (const line of lines) {
        const text = line.trim();
        if (text !== "") {
            // ★ Cloud Firestoreに保存！
            await addDoc(collection(db, "users", currentUser.uid, "items"), {
                text: text,
                isFulfilled: false,
                fulfilledDate: null,
                createdAt: serverTimestamp() // サーバーの時間を使う
            });
        }
    }
    input.value = '';
}

// ■ 5. 叶ったボタン（Firestoreを更新）
window.fulfillItem = async (id) => {
    const item = gokinenItems.find(i => i.id === id);
    if (!item) return;

    const now = new Date();
    const dateStr = now.getFullYear() + "/" + (now.getMonth() + 1) + "/" + now.getDate();

    // ★ Firestoreを更新！
    const itemRef = doc(db, "users", currentUser.uid, "items", id);
    await updateDoc(itemRef, {
        isFulfilled: true,
        fulfilledDate: dateStr
    });
    alert("おめでとうございます！記録しました。");
};

// ■ 6. 削除ボタン（Firestoreから削除）
window.deleteItem = async (id) => {
    if(confirm("本当に削除してよろしいですか？")) {
        // ★ Firestoreから削除！
        await deleteDoc(doc(db, "users", currentUser.uid, "items", id));
    }
};

// ■ 7. 画面を描画する（今までとほぼ同じ）
function renderList() {
    const activeList = document.getElementById('activeList');
    const fulfilledList = document.getElementById('fulfilledList');
    activeList.innerHTML = '';
    fulfilledList.innerHTML = '';

    gokinenItems.forEach(item => {
        const li = document.createElement('li');
        
        if (!item.isFulfilled) {
            li.innerHTML = `
                <div style="display:flex; align-items:center; width:100%;">
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