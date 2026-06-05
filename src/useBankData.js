import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export function useBankData() {
  // Ініціалізуємо базові стани відразу зі сховища localStorage
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('bank_isLoggedIn') === 'true'
  })
  const [authMode, setAuthMode] = useState('login')
  const [currentUserId, setCurrentUserId] = useState(() => {
    const savedId = localStorage.getItem('bank_currentUserId');
    return savedId ? Number(savedId) : null
  })
  const [userRole, setUserRole] = useState(() => {
    return localStorage.getItem('bank_userRole') || 'CLIENT'
  })
  
  const [verificationStatus, setVerificationStatus] = useState('PENDING')
  const [userFullName, setUserFullName] = useState('')
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [clientTickets, setClientTickets] = useState([])

  // 🔥 МАСИВ ДЛЯ ДИНАМІЧНОГО ЗБЕРЕЖЕННЯ КАРТОК КОРИСТУВАЧА
  const [userCards, setUserCards] = useState([])

  const [allUsers, setAllUsers] = useState([])
  const [allTickets, setAllTickets] = useState([])
  const [loading, setLoading] = useState(false)

  // Категорії для аналітики
  const [catSilpo, setCatSilpo] = useState(0)
  const [catPhone, setCatPhone] = useState(0)
  const [catInternet, setCatInternet] = useState(0)
  const [catTransfers, setCatTransfers] = useState(0)
  const [savingsRate, setSavingsRate] = useState(0)

  // 🔒 Хешування пароля SHA-256
  async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Розрахунок аналітики без падінь
  function calculateAnalytics(txList) {
    const safeTx = txList || [];
    const income = safeTx.filter(t => t.amount > 0).reduce((sum, t) => sum + Number(t.amount), 0)
    const expense = safeTx.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
    
    setSavingsRate(income > 0 ? ((income - expense) / income * 100).toFixed(1) : 0)

    const getSum = (keyword) => safeTx
      .filter(t => t.amount < 0 && t.description && t.description.toLowerCase().includes(keyword.toLowerCase()))
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

    setCatSilpo(getSum('сільпо') || getSum('продукти'))
    setCatPhone(getSum('мобільн') || getSum('звʼязок'))
    setCatInternet(getSum('інтернет') || getSum('тб'))
    setCatTransfers(safeTx.filter(t => t.amount < 0 && t.description && t.description.includes('💸')).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0))
  }

  async function loadSystemData(userId, role) {
    if (!userId) return;
    setLoading(true)
    try {
      if (role === 'EMPLOYEE') {
        const { data: usersList } = await supabase.from('users').select('*')
        setAllUsers(usersList || [])
        const { data: ticketsList } = await supabase.from('support_tickets').select('*, users(full_name, email)').order('created_at', { ascending: false })
        setAllTickets(ticketsList || [])
      } else {
        const { data: userData } = await supabase.from('users').select('*').eq('user_id', userId).single()
        if (userData) {
          setUserFullName(userData.full_name)
          setVerificationStatus(userData.verification_status || 'PENDING')
        }
        let { data: accountData } = await supabase.from('accounts').select('balance').eq('user_id', userId).maybeSingle()
        setBalance(accountData ? Number(accountData.balance) : 5000.00)

        // 🗺️ ЗАВАНТАЖЕННЯ КАРТОК КОРИСТУВАЧА З ТАБЛИЦІ CARDS (ЯКЩО НЕМАЄ, СТВОРЮЄМО ДЕФОЛТНУ)
        let { data: cardsList } = await supabase.from('cards').select('*').eq('user_id', userId)
        if (!cardsList || cardsList.length === 0) {
          const defaultCard = { user_id: userId, card_number: '4441 1144 2255 3366', card_type: 'gold', expiry_date: '06/31' }
          await supabase.from('cards').insert([defaultCard])
          cardsList = [defaultCard]
        }
        setUserCards(cardsList)

        const { data: txList } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false })
        setTransactions(txList || [])
        calculateAnalytics(txList)

        const { data: tktList } = await supabase.from('support_tickets').select('*').eq('user_id', userId).order('created_at', { ascending: false })
        setClientTickets(tktList || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // 🔥 ФУНКЦІЯ АВТОМАТИЧНОГО ВИПУСКУ НОВОЇ КАРТИ В SUPABASE
  const handleCreateNewCard = async (themeName) => {
    try {
      setLoading(true)
      const num1 = '4441'
      const num2 = Math.floor(1000 + Math.random() * 9000).toString()
      const num3 = Math.floor(1000 + Math.random() * 9000).toString()
      const num4 = Math.floor(1000 + Math.random() * 9000).toString()
      const generatedNumber = `${num1} ${num2} ${num3} ${num4}`

      const newCardObj = {
        user_id: currentUserId,
        card_number: generatedNumber,
        card_type: themeName,
        expiry_date: '09/33'
      }

      const { error } = await supabase.from('cards').insert([newCardObj])
      if (error) throw error

      // Записуємо випуск карти в історію операцій
      await supabase.from('transactions').insert([{
        user_id: currentUserId,
        amount: 0,
        total_amount: 0,
        transaction_type: 'INCOME',
        description: `🏛️ Кузня Гефеста: Випущено нову карту типу ${themeName.toUpperCase()}`
      }])

      alert(`Вітаємо! Картку серії ${themeName.toUpperCase()} успішно викувано в базі даних! 🔨`)
      await loadSystemData(currentUserId, userRole)
    } catch (err) {
      console.error(err)
      alert('Помилка при створенні картки')
    } finally {
      setLoading(false)
    }
  }

  // 🔄 АВТОМАТИЧНИЙ ЗАПУСК ПРИ ОНОВЛЕННІ СТОРІНКИ (П ПЕРЕВІРКА СЕСІЇ)
  useEffect(() => {
    if (isLoggedIn && currentUserId) {
      loadSystemData(currentUserId, userRole)
    }
  }, [isLoggedIn, currentUserId, userRole])

  // Функція для запису сесії під час успішного входу
  const loginUser = (userId, role) => {
    localStorage.setItem('bank_isLoggedIn', 'true')
    localStorage.setItem('bank_currentUserId', userId.toString())
    localStorage.setItem('bank_userRole', role)
    
    setCurrentUserId(userId)
    setUserRole(role)
    setIsLoggedIn(true)
  }

  // Функція для повної очистки сесії при виході
  const logoutUser = () => {
    localStorage.removeItem('bank_isLoggedIn')
    localStorage.removeItem('bank_currentUserId')
    localStorage.removeItem('bank_userRole')
    
    setCurrentUserId(null)
    setUserRole('CLIENT')
    setIsLoggedIn(false)
    
    setUserFullName('')
    setBalance(0)
    setTransactions([])
    setUserCards([])
  }

  return {
    isLoggedIn, setIsLoggedIn: loginUser, logoutUser, authMode, setAuthMode, currentUserId, setCurrentUserId,
    userRole, setUserRole, verificationStatus, setVerificationStatus, userFullName,
    balance, setBalance, transactions, setTransactions, clientTickets, setClientTickets,
    allUsers, allTickets, loading, setLoading, hashPassword, loadSystemData,
    catSilpo, catPhone, catInternet, catTransfers, savingsRate,
    userCards, handleCreateNewCard
  }
}