import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { useBankData } from './useBankData'
import './App.css'

function App() {
  const bank = useBankData();

  useEffect(() => {
    document.title = "Hephaestus Construct"
  }, [])

  // Поля форм авторизації
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authName, setAuthName] = useState('')
  const [activeTab, setActiveTab] = useState('home')
  const [supportMessage, setSupportMessage] = useState('')
  
  // Зміна пароля та верифікація
  const [newPassword, setNewPassword] = useState('')
  const [passportNumber, setPassportNumber] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  
  const [adminReplyText, setAdminReplyText] = useState({})

  // Вікна модалок
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  
  // Поля для фінансових операцій
  const [targetCardNumber, setTargetCardNumber] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferDesc, setTransferDesc] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [cardTheme, setCardTheme] = useState('cyber')

  // Послуги
  const [activeServiceForm, setActiveServiceForm] = useState(null)
  const [serviceTarget, setServiceTarget] = useState('')
  const [serviceAmount, setServiceAmount] = useState('')

  // Розумний обробник авторизації
  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    bank.setLoading(true)
    const hashedPassword = await bank.hashPassword(authPassword)
    const inputEmail = authEmail.trim().toLowerCase()

    if (bank.authMode === 'login') {
      const { data: user } = await supabase.from('users').select('*').eq('email', inputEmail).maybeSingle()
      
      if (user && (user.password_hash === hashedPassword || user.password_hash === authPassword || user.password === authPassword)) {
        bank.setIsLoggedIn(user.user_id, user.role || 'CLIENT')
      } else {
        alert('Неправильний email або пароль!')
      }
      bank.setLoading(false)
    } else {
      const { data: existingUser } = await supabase.from('users').select('user_id').eq('email', inputEmail).maybeSingle()
      if (existingUser) { bank.setLoading(false); return alert('Цей Email вже зайнятий!'); }

      const { data: newUser } = await supabase.from('users').insert([{ full_name: authName.trim(), email: inputEmail, password_hash: hashedPassword, phone_number: '0970000000', role: 'CLIENT', verification_status: 'PENDING' }]).select().single()
      if (newUser) {
        const randomIban = 'UA' + Math.floor(10000000000 + Math.random() * 90000000000).toString()
        await supabase.from('accounts').insert([{ user_id: newUser.user_id, balance: 5000.00, iban: randomIban }])
        
        // Створюємо відразу першу золоту картку з балансом 5000 в таблиці cards
        await supabase.from('cards').insert([{ user_id: newUser.user_id, card_number: '4441 1144 2255 3366', card_type: 'gold', expiry_date: '06/31', card_balance: 5000.00 }])
        
        await supabase.from('transactions').insert([{ user_id: newUser.user_id, amount: 5000.00, total_amount: 5000.00, transaction_type: 'INCOME', description: '🎉 Стартовий бонус Hephaestus Premium' }])
        alert('Акаунт успішно створено!');
        bank.setIsLoggedIn(newUser.user_id, 'CLIENT')
      }
      bank.setLoading(false)
    }
  }

  // Екстренне відновлення пароля
  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault()
    if (!authEmail.trim() || !newPassword.trim() || newPassword.length < 6) {
      return alert('Введіть коректний Email та новий пароль від 6 символів!');
    }

    bank.setLoading(true)
    try {
      const { data: user } = await supabase.from('users').select('user_id').eq('email', authEmail.trim().toLowerCase()).maybeSingle()
      if (!user) { bank.setLoading(false); return alert('Користувача з такою поштою не знайдено!'); }

      const hashedPasswordValue = await bank.hashPassword(newPassword)
      const { error } = await supabase.from('users').update({ password_hash: hashedPasswordValue, password: null }).eq('user_id', user.user_id)
      if (error) throw error

      alert('Пароль успішно оновлено! Спробуйте увійти. 🎉')
      setNewPassword('')
      bank.setAuthMode('login')
    } catch (err) {
      console.error(err)
    } finally {
      bank.setLoading(false)
    }
  }

  // Зміна пароля з налаштувань
  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (newPassword.length < 6) return alert('Пароль має бути від 6 символів!');
    const hashedNew = await bank.hashPassword(newPassword)
    await supabase.from('users').update({ password_hash: hashedNew, password: null }).eq('user_id', bank.currentUserId)
    setNewPassword(''); setIsSettingsOpen(false);
    alert('Пароль успішно змінено на новий хеш SHA-256! 🎉')
  }

  // Швидка автоматична верифікація
  const handleAutoVerification = async (e) => {
    e.preventDefault()
    setIsVerifying(true)
    setTimeout(async () => {
      await supabase.from('users').update({ verification_status: 'VERIFIED' }).eq('user_id', bank.currentUserId)
      bank.setVerificationStatus('VERIFIED')
      setPassportNumber('')
      setIsVerifying(false)
      alert('Акаунт верифіковано штучним інтелектом банку! 🛡️')
    }, 2000)
  }

  // Вивід коштів (взаємодіє з балансом першої карти)
  const handleWithdrawSubmit = async (e) => {
    e.preventDefault()
    if (bank.verificationStatus !== 'VERIFIED') return alert('Помилка! Пройдіть швидку верифікацію.');
    const amountNum = parseFloat(transferAmount)
    
    // Беремо першу доступну карту для списання
    const activeCard = bank.userCards[0];
    if (!activeCard) return alert('У вас немає активних карт!');

    if (isNaN(amountNum) || amountNum <= 0 || amountNum > Number(activeCard.card_balance)) {
      return alert('Некоректна сума або недостатньо коштів на головній карті!');
    }
    if (targetCardNumber.length < 16) return alert('Введіть повний 16-значний номер картки!');

    try {
      setIsSending(true)
      // Списуємо баланс саме з цієї карти
      await supabase.from('cards').update({ card_balance: Number(activeCard.card_balance) - amountNum }).eq('card_id', activeCard.card_id)
      
      await supabase.from('transactions').insert([{
        user_id: bank.currentUserId, amount: -amountNum, total_amount: amountNum, transaction_type: 'EXPENSE',
        description: `🏧 Вивід коштів на картку *${targetCardNumber.slice(-4)}`
      }])
      setIsWithdrawOpen(false); setTransferAmount(''); setTargetCardNumber(''); setIsSending(false);
      await bank.loadSystemData(bank.currentUserId, 'CLIENT')
      alert('Вивід коштів успішно проведено! 💸')
    } catch (err) {
      console.error(err); setIsSending(false);
    }
  }

  // Переказ за номером картки
  const handleTransferSubmit = async (e) => {
    e.preventDefault()
    if (bank.verificationStatus !== 'VERIFIED') return alert('Помилка! Ваш акаунт не верифіковано.');
    const amountNum = parseFloat(transferAmount)
    
    const activeCard = bank.userCards[0];
    if (!activeCard) return alert('У вас немає активних карт!');
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > Number(activeCard.card_balance)) return alert('Недостатньо коштів на карті!');

    try {
      setIsSending(true)
      // Списуємо з нашої карти
      await supabase.from('cards').update({ card_balance: Number(activeCard.card_balance) - amountNum }).eq('card_id', activeCard.card_id)

      const { data: recipient } = await supabase.from('users').select('user_id, full_name').neq('user_id', bank.currentUserId).eq('role', 'CLIENT').limit(1).maybeSingle()

      if (!recipient) {
        await supabase.from('transactions').insert([{ user_id: bank.currentUserId, amount: -amountNum, total_amount: amountNum, transaction_type: 'EXPENSE', description: `💸 Переказ на карту ${targetCardNumber}` }])
      } else {
        // Нараховуємо гроші на першу карту випадкового іншого клієнта
        let { data: recCards } = await supabase.from('cards').select('*').eq('user_id', recipient.user_id).limit(1).maybeSingle()
        if (recCards) {
          await supabase.from('cards').update({ card_balance: Number(recCards.card_balance || 0) + amountNum }).eq('card_id', recCards.card_id)
        }
        await supabase.from('transactions').insert([
          { user_id: bank.currentUserId, amount: -amountNum, total_amount: amountNum, transaction_type: 'EXPENSE', description: `💸 Переказ на карту ${targetCardNumber} (${recipient.full_name})` },
          { user_id: recipient.user_id, amount: amountNum, total_amount: amountNum, transaction_type: 'INCOME', description: `💰 Отримано від ${bank.userFullName}` }
        ])
      }

      setIsModalOpen(false); setIsSending(false); setTransferAmount(''); setTargetCardNumber(''); setTransferDesc('');
      await bank.loadSystemData(bank.currentUserId, 'CLIENT')
      alert('Переказ за номером картки успішно виконано! 🚀')
    } catch (err) {
      console.error(err); setIsSending(false);
    }
  }

  // Оплата послуг
  const handleServiceSubmit = async (e) => {
    e.preventDefault()
    if (bank.verificationStatus !== 'VERIFIED') return alert('Сплачувати послуги можуть лише верифіковані клієнти!')
    const amountNum = parseFloat(serviceAmount)
    const activeCard = bank.userCards[0];
    if (!activeCard || Number(activeCard.card_balance) < amountNum) return alert('Недостатньо коштів на головній карті!');

    let desc = `🛒 Оплата послуги (${activeServiceForm})`
    if (activeServiceForm === 'phone') desc = `📱 Поповнення мобільного (${serviceTarget})`
    if (activeServiceForm === 'internet') desc = `🌐 Оплата інтернету (О/Р ${serviceTarget})`
    if (activeServiceForm === 'utilities') desc = `🏠 Комунальні платежі (О/Р ${serviceTarget})`
    if (activeServiceForm === 'charity') desc = `❤️ Донат на підтримку ЗСУ`

    await supabase.from('cards').update({ card_balance: Number(activeCard.card_balance) - amountNum }).eq('card_id', activeCard.card_id)
    await supabase.from('transactions').insert([{ user_id: bank.currentUserId, amount: -amountNum, total_amount: amountNum, transaction_type: 'EXPENSE', description: desc }])
    setActiveServiceForm(null); setServiceTarget(''); setServiceAmount('');
    await bank.loadSystemData(bank.currentUserId, 'CLIENT')
    alert('Оплата пройшла успішно!')
  }

  const getDynamicCardBg = (type) => {
    const selected = type || cardTheme;
    if (selected === 'platinum') return 'linear-gradient(135deg, #4b5563 0%, #1f2937 100%)'
    if (selected === 'gold') return 'linear-gradient(135deg, #78350f 0%, #291305 100%)'
    return 'linear-gradient(135deg, #b45309 0%, #d4af37 100%)'
  }

  return (
    <div className="bank-container">
      <header className="bank-header">
        <div className="header-left">
          <span className="logo-icon">⚡</span>
          <h1 className="logo-text">Hephaestus {bank.userRole === 'EMPLOYEE' ? 'Staff' : 'Construct'}</h1>
        </div>
        {bank.isLoggedIn && <button onClick={() => bank.logoutUser()} className="logout-button">Вихід 🚪</button>}
      </header>

      {!bank.isLoggedIn ? (
        <div className="auth-card">
          {bank.authMode === 'forgot' ? (
            <>
              <h2 className="auth-title">Відновлення пароля 🔒</h2>
              <form onSubmit={handleForgotPasswordSubmit} className="bank-form">
                <div style={{textAlign: 'left'}} className="input-group"><label className="bank-label">Ваш Email</label><input type="email" placeholder="client@mail.com" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="bank-input" /></div>
                <div style={{textAlign: 'left'}} className="input-group"><label className="bank-label">Новий пароль (SHA-256)</label><input type="password" placeholder="Мінімум 6 символів..." required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bank-input" /></div>
                <button type="submit" className="submit-button">Встановити новий пароль</button>
              </form>
              <p className="switch-auth-text"><span className="switch-auth-link" onClick={() => { bank.setAuthMode('login'); setNewPassword(''); }}>Повернутися до входу</span></p>
            </>
          ) : (
            <>
              <h2 className="auth-title">{bank.authMode === 'login' ? 'Вхід у банкінг' : 'Створити акаунт'}</h2>
              <form onSubmit={handleAuthSubmit} className="bank-form">
                {bank.authMode === 'register' && (
                  <div className="input-group"><label className="bank-label">Повне ім'я</label><input type="text" placeholder="Анна Данько" required value={authName} onChange={(e) => setAuthName(e.target.value)} className="bank-input" /></div>
                )}
                <div style={{textAlign: 'left'}} className="input-group"><label className="bank-label">Електронна пошта</label><input type="email" placeholder="client@mail.com" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="bank-input" /></div>
                <div style={{textAlign: 'left'}} className="input-group"><label className="bank-label">Пароль</label><input type="password" placeholder="••••••••" required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="bank-input" /></div>
                <button type="submit" className="submit-button">{bank.loading ? 'Завантаження...' : (bank.authMode === 'login' ? 'Увійти' : 'Зареєструватися')}</button>
              </form>
              <p className="switch-auth-text">
                {bank.authMode === 'login' ? (
                  <>
                    <span>Ще немає акаунта? <span className="switch-auth-link" onClick={() => bank.setAuthMode('register')}>Зареєструватися</span></span>
                    <span style={{fontSize: '12px', marginTop: '5px'}} className="switch-auth-link" onClick={() => bank.setAuthMode('forgot')}>Забули пароль? 🔒</span>
                  </>
                ) : (
                  <span>Вже є акаунт? <span className="switch-auth-link" onClick={() => bank.setAuthMode('login')}>Увійти</span></span>
                )}
              </p>
            </>
          )}
        </div>
      ) : bank.userRole === 'EMPLOYEE' ? (
        
        /* 🏢 ПАНЕЛЬ ПРАЦІВНИКА */
        <div className="app-screen">
          <div className="welcome-section"><h2 className="page-title">Панель Працівника Банку</h2><p className="greet-label">Управління клієнтами</p></div>
          <div className="history-section">
            <h3 className="history-title">📋 Запити на верифікацію (KYC)</h3>
            <div className="transactions-list">
              {bank.allUsers.filter(u => u.role !== 'EMPLOYEE').map(u => (
                <div key={u.user_id} className="admin-user-row">
                  <div><p style={{margin: 0, fontWeight: '600'}}>{u.full_name}</p><p style={{margin: 0, fontSize: '11px', color: '#94a3b8'}}>{u.email}</p></div>
                  <div style={{textAlign: 'right'}}><span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '6px', marginRight: '8px', background: u.verification_status === 'VERIFIED' ? 'rgba(212,175,55,0.2)' : 'rgba(239,68,68,0.2)', color: u.verification_status === 'VERIFIED' ? '#d4af37' : '#ef4444'}}>{u.verification_status || 'PENDING'}</span>
                    {u.verification_status !== 'VERIFIED' && <button onClick={() => bank.handleUpdateVerification(u.user_id, 'VERIFIED')} className="admin-action-btn">Підтвердити</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        
        /* 📱 ІНТЕРФЕЙС КЛІЄНТА БАНКУ */
        <div className="app-screen">
          <div className="tab-content">
            {activeTab === 'home' && (
              <>
                <div className="welcome-section">
                  <p className="greet-label">Вітаємо знову,</p>
                  <h2 className="user-name">{bank.userFullName}</h2>
                  <div style={{marginTop: '6px'}}><span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', background: bank.verificationStatus === 'VERIFIED' ? 'rgba(212,175,55,0.2)' : 'rgba(239,68,68,0.2)', color: bank.verificationStatus === 'VERIFIED' ? '#d4af37' : '#ef4444'}}>{bank.verificationStatus === 'VERIFIED' ? '🛡️ Верифікований клієнт' : '⚠️ Акаунт не верифіковано'}</span></div>
                </div>

                {bank.verificationStatus !== 'VERIFIED' && (
                  <div className="service-form-box" style={{border: '1px dashed #ef4444', background: 'rgba(239, 68, 68, 0.02)'}}>
                    <h4 style={{margin: '0 0 8px 0', color: '#ef4444', fontSize: '14px'}}>🛡️ Миттєва верифікація акаунта</h4>
                    <form onSubmit={handleAutoVerification} style={{display: 'flex', gap: '10px'}}>
                      <input type="text" required placeholder="Серія та номер паспорта..." value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} className="bank-input" style={{flex: 1}} disabled={isVerifying} />
                      <button type="submit" className="submit-button" style={{margin: 0, padding: '0 15px'}} disabled={isVerifying}>{isVerifying ? '...' : 'ОК'}</button>
                    </form>
                  </div>
                )}

                {/* 🗺️ ОНОВЛЕНО: Тепер кожна картка виводить свій ВЛАСНИЙ унікальний баланс карти з бази даних! */}
                {(bank.userCards || []).map((card, index) => (
                  <div key={index} className="credit-card" style={{background: getDynamicCardBg(card.card_type), marginBottom: '5px', position: 'relative'}}>
                    {/* КНОПКА ЗАКРИТТЯ КАРТИ НА КОРПУСІ */}
                    <button 
                      onClick={() => bank.handleCloseCard(card.card_id, card.card_number)}
                      style={{position: 'absolute', top: '15px', right: '15px', background: 'rgba(0,0,0,0.3)', border: 'none', color: '#fca5a5', width: '24px', height: '24px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                      title="Закрити карту"
                    >
                      ✕
                    </button>
                    
                    <div className="card-top"><span style={{color: '#fff', fontWeight: 'bold', letterSpacing: '1px'}}>HEPHAESTUS {card.card_type.toUpperCase()}</span><span>Visa</span></div>
                    <div style={{width: '38px', height: '28px', background: 'linear-gradient(135deg, #f3f4f6, #9ca3af)', borderRadius: '6px', marginTop: '10px'}}></div>
                    <div className="card-middle" style={{marginTop: '10px'}}><p className="balance-label">Поточний баланс картки</p><p className="card-balance">{(Number(card.card_balance || 0)).toLocaleString('uk-UA', { minimumFractionDigits: 2 })} UAH</p></div>
                    <div className="card-bottom" style={{marginTop: '10px'}}><span>{card.card_number}</span><span>{card.expiry_date}</span></div>
                  </div>
                ))}

                <div className="theme-selector">
                  <p style={{margin: 0, fontSize: '12px', color: '#cbd5e1'}}>Дизайн нової карти:</p>
                  <div style={{display: 'flex', gap: '6px'}}>
                    <button onClick={() => setCardTheme('cyber')} className="theme-btn" style={{background: '#d4af37', color: '#111418', fontWeight: 'bold'}}>Gold</button>
                    <button onClick={() => setCardTheme('platinum')} className="theme-btn" style={{background: '#475569', color: '#fff'}}>Grey</button>
                    <button onClick={() => setCardTheme('gold')} className="theme-btn" style={{background: '#78350f', color: '#fff'}}>Bronze</button>
                  </div>
                </div>

                <button className="submit-button" onClick={() => bank.handleCreateNewCard(cardTheme)} style={{width: '100%', padding: '12px', fontSize: '13px', margin: '0 0 5px 0'}}>
                  🔨 Викувати нову картку ({cardTheme.toUpperCase()})
                </button>

                <div className="actions-grid">
                  <button className="action-button" onClick={() => setIsModalOpen(true)}><span>💸</span><span className="action-label" style={{color: '#e5c158', fontWeight: 'bold'}}>Переказати</span></button>
                  <button className="action-button" style={{borderColor: '#b45309', background: 'rgba(180, 83, 9, 0.03)'}} onClick={() => setIsWithdrawOpen(true)}><span>🏧</span><span className="action-label" style={{color: '#e5c158'}}>Вивести</span></button>
                  <button className="action-button" onClick={() => setActiveTab('services')}><span>➕</span><span className="action-label">Послуги</span></button>
                  <button className="action-button" style={{borderColor: '#d4af37'}} onClick={() => setIsSettingsOpen(true)}><span>⚙️</span><span className="action-label" style={{color: '#d4af37'}}>Налаштування</span></button>
                </div>

                <div className="history-section">
                  <h3 className="history-title">Історія операцій</h3>
                  <div className="transactions-list">
                    {bank.transactions.length === 0 ? <p className="status-message">Операцій ще немає</p> : (
                      bank.transactions.map((tx) => (
                        <div key={tx.transaction_id} className="tx-item">
                          <div className="tx-left">
                            <div className="tx-icon-wrapper" style={{background: tx.amount < 0 ? 'rgba(180,83,9,0.1)' : 'rgba(212,175,55,0.1)'}}><span>{tx.amount < 0 ? '🔨' : '🪙'}</span></div>
                            <div className="tx-info"><p className="tx-description">{tx.description}</p><p className="tx-date">{tx.created_at ? tx.created_at.split('T')[0] : 'Сьогодні'}</p></div>
                          </div>
                          <div style={{textAlign: 'right'}}><p className="tx-amount" style={{ color: tx.amount < 0 ? '#b45309' : '#d4af37' }}>{tx.amount < 0 ? '' : '+'}{tx.amount} ₴</p></div>
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
                  <div className="service-card" onClick={() => { setActiveServiceForm('phone'); setServiceTarget(''); setServiceAmount(''); }}>📱 <p className="service-name">Мобільний зв'язок</p></div>
                  <div className="service-card" onClick={() => { setActiveServiceForm('internet'); setServiceTarget(''); setServiceAmount(''); }}>🌐 <p className="service-name">Інтернет та ТБ</p></div>
                  <div className="service-card" onClick={() => { setActiveServiceForm('utilities'); setServiceTarget(''); setServiceAmount(''); }}>🏠 <p className="service-name">Комунальні послуги</p></div>
                  <div className="service-card" onClick={() => { setActiveServiceForm('charity'); setServiceTarget('ЗСУ'); setServiceAmount(''); }}>❤️ <p className="service-name">Донати на ЗСУ</p></div>
                </div>

                {activeServiceForm && (
                  <div className="service-form-box">
                    <h4 style={{margin: '0 0 15px 0', color: '#d4af37'}}>
                      {activeServiceForm === 'phone' && '📱 Поповнення мобільного'}
                      {activeServiceForm === 'internet' && '🌐 Оплата Інтернету'}
                      {activeServiceForm === 'utilities' && '🏠 Оплата Комунальних'}
                      {activeServiceForm === 'charity' && '❤️ Благодійний внесок на ЗСУ'}
                    </h4>
                    <form onSubmit={handleServiceSubmit} className="bank-form">
                      {activeServiceForm !== 'charity' && (
                        <div className="input-group"><label className="bank-label">Реквізити</label><input type="text" required placeholder="Введіть номер..." value={serviceTarget} onChange={(e) => setServiceTarget(e.target.value)} className="bank-input" /></div>
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
                  <h4 style={{margin: '0 0 15px 0', color: '#d4af37'}}>Категоріальний розподіл витрат:</h4>
                  <div style={{marginBottom: '10px'}}>🔨 Кузня та товари: **{bank.catSilpo || 0} ₴**</div>
                  <div style={{marginBottom: '10px'}}>📱 Мобільний зв'язок: **{bank.catPhone || 0} ₴**</div>
                  <div style={{marginBottom: '10px'}}>🌐 Інтернет та ТБ: **{bank.catInternet || 0} ₴**</div>
                  <div style={{marginBottom: '10px'}}>🪙 Перекази карт: **{bank.catTransfers || 0} ₴**</div>
                  <hr style={{borderColor: '#453624', margin: '15px 0'}} />
                  <p style={{margin: 0, fontSize: '13px', color: '#cbd5e1'}}>Вільний капітал системи: **{bank.savingsRate || 0}%**</p>
                </div>
              </>
            )}

            {activeTab === 'support' && (
              <>
                <div className="welcome-section"><h2 className="page-title">Служба підтримки</h2></div>
                <div className="service-form-box">
                  <form onSubmit={handleSupportSubmit} className="bank-form"><div className="input-group"><label className="bank-label">Опишіть вашу проблему оператору</label><textarea required rows="3" placeholder="Напишіть нам..." value={supportMessage} onChange={(e) => setSupportMessage(e.target.value)} className="bank-input" style={{fontFamily: 'inherit', resize: 'none'}} /></div><button type="submit" className="submit-button">Надіслати звернення</button></form>
                </div>
              </>
            )}
          </div>

          <nav className="nav-bar">
            <button className="nav-button" style={{color: activeTab === 'home' ? '#d4af37' : '#a1a1aa'}} onClick={() => setActiveTab('home')}>🏠<span className="nav-label">Головна</span></button>
            <button className="nav-button" style={{color: activeTab === 'services' ? '#d4af37' : '#a1a1aa'}} onClick={() => setActiveTab('services')}>🛒<span className="nav-label">Послуги</span></button>
            <button className="nav-button" style={{color: activeTab === 'analytics' ? '#d4af37' : '#a1a1aa'}} onClick={() => setActiveTab('analytics')}>📊<span className="nav-label">Аналітика</span></button>
            <button className="nav-button" style={{color: activeTab === 'support' ? '#d4af37' : '#a1a1aa'}} onClick={() => setActiveTab('support')}>💬<span className="nav-label">Підтримка</span></button>
          </nav>
        </div>
      )}

      {/* 💳 МОДАЛКА ПЕРЕКАЗУ */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}><h3>Переказ на картку 💳</h3><button onClick={() => setIsModalOpen(false)} style={{background: 'none', border: 'none', color: '#d4af37', fontSize: '18px', cursor: 'pointer'}}>✕</button></div>
            <form onSubmit={handleTransferSubmit} className="bank-form">
              <div className="input-group"><label className="bank-label">Номер картки отримувача</label><input type="text" maxLength="16" placeholder="4441 1144 2255 3366" required value={targetCardNumber} onChange={(e) => setTargetCardNumber(e.target.value.replace(/\D/g, ''))} className="bank-input" /></div>
              <div className="input-group"><label className="bank-label">Сума (UAH)</label><input type="number" step="0.01" required value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} className="bank-input" /></div>
              <div className="input-group"><label className="bank-label">Коментар</label><input type="text" value={transferDesc} onChange={(e) => setTransferDesc(e.target.value)} className="bank-input" /></div>
              <button type="submit" disabled={isSending} className="submit-button">{isSending ? 'Надсилання...' : 'Надіслати кошти'}</button>
            </form>
          </div>
        </div>
      )}

      {/* 🏧 МОДАЛКА ВИВЕДЕННЯ */}
      {isWithdrawOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}><h3>Вивід коштів 🏧</h3><button onClick={() => setIsWithdrawOpen(false)} style={{background: 'none', border: 'none', color: '#d4af37', fontSize: '18px', cursor: 'pointer'}}>✕</button></div>
            <form onSubmit={handleWithdrawSubmit} className="bank-form">
              <div className="input-group"><label className="bank-label">Номер вашої картки для зарахування</label><input type="text" maxLength="16" placeholder="Введіть 16 цифр вашої карти" required value={targetCardNumber} onChange={(e) => setTargetCardNumber(e.target.value.replace(/\D/g, ''))} className="bank-input" /></div>
              <div className="input-group"><label className="bank-label">Сума виводу (UAH)</label><input type="number" required placeholder="0.00" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} className="bank-input" /></div>
              <button type="submit" disabled={isSending} className="submit-button" style={{background: 'linear-gradient(135deg, #b45309, #78350f)', color: '#fff'}}>{isSending ? 'Обробка...' : 'Вивести на карту'}</button>
            </form>
          </div>
        </div>
      )}

      {/* ⚙️ МОДАЛКА НАЛАШТУВАНЬ */}
      {isSettingsOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
              <h3>Налаштування безпеки ⚙️</h3>
              <button onClick={() => setIsSettingsOpen(false)} style={{background: 'none', border: 'none', color: '#d4af37', fontSize: '18px', cursor: 'pointer'}}>✕</button>
            </div>
            <form onSubmit={handleChangePassword} className="bank-form">
              <div className="input-group">
                <label className="bank-label">Новий пароль (SHA-256)</label>
                <input type="password" required placeholder="Мінімум 6 символів..." value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bank-input" />
              </div>
              <button type="submit" className="submit-button">Оновити пароль</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App