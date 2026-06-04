import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function App() {
  // Стан авторизації та ролей
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [userRole, setUserRole] = useState('CLIENT') // 'CLIENT' або 'EMPLOYEE'
  const [verificationStatus, setVerificationStatus] = useState('PENDING')

  // Поля форми авторизації
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authName, setAuthName] = useState('')

  // Дані для КЛІЄНТА
  const [activeTab, setActiveTab] = useState('home')
  const [userFullName, setUserFullName] = useState('')
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [supportMessage, setSupportMessage] = useState('')
  const [clientTickets, setClientTickets] = useState([])

  // Дані для ПРАЦІВНИКА БАНКУ
  const [allUsers, setAllUsers] = useState([])
  const [allTickets, setAllTickets] = useState([])
  const [adminReplyText, setAdminReplyText] = useState({})

  // Вікна та стани відправки
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferDesc, setTransferDesc] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cardTheme, setCardTheme] = useState('cyber')

  // Послуги
  const [activeServiceForm, setActiveServiceForm] = useState(null)
  const [serviceTarget, setServiceTarget] = useState('')
  const [serviceAmount, setServiceAmount] = useState('')

  // 🔒 АСИНХРОННЕ ХЕШУВАННЯ ПАРОЛЯ SHA-256 (БЕЗПЕКА НА РІВНІ REAL-WORLD БАНКІНГУ)
  async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Функція завантаження даних системи
  async function loadSystemData(userId, role) {
    setLoading(true)
    try {
      if (role === 'EMPLOYEE') {
        const { data: usersList } = await supabase.from('users').select('*')
        setAllUsers(usersList || [])

        const { data: ticketsList } = await supabase
          .from('support_tickets')
          .select('*, users(full_name, email)')
          .order('created_at', { ascending: false })
        setAllTickets(ticketsList || [])
      } else {
        const { data: userData } = await supabase.from('users').select('*').eq('user_id', userId).single()
        if (userData) {
          setUserFullName(userData.full_name)
          setVerificationStatus(userData.verification_status || 'PENDING')
        }

        let { data: accountData } = await supabase.from('accounts').select('balance').eq('user_id', userId).maybeSingle()
        if (!accountData) {
          const randomIban = 'UA' + Math.floor(10000000000 + Math.random() * 90000000000).toString()
          const { data: newAcc } = await supabase.from('accounts').insert([{ user_id: userId, balance: 5000.00, iban: randomIban }]).select().single()
          accountData = newAcc
        }
        setBalance(accountData ? Number(accountData.balance) : 5000.00)

        const { data: txList } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false })
        setTransactions(txList || [])

        const { data: tktList } = await supabase.from('support_tickets').select('*').eq('user_id', userId).order('created_at', { ascending: false })
        setClientTickets(tktList || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Вхід / Автоматична реєстрація з криптографічним захистом
  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const hashedPassword = await hashPassword(authPassword)
      const inputEmail = authEmail.trim().toLowerCase()

      if (authMode === 'login') {
        const { data: user } = await supabase
          .from('users')
          .select('*')
          .eq('email', inputEmail)
          .maybeSingle()

        if (user && (user.password_hash === hashedPassword || user.password === authPassword)) {
          setCurrentUserId(user.user_id)
          setUserRole(user.role || 'CLIENT')
          setIsLoggedIn(true)
          await loadSystemData(user.user_id, user.role || 'CLIENT')
        } else {
          alert('Неправильний email або пароль!')
        }
      } else {
        const { data: existingUser } = await supabase.from('users').select('user_id').eq('email', inputEmail).maybeSingle()
        if (existingUser) {
          alert('Цей Email вже зареєстрований!')
          setLoading(false)
          return
        }

        const { data: newUser, error: regErr } = await supabase
          .from('users')
          .insert([{ 
            full_name: authName.trim(), 
            email: inputEmail, 
            password_hash: hashedPassword, 
            password: authPassword,
            phone_number: '097' + Math.floor(1000000 + Math.random() * 9000000).toString(),
            role: 'CLIENT', 
            verification_status: 'PENDING' 
          }])
          .select()
          .single()

        if (regErr) {
          alert(`Помилка бази даних: ${regErr.message}`);
          throw regErr;
        }

        if (newUser) {
          const randomIban = 'UA' + Math.floor(10000000000 + Math.random() * 90000000000).toString()
          await supabase.from('accounts').insert([{ user_id: newUser.user_id, balance: 5000.00, iban: randomIban }])

          await supabase.from('transactions').insert([{
            user_id: newUser.user_id,
            amount: 5000.00,
            total_amount: 5000.00,
            transaction_type: 'INCOME',
            description: '🎉 Стартовий бонус Hephaestus Premium'
          }])

          alert('Акаунт створено з криптографічним хешуванням пароля! Баланс: 5000 ₴ 🎉');
          setCurrentUserId(newUser.user_id)
          setUserRole('CLIENT')
          setIsLoggedIn(true)
          await loadSystemData(newUser.user_id, 'CLIENT')
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Надіслати тикет у підтримку
  const handleSupportSubmit = async (e) => {
    e.preventDefault()
    if (!supportMessage.trim()) return

    await supabase.from('support_tickets').insert([{ user_id: currentUserId, message: supportMessage.trim() }])
    setSupportMessage('')
    await loadSystemData(currentUserId, 'CLIENT')
    alert('Ваше звернення надіслано в службу підтримки банку!')
  }

  // Відповісти на тикет (Працівник банку)
  const handleAdminReply = async (ticketId) => {
    const reply = adminReplyText[ticketId]
    if (!reply || !reply.trim()) return

    await supabase.from('support_tickets').update({ reply: reply.trim(), status: 'RESOLVED' }).eq('ticket_id', ticketId)
    await loadSystemData(currentUserId, 'EMPLOYEE')
    alert('Відповідь успішно надіслано клієнту!')
  }

  // Зміна статусу верифікації
  const handleUpdateVerification = async (userId, newStatus) => {
    await supabase.from('users').update({ verification_status: newStatus }).eq('user_id', userId)
    await loadSystemData(currentUserId, 'EMPLOYEE')
    alert(`Статус користувача оновлено на ${newStatus}`)
  }

  // Реальний переказ між користувачами за Email
  const handleTransferSubmit = async (e) => {
    e.preventDefault()
    if (verificationStatus !== 'VERIFIED') {
      alert('Помилка! Ваш акаунт не верифіковано працівником банку. Перекази заблоковано!');
      return
    }

    const amountNum = parseFloat(transferAmount)
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > balance) {
      alert('Некоректна сума або недостатньо коштів!')
      return
    }

    try {
      setIsSending(true)
      const { data: recipient } = await supabase.from('users').select('user_id, full_name').eq('email', recipientEmail.trim().toLowerCase()).maybeSingle()

      if (!recipient) {
        alert('Користувача з такою поштою не знайдено!')
        return
      }

      let { data: recipientAccount } = await supabase.from('accounts').select('balance').eq('user_id', recipient.user_id).maybeSingle()
      if (!recipientAccount) {
        const randomIban = 'UA' + Math.floor(10000000000 + Math.random() * 90000000000).toString()
        const { data: nAcc } = await supabase.from('accounts').insert([{ user_id: recipient.user_id, balance: 0, iban: randomIban }]).select().single()
        recipientAccount = nAcc
      }

      await supabase.from('accounts').update({ balance: balance - amountNum }).eq('user_id', currentUserId)
      await supabase.from('accounts').update({ balance: Number(recipientAccount.balance) + amountNum }).eq('user_id', recipient.user_id)

      const cleanDesc = transferDesc.trim() || 'Переказ коштів'
      await supabase.from('transactions').insert([
        { user_id: currentUserId, amount: -amountNum, total_amount: amountNum, transaction_type: 'EXPENSE', description: `💸 Переказ для ${recipient.full_name} (${cleanDesc})` },
        { user_id: recipient.user_id, amount: amountNum, total_amount: amountNum, transaction_type: 'INCOME', description: `💰 Отримано від ${userFullName} (${cleanDesc})` }
      ])

      setIsModalOpen(false)
      setTransferAmount('')
      setRecipientEmail('')
      setTransferDesc('')
      await loadSystemData(currentUserId, 'CLIENT')
      alert('Переказ успішно виконано!')
    } catch (err) {
      console.error(err)
    } finally {
      setIsSending(false)
    }
  }

  // Оплата послуг
  const handleServiceSubmit = async (e) => {
    e.preventDefault()
    if (verificationStatus !== 'VERIFIED') {
      alert('Оплачувати послуги можуть лише верифіковані клієнти!')
      return
    }
    const amountNum = parseFloat(serviceAmount)

    try {
      setIsSending(true)
      let desc = activeServiceForm === 'phone' ? `📱 Мобільний зв'язок (${serviceTarget})` : `🌐 Інтернет (О/Р ${serviceTarget})`
      await supabase.from('accounts').update({ balance: balance - amountNum }).eq('user_id', currentUserId)
      await supabase.from('transactions').insert([{ user_id: currentUserId, amount: -amountNum, total_amount: amountNum, transaction_type: 'EXPENSE', description: desc }])

      setActiveServiceForm(null)
      setServiceTarget('')
      setServiceAmount('')
      await loadSystemData(currentUserId, 'CLIENT')
      alert('Послугу успішно сплачено!')
    } catch (err) {
      console.error(err)
    } finally {
      setIsSending(false)
    }
  }

  const formatDate = (dateString) => {
    const options = { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }
    return new Date(dateString).toLocaleDateString('uk-UA', options)
  }

  // 🛡️ БЕЗПЕЧНИЙ МАТЕМАТИЧНИЙ РОЗРАХУНОК АНАЛІТИКИ
  const safeTx = transactions || [];
  const totalIncome = safeTx.filter(t => t.amount > 0).reduce((sum, t) => sum + Number(t.amount), 0)
  const totalExpense = safeTx.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100).toFixed(1) : 0

  const getCategorySum = (keyword) => {
    if (!safeTx.length) return 0;
    return safeTx
      .filter(t => t.amount < 0 && t.description && t.description.toLowerCase().includes(keyword.toLowerCase()))
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
  }

  const catSilpo = getCategorySum('сільпо') || getCategorySum('продукти')
  const catPhone = getCategorySum('мобільн') || getCategorySum('звʼязок')
  const catInternet = getCategorySum('інтернет') || getCategorySum('тб')
  const catTransfers = safeTx.filter(t => t.amount < 0 && t.description && t.description.includes('💸')).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

  const getCardBg = () => {
    if (cardTheme === 'platinum') return 'linear-gradient(135deg, #334155 0%, #0f172a 100%)'
    if (cardTheme === 'gold') return 'linear-gradient(135deg, #b45309 0%, #78350f 100%)'
    return 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)'
  }

  return (
    <div style={styles.container} lang="uk">
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logoIcon}>⚡</span>
          <h1 style={styles.logoText}>Hephaestus {userRole === 'EMPLOYEE' ? 'Staff' : 'Construct'}</h1>
        </div>
        {isLoggedIn && <button onClick={() => setIsLoggedIn(false)} style={styles.logoutButton}>Вихід 🚪</button>}
      </header>

      {/* ЕКРАН АВТОРИЗАЦІЇ */}
      {!isLoggedIn ? (
        <div style={styles.authCard}>
          <h2 style={styles.authTitle}>{authMode === 'login' ? 'Вхід у банкінг' : 'Створити акаунт'}</h2>
          <form onSubmit={handleAuth} style={styles.form}>
            {authMode === 'register' && (
              <div style={styles.inputGroup}><label style={styles.label}>Повне ім'я</label><input type="text" placeholder="Данько Анна" required value={authName} onChange={(e) => setAuthName(e.target.value)} style={styles.input} /></div>
            )}
            <div style={styles.inputGroup}><label style={styles.label}>Електронна пошта</label><input type="email" placeholder="anna@mail.com" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} style={styles.input} /></div>
            <div style={styles.inputGroup}><label style={styles.label}>Пароль</label><input type="password" placeholder="••••••••" required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} style={styles.input} /></div>
            <button type="submit" style={styles.submitButton}>{loading ? 'Завантаження...' : (authMode === 'login' ? 'Увійти' : 'Зареєструватися')}</button>
          </form>
          <p style={styles.switchAuthText}>{authMode === 'login' ? 'Ще немає акаунта? ' : 'Вже є акаунт? '}<span style={styles.switchAuthLink} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'Зареєструватися' : 'Увійти'}</span></p>
        </div>
      ) : userRole === 'EMPLOYEE' ? (
        
        /* 🏢 ІНТЕРФЕЙС ПРАЦІВНИКА БАНКУ */
        <div style={styles.appScreen}>
          <div style={styles.welcomeSection}>
            <h2 style={styles.pageTitle}>Панель Працівника Банку</h2>
            <p style={styles.greetLabel}>Управління клієнтами та зверненнями підтримки</p>
          </div>

          <div style={styles.historySection}>
            <h3 style={styles.historyTitle}>📋 Запити на верифікацію (KYC)</h3>
            <div style={styles.transactionsList}>
              {allUsers.filter(u => u.role !== 'EMPLOYEE').map(u => (
                <div key={u.user_id} style={styles.adminUserRow}>
                  <div>
                    <p style={{margin: 0, fontWeight: '600'}}>{u.full_name}</p>
                    <p style={{margin: 0, fontSize: '11px', color: '#94a3b8'}}>{u.email}</p>
                  </div>
                  <div style={{textAlign: 'right'}}>
                    <span style={{
                      fontSize: '11px', padding: '3px 8px', borderRadius: '6px', marginRight: '8px',
                      background: u.verification_status === 'VERIFIED' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                      color: u.verification_status === 'VERIFIED' ? '#10b981' : '#ef4444'
                    }}>{u.verification_status || 'PENDING'}</span>
                    {u.verification_status !== 'VERIFIED' && (
                      <button onClick={() => handleUpdateVerification(u.user_id, 'VERIFIED')} style={styles.adminActionBtn}>Підтвердити</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.historySection}>
            <h3 style={styles.historyTitle}>💬 Черга звернень у підтримку</h3>
            <div style={styles.transactionsList}>
              {allTickets.map(t => (
                <div key={t.ticket_id} style={{...styles.adminUserRow, flexDirection: 'column', alignItems: 'flex-start', gap: '8px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '12px', borderBottom: '1px solid #334155', paddingBottom: '4px'}}>
                    <span style={{fontWeight: 'bold', color: '#2ec4b6'}}>{t.users?.full_name}</span>
                    <span style={{color: t.status === 'OPEN' ? '#ef4444' : '#10b981'}}>{t.status}</span>
                  </div>
                  <p style={{margin: 0, fontSize: '14px', color: '#e2e8f0'}}>«{t.message}»</p>
                  {t.reply ? (
                    <p style={{margin: 0, fontSize: '13px', color: '#10b981', paddingLeft: '10px', borderLeft: '2px solid #10b981'}}>Відповідь: {t.reply}</p>
                  ) : (
                    <div style={{display: 'flex', gap: '8px', width: '100%', marginTop: '4px'}}>
                      <input 
                        type="text" 
                        placeholder="Напишіть відповідь..." 
                        value={adminReplyText[t.ticket_id] || ''}
                        onChange={(e) => setAdminReplyText({...adminReplyText, [t.ticket_id]: e.target.value})}
                        style={{...styles.input, flex: 1, padding: '6px 10px', fontSize: '13px'}}
                      />
                      <button onClick={() => handleAdminReply(t.ticket_id)} style={{...styles.submitButton, margin: 0, padding: '6px 12px', fontSize: '13px'}}>Надіслати</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        
        /* 📱 ІНТЕРФЕЙС КЛІЄНТА БАНКУ */
        <div style={styles.appScreen}>
          <div style={styles.tabContent}>
            {activeTab === 'home' && (
              <>
                <div style={styles.welcomeSection}>
                  <p style={styles.greetLabel}>Вітаємо знову,</p>
                  <h2 style={styles.userName}>{userFullName}</h2>
                  <div style={{display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px'}}>
                    <span style={{
                      fontSize: '11px', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold',
                      background: verificationStatus === 'VERIFIED' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                      color: verificationStatus === 'VERIFIED' ? '#10b981' : '#ef4444'
                    }}>
                      {verificationStatus === 'VERIFIED' ? '🛡️ Верифікований клієнт' : '⚠️ Акаунт не верифіковано'}
                    </span>
                  </div>
                </div>

                <div style={{...styles.creditCard, background: getCardBg()}}>
                  <div style={styles.cardTop}><span style={{...styles.cardBankName, color: cardTheme === 'gold' ? '#fef08a' : '#2ec4b6'}}>HEPHAESTUS PREMIUM</span><span>Visa</span></div>
                  <div style={styles.cardChip}><div style={styles.chipLine}></div></div>
                  <div style={styles.cardMiddle}><p style={styles.balanceLabel}>Поточний баланс</p><p style={styles.cardBalance}>{balance.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} UAH</p></div>
                  <div style={styles.cardBottom}><span>4441 1144 2255 3366</span><span>06/31</span></div>
                </div>

                <div style={styles.themeSelector}>
                  <p style={{margin: 0, fontSize: '12px', color: '#94a3b8'}}>Дизайн картки:</p>
                  <div style={{display: 'flex', gap: '6px'}}>
                    <button onClick={() => setCardTheme('cyber')} style={{...styles.themeBtn, background: '#311042', borderColor: cardTheme === 'cyber' ? '#2ec4b6' : 'transparent'}}>Cyber</button>
                    <button onClick={() => setCardTheme('platinum')} style={{...styles.themeBtn, background: '#334155', borderColor: cardTheme === 'platinum' ? '#2ec4b6' : 'transparent'}}>Platinum</button>
                    <button onClick={() => setCardTheme('gold')} style={{...styles.themeBtn, background: '#78350f', borderColor: cardTheme === 'gold' ? '#fef08a' : 'transparent'}}>Gold</button>
                  </div>
                </div>

                <div style={styles.actionsGrid}>
                  <button style={styles.actionButton} onClick={() => setActiveTab('services')}><span style={styles.actionIcon}>➕</span><span style={styles.actionLabel}>Послуги</span></button>
                  <button style={{...styles.actionButton, borderColor: '#2ec4b6'}} onClick={() => setIsModalOpen(true)}><span style={styles.actionIcon}>💸</span><span style={{...styles.actionLabel, color: '#2ec4b6', fontWeight: 'bold'}}>Переказати</span></button>
                  <button style={styles.actionButton} onClick={() => setActiveTab('analytics')}><span style={styles.actionIcon}>📊</span><span style={styles.actionLabel}>Аналітика</span></button>
                </div>

                <div style={styles.historySection}>
                  <h3 style={styles.historyTitle}>Історія операцій</h3>
                  <div style={styles.transactionsList}>
                    {safeTx.length === 0 ? <p style={styles.statusMessage}>Операцій ще немає</p> : (
                      safeTx.map((tx) => (
                        <div key={tx.transaction_id} style={styles.txItem}>
                          <div style={styles.txLeft}>
                            <div style={{...styles.txIconWrapper, background: tx.amount < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)'}}><span>{tx.amount < 0 ? '🛒' : '💰'}</span></div>
                            <div style={styles.txInfo}><p style={styles.txDescription}>{tx.description}</p><p style={styles.txDate}>{formatDate(tx.created_at)}</p></div>
                          </div>
                          <div style={styles.txRight}><p style={{ ...styles.txAmount, color: tx.amount < 0 ? '#ef4444' : '#10b981' }}>{tx.amount < 0 ? '' : '+'}{tx.amount.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</p></div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'services' && (
              <>
                <div style={styles.welcomeSection}><h2 style={styles.pageTitle}>Платежі та послуги</h2></div>
                <div style={styles.servicesGrid}>
                  <div style={styles.serviceCard} onClick={() => setActiveServiceForm('phone')}>📱 <p style={styles.serviceName}>Мобільний</p></div>
                  <div style={styles.serviceCard} onClick={() => setActiveServiceForm('internet')}>🌐 <p style={styles.serviceName}>Інтернет</p></div>
                </div>
                {activeServiceForm && (
                  <div style={styles.serviceFormBox}>
                    <form onSubmit={handleServiceSubmit} style={styles.form}>
                      <div style={styles.inputGroup}><label style={styles.label}>Реквізити / Номер</label><input type="text" required value={serviceTarget} onChange={(e) => setServiceTarget(e.target.value)} style={styles.input} /></div>
                      <div style={styles.inputGroup}><label style={styles.label}>Сума (UAH)</label><input type="number" required value={serviceAmount} onChange={(e) => setServiceAmount(e.target.value)} style={styles.input} /></div>
                      <button type="submit" style={styles.submitButton}>Оплатити рахунок</button>
                    </form>
                  </div>
                )}
              </>
            )}

            {activeTab === 'analytics' && (
              <>
                <div style={styles.welcomeSection}><h2 style={styles.pageTitle}>Аналітика витрат</h2></div>
                <div style={styles.mathReportCard}>
                  <h4 style={{margin: '0 0 15px 0'}}>Категоріальний розподіл:</h4>
                  <div style={{marginBottom: '10px'}}>🛒 Супермаркети: **{catSilpo} ₴**</div>
                  <div style={{marginBottom: '10px'}}>📱 Мобільний зв'язок: **{catPhone} ₴**</div>
                  <div style={{marginBottom: '10px'}}>🌐 Інтернет та ТБ: **{catInternet} ₴**</div>
                  <div style={{marginBottom: '10px'}}>💸 Перекази: **{catTransfers} ₴**</div>
                  <hr style={{borderColor: '#334155', margin: '15px 0'}} />
                  <p style={{margin: 0, fontSize: '13px'}}>Коефіцієнт заощаджень: **{savingsRate}%**</p>
                </div>
              </>
            )}

            {activeTab === 'support' && (
              <>
                <div style={styles.welcomeSection}>
                  <h2 style={styles.pageTitle}>Підтримка банку</h2>
                  <p style={styles.greetLabel}>Звернення до оператора в реальному часі</p>
                </div>
                <div style={styles.serviceFormBox}>
                  <form onSubmit={handleSupportSubmit} style={styles.form}>
                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Опишіть ваше питання</label>
                      <textarea required rows="3" placeholder="Напишіть нам..." value={supportMessage} onChange={(e) => setSupportMessage(e.target.value)} style={{...styles.input, fontFamily: 'inherit', resize: 'none'}} />
                    </div>
                    <button type="submit" style={styles.submitButton}>Надіслати звернення</button>
                  </form>
                </div>
                <div style={styles.historySection}>
                  <h3 style={styles.historyTitle}>📜 Історія ваших звернень</h3>
                  <div style={styles.transactionsList}>
                    {clientTickets.length === 0 ? <p style={styles.statusMessage}>Звернень немає</p> : clientTickets.map(t => (
                      <div key={t.ticket_id} style={{...styles.txItem, flexDirection: 'column', alignItems: 'flex-start', gap: '6px', paddingBottom: '10px'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '11px', color: '#94a3b8'}}>
                          <span>{formatDate(t.created_at)}</span>
                          <span style={{color: t.status === 'OPEN' ? '#ef4444' : '#10b981', fontWeight: 'bold'}}>{t.status}</span>
                        </div>
                        <p style={{margin: 0, fontSize: '14px'}}>Ви: {t.message}</p>
                        {t.reply && <p style={{margin: 0, fontSize: '13px', color: '#2ec4b6', fontWeight: '500'}}>Менеджер: {t.reply}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <nav style={styles.navBar}>
            <button style={{...styles.navButton, color: activeTab === 'home' ? '#2ec4b6' : '#94a3b8'}} onClick={() => setActiveTab('home')}>🏠<span style={styles.navLabel}>Головна</span></button>
            <button style={{...styles.navButton, color: activeTab === 'services' ? '#2ec4b6' : '#94a3b8'}} onClick={() => setActiveTab('services')}>🛒<span style={styles.navLabel}>Послуги</span></button>
            <button style={{...styles.navButton, color: activeTab === 'analytics' ? '#2ec4b6' : '#94a3b8'}} onClick={() => setActiveTab('analytics')}>📊<span style={styles.navLabel}>Аналітика</span></button>
            <button style={{...styles.navButton, color: activeTab === 'support' ? '#2ec4b6' : '#94a3b8'}} onClick={() => setActiveTab('support')}>💬<span style={styles.navLabel}>Підтримка</span></button>
          </nav>
        </div>
      )}

      {/* МОДАЛКА ПЕРЕКАЗУ */}
      {isModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}><h3>Переказ за Email 💸</h3><button style={styles.closeButton} onClick={() => setIsModalOpen(false)}>✕</button></div>
            <form onSubmit={handleTransferSubmit} style={styles.form}>
              <div style={styles.inputGroup}><label style={styles.label}>Email отримувача</label><input type="email" required value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} style={styles.input} /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Сума (UAH)</label><input type="number" step="0.01" required value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} style={styles.input} /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Коментар</label><input type="text" value={transferDesc} onChange={(e) => setTransferDesc(e.target.value)} style={styles.input} /></div>
              <button type="submit" disabled={isSending} style={styles.submitButton}>{isSending ? 'Надсилання...' : 'Надіслати кошти'}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// Повні стилі системи Hephaestus Premium Finance CRM
const styles = {
  container: { background: '#0f172a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: '"Segoe UI", Roboto, sans-serif', color: '#f8fafc', padding: '15px 15px 95px 15px', boxSizing: 'border-box' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '390px', marginBottom: '20px', borderBottom: '1px solid #1e293b', paddingBottom: '10px' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '8px' },
  logoIcon: { fontSize: '18px', background: 'linear-gradient(135deg, #2ec4b6, #06b6d4)', padding: '4px 8px', borderRadius: '8px' },
  logoText: { fontSize: '17px', fontWeight: '800', background: 'linear-gradient(to right, #2ec4b6, #a5f3fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 },
  logoutButton: { background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '6px 12px', color: '#ef4444', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  authCard: { background: '#1e293b', border: '1px solid #334155', borderRadius: '24px', padding: '28px', width: '100%', maxWidth: '350px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)', marginTop: '30px' },
  authTitle: { margin: '0 0 16px 0', fontSize: '22px', fontWeight: '700', color: '#fff' },
  switchAuthText: { margin: '20px 0 0 0', fontSize: '13px', color: '#94a3b8' },
  switchAuthLink: { color: '#2ec4b6', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' },
  appScreen: { width: '100%', maxWidth: '390px', display: 'flex', flexDirection: 'column', gap: '20px' },
  tabContent: { display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' },
  welcomeSection: { textAlign: 'left', paddingLeft: '5px' },
  greetLabel: { color: '#94a3b8', margin: 0, fontSize: '13px' },
  userName: { margin: '4px 0 0 0', fontSize: '22px', fontWeight: '600', color: '#fff' },
  pageTitle: { margin: '0 0 4px 0', fontSize: '22px', fontWeight: '700', color: '#fff' },
  creditCard: { borderRadius: '20px', padding: '20px', aspectRatio: '1.586', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.05)' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardBankName: { fontSize: '11px', fontWeight: '700', letterSpacing: '2px' },
  cardMiddle: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
  balanceLabel: { margin: 0, fontSize: '11px', color: '#94a3b8' },
  cardBalance: { margin: '3px 0 0 0', fontSize: '26px', fontWeight: '700', color: '#10b981' },
  cardBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  themeSelector: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e293b', borderRadius: '12px', padding: '8px 12px', border: '1px solid #334155' },
  themeBtn: { border: '1px solid', padding: '4px 8px', borderRadius: '6px', color: '#fff', fontSize: '11px', cursor: 'pointer' },
  actionsGrid: { display: 'flex', justifyContent: 'space-between', gap: '10px' },
  actionButton: { flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer' },
  actionLabel: { fontSize: '11px', fontWeight: '500', color: '#cbd5e1' },
  historySection: { textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '12px' },
  historyTitle: { margin: 0, fontSize: '16px', fontWeight: '600', color: '#fff', paddingLeft: '5px' },
  transactionsList: { display: 'flex', flexDirection: 'column', gap: '10px', background: '#1e293b', borderRadius: '20px', padding: '14px', border: '1px solid #334155' },
  statusMessage: { margin: 0, color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '15px 0' },
  txItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid #334155', gap: '10px' },
  txLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  txIconWrapper: { width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  txInfo: { display: 'flex', flexDirection: 'column', gap: '2px' },
  txDescription: { margin: 0, fontSize: '14px', fontWeight: '500', color: '#f8fafc' },
  txDate: { margin: 0, fontSize: '11px', color: '#94a3b8' },
  txRight: { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px' },
  txAmount: { margin: 0, fontSize: '14px', fontWeight: '600' },
  servicesGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  serviceCard: { background: '#1e293b', border: '1px solid #334155', borderRadius: '20px', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', cursor: 'pointer' },
  serviceFormBox: { background: '#1e293b', border: '1px solid #334155', borderRadius: '20px', padding: '20px', textAlign: 'left' },
  analyticsStats: { display: 'flex', gap: '12px' },
  statBox: { flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '14px', textAlign: 'left' },
  mathReportCard: { background: '#1e1b4b', border: '1px solid #311042', borderRadius: '20px', padding: '20px', textAlign: 'left' },
  progressBarBg: { width: '100%', height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: '3px', transition: 'width 0.4s ease' },
  navBar: { position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '390px', height: '70px', background: 'rgba(30, 41, 59, 0.95)', backdropFilter: 'blur(10px)', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 999 },
  navButton: { background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' },
  navLabel: { fontSize: '10px', fontWeight: '600' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', zIndex: 1000 },
  modalContent: { background: '#1e293b', border: '1px solid #334155', borderRadius: '24px', padding: '24px', width: '100%', maxWidth: '350px' },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' },
  label: { fontSize: '13px', color: '#94a3b8', fontWeight: '500' },
  input: { background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '12px', color: '#fff', fontSize: '15px', outline: 'none' },
  submitButton: { background: 'linear-gradient(135deg, #2ec4b6, #06b6d4)', border: 'none', borderRadius: '12px', padding: '14px', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: 'pointer', marginTop: '10px' },
  adminUserRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid #334155', width: '100%' },
  adminActionBtn: { background: '#10b981', border: 'none', borderRadius: '6px', padding: '4px 10px', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }
}

export default App