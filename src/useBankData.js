import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export function useBankData() {
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
  const [userEmail, setUserEmail] = useState('')
  const [userPhone, setUserPhone] = useState('')
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [clientTickets, setClientTickets] = useState([])
  const [userCards, setUserCards] = useState([])

  const [allUsers, setAllUsers] = useState([])
  const [allTickets, setAllTickets] = useState([])
  const [loading, setLoading] = useState(false)

  const [catSilpo, setCatSilpo] = useState(0)
  const [catPhone, setCatPhone] = useState(0)
  const [catInternet, setCatInternet] = useState(0)
  const [catTransfers, setCatTransfers] = useState(0)
  const [savingsRate, setSavingsRate] = useState(0)

  async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function calculateAnalytics(txList) {
    const safeTx = txList || [];
    const income = safeTx.filter(t => t.amount > 0).reduce((sum, t) => sum + Number(t.amount), 0)
    const expense = safeTx.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
    setSavingsRate(income > 0 ? ((income - expense) / income * 100).toFixed(1) : 0)

    const getSum = (keyword) => safeTx
      .filter(t => t.amount < 0 && t.description && t.description.toLowerCase().includes(keyword.toLowerCase()))
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

    setCatSilpo(getSum('сільпо') || getSum('продукти') || getSum('кузня'))
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
          setUserEmail(userData.email)
          setUserPhone(userData.phone_number || '+380971234567')
          setVerificationStatus(userData.verification_status || 'PENDING')
        }

        let { data: cardsList } = await supabase.from('cards').select('*').eq('user_id', userId).order('card_id', { ascending: true })
        if (!cardsList || cardsList.length === 0) {
          // ТУТ ЗАЛИШЕНО ГРОШІ НА ПОЧАТКОВІЙ КАРТЦІ (5000 UAH), ЯК ТИ Й ПРОСИЛА
          const defaultCard = { user_id: userId, card_number: '4441 1144 2255 3366', card_type: 'gold', expiry_date: '06/31', card_balance: 5000.00 }
          await supabase.from('cards').insert([defaultCard])
          cardsList = [defaultCard]
        }
        setUserCards(cardsList)

        const totalCardsBalance = cardsList.reduce((sum, c) => sum + Number(c.card_balance || 0), 0)
        setBalance(totalCardsBalance)

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

  const handleCreateNewCard = async (themeName) => {
    try {
      setLoading(true)
      const num1 = '4441'
      const num2 = Math.floor(1000 + Math.random() * 9000).toString()
      const num3 = Math.floor(1000 + Math.random() * 9000).toString()
      const num4 = Math.floor(1000 + Math.random() * 9000).toString()
      const generatedNumber = `${num1} ${num2} ${num3} ${num4}`

      const userIdToSend = currentUserId ? parseInt(currentUserId, 10) : null;
      if (!userIdToSend) return;

      const newCardObj = {
        user_id: userIdToSend,
        card_number: generatedNumber,
        card_type: themeName || 'cyber',
        expiry_date: '09/33',
        card_balance: 0.00 // Наступні карти створюються порожніми
      }

      const { error } = await supabase.from('cards').insert([newCardObj])
      if (error) throw error

      await supabase.from('transactions').insert([{
        user_id: userIdToSend, amount: 0, total_amount: 0, transaction_type: 'INCOME',
        description: `🏛️ Кузня Гефеста: Викувано нову карту серії ${themeName.toUpperCase()}`
      }])

      alert(`Картку серії ${themeName.toUpperCase()} успішно активовано з балансом 0.00 UAH! 🔨`)
      await loadSystemData(currentUserId, userRole)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // 🔥 НОВА ФУНКЦІЯ: ОТРИМАННЯ КРЕДИТУ ВІД БАНКУ
  const handleTakeCredit = async (creditAmount) => {
    const amountNum = parseFloat(creditAmount)
    if (isNaN(amountNum) || amountNum <= 0) return alert('Введіть коректну суму кредиту!');

    const mainCard = userCards[0];
    if (!mainCard) return alert('Не знайдено активної картки для зарахування кредиту!');

    try {
      setLoading(true)
      // Нараховуємо гроші на першу (головну) картку
      await supabase.from('cards').update({ card_balance: Number(mainCard.card_balance) + amountNum }).eq('card_id', mainCard.card_id)
      
      // Записуємо надходження в історію транзакцій
      await supabase.from('transactions').insert([{
        user_id: currentUserId,
        amount: amountNum,
        total_amount: amountNum,
        transaction_type: 'INCOME',
        description: `🏛️ Отримано миттєвий кредит «Благословення Зевса»`
      }])

      alert(`Кредит у розмірі ${amountNum} UAH успішно зараховано на вашу головну картку! 🪙`);
      await loadSystemData(currentUserId, userRole)
    } catch (err) {
      console.error(err)
      alert('Помилка при отриманні кредиту')
    } finally {
      setLoading(false)
    }
  }

  // 🗑️ ВИДАЛЕННЯ АКАУНТУ ПОВНІСТЮ
  const handleDeleteAccount = async () => {
    if (!currentUserId) return;
    try {
      setLoading(true)
      // Видаляємо всі пов'язані дані користувача
      await supabase.from('support_tickets').delete().eq('user_id', currentUserId)
      await supabase.from('transactions').delete().eq('user_id', currentUserId)
      await supabase.from('cards').delete().eq('user_id', currentUserId)
      await supabase.from('accounts').delete().eq('user_id', currentUserId)
      await supabase.from('users').delete().eq('user_id', currentUserId)
      
      // Виходимо з системи
      logoutUser()
    } catch (err) {
      console.error('Помилка видалення акаунту:', err)
      alert('Помилка при видаленні акаунту. Спробуйте пізніше.')
    } finally {
      setLoading(false)
    }
  }

  const handleCloseCard = async (cardId, cardNumber) => {
    if (userCards.length <= 1) {
      alert('Помилка! Не можна закрити останню карту банку.');
      return;
    }
    const confirmClose = window.confirm(`Ви впевнені, що хочете закрити та анулювати карту ${cardNumber}?`);
    if (!confirmClose) return;

    try {
      setLoading(true)
      const { error } = await supabase.from('cards').delete().eq('card_id', cardId)
      if (error) throw error

      await supabase.from('transactions').insert([{
        user_id: currentUserId, amount: 0, total_amount: 0, transaction_type: 'EXPENSE',
        description: `❌ Анульовано та закрито карту рахунку ${cardNumber}`
      }])

      alert('Картку успішно видалено та назавжди закрито! 🏛️')
      await loadSystemData(currentUserId, userRole)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isLoggedIn && currentUserId) {
      loadSystemData(currentUserId, userRole)
    }
  }, [isLoggedIn, currentUserId, userRole])

  const loginUser = (userId, role) => {
    localStorage.setItem('bank_isLoggedIn', 'true')
    localStorage.setItem('bank_currentUserId', userId.toString())
    localStorage.setItem('bank_userRole', role)
    setCurrentUserId(userId)
    setUserRole(role)
    setIsLoggedIn(true)
  }

  const logoutUser = () => {
    localStorage.removeItem('bank_isLoggedIn')
    localStorage.removeItem('bank_currentUserId')
    localStorage.removeItem('bank_userRole')
    setCurrentUserId(null)
    setUserRole('CLIENT')
    setIsLoggedIn(false)
    setUserFullName('')
    setUserEmail('')
    setBalance(0)
    setTransactions([])
    setUserCards([])
  }

  return {
    isLoggedIn, setIsLoggedIn: loginUser, logoutUser, authMode, setAuthMode, currentUserId, setCurrentUserId,
    userRole, setUserRole, verificationStatus, setVerificationStatus, userFullName, userEmail, userPhone,
    balance, setBalance, transactions, setTransactions, clientTickets, setClientTickets,
    allUsers, allTickets, loading, setLoading, hashPassword, loadSystemData,
    catSilpo, catPhone, catInternet, catTransfers, savingsRate,
    userCards, handleCreateNewCard, handleCloseCard, handleTakeCredit, handleDeleteAccount
  }
}