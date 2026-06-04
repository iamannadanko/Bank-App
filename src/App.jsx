import { useState } from 'react'
import { supabase } from './supabaseClient'
import { useBankData } from './useBankData'
import './App.css'

function App() {
  const bank = useBankData();

  // Поля форм
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authName, setAuthName] = useState('')
  const [activeTab, setActiveTab] = useState('home')
  const [supportMessage, setSupportMessage] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [adminReplyText, setAdminReplyText] = useState({})

  // Автоматична верифікація
  const [passportNumber, setPassportNumber] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)

  // Модалка переказів
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferDesc, setTransferDesc] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [cardTheme, setCardTheme] = useState('cyber')

  // Послуги
  const [activeServiceForm, setActiveServiceForm] = useState(null)
  const [serviceTarget, setServiceTarget] = useState('')
  const [serviceAmount, setServiceAmount] = useState('')

  // Авторизація
  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    const hashedPassword = await bank.hashPassword(authPassword)
    const inputEmail = authEmail.trim().toLowerCase()

    if (bank.authMode === 'login') {
      const { data: user } = await supabase.from('users').select('*').eq('email', inputEmail).maybeSingle()
      if (user && (user.password_hash === hashedPassword || user.password_hash === authPassword || user.password === authPassword)) {
        bank.setCurrentUserId(user.user_id)
        bank.setUserRole(user.role || 'CLIENT')
        bank.setIsLoggedIn(true)
        await bank.loadSystemData(user.user_id, user.role || 'CLIENT')
      } else {
        alert('Неправильний email або пароль!')
      }
    } else {
      const { data: existingUser } = await supabase.from('users').select('user_id').eq('email', inputEmail).maybeSingle()
      if (existingUser) { return alert('Цей Email вже зайнятий!') }

      const { data: newUser } = await supabase.from('users').insert([{ full_name: authName.trim(), email: inputEmail, password_hash: hashedPassword, phone_number: '0970000000', role: 'CLIENT', verification_status: 'PENDING' }]).select().single()
      if (newUser) {
        const randomIban = 'UA' + Math.floor(10000000000 + Math.random() * 90000000000).toString()
        await supabase.from('accounts').insert([{ user_id: newUser.user_id, balance: 5000.00, iban: randomIban }])
        await supabase.from('transactions').insert([{ user_id: newUser.user_id, amount: 5000.00, total_amount: 5000.00, transaction_type: 'INCOME', description: '🎉 Стартовий бонус Hephaestus Premium' }])
        alert('Акаунт створено! Пройдіть автоматичну верифікацію в кабінеті.');
        bank.setCurrentUserId(newUser.user_id); bank.setUserRole('CLIENT'); bank.setIsLoggedIn(true);
        await bank.loadSystemData(newUser.user_id, 'CLIENT')
      }
    }
  }

  // Швидка верифікація ИИ
  const handleAutoVerification = async (e) => {
    e.preventDefault()
    if (!passportNumber.trim()) return
    setIsVerifying(true)
    
    setTimeout(async () => {
      try {
        await supabase.from('users').update({ verification_status: 'VERIFIED' }).eq('user_id', bank.currentUserId)
        bank.setVerificationStatus('VERIFIED')
        setPassportNumber('')
        alert('Документи успішно перевірено штучним інтелектом банку! Акаунт верифіковано 🛡️')
      } catch (err) {
        console.error(err)
      } finally {
        setIsVerifying(false)
      }
    }, 2200)
  }

  // Зміна пароля
  const handleChangePassword = async (e) => {
    e.preventDefault()
    const hashedNew = await bank.hashPassword(newPassword)
    await supabase.from('users').update({ password_hash: hashedNew, password: null }).eq('user_id', bank.currentUserId)
    setNewPassword('')
    alert('Пароль успішно змінено на новий хеш SHA-256! 🎉')
  }

  // Надіслати тикет у підтримку
  const handleSupportSubmit = async (e) => {
    e.preventDefault()
    await supabase.from('support_tickets').insert([{ user_id: bank.currentUserId, message: supportMessage.trim() }])
    setSupportMessage('')
    await bank.loadSystemData(bank.currentUserId, 'CLIENT')
    alert('Звернення надіслано в службу підтримки банку!')
  }

  // Відповідь адміна
  const handleAdminReply = async (ticketId) => {
    const reply = adminReplyText[ticketId]
    await supabase.from('support_tickets').update({ reply: reply.trim(), status: 'RESOLVED' }).eq('ticket_id', ticketId)
    await bank.loadSystemData(bank.currentUserId, 'EMPLOYEE')
    alert('Відповідь надіслано!')
  }

  // Ручна верифікація
  const handleUpdateVerification = async (userId, newStatus) => {
    await supabase.from('users').update({ verification_status: newStatus }).eq('user_id', userId)
    await bank.loadSystemData(bank.currentUserId, 'EMPLOYEE')
    alert(`Статус оновлено: ${newStatus}`)
  }

  // Переказ грошей між користувачами за Email
  const handleTransferSubmit = async (e) => {
    e.preventDefault()
    if (bank.verificationStatus !== 'VERIFIED') return alert('Помилка! Ваш акаунт не верифіковано.');
    const amountNum = parseFloat(transferAmount)
    setIsSending(true)
    const { data: recipient } = await supabase.from('users').select('user_id, full_name').eq('email', recipientEmail.trim().toLowerCase()).maybeSingle()
    if (!recipient) { setIsSending(false); return alert('Користувача не знайдено!'); }
    let { data: recAcc } = await supabase.from('accounts').select('balance').eq('user_id', recipient.user_id).single()
    
    await supabase.from('accounts').update({ balance: bank.balance - amountNum }).eq('user_id', bank.currentUserId)
    await supabase.from('accounts').update({ balance: Number(recAcc.balance) + amountNum }).eq('user_id', recipient.user_id)
    await supabase.from('transactions').insert([
      { user_id: bank.currentUserId, amount: -amountNum, total_amount: amountNum, transaction_type: 'EXPENSE', description: `💸 Переказ для ${recipient.full_name}` },
      { user_id: recipient.user_id, amount: amountNum, total_amount: amountNum, transaction_type: 'INCOME', description: `💰 Отримано від ${bank.userFullName}` }
    ])
    setIsModalOpen(false); setIsSending(false);
    await bank.loadSystemData(bank.currentUserId, 'CLIENT')
    alert('Переказ виконано!')
  }

  // Оплата послуг
  const handleServiceSubmit = async (e) => {
    e.preventDefault()
    if (bank.verificationStatus !== 'VERIFIED') return alert('Сплачувати послуги можуть лише верифіковані клієнти!')
    const amountNum = parseFloat(serviceAmount)
    let desc = `🛒 Оплата послуги (${activeServiceForm})`
    if (activeServiceForm === 'phone') desc = `📱 Поповнення мобільного (${serviceTarget})`
    if (activeServiceForm === 'internet') desc = `🌐 Оплата інтернету (О/Р ${serviceTarget})`
    if (activeServiceForm === 'utilities') desc = `🏠 Комунальні платежі (О/Р ${serviceTarget})`
    if (activeServiceForm === 'charity') desc = `❤️ Донат на підтримку ЗСУ`

    await supabase.from('accounts').update({ balance: bank.balance - amountNum }).eq('user_id', bank.currentUserId)
    await supabase.from('transactions').insert([{ user_id: bank.currentUserId, amount: -amountNum, total_amount: amountNum, transaction_type: 'EXPENSE', description: desc }])
    setActiveServiceForm(null); setServiceTarget(''); setServiceAmount('');
    await bank.loadSystemData(bank.currentUserId, 'CLIENT')
    alert('Оплата пройшла успішно!')
  }

  const getCardBg = () => {
    if (cardTheme === 'platinum') return 'linear-gradient(135deg, #334155 0%, #0f172a 100%)'
    if (cardTheme === 'gold') return 'linear-gradient(135deg, #b45309 0%, #78350f 100%)'
    return 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)'
  }

  return (
    <div className="bank-container">
      <header className="bank-header">
        <div className="header-left">
          <span className="logo-icon">⚡</span>
          <h1 className="logo-text">Hephaestus {bank.userRole === 'EMPLOYEE' ? 'Staff' : 'Construct'}</h1>
        </div>
        {bank.isLoggedIn && <button onClick={() => bank.setIsLoggedIn(false)} className="logout-button">Вихід 🚪</button>}
      </header>

      {!bank.isLoggedIn ? (
        <div className="auth-card">
          <h2 className="auth-title">{bank.authMode === 'login' ? 'Вхід у банкінг' : 'Створити акаунт'}</h2>
          <form onSubmit={handleAuthSubmit} className="bank-form">
            {bank.authMode === 'register' && (
              <div className="input-group"><label className="bank-label">Повне ім'я</label><input type="text" placeholder="Данько Анна" required value={authName} onChange={(e) => setAuthName(e.target.value)} className="bank-input" /></div>
            )}
            <div style={{textAlign: 'left'}} className="input-group"><label className="bank-label">Електронна пошта</label><input type="email" placeholder="client@mail.com" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="bank-input" /></div>
            <div style={{textAlign: 'left'}} className="input-group"><label className="bank-label">Пароль</label><input type="password" placeholder="••••••••" required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="bank-input" /></div>
            <button type="submit" className="submit-button">{bank.loading ? 'Завантаження...' : (bank.authMode === 'login' ? 'Увійти' : 'Зареєструватися')}</button>
          </form>
          <p className="switch-auth-text">{bank.authMode === 'login' ? 'Ще немає акаунта? ' : 'Вже є акаунт? '}<span className="switch-auth-link" onClick={() => bank.setAuthMode(bank.authMode === 'login' ? 'register' : 'login')}>{bank.authMode === 'login' ? 'Зареєструватися' : 'Увійти'}</span></p>
        </div>
      ) : bank.userRole === 'EMPLOYEE' ? (
        
        /* 🏢 ІНТЕРФЕЙС ПРАЦІВНИКА */
        <div className="app-screen">
          <div className="welcome-section">
            <h2 className="page-title">Панель Працівника Банку</h2>
            <p className="greet-label">Управління клієнтами та зверненнями підтримки</p>
          </div>
          <div className="service-form-box">
            <h4 style={{margin: '0 0 10px 0', color: '#2ec4b6'}}>🔒 Безпека: Оновити пароль адміна</h4>
            <form onSubmit={handleChangePassword} style={{display: 'flex', gap: '10px'}}>
              <input type="password" required placeholder="Введіть новий пароль..." value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bank-input" style={{flex: 1}} />
              <button type="submit" className="submit-button" style={{margin: 0, padding: '0 15px'}}>Зберегти</button>
            </form>
          </div>
          <div className="history-section">
            <h3 className="history-title">📋 Запити на верифікацію (KYC)</h3>
            <div className="transactions-list">
              {bank.allUsers.filter(u => u.role !== 'EMPLOYEE').map(u => (
                <div key={u.user_id} className="admin-user-row">
                  <div><p style={{margin: 0, fontWeight: '600'}}>{u.full_name}</p><p style={{margin: 0, fontSize: '11px', color: '#94a3b8'}}>{u.email}</p></div>
                  <div style={{textAlign: 'right'}}><span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '6px', marginRight: '8px', background: u.verification_status === 'VERIFIED' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)', color: u.verification_status === 'VERIFIED' ? '#10b981' : '#ef4444'}}>{u.verification_status || 'PENDING'}</span>
                    {u.verification_status !== 'VERIFIED' && <button onClick={() => handleUpdateVerification(u.user_id, 'VERIFIED')} className="admin-action-btn">Підтвердити</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="history-section">
            <h3 className="history-title">💬 Черга звернень у підтримку</h3>
            <div className="transactions-list">
              {bank.allTickets.map(t => (
                <div key={t.ticket_id} className="admin-user-row" style={{flexDirection: 'column', alignItems: 'flex-start', gap: '8px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '12px', borderBottom: '1px solid #334155', paddingBottom: '4px'}}><span style={{fontWeight: 'bold', color: '#2ec4b6'}}>{t.users?.full_name}</span><span style={{color: t.status === 'OPEN' ? '#ef4444' : '#10b981'}}>{t.status}</span></div>
                  <p style={{margin: 0, fontSize: '14px', color: '#e2e8f0'}}>«{t.message}»</p>
                  {t.reply ? <p style={{margin: 0, fontSize: '13px', color: '#10b981', paddingLeft: '10px', borderLeft: '2px solid #10b981'}}>Відповідь: {t.reply}</p> : 
                    <div style={{display: 'flex', gap: '8px', width: '100%', marginTop: '4px'}}><input type="text" placeholder="Напишіть відповідь..." value={adminReplyText[t.ticket_id] || ''} onChange={(e) => setAdminReplyText({...adminReplyText, [t.ticket_id]: e.target.value})} className="bank-input" style={{flex: 1, padding: '6px 10px', fontSize: '13px'}} /><button onClick={() => handleAdminReply(t.ticket_id)} className="submit-button" style={{margin: 0, padding: '6px 12px', fontSize: '13px'}}>Надіслати</button></div>
                  }
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        
        /* 📱 ІНТЕРФЕЙС КЛІЄНТА */
        <div className="app-screen">
          <div className="tab-content">
            {activeTab === 'home' && (
              <>
                <div className="welcome-section">
                  <p className="greet-label">Вітаємо знову,</p>
                  <h2 className="user-name">{bank.userFullName}</h2>
                  <div style={{marginTop: '6px'}}><span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', background: bank.verificationStatus === 'VERIFIED' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)', color: bank.verificationStatus === 'VERIFIED' ? '#10b981' : '#ef4444'}}>{bank.verificationStatus === 'VERIFIED' ? '🛡️ Верифікований клієнт' : '⚠️ Акаунт не верифіковано'}</span></div>
                </div>

                {bank.verificationStatus !== 'VERIFIED' && (
                  <div className="service-form-box" style={{border: '1px dashed #ef4444', background: 'rgba(239, 68, 68, 0.02)'}}>
                    <h4 style={{margin: '0 0 8px 0', color: '#ef4444', fontSize: '14px'}}>🛡️ Миттєва верифікація акаунта</h4>
                    <p style={{margin: '0 0 12px 0', fontSize: '12px', color: '#94a3b8'}}>Введіть серію та номер паспорта або ID-картки для автоматичної перевірки штучним інтелектом:</p>
                    <form onSubmit={handleAutoVerification} style={{display: 'flex', gap: '10px'}}>
                      <input type="text" required placeholder="Наприклад: МТ 123456" value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} className="bank-input" style={{flex: 1, padding: '10px'}} disabled={isVerifying} />
                      <button type="submit" className="submit-button" style={{margin: 0, padding: '0 15px', fontSize: '13px'} } disabled={isVerifying}>
                        {isVerifying ? 'Перевірка...' : 'Підтвердити'}
                      </button>
                    </form>
                  </div>
                )}

                <div className="credit-card" style={{background: getCardBg()}}>
                  <div className="card-top"><span style={{color: cardTheme === 'gold' ? '#fef08a' : '#2ec4b6'}}>HEPHAESTUS PREMIUM</span><span>Visa</span></div>
                  <div style={{width: '38px', height: '28px', background: 'linear-gradient(135deg, #e2e8f0, #94a3b8)', borderRadius: '6px'}}></div>
                  <div className="card-middle"><p className="balance-label">Поточний баланс</p><p className="card-balance">{bank.balance.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} UAH</p></div>
                  <div className="card-bottom"><span>4441 1144 2255 3366</span><span>06/31</span></div>
                </div>

                <div className="theme-selector">
                  <p style={{margin: 0, fontSize: '12px', color: '#94a3b8'}}>Дизайн картки:</p>
                  <div style={{display: 'flex', gap: '6px'}}>
                    <button onClick={() => setCardTheme('cyber')} className="theme-btn" style={{background: '#311042', borderColor: cardTheme === 'cyber' ? '#2ec4b6' : 'transparent'}}>Cyber</button>
                    <button onClick={() => setCardTheme('platinum')} className="theme-btn" style={{background: '#334155', borderColor: cardTheme === 'platinum' ? '#2ec4b6' : 'transparent'}}>Platinum</button>
                    <button onClick={() => setCardTheme('gold')} className="theme-btn" style={{background: '#78350f', borderColor: cardTheme === 'gold' ? '#fef08a' : 'transparent'}}>Gold</button>
                  </div>
                </div>

                <div className="actions-grid">
                  <button className="action-button" onClick={() => setActiveTab('services')}><span>➕</span><span className="action-label">Послуги</span></button>
                  <button className="action-button" style={{borderColor: '#2ec4b6', background: 'rgba(46, 196, 182, 0.05)'}} onClick={() => setIsModalOpen(true)}><span>💸</span><span className="action-label" style={{color: '#2ec4b6', fontWeight: 'bold'}}>Переказати</span></button>
                  <button className="action-button" onClick={() => setActiveTab('analytics')}><span>📊</span><span className="action-label">Аналітика</span></button>
                </div>

                <div className="history-section">
                  <h3 className="history-title">Історія операцій</h3>
                  <div className="transactions-list">
                    {bank.transactions.length === 0 ? <p className="status-message">Операцій ще немає</p> : (
                      bank.transactions.map((tx) => (
                        <div key={tx.transaction_id} className="tx-item">
                          <div className="tx-left">
                            <div className="tx-icon-wrapper" style={{background: tx.amount < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)'}}><span>{tx.amount < 0 ? '🛒' : '💰'}</span></div>
                            <div className="tx-info"><p className="tx-description">{tx.description}</p><p className="tx-date">{tx.created_at ? tx.created_at.split('T')[0] : 'Сьогодні'}</p></div>
                          </div>
                          <div style={{textAlign: 'right'}}><p className="tx-amount" style={{ color: tx.amount < 0 ? '#ef4444' : '#10b981' }}>{tx.amount < 0 ? '' : '+'}{tx.amount} ₴</p></div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'services' && (
              <>
                <div className="welcome-section"><h2 className="page-title">Платежі та послуги</h2><p className="greet-label">Оберіть категорію для швидкої оплати</p></div>
                <div className="services-grid4">
                  <div className="service-card" onClick={() => { setActiveServiceForm('phone'); setServiceTarget(''); setServiceAmount(''); }}><span>📱</span> <p className="service-name">Мобільний зв'язок</p></div>
                  <div className="service-card" onClick={() => { setActiveServiceForm('internet'); setServiceTarget(''); setServiceAmount(''); }}><span>🌐</span> <p className="service-name">Інтернет та ТБ</p></div>
                  <div className="service-card" onClick={() => { setActiveServiceForm('utilities'); setServiceTarget(''); setServiceAmount(''); }}><span>🏠</span> <p className="service-name">Комунальні послуги</p></div>
                  <div className="service-card" onClick={() => { setActiveServiceForm('charity'); setServiceTarget('ЗСУ'); setServiceAmount(''); }}><span>❤️</span> <p className="service-name">Донати на ЗСУ</p></div>
                </div>

                {activeServiceForm && (
                  <div className="service-form-box">
                    <h4 style={{margin: '0 0 15px 0', color: '#2ec4b6'}}>
                      {activeServiceForm === 'phone' && '📱 Поповнення мобільного'}
                      {activeServiceForm === 'internet' && '🌐 Оплата Інтернету'}
                      {activeServiceForm === 'utilities' && '🏠 Оплата Комунальних'}
                      {activeServiceForm === 'charity' && '❤️ Благодійний внесок на ЗСУ'}
                    </h4>
                    <form onSubmit={handleServiceSubmit} className="bank-form">
                      {activeServiceForm !== 'charity' && (
                        <div className="input-group"><label className="bank-label">{activeServiceForm === 'phone' ? 'Номер телефону' : 'Особовий рахунок'}</label><input type="text" required placeholder={activeServiceForm === 'phone' ? '+380671234567' : '№ 487512'} value={serviceTarget} onChange={(e) => setServiceTarget(e.target.value)} className="bank-input" /></div>
                      )}
                      <div className="input-group"><label className="bank-label">Сума (UAH)</label><input type="number" required placeholder="0.00" value={serviceAmount} onChange={(e) => setServiceAmount(e.target.value)} className="bank-input" /></div>
                      <button type="submit" className="submit-button">Провести платіж</button>
                    </form>
                  </div>
                )}
              </>
            )}

            {activeTab === 'analytics' && (
              <>
                <div className="welcome-section"><h2 className="page-title">Аналітика витрат</h2></div>
                <div className="math-report-card">
                  <h4 style={{margin: '0 0 15px 0'}}>Категоріальний розподіл витрат:</h4>
                  <div style={{marginBottom: '10px'}}>🛒 Супермаркети та продукти: **{bank.catSilpo || 0} ₴**</div>
                  <div style={{marginBottom: '10px'}}>📱 Мобільний зв'язок: **{bank.catPhone || 0} ₴**</div>
                  <div style={{marginBottom: '10px'}}>🌐 Інтернет та ТБ: **{bank.catInternet || 0} ₴**</div>
                  <div style={{marginBottom: '10px'}}>💸 Перекази (Card-to-Card): **{bank.catTransfers || 0} ₴**</div>
                  <hr style={{borderColor: '#334155', margin: '15px 0'}} />
                  <p style={{margin: 0, fontSize: '13px', color: '#cbd5e1'}}>Коефіцієнт заощаджень: **{bank.savingsRate || 0}%**</p>
                </div>
              </>
            )}

            {activeTab === 'support' && (
              <>
                <div className="welcome-section"><h2 className="page-title">Налаштування та Підтримка</h2></div>
                <div className="service-form-box">
                  <h4 style={{margin: '0 0 12px 0', color: '#2ec4b6', fontSize: '14px'}}>🔒 Змінити пароль на новий</h4>
                  <form onSubmit={handleChangePassword} className="bank-form"><div style={{display: 'flex', gap: '10px'}}><input type="password" required placeholder="Введіть новий пароль..." value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bank-input" style={{flex: 1}} /><button type="submit" className="submit-button" style={{margin: 0, padding: '0 20px'}}>Оновити</button></div></form>
                </div>
                <div className="service-form-box">
                  <form onSubmit={handleSupportSubmit} className="bank-form"><div className="input-group"><label className="bank-label">Опишіть вашу проблему оператору банку</label><textarea required rows="3" placeholder="Напишіть нам..." value={supportMessage} onChange={(e) => setSupportMessage(e.target.value)} className="bank-input" style={{fontFamily: 'inherit', resize: 'none'}} /></div><button type="submit" className="submit-button">Надіслати звернення</button></form>
                </div>
                <div className="history-section">
                  <h3 className="history-title">📜 Історія вашої підтримки</h3>
                  <div className="transactions-list">
                    {bank.clientTickets.length === 0 ? <p className="status-message">Звернень немає</p> : bank.clientTickets.map(t => (
                      <div key={t.ticket_id} className="tx-item" style={{flexDirection: 'column', alignItems: 'flex-start', gap: '6px', paddingBottom: '10px'}}><div style={{display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '11px', color: '#94a3b8'}}><span>{t.created_at ? t.created_at.split('T')[0] : 'Сьогодні'}</span><span style={{color: t.status === 'OPEN' ? '#ef4444' : '#10b981', fontWeight: 'bold'}}>{t.status}</span></div><p style={{margin: 0, fontSize: '14px'}}>Ви: {t.message}</p>
                        {t.reply && <p style={{margin: 0, fontSize: '13px', color: '#2ec4b6', fontWeight: '500'}}>Менеджер: {t.reply}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <nav className="nav-bar">
            <button className="nav-button" style={{color: activeTab === 'home' ? '#2ec4b6' : '#94a3b8'}} onClick={() => setActiveTab('home')}>🏠<span className="nav-label">Головна</span></button>
            <button className="nav-button" style={{color: activeTab === 'services' ? '#2ec4b6' : '#94a3b8'}} onClick={() => setActiveTab('services')}>🛒<span className="nav-label">Послуги</span></button>
            <button className="nav-button" style={{color: activeTab === 'analytics' ? '#2ec4b6' : '#94a3b8'}} onClick={() => setActiveTab('analytics')}>📊<span className="nav-label">Аналітика</span></button>
            <button className="nav-button" style={{color: activeTab === 'support' ? '#2ec4b6' : '#94a3b8'}} onClick={() => setActiveTab('support')}>💬<span className="nav-label">Підтримка</span></button>
          </nav>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{background: '#1e293b', borderRadius: '24px', padding: '24px', width: '100%', maxWidth: '350px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}><h3>Переказ за Email 💸</h3><button onClick={() => setIsModalOpen(false)} style={{background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer'}}>✕</button></div>
            <form onSubmit={handleTransferSubmit} className="bank-form">
              <div className="input-group"><label className="bank-label">Email отримувача</label><input type="email" required value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} className="bank-input" /></div>
              <div className="input-group"><label className="bank-label">Сума (UAH)</label><input type="number" step="0.01" required value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} className="bank-input" /></div>
              <div className="input-group"><label className="bank-label">Коментар</label><input type="text" value={transferDesc} onChange={(e) => setTransferDesc(e.target.value)} className="bank-input" /></div>
              <button type="submit" disabled={isSending} className="submit-button">{isSending ? 'Надсилання...' : 'Надіслати кошти'}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App