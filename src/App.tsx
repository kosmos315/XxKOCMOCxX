import React, { useState, useEffect, useRef } from "react";
import { auth, googleProvider } from "./lib/firebase";
import { signInWithPopup, signInWithPhoneNumber, RecaptchaVerifier } from "firebase/auth";

// ─── КОНФИГ ──────────────────────────────────────────────────────────────────
const BOOT_TEXT = "XxKOCMOCxX | HACKER";
const IDLE = "#FFFFFF";
const BG   = "#000000";

// ─── GEMINI API PROXY CALL ───────────────────────────────────────────────────
async function callGemini(history: any[], userText: string, extraInstructions: string) {
  const res = await fetch("/api/gemini/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      history,
      userText,
      extraInstructions
    })
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.reply || "ошибка ответа";
}

// ─── КОМПОНЕНТ: ВХОД (LOGIN) ─────────────────────────────────────────────────
function Login({ onDone, personalization }: { onDone: (u: { name: string; email: string; phone: string }) => void; personalization: boolean }) {
  const ACTV = personalization ? "#00F0FF" : "#FF1A1A";
  const [tab, setTab] = useState("main"); // main|google|email|phone
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [blink, setBlink] = useState(true);

  // Verification states
  const [emailStep, setEmailStep] = useState<"enter" | "verify">("enter");
  const [phoneStep, setPhoneStep] = useState<"enter" | "verify">("enter");
  const [otpCode, setOtpCode] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [mockPhoneCode, setMockPhoneCode] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string, ms = 4000) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  };

  useEffect(() => {
    const id = setInterval(() => setBlink(b => !b), 530);
    return () => clearInterval(id);
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const u = {
        name: user.displayName || name.trim() || "аноним",
        email: user.email || "guest@hacker.app",
        phone: user.phoneNumber || ""
      };
      localStorage.setItem("hk_user", JSON.stringify(u));
      onDone(u);
    } catch (error: any) {
      console.error("Google login failed", error);
      showToast("Вход заблокирован iframe. Используйте Email или Телефон!");
    }
  };

  const handleSendEmailOTP = async () => {
    if (!email.trim() || !email.includes("@")) {
      showToast("Введите корректный email address!");
      return;
    }
    setIsSendingCode(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.code) {
        // Dev fallback
        setOtpCode(data.code);
        showToast(`[DEV MODE] Код для входа: ${data.code}`);
      } else {
        showToast("Код успешно отправлен на вашу почту!");
      }
      setEmailStep("verify");
    } catch (error: any) {
      showToast(error.message || "Ошибка отправки кода.");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyEmailOTP = async () => {
    if (!otpCode.trim()) {
      showToast("Введите проверочный код!");
      return;
    }
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: otpCode.trim() })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const u = {
        name: name.trim() || data.user.name,
        email: data.user.email,
        phone: ""
      };
      localStorage.setItem("hk_user", JSON.stringify(u));
      onDone(u);
    } catch (error: any) {
      showToast(error.message || "Неверный проверочный код!");
    }
  };

  const handleSendPhoneOTP = async () => {
    if (!phone.trim()) {
      showToast("Введите номер телефона!");
      return;
    }
    setIsSendingCode(true);
    try {
      const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible'
      });
      const phoneWithPlus = phone.startsWith('+') ? phone : '+' + phone;
      const confirmation = await signInWithPhoneNumber(auth, phoneWithPlus, verifier);
      setConfirmationResult(confirmation);
      setPhoneStep("verify");
      setOtpCode("");
      showToast("SMS код отправлен!");
    } catch (error: any) {
      console.warn("SMS OTP error, falling back to simulated verification:", error);
      const mockCode = "777777";
      setMockPhoneCode(mockCode);
      setOtpCode(mockCode);
      setPhoneStep("verify");
      showToast(`Используйте код подтверждения: ${mockCode} (эмуляция)`);
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyPhoneOTP = async () => {
    if (!otpCode.trim()) {
      showToast("Введите код подтверждения из SMS!");
      return;
    }
    try {
      if (mockPhoneCode && otpCode.trim() === mockPhoneCode) {
        const u = {
          name: name.trim() || "аноним",
          email: phone.trim() + "@phone.hacker.app",
          phone: phone.trim()
        };
        localStorage.setItem("hk_user", JSON.stringify(u));
        onDone(u);
        return;
      }

      if (confirmationResult) {
        const result = await confirmationResult.confirm(otpCode.trim());
        const user = result.user;
        const u = {
          name: name.trim() || user.displayName || "аноним",
          email: user.email || phone.trim() + "@phone.hacker.app",
          phone: user.phoneNumber || phone.trim()
        };
        localStorage.setItem("hk_user", JSON.stringify(u));
        onDone(u);
      } else {
        throw new Error("Отсутствует сессия подтверждения");
      }
    } catch (error: any) {
      showToast("Неверный код подтверждения!");
    }
  };

  const go = () => {
    const u = {
      name: name.trim() || "аноним",
      email: email.trim() || (phone.trim() ? phone.trim() : "guest@hacker.app"),
      phone: phone.trim()
    };
    localStorage.setItem("hk_user", JSON.stringify(u));
    onDone(u);
  };

  const inp = (val: string, set: (v: string) => void, ph: string, type = "text") => (
    <input value={val} onChange={e => set(e.target.value)} placeholder={ph} type={type}
      style={{
        width: "100%", padding: "13px 16px", background: "#0d0d0d", border: "1px solid #2a2a2a",
        borderRadius: "12px", color: "#fff", fontSize: "15px", outline: "none",
        boxSizing: "border-box", marginBottom: "12px"
      }} />
  );

  const bigBtn = (onClick: () => void, bg: string, txt: string, icon: string) => (
    <button onClick={onClick} style={{
      width: "100%", padding: "13px", borderRadius: "12px",
      background: bg, border: bg === "transparent" ? "1.5px solid #2a2a2a" : "none",
      color: bg === "transparent" ? "#ccc" : "#fff", fontSize: "15px", fontWeight: 600,
      display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
      marginBottom: "10px", cursor: "pointer"
    }}>
      {icon}{txt}
    </button>
  );

  const GoogleIcon = () => (
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );

  return (
    <div style={{
      width: "100vw", height: "100vh", background: BG, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "28px",
      fontFamily: "'Segoe UI',system-ui,sans-serif", boxSizing: "border-box", position: "relative"
    }}>
      {/* Invisible Recaptcha Element */}
      <div id="recaptcha-container"></div>

      {toast && (
        <div style={{
          position: "fixed", top: "24px", left: "50%", transform: "translateX(-50%)",
          background: "#111", border: `1px solid ${ACTV}`, borderRadius: "12px",
          padding: "10px 18px", color: "#fff", fontSize: "13px",
          zIndex: 200, boxShadow: `0 0 14px ${ACTV}40`, textAlign: "center",
          maxWidth: "85vw"
        }}>
          {toast}
        </div>
      )}

      <div style={{
        color: ACTV, fontFamily: "'Arial Black',Impact,sans-serif",
        fontSize: "clamp(16px,5vw,30px)", fontWeight: 900, letterSpacing: "0.07em",
        textShadow: `0 0 18px ${ACTV},0 0 44px ${ACTV}80`,
        marginBottom: "6px", textAlign: "center", whiteSpace: "nowrap"
      }}>
        XxKOCMOCxX | HACKER<span style={{ opacity: blink ? 0.7 : 0 }}>_</span>
      </div>
      <div style={{ color: "#333", fontSize: "11px", letterSpacing: "0.12em", marginBottom: "40px" }}>
        a.a.i.-01 :: null.simulation.-01
      </div>

      <div style={{ width: "100%", maxWidth: "320px" }}>
        {tab === "main" && <>
          <button onClick={handleGoogleSignIn} style={{
            width: "100%", padding: "13px", borderRadius: "12px",
            background: "#fff", border: "none", fontSize: "15px", fontWeight: 600, color: "#333",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "10px", cursor: "pointer"
          }}>
            <GoogleIcon /> Войти через Google
          </button>
          {bigBtn(() => setTab("email"), "transparent", "Войти через Email", "✉ ")}
          {bigBtn(() => setTab("phone"), "transparent", "Войти через телефон", "📱 ")}
          <button onClick={() => onDone({ name: "аноним", email: "guest@hacker.app", phone: "" })}
            style={{ background: "none", border: "none", color: "#444", fontSize: "13px", padding: "10px", width: "100%", marginTop: "4px", cursor: "pointer" }}>
            Продолжить без входа →
          </button>
        </>}

        {tab !== "main" && <>
          <button onClick={() => { setTab("main"); setEmailStep("enter"); setPhoneStep("enter"); }}
            style={{ background: "none", border: "none", color: "#666", fontSize: "13px", padding: "0 0 18px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
            ← Назад
          </button>
          {tab === "google" && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#fff", borderRadius: "12px", padding: "10px 14px", marginBottom: "12px" }}>
              <GoogleIcon />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="yourmail@gmail.com" type="email"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: "14px", color: "#333" }} />
            </div>
          )}
          {tab === "email" && (
            <>
              {emailStep === "enter" ? (
                <>
                  {inp(email, setEmail, "Введите Email", "email")}
                  {inp(name, setName, "Твоё имя (необязательно)")}
                  <button onClick={handleSendEmailOTP} disabled={isSendingCode} style={{
                    width: "100%", padding: "13px", background: ACTV, border: "none",
                    borderRadius: "12px", color: "#fff", fontSize: "15px", fontWeight: 700,
                    boxShadow: `0 0 20px ${ACTV}60`, cursor: "pointer"
                  }}>
                    {isSendingCode ? "Отправка..." : "Получить код"}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ color: "#777", fontSize: "13px", marginBottom: "10px" }}>Код отправлен на {email}</div>
                  {inp(otpCode, setOtpCode, "Введите 6-значный код")}
                  <button onClick={handleVerifyEmailOTP} style={{
                    width: "100%", padding: "13px", background: ACTV, border: "none",
                    borderRadius: "12px", color: "#fff", fontSize: "15px", fontWeight: 700,
                    boxShadow: `0 0 20px ${ACTV}60`, cursor: "pointer"
                  }}>
                    Подтвердить код
                  </button>
                  <button onClick={handleSendEmailOTP} style={{ background: "none", border: "none", color: "#555", fontSize: "13px", padding: "10px", width: "100%", marginTop: "8px", cursor: "pointer" }}>
                    Отправить заново
                  </button>
                </>
              )}
            </>
          )}

          {tab === "phone" && (
            <>
              {phoneStep === "enter" ? (
                <>
                  {inp(phone, setPhone, "+7 999 999 99 99", "tel")}
                  {inp(name, setName, "Твоё имя (необязательно)")}
                  <button onClick={handleSendPhoneOTP} disabled={isSendingCode} style={{
                    width: "100%", padding: "13px", background: ACTV, border: "none",
                    borderRadius: "12px", color: "#fff", fontSize: "15px", fontWeight: 700,
                    boxShadow: `0 0 20px ${ACTV}60`, cursor: "pointer"
                  }}>
                    {isSendingCode ? "Отправка..." : "Получить код"}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ color: "#777", fontSize: "13px", marginBottom: "10px" }}>Код отправлен на {phone}</div>
                  {inp(otpCode, setOtpCode, "Введите код из SMS")}
                  <button onClick={handleVerifyPhoneOTP} style={{
                    width: "100%", padding: "13px", background: ACTV, border: "none",
                    borderRadius: "12px", color: "#fff", fontSize: "15px", fontWeight: 700,
                    boxShadow: `0 0 20px ${ACTV}60`, cursor: "pointer"
                  }}>
                    Подтвердить код
                  </button>
                  <button onClick={handleSendPhoneOTP} style={{ background: "none", border: "none", color: "#555", fontSize: "13px", padding: "10px", width: "100%", marginTop: "8px", cursor: "pointer" }}>
                    Отправить заново
                  </button>
                </>
              )}
            </>
          )}
        </>}
      </div>
    </div>
  );
}

