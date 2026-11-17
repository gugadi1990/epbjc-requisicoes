import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  OAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Substitui pelos valores reais do teu projeto Firebase (Project settings → Your apps → Web app).
// Estes valores são públicos por natureza; a segurança vem das Firestore Rules, não daqui.
const firebaseConfig = {
  apiKey: "AIzaSyD_LXBKoqxydRxGqFikeiU6hNZx93EpLRo",
  authDomain: "testeequipamentos-6ee95.firebaseapp.com",
  projectId: "testeequipamentos-6ee95",
  storageBucket: "testeequipamentos-6ee95.firebasestorage.app",
  messagingSenderId: "443137521957",
  appId: "1:443137521957:web:48d76aa3def0d8baefc2cc",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ID do provider Microsoft tal como configurado em Authentication → Sign-in method.
const provider = new OAuthProvider("microsoft.com");
// Restringe ao tenant institucional, se aplicável — substitui pelo Tenant ID real do Entra.
provider.setCustomParameters({ tenant: "4334e4b0-48f4-4a76-ae54-cec847437a72" });

const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const userBox = document.getElementById("userBox");
const userName = document.getElementById("userName");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginError = document.getElementById("loginError");
const requestForm = document.getElementById("requestForm");
const formError = document.getElementById("formError");
const formSuccess = document.getElementById("formSuccess");
const historyList = document.getElementById("historyList");

let unsubscribeHistory = null;

loginBtn.addEventListener("click", async () => {
  loginError.classList.add("hidden");
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    loginError.textContent = "Não foi possível iniciar sessão. Tenta novamente.";
    loginError.classList.remove("hidden");
    console.error(err);
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    showApp(user);
  } else {
    showLogin();
  }
});

function showLogin() {
  loginView.classList.remove("hidden");
  appView.classList.add("hidden");
  userBox.classList.add("hidden");
  if (unsubscribeHistory) {
    unsubscribeHistory();
    unsubscribeHistory = null;
  }
}

function showApp(user) {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  userBox.classList.remove("hidden");
  userName.textContent = user.displayName || user.email;
  watchHistory(user.uid);
}

requestForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.classList.add("hidden");
  formSuccess.classList.add("hidden");

  const user = auth.currentUser;
  if (!user) return;

  const equipamento = document.getElementById("equipamento").value;
  const dataPedido = document.getElementById("dataPedido").value;
  const devolucaoPrevista = document.getElementById("devolucaoPrevista").value;
  const observacoes = document.getElementById("observacoes").value.trim();

  if (!equipamento || !dataPedido || !devolucaoPrevista) {
    formError.textContent = "Preenche o equipamento e as duas datas.";
    formError.classList.remove("hidden");
    return;
  }

  if (devolucaoPrevista < dataPedido) {
    formError.textContent = "A devolução prevista não pode ser anterior à data do pedido.";
    formError.classList.remove("hidden");
    return;
  }

  const codigo = gerarCodigo();

  try {
    await addDoc(collection(db, "requisicoes"), {
      codigo,
      uid: user.uid,
      requisitante: user.displayName || "",
      email: (user.email || "").toLowerCase(),
      equipamento,
      dataPedido,
      devolucaoPrevista,
      estado: "Pendente",
      observacoes,
      criadoEm: serverTimestamp(),
    });
    formSuccess.textContent = `Pedido ${codigo} submetido com sucesso.`;
    formSuccess.classList.remove("hidden");
    requestForm.reset();
  } catch (err) {
    formError.textContent = "Não foi possível submeter o pedido. Confirma que estás autorizado e tenta novamente.";
    formError.classList.remove("hidden");
    console.error(err);
  }
});

function gerarCodigo() {
  const hoje = new Date();
  const yyyy = hoje.getFullYear();
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const dd = String(hoje.getDate()).padStart(2, "0");
  const sufixo = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `REQ-${yyyy}${mm}${dd}-${sufixo}`;
}

function watchHistory(uid) {
  if (unsubscribeHistory) unsubscribeHistory();

  const q = query(
    collection(db, "requisicoes"),
    where("uid", "==", uid),
    orderBy("criadoEm", "desc")
  );

  unsubscribeHistory = onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        historyList.innerHTML = '<p class="muted">Ainda não tens pedidos.</p>';
        return;
      }
      historyList.innerHTML = "";
      snapshot.forEach((doc) => {
        historyList.appendChild(renderHistoryItem(doc.data()));
      });
    },
    (err) => {
      historyList.innerHTML = '<p class="error">Não foi possível carregar o histórico.</p>';
      console.error(err);
    }
  );
}

function renderHistoryItem(pedido) {
  const el = document.createElement("div");
  el.className = "history-item";

  const badgeClass = {
    Pendente: "badge-pendente",
    "Em empréstimo": "badge-emprestimo",
    Devolvido: "badge-devolvido",
    Recusado: "badge-recusado",
  }[pedido.estado] || "badge-pendente";

  el.innerHTML = `
    <div class="top-row">
      <span>${escapeHtml(pedido.equipamento)} · ${escapeHtml(pedido.codigo)}</span>
      <span class="badge ${badgeClass}">${escapeHtml(pedido.estado)}</span>
    </div>
    <div class="dates">Pedido: ${escapeHtml(pedido.dataPedido)} · Devolução prevista: ${escapeHtml(pedido.devolucaoPrevista)}</div>
    ${pedido.observacoes ? `<div class="obs">${escapeHtml(pedido.observacoes)}</div>` : ""}
  `;
  return el;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