// ─── ГЛАВНЫЙ КОМПОНЕНТ ────────────────────────────────────────────────────────
export default function App() {
  // Персонализация и Цвета
  const [personalization, setPersonalization] = useState(() => localStorage.getItem("hk_personalization") === "true");
  const ACTV = personalization ? "#00F0FF" : "#FF1A1A";

  // Авторизация
  const [user, setUser] = useState<{ name: string; email: string; phone: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem("hk_user") || "null"); } catch { return null; }
  });

  // Загрузка
  const [phase,    setPhase]    = useState("init");
  const [blinkOn,  setBlinkOn]  = useState(false);
  const [typed,    setTyped]    = useState("");
  const [cursor,   setCursor]   = useState(true);

  // Приложение
  interface ChatMessage {
    role: string;
    content: string;
  }
  interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
  }
  const [chats,        setChats]        = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input,        setInput]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [sidebar,      setSidebar]      = useState(false);
  const [settings,     setSettings]     = useState(false);
  const [userName,     setUserName]     = useState(user?.name || "аноним");
  
  // Дополнительные окна и уведомления
  const [toast,        setToast]        = useState<string | null>(null);
  const [showHist,     setShowHist]     = useState(false);
  const [showInstr,    setShowInstr]    = useState(false);
  const [instr,        setInstr]        = useState(() => localStorage.getItem("hk_instr") || "");
  const [instrDraft,   setInstrDraft]   = useState("");

  // Редактирование и регенерация сообщений
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const endRef   = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Производные
  const isActive    = input.length > 0 || loading;
  const C           = isActive ? ACTV : IDLE;
  const glow        = isActive ? `0 0 14px ${ACTV}70` : "none";
  const currentChat = chats.find(c => c.id === activeChatId);
  const messages    = currentChat?.messages || [];
  const hasMsgs     = messages.length > 0;

  const showToast = (msg: string, ms = 3500) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  };

  // Запуск анимации загрузки только после того, как сессия пользователя активна
  useEffect(() => {
    if (user) {
      const t = setTimeout(() => setPhase("blink"), 280);
      return () => clearTimeout(t);
    }
  }, [user?.email]);

  // Загрузка: мигание
  useEffect(() => {
    if (phase !== "blink") return;
    let n = 0;
    const id = setInterval(() => {
      n++;
      setBlinkOn(n % 2 === 1);
      if (n >= 12) {
        clearInterval(id);
        setBlinkOn(false);
        setTimeout(() => { setTyped(""); setPhase("type"); }, 130);
      }
    }, 155);
    return () => clearInterval(id);
  }, [phase]);

  // Загрузка: печать посимвольно
  useEffect(() => {
    if (phase !== "type") return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(BOOT_TEXT.slice(0, i));
      if (i >= BOOT_TEXT.length) {
        clearInterval(id);
        setTimeout(() => setPhase("app"), 750);
      }
    }, 65);
    return () => clearInterval(id);
  }, [phase]);

  // Мигающий курсор
  useEffect(() => {
    const id = setInterval(() => setCursor(c => !c), 500);
    return () => clearInterval(id);
  }, []);

  // Авто-скролл
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  // Новый чат
  const createChat = () => {
    const id = `${Date.now()}`;
    setChats(prev => [{ id, title: "Новый чат", messages: [] }, ...prev]);
    setActiveChatId(id);
    setInput("");
    setSidebar(false);
    return id;
  };

  // Копирование текста
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => showToast("Скопировано в буфер обмена ✓"))
      .catch(() => showToast("Не удалось скопировать."));
  };

  // Сохранение отредактированного сообщения
  const handleSaveEdit = async (index: number) => {
    if (!editingText.trim() || loading) return;
    const editedText = editingText.trim();
    setEditingMessageIndex(null);

    if (!activeChatId) return;

    const currentChat = chats.find(c => c.id === activeChatId);
    if (!currentChat) return;

    const originalMessages = currentChat.messages;
    const historyUpToTarget = originalMessages.slice(0, index);

    const updatedUserMsg = { role: "user", content: editedText };
    const newMessages = [...historyUpToTarget, updatedUserMsg];

    setChats(prev => prev.map(c => c.id === activeChatId
      ? {
          ...c,
          title: index === 0 ? (editedText.slice(0, 30) + (editedText.length > 30 ? "…" : "")) : c.title,
          messages: newMessages
        }
      : c));

    setLoading(true);

    try {
      const reply = await callGemini(historyUpToTarget, editedText, instr);
      setChats(prev => prev.map(c => c.id === activeChatId
        ? { ...c, messages: [...newMessages, { role: "assistant", content: reply }] } : c));
    } catch (e) {
      showToast("Ошибка генерации. Проверь сеть или API ключ.");
    }

    setLoading(false);
  };

  // Перегенерация ответа ИИ
  const handleRegenerate = async (index: number) => {
    if (loading || !activeChatId) return;

    const currentChat = chats.find(c => c.id === activeChatId);
    if (!currentChat) return;

    const originalMessages = currentChat.messages;
    const userMsgIndex = index - 1;
    if (userMsgIndex < 0 || originalMessages[userMsgIndex].role !== "user") {
      showToast("Не удалось найти исходное сообщение пользователя.");
      return;
    }

    const userText = originalMessages[userMsgIndex].content;
    const historyUpToTarget = originalMessages.slice(0, userMsgIndex);
    const newMessages = [...historyUpToTarget, originalMessages[userMsgIndex]];

    setChats(prev => prev.map(c => c.id === activeChatId
      ? { ...c, messages: newMessages }
      : c));

    setLoading(true);

    try {
      const reply = await callGemini(historyUpToTarget, userText, instr);
      setChats(prev => prev.map(c => c.id === activeChatId
        ? { ...c, messages: [...newMessages, { role: "assistant", content: reply }] } : c));
    } catch (e) {
      showToast("Ошибка генерации. Проверь сеть или API ключ.");
    }

    setLoading(false);
  };

  // Отправка запроса
  const send = async () => {
    if (!input.trim() || loading) return;
    const text        = input.trim();
    const historySnap = currentChat?.messages || [];
    setInput("");

    let chatId = activeChatId;
    if (!chatId) {
      chatId = `${Date.now()}`;
      setChats(prev => [{
        id: chatId!,
        title: text.slice(0, 30) + (text.length > 30 ? "…" : ""),
        messages: []
      }, ...prev]);
      setActiveChatId(chatId);
    } else if (currentChat?.title === "Новый чат" && !currentChat.messages.length) {
      setChats(prev => prev.map(c => c.id === chatId
        ? { ...c, title: text.slice(0, 30) + (text.length > 30 ? "…" : "") }
        : c));
    }

    const userMsg = { role: "user", content: text };
    setChats(prev => prev.map(c => c.id === chatId
      ? { ...c, messages: [...c.messages, userMsg] } : c));
    setLoading(true);

    try {
      const reply = await callGemini(historySnap, text, instr);
      setChats(prev => prev.map(c => c.id === chatId
        ? { ...c, messages: [...c.messages, { role: "assistant", content: reply }] } : c));
    } catch (e) {
      showToast("Ошибка генерации. Проверь сеть или API ключ.");
    }

    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const saveInstructions = () => {
    setInstr(instrDraft);
    localStorage.setItem("hk_instr", instrDraft);
    setShowInstr(false);
    showToast("Инструкции сохранены ✓");
  };

  const logout = () => {
    localStorage.removeItem("hk_user");
    setUser(null);
    setPhase("init");
    setChats([]);
    setActiveChatId(null);
  };

  // Если нет сессии пользователя — рендерим экран входа
  if (!user) {
    return <Login onDone={u => { setUser(u); setUserName(u.name); }} personalization={personalization} />;
  }

  // Экран загрузки
  if (phase !== "app") {
    return (
      <div style={{
        width:"100vw", height:"100vh", background:BG,
        display:"flex", alignItems:"center", justifyContent:"center",
        overflow:"hidden", userSelect:"none"
      }}>
        {phase !== "init" && (
          <div style={{
            color: ACTV,
            fontFamily: "'Arial Black','Impact',sans-serif",
            fontSize: "clamp(14px,5.8vw,40px)",
            fontWeight: 900,
            letterSpacing: "0.07em",
            textShadow: `0 0 18px ${ACTV}, 0 0 44px ${ACTV}80`,
            opacity: phase === "blink" ? (blinkOn ? 1 : 0) : 1,
            transition: phase === "blink" ? "opacity 0.05s" : "none",
            whiteSpace: "nowrap"
          }}>
            {phase === "type" ? typed : BOOT_TEXT}
            {phase === "type" && (
              <span style={{ opacity: cursor ? 0.65 : 0, transition: "opacity 0.12s" }}>_</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── ГЛАВНЫЙ ИНТЕРФЕЙС ───────────────────────────────────────────────────────
  return (
    <div style={{
      width:"100vw", height:"100vh", background:BG,
      display:"flex", flexDirection:"column",
      fontFamily:"'Segoe UI',system-ui,sans-serif",
      overflow:"hidden", position:"relative", color:"#fff"
    }}>

      {/* ВСПЛЫВАЮЩЕЕ УВЕДОМЛЕНИЕ (TOAST) */}
      {toast && (
        <div style={{
          position: "fixed", top: "66px", left: "50%", transform: "translateX(-50%)",
          background: "#111", border: `1px solid ${ACTV}`, borderRadius: "12px",
          padding: "10px 18px", color: "#fff", fontSize: "13px",
          zIndex: 200, boxShadow: `0 0 14px ${ACTV}40`, textAlign: "center",
          maxWidth: "80vw", whiteSpace: "nowrap"
        }}>
          {toast}
        </div>
      )}

      {/* САЙДБАР */}
      {sidebar && <>
        <div onClick={() => setSidebar(false)} style={{
          position:"absolute", inset:0, zIndex:40, background:"rgba(0,0,0,0.6)"
        }}/>
        <div style={{
          position:"absolute", left:0, top:0, bottom:0,
          width:"70%", maxWidth:"260px",
          background:"#070707",
          borderRight:`1px solid ${C}22`,
          zIndex:50, display:"flex", flexDirection:"column"
        }}>
          <div style={{ padding:"16px", borderBottom:"1px solid #161616" }}>
            <button onClick={createChat} style={{
              width:"100%", padding:"10px",
              background:"transparent", border:`1.5px solid ${C}`,
              borderRadius:"10px", color:C,
              fontSize:"13px", fontWeight:600, cursor:"pointer",
              boxShadow:glow, transition:"all 0.3s"
            }}>+ Новый чат</button>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"6px 0" }}>
            {chats.length === 0
              ? <div style={{ padding:"14px", color:"#333", fontSize:"12px" }}>нет чатов</div>
              : chats.map(c => (
                <div key={c.id}
                  onClick={() => { setActiveChatId(c.id); setSidebar(false); }}
                  style={{
                    padding:"11px 16px",
                    color: c.id === activeChatId ? C : "#666",
                    fontSize:"13px", cursor:"pointer",
                    background: c.id === activeChatId ? `${C}10` : "transparent",
                    borderLeft:`2px solid ${c.id === activeChatId ? C : "transparent"}`,
                    overflow:"hidden", textOverflow:"ellipsis",
                    whiteSpace:"nowrap", transition:"all 0.2s"
                  }}>{c.title}</div>
              ))
            }
          </div>
          <div style={{ padding:"12px 16px", borderTop:"1px solid #161616" }}>
            <div onClick={() => { setSettings(true); setSidebar(false); }}
              style={{ color:"#444", fontSize:"13px", cursor:"pointer", padding:"6px 0" }}>
              ⚙ Настройки
            </div>
          </div>
        </div>
      </>}

      {/* ИСТОРИЯ ДЕЙСТВИЙ */}
      {showHist && (
        <div style={{ position: "absolute", inset: 0, zIndex: 70, background: BG, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 12px", borderBottom: "1px solid #1a1a1a" }}>
            <span style={{ fontSize: "16px", fontWeight: 600 }}>История действий</span>
            <button onClick={() => setShowHist(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: "26px", cursor: "pointer", padding: 0 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {chats.length === 0
              ? <div style={{ padding: "32px", color: "#444", fontSize: "14px", textAlign: "center" }}>История пуста</div>
              : chats.map(c => (
                <div key={c.id} onClick={() => { setActiveChatId(c.id); setShowHist(false); }}
                  style={{ padding: "14px 20px", cursor: "pointer", borderBottom: "1px solid #0f0f0f", background: c.id === activeChatId ? "#0d0d0d" : "transparent" }}>
                  <div style={{ color: "#fff", fontSize: "14px", fontWeight: 500, marginBottom: "4px" }}>{c.title}</div>
                  <div style={{ color: "#555", fontSize: "12px" }}>{c.messages.length} сообщ.</div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ПОЛЬЗОВАТЕЛЬСКИЕ ИНСТРУКЦИИ */}
      {showInstr && (
        <div style={{ position: "absolute", inset: 0, zIndex: 70, background: BG, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 12px", borderBottom: "1px solid #1a1a1a" }}>
            <span style={{ fontSize: "16px", fontWeight: 600 }}>Инструкции для ИИ</span>
            <button onClick={() => setShowInstr(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: "26px", cursor: "pointer", padding: 0 }}>×</button>
          </div>
          <div style={{ padding: "16px", flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ color: "#555", fontSize: "13px", lineHeight: 1.55 }}>
              Напиши, как должен вести себя ИИ — это добавится к его системным правилам.
            </div>
            <textarea value={instrDraft} onChange={e => setInstrDraft(e.target.value)}
              placeholder={"Примеры:\n- отвечай только по-английски\n- всегда давай пример кода\n- объясняй максимально просто"}
              style={{
                flex: 1, background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: "12px", color: "#fff",
                fontSize: "14px", padding: "14px", outline: "none", resize: "none", lineHeight: 1.55, fontFamily: "inherit"
              }} />
            <button onClick={saveInstructions} style={{
              padding: "13px", background: ACTV, border: "none", borderRadius: "12px",
              color: "#fff", fontSize: "15px", fontWeight: 700, boxShadow: `0 0 16px ${ACTV}55`, cursor: "pointer"
            }}>Сохранить</button>
          </div>
        </div>
      )}

      {/* НАСТРОЙКИ */}
      {settings && (
        <div style={{
          position:"absolute", inset:0, zIndex:60,
          background:BG, display:"flex", flexDirection:"column", overflow:"auto"
        }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 20px 10px" }}>
            <span style={{ color:"#777", fontSize:"13px" }}>{user?.email}</span>
            <button onClick={() => setSettings(false)}
              style={{ background:"none", border:"none", color:"#fff", fontSize:"28px", cursor:"pointer", lineHeight:1, padding:0 }}>×</button>
          </div>

          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"8px 0 24px" }}>
            <div style={{
              width:"78px", height:"78px", borderRadius:"50%",
              background:"#1c1c1c", position:"relative", cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              marginBottom:"14px"
            }}>
              <span style={{ fontSize:"34px", opacity:0.4 }}>👤</span>
              <div style={{
                position:"absolute", bottom:2, right:2,
                width:"22px", height:"22px", borderRadius:"50%",
                background:"#2a2a2a", border:"1.5px solid #000",
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px"
              }}>📷</div>
            </div>
            <div style={{ fontSize:"22px", fontWeight:600, marginBottom:"16px" }}>
              Дарова {userName}
            </div>
            <button style={{
              padding:"9px 28px", background:"transparent",
              border:"1px solid #333", borderRadius:"22px",
              color:"#fff", fontSize:"13px", cursor:"pointer"
            }}>Управление аккаунтом Google</button>
          </div>

          <div style={{ margin:"0 14px 16px", background:"#0d0d0d", borderRadius:"14px", overflow:"hidden" }}>
            <div onClick={() => { setSettings(false); setShowHist(true); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 16px", borderBottom: "1px solid #191919", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <span style={{ fontSize: "15px", opacity: 0.5 }}>🕐</span>
                <span style={{ fontSize: "14px" }}>История действий</span>
              </div>
              <span style={{ color: "#444", fontSize: "18px" }}>›</span>
            </div>

            <div onClick={() => {
              const newVal = !personalization;
              setPersonalization(newVal);
              localStorage.setItem("hk_personalization", String(newVal));
              showToast(newVal ? "Космический Синий активирован 🌌" : "Классический Хакерский Красный активирован 🔴");
            }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 16px", borderBottom: "1px solid #191919", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <span style={{ fontSize: "15px", opacity: 0.5 }}>✨</span>
                <span style={{ fontSize: "14px" }}>Персонализация</span>
              </div>
              <div style={{ width: "44px", height: "24px", borderRadius: "12px", background: personalization ? ACTV : "#2a2a2a", position: "relative", transition: "background 0.3s" }}>
                <div style={{ position: "absolute", top: "2px", left: personalization ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.3s" }} />
              </div>
            </div>

            <div onClick={() => { setSettings(false); setInstrDraft(instr); setShowInstr(true); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 16px", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <span style={{ fontSize: "15px", opacity: 0.5 }}>📄</span>
                <div>
                  <div style={{ fontSize: "14px" }}>Пользовательские инструкции</div>
                  {instr && <div style={{ fontSize: "11px", color: ACTV, marginTop: "2px" }}>настроены</div>}
                </div>
              </div>
              <span style={{ color: "#444", fontSize: "18px" }}>›</span>
            </div>
          </div>

          <div style={{ padding:"0 14px 24px" }}>
            <div style={{ fontSize:"10px", color:"#444", letterSpacing:"0.1em", marginBottom:"6px" }}>ИМЯ</div>
            <input value={userName} onChange={e => setUserName(e.target.value)} style={{
              width:"100%", padding:"10px 14px",
              background:"#0d0d0d", border:"1px solid #222",
              borderRadius:"10px", color:"#fff", fontSize:"14px",
              outline:"none", boxSizing:"border-box"
            }}/>
          </div>

          <div style={{ padding: "0 14px 28px" }}>
            <button onClick={logout} style={{ width: "100%", padding: "11px", background: "transparent", border: "1px solid #2a2a2a", borderRadius: "10px", color: "#666", fontSize: "13px", cursor: "pointer" }}>
              Выйти из аккаунта
            </button>
          </div>
        </div>
      )}

      {/* ТОПБАР */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"14px 16px 10px", flexShrink:0
      }}>
        <button onClick={() => setSidebar(true)} style={{
          width:"42px", height:"42px", borderRadius:"50%",
          background:"transparent", border:`1.5px solid ${C}`,
          color:C, fontSize:"19px", cursor:"pointer",
          display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow:glow, transition:"all 0.3s ease"
        }}>≡</button>
        <button onClick={createChat} style={{
          padding:"9px 22px", borderRadius:"22px",
          background:"transparent", border:`1.5px solid ${C}`,
          color:C, fontSize:"14px", fontWeight:500, cursor:"pointer",
          boxShadow:glow, transition:"all 0.3s ease"
        }}>Новый чат+</button>
      </div>

      {/* СООБЩЕНИЯ / ПЛЕЙСХОЛДЕР */}
      <div style={{ flex:1, overflowY:"auto", position:"relative" }}>
        {!hasMsgs && (
          <div style={{
            position:"absolute", inset:0,
            display:"flex", alignItems:"center", justifyContent:"center",
            pointerEvents:"none"
          }}>
            <div style={{
              color:C, fontSize:"18px", textAlign:"center", lineHeight:1.55,
              opacity: input.length > 0 ? 0 : 1,
              transition:"opacity 0.2s, color 0.3s"
            }}>
              Друн, не хочешь ли<br/>что-то написать?)
            </div>
          </div>
        )}

        {hasMsgs && (
          <div style={{ padding:"8px 14px 4px" }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display:"flex",
                flexDirection: "column",
                alignItems: m.role === "user" ? "flex-end" : "flex-start",
                marginBottom:"14px"
              }}>
                <div style={{
                  padding:"10px 14px",
                  borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
                  background: m.role === "user" ? `${C}18` : "#0e0e0e",
                  border:`1px solid ${m.role === "user" ? C+"45" : "#1e1e1e"}`,
                  color:"#fff", fontSize:"14px", lineHeight:1.5,
                  whiteSpace:"pre-wrap", wordBreak:"break-word",
                  transition:"border-color 0.3s, background 0.3s",
                  width: editingMessageIndex === i ? "100%" : "auto",
                  maxWidth: editingMessageIndex === i ? "100%" : "80%"
                }}>
                  {editingMessageIndex === i ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                      <textarea
                        value={editingText}
                        onChange={e => setEditingText(e.target.value)}
                        style={{
                          width: "100%",
                          background: "#050505",
                          border: `1px solid ${C}`,
                          borderRadius: "8px",
                          color: "#fff",
                          padding: "8px",
                          fontSize: "14px",
                          fontFamily: "inherit",
                          outline: "none",
                          resize: "vertical",
                          minHeight: "60px"
                        }}
                      />
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <button onClick={() => setEditingMessageIndex(null)} style={{
                          background: "transparent", border: "1px solid #333", color: "#666",
                          borderRadius: "6px", padding: "4px 10px", fontSize: "12px", cursor: "pointer"
                        }}>
                          Отмена
                        </button>
                        <button onClick={() => handleSaveEdit(i)} style={{
                          background: ACTV, border: "none", color: "#fff",
                          borderRadius: "6px", padding: "4px 12px", fontSize: "12px", fontWeight: "bold", cursor: "pointer"
                        }}>
                          Сохранить
                        </button>
                      </div>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>

                {editingMessageIndex !== i && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginTop: "4px",
                    padding: "0 6px",
                    opacity: 0.6
                  }}>
                    {m.role === "user" ? (
                      <>
                        {/* Кнопка Редактировать (Ручка) */}
                        <button
                          onClick={() => {
                            setEditingMessageIndex(i);
                            setEditingText(m.content);
                          }}
                          title="Редактировать сообщение"
                          style={{
                            background: "none",
                            border: "none",
                            color: "#888",
                            cursor: "pointer",
                            padding: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "color 0.2s"
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = C}
                          onMouseLeave={e => e.currentTarget.style.color = "#888"}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path></svg>
                        </button>

                        {/* Кнопка Копировать (Один пустой лист) */}
                        <button
                          onClick={() => handleCopy(m.content)}
                          title="Копировать сообщение"
                          style={{
                            background: "none",
                            border: "none",
                            color: "#888",
                            cursor: "pointer",
                            padding: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "color 0.2s"
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = C}
                          onMouseLeave={e => e.currentTarget.style.color = "#888"}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Кнопка Перезагрузки (Перегенерация ИИ) */}
                        <button
                          onClick={() => handleRegenerate(i)}
                          title="Перегенерировать ответ"
                          style={{
                            background: "none",
                            border: "none",
                            color: "#888",
                            cursor: "pointer",
                            padding: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "color 0.2s"
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = C}
                          onMouseLeave={e => e.currentTarget.style.color = "#888"}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                        </button>

                        {/* Кнопка Копирования для ИИ */}
                        <button
                          onClick={() => handleCopy(m.content)}
                          title="Копировать ответ"
                          style={{
                            background: "none",
                            border: "none",
                            color: "#888",
                            cursor: "pointer",
                            padding: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "color 0.2s"
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = C}
                          onMouseLeave={e => e.currentTarget.style.color = "#888"}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ display:"flex", marginBottom:"10px" }}>
                <div style={{
                  padding:"10px 18px",
                  background:"#0e0e0e", border:"1px solid #1e1e1e",
                  borderRadius:"4px 18px 18px 18px",
                  color:C, fontSize:"20px", letterSpacing:"4px",
                  transition:"color 0.3s"
                }}>•••</div>
              </div>
            )}
            <div ref={endRef}/>
          </div>
        )}
      </div>

      {/* ИНПУТ И КНОПКА ОТПРАВКИ */}
      <div style={{ padding:"10px 14px 22px", flexShrink:0 }}>
        <div style={{
          display:"flex", alignItems:"center",
          border:`1.5px solid ${C}`,
          borderRadius:"28px", overflow:"hidden",
          boxShadow:glow, transition:"all 0.3s ease"
        }}>
          <button style={{
            padding:"11px 14px", background:"transparent", border:"none",
            color:C, fontSize:"22px", cursor:"pointer", lineHeight:1,
            transition:"color 0.3s", flexShrink:0
          }}>+</button>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="XxKOCMOCxX | HACKER activated"
            style={{
              flex:1, background:"transparent", border:"none", outline:"none",
              color:"#fff", fontSize:"13px", caretColor:C,
              padding:"11px 0", minWidth:0
            }}
          />
          {/* ОБНОВЛЕННАЯ СТИЛЬНАЯ КНОПКА ОТПРАВКИ СО СТРЕЛКОЙ */}
          <button onClick={send} disabled={!input.trim() || loading} style={{
            width: "36px", height: "36px", borderRadius: "50%", margin: "0 6px",
            background: input.trim() && !loading ? ACTV : "transparent",
            border: `1.5px solid ${input.trim() && !loading ? ACTV : "#2a2a2a"}`,
            color: input.trim() && !loading ? "#fff" : "#333",
            fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, boxShadow: input.trim() && !loading ? `0 0 10px ${ACTV}60` : "none",
            transition: "all 0.2s", cursor: "pointer"
          }}>
            ↑
          </button>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #000; }
        input::placeholder { color: ${C}50; transition: color 0.3s; }
        textarea::placeholder { color: #2a2a2a; }
        ::-webkit-scrollbar { width: 2px; }
        ::-webkit-scrollbar-thumb { background: ${C}30; border-radius: 1px; }
        button:active { transform: scale(0.94); }
      `}</style>
    </div>
  );
}
